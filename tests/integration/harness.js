'use strict';
/**
 * harness.js — 集成层公共夹具（B16；设计档 docs/design/REPO-CONVENTIONS.md §A.2.2.4）。
 * 职责：临时 userData / DSH_HOME 隔离 + settings 种子 + 假更新源桩启停 + 里程碑等待 + 杀进程树。
 * 断言面纪律（NFR-A5）：本层只断言行为面（进程退出码 / 产品自身落盘物与诊断日志行 / fs 结果）。
 * 失败取证：场景失败保留 .test-userdata-b16/ 与 .test-dsh-home/（已在 .gitignore 内）。
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const USERDATA_ROOT = path.join(REPO_ROOT, '.test-userdata-b16');
const DSH_HOME_ROOT = path.join(REPO_ROOT, '.test-dsh-home');
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;

/** 找一个空闲端口（桩端口；127.0.0.1 绑定——NFR-A3 零外网依赖）。 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve(addr.port);
      srv.close();
    });
  });
}

/** 等 URL 通（桩就绪探针；只连 127.0.0.1）。 */
function waitUntilHttpOk(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.once('error', () => {
        if (Date.now() - startedAt > timeoutMs) { reject(new Error(`stub not ready: ${url}`)); return; }
        setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

/** 起假更新源桩（复用 tests/update-stub.mjs，DD-A7 单一假源）。返回 { port, stop }。 */
async function startStub(port) {
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'tests', 'update-stub.mjs'), String(port)], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });
  await waitUntilHttpOk(`http://127.0.0.1:${port}/latest.json`);
  return {
    port,
    pid: child.pid,
    stop() {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } else {
          child.kill('SIGTERM');
        }
      } catch { /* best effort */ }
    },
  };
}

/** 场景环境（S1 基础面：隔离 userData + DSH_HOME + 跳依赖自检 + 更新源指桩）。 */
function scenarioEnv(scenario, stubPort, extra = {}) {
  const userData = path.join(USERDATA_ROOT, scenario);
  const dshHome = path.join(DSH_HOME_ROOT, scenario);
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(dshHome, { recursive: true });
  // 日志卫生：上一轮（失败保留取证 / S2 成功不清理）的旧行若不清，本轮判据会被陈旧行满足（假 PASS）⇒ 启动时清空观测日志
  for (const log of ['bigfish.log', 'updater.log', 'pet-geometry.log']) {
    try { fs.rmSync(path.join(userData, log), { force: true }); } catch { /* best effort */ }
  }
  const stubBase = `http://127.0.0.1:${stubPort}`;
  return {
    userData,
    dshHome,
    env: {
      ...process.env,
      BIGFISH_USER_DATA: userData,
      DSH_HOME: dshHome,
      BIGFISH_SKIP_ENSURE_DEPS: '1',
      BIGFISH_UPDATE_URL: `${stubBase}/latest.json`,
      BIGFISH_DSH_REGISTRY_URL: `${stubBase}/registry/npmmirror`,
      BIGFISH_DSH_REGISTRY_FALLBACK_URL: `${stubBase}/registry/npmjs`,
      BIGFISH_UPDATE_INTERVAL_MS: '86400000',
      DSH_NODE: process.execPath,
      BIGFISH_TEST_NO_NOTIFY: '1', // B16 修偏：抑制真实桌面通知（S3b 桩 latest=0.1.9 会走真通知面）
      ...extra, // 场景覆盖优先（S3 子态的 ?latest=<v> 等）
    },
  };
}

/** settings 种子（S1 前置：否则 mode 弹窗阻塞——shell-mode.js maybeShowModeDialog）。 */
function seedSettings(userData, overrides = {}) {
  const file = path.join(userData, 'settings.json');
  const seed = {
    modeChosen: true,
    lastModeVersion: APP_VERSION,
    petEnabled: false,
    autoCheckUpdates: false,
    ...overrides,
  };
  fs.writeFileSync(file, JSON.stringify(seed, null, 2), 'utf8');
  return file;
}

/** 读场景日志（行为面判据的数据源：产品自身落盘物）。 */
function readLog(userData, name) {
  try {
    return fs.readFileSync(path.join(userData, name), 'utf8');
  } catch { return ''; }
}

/** 等里程碑（轮询日志文件含串；超时 reject）。 */
function waitForLogLine(userData, name, pattern, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const text = readLog(userData, name);
      if (pattern.test(text)) { resolve(text); return; }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`timeout waiting ${name} ~ ${pattern} (after ${timeoutMs}ms)`));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

/** 杀进程树（Windows taskkill /T /F；POSIX 进程组）——不新增产品测试钩子（DD-A10）。 */
function killTree(pid) {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      try { process.kill(-pid, 'SIGTERM'); } catch { process.kill(pid, 'SIGTERM'); }
    }
  } catch { /* best effort */ }
}

/** 场景成功后清理落盘物（失败保留取证）。 */
function cleanupScenario(scenario) {
  for (const root of [path.join(USERDATA_ROOT, scenario), path.join(DSH_HOME_ROOT, scenario)]) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

module.exports = {
  REPO_ROOT,
  USERDATA_ROOT,
  DSH_HOME_ROOT,
  APP_VERSION,
  findFreePort,
  waitUntilHttpOk,
  startStub,
  scenarioEnv,
  seedSettings,
  readLog,
  waitForLogLine,
  killTree,
  cleanupScenario,
};
