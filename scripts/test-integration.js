'use strict';
/**
 * test-integration.js — 集成层运行器（B16；设计档 docs/design/REPO-CONVENTIONS.md §A.2.2.1 / §A.2.2.4）。
 * 逐场景 spawn（S1/S3 外部观测真启动、S2 electron 进程内）；支持 --only S1|S2|S3（开发期单场景回路）；
 * 摘要行 SCENARIO <名> PASS/FAIL（逐子态）+ GATE test:integration …；退出码 0/1/2。
 * 集成层不参与快/慢二分（天然全慢），由本门单独承载（A.2.2.3）。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

/** 场景表（顺序执行；S3 内含 a/b 两子态——子态行由场景档自身打印）。 */
const SCENARIOS = [
  { id: 'S1', file: 'tests/integration/s1-app-start.scenario.js', driver: 'node', timeoutMs: 240 * 1000 },
  { id: 'S2', file: 'tests/integration/s2-pet-main-path.scenario.js', driver: 'electron', timeoutMs: 90 * 1000 },
  { id: 'S3', file: 'tests/integration/s3-update-gate.scenario.js', driver: 'node', timeoutMs: 480 * 1000 },
];

/** S2 须用 electron 跑（进程内 BrowserWindow）；其余用 node 跑（场景档自己 spawn electron）。 */
function commandFor(scenario) {
  if (scenario.driver === 'electron') {
    let electronExe;
    try {
      electronExe = require(path.join(REPO_ROOT, 'node_modules', 'electron'));
    } catch (err) {
      process.stdout.write(`GATE test:integration FAIL reason=electron-not-resolvable detail=${(err && err.message) || err}\n`);
      process.exit(2); // fail-closed：门禁自身无法完成（不产出无 GATE 行的裸崩）
    }
    return { command: electronExe, args: [scenario.file] };
  }
  return { command: process.execPath, args: [scenario.file] };
}

function main() {
  const onlyIdx = process.argv.indexOf('--only');
  let list = SCENARIOS;
  if (onlyIdx !== -1 && process.argv[onlyIdx + 1]) {
    const only = String(process.argv[onlyIdx + 1]).toUpperCase();
    const found = SCENARIOS.filter((s) => s.id === only);
    if (found.length === 0) {
      process.stdout.write(`GATE test:integration FAIL reason=unknown-scenario name=${only}\n`);
      process.exit(2);
    }
    list = found;
  }

  let passCount = 0;
  let failCount = 0;
  const scenarioFailures = [];
  for (const scenario of list) {
    const { command, args } = commandFor(scenario);
    const res = spawnSync(command, args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: scenario.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env },
    });
    const out = (res.stdout || '') + (res.stderr || '');
    process.stdout.write(out);
    // 场景判据：退出码 0 = PASS（S2 的 PASS 行由场景自身打印；此处只认退出码）
    if (res.status === 0) {
      passCount++;
      // S3 的子态行已由场景档打印（SCENARIO S3a/S3b）；总行此处打。S1/S2 场景档零输出 ⇒ 行唯一
      process.stdout.write(`SCENARIO ${scenario.id} PASS\n`);
    } else {
      failCount++;
      scenarioFailures.push(scenario.id);
      const reason = res.status === null ? `timeout after ${scenario.timeoutMs}ms` : `exit=${res.status}`;
      process.stdout.write(`SCENARIO ${scenario.id} FAIL :: ${reason}\n`);
    }
  }

  if (failCount > 0) {
    process.stdout.write(`GATE test:integration FAIL scenarios=${list.length} pass=${passCount} fail=${failCount} (${scenarioFailures.join(',')})\n`);
    process.exit(1);
  }
  process.stdout.write(`GATE test:integration PASS scenarios=${list.length} pass=${passCount} fail=0\n`);
  process.exit(0);
}

main();
