'use strict';
/**
 * run.js — lint 门入口：自证 → 六条判据 → 摘要行 → 退出码（0 绿 / 1 判据红 / 2 门禁自身无法完成）
 * （B16；设计档 docs/design/REPO-CONVENTIONS.md §A.2.2.1）。
 * 摘要行（机器可 grep）：`GATE lint PASS checks=6 selftest=14/14` / 六条各一行 `CHECK <名> PASS …`。
 * 依赖方向：lib.js / checks.js / selftest.js；无 CLI 形参（`npm run lint` 直调）。
 */

const path = require('node:path');
const lib = require('./lib.js');
const checks = require('./checks.js');
const selftest = require('./selftest.js');

const ROOT = checks.REPO_ROOT;
const BASELINE_PATH = path.join(__dirname, 'baseline.json');

function main() {
  // 0) 基线档在场性（缺档/解析失败 = fail-closed 退出 2）
  const baseline = lib.loadBaseline(BASELINE_PATH);
  if (!baseline || typeof baseline !== 'object') {
    lib.say(`GATE lint FAIL reason=baseline-missing-or-unparseable path=${path.relative(ROOT, BASELINE_PATH)}`);
    process.exit(2);
  }

  // 1) 自证（TC-B16-01…14；每次 lint 跑——DD-A6）
  const self = selftest.runSelftest();
  if (self.failures.length > 0) {
    lib.say(`GATE lint FAIL reason=selftest-failed pass=${self.passed}/14`);
    for (const f of self.failures) lib.say(`SELFTEST-FAIL ${f}`);
    process.exit(2);
  }

  // 2) 扫描面
  const files = lib.listFiles(ROOT);

  // 3) 六条判据（A·B·C·D①·D②·D③）
  let red = false;

  // A 语法
  const syntax = checks.checkSyntax(files, ROOT);
  if (syntax.failures.length > 0) {
    red = true;
    lib.say(`CHECK syntax FAIL count=${syntax.failures.length}`);
    for (const f of syntax.failures) lib.say(`VIOLATION syntax ${f.file} :: ${(f.message || '').split('\n')[0]}`);
  } else {
    const jsCount = files.filter((f) => /\.(js|mjs)$/.test(f)).length;
    lib.say(`CHECK syntax PASS files=${jsCount}`);
  }

  // B 行宽（基线判定）
  const width = checks.checkWidth(files, ROOT);
  const widthCmp = checks.compareBaseline(width.violations, baseline.width);
  if (widthCmp.length > 0) {
    red = true;
    lib.say(`CHECK width FAIL files=${width.files} lines=${width.total} violations=${widthCmp.length}`);
    for (const c of widthCmp) lib.say(`VIOLATION width ${c.kind} ${c.file} :: current=${c.current} frozen=${c.frozen}`);
  } else {
    lib.say(`CHECK width PASS frozen=${Object.keys(baseline.width || {}).length} lines=${width.total}`);
  }

  // C 行数（≥480 只出提示行，不拦；>500 红）
  const linesRes = checks.checkLines(files, ROOT);
  if (linesRes.violations.length > 0) {
    red = true;
    lib.say(`CHECK lines FAIL count=${linesRes.violations.length}`);
    for (const v of linesRes.violations) lib.say(`VIOLATION lines ${v.file} :: lines=${v.lines} limit=500`);
  } else {
    lib.say(`CHECK lines PASS${linesRes.near.length > 0 ? ` near=${linesRes.near.length}` : ''}`);
    for (const n of linesRes.near) lib.say(`NOTE lines ${n.file} :: lines=${n.lines} near-line（≥480，贴线档下次改动前须先给拆分计划）`);
  }

  // D① 依赖无环（基线不设条目：0 环恒判）
  const dag = checks.checkDag(files, ROOT);
  if (dag.cycles.length > 0) {
    red = true;
    lib.say(`CHECK dag FAIL cycles=${dag.cycles.length}`);
    for (const c of dag.cycles) lib.say(`VIOLATION dag cycle=${c.join(' -> ')}`);
  } else {
    lib.say(`CHECK dag PASS (cycles=0)`);
  }

  // D② 域模块 fan-out（基线判定）
  const fanout = checks.checkFanout(files, ROOT);
  const fanoutCmp = checks.compareBaseline(fanout.violations, baseline.fanout);
  if (fanoutCmp.length > 0) {
    red = true;
    lib.say(`CHECK fanout FAIL violations=${fanoutCmp.length}`);
    for (const c of fanoutCmp) lib.say(`VIOLATION fanout ${c.kind} ${c.file} :: current=${c.current} frozen=${c.frozen} limit=3`);
  } else {
    lib.say(`CHECK fanout PASS frozen=${Object.keys(baseline.fanout || {}).length}`);
  }

  // D③ 组装面接线点唯一
  const assembly = checks.checkAssembly(files, ROOT, baseline);
  if (assembly.violations.length > 0) {
    red = true;
    lib.say(`CHECK assembly FAIL violations=${assembly.violations.length}`);
    for (const v of assembly.violations) lib.say(`VIOLATION assembly ${v.kind} :: ${v.message}`);
  } else {
    // 摘要串与设计档 A.3.1 AC-B16-8 钉死的机器 grep 串同形：(N/N) = N 条 init 绑定恰一处；免检另计一行
    // N 动态取真实值（免检归零后串随实况，防陈旧）——当前实测 N = 13（15 绑定 − 2 免检）
    lib.say(`CHECK assembly PASS (${assembly.ok}/${assembly.ok})`);
    lib.say(`CHECK assembly exempt=${assembly.exemptChecked} (面内无 init 导出的免检档，理由在 baseline.json)`);
  }

  // 4) 摘要行 + 退出码
  const checkCount = 6;
  if (red) {
    lib.say(`GATE lint FAIL checks=${checkCount} selftest=${self.passed}/14`);
    process.exit(1);
  }
  lib.say(`GATE lint PASS checks=${checkCount} selftest=${self.passed}/14`);
  process.exit(0);
}

try {
  main();
} catch (err) {
  // fail-closed：门禁自身异常一律退出 2，绝不静默通过
  lib.say(`GATE lint FAIL reason=gate-crashed detail=${(err && err.message) || err}`);
  process.exit(2);
}
