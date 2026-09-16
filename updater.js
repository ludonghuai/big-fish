'use strict';
/**
 * updater.js — App/Harness 更新域（设计档 docs/design/AUTO-UPDATE.md §2.2.1）。
 * 负责：App 检查/下载/校验/安装器拉起；Harness 检查/安装/激活/回滚/回收编排；取消中止；
 *       updater.log 的 update/harness 域阶段行（§2.2.9）。
 * 不负责：对话框/托盘/更新窗口（回调上报，归 main.js）；插件更新；后端停/启
 *       （Harness 停-切-启由 main.js 编排——installHarness 在冒烟通过后回调
 *        { phase:'stop-backend' } 并等待其完成，main.js 在该回调里停后端）；
 *       版本库布局与链接细节（B04 起归 harness-store.js，DD-18——本文件不直接读写
 *        dsh-active.json，I-2）。
 * 取消实现（评审 #3）：AbortController 按操作内部持有——每轮下载/安装各建一个
 *       signal，不跨操作复用；取消与失败同面：清临时文件、释放并发守卫、回到可重试态。
 *       Harness 取消的边界 = 提交点（活跃指针写入，§2.2.4 ⑤）：其后取消不生效。
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { shell } = require('electron');
const { compareVersions, parseRegistryMetadata, decideUpdate } = require('./update-lib.js');
const store = require('./harness-store.js');

const HTTP_TIMEOUT_MS = 10 * 1000;             // 检查/下载 10s 无数据中止（C4 / NFR-1）
const HARNESS_INSTALL_TIMEOUT_MS = 15 * 60 * 1000; // 依赖安装超时（先例 installPlugin）
const NPMIRROR_REGISTRY = 'https://registry.npmmirror.com/';
const NPMJS_REGISTRY = 'https://registry.npmjs.org/';

/** init(ctx) 注入的运行环境（main.js 是唯一调用方）。 */
let ctx = null;

// 并发守卫（§2.2.7）：模块级 checkInFlight / downloadInFlight / harnessInFlight。
let checkInFlight = false;
let downloadInFlight = false;
let harnessInstallInFlight = false;
let appDownloadAbort = null;   // 在途 App 下载的 AbortController（每轮下载新建）
let harnessAbort = null;       // 在途 Harness 安装的 AbortController
let harnessChild = null;       // 在途 pnpm/冒烟子进程（取消时 kill）
let harnessTargetVersion = null; // 在途安装的目标版本（提交点判据：活跃指针是否已指向它）

function init(c) {
  ctx = { ...(c || {}) };
}

/** 并发守卫状态（main.js 门禁用）。 */
function busyState() {
  return { check: checkInFlight, download: downloadInFlight, harness: harnessInstallInFlight };
}

function log(text) {
  if (ctx && typeof ctx.log === 'function') ctx.log(text);
}

/** fetch + 整体 10s 无数据中止（清单 / 注册表元数据等小响应；下载流用各自 stall 定时器）。 */
function fetchWithTimeout(url, timeoutMs = HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** 流式读文件算 sha256（NFR-2 fail-closed 的校验面）。 */
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (c) => hash.update(c));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// ---------------------------------------------------------------------------
// App 更新：检查 / 下载+校验 / 安装器拉起 / 取消
// ---------------------------------------------------------------------------

/** 检查 App 更新（设计档 §2.2.3）：拉清单 → 版本比较 → update-available/up-to-date/error。 */
async function checkAppUpdate({ reason }) {
  if (checkInFlight || downloadInFlight || harnessInstallInFlight) return { status: 'in-flight' };
  checkInFlight = true;
  const current = ctx.getCurrentVersion();
  try {
    const res = await fetchWithTimeout(ctx.manifestUrl);
    if (!res.ok) throw new Error('manifest http ' + res.status);
    const j = await res.json();
    const latest = String((j && j.version) || '');
    if (!latest) throw new Error('manifest missing version');
    const decision = decideUpdate(latest, current);
    log(`update check reason=${reason} type=app result=${decision.update ? 'update-available' : 'up-to-date'} latest=${latest} current=${current}`);
    if (!decision.update) return { status: 'up-to-date', latest, current };
    return {
      status: 'update-available',
      info: {
        version: latest,
        note: (j.note || ''),
        url: (j.urls && j.urls[process.platform]) || '',
        sha256: (j.sha256 && j.sha256[process.platform]) || '',
      },
    };
  } catch (err) {
    log(`update check reason=${reason} type=app result=error latest=n/a current=${current}`);
    return { status: 'error', error: (err && err.message) || String(err) };
  } finally {
    checkInFlight = false;
  }
}

/**
 * 下载安装包 + sha256 校验一体（设计档 §2.2.3 downloadApp）：
 * 流式写 userData/updates/*.part（每 chunk 重置 10s stall 定时器）→ 改名 → 流式校验。
 * onProgress：{ percent, bytes, total }（下载）；{ phase:'verify' }（开始校验）。
 * sha256 缺失或不匹配 → 拒装、清临时文件、明确报错可重试（fail-closed，NFR-2）。
 */
async function downloadApp(info, onProgress) {
  if (downloadInFlight) return { ok: false, error: 'in-flight' };
  if (!info || !info.url) return { ok: false, error: '该平台暂无安装包' };
  downloadInFlight = true;
  appDownloadAbort = new AbortController();
  const fileBase = path.basename(String(info.url).split('?')[0].split('#')[0]) || `Bigfish-Setup-${info.version}.exe`;
  const dir = path.join(ctx.dirs.userData, 'updates');
  const partPath = path.join(dir, fileBase + '.part');
  const finalPath = path.join(dir, fileBase);
  let bytes = 0;
  let total = 0;
  let lastPercent = -1;
  let stallTimer = null;
  const resetStall = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => appDownloadAbort.abort(), HTTP_TIMEOUT_MS);
  };
  const cleanupPart = () => {
    clearTimeout(stallTimer);
    try { fs.rmSync(partPath, { force: true }); } catch { /* ignore */ }
  };
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(finalPath)) fs.rmSync(finalPath, { force: true });
    const res = await fetch(info.url, { signal: appDownloadAbort.signal });
    if (!res.ok || !res.body) throw new Error('download http ' + (res.status || 'no-body'));
    total = Number(res.headers.get('content-length')) || 0;
    log(`update download type=app start url=${info.url} size=${total}`);
    const out = fs.createWriteStream(partPath);
    resetStall();
    try {
      for await (const chunk of res.body) {
        bytes += chunk.length;
        out.write(chunk);
        resetStall();
        const percent = total > 0 ? Math.min(99, Math.floor(bytes * 100 / total)) : -1;
        if (percent >= 0 && percent !== lastPercent) {
          lastPercent = percent;
          log(`update download type=app percent=${percent}`);
          if (typeof onProgress === 'function') onProgress({ percent, bytes, total });
        }
      }
    } finally {
      await new Promise((resolve) => out.end(() => resolve()));
    }
    clearTimeout(stallTimer);
    if (bytes === 0) throw new Error('下载内容为空');
    fs.renameSync(partPath, finalPath);
    log(`update download type=app done file=${finalPath} bytes=${bytes}`);
    if (typeof onProgress === 'function') onProgress({ phase: 'verify' });
    const expected = String((info.sha256 || '')).toLowerCase();
    const actual = await sha256File(finalPath);
    if (!expected || actual !== expected) {
      log(`update verify fail type=app expected=${expected || 'n/a'} actual=${actual}`);
      try { fs.rmSync(finalPath, { force: true }); } catch { /* ignore */ }
      return {
        ok: false,
        error: expected
          ? `sha256 校验失败（期望 ${expected}，实际 ${actual}），已清理临时文件，可重试`
          : '清单缺少该平台 sha256，已拒装（fail-closed），可重试',
      };
    }
    log(`update verify ok type=app expected=${expected} actual=${actual}`);
    return { ok: true, file: finalPath };
  } catch (err) {
    cleanupPart();
    if (appDownloadAbort && appDownloadAbort.signal.aborted) {
      log('update download type=app canceled');
      return { ok: false, error: 'canceled' };
    }
    log(`update download type=app fail detail=${(err && err.message) || err}`);
    return { ok: false, error: (err && err.message) || String(err) };
  } finally {
    appDownloadAbort = null;
    downloadInFlight = false;
  }
}

/** 拉起安装器（设计档 §2.2.3 installApp）：win32 spawn detached；darwin/linux openPath。 */
function installApp(file) {
  if (!file || !fs.existsSync(file)) return { ok: false, error: '安装包不存在' };
  try {
    if (process.platform === 'win32') {
      spawn(file, [], { detached: true, stdio: 'ignore' });
      log(`update install type=app spawn=${file}`);
    } else {
      shell.openPath(file).catch((err) => log(`update install type=app open-path fail detail=${(err && err.message) || err}`));
      log(`update install type=app open-path=${file}`);
    }
    return { ok: true };
  } catch (err) {
    log(`update install type=app fail detail=${(err && err.message) || err}`);
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

/** 中止在途 App 下载（评审 #3）：abort → downloadApp 清 .part 并回报 canceled（可重试）。 */
function cancelAppDownload() {
  if (!downloadInFlight || !appDownloadAbort) return { ok: true };
  appDownloadAbort.abort();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Harness 更新：检查 / 安装（prepare/install/smoke/activate）/ 回滚 / 清理 / 取消
// ---------------------------------------------------------------------------

async function fetchRegistryMeta(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('registry http ' + res.status);
  return await res.json();
}

/** 检查 Harness 更新（设计档 §2.2.4）：npmmirror 优先、npmjs 兜底，只追 latest dist-tag。 */
async function checkHarnessUpdate({ reason }) {
  if (checkInFlight || downloadInFlight || harnessInstallInFlight) return { status: 'in-flight' };
  checkInFlight = true;
  const current = ctx.getCurrentDshVersion();
  try {
    let meta = null;
    try {
      meta = await fetchRegistryMeta(ctx.registryUrls[0]);
    } catch (err) {
      meta = await fetchRegistryMeta(ctx.registryUrls[1]); // 源回退（TC-24）
    }
    const parsed = parseRegistryMetadata(meta);
    const decision = decideUpdate(parsed.latest, current);
    log(`update check reason=${reason} type=harness result=${decision.update ? 'update-available' : 'up-to-date'} latest=${parsed.latest} current=${current}`);
    if (!decision.update) return { status: 'up-to-date', latest: parsed.latest, current };
    return { status: 'update-available', latest: parsed.latest, current, tarball: parsed.tarball, integrity: parsed.integrity };
  } catch (err) {
    log(`update check reason=${reason} type=harness result=error latest=n/a current=${current}`);
    return { status: 'error', error: (err && err.message) || String(err) };
  } finally {
    checkInFlight = false;
  }
}

/** 运行子进程（Harness 安装/冒烟）：支持 AbortSignal 取消与整体超时。
 *  handlers 一律先挂（spawn ENOENT 等 error 事件不得无监听）。 */
function runCmd(command, args, signal, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    harnessChild = child;
    let out = '';
    let settled = false;
    let killTimer = null;
    const finish = (code, extra) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      if (signal) signal.removeEventListener('abort', cancel);
      resolve({ code, output: out + (extra ? '\n' + extra : ''), canceled: false });
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      try { child.kill('SIGKILL'); } catch { /* gone */ }
      resolve({ code: -1, output: out, canceled: true });
    };
    child.stdout.on('data', (c) => { out += String(c); });
    child.stderr.on('data', (c) => { out += String(c); });
    child.on('error', (err) => finish(-1, err && err.message));
    child.on('close', (code) => finish(code));
    if (signal) {
      if (signal.aborted) { cancel(); return; }
      signal.addEventListener('abort', cancel, { once: true });
    }
    if (timeoutMs) {
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);
    }
  });
}

/** ① prepare：版本目录落盘（userData/dsh-update/versions/<latest>/ + 精确版本依赖；此目录此后
 *  永不改名 / 永不移动，I-1；与 profile 工作区零耦合，DD-4）。重装守卫（目标目录 == 活跃目录）
 *  由 store 抛出 → detail=guard-active-dir（§2.2.4 ①）。 */
function harnessPrepare(latest) {
  return store.prepareVersionDir(ctx.dirs.userData, latest);
}

/** ② pnpm 全量安装：npmmirror 优先、npmjs 兜底重试一次（选型 F / §2.2.4）。 */
async function harnessInstallDeps(versionDir) {
  for (const registry of [NPMIRROR_REGISTRY, NPMJS_REGISTRY]) {
    const args = [
      ctx.runtime.pnpm, 'install', '--dir', versionDir,
      '--config.registry=' + registry,
      '--store-dir', path.join(ctx.dirs.dshHome, 'pnpm-store'),
    ];
    const res = await runCmd(ctx.runtime.nodeExe, args, harnessAbort ? harnessAbort.signal : null, HARNESS_INSTALL_TIMEOUT_MS);
    if (res.canceled) return { ok: false, error: 'canceled', registry };
    if (res.code === 0) return { ok: true, registry };
  }
  return { ok: false, error: 'pnpm install 失败（npmmirror 与 npmjs 均失败）', registry: '' };
}

/** ③ 冒烟（安装面）：版本目录内 bin.js --version，exit 0 且输出含 latest 才算通过（NFR-2）。
 *  与 ⑥ 的活跃面冒烟分工互补、不可互相替代（DD-17）：③ 尽早判掉坏包与依赖不齐；
 *  ⑥ 证明切换后活跃解析路径确实可运行。 */
async function harnessSmoke(latest, versionDir) {
  const bin = store.binPathIn(versionDir);
  const res = await runCmd(ctx.runtime.nodeExe, [bin, '--version'], harnessAbort ? harnessAbort.signal : null, HARNESS_INSTALL_TIMEOUT_MS);
  if (res.canceled) return { ok: false, error: 'canceled', detail: '' };
  const ok = res.code === 0 && res.output.includes(latest);
  return {
    ok,
    error: ok ? '' : '冒烟测试失败：新版本无法启动',
    detail: ok ? '' : `exit ${res.code}: ${res.output.slice(0, 160)}`,
  };
}

/** 提交点判据（§2.2.4 ⑤）：活跃指针已指向本次目标版本**且**该副本仍可解析 → 激活已提交，取消不再生效。
 *  只经 store 读指针（I-2：dsh-active.json 的读写只在 harness-store.js）。 */
function harnessCommitted() {
  if (!ctx || !harnessTargetVersion) return false;
  try {
    const p = store.readPointer(ctx.dirs.userData);
    if (!p || p.version !== harnessTargetVersion) return false;
    return fs.existsSync(store.binPathIn(path.resolve(ctx.dirs.userData, p.dir))); // 悬空指针不算提交
  } catch { return false; }
}

/**
 * Harness 安装编排（设计档 §2.2.4 ①②③⑤⑥；停-切-启由 main.js 编排——DD-15：拆阶段函数，
 * 本函数只做编排）。onPhase 回调：进度上报 + { phase:'stop-backend' } 停后端闸点
 * （main.js 在该回调停后端并 resolve，updater 等待完成后才执行激活）。
 * ⑤ 激活 = 原子写活跃指针（不移动任何目录）；⑥ 激活后复核由 store 执行，失败即回滚。
 */
async function installHarness(latest, onPhase) {
  if (harnessInstallInFlight) return { ok: false, error: 'in-flight' };
  harnessInstallInFlight = true;
  harnessAbort = new AbortController();
  const userData = ctx.dirs.userData;
  let versionDir = null;
  let backendStopped = false; // 停-切-启回调已完成 → 取消时 main.js 须重启后端（评审/审计发现）
  harnessTargetVersion = latest;
  const report = (phase, ok, detail) => {
    log(`harness install phase=${phase} ok=${ok ? 1 : 0} detail=${detail || ''}`);
    if (typeof onPhase === 'function') onPhase({ phase, ok, detail });
  };
  // ⑥ 复核冒烟 runner（注入 harness-store：本文件是全链唯一的 spawn 点）
  const runVersion = async (bin) => {
    const res = await runCmd(ctx.runtime.nodeExe, [bin, '--version'], harnessAbort ? harnessAbort.signal : null, HARNESS_INSTALL_TIMEOUT_MS);
    return { code: res.code, output: res.output };
  };
  try {
    try {
      versionDir = harnessPrepare(latest); // 守卫失败 → guard-active-dir（绝不在活跃副本原地重装）
    } catch (err) {
      const raw = (err && err.message) || String(err);
      const detail = raw.includes('guard-active-dir') ? 'guard-active-dir' : raw;
      report('prepare', false, detail);
      return { ok: false, error: detail, backendStopped: false };
    }
    report('prepare', true, latest);
    const deps = await harnessInstallDeps(versionDir);
    report('install', deps.ok, deps.ok ? 'registry=' + deps.registry : deps.error);
    if (!deps.ok) throw new Error(deps.error);
    const smoke = await harnessSmoke(latest, versionDir);
    report('smoke', smoke.ok, smoke.detail);
    if (!smoke.ok) throw new Error(smoke.error);
    // ④ 停后端（main.js 编排，先于激活；对齐 C1「停 dsh → 切 → 启 dsh」）
    if (harnessAbort && harnessAbort.signal.aborted) throw new Error('canceled');
    if (typeof onPhase === 'function') await onPhase({ phase: 'stop-backend', ok: true, detail: '' });
    backendStopped = true;
    if (harnessAbort && harnessAbort.signal.aborted) throw new Error('canceled');
    // ⑤⑥ 激活（写指针）+ 激活后复核（失败 → store 内回滚 + 删本次目标版本目录）
    const act = await store.activate(userData, latest, runVersion);
    if (act.stage !== 'pointer') {
      log(`harness activate verify ok=${act.ok ? 1 : 0} stage=${act.ok ? 'smoke' : act.verifyStage} version=${latest} path=${act.path || 'n/a'}`);
    }
    if (act.ok) {
      report('activate', true, `activated:${latest}`);
      return { ok: true, activated: true, version: latest };
    }
    report('activate', false, act.detail);
    if (act.rolledBack) {
      // rollback 行只在已提交（指针已写）的失败面出现（§2.2.4 ⑥；落笔层 = 本文件）
      log(`harness install phase=rollback ok=${act.mode ? 1 : 0} detail=${act.rollbackDetail || ''}`);
    }
    throw new Error(act.detail);
  } catch (err) {
    const msg = (err && err.message) || String(err);
    // 失败 / 取消同面：清本次目标版本目录（不动现行副本，回到可重试态）。
    // 判据 = 活跃指针（I-2 单点，经 store 读）：指针仍指向本次目标 ⇒ 它已是活跃副本，一律不删
    // （回滚写失败时也由此保住「不留悬空指针」）；激活失败面由 store 已回滚 + 删目录，此处为幂等兜底。
    if (versionDir && !harnessCommitted()) {
      try { fs.rmSync(versionDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    return { ok: false, error: msg, backendStopped };
  } finally {
    harnessAbort = null;
    harnessChild = null;
    harnessTargetVersion = null;
    harnessInstallInFlight = false;
  }
}

/** 中止在途 Harness 安装（U-13 / §2.2.4 ⑤）：提交点之前生效——abort + kill 子进程 → 清目标版本
 *  目录 → 回报 canceled（可重试）；提交点（活跃指针已写）之后**不生效**：回 { ok:true, canceled:false }，
 *  不删活跃目录、不回写指针（已提交的激活由 ⑥ 复核失败 / ⑦ 重启失败给终态）。 */
function cancelHarnessInstall() {
  if (!harnessInstallInFlight) return { ok: true, canceled: false };
  if (harnessCommitted()) return { ok: true, canceled: false };
  if (harnessAbort) harnessAbort.abort();
  if (harnessChild) { try { harnessChild.kill('SIGKILL'); } catch { /* ignore */ } }
  return { ok: true, canceled: true };
}

/** 激活后重启失败 → 回滚指针（§2.2.4 ⑦）：指针回写上一版本（restored:<版本>）/ 清指针（factory）。
 *  不移动、不删除任何副本目录。 */
function rollbackHarness() {
  let res;
  try {
    res = store.rollback(ctx.dirs.userData);
  } catch (err) {
    res = { ok: false, mode: null, error: (err && err.message) || String(err) };
  }
  const detail = res.ok ? (res.mode === 'restored' ? 'restored:' + (res.version || '') : 'factory') : (res.error || '');
  log(`harness install phase=rollback ok=${res.ok ? 1 : 0} detail=${detail}`);
  return res;
}

/** 版本库清理（旧布局迁移 + 版本 GC）的共用落笔面（§2.2.9 的 migrate / cleanup 两行）。 */
function runStoreCleanup() {
  let res;
  try {
    res = store.cleanup(ctx.dirs.userData);
  } catch (err) {
    log(`harness cleanup active=n/a removed=0 adopted=none detail=${(err && err.message) || err}`);
    return { ok: false };
  }
  log(`harness migrate legacy=${res.legacy} version=${res.legacyVersion || '-'}`);
  log(`harness cleanup active=${res.active || 'factory'} removed=${res.removed.length} adopted=${res.adopted || 'none'}`);
  return { ok: true, ...res };
}

/** 成功重启后回收非活跃版本目录与旧布局残留（原名 cleanupHarnessPrev；§2.2.4 ⑦，判据 = 活跃指针）。 */
function cleanupHarnessStale() {
  return runStoreCleanup();
}

/** 启动时清残留（§2.2.4 startupCleanup）：App 面 userData/updates/*.part + 版本库
 *  （旧布局迁移 / 回收 + 版本 GC；不误删现行副本——判据 = 活跃指针）。 */
function startupCleanup() {
  const rm = (p) => {
    try { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ }
  };
  try {
    const dir = path.join(ctx.dirs.userData, 'updates');
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.part')) rm(path.join(dir, f));
      }
    }
  } catch { /* best effort */ }
  if (!harnessInstallInFlight) runStoreCleanup(); // 安装在途 → 跳过本轮清理（§2.2.4）
  return { ok: true };
}

module.exports = {
  init,
  busyState,
  checkAppUpdate,
  downloadApp,
  installApp,
  cancelAppDownload,
  checkHarnessUpdate,
  installHarness,
  cancelHarnessInstall,
  rollbackHarness,
  cleanupHarnessStale,
  startupCleanup,
};
