'use strict';
/**
 * harness-store.js — Harness 运行时版本库（设计档 docs/design/AUTO-UPDATE.md §2.2.1 契约 / §2.2.4 流程；B04 DD-16）。
 * 负责：目录布局常量；活跃指针（userData/dsh-active.json）原子读写与形态校验；活跃副本解析；
 *       版本目录准备；激活后复核（存在性 / 版本读数 / 冒烟——runner 注入）；指针回滚；旧布局迁移与版本 GC。
 * 不负责：网络 / 子进程 / 超时（冒烟 runner 由 updater.js 注入）；不写日志、不读 ctx（只返回结果，由 updater.js 落行，§2.2.9）；
 *         不碰 App 更新与插件域。
 * 不变量（§2.2.4）：I-1 版本目录落盘后永不改名 / 永不移动（Windows junction 只能存绝对路径，改名即整树失效，§2.0 E1/E2）；
 *                  I-2 活跃副本的判定只有一处——指针（解析 / 日志 / 清理共用本模块同一判据）。
 * 纯 Node 模块（无 Electron 依赖）：可被 `node --test` 直接加载（DD-18）。
 */
const fs = require('node:fs');
const path = require('node:path');

const HARNESS_PKG_NAME = '@deepseek-ai/dsh';
const HARNESS_PKG_DIR = ['node_modules', '@deepseek-ai', 'dsh'];
const BIN_FILE = ['lib', 'bin.js'];
const POINTER_FILE = 'dsh-active.json';
const UPDATE_DIR = 'dsh-update';
const VERSION_NAME_RE = /^[0-9A-Za-z][0-9A-Za-z._+-]*$/; // 白名单：不含路径分隔符（防穿越）

/** 版本库布局（全部在 userData 内，NFR-2）。 */
function layout(userData) {
  const root = path.join(userData, UPDATE_DIR);
  return {
    root,
    versionsDir: path.join(root, 'versions'),
    pointerPath: path.join(userData, POINTER_FILE),
    legacyActive: path.join(userData, 'dsh'),
    legacyPrev: path.join(userData, 'dsh-prev'),
    legacyStaging: path.join(root, 'staging'),
  };
}

/** 版本名校验（白名单正则 + 禁 '..'）：仅合法版本名可用于目录名；非法 → throw。 */
function assertVersionName(version) {
  if (!isVersionName(version)) throw new Error('invalid-version-name:' + String(version));
  return version;
}

function isVersionName(v) {
  return typeof v === 'string' && VERSION_NAME_RE.test(v) && !v.includes('..');
}

/** 副本内 bin.js 路径（解析 / 冒烟 / 保护判定共用同一构造点）。 */
function binPathIn(dir) {
  return path.join(dir, ...HARNESS_PKG_DIR, ...BIN_FILE);
}

/** 路径同一性（win32 大小写不敏感）。 */
function samePath(a, b) {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/** 指针 dir 规范化：一律存 userData 相对路径的 posix 形态（userData 迁移后指针仍有效，DD-20）。 */
function normalizeRel(rel) {
  return String(rel).split(/[\\/]+/).filter(Boolean).join('/');
}

/** dir 必须是 userData 内的相对路径（禁绝对路径 / 盘符 / '..' 越出）。 */
function isSafeRelDir(dir, userData) {
  if (typeof dir !== 'string' || !dir) return false;
  if (path.isAbsolute(dir) || /^[A-Za-z]:/.test(dir)) return false;
  const base = path.resolve(userData);
  const abs = path.resolve(base, dir);
  return abs !== base && abs.startsWith(base + path.sep);
}

/** 副本的 dsh 版本读数：<dir>/node_modules/@deepseek-ai/dsh/package.json.version（与 main.js 的
 *  getCurrentDshVersion 同源——本 App 写出的版本目录自身 manifest 无 version 字段）。读不到 → null。 */
function readVersionIn(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, ...HARNESS_PKG_DIR, 'package.json'), 'utf8'));
    const v = pkg && pkg.version ? String(pkg.version) : '';
    return v || null;
  } catch { return null; }
}

/** 指针形态校验：非法（坏 JSON / 非法版本名 / dir 越出 userData / prev 形态非法）→ null。 */
function normalizePointerEntry(obj, userData) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (!isVersionName(obj.version) || !isSafeRelDir(obj.dir, userData)) return null;
  let prev = null;
  if (obj.prev !== undefined && obj.prev !== null) {
    if (typeof obj.prev !== 'object' || Array.isArray(obj.prev)) return null;
    if (!isVersionName(obj.prev.version) || !isSafeRelDir(obj.prev.dir, userData)) return null;
    prev = { version: obj.prev.version, dir: normalizeRel(obj.prev.dir) };
  }
  return {
    version: obj.version,
    dir: normalizeRel(obj.dir),
    prev,
    activatedAt: typeof obj.activatedAt === 'string' ? obj.activatedAt : '',
  };
}

/** 读活跃指针：不存在 / 不可解析 / 形态非法 → null（调用方一律按「无指针」处理，不抛异常）。 */
function readPointer(userData) {
  let raw;
  try { raw = fs.readFileSync(layout(userData).pointerPath, 'utf8'); } catch { return null; }
  let obj;
  try { obj = JSON.parse(raw); } catch { return null; }
  return normalizePointerEntry(obj, userData);
}

/** 原子写指针：写 dsh-active.json.tmp 后 renameSync 覆盖（同卷原子 replace；不留半写文件）。 */
function writePointer(userData, entry) {
  const normalized = normalizePointerEntry(entry, userData);
  if (!normalized) throw new Error('invalid-pointer-entry');
  const pointerPath = layout(userData).pointerPath;
  const tmp = pointerPath + '.tmp';
  fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2));
  fs.renameSync(tmp, pointerPath);
  return normalized;
}

/** 清指针 = 回出厂（指针即单点判据，无指针即无活跃副本）。 */
function clearPointer(userData) {
  fs.rmSync(layout(userData).pointerPath, { force: true });
}

/**
 * 活跃 bin.js 绝对路径 | null：① 指针副本（存在性校验）→ ② 旧布局 userData/dsh 可解析副本（B04 前
 * 的兼容面；无指针旧用户的兜底）→ ③ null（回退出厂副本，由 main.js 兜底）。
 */
function resolveActiveBin(userData) {
  const p = readPointer(userData);
  if (p) {
    const bin = binPathIn(path.resolve(userData, p.dir));
    if (fs.existsSync(bin)) return bin;
  }
  const legacyBin = binPathIn(layout(userData).legacyActive);
  return fs.existsSync(legacyBin) ? legacyBin : null;
}

/** 删除版本目录（best-effort）：活跃目录（I-2 判据）一律不删。 */
function removeVersionDir(userData, dir) {
  if (!dir) return false;
  const activeBin = resolveActiveBin(userData);
  if (activeBin && samePath(activeBin, binPathIn(dir))) return false;
  try { fs.rmSync(dir, { recursive: true, force: true }); return true; } catch { return false; }
}

/**
 * ① prepare：建 userData/dsh-update/versions/<version>/ + 精确版本依赖 package.json（落盘后永不改名，I-1）。
 * 先清同名目录（重试 / 半成品场景）；目标目录 == 当前活跃目录 → throw 'guard-active-dir'
 * （绝不在活跃副本原地重装；归属 = prepare 步，日志 phase=prepare ok=0 detail=guard-active-dir，§2.2.4 ①）。
 */
function prepareVersionDir(userData, version) {
  assertVersionName(version);
  const dir = path.join(layout(userData).versionsDir, version);
  const activeBin = resolveActiveBin(userData);
  if (activeBin && samePath(activeBin, binPathIn(dir))) throw new Error('guard-active-dir');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'dsh-runtime-update',
    private: true,
    dependencies: { [HARNESS_PKG_NAME]: version },
  }, null, 2));
  return dir;
}

/**
 * ⑥ 激活后复核（DD-17 / AC9-b）：ⓐ 活跃解析存在性（且必须落在本次目标版本目录）
 * ⓑ 版本读数（该副本 == version）ⓒ 冒烟（runner 注入：runVersion(bin) → { code, output }）。
 * 返回 { ok, stage:'resolve'|'version'|'smoke', detail, path }——stage = 失败面（成功时为 smoke）。
 */
async function verifyActive(userData, version, runVersion) {
  const expectedDir = path.join(layout(userData).versionsDir, version);
  const expectedBin = binPathIn(expectedDir);
  const bin = resolveActiveBin(userData);
  if (!bin || !samePath(bin, expectedBin)) {
    return { ok: false, stage: 'resolve', detail: bin ? 'active=' + bin : 'no-active-bin', path: expectedBin };
  }
  const read = readVersionIn(expectedDir);
  if (read !== version) {
    return { ok: false, stage: 'version', detail: 'read=' + (read || 'none'), path: bin };
  }
  let res;
  try {
    res = await runVersion(bin);
  } catch (err) {
    // runner 抛异常 = 冒烟无法证明副本可运行 → 与冒烟失败同面（绝不静默放行，AC9-b）
    return { ok: false, stage: 'smoke', detail: 'runner-error:' + ((err && err.message) || err), path: bin };
  }
  const out = String((res && res.output) || '');
  if (!res || res.code !== 0 || !out.includes(version)) {
    return { ok: false, stage: 'smoke', detail: `exit ${res && res.code}: ${out.slice(0, 160)}`, path: bin };
  }
  return { ok: true, stage: 'smoke', detail: bin, path: bin };
}

/**
 * ⑤⑥ 激活 = 原子写活跃指针（不移动任何目录）+ 激活后复核（失败 → 本函数内调 rollback()）。
 * 返回 { ok, mode, stage, verifyStage, detail, path, version, rollbackDetail, rolledBack }：
 *   ok:true            → mode:'activated'（stage:'smoke'）
 *   指针写入失败        → mode:null, stage:'pointer', detail:'pointer-fail:…', rolledBack:false（指针未变，不回滚）
 *   复核失败（已提交）  → mode = rollback() 的 mode（'restored'|'factory'）, stage:'verify',
 *                        detail:'verify-fail:<stage>'、rollbackDetail:'restored:<版本>|factory', rolledBack:true（+ 删该版本目录）
 */
async function activate(userData, version, runVersion) {
  assertVersionName(version);
  const dir = path.join(layout(userData).versionsDir, version);
  const relDir = normalizeRel(path.relative(userData, dir));
  const old = readPointer(userData);
  const prev = old && old.dir !== relDir ? { version: old.version, dir: old.dir } : null;
  try {
    writePointer(userData, { version, dir: relDir, prev, activatedAt: new Date().toISOString() });
  } catch (err) {
    return {
      ok: false, mode: null, stage: 'pointer', detail: 'pointer-fail:' + ((err && err.message) || err),
      path: binPathIn(dir), version, rolledBack: false,
    };
  }
  const v = await verifyActive(userData, version, runVersion);
  if (v.ok) {
    return { ok: true, mode: 'activated', stage: 'smoke', verifyStage: 'smoke', detail: v.detail, path: v.path, version, rolledBack: false };
  }
  const rb = rollback(userData);
  removeVersionDir(userData, dir); // 指针已移走 → 删本次目标版本目录（best-effort）
  // rollback detail 形态：restored:<版本> / factory；回滚自身失败时给可归因的第三形态（ok=0，§2.2.9）
  const rollbackDetail = rb.mode === 'restored' ? 'restored:' + (rb.version || '')
    : (rb.mode === 'factory' ? 'factory' : (rb.error || 'rollback-fail'));
  return {
    ok: false,
    mode: rb.mode,
    stage: 'verify',
    verifyStage: v.stage,
    detail: 'verify-fail:' + v.stage,
    path: v.path,
    version,
    rollbackDetail,
    rolledBack: true,
  };
}

/** ⑦ 回滚 = 指针回写上一版本（mode:'restored'）；无上一版本 → 清指针 = 回出厂（mode:'factory'）。不移动 / 不删除副本目录。 */
function rollback(userData) {
  const p = readPointer(userData);
  if (p && p.prev) {
    try {
      writePointer(userData, { version: p.prev.version, dir: p.prev.dir, prev: null, activatedAt: new Date().toISOString() });
      return { ok: true, mode: 'restored', version: p.prev.version };
    } catch (err) {
      return { ok: false, mode: null, error: 'rollback-fail:' + ((err && err.message) || err) };
    }
  }
  try {
    clearPointer(userData);
    return { ok: true, mode: 'factory' };
  } catch (err) {
    return { ok: false, mode: null, error: 'rollback-fail:' + ((err && err.message) || err) };
  }
}

/**
 * 启动清理 / 成功重启后的回收（§2.2.4 startupCleanup + ⑦），活跃判据 = 指针（I-2）：
 * ① 指针不可解析（坏形 / 指向已失效副本）→ 清指针（L8：不留悬空指针）；② 旧布局：可解析且无指针 → 采纳
 * （写指针 dir='dsh'，绝不改名 / 移动旧副本，DD-19）；可解析但非活跃 / 不可解析 → 回收；dsh-prev 与
 * staging 一律回收；③ 版本 GC：删 versions/* 中非活跃者。
 * 返回 { active, removed, adopted, legacy, legacyVersion }——日志行由 updater.js 落（§2.2.9）。
 */
function cleanup(userData) {
  const L = layout(userData);
  const removed = [];
  const rm = (p) => {
    // 只在真删成功时计入 removed（T-A6「计数与实删项一致」）；失败项不计（最好努力，L7）
    try { fs.rmSync(p, { recursive: true, force: true }); removed.push(p); } catch { /* best effort */ }
  };
  let legacy = 'none';
  let adopted = null;
  let legacyVersion = '-';

  let p = readPointer(userData);
  if (p && !fs.existsSync(binPathIn(path.resolve(userData, p.dir)))) { clearPointer(userData); p = null; }
  let activeDir = p ? path.resolve(userData, p.dir) : null;

  if (fs.existsSync(L.legacyActive)) {
    const parseable = fs.existsSync(binPathIn(L.legacyActive));
    const read = readVersionIn(L.legacyActive);
    if (!p && parseable && read) {
      try {
        p = writePointer(userData, { version: read, dir: 'dsh', prev: null, activatedAt: new Date().toISOString() });
        activeDir = L.legacyActive;
        legacy = 'adopted';
        adopted = read;
        legacyVersion = read;
      } catch { /* 写指针失败 → 保持既有状态，不删副本 */ }
    } else if (!(activeDir && samePath(activeDir, L.legacyActive))) {
      rm(L.legacyActive); // 不可解析 / 可解析但非活跃：同一判据回收（评审 #3）
      legacy = 'removed';
      legacyVersion = 'unknown';
    }
  }
  for (const stale of [L.legacyPrev, L.legacyStaging]) {
    if (fs.existsSync(stale)) rm(stale);
  }
  let entries = [];
  try { entries = fs.readdirSync(L.versionsDir); } catch { /* 无版本库 */ }
  for (const name of entries) {
    const dir = path.join(L.versionsDir, name);
    if (activeDir && samePath(activeDir, dir)) continue; // 现行副本保留（AC13：不误删）
    rm(dir);
  }
  // 指针 prev 若引用已被回收的目录 → 一并置 null（不留悬空 prev，§2.2.4）
  if (p && p.prev) {
    const prevAbs = path.resolve(userData, p.prev.dir);
    if (removed.some((r) => samePath(r, prevAbs))) {
      try { p = writePointer(userData, { ...p, prev: null }); } catch { /* best effort */ }
    }
  }
  return { active: p ? p.version : null, removed, adopted, legacy, legacyVersion };
}

module.exports = {
  layout,
  assertVersionName,
  binPathIn,
  readPointer,
  writePointer,
  readVersionIn,
  resolveActiveBin,
  prepareVersionDir,
  verifyActive,
  activate,
  rollback,
  cleanup,
};
