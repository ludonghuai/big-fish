'use strict';
/**
 * checks.js — 六条判据实现（A 语法 · B 行宽 · C 行数 · D① 依赖无环 · D② 域模块 fan-out · D③ 接线点唯一）
 * （B16；设计档 docs/design/REPO-CONVENTIONS.md §A.2.2.2）。
 * 判据句权威 = docs/CONVENTIONS.md §四（D①②③）/ §五（B / C）；本档只承载机检口径与实现。
 * 参数化 root / baseline（A.2.2.2 自证夹具隔离面）：缺省 = 仓库根 + scripts/gates/baseline.json。
 * 依赖方向：只依赖 lib.js；被 run.js（真实面）与 selftest.js（夹具面）复用。
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// 判据 A：语法（扫描面内每个 .js / .mjs 经 node --check 退出 0；无豁免）
// ---------------------------------------------------------------------------

/**
 * @param {string[]} files 扫描面档（相对路径）
 * @returns {{failures: Array<{file: string, message: string}>}}
 */
function checkSyntax(files, root) {
  const failures = [];
  for (const file of files) {
    if (!/\.(js|mjs)$/.test(file)) continue;
    try {
      execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
    } catch (err) {
      failures.push({ file, message: String(err.stderr || err.message || err) });
    }
  }
  return { failures };
}

// ---------------------------------------------------------------------------
// 判据 B：行宽（≤300 字符，不含行尾 CR；豁免面 = 台账/地图/归档表格行 + 批次档 §3 段）
// 基线：非豁免超宽行按档计数的冻结值（四条判定：新增即拦 / 陈腐即红 / 只减不增 / 到期逐条写死）
// ---------------------------------------------------------------------------

/** @returns {{violations: Object<string, number>, total: number, files: number}} */
function checkWidth(files, root) {
  const violations = {};
  let total = 0;
  for (const file of files) {
    const text = lib.readText(path.join(root, file));
    if (text === null) continue;
    const lines = lib.toLines(text);
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 300 && !lib.isWidthExempt(file, lines, i)) count++;
    }
    if (count > 0) { violations[file] = count; total += count; }
  }
  return { violations, total, files: Object.keys(violations).length };
}

// ---------------------------------------------------------------------------
// 判据 C：行数（\n 计数，末行有换行不额外计；.js/.mjs 单档 ≤500；≥480 出提示行不拦）
// ---------------------------------------------------------------------------

/** @returns {{violations: Array<{file, lines}>, near: Array<{file, lines}>}} */
function checkLines(files, root) {
  const violations = [];
  const near = [];
  for (const file of files) {
    if (!/\.(js|mjs)$/.test(file)) continue;
    const text = lib.readText(path.join(root, file));
    if (text === null) continue;
    const lines = text.split('\n').length - 1;
    if (lines > 500) violations.push({ file, lines });
    else if (lines >= 480) near.push({ file, lines });
  }
  violations.sort((a, b) => b.lines - a.lines);
  near.sort((a, b) => b.lines - a.lines);
  return { violations, near };
}

// ---------------------------------------------------------------------------
// 判据 D①：依赖无环（只认字面量 require('.<相对>')；边 = 解析到扫描面内档；DFS 着色求环）
// ---------------------------------------------------------------------------

/** @returns {{cycles: Array<string[]>, edges: Object<string, string[]>}} */
function checkDag(files, root) {
  const fileSet = new Set(files);
  const edges = {};
  for (const file of files) {
    if (!/\.(js|mjs)$/.test(file)) continue;
    const text = lib.readText(path.join(root, file));
    if (text === null) continue;
    edges[file] = [...lib.requireTargets(file, text, fileSet)];
  }
  // DFS 三色（0=未访 / 1=在栈 / 2=已完成）；环 = 从某在栈点回到自身
  // 注：color 初值 undefined；显式判 1（在栈）/ 2（已完成），其余（含 0/undefined）= 未访。
  const color = {};
  const stack = [];
  const cycles = [];
  const visit = (node) => {
    color[node] = 1;
    stack.push(node);
    for (const next of edges[node] || []) {
      if (color[next] === 1) {
        const idx = stack.indexOf(next);
        if (idx !== -1) cycles.push([...stack.slice(idx), next]);
      } else if (color[next] === 2) {
        // 已完成：无环可形成（否则上一次访问已报）
      } else {
        visit(next);
      }
    }
    stack.pop();
    color[node] = 2;
  };
  for (const file of Object.keys(edges)) {
    if (color[file] !== 1 && color[file] !== 2) visit(file);
  }
  return { cycles, edges };
}

// ---------------------------------------------------------------------------
// 判据 D②：域模块 fan-out（静态相对 require 出度 ≤3；组合根 main.js 免判）
// 域模块 = 扫描面内 .js/.mjs 去掉 tests/ · scripts/ · probe-*；基线 = 超限档冻结值
// ---------------------------------------------------------------------------

/** @returns {{violations: Object<string, number>, degrees: Object<string, number>}} */
function checkFanout(files, root) {
  const fileSet = new Set(files);
  const domain = files.filter((f) =>
    /\.(js|mjs)$/.test(f)
    && !f.startsWith('tests/')
    && !f.startsWith('scripts/')
    && !path.posix.basename(f).startsWith('probe-'));
  const degrees = {};
  for (const file of domain) {
    const text = lib.readText(path.join(root, file));
    if (text === null) continue;
    degrees[file] = lib.requireTargets(file, text, fileSet).size;
  }
  const violations = {};
  for (const [file, deg] of Object.entries(degrees)) {
    if (file === 'main.js') continue; // 组合根免判（装配面天然高扇出）
    if (deg > 3) violations[file] = deg;
  }
  return { violations, degrees };
}

// ---------------------------------------------------------------------------
// 判据 D③：接线点唯一（覆盖面 = 组合根绑定面；main.js 每个绑定恰一处 <名>.init( 调用）
// 面内不导出 init 的档列入免检清单（含理由）；未解析的 require 形态 = 红（fail-closed）
// ---------------------------------------------------------------------------

/** 绑定正则：const <名> = require('<相对>')（行首；D③ 只对组合根 main.js 适用）。 */
const BIND_RE = /^const\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"](\.[^'"]*)['"]\s*\)/;

/** @returns {{violations: Array<{kind, file?, name?, message}>, bindings: Array, ok: number, exemptChecked: number}} */
function checkAssembly(files, root, baseline) {
  const fileSet = new Set(files);
  const mainText = lib.readText(path.join(root, 'main.js'));
  const violations = [];
  if (mainText === null) {
    return { violations: [{ kind: 'missing-main', message: 'main.js 不可读' }], bindings: [], ok: 0, exemptChecked: 0 };
  }
  const lines = lib.toLines(mainText);
  const bindings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(BIND_RE);
    if (m) bindings.push({ name: m[1], target: m[2], line: i + 1 });
  }
  // 解构绑定形态（const { init } = require('./x.js')）= fail-closed 红（D③ 只认 const <名> = require 形态；
  // 解构后裸 init() 无法与绑定名关联 ⇒ 判为未解析形态，不静默放行；只判**相对路径**的解构 require）
  for (const line of lines) {
    if (/^const\s+\{[^}]+\}\s*=\s*require\(\s*['"]\./.test(line)) {
      violations.push({ kind: 'destructured', message: `main.js: 解构绑定形态 = fail-closed（D③ 只认 const <名> = require 形态）：${line.trim()}` });
    }
  }
  // 未解析的绑定 = 红（fail-closed：绑定面必须全部解析到扫描面内档）
  for (const b of bindings) {
    if (!lib.resolveRequire('main.js', b.target, fileSet)) {
      violations.push({ kind: 'unresolved', name: b.name, target: b.target, message: `main.js: 绑定 ${b.name} = require('${b.target}') 未解析到扫描面内档（fail-closed）` });
    }
  }
  const exempt = new Set((baseline && Array.isArray(baseline.assemblyExempt) ? baseline.assemblyExempt : []).map((e) => e.file));
  let ok = 0;
  let exemptChecked = 0;
  /** 某绑定名的 init( 调用次数（按出现次数计：同行多次也计——逐行 g 全局匹配）。 */
  const countInitCalls = (name) => {
    let calls = 0;
    for (const line of lines) {
      const re = new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\.init\\s*\\(', 'g');
      calls += (line.match(re) || []).length;
    }
    return calls;
  };
  for (const b of bindings) {
    const resolved = lib.resolveRequire('main.js', b.target, fileSet);
    if (!resolved) continue; // 已判红
    const calls = countInitCalls(b.name);
    if (calls === 1) { ok++; continue; }
    if (exempt.has(resolved) && calls === 0) { exemptChecked++; continue; } // 免检面：无 init 导出 ⇒ calls = 0 合规
    violations.push({
      kind: calls === 0 ? 'missing' : 'multiple',
      name: b.name,
      file: resolved,
      message: `main.js: 绑定 ${b.name}（${resolved}）的 init( 调用 = ${calls}（判据 = 恰 1；免检面 = 恰 0）`,
    });
  }
  // 基线陈腐（A.2.2.6 判定规则 2：免检档已获 init / 已不在绑定面 ⇒ 红，要求缩减条目——防免检清单变永久豁免）
  const bindingTargetOf = (file) => {
    for (const b of bindings) {
      if (lib.resolveRequire('main.js', b.target, fileSet) === file) return b;
    }
    return null;
  };
  for (const entry of (baseline && Array.isArray(baseline.assemblyExempt) ? baseline.assemblyExempt : [])) {
    const bind = bindingTargetOf(entry.file);
    if (!bind) {
      violations.push({ kind: 'stale-exempt', message: `main.js: 免检条目 ${entry.file} 已不在绑定面（陈旧 ⇒ 须缩减基线条目）` });
      continue;
    }
    if (countInitCalls(bind.name) > 0) {
      violations.push({ kind: 'stale-exempt', message: `main.js: 免检条目 ${entry.file} 已获 init 调用（免检前提不成立 ⇒ 须缩减基线条目）` });
    }
  }
  return { violations, bindings, ok, exemptChecked };
}

// ---------------------------------------------------------------------------
// 基线判定（A.2.2.6 四条：新增即拦 / 陈腐即红 / 只减不增 / 到期条件逐条写死）
// ---------------------------------------------------------------------------

/**
 * 基线核对：现状 vs 冻结值。
 * @param {Object<string, number>} current 现状违规表（file → 数值）
 * @param {Object<string, number>|undefined} frozen 冻结表
 * @returns {Array<{kind, file, current, frozen}>}
 */
function compareBaseline(current, frozen) {
  const out = [];
  const f = frozen || {};
  for (const [file, value] of Object.entries(current)) {
    if (!(file in f)) out.push({ kind: 'new', file, current: value, frozen: undefined });
    else if (value > f[file]) out.push({ kind: 'increased', file, current: value, frozen: f[file] });
  }
  for (const file of Object.keys(f)) {
    if (!(file in current)) out.push({ kind: 'stale', file, current: 0, frozen: f[file] });
  }
  return out;
}

module.exports = {
  REPO_ROOT,
  checkSyntax,
  checkWidth,
  checkLines,
  checkDag,
  checkFanout,
  checkAssembly,
  compareBaseline,
};
