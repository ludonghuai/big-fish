'use strict';
/**
 * test-run.js — 单元层运行器（B16；设计档 docs/design/REPO-CONVENTIONS.md §A.2.2.1 / §A.2.2.3）。
 * 职责：① 档发现（tests 树全部 *.test.js，集成层 .scenario.js 不误收）② 层环境变量注入（跨平台）
 * ③ TAP 逐用例时长解析（非 [slow] 用例 >500 ms = 硬红 SLOW-UNREGISTERED）④ 摘要行 + 退出码。
 * 自研依据（DD-A2）：node --test <目录> 本仓实测失败（MODULE_NOT_FOUND）；层环境变量须 JS 侧注入；
 * 逐用例时长只有解析 TAP 才拿得到。
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(REPO_ROOT, 'tests');
const SLOW_THRESHOLD_MS = 500;

/** 档发现：tests/ 递归收集 *.test.js（域划分 DD-A12：.scenario.js 属集成层，不收）。 */
function discoverTestFiles() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.test.js')) out.push(full);
    }
  };
  walk(TESTS_DIR);
  out.sort();
  return out;
}

/**
 * TAP 逐用例时长解析：`ok N - <name>` 行 + 其后 `  duration_ms: <n>` 行。
 * @returns {Array<{name: string, durationMs: number, skipped: boolean}>}
 */
function parseTapDurations(tapText) {
  const lines = tapText.split('\n');
  const out = [];
  let current = null;
  for (const raw of lines) {
    const okLine = raw.match(/^(?:not )?ok \d+ - (.*)$/);
    if (okLine) {
      current = { name: okLine[1], durationMs: 0, skipped: /# SKIP/.test(okLine[1]) };
      out.push(current);
      continue;
    }
    const durLine = raw.match(/^\s+duration_ms: ([\d.]+)/);
    if (durLine && current) {
      current.durationMs = Number(durLine[1]);
      current = null;
    }
  }
  return out;
}

function main() {
  const full = process.argv.includes('--full');
  const layer = full ? 'full' : 'fast';
  const files = discoverTestFiles();
  if (files.length === 0) {
    process.stdout.write(`GATE test${full ? ':full' : ''} FAIL reason=no-test-files\n`);
    process.exit(2);
  }

  const args = ['--test', '--test-reporter=tap', ...files.map((f) => path.relative(REPO_ROOT, f))];
  const res = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, BIGFISH_TEST_LAYER: layer },
    maxBuffer: 64 * 1024 * 1024,
  });

  const tap = res.stdout || '';
  // TAP 摘要（# pass / # fail / # skipped）
  const summary = {};
  for (const m of tap.matchAll(/^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (\d+(?:\.\d+)?)$/gm)) {
    summary[m[1]] = Number(m[2]);
  }

  // 硬红：非 [slow] 用例 >500 ms ⇒ SLOW-UNREGISTERED（层判红）
  const slowUnregistered = [];
  for (const t of parseTapDurations(tap)) {
    if (!t.skipped && !t.name.startsWith('[slow]') && t.durationMs > SLOW_THRESHOLD_MS) {
      slowUnregistered.push({ name: t.name, durationMs: t.durationMs });
    }
  }

  // 原样转发 TAP 正文（消费方：人 / CI 日志）
  process.stdout.write(tap);
  if (res.stderr) process.stderr.write(res.stderr);

  const gateName = full ? 'test:full' : 'test';
  const pass = summary.pass || 0;
  const failCount = summary.fail || 0;
  const skipped = summary.skipped || 0;

  // fail-closed：TAP 摘要解析不出用例数（报告器格式漂移 / runner 异常）⇒ 退出 2，绝不静默 PASS
  if (!Number.isFinite(summary.tests) || summary.tests <= 0 || (pass + failCount + skipped) < 1) {
    process.stdout.write(`GATE ${gateName} FAIL reason=tap-summary-unparseable pass=${pass} fail=${failCount} skipped=${skipped}
`);
    process.exit(2);
  }

  if (slowUnregistered.length > 0) {
    for (const s of slowUnregistered) {
      process.stdout.write(`SLOW-UNREGISTERED :: ${s.name} ${Math.round(s.durationMs)}ms\n`);
    }
    process.stdout.write(`GATE ${gateName} FAIL pass=${pass} fail=${failCount} skipped=${skipped} slow-unregistered=${slowUnregistered.length}\n`);
    process.exit(1);
  }
  if (failCount > 0 || res.status !== 0) {
    process.stdout.write(`GATE ${gateName} FAIL pass=${pass} fail=${failCount} skipped=${skipped} exit=${res.status}\n`);
    process.exit(1);
  }
  process.stdout.write(`GATE ${gateName} PASS pass=${pass} fail=0 skipped=${skipped} ms=${Math.round(summary.duration_ms || 0)}\n`);
  process.exit(0);
}

main();
