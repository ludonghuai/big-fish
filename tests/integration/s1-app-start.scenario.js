'use strict';
/**
 * s1-app-start.scenario.js — 场景一「应用能起」（B16；设计档 docs/design/REPO-CONVENTIONS.md §A.2.2.4）。
 * 驱动 = 真启动 electron . + 外部观测落盘物（bigfish.log 的 captured 行）+ 断言时刻进程仍存活。
 * 断言面 = 行为面（进程存活 / 产品自身落盘物与诊断日志行）。上限 180 s。
 * 退出码：0 = PASS；1 = FAIL（摘要行 SCENARIO S1 PASS / FAIL）。
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const harness = require('./harness.js');

const SCENARIO = 's1';
const TIMEOUT_MS = 180 * 1000;
const CAPTURED_RE = /backend web url captured port=\d+/;
const NOT_CAPTURED_RE = /backend web url not captured/;

/** electron 可执行路径（跨平台：require('electron') 在主进程外 = 可执行路径）。 */
function electronExe() {
  return require(path.join(harness.REPO_ROOT, 'node_modules', 'electron'));
}

function main() {
  (async () => {
    const stubPort = await harness.findFreePort();
    const stub = await harness.startStub(stubPort);
    const { userData, env } = harness.scenarioEnv(SCENARIO, stubPort);
    harness.seedSettings(userData); // S1 前置：modeChosen + lastModeVersion = 当前版本（否则模式弹窗阻塞）
    let child = null;
    try {
      child = spawn(electronExe(), ['.'], {
        cwd: harness.REPO_ROOT,
        env,
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      });
      await harness.waitForLogLine(userData, 'bigfish.log', CAPTURED_RE, TIMEOUT_MS);
      const log = harness.readLog(userData, 'bigfish.log');
      const alive = child.exitCode === null;
      if (NOT_CAPTURED_RE.test(log)) {
        throw new Error('bigfish.log 含 not captured 行（捕获后又丢失？）');
      }
      if (!alive) {
        throw new Error('captured 行在场但进程已退出（应存活）');
      }
      // 摘要行只由运行器统一打印（S1 子证据 = 上面的日志判据）；此处零输出
      harness.killTree(child.pid);
      await new Promise((r) => setTimeout(r, 1500));
      harness.cleanupScenario(SCENARIO);
      process.exit(0);
    } catch (err) {
      const log = harness.readLog(userData, 'bigfish.log');
      const alive = child && child.exitCode === null;
      const clue = !CAPTURED_RE.test(log) && alive
        ? '（线索：无 captured 行 + 进程仍活 = 启动失败对话框阻塞——shell-mode/main 的 modal 路径）'
        : '';
      process.stdout.write(`SCENARIO S1 FAIL :: ${err && err.message ? err.message : err} ${clue}\n`);
      if (child) harness.killTree(child.pid);
      await new Promise((r) => setTimeout(r, 1500));
      process.exit(1);
    } finally {
      stub.stop();
    }
  })();
}

main();
