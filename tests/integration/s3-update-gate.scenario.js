'use strict';
/**
 * s3-update-gate.scenario.js — 场景三「更新门禁」（B16；设计档 docs/design/REPO-CONVENTIONS.md §A.2.2.4）。
 * 驱动 = 真启动（同 S1 夹具，autoCheckUpdates:true）+ 外部观测 updater.log。
 * 两子态：a = registry ?latest=0.1.5-rc.1（up-to-date）· b = registry ?latest=0.1.9（update-available；放行 = 只提示不自动装）。
 * 断言面 = 行为面（updater.log 行 / 无 error / 无自动安装）。上限 200 s / 子态。
 * 退出码：0 = PASS；1 = FAIL（摘要行 SCENARIO S3a PASS / FAIL、SCENARIO S3b PASS / FAIL）。
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const harness = require('./harness.js');

const TIMEOUT_MS = 200 * 1000;
const GATE_DEV_RE = /update gate reason=startup face=app skipped=dev/;
const RESULT_ERROR_RE = /update check .*type=harness result=error/;
const INSTALL_PHASE_RE = /harness install phase=/;

function electronExe() {
  return require(path.join(harness.REPO_ROOT, 'node_modules', 'electron'));
}

/**
 * 跑一子态（种子 autoCheckUpdates:true；registry 带 ?latest=<v>）。
 * @param {string} name 子态名（a / b）
 * @param {string} registryQuery 桩 registry 查询参数（?latest=<v>）
 * @param {Array<[string, RegExp]>} mustLines 必须在场的行（正向断言）
 * @param {Array<[string, RegExp]>} mustNotLines 必须缺席的行（负向断言；等待 gate 行到位后再判）
 */
async function runSubState(name, registryQuery, mustLines, mustNotLines) {
  const stubPort = await harness.findFreePort();
  const stub = await harness.startStub(stubPort);
  const scenario = `s3-${name}`;
  const { userData, env } = harness.scenarioEnv(scenario, stubPort, {
    BIGFISH_DSH_REGISTRY_URL: `http://127.0.0.1:${stubPort}/registry/npmmirror${registryQuery}`,
    BIGFISH_DSH_REGISTRY_FALLBACK_URL: `http://127.0.0.1:${stubPort}/registry/npmjs${registryQuery}`,
  });
  harness.seedSettings(userData, { autoCheckUpdates: true });
  let child = null;
  try {
    child = spawn(electronExe(), ['.'], {
      cwd: harness.REPO_ROOT,
      env,
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
    });
    // 等正向判据行（启动 5 s 后 runAutoChecks('startup')；check 行随后）
    for (const [label, re] of mustLines) {
      await harness.waitForLogLine(userData, 'updater.log', re, TIMEOUT_MS);
    }
    // 负向断言前的沉降窗：放行语义下若有异步自动安装面，其首行应在此窗内出现（防 TOCTOU 假 PASS）
    if (mustNotLines.length > 0) await new Promise((r) => setTimeout(r, 3000));
    const log = harness.readLog(userData, 'updater.log');
    const errors = [];
    if (RESULT_ERROR_RE.test(log)) errors.push('updater.log 含 result=error 行');
    for (const [label, re] of mustLines) {
      if (!re.test(log)) errors.push(`缺 ${label} 行`);
    }
    for (const [label, re] of mustNotLines) {
      if (re.test(log)) errors.push(`含 ${label}（须缺席）`);
    }
    if (errors.length > 0) throw new Error(errors.join('；'));
    process.stdout.write(`SCENARIO S3${name} PASS\n`); // 子态行（AC-B16-4：S3 含 a/b 两子态行）；总行由运行器打
    harness.killTree(child.pid);
    await new Promise((r) => setTimeout(r, 1500));
    harness.cleanupScenario(scenario);
    return true;
  } catch (err) {
    process.stdout.write(`SCENARIO S3${name} FAIL :: ${err && err.message ? err.message : err}\n`);
    if (child) harness.killTree(child.pid);
    await new Promise((r) => setTimeout(r, 1500));
    return false;
  } finally {
    stub.stop();
  }
}

function main() {
  (async () => {
    // 子态 a：latest = 0.1.5-rc.1（= 出厂 ⇒ up-to-date）
    const a = await runSubState('a', '?latest=0.1.5-rc.1', [
      ['gate skipped=dev', GATE_DEV_RE],
      ['up-to-date', /update check reason=startup type=harness result=up-to-date latest=0\.1\.5-rc\.1/],
    ], []);
    // 子态 b：latest = 0.1.9（> 出厂 ⇒ update-available；放行 = 只提示不自动装 ⇒ install phase 行须缺席）
    const b = await runSubState('b', '?latest=0.1.9', [
      ['gate skipped=dev', GATE_DEV_RE],
      ['update-available', /update check reason=startup type=harness result=update-available latest=0\.1\.9/],
    ], [
      ['harness install phase（自动安装——放行语义下须缺席）', INSTALL_PHASE_RE],
    ]);
    if (!(a && b)) process.exit(1);
    process.exit(0);
  })();
}

main();
