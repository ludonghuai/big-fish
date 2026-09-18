'use strict';
/**
 * lib.js — 门禁公共库：扫描面发现（跳过清单唯一权威处）+ 判据工具 + 基线载入 + 摘要输出
 * （B16；设计档 docs/design/REPO-CONVENTIONS.md §A.2.2.2 / §A.2.2.6）。
 * 跳过清单 = 与根 .gitignore 同源的非仓库内容；清单唯一权威处 = 本档（改清单只改这里）。
 * 依赖方向：零依赖（node 内建）；被 checks.js / selftest.js / run.js 复用。
 */

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// 扫描面（A.2.2.2：仓库根起 fs 递归 − 非仓库内容；git ls-files 口径会放过未 add 的新档）
// ---------------------------------------------------------------------------

/** 目录名整名跳过（.gitignore 同源 + 框架目录）。 */
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'electron-dist', 'node-runtime', 'samples',
  '测试-更新功能', '.git', '.thincoder', '.npm-cache', '.electron-cache',
  '.electron-builder-cache',
]);

/** 目录名前缀跳过（gitignore 的 `.dsh-home*` / `.test-userdata*` 通配面 + `.test-dsh-home`）。 */
const SKIP_DIR_PREFIXES = ['.dsh-home', '.test-userdata', '.test-dsh-home'];

/** 文件名整名跳过（gitignore 的下三行：开发期下载器）。 */
const SKIP_FILES = new Set(['probe-electron.js', 'download-electron.js', 'download-node.js']);

/** 判据 root 是否被跳过（自证夹具根在 os.tmpdir() ⇒ 永不在扫描面内）。 */
function isSkippedDirName(name) {
  return SKIP_DIRS.has(name) || SKIP_DIR_PREFIXES.some((p) => name.startsWith(p));
}

/**
 * 递归收集扫描面档（相对路径、POSIX 分隔、已排序）。
 * @param {string} root 扫描根（缺省 = 仓库根；自证夹具注入临时根）
 * @returns {string[]}
 */
function listFiles(root) {
  const out = [];
  walk(root, root, out);
  out.sort();
  return out;
}

function walk(abs, root, out) {
  let entries;
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(abs, e.name);
    if (e.isDirectory()) {
      if (isSkippedDirName(e.name)) continue;
      walk(full, root, out);
    } else if (e.isFile()) {
      if (e.name.endsWith('.log')) continue; // gitignore *.log
      if (SKIP_FILES.has(e.name)) continue;
      out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
}

/** 读档文本；非文本（含 NUL）→ null（判据 A/B/C 按跳过处理）。 */
function readText(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes('\0')) return null;
    return text;
  } catch { return null; }
}

/** 去行尾 CR 后的行集合（B 判据口径 = 不含行尾 CR 的字符数）。 */
function toLines(text) {
  return text.split('\n').map((l) => l.replace(/\r$/, ''));
}

// ---------------------------------------------------------------------------
// 豁免面（判据 B）：台账/地图/归档档的表格行 + 批次档 §3 段
// ---------------------------------------------------------------------------

/** 台账 / 地图 / 归档档（表格行豁免；计数不含归档档——主 agent 裁决 D1）。 */
const LEDGER_FILES = new Set(['docs/TODO.md', 'docs/README.md', 'docs/TODO-archive.md']);

/** 行是否为表格行（trim 后首字符 |）。 */
function isTableLine(line) {
  return line.trim().startsWith('|');
}

/** 批次档 §3 段行区间（`^## §3 ` 起至下一 `^## ` 标题止；无 §3 → null）。 */
function section3Range(lines) {
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1) {
      if (/^## §3 /.test(lines[i])) start = i;
    } else if (/^## /.test(lines[i]) && !/^## §3 /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return start === -1 ? null : [start, end];
}

/** 判据 B：行 i 是否豁免（台账/地图/归档表格行或批次档 §3 段）。 */
function isWidthExempt(file, lines, i) {
  if (LEDGER_FILES.has(file) && isTableLine(lines[i])) return true;
  if (/^docs\/batches\//.test(file)) {
    const range = section3Range(lines);
    return !!(range && i >= range[0] && i < range[1]);
  }
  return false;
}

// ---------------------------------------------------------------------------
// require 解析（判据 D①②③ 共用：只认字面量 require('.<相对>')）
// ---------------------------------------------------------------------------

/** require 字面量正则（只认 `.开头` 的相对路径；动态/裸名不进图）。 */
const REQUIRE_RE = /require\(\s*['"](\.[^'"]*)['"]\s*\)/g;

/** 把 from 档的相对 spec 解析为扫描面内档；解析不到 → null。 */
function resolveRequire(fromFile, spec, fileSet) {
  const dir = path.posix.dirname(fromFile);
  const joined = path.posix.normalize(path.posix.join(dir, spec));
  const candidates = [joined, `${joined}.js`, `${joined}.mjs`, `${joined}/index.js`];
  return candidates.find((c) => fileSet.has(c)) || null;
}

/** 逐档出度集合（require 到的扫描面内档集合；扫描面外的相对 require 不计边）。 */
function requireTargets(file, text, fileSet) {
  const targets = new Set();
  let m;
  REQUIRE_RE.lastIndex = 0;
  while ((m = REQUIRE_RE.exec(text)) !== null) {
    const r = resolveRequire(file, m[1], fileSet);
    if (r) targets.add(r);
  }
  return targets;
}

// ---------------------------------------------------------------------------
// 基线（A.2.2.6：手写冻结档；门禁永不自动写入——自写基线的门禁 = 自证空洞）
// ---------------------------------------------------------------------------

/** 载入基线档（缺档/解析失败 → null；调用方按 fail-closed 判 2）。 */
function loadBaseline(baselinePath) {
  try {
    return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// 输出（A.2.2.1：机器可 grep 的摘要行；退出码 0/1/2）
// ---------------------------------------------------------------------------

/** 打一行机器摘要（stdout；判据红详单随后逐行列出）。 */
function say(line) {
  process.stdout.write(line + '\n');
}

module.exports = {
  SKIP_DIRS,
  SKIP_DIR_PREFIXES,
  SKIP_FILES,
  isSkippedDirName,
  listFiles,
  readText,
  toLines,
  LEDGER_FILES,
  isTableLine,
  section3Range,
  isWidthExempt,
  REQUIRE_RE,
  resolveRequire,
  requireTargets,
  loadBaseline,
  say,
};
