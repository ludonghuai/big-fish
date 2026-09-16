'use strict';
/**
 * shell-backend.js — 后端生命周期 + 路径解析（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6 注 S1）。
 * 函数清单（注 S1）：findFreePort · dshBinPath · bundledSkillDir · resolveRuntime · waitForReady ·
 * cleanupStaleDsh · startDsh · stopDsh · dshHome · getCurrentDshVersion · restartBackend（+ 状态 dshProcess / port，经 getPort() 暴露）。
 */

const { app } = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const harnessStore = require('./harness-store.js');

// 注入面（组合根 main.js 接线）：HOST / READY_TIMEOUT_MS（常量）；sanitizeProfileBundles（plugins）；getMainWindow（window）
let HOST = null;
let READY_TIMEOUT_MS = 0;
let sanitizeProfileBundles = null;
let getMainWindow = null;
function init(deps) {
  HOST = deps.HOST;
  READY_TIMEOUT_MS = deps.READY_TIMEOUT_MS;
  sanitizeProfileBundles = deps.sanitizeProfileBundles;
  getMainWindow = deps.getMainWindow;
}

/** @type {import('node:child_process').ChildProcess | null} */
let dshProcess = null;

/** @type {number | null} */
let port = null;

// ---------------------------------------------------------------------------
// Backend lifecycle
// ---------------------------------------------------------------------------

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, HOST, () => {
      const addr = srv.address();
      const p = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(p));
    });
  });
}

function dshBinPath() {
  // Harness 运行时：活跃指针副本优先（userData/dsh-update/versions/<v>；无指针时兼容旧布局
  // userData/dsh）——dev 与打包同口径（US-6 / DD-8）；无指针兜底出厂副本（打包 = 冻结树
  // resourcesPath/dsh，dev = dsh-bundle 出厂副本）。
  const active = harnessStore.resolveActiveBin(app.getPath('userData'));
  if (active) return active;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  }
  return path.join(app.getAppPath(), 'dsh-bundle', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
}

/** Directory of bundled skills shipped with the app (loaded via DSH_BUNDLED_SKILL_DIR). */
function bundledSkillDir() {
  return path.join(app.getAppPath(), 'bundled-skills');
}

function resolveRuntime() {
  const bin = dshBinPath();
  const env = { ...process.env, DSH_BUNDLED_SKILL_DIR: bundledSkillDir() };
  if (!app.isPackaged) {
    return { command: process.env.DSH_NODE || 'node', args: [bin], env };
  }
  const nodeBin = process.platform === 'win32' ? 'node.exe' : 'node';
  const nodeExe = path.join(process.resourcesPath, 'node-runtime', nodeBin);
  return { command: nodeExe, args: [bin], env };
}

function waitForReady(p, timeoutMs = READY_TIMEOUT_MS) {
  const base = `http://${HOST}:${p}`;
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`${base}/`, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.once('error', retry);
      req.setTimeout(3000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for the backend at ${base}`));
        return;
      }
      setTimeout(attempt, 500);
    };
    attempt();
  });
}

/** Kill any leftover backend processes from a previous session (crash / force quit). */
function cleanupStaleDsh() {
  try {
    if (process.platform === 'win32') {
      const script = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*dsh/lib/bin.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
      // -WindowStyle Hidden：彻底不弹 PowerShell 黑窗
      spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], { stdio: 'ignore', windowsHide: true });
    } else {
      spawn('pkill', ['-f', 'dsh/lib/bin.js'], { stdio: 'ignore' });
    }
  } catch { /* best effort */ }
}

async function startDsh() {
  cleanupStaleDsh();
  // 先清理坏 bundle（防止上次误写入 github:xxx 导致后端启动崩）
  sanitizeProfileBundles();
  await new Promise((r) => setTimeout(r, 1500)); // 给清理留一点时间
  port = await findFreePort();
  const rt = resolveRuntime();
  const args = [...rt.args, '--profile', 'web', '--host', HOST, '--port', String(port)];
  console.log(`[bigfish] starting backend on http://${HOST}:${port}`);

  // 后端日志写文件，便于排查黑屏/启动失败；打不开时降级为 inherit，不让整个后端崩
  let logStream = null;
  try {
    const logPath = path.join(app.getPath('userData'), 'bigfish.log');
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    await new Promise((resolve) => {
      if (logStream.fd !== null) { resolve(); return; }
      logStream.once('open', resolve);
      logStream.once('error', () => { logStream = null; resolve(); });
    });
    if (logStream && logStream.fd !== null) {
      logStream.write(`\n\n===== ${new Date().toISOString()} start backend :${port} =====\n`);
    } else {
      logStream = null;
    }
  } catch { logStream = null; /* 日志写不了就算了 */ }

  const stdioOut = logStream || 'inherit';
  dshProcess = spawn(rt.command, args, {
    env: rt.env,
    stdio: ['ignore', stdioOut, stdioOut],
    windowsHide: true,
  });
  dshProcess.once('error', (err) => console.error('[bigfish] failed to spawn backend:', err));
  await waitForReady(port);
}

function stopDsh() {
  const child = dshProcess;
  dshProcess = null;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 3000);
    }
  } catch { /* best effort */ }
}

/** 活动 dsh 版本（userData 副本优先，出厂冻结兜底）——AC9 判据。 */
function getCurrentDshVersion() {
  try {
    const bin = dshBinPath();
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(bin)), 'package.json'), 'utf8'));
    return String(pkg.version || '');
  } catch { return '0.0.0'; }
}

function dshHome() {
  return process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh');
}

/** 重启后端并让主窗口重新加载（插件生效必须重启）。 */
async function restartBackend() {
  if (!getMainWindow() || getMainWindow().isDestroyed()) {
    stopDsh();
    await new Promise((r) => setTimeout(r, 1500));
    await startDsh();
    return true;
  }
  const oldPort = port;
  stopDsh();
  await new Promise((r) => setTimeout(r, 1500));
  await startDsh();
  if (port !== oldPort) {
    getMainWindow().loadURL(`http://${HOST}:${port}`);
  } else {
    getMainWindow().reload();
  }
  return true;
}

/** 当前后端端口访问器（跨模块读面；startDsh 前为 null）。 */
function getPort() { return port; }

module.exports = {
  dshBinPath,
  dshHome,
  getCurrentDshVersion,
  getPort,
  startDsh,
  stopDsh,
  cleanupStaleDsh,
  restartBackend,
  init,
};
