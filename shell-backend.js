'use strict';
/**
 * shell-backend.js — 后端生命周期 + 路径解析（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6 注 S1）。
 * 函数清单（注 S1）：writeDiag · webUrlWaitMs · findFreePort · dshBinPath · bundledSkillDir · resolveRuntime · waitForReady ·
 * captureWebUrl · waitForWebUrl · browserUrl · cleanupStaleDsh · startDsh（内含 makeTee 工厂——每管道各自一只 StringDecoder）· stopDsh · dshHome ·
 * getCurrentDshVersion · restartBackend（+ 状态 dshProcess / port / browserLaunchUrl，经 getPort() 暴露）。
 */

const { app } = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const { StringDecoder } = require('node:string_decoder');
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

/** 后端打印的访问 URL（dsh ≥ 0.1.5 的 web 服务要求先访问带 token 的 URL 换取会话 Cookie；
 *  直接开 http://HOST:PORT 只会拿到 401「dsh web authentication required」）。 */
let browserLaunchUrl = null;

/** 后端输出尾部缓冲——嗅探 URL 行用（跨 chunk 拼接；上限防无界增长）。 */
let outputTail = '';

/** 后端 stdout/stderr 的落盘流（A5：模块级——tee 与壳侧诊断行共用同一 bigfish.log）。
 *  @type {import('node:fs').WriteStream | null} */
let logStream = null;

/** 本次启动 URL 行未被采用的原因（`mismatch` | `parse-fail`；宽限结束时无值 ⇒ 归 `no-line`）。 */
let webUrlRejectReason = null;

/** 后端输出里 URL 行的形状（0.1.0 起都打印；0.1.5 起 URL 自带 ?token=）。 */
const WEB_URL_LINE = /dsh web:\s+(https?:\/\/\S+)/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const WEB_URL_WAIT_MS = 3000;

// ---------------------------------------------------------------------------
// Backend lifecycle
// ---------------------------------------------------------------------------

/** 壳侧诊断行（A5）：同一行写 console 与 bigfish.log（落盘流不可用时只到 console）。 */
function writeDiag(line) {
  console.log(line);
  if (logStream) { try { logStream.write(`${line}\n`); } catch { /* 诊断行写不了不致命 */ } }
}

/** URL 行宽限（默认 3000 ms）；env `BIGFISH_WEB_URL_WAIT_MS` 可覆盖（测试钩子，DD-19）。 */
function webUrlWaitMs() {
  const raw = process.env.BIGFISH_WEB_URL_WAIT_MS;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return WEB_URL_WAIT_MS;
}

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

/**
 * 嗅探后端输出里的访问 URL 行（`dsh web: <url>`）。
 * 0.1.0 起该行只是地址；0.1.5 起地址带 `?token=`，浏览器必须先访问它换取签名 Cookie
 * 才能拿到 UI（否则一律 401）。只认本机地址与当前端口，LAN 行忽略。
 */
function captureWebUrl(text) {
  outputTail = (outputTail + text).slice(-4096);
  if (browserLaunchUrl) return;
  const m = outputTail.match(WEB_URL_LINE);
  if (!m) return;
  let u;
  try { u = new URL(m[1]); } catch { webUrlRejectReason = 'parse-fail'; return; }
  if (u.port !== String(port) || !LOOPBACK_HOSTS.has(u.hostname)) { webUrlRejectReason = 'mismatch'; return; }
  browserLaunchUrl = u.href;
  writeDiag(`[bigfish] backend web url captured port=${port} token=${u.searchParams.has('token') ? 'yes' : 'no'}`);
  // DD-28 晚命中回收：地址锁定晚于建窗（宽限耗尽后行才到）⇒ 已加载裸地址的窗口补一次加载
  try {
    const win = getMainWindow();
    if (win && !win.isDestroyed() && win.webContents.getURL() !== browserLaunchUrl) {
      win.loadURL(browserLaunchUrl).catch(() => { /* 导航被取代（ERR_ABORTED）不致命 */ });
    }
  } catch { /* 回收失败不影响捕获与取证行 */ }
}

/** 等待 URL 行（HTTP 就绪时通常已打印；留一小段宽限，避免探测先于输出到达的竞态）。
 *  宽限期默认 3000 ms，env `BIGFISH_WEB_URL_WAIT_MS` 可覆盖。 */
function waitForWebUrl(timeoutMs = webUrlWaitMs()) {
  if (browserLaunchUrl) return Promise.resolve(browserLaunchUrl);
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (browserLaunchUrl || Date.now() - startedAt >= timeoutMs) { resolve(browserLaunchUrl); return; }
      setTimeout(tick, 100);
    };
    tick();
  });
}

/** 主窗口应加载的 URL：优先后端打印的带 token 地址，未打印时回落裸地址（旧版行为）。 */
function browserUrl() {
  return browserLaunchUrl || `http://${HOST}:${port}`;
}

/** Kill any leftover backend processes from a previous session (crash / force quit). */
function cleanupStaleDsh() {
  try {
    if (process.platform === 'win32') {
      const script = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { ($_.CommandLine -like '*dsh/lib/bin.js*' -or $_.CommandLine -like '*dsh\\lib\\bin.js*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
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
  // --no-open：别让后端再拉一个系统默认浏览器（桌面壳自带窗口，那个浏览器只会添乱）
  const args = [...rt.args, '--profile', 'web', '--host', HOST, '--port', String(port), '--no-open'];
  browserLaunchUrl = null;
  outputTail = '';
  webUrlRejectReason = null;
  console.log(`[bigfish] starting backend on http://${HOST}:${port}`);

  // 后端日志写文件，便于排查黑屏/启动失败；打不开时降级为转到本进程 stdout，不让整个后端崩
  if (logStream) { try { logStream.end(); } catch { /* 上一轮的流：换新前收尾，防句柄泄漏 */ } }
  logStream = null; // A5：模块级——tee 与壳侧诊断行共用同一文件（A3 运行期写失败即置 null）
  try {
    const logPath = path.join(app.getPath('userData'), 'bigfish.log');
    const stream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream = stream;
    await new Promise((resolve) => {
      if (stream.fd !== null) { resolve(); return; }
      stream.once('open', resolve);
      // A3：常驻 error 监听（非 once）——运行期写失败（磁盘满 / 路径失效）即置 null，tee 自动降级 stdout；
      // 身份判定：只清「自己这一只」——上一轮流的残留监听不得把本轮流置空（跨会话误清）
      stream.on('error', () => { if (logStream === stream) logStream = null; resolve(); });
    });
    if (stream.fd !== null) {
      stream.write(`\n\n===== ${new Date().toISOString()} start backend :${port} =====\n`);
    } else {
      logStream = null;
    }
  } catch { logStream = null; /* 日志写不了就算了 */ }

  // stdout/stderr 走管道：既转写日志文件，又顺带嗅探后端打印的访问 URL（含 token）
  dshProcess = spawn(rt.command, args, {
    env: rt.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  // A1：每个管道各自一只 StringDecoder——跨 chunk 的多字节字符不被切开（共用一只会把 stdout
  //     尾部半字符与 stderr 首字节拼在一起）；A2：降级分支自身也不许抛（EPIPE 等）。
  const makeTee = () => {
    const decoder = new StringDecoder('utf8');
    return (chunk) => {
      const text = decoder.write(chunk);
      captureWebUrl(text);
      if (logStream) { try { logStream.write(text); } catch { /* 磁盘写失败不影响后端 */ } }
      else { try { process.stdout.write(text); } catch { /* stdout 关了也不影响后端 */ } }
    };
  };
  dshProcess.stdout?.on('data', makeTee());
  dshProcess.stderr?.on('data', makeTee());
  dshProcess.once('error', (err) => console.error('[bigfish] failed to spawn backend:', err));
  await waitForReady(port);
  await waitForWebUrl();
  if (!browserLaunchUrl) {
    // 每次启动至多一条：宽限结束仍未捕获 ⇒ 记 reason（无候选行 / 行形不符）+ 回落裸地址
    const reason = webUrlRejectReason || 'no-line';
    writeDiag(`[bigfish] backend web url not captured port=${port} reason=${reason} fallback=${browserUrl()}`);
  }
}

function stopDsh() {
  const child = dshProcess;
  dshProcess = null;
  browserLaunchUrl = null; // 进程没了，token 也失效了
  webUrlRejectReason = null;
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
  stopDsh();
  await new Promise((r) => setTimeout(r, 1500));
  await startDsh();
  // 一律用带 token 的地址重载：即使端口恰好复用，旧 Cookie 也可能因凭据轮换而失效（§2.2.5）
  getMainWindow().loadURL(browserUrl()).catch(() => { /* 加载失败 / 导航被取代：不致命（与晚命中回收同款） */ });
  return true;
}

/** 当前后端端口访问器（跨模块读面；startDsh 前为 null）。 */
function getPort() { return port; }

module.exports = {
  dshBinPath,
  dshHome,
  writeDiag,
  getCurrentDshVersion,
  getPort,
  browserUrl,
  startDsh,
  stopDsh,
  cleanupStaleDsh,
  restartBackend,
  init,
};
