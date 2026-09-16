'use strict';

/**
 * Bigfish — Electron desktop shell for DeepSeek Harness.
 *
 * Architecture:
 *   1. Find a free localhost port.
 *   2. Spawn the bundled `@deepseek-ai/dsh` CLI in "web" profile as a child
 *      process (this is the same backend that `dsh web` runs).
 *   3. Wait until the backend responds on 127.0.0.1:<port>.
 *   4. Open a native BrowserWindow pointing at that local URL.
 *
 * Desktop-product extras (on top of the plain web shell):
 *   - system tray + global shortcut to summon the window
 *   - minimize-to-tray (closing the window keeps the app alive)
 *   - completion notifications (heuristic: backend writes then goes idle)
 *   - desktop pet (鲸鱼娘): transparent floating window, draggable,
 *     碰墙折返的散步/跑步、点击互动、随机说话与小动作、好感度条
 *   - 好感度 & 兑换屋：按真实 token 消耗累积好感/等级，右键鲸鱼娘把 token
 *     换成 💴 买食物喂食
 *   - plugin ecosystem: bundled pnpm installs/removes DSH plugins in the web
 *     profile, and a native "插件市场" window browses/installs/uninstalls them
 *   - launch at login, and a Windows "Open with Bigfish" context menu
 */

const {
  app, BrowserWindow, shell, dialog, Tray, Menu, globalShortcut,
  nativeImage, Notification, ipcMain, screen,
} = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const { compareVersions } = require('./update-lib.js');
const updater = require('./updater.js');
const harnessStore = require('./harness-store.js');

const APP_NAME = 'Bigfish';
const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 90 * 1000;
const IDLE_NOTIFY_MS = 30 * 1000; // backend quiet for this long after activity => "done"

// 测试/多实例：允许用环境变量指定 userData（避免 --user-data-dir 经 cmd 转发被改坏）
if (process.env.BIGFISH_USER_DATA && String(process.env.BIGFISH_USER_DATA).trim() !== '') {
  try { app.setPath('userData', String(process.env.BIGFISH_USER_DATA).trim()); } catch { /* ignore */ }
}

// 检查更新：从 Gitee 仓库 raw 拉取 latest.json（唯一清单源；AC6）。
// 测试钩子：BIGFISH_UPDATE_URL 可覆盖（设计档 §2.2.2 假清单桩；仅此面允许 http 本地桩）。
const UPDATE_MANIFEST_URL = process.env.BIGFISH_UPDATE_URL
  || 'https://gitee.com/ludonghuai/big-fish/raw/main/latest.json';
const UPDATE_POLL_MS = Number(process.env.BIGFISH_UPDATE_INTERVAL_MS) || 21600000; // 6h（AC2 短轮询可覆盖）

/** @type {import('node:child_process').ChildProcess | null} */
let dshProcess = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let petWindow = null;
/** @type {BrowserWindow | null} */
let welcomeWindow = null;
/** @type {Tray | null} */
let tray = null;
/** @type {number | null} */
let port = null;
let quitting = false;
let completionWatcherTimer = null;
let lastBusyAt = 0;
let notifiedForCycle = false;

// ---------------------------------------------------------------------------
// Settings (persisted to userData/settings.json)
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  notifyOnComplete: true,
  launchAtLogin: false,
  autoCheckUpdates: true, // 自动检查更新开关（启动检查 + 6h 轮询；托盘 checkbox，§2.2.7）
  petEnabled: true,
  onboardingDone: false,
  mode: 'whale',        // 'whale' 鲸鱼模式（桌宠+背景图） | 'focus' 专注模式（无桌宠、纯色背景）
  modeChosen: false,    // 是否已弹过模式选择
  lastModeVersion: '',  // 上次选择模式时的版本号（更新后重新弹窗）
  petPos: null,         // 桌宠上次位置（DIP 整数 { x, y }；null = 无存档）——US-13
};
let settings = { ...DEFAULT_SETTINGS };

// settings.json 存在但无法解析（整个 JSON 损坏）——与「无存档」区分：
//   无存档（首次运行）⇒ 不带 x/y 建窗（TC-18）；损坏 ⇒ 回落 petDefaultPos()（TC-19）。
let settingsFileCorrupt = false;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}
function loadSettings() {
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
    settingsFileCorrupt = false;
  } catch (err) {
    // ENOENT = 文件不存在（首次运行，无存档）；其余（解析失败 / 不可读）= 存档损坏
    settingsFileCorrupt = !!err && err.code !== 'ENOENT';
    settings = { ...DEFAULT_SETTINGS };
  }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('[bigfish] failed to save settings:', err);
  }
}

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
  if (app.isPackaged) {
    // Harness 运行时：活跃指针副本优先（userData/dsh-update/versions/<v>；无指针时兼容旧布局
    // userData/dsh），出厂冻结树（extraResources）兜底（§2.2.1 / AC9）。dev 分支见下，口径不变。
    const active = harnessStore.resolveActiveBin(app.getPath('userData'));
    if (active) return active;
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

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  try {
    const n = new Notification({ title, body, icon: appIconPath() });
    if (typeof onClick === 'function') n.on('click', onClick); // 气泡点击（U-2：点击查看 → 弹窗）
    n.show();
  } catch (err) {
    console.error('[bigfish] notification failed:', err);
  }
}

const PET_QUOTES = [
  // 人设·打招呼
  '我是深海里的鲸鱼公主，很高兴见到你~',
  '欢迎回来，我的小伙伴！',
  '鲸鱼公主来啦，今天也要一起加油哦！',
  '深海那么大，但我只想陪你~',
  // 人设·撒娇/互动
  '哼，都不理我，我要吐泡泡了~',
  '抱抱我嘛，我可是会喷水的公主！',
  '你忙的时候，我会乖乖在旁边看着你~',
  '我的尾巴会发光，但只有你才看得到哦~',
  // 趣味·小知识（鲸鱼相关）
  '小知识：蓝鲸的心跳每分钟只有 6 次哦~',
  '你知道吗？鲸鱼其实是哺乳动物，不是鱼！',
  '鲸鱼唱歌能传 1600 公里远，我的歌声呢~',
  '座头鲸会跳出海面，像是在跳芭蕾~',
  '小知识：抹香鲸可以潜水 90 分钟不上来！',
  // 趣味·日常生活
  '要不要我帮你把今天的任务列个清单？',
  '查资料、写报告、做 PPT，说一声就行~',
  '记得喝口水休息一下，别太累啦！',
  '作业写完记得检查一遍哦~',
  // 加油打气
  '今天也要元气满满！',
  '你已经很棒了，剩下的事交给我！',
  '别怕麻烦，我一直都在~',
];

function petSay(msg) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet-say', msg);
  }
}

/** 待机时随机表演一段小动作（看书/星星眼/惊吓/开心），随后回到待机。 */
function playIdleVariant() {
  if (!petWindow || petWindow.isDestroyed() || petState !== 'idle') return;
  const variants = ['read', 'starry', 'scared', 'happy'];
  const v = variants[Math.floor(Math.random() * variants.length)];
  setPetState(v);
  setTimeout(() => {
    if (petState === v) setPetState('idle');
  }, 2400);
}

function schedulePetChatter() {
  clearTimeout(chatterTimer);
  chatterTimer = setTimeout(() => {
    if (petWindow && !petWindow.isDestroyed() && petState === 'idle') {
      // 40% 概率先表演一段小动作，再说话
      if (Math.random() < 0.4) playIdleVariant();
      petSay(PET_QUOTES[Math.floor(Math.random() * PET_QUOTES.length)]);
    }
    schedulePetChatter();
  }, 90000); // 固定 1.5 分钟说一句
}

function uninstall() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ type: 'info', title: APP_NAME, message: '卸载功能只在安装版可用', detail: '请安装打包好的 Bigfish 后再使用卸载。' });
    return;
  }
  const uninstaller = path.join(path.dirname(process.execPath), 'Uninstall Bigfish.exe');
  if (fs.existsSync(uninstaller)) {
    quitting = true;
    spawn(uninstaller, [], { detached: true, stdio: 'ignore' });
    setTimeout(() => app.quit(), 800);
  } else {
    shell.openExternal('ms-settings:appsfeatures');
  }
}

// ---------------------------------------------------------------------------
// 自动更新编排（设计档 docs/design/AUTO-UPDATE.md §2.2）——
//   updater.js：检查/下载/校验/安装器/Harness 安装激活回滚；
//   main.js：门禁、弹窗/气泡、更新窗口生命周期、6h 轮询、Harness 停-切-启编排。
// ---------------------------------------------------------------------------
const NPMIRROR_DSH_META = 'https://registry.npmmirror.com/@deepseek-ai/dsh';
const NPMJS_DSH_META = 'https://registry.npmjs.org/@deepseek-ai/dsh';

let updateWindow = null;
let updateMode = 'app';        // 'app' | 'harness'
let pendingAppInfo = null;     // 待下载/可重试的 App 清单 info
let pendingAppFile = null;     // 已下载校验通过、待安装的文件
let pendingHarnessInfo = null; // 待安装/可重试的 Harness 元数据 { latest, current }
let lastUpdateStatus = null;   // 最近一条状态——建窗首帧竞态修复：did-finish-load 时重发

/** updater.log 常开写入（设计档 §2.2.9；updater.js 的日志经 init(ctx).log 也走这里）。 */
function updaterLog(text) {
  try {
    const file = path.join(app.getPath('userData'), 'updater.log');
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${text}\n`);
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

function createUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) { updateWindow.show(); updateWindow.focus(); return; }
  updateWindow = new BrowserWindow({
    width: 440,
    height: 260,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '更新 Bigfish',
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'update-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  updateWindow.loadFile(path.join(__dirname, 'update.html'), { query: { v: Date.now() } });
  // 首帧竞态：渲染层 onStatus 监听在页面脚本执行后才注册，建窗后同 tick 发状态会丢——
  // did-finish-load 时重发最近一条（否则 Harness 安装数分钟内窗口停在「正在准备…」且无取消按钮）
  updateWindow.webContents.once('did-finish-load', () => {
    if (lastUpdateStatus && updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.webContents.send('upd:status', lastUpdateStatus);
    }
  });
  updateWindow.on('closed', () => { updateWindow = null; });
}

function sendUpdateStatus(payload) {
  lastUpdateStatus = payload;
  if (updateWindow && !updateWindow.isDestroyed()) updateWindow.webContents.send('upd:status', payload);
}

/** 在途守卫（§2.2.7）：检查/下载/Harness 安装任一在途 → 跳过本轮（记 gate 行）。 */
function updateGateBlocked(reason) {
  const busy = updater.busyState();
  if (busy.check || busy.download || busy.harness) {
    updaterLog(`update gate reason=${reason} skipped=in-flight`);
    return true;
  }
  return false;
}

// ---- App 更新呈现（U-1/U-2/U-3） ----
function showAppUpdateDialog(info) {
  const choice = dialog.showMessageBoxSync({
    type: 'info',
    title: APP_NAME,
    message: `发现新版本 v${info.version}`,
    detail: `${info.note || '有新版本可用'}\n\n当前版本：v${app.getVersion()}`,
    buttons: ['立即更新', '稍后再说'],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice === 0) {
    pendingAppInfo = info;
    updateMode = 'app';
    createUpdateWindow();
    startAppDownload(info);
  }
}

function showAppUpdateBubble(info) {
  notify(`发现新版本 v${info.version}`, '点击查看', () => showAppUpdateDialog(info));
}

function showAppCheckErrorDialog() {
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: APP_NAME,
    message: '检查更新失败',
    detail: '网络可能不可用，请稍后重试。',
    buttons: ['重试', '取消'],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice === 0) runAppCheck('manual');
}

async function runAppCheck(reason) {
  const res = await updater.checkAppUpdate({ reason });
  if (res.status === 'update-available') {
    if (reason === 'poll') showAppUpdateBubble(res.info);
    else showAppUpdateDialog(res.info);
  } else if (res.status === 'up-to-date' && reason === 'manual') {
    notify(APP_NAME, '已是最新版本');
  } else if (res.status === 'error' && reason === 'manual') {
    showAppCheckErrorDialog();
  }
  return res;
}

async function startAppDownload(info) {
  sendUpdateStatus({ mode: 'app', phase: 'downloading', percent: 0 });
  const res = await updater.downloadApp(info, (p) => {
    if (p && p.phase === 'verify') sendUpdateStatus({ mode: 'app', phase: 'verifying' });
    else if (p && typeof p.percent === 'number') sendUpdateStatus({ mode: 'app', phase: 'downloading', percent: p.percent });
  });
  if (!res.ok) {
    sendUpdateStatus({ mode: 'app', phase: res.error === 'canceled' ? 'canceled' : 'error', message: res.error });
    return;
  }
  pendingAppFile = res.file;
  sendUpdateStatus({ mode: 'app', phase: 'ready' });
}

// ---- Harness 更新呈现与停-切-启编排（U-6 / §2.2.4） ----
function showHarnessUpdateDialog(res) {
  const choice = dialog.showMessageBoxSync({
    type: 'info',
    title: APP_NAME,
    message: `发现 Harness 新版本 v${res.latest}（当前 v${res.current}）`,
    detail: '更新需数分钟，期间后端会重启。',
    buttons: ['立即更新', '稍后再说'],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice === 0) startHarnessUpdate(res);
}

function showHarnessUpdateBubble(res) {
  notify(`发现 Harness 新版本 v${res.latest}`, '点击查看', () => showHarnessUpdateDialog(res));
}

function showHarnessCheckErrorDialog() {
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: APP_NAME,
    message: '检查 Harness 更新失败',
    detail: '网络可能不可用，请稍后重试。',
    buttons: ['重试', '取消'],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice === 0) runHarnessCheck('manual');
}

async function runHarnessCheck(reason) {
  const res = await updater.checkHarnessUpdate({ reason });
  if (res.status === 'update-available') {
    if (reason === 'manual') showHarnessUpdateDialog(res);
    else showHarnessUpdateBubble(res);
  } else if (res.status === 'error' && reason === 'manual') {
    showHarnessCheckErrorDialog();
  }
  return res;
}

/**
 * Harness 更新编排（§2.2.4 ④⑤⑥⑦ + 停-切-启）：
 * installHarness 在冒烟通过后回调 { phase:'stop-backend' } 并等待其完成——main.js 在该回调停后端
 * （对齐 C1「停 dsh → 切 → 启 dsh」，依赖安装/冒烟不触碰现行副本，停机窗口最小化）；
 * 成功后重启后端并写两条编排域日志（AC9 机器证据，§2.2.9）。
 */
async function startHarnessUpdate(res) {
  pendingHarnessInfo = res;
  updateMode = 'harness';
  createUpdateWindow();
  sendUpdateStatus({ mode: 'harness', phase: 'installing' });
  const onPhase = async (p) => {
    if (!p) return;
    if (p.phase === 'stop-backend') {
      // 激活前停后端（updater 等待本回调完成才写活跃指针）
      sendUpdateStatus({ mode: 'harness', phase: 'switching' });
      stopDsh();
      await new Promise((r) => setTimeout(r, 1500));
    } else if (p.phase === 'smoke') {
      sendUpdateStatus({ mode: 'harness', phase: 'verifying' });
    } else if (p.phase === 'activate') {
      sendUpdateStatus({ mode: 'harness', phase: 'switching' });
    }
  };
  const outcome = await updater.installHarness(res.latest, onPhase);
  if (!outcome.ok) {
    // 取消时若后端已被停（stop-backend 已完成）须重启；其余失败一律重启回旧版
    const needRestart = outcome.error !== 'canceled' || !!outcome.backendStopped;
    if (needRestart) {
      try { await restartBackend(); } catch { /* 旧版仍在，尽力重启 */ }
    }
    const message = outcome.error === 'canceled'
      ? outcome.error
      : /^(activate-fail|pointer-fail|verify-fail|guard-active-dir)/.test(String(outcome.error))
        ? '更新失败，旧版不受影响，可重试' // 设计档 §2.2.4 ①⑤⑥ 指定文案
        : outcome.error;
    sendUpdateStatus({ mode: 'harness', phase: outcome.error === 'canceled' ? 'canceled' : 'error', message });
    return;
  }
  updaterLog(`harness activate dsh active path=${dshBinPath()} version=${getCurrentDshVersion()}`); // 重启前按实际解析结果记（AC9 机器证据）
  try {
    await restartBackend();
    updaterLog(`harness restart backend ready port=${port}`);
    updater.cleanupHarnessStale();
    sendUpdateStatus({ mode: 'harness', phase: 'done' });
  } catch (err) {
    updater.rollbackHarness();
    try { await restartBackend(); } catch { /* 尽力 */ }
    sendUpdateStatus({ mode: 'harness', phase: 'error', message: '更新失败，已回退旧版，可重试' });
  }
}

// ---- 门禁 + 调度（§2.2.7） ----
async function manualCheckUpdates() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ type: 'info', title: APP_NAME, message: '更新检查只在安装版可用', detail: '请安装打包好的 Bigfish 后使用更新检查。' });
    updaterLog('update gate reason=manual skipped=dev');
    return;
  }
  if (updateGateBlocked('manual')) { notify(APP_NAME, '检查/更新正在进行'); return; }
  await runAppCheck('manual');
  await runHarnessCheck('manual');
}

async function runAutoChecks(reason) {
  if (!app.isPackaged) { updaterLog(`update gate reason=${reason} skipped=dev`); return; }
  if (!settings.autoCheckUpdates) { updaterLog(`update gate reason=${reason} skipped=toggle-off`); return; }
  if (updateGateBlocked(reason)) return;
  await runAppCheck(reason);
  await runHarnessCheck(reason);
}

/** 启动检查（5s）+ 6h 轮询（§2.2.7；BIGFISH_UPDATE_INTERVAL_MS 可覆盖）。 */
function scheduleUpdateChecks() {
  updater.init({
    manifestUrl: UPDATE_MANIFEST_URL,
    registryUrls: [
      process.env.BIGFISH_DSH_REGISTRY_URL || NPMIRROR_DSH_META,
      process.env.BIGFISH_DSH_REGISTRY_FALLBACK_URL || NPMJS_DSH_META,
    ],
    dirs: { userData: app.getPath('userData'), dshHome: dshHome() },
    runtime: { nodeExe: runtimeNodeExe(), pnpm: bundledPnpmPath() },
    log: updaterLog,
    getCurrentVersion: () => app.getVersion(),
    getCurrentDshVersion,
  });
  updater.startupCleanup();
  setTimeout(() => { runAutoChecks('startup'); }, 5000);
  setInterval(() => { runAutoChecks('poll'); }, UPDATE_POLL_MS);
}

// Heuristic "task completed" detector: watch DSH_HOME (excluding the static
// profiles/ tree) for writes; after a burst of activity followed by idle, notify.
function dshHome() {
  return process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh');
}

// ---------------------------------------------------------------------------
// Onboarding wizard
// ---------------------------------------------------------------------------
function createWelcomeWindow() {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.show();
    welcomeWindow.focus();
    return;
  }
  welcomeWindow = new BrowserWindow({
    width: 520,
    height: 660,
    parent: mainWindow || undefined,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Bigfish 新手向导',
    autoHideMenuBar: true,
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'welcome-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  welcomeWindow.once('ready-to-show', () => {
    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.show();
      welcomeWindow.focus();
    }
  });
  welcomeWindow.loadFile(path.join(__dirname, 'welcome.html'));
  welcomeWindow.on('closed', () => { welcomeWindow = null; });
}

function latestMtime(dir, skipNames, out) {
  out = out || { t: 0 };
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (skipNames && skipNames.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      latestMtime(full, skipNames, out);
    } else if (e.isFile()) {
      try {
        const t = fs.statSync(full).mtimeMs;
        if (t > out.t) out.t = t;
      } catch { /* ignore */ }
    }
  }
  return out;
}

function startCompletionWatcher() {
  stopCompletionWatcher();
  const skip = new Set(['profiles', 'node_modules']);
  completionWatcherTimer = setInterval(() => {
    if (!settings.notifyOnComplete) return;
    const { t } = latestMtime(dshHome(), skip);
    const now = Date.now();
    if (t > lastBusyAt + 2000 && now - t < 2000) {
      // fresh write => busy
      lastBusyAt = now;
      notifiedForCycle = false;
    } else if (lastBusyAt > 0 && now - lastBusyAt > IDLE_NOTIFY_MS && !notifiedForCycle) {
      notifiedForCycle = true;
      const msg = 'Bigfish 任务已完成';
      notify(msg, '后端已空闲，可以回来看看结果了');
      petSay('任务完成啦！');
    }
  }, 5000);
}

function stopCompletionWatcher() {
  if (completionWatcherTimer) {
    clearInterval(completionWatcherTimer);
    completionWatcherTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
function appIconPath() {
  const candidates = [
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, 'build', 'icon.png'),
    path.join(__dirname, 'build', 'icon.ico'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return undefined;
}
function trayIconPath() {
  const candidates = [
    path.join(__dirname, 'assets', 'tray.png'),
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, 'build', 'tray.png'),
    path.join(__dirname, 'build', 'icon.png'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return undefined;
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    icon: appIconPath(),
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0b0f',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.show();
      welcomeWindow.focus();
    }
  });

  // Close hides to tray (keeps the backend alive); real quit goes through the tray.
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let origin;
    try { origin = new URL(url).origin; } catch { event.preventDefault(); return; }
    if (origin !== `http://${HOST}:${port}`) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    }
  });

  // 页面加载完成后注入半透明背景
  mainWindow.webContents.on('did-finish-load', () => applyBackground());

  mainWindow.loadURL(`http://${HOST}:${port}`);
}

function toggleMainWindow() {
  ensurePet();
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isVisible()) mainWindow.hide();
  else { mainWindow.show(); mainWindow.focus(); }
}

// ---------------------------------------------------------------------------
// Desktop pet — transparent floating window（鲸鱼娘）
// ---------------------------------------------------------------------------
// Pet geometry — 多屏几何与可见性（设计档 docs/design/PET-MULTIMONITOR.md §2.3.1）
//   全部几何判定收敛为下列 helper（单一来源，NFR-8）；取屏唯一入口 = petDisplayOf()，
//   其余调用点不得内联第二份实现。坐标口径 = DIP（证据 E1/E2）；窗口自身位置与尺寸的
//   坐标空间在上游未声明（证据 E6）——本组「仅在 DIP 假设成立时自洽」（设计档 §2.2）。
//   统一短路口径：返回 null 不等于「位置为零」，调用方拿到 null 必须跳过写入。
//   尺寸策略（§2.3.5）：petCalibrateSize() 是**唯一尺寸写入路径**（锚点 + 容差 + 不可判定门，DD-20）；
//   尺寸**写入** = setBounds（**尺寸专用形态**：不提供 x / y，第 13 轮改写，DD-25 / E8）· **读回** = getSize()（DD-21 / §2.2 Q7）；
//   **位置保护** = 写入前后各读一次位置、差异 > 1 DIP 才条件回写（§2.3.5-F）。
// ---------------------------------------------------------------------------
const PET_SIZE_DIP = { w: 250, h: 270 };  // 窗口逻辑尺寸（DIP），跨屏不变（US-11）；与建窗 / pet.html 同源
const PET_DEFAULT_MARGIN_DIP = 24;        // petDefaultPos() 的右下角边距（设计档 DD-6）
const PET_WALL_EPS = 4;                   // 贴墙判定阈值（px；B01 AC7 不回退，只改判定基准）
const PET_SIZE_TOLERANCE_DIP = 8;         // 尺寸判据容差（DIP，§2.3.5-A）：覆盖 R3 的 +2~+6 量化并留余量；禁用精确判等
const PET_WANDER_SIZE_CHECK_MS = 30000;   // 散步 / 跑步**段起点**兜底校准的最小间隔（ms；§2.1 H 组 H-3 / §2.3.5-B 第 4 条 / DD-22）⇒ 该路径频率 ≤2 次/分
const PET_GEOM_DEBUG = process.env.BIGFISH_PET_DEBUG === '1'; // 几何诊断日志开关（默认关闭，关闭时零开销）

/**
 * 尺寸锚点内存态（§2.3.5-A）：`{ w, h, scaleFactor } | null`——上次成功**写入尺寸（`setBounds`）**后**立即读回**的值
 * + **设锚点时的所在屏 scaleFactor**（后者与锚点同行登记，供 petCalibrateSize() 的 reason 判据句使用）。
 * `null` = 尚无锚点（仅出现在建窗后首次校准前）。
 */
let petSizeBaseline = null;

/**
 * 散步 / 跑步段起点兜底校准的时间戳（§2.3.5-B 第 4 条 / DD-22）：`0` = 从未校准过 ⇒ **首段起点必放行**。
 * 设置点 = 被门控放行的那一次兜底（`petCalibrateSize()` 之后）；建窗时随 `petSizeBaseline = null`
 * **同批置 0**（见 `createPetWindow()`）。无窗口时不必清空——`petCalibrateSize()` 自身短路。
 */
let petWanderSizeCheckedAt = 0;

/** 追加一行几何诊断日志（尽力而为，先例：pet-drag.log / exchange.log）。 */
function petGeomLog(text) {
  try {
    const file = path.join(app.getPath('userData'), 'pet-geometry.log');
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${text}\n`);
  } catch { /* best effort */ }
}

/** 取屏唯一入口：DIP 点 → Display（证据 E3）。不读窗口，ready 之后恒有返回（E7）。 */
function petDisplayOf(point) {
  return screen.getDisplayNearestPoint({ x: point[0], y: point[1] });
}

/** 桌宠窗口中心点（DIP 位置）；无窗口 / 已销毁 → null（E6 依赖项）。 */
function petCenterDIP() {
  if (!petWindow || petWindow.isDestroyed()) return null;
  const [x, y] = petWindow.getPosition();
  return [x + PET_SIZE_DIP.w / 2, y + PET_SIZE_DIP.h / 2];
}

/** 桌宠中心点所在屏；无窗口 / 已销毁 → null。 */
function petCurrentDisplay() {
  const center = petCenterDIP();
  return center ? petDisplayOf(center) : null;
}

/** 某屏上窗口位置的合法区间（workArea 减去窗口尺寸）；入参 null → null（纯函数）。 */
function petWorkAreaBounds(display) {
  if (!display) return null;
  const wa = display.workArea;
  return {
    minX: wa.x,
    maxX: wa.x + wa.width - PET_SIZE_DIP.w,
    minY: wa.y,
    maxY: wa.y + wa.height - PET_SIZE_DIP.h,
  };
}

/**
 * 贴墙（挣脱）判定的基准（设计档 §2.1 E 组 E1 / DD-13 / §2.3.6）：**整个桌面** = 全部显示器
 * bounds（E2）的并集 x 极值；maxX = 并集右沿 − PET_SIZE_DIP.w（窗口沿恰好贴住桌面右缘）。
 * 与「散步边界 = 所在屏工作区」（petWorkAreaBounds）是**两套用途**，不得互换。
 * 纯函数、不读窗口、不取屏；getAllDisplays() 为空 → null（调用方短路，不判贴墙）。
 */
function petDesktopBounds() {
  let minX = Infinity;
  let right = -Infinity;
  for (const display of screen.getAllDisplays()) {
    const b = display.bounds;
    if (b.x < minX) minX = b.x;
    if (b.x + b.width > right) right = b.x + b.width;
  }
  if (minX === Infinity) return null; // 无显示器（实际不可达）⇒ 判定短路
  return { minX, maxX: right - PET_SIZE_DIP.w };
}

/** 「可见」的唯一口径（NFR-5）：中心点落在任一屏 workArea 内。入参 null → false（纯函数）。 */
function petIsVisible(pos) {
  if (!pos) return false;
  const cx = pos[0] + PET_SIZE_DIP.w / 2;
  const cy = pos[1] + PET_SIZE_DIP.h / 2;
  return screen.getAllDisplays().some((display) => {
    const wa = display.workArea;
    return cx >= wa.x && cx < wa.x + wa.width && cy >= wa.y && cy < wa.y + wa.height;
  });
}

/** 按「中心点最近的屏」把不可见位置钳回该屏区间；已可见则恒等返回（幂等、零写入）。 */
function petNearestVisiblePos(pos) {
  if (!pos) return null;
  if (petIsVisible(pos)) return pos;
  const anchor = [pos[0] + PET_SIZE_DIP.w / 2, pos[1] + PET_SIZE_DIP.h / 2];
  const bounds = petWorkAreaBounds(petDisplayOf(anchor));
  if (!bounds) return null;
  return [
    Math.round(Math.min(Math.max(pos[0], bounds.minX), bounds.maxX)),
    Math.round(Math.min(Math.max(pos[1], bounds.minY), bounds.maxY)),
  ];
}

/** 默认落点（DD-6）：主屏工作区右下角，留 PET_DEFAULT_MARGIN_DIP 边距。 */
function petDefaultPos() {
  const bounds = petWorkAreaBounds(screen.getPrimaryDisplay());
  if (!bounds) return [0, 0]; // 防御：screen 不可用时不让调用方拿到 null（实际不可达）
  return [bounds.maxX - PET_DEFAULT_MARGIN_DIP, bounds.maxY - PET_DEFAULT_MARGIN_DIP];
}

/**
 * 启动位置解析（US-13，建窗前调用）：无存档 → null（不带 x/y 建窗，保持现状，TC-18）；
 * 存档可见 → 存档值（TC-10）；存档非法（非整数 / 缺字段）、不可见或存档文件损坏
 * → petDefaultPos()（§2.3.4 后三种情形，TC-12 / TC-19），均记 pos-restore valid=0。
 * 启动位置解析（含其回落改写）只记 1 行（设计档 §3.3 发射规则）。
 */
let petStartPosLogged = false;
function petResolveStartPos() {
  const first = !petStartPosLogged;
  petStartPosLogged = true;
  const saved = settings.petPos;
  const hasArchive = !(saved === null || saved === undefined);
  const pos = (hasArchive && Number.isInteger(saved.x) && Number.isInteger(saved.y))
    ? [saved.x, saved.y] : null;
  if (pos && petIsVisible(pos)) {
    if (PET_GEOM_DEBUG && first) petGeomLog(`pos-restore pos=${petPosText(pos)} valid=1`);
    return pos;
  }
  if (!hasArchive && !settingsFileCorrupt) {
    // 真正无存档（首次运行 / 旧档缺键）⇒ 不带坐标建窗
    if (PET_GEOM_DEBUG && first) petGeomLog('pos-restore pos=n/a valid=0 note=no-archive');
    return null;
  }
  const fallback = petDefaultPos();
  if (PET_GEOM_DEBUG && first) {
    petGeomLog(`pos-restore pos=${petPosText(fallback)} valid=0`);
    petGeomLog(`geom-fix reason=start from=${pos ? petPosText(pos) : 'n/a'} to=${petPosText(fallback)}`);
  }
  return fallback;
}

/**
 * 位置持久化（US-13）：写 settings.petPos（DIP 整数）+ saveSettings()；与上次写入值相同则跳过。
 * 只在离散停泊事件调用（松手 / 散步段末 / 显示器事件 / 找回 / 退出前），不得在 tick 内调用。
 * 无窗口 / 已销毁 → 直接返回（不写盘、不报错）。
 */
function petSavePos() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const [x, y] = petWindow.getPosition();
  const px = Math.round(x);
  const py = Math.round(y);
  const last = settings.petPos;
  if (last && last.x === px && last.y === py) return; // 去重：与前次写入值相同则跳过
  settings.petPos = { x: px, y: py };
  saveSettings();
  if (PET_GEOM_DEBUG) petGeomLog(`pos-save pos=${petPosText([px, py])}`);
}

/** 几何快照 1 行（AC2 / AC7 的取证点）：位置 / 尺寸 / 中心点 / 所在屏 / 工作区 / 可见性。 */
function petGeomSnapshot(tag) {
  if (!PET_GEOM_DEBUG) return;
  const center = petCenterDIP();
  if (!center) return;
  const pos = petWindow.getPosition();
  const display = petDisplayOf(center);
  const wa = display.workArea;
  petGeomLog(
    `geom tag=${tag} pos=${petPosText(pos)} size=${petPosText(petWindow.getSize())}`
    + ` center=${petPosText(center)} display=${display.id} scale=${display.scaleFactor}`
    + ` wa=(${wa.x},${wa.y},${wa.width},${wa.height}) visible=${petIsVisible(pos) ? 1 : 0}`,
  );
}

/**
 * 位置改写记 1 行（仅在真的发生改写时；幂等 no-op 时零行）。
 * 位置型行在 `reason ∈ {drop, straddle}` 时**另带** `display` / `bounds`（§3.3 列义（五））——
 *   这两类正是 petSettlePos 落点解析的产物，S5 / AC2（B03）的骑线部分要判「标称矩形 ⊆ 该屏 bounds」，
 *   故必须给出**目标屏**（该校正的中心点所在屏）与其 `bounds`；`start` / `display` / `summon` 不带。
 */
function petLogFix(reason, from, to) {
  if (!PET_GEOM_DEBUG) return;
  let extra = '';
  if (reason === 'drop' || reason === 'straddle') {
    const display = petDisplayOf([to[0] + PET_SIZE_DIP.w / 2, to[1] + PET_SIZE_DIP.h / 2]);
    if (display) {
      const b = display.bounds;
      extra = ` display=${display.id} bounds=(${b.x},${b.y},${b.width},${b.height})`;
    }
  }
  petGeomLog(`geom-fix reason=${reason} from=${petPosText(from)} to=${petPosText(to)}${extra}`);
}

/** 位置改写：目标与当前不同才写窗口并记 1 行 geom-fix（幂等时零写入零日志）。 */
function petApplyPos(target, reason) {
  if (!target || !petWindow || petWindow.isDestroyed()) return;
  const before = petWindow.getPosition();
  if (before[0] === target[0] && before[1] === target[1]) return;
  petWindow.setPosition(target[0], target[1]);
  petLogFix(reason, before, target);
}

/** 拖动起点刷新「上一 tick 所在屏」缓存（§2.3.3；显示器事件路径已改为置失效标记，见 handleDisplayChange）。 */
function petSyncDragDisplayCache(cursor) {
  if (!petDrag) return;
  const point = cursor || screen.getCursorScreenPoint();
  const display = petDisplayOf([point.x, point.y]);
  petDrag.displayBounds = display ? display.bounds : null;
  petDrag.displayId = display ? display.id : null;
}

/** 纯算术：DIP 点是否落在矩形内（拖动热路径用，无 API 调用）；入参任一为 null → false（纯函数，§2.3.1）。 */
function petPointInRect(point, rect) {
  if (!point || !rect) return false;
  return point.x >= rect.x && point.x < rect.x + rect.width
    && point.y >= rect.y && point.y < rect.y + rect.height;
}

/**
 * 纯算术：**标称矩形**（`pos` + `PET_SIZE_DIP`）是否完全落在矩形 `rect` 内（四角 ⊆）。
 * 右 / 下取**闭**区间（`rect` 为凸集 ⇒ 校验左上 / 右下两角即等价于四角 ⊆）——本判据问的是
 * 「**完全进入**」，与 `petPointInRect` 的**半开**区间用途不同，**不得互换**（§2.3.1）。
 * 入参任一为 null → false（纯函数；无 API 调用）。
 */
function petRectInside(pos, rect) {
  if (!pos || !rect) return false;
  return pos[0] >= rect.x && pos[0] + PET_SIZE_DIP.w <= rect.x + rect.width
    && pos[1] >= rect.y && pos[1] + PET_SIZE_DIP.h <= rect.y + rect.height;
}

/**
 * 混合 DPI 重叠判定（**单一来源**，承 NFR-8 / 设计档 §2.3.1）：标称矩形（`pos` +
 * `PET_SIZE_DIP`）是否与 `display` **以外**的、`scaleFactor` **不同**的屏重叠（区间相交，纯算术）。
 * **唯一消费方 = `petStraddleFix()`（骑线推离）**——第 10 轮起 `petCalibrateSize()` 第 ④ 步改为
 * **不可判定门**（DD-20），不再消费本判定；保留定义 = 单一来源，不得写第二份拷贝。
 * 入参任一为 null → false；每次调用一次 `getAllDisplays()` 遍历（E3）——调用方负责执行时点
 * （只该在写入判定时执行，不在每 tick 推导路径上）。纯函数、不读窗口。
 */
function petMixedScaleOverlap(pos, display) {
  if (!pos || !display || !display.bounds) return false;
  return screen.getAllDisplays().some((d) => {
    if (!d || !d.bounds || d.id === display.id || d.scaleFactor === display.scaleFactor) return false;
    const b = d.bounds;
    return pos[0] < b.x + b.width && pos[0] + PET_SIZE_DIP.w > b.x
      && pos[1] < b.y + b.height && pos[1] + PET_SIZE_DIP.h > b.y;
  });
}

/**
 * 骑线推离（§2.3.7 / 契约 §2.3.1）：标称矩形未完全落在**中心点所在屏** `bounds` 内、**且**与之
 * 重叠的其它屏中存在 `scaleFactor` **不同**者 ⇒ 钳入该屏 `bounds`（最小位移 = 逐轴钳入）；
 * 否则**恒等返回**（同 `scaleFactor` 的骑线无合成差异 ⇒ 不做无由的位置改写）。
 * 混合 DPI 判定 = `petMixedScaleOverlap`（单一来源；第 10 轮起本处为其**唯一消费方**，设计档 §2.3.1）。
 * 入参 null → null；无屏可取（screen 不可用）→ 恒等返回。纯函数、不读窗口。
 */
function petStraddleFix(pos) {
  if (!pos) return null;
  const center = [pos[0] + PET_SIZE_DIP.w / 2, pos[1] + PET_SIZE_DIP.h / 2];
  const display = petDisplayOf(center);
  if (!display) return pos;
  if (petRectInside(pos, display.bounds)) return pos; // 已完全落在该屏 ⇒ 不骑线
  if (!petMixedScaleOverlap(pos, display)) return pos; // 同 scaleFactor 的骑线无合成差异 ⇒ 不推
  const b = display.bounds;
  return [
    Math.round(Math.min(Math.max(pos[0], b.x), b.x + b.width - PET_SIZE_DIP.w)),
    Math.round(Math.min(Math.max(pos[1], b.y), b.y + b.height - PET_SIZE_DIP.h)),
  ];
}

/**
 * 落点解析组合（松手 / 显示器事件 / 建窗后**共用**，§2.3.6 / §2.3.7）：
 *   ① 可见性校正（`petNearestVisiblePos` ⇒ `kind='visible'`）② 骑线推离（`petStraddleFix` ⇒ `kind='straddle'`）。
 * 两条规则合并为**一次**位置写入（调用方当且仅当 `kind === 'none'` 时**零写入**）——
 * 前者成立时后者恒等返回（`workArea ⊆ bounds` ⇒ 标称矩形已在 `bounds` 内），故不会产生第二次跳。
 * 入参 null → `{ pos: null, kind: 'none' }`（调用方必须跳过写入，§2.3.1 短路口径）。纯函数、不读窗口。
 */
function petSettlePos(pos) {
  if (!pos) return { pos: null, kind: 'none' };
  let out = pos;
  let kind = 'none';
  const visible = petNearestVisiblePos(out);
  if (visible && (visible[0] !== out[0] || visible[1] !== out[1])) { out = visible; kind = 'visible'; }
  const straddle = petStraddleFix(out);
  if (straddle && (straddle[0] !== out[0] || straddle[1] !== out[1])) { out = straddle; kind = 'straddle'; }
  return { pos: out, kind };
}

/**
 * 显示器配置变化（E5 三事件，DD-8）：日志 1 行 →（非拖动时）回落可见区 → 尺寸校准 → 落盘。
 * **拖动中**（`petDrag !== null`）：只置缓存失效标记**并清除跨屏尺寸标记**（§2.3.2「拖动中」行 /
 *   §2.3.3 / DD-19）——不校正、不落盘、不做尺寸校准：拖动期间位置由用户手指支配（US-2），且
 *   此处推进 displayId 会吞掉该次跨屏尺寸标记；失效标记由下一次拖动 tick 消费（§2.3.3），校正与落盘
 *   交给松手路径兜底。
 *   清除 `pendingSizeAnchor` 的理由（DD-19）：该标记承载的是「**新屏 bounds**」，屏几何已变 ⇒
 *   陈旧值不可信（可能指向一块已不存在的屏）；清除后由下一次切换检测按新屏重新置。
 * 专注模式（无窗口）时 helper 按短路口径返回 null ⇒ 不写入、不落盘。
 */
function handleDisplayChange(kind, display, metrics) {
  if (PET_GEOM_DEBUG) {
    petGeomLog(
      `display-change kind=${kind} id=${display ? display.id : 'n/a'}`
      + ` scale=${display ? display.scaleFactor : 'n/a'}`
      + ` metrics=${metrics && metrics.length ? metrics.join('|') : 'n/a'}`,
    );
  }
  if (petDrag) {
    petDrag.displayBounds = null;      // 失效标记（此处不取屏；取屏留给下一 tick，§2.3.3）
    petDrag.pendingSizeAnchor = null;  // 同一失效一并清除（DD-19）：屏几何已变 ⇒「新屏 bounds」陈旧不可信
    petGeomSnapshot('display');   // 发射规则③：每个 screen 事件处理完成后 1 行
    return;
  }
  if (petWindow && !petWindow.isDestroyed()) {
    // 落点解析与松手路径**共用** petSettlePos（§2.3.1 / §2.3.2）：拔屏后回落可见区 + 骑线推离，
    //   至多一次位置写入（kind='none' ⇒ 零写入）；缩放比变化后重新锚定尺寸。
    const settled = petSettlePos(petWindow.getPosition());
    if (settled.kind !== 'none') petApplyPos(settled.pos, 'display');
    petCalibrateSize();
    petSavePos();
  }
  petGeomSnapshot('display');
}

/** 找回鲸鱼娘（US-14）：拉回主屏默认落点并落盘；专注模式下入口置灰、此处分外守卫。 */
function summonPet() {
  if (settings.mode === 'focus') return;
  ensurePet();
  if (!petWindow || petWindow.isDestroyed()) return;
  petApplyPos(petDefaultPos(), 'summon');
  petCalibrateSize();
  petSavePos();
}

function createPetWindow(startPos) {
  if (petWindow && !petWindow.isDestroyed()) { petWindow.show(); return; }
  petWindow = new BrowserWindow({
    width: PET_SIZE_DIP.w,
    height: PET_SIZE_DIP.h,
    ...(startPos ? { x: startPos[0], y: startPos[1] } : {}),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'pet-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  petWindow.setAlwaysOnTop(true, 'floating');
  // 点击穿透只在 Windows 上可靠；Linux 上开启会导致桌宠点不到
  if (process.platform === 'win32') {
    petWindow.setIgnoreMouseEvents(true, { forward: true });
  }
  petWindow.loadFile(path.join(__dirname, 'pet.html'));
  petWindow.webContents.on('did-finish-load', () => {
    // 新窗口加载完成立刻推送好感度，避免切换模式后条子显示 0
    broadcastAffinity();
  });
  // 渲染进程异常退出 → 跟随循环终止（设计档 §2.2.6）
  petWindow.webContents.on('render-process-gone', () => petStopDrag('destroyed'));
  petWindow.on('closed', () => {
    petStopDrag('destroyed'); // 窗口关闭路径终止拖动（设计档 §2.2.6）
    petWindow = null;
  });
  // 建窗后一次（§2.3.2 建窗后行 / §2.3.5-C 调用点①）：先做一次**骑线推离**（仅在真的发生推离时
  //   记 geom-fix reason=straddle），再建立 / 重定尺寸锚点——次序与松手行同源（先定位置、再定尺寸锚点）。
  //   第 10 轮起校准的门 = **不可判定门**（§2.3.5-C 第 4 步 / DD-20）⇒ 推离**不再是过门的前提**；
  //   推离本身按 §2.3.7 独立发生（唯一理由 = 不让「一半大一半小」停留）。
  //   该路径本不执行贴墙判定 ⇒ wall 行照常缺席（豁免规则照用，§2.3.6 / §2.3.7）。
  // 新建窗口 ⇒ 锚点作废（§2.3.5-A：「null」仅出现在建窗后首次校准前）——不得复用上一窗口的锚点与其 scaleFactor
  petSizeBaseline = null;
  petWanderSizeCheckedAt = 0; // 散步段起点兜底的门控时间戳同批复位（§2.3.5-B 第 4 条的状态生命周期）
  const bootSettle = petSettlePos(petWindow.getPosition());
  if (bootSettle.kind === 'straddle') petApplyPos(bootSettle.pos, 'straddle');
  petCalibrateSize();
}

/** 桌宠启用但窗口没了时，重建它（解决关窗后桌宠消失）。 */
function ensurePet() {
  if (settings.petEnabled && (!petWindow || petWindow.isDestroyed())) {
    // 重建也走启动位置解析（US-13：模式切回鲸鱼时不回到系统默认落点）
    createPetWindow(petResolveStartPos());
  }
}

function destroyPetWindow() {
  clearPetTimers();
  petWanderDir = null;
  petBounceLeft = 0;
  if (petWindow && !petWindow.isDestroyed()) petWindow.destroy();
  petWindow = null;
  petStopDrag('destroyed'); // 拖动跟随循环一并终止（幂等：clearPetTimers 已停过则此处 no-op）
}

// ---------------------------------------------------------------------------
// Pet drag-follow — 主进程按全局光标绝对定位驱动窗口（设计档 docs/design/PET-DRAG.md §2.2）
//   拖动开始时记抓取偏移 grabOffset = 光标 − 窗口位置（**全程恒定**：跨屏不重锚，§2.3.3 / DD-23）；
//   随后每 PET_DRAG_TICK_MS 读一次全局光标，按「光标 − grabOffset」推导目标位置，同目标去重后才写入（不做工作区钳制）。
// ---------------------------------------------------------------------------
const PET_DRAG_TICK_MS = 8;            // 标称跟随周期 ≈125Hz（JS 定时器粒度只会 ≥8ms，允许 +2ms 偏差）
const PET_DRAG_STALE_MS = 1800;        // 心跳失联阈值（NFR-2 的 2s 上限内留 200ms 余量）
const PET_DRAG_PROBE_MS = 250;         // drag-end 后的静态探针延迟（> NFR-2 的 200ms 上限）
const PET_DRAG_LOG_SAMPLE_TICKS = 16;  // 诊断日志采样频率：每 16 tick（≈128ms）一行
const PET_DRAG_DEBUG = process.env.BIGFISH_PET_DEBUG === '1'; // 日志开关，默认关闭且关闭时零开销

/** 追加一行拖拽诊断日志（尽力而为，先例：exchange.log）。 */
function petDragLog(text) {
  try {
    const file = path.join(app.getPath('userData'), 'pet-drag.log');
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${text}\n`);
  } catch { /* best effort */ }
}

/** 位置元组 → 日志文本 (x,y)。 */
function petPosText(pos) { return `(${pos[0]},${pos[1]})`; }

/**
 * 拖动跟随状态（null = 未在拖动）。
 * 设置点：pet-drag-start（先停旧再建新，幂等）；清空点：petStopDrag（唯一出口，全路径覆盖）。
 * tick = 本次拖动的 tick 计数（仅用于日志采样节流，服务设计档 §3.3 的 16-tick 采样）。
 */
let petDrag = null;

/**
 * 尺寸校准（**唯一尺寸写入路径**，取代原「期望值判等」式尺寸断言，设计档 §2.3.5-A / C）——五步判定次序：
 *   ① 窗口守卫（`!petWindow || isDestroyed()` → 返回）② `getSize()` 1 次 ③ 锚点非空 ∧ 逐分量
 *   `|cur − 锚点| ≤ 容差` → 返回（**零写入零日志**：同屏静止 / 量化误差的常见路径）
 *   ④ **不可判定门**（第 10 轮更名 / 改写，DD-20；原「混合 DPI 门」的**骑线拦截子句已删**——
 *   其前提经 §2.2 Q6 证伪）：`petCurrentDisplay()` 为 null（窗口中心点不在任何屏上）→ 返回
 *   （**推迟**写入——第 ⑤ 步需该屏 `scaleFactor` 入锚点，中心点不在任何屏上时无从取得）。
 *   **这是唯一的推迟条件**：与其它屏（含 `scaleFactor` **不同**者）重叠、与桌面外（无屏覆盖处）重叠 ⇒ **一律过门**（照第 ⑤ 步写入）。
 *   ⑤ **尺寸写入 + 位置保护**（第 13 轮改写，DD-25 / §2.3.5-F；三步 + 一次复核）：Ⅰ 写入前读数 →
 *   Ⅱ **尺寸专用写入** = `setBounds({ width, height })`（**不提供 `x` / `y`**：E8 ⇒ 调用方不传位置，
 *   旧「读位置 → 原样传回」形态已废）→ Ⅲ 写入后读数校验：任一分量之差 **> 1 DIP** ⇒ `setPosition`
 *   **条件回写**一次（值 = 写入前读数）并**复核** ⇒ `note=pos-restored` / `note=pos-unfixed`（复核仍不
 *   一致 ⇒ **判失败**，F15）；回写写的是同一位置值 ⇒ 非位置钳制、不发位置型行（§2.3.5-B 第 5 条）
 *   → Ⅳ `getSize()` 读回 → 更新锚点 → 记 1 行（发射时点 = 写入与复核**之后** ⇒ `pos-after` = 终值）。
 * `reason` 判据句（**唯一形态**，与 §2.3.5-B2 / §3.3 列义（四）同源，纯算术）：
 *   锚点为空 **∨** 当前所在屏 scaleFactor ≠ 设锚点时的 scaleFactor ⇒ `size-anchor`；否则 `size-drift`。
 *   不得写成「锚点为空 ⇒ size-anchor；否则 size-drift」——那会把拖动期跨屏的那一次记成 `size-drift`。
 * 无参（不得加 `reason` 入参）；无窗口 / 已销毁 → 直接返回。
 */
function petCalibrateSize() {
  if (!petWindow || petWindow.isDestroyed()) return;                 // ①
  const [cw, ch] = petWindow.getSize();                              // ②
  if (petSizeBaseline                                                 // ③
    && Math.abs(cw - petSizeBaseline.w) <= PET_SIZE_TOLERANCE_DIP
    && Math.abs(ch - petSizeBaseline.h) <= PET_SIZE_TOLERANCE_DIP) return;
  const display = petCurrentDisplay();                                // ④ 不可判定门（DD-20）
  if (!display) return;                                                // 无屏（中心点不在任何屏上）⇒ 不可判定 ⇒ 推迟
  // ⑤ 位置读数点（**单一定义**）：写入前读数与**回写后复核**共用同一处 `getPosition()` ⇒ 本函数内
  //   `getPosition()` 文本 2 处（§3.3 位置保护判别面的计数面）；回写路径上该读数点执行 2 次。
  const readPos = () => petWindow.getPosition();
  const pos = readPos();                                              // Ⅰ 写入前位置（pos 列 / 回写值共用）
  petWindow.setBounds({ width: PET_SIZE_DIP.w, height: PET_SIZE_DIP.h }); // Ⅱ 尺寸专用写入（不提供 x / y，E8）
  let posAfter = petWindow.getPosition(), note = '';                  // Ⅲ 写入后读数（校验）+ 回写留痕位
  if (Math.abs(posAfter[0] - pos[0]) > 1 || Math.abs(posAfter[1] - pos[1]) > 1) { // 容差 1 DIP（§2.2 位置侧实证 A 组：(−1,−1)）
    petWindow.setPosition(pos[0], pos[1]);                            // 条件回写（唯一一处；值 = 写入前读数）
    posAfter = readPos();                                             // 回写后复核
    note = (Math.abs(posAfter[0] - pos[0]) <= 1 && Math.abs(posAfter[1] - pos[1]) <= 1)
      ? 'pos-restored' : 'pos-unfixed';
  }
  const [aw, ah] = petWindow.getSize();                               // Ⅳ 读回尺寸
  const scale = display.scaleFactor;
  const reason = (!petSizeBaseline || petSizeBaseline.scaleFactor !== scale) ? 'size-anchor' : 'size-drift';
  petSizeBaseline = { w: aw, h: ah, scaleFactor: scale };             // 先更新锚点、后记 1 行（§2.3.5-C 第 ⑤ 步 ④ 的次序）
  if (PET_GEOM_DEBUG) {
    const b = display.bounds;
    petGeomLog(
      `geom-fix reason=${reason} size-from=${petPosText([cw, ch])} size-to=${petPosText([aw, ah])}`
      + ` display=${display.id} scale=${scale} bounds=(${b.x},${b.y},${b.width},${b.height})`
      + ` pos=${petPosText(pos)} pos-after=${petPosText(posAfter)}${note ? ` note=${note}` : ''}`,
    );
  }
}

/** 终止拖动跟随（唯一清空点）：停循环 → 最终位置同步 + 尺寸回拉 → 日志/探针 → 兜底通知渲染层。 */
function petStopDrag(reason) {
  if (!petDrag) return;
  const drag = petDrag;
  petDrag = null;
  clearInterval(drag.timer);
  const alive = !!petWindow && !petWindow.isDestroyed();
  if (alive) {
    // 最终位置同步 + 尺寸回拉（AC8 的取证点＝拖动结束时刻的尺寸）
    const cursor = screen.getCursorScreenPoint();
    const target = [Math.round(cursor.x - drag.grabOffset.x), Math.round(cursor.y - drag.grabOffset.y)];
    if (target[0] !== drag.lastApplied[0] || target[1] !== drag.lastApplied[1]) {
      petWindow.setPosition(target[0], target[1]);
      drag.lastApplied = target;
    }
    petCalibrateSize(); // 终止即校准（§2.3.2 松手行注：与松手路径那一次不重复写——锚点已刷 ⇒ 落在容差内）
  }
  if (PET_DRAG_DEBUG) {
    petDragLog(alive
      ? `drag-end reason=${reason} pos=${petPosText(petWindow.getPosition())} size=${petPosText(petWindow.getSize())}`
      : `drag-end reason=${reason} pos=n/a size=n/a note=window-destroyed probe=skipped`);
    // 静态探针：drag-end 后 250ms（> NFR-2 的 200ms 上限）再采一次，使 AC3 可伪证
    if (alive && reason !== 'destroyed') {
      setTimeout(() => {
        if (!petWindow || petWindow.isDestroyed()) return;
        petDragLog(`probe pos=${petPosText(petWindow.getPosition())} size=${petPosText(petWindow.getSize())}`);
      }, PET_DRAG_PROBE_MS);
    }
  }
  // 兜底终止（看门狗）时通知渲染层清拖动标志
  if (reason === 'stale' && alive) petWindow.webContents.send('pet-drag-cancel');
}

/**
 * 跟随循环的一个 tick：看门狗 → 读全局光标 → 显示器切换检测（US-12） → 推导目标
 *   → 同目标去重写入 → 跨屏尺寸标记（中心点进入新屏的首个 tick 校准一次）→ 采样日志。
 *   切换检测**不重锚抓取偏移**（`grabOffset` 全程恒定，§2.3.3 / DD-23）；热路径无新增 API 调用：
 *   切换检测与标记的消费判据均为纯算术比较。
 */
function petDragTick() {
  if (!petDrag) return;
  if (!petWindow || petWindow.isDestroyed()) { petStopDrag('destroyed'); return; }
  const drag = petDrag;
  if (Date.now() - drag.lastMessageAt > PET_DRAG_STALE_MS) { petStopDrag('stale'); return; }
  const cursor = screen.getCursorScreenPoint();
  // 显示器切换检测（§2.3.3）：判定 = 「缓存失效 ∨ 光标越出缓存矩形 ⇒ 取屏一次」——
  //   缓存失效（displayBounds 为 null，来自拖动起点或拖动中收到的 E5 事件）必须在此消费；
  //   同屏内该判定只是一次纯算术矩形包含比较（零 API 调用，不触碰 NFR-1 开销判据）。
  if (!drag.displayBounds || !petPointInRect(cursor, drag.displayBounds)) {
    const next = petDisplayOf([cursor.x, cursor.y]);
    drag.displayBounds = next ? next.bounds : null;
    if (next && next.id !== drag.displayId) {
      // 切换检测（身份比较，§2.3.3）：**不重锚抓取偏移**（第 12 轮删除，DD-23）——位置 API 的坐标空间
      //   与所在屏 scaleFactor 无关且可逆（§2.2 R6）⇒ 跨屏无需换参考系；原重锚公式
      //   `grabOffset ← 光标 − getPosition()` 会把「光标自上一 tick 起的位移」吃进抓取偏移（R7）
      //   ⇒ 每跨一次屏偏一次、往返不可逆（= 用户报告症状）。
      const fromId = drag.displayId;
      drag.displayId = next.id;
      if (PET_GEOM_DEBUG) {
        petGeomLog(
          `geom-switch from=${fromId} display=${next.id} scale=${next.scaleFactor}`
          + ` size=${petPosText(petWindow.getSize())} pos=${petPosText(petWindow.getPosition())}`,
        );
      }
      // 跨屏的尺寸标记（§2.3.3 简化一 / §2.3.5-B2）：**无条件**置标记——不再比较 `scaleFactor`
      //   （原「上一 tick 所在屏 scaleFactor」字段与其刷新已删）：同 `scaleFactor` 的跨屏由校准第 ③ 步
      //   的容差自锁吸收（R1 的比值 = 1 ⇒ 读回不漂移 ⇒ 零写入零日志）；光标折返时按当前切换结果重算。
      drag.pendingSizeAnchor = { bounds: next.bounds };
    }
    // 同 id / 取屏失败（next 为 null）：§2.3.3「相同 ⇒ 仅刷新缓存」——缓存即上面的 displayBounds
  }
  const target = [Math.round(cursor.x - drag.grabOffset.x), Math.round(cursor.y - drag.grabOffset.y)];
  let wrote = 0;
  if (target[0] !== drag.lastApplied[0] || target[1] !== drag.lastApplied[1]) {  // 同目标去重
    petWindow.setPosition(target[0], target[1]);
    drag.lastApplied = target;
    wrote = 1;
  }
  // 跨屏尺寸标记的消费判据（§2.3.3 简化二 / §2.1 F5 ②）：每 tick 用**纯算术**判「**窗口中心点**
  //   进入新屏 `bounds`」（中心点 = target + PET_SIZE_DIP / 2，常量偏移；petPointInRect 取半开区间），
  //   成立的**首个** tick 校准一次并清标记。判据读本 tick 已推导的 target（写入之后调用，使校准
  //   读到的即目标位置）；无 getSize / 无取屏调用——每跨屏事件至多一次尺寸写入、同屏内全程零次。
  if (drag.pendingSizeAnchor) {
    const center = { x: target[0] + PET_SIZE_DIP.w / 2, y: target[1] + PET_SIZE_DIP.h / 2 };
    if (petPointInRect(center, drag.pendingSizeAnchor.bounds)) {
      drag.pendingSizeAnchor = null;
      petCalibrateSize();
    }
  }
  drag.tick++;
  if (PET_DRAG_DEBUG && drag.tick % PET_DRAG_LOG_SAMPLE_TICKS === 0) {
    const applied = petWindow.getPosition();
    const delta = [target[0] - applied[0], target[1] - applied[1]];
    const off = [Math.round(cursor.x - (applied[0] + drag.grabOffset.x)), Math.round(cursor.y - (applied[1] + drag.grabOffset.y))];
    petDragLog(`tick cursor=${petPosText([cursor.x, cursor.y])} target=${petPosText(target)} applied=${petPosText(applied)} delta=${petPosText(delta)} off=${petPosText(off)} wrote=${wrote} size=${petPosText(petWindow.getSize())}`);
  }
}

// ---------------------------------------------------------------------------
// Pet state machine (idle / eat / sleep / walk / run + happy/read/scared/starry)
// ---------------------------------------------------------------------------
let petState = 'idle';
let wanderTimer = null;
let sleepTimer = null;
let eatTimer = null;
let moveTimer = null;
let chatterTimer = null;
let petWanderDir = null;   // null=未在散步；'left'/'right' 当前移动方向
let petBounceLeft = 0;     // 撞墙后还剩几次折返
let petForceRun = false;   // 脱手逃跑等场景强制跑步

function clearPetTimers() {
  clearTimeout(wanderTimer);
  clearTimeout(sleepTimer);
  clearTimeout(eatTimer);
  clearTimeout(chatterTimer);
  clearInterval(moveTimer);
  wanderTimer = sleepTimer = eatTimer = moveTimer = chatterTimer = null;
  petStopDrag('destroyed'); // 拖动跟随循环同样是桌宠定时器，一并终止（NFR-2：异常路径也清空）
}

function setPetState(state) {
  petState = state;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet-state', state);
  }
}

function scheduleSleep() {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    if (petState === 'idle') setPetState('sleep');
  }, 120 * 1000); // 2 min idle -> sleep
}

function wakePet() {
  clearTimeout(sleepTimer);
  if (petState === 'sleep') setPetState('idle');
  scheduleSleep();
}

function scheduleWander() {
  clearTimeout(wanderTimer);
  wanderTimer = setTimeout(() => {
    if (petState === 'idle') doWander();
    else scheduleWander();
  }, 15000 + Math.random() * 20000);
}

/**
 * 散步/跑步：随机走一段距离就停下休息（不必走完全程）。
 * 只有中途碰到墙壁才折返，折返 petBounceLeft 次后歇着。
 * 20% 概率跑步（更快更远）；脱手逃跑（petForceRun）强制跑步。
 * 边界 = 桌宠当前所在屏的工作区（US-9，不跨屏）；y 写前归位（根因 2）。
 */
function doWander() {
  // 拖动态守卫：任何来源的散步都不得在拖动中移动窗口（根因 D）
  if (!petWindow || petWindow.isDestroyed() || petState !== 'idle' || petDrag !== null) {
    scheduleWander();
    return;
  }
  // 段起点算一次边界（所在屏口径），段内不重算
  const bounds = petWorkAreaBounds(petCurrentDisplay());
  if (!bounds) {
    scheduleWander();
    return;
  }
  if (!petWanderDir) petWanderDir = Math.random() < 0.5 ? 'left' : 'right';
  if (petBounceLeft <= 0) petBounceLeft = 1 + Math.floor(Math.random() * 2); // 撞墙后折返 1~2 次
  const [x, y] = petWindow.getPosition();
  // y 归位：写入前钳入所在屏工作区，消除「纵向失踪」（根因 2 / TC-9）
  const targetY = Math.round(Math.min(Math.max(y, bounds.minY), bounds.maxY));
  const run = petForceRun || Math.random() < 0.2;
  petForceRun = false;
  // 随机走一段（不一定到墙）
  const distance = run ? 200 + Math.random() * 300 : 80 + Math.random() * 200;
  let targetX = petWanderDir === 'left' ? x - distance : x + distance;
  const hitWall = petWanderDir === 'left' ? targetX <= bounds.minX : targetX >= bounds.maxX;
  if (hitWall) {
    // 撞墙：走到墙为止，之后折返（墙 = 所在屏工作区边缘，US-9）
    targetX = petWanderDir === 'left' ? bounds.minX : bounds.maxX;
  }
  const dist = Math.abs(targetX - x);
  if (dist < 4) {
    // 已经在墙边且方向朝墙 → 直接折返
    petWanderDir = petWanderDir === 'left' ? 'right' : 'left';
    setPetState('idle');
    doWander();
    return;
  }
  const speed = run ? 0.34 : 0.17; // px/ms
  const duration = Math.max(250, dist / speed);
  setPetState((run ? 'run-' : 'walk-') + petWanderDir);
  const startX = x;
  const startTime = Date.now();
  let segStartLogged = false;
  // 段起点低频兜底校准（§2.3.5-B 第 4 条 / DD-22 / H-3）：本时点在 setInterval(moveTimer, 16) **之前**
  //   ⇒ 运动尚未开始、窗口静止 ⇒ 读回不进「移动中的噪声带」（§2.3.5-A 第 5 点），
  //   且即使触发 setBounds 也不与任何移动循环争窗口（本缺陷的机制即「setBounds 同时设位置与尺寸」）。
  //   频率上界 = ≤1 次 / PET_WANDER_SIZE_CHECK_MS（30 s；现状逐帧调用约 3750 次/分 ⇒ 本轮删除）。
  //   禁止形态（§2.3.5-B 第 4 条）：不得恢复逐帧调用；不得改为「每 N 个 tick」（= 段内、运动在途）；不得挪到段末。
  if (Date.now() - petWanderSizeCheckedAt >= PET_WANDER_SIZE_CHECK_MS) {
    petCalibrateSize();
    petWanderSizeCheckedAt = Date.now();
  }
  clearInterval(moveTimer);
  moveTimer = setInterval(() => {
    const t = Math.min(1, (Date.now() - startTime) / duration);
    const nx = Math.round(startX + (targetX - startX) * t);
    petWindow.setPosition(nx, targetY); // y = 归位后的值（写入前钳制，根因 2）
    // 段起点（y 归位后）1 行 geom——AC7 取证点
    if (!segStartLogged) { segStartLogged = true; petGeomSnapshot('seg-start'); }
    // 运动在途（本回调内）**零尺寸判定、零尺寸写入**（§2.3.5-B 第 4 条 / DD-22）：原逐帧的尺寸校准
    //   调用已删——移动中的读回噪声带（+0…+34 DIP）跨过容差 8 ⇒ 每帧判「漂移」⇒ 每帧尺寸写入
    //   （同时设位置与尺寸）⇒ 与移动循环互相打断。本路径唯一的校准时点 = 段起点兜底（见上方门控块）。
    if (t >= 1) {
      clearInterval(moveTimer);
      moveTimer = null;
      // 段末 1 行 geom（AC7 取证点）+ 离散停泊事件落盘（US-13，不在 tick 内写盘）
      petGeomSnapshot('seg-end');
      petSavePos();
      if (hitWall) {
        // 撞墙 → 折返（1~2 次后停下休息）
        petBounceLeft--;
        if (petBounceLeft > 0) {
          petWanderDir = petWanderDir === 'left' ? 'right' : 'left';
          setPetState('idle');
          doWander();
        } else {
          petWanderDir = null;
          petBounceLeft = 0;
          setPetState('idle');
          scheduleWander();
        }
      } else {
        // 正常走完一段 → 停下休息
        petWanderDir = null;
        petBounceLeft = 0;
        setPetState('idle');
        scheduleWander();
      }
    }
  }, 16);
}

// ---------------------------------------------------------------------------
// 好感度 & 兑换系统
//   好感度：按真实消耗的 token（uncachedInput + output）累积，
//           每 AFFINITY_RATE 个 token 得 1 点，按等级阈值升级。
//   兑换屋：右键鲸鱼娘打开，token → 💴，💴 买食物喂食（喂食加好感）。
// ---------------------------------------------------------------------------
const AFFINITY_RATE = 500;       // 每消耗 500 token = 1 好感点（门槛更低，条动得快）
const EXCHANGE_RATE = 1000;      // 1000 token 兑换 1 💴（门槛更低）
const LEVEL_THRESHOLDS = [0, 20, 50, 100, 180, 300, 450, 650, 900, 1200];
const FOODS = [
  { id: 'fish', name: '小鱼干', price: 1, emoji: '🐟', bonusTokens: 2000, msg: '小鱼干真香~ 好感+4' },
  { id: 'cake', name: '小蛋糕', price: 2, emoji: '🍰', bonusTokens: 4000, msg: '蛋糕好好吃~ 好感+8' },
  { id: 'milk', name: '珍珠奶茶', price: 3, emoji: '🧋', bonusTokens: 6000, msg: '奶茶赛高~ 好感+12' },
];

function affinityFile() {
  return path.join(app.getPath('userData'), 'affinity.json');
}
// 三池分离，杜绝"买食物→赚token→再换钱"的印钞机漏洞：
//   usage  终身消耗的 token（只来自真实 AI 使用，只增不减）→ 决定好感度
//   wallet 可兑换余额（来自使用，兑换时花掉）→ 换 💴
//   bonus  喂食获得的好感点（单向加成，不产生可兑换 token）
let affinity = { usage: 0, wallet: 0, bonus: 0, currency: 0, food: {} };
function loadAffinity() {
  try {
    const saved = JSON.parse(fs.readFileSync(affinityFile(), 'utf8'));
    affinity = {
      usage: Number(saved.usage) || Number(saved.tokens) || 0,
      wallet: Number(saved.wallet) || Number(saved.tokens) || 0,
      bonus: Number(saved.bonus) || 0,
      currency: Number(saved.currency) || 0,
      food: saved.food || {},
    };
  } catch { /* 首次使用 */ }
}
function saveAffinity() {
  try {
    fs.mkdirSync(path.dirname(affinityFile()), { recursive: true });
    fs.writeFileSync(affinityFile(), JSON.stringify(affinity, null, 2), 'utf8');
  } catch (err) { console.error('[bigfish] affinity save failed:', err); }
}

/** 从 dsh 会话缓存汇总已消耗 token（真实信号）。读不到返回 null。 */
function sumSessionTokens() {
  try {
    const file = path.join(dshHome(), 'storages', 'session_projcache.json');
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const sessions = (j.tables && j.tables.sessions) || {};
    let sum = 0;
    for (const key of Object.keys(sessions)) {
      const rows = (sessions[key].rows) || {};
      const tu = rows.tokenUsage && rows.tokenUsage.val;
      if (tu && tu.totals) {
        sum += (tu.totals.uncachedInputTokens || 0) + (tu.totals.outputTokens || 0);
      }
    }
    return sum;
  } catch { return null; }
}
let lastTokenSum = null;
let affinityWatcherTimer = null;

function affinityView() {
  // 好感 = 终身使用换算 + 喂食加成（只增不减，兑换不影响好感）
  const points = Math.floor(affinity.usage / AFFINITY_RATE) + affinity.bonus;
  let level = 1, curThr = LEVEL_THRESHOLDS[0], nextThr = LEVEL_THRESHOLDS[1];
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (points >= LEVEL_THRESHOLDS[i]) { level = i + 1; curThr = LEVEL_THRESHOLDS[i]; nextThr = LEVEL_THRESHOLDS[i + 1]; }
  }
  const progress = nextThr === undefined ? 1 : Math.min(1, (points - curThr) / (nextThr - curThr));
  return {
    level,
    points,
    pointsToNext: nextThr === undefined ? points : nextThr,
    progress,
    tokens: affinity.wallet,      // 可兑换余额
    usage: affinity.usage,        // 终身消耗
    bonus: affinity.bonus,
    currency: affinity.currency,
    food: { ...affinity.food },
    foods: FOODS.map((f) => ({ ...f, bonusPoints: Math.round(f.bonusTokens / AFFINITY_RATE) })),
    exchangeRate: EXCHANGE_RATE,
    affinityRate: AFFINITY_RATE,
  };
}
function broadcastAffinity() {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet-affinity', affinityView());
  }
}

function startAffinityWatcher() {
  stopAffinityWatcher();
  const sum = sumSessionTokens();
  // 首次使用：把历史消耗一并计入（好感条立刻有进度，之后只累计新增）
  if (affinity.usage === 0 && sum !== null && sum > 0) {
    affinity.usage = sum;
    affinity.wallet = sum;
    saveAffinity();
  }
  lastTokenSum = sum; // 基线：之后只统计新增消耗
  affinityWatcherTimer = setInterval(() => {
    const s2 = sumSessionTokens();
    if (s2 !== null && lastTokenSum !== null) {
      if (s2 > lastTokenSum) {
        const delta = s2 - lastTokenSum;
        lastTokenSum = s2;
        affinity.usage += delta;  // 终身消耗（只增不减）
        affinity.wallet += delta; // 可兑换余额
        saveAffinity();
        // 每攒够 1 点好感才提示（避免刷屏）
        if (Math.floor(affinity.usage / AFFINITY_RATE) > Math.floor((affinity.usage - delta) / AFFINITY_RATE)) {
          const v = affinityView();
          petSay(`好感 +1，现在是 Lv.${v.level} 啦~`);
        }
      } else if (s2 < lastTokenSum) {
        lastTokenSum = s2; // 会话被清理/重建，重新基线
      }
    }
    // 每次都广播（桌宠窗口重建后也能拿到最新值）
    broadcastAffinity();
  }, 10000);
}
function stopAffinityWatcher() {
  if (affinityWatcherTimer) { clearInterval(affinityWatcherTimer); affinityWatcherTimer = null; }
}

/** 右键鲸鱼娘：在它旁边打开兑换窗口。 */
let exchangeWindow = null;
function openExchangeWindow() {
  if (exchangeWindow && !exchangeWindow.isDestroyed()) {
    exchangeWindow.show();
    exchangeWindow.focus();
    return;
  }
  exchangeWindow = new BrowserWindow({
    width: 320,
    height: 500,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '鲸鱼娘兑换屋',
    autoHideMenuBar: true,
    backgroundColor: '#14161c',
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'exchange-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 放在鲸鱼娘右侧（放不下就放左边）
  if (petWindow && !petWindow.isDestroyed()) {
    const [px, py] = petWindow.getPosition();
    const [pw] = petWindow.getSize();
    const { workAreaSize } = screen.getPrimaryDisplay();
    let x = px + pw + 6;
    if (x + 320 > workAreaSize.width) x = Math.max(0, px - 326);
    exchangeWindow.setPosition(Math.round(x), Math.round(Math.max(0, Math.min(py, workAreaSize.height - 500))));
  }
  // 缓存爆破：防止 Chromium file:// 缓存加载旧版 exchange.html 导致元素缺失
  const cacheBust = Date.now();
  exchangeWindow.loadFile(path.join(__dirname, 'exchange.html'), { query: { v: cacheBust } });
  exchangeWindow.webContents.on('console-message', (_e, level, message) => {
    try {
      const file = path.join(app.getPath('userData'), 'exchange.log');
      fs.appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${message}\n`);
    } catch { /* best effort */ }
  });
  exchangeWindow.on('closed', () => { exchangeWindow = null; });
}

/** 重置所有数据（删掉 .dsh 目录），用于解决"配置改坏/黑屏/无法回复"等问题。 */
async function resetAllData() {
  const home = dshHome();
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: APP_NAME,
    message: '确定要重置所有数据吗？',
    detail: [
      '什么时候该重置：程序黑屏/白屏、界面打不开、一直"回复失败"、改坏了配置、或更换账号想清空所有内容。',
      '',
      '会删除什么：API Key、所有会话记录、预设、设置等（相当于恢复出厂设置）。',
      '',
      '风险提示：删除后不可恢复，需要重新填写 API Key 才能继续使用。',
    ].join('\n'),
    buttons: ['重置并退出', '取消'],
    defaultId: 1,
    cancelId: 1,
  });
  if (choice !== 0) return;
  try {
    stopDsh();
    await new Promise((r) => setTimeout(r, 1500));
    fs.rmSync(home, { recursive: true, force: true });
    notify(APP_NAME, '数据已重置，即将退出，请重新打开');
  } catch (err) {
    console.error('[bigfish] 重置数据失败:', err);
    dialog.showErrorBox(APP_NAME, '重置失败，请手动删除 ' + home);
  }
  quitting = true;
  app.quit();
}

/** 重置配置但保留会话和工程（用于"AI 删插件改坏配置导致后端超时"等场景）。 */
async function resetConfigKeepSessions() {
  const home = dshHome();
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: APP_NAME,
    message: '确定要重置插件配置吗？（保留 API Key 和会话）',
    detail: [
      '什么时候用：让 AI 装/删插件后进不去、启动一直超时。',
      '',
      '会删除什么：插件配置（profiles 目录）。',
      '',
      '会保留什么：API Key、设置、会话记录、工程/工作区数据。',
    ].join('\n'),
    buttons: ['重置并退出', '取消'],
    defaultId: 1,
    cancelId: 1,
  });
  if (choice !== 0) return;
  try {
    stopDsh();
    await new Promise((r) => setTimeout(r, 1500));
    fs.rmSync(path.join(home, 'profiles'), { recursive: true, force: true });
    notify(APP_NAME, '插件配置已重置，API Key、会话和工程已保留。即将退出，请重新打开');
  } catch (err) {
    console.error('[bigfish] 重置配置失败:', err);
    dialog.showErrorBox(APP_NAME, '重置失败，请手动删除 ' + path.join(home, 'profiles'));
  }
  quitting = true;
  app.quit();
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function createTray() {
  const icon = trayIconPath();
  if (icon) {
    tray = new Tray(nativeImage.createFromPath(icon));
  } else {
    tray = new Tray(nativeImage.createEmpty());
  }
  tray.setToolTip(APP_NAME);
  tray.on('click', () => toggleMainWindow());
  rebuildTrayMenu();
}

// ---------------------------------------------------------------------------
// 背景图（默认 + 用户自定义）
// ---------------------------------------------------------------------------
let bgCssKey = null;

function backgroundImagePath() {
  const custom = path.join(app.getPath('userData'), 'custom-background.jpg');
  return fs.existsSync(custom) ? custom : path.join(__dirname, 'assets', 'background.jpg');
}

/** 往主窗口注入背景样式（半透明背景图，内容在上层可读）。专注模式注入纯色。 */
function applyBackground() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (bgCssKey) {
    try { mainWindow.webContents.removeInsertedCSS(bgCssKey); } catch { /* ignore */ }
    bgCssKey = null;
  }
  let css;
  if (settings.mode === 'focus') {
    // 专注模式：纯色背景（恢复 dsh 默认主题）
    css = `html { background-image: none !important; }`;
  } else {
    let dataUrl = '';
    try {
      const b64 = fs.readFileSync(backgroundImagePath()).toString('base64');
      dataUrl = `data:image/jpeg;base64,${b64}`;
    } catch { /* 读取失败则用纯色 */ }
    css = `
    html {
      background-image: url('${dataUrl}') !important;
      background-size: cover !important;
      background-position: center !important;
      background-repeat: no-repeat !important;
    }
    /* 深色模式 */
    body[data-ds-dark-theme] { background-color: rgba(21, 21, 23, 0.72) !important; }
    body[data-ds-dark-theme] [class*="_sidebarCol"] { background-color: rgba(27, 27, 28, 0.80) !important; }
    body[data-ds-dark-theme] [class*="_frame"],
    body[data-ds-dark-theme] [class*="_root"],
    body[data-ds-dark-theme] [class*="_centerCol"],
    body[data-ds-dark-theme] [class*="_scrollBody"] { background-color: transparent !important; }
    /* 浅色模式（遮罩更透，浅色背景图才能透出来） */
    body:not([data-ds-dark-theme]) { background-color: rgba(255, 255, 255, 0.50) !important; }
    body:not([data-ds-dark-theme]) [class*="_sidebarCol"] { background-color: rgba(244, 244, 246, 0.65) !important; }
    body:not([data-ds-dark-theme]) [class*="_frame"],
    body:not([data-ds-dark-theme]) [class*="_root"],
    body:not([data-ds-dark-theme]) [class*="_centerCol"],
    body:not([data-ds-dark-theme]) [class*="_scrollBody"] { background-color: transparent !important; }
  `;
  }
  mainWindow.webContents.insertCSS(css).then((key) => { bgCssKey = key; }).catch(() => {});
}

/** 切换模式：whale=鲸鱼模式（桌宠+背景图）| focus=专注模式（无桌宠、纯色背景）。 */
function setMode(mode) {
  const m = mode === 'focus' ? 'focus' : 'whale';
  settings.mode = m;
  settings.petEnabled = m === 'whale';
  settings.modeChosen = true;
  settings.lastModeVersion = app.getVersion();
  saveSettings();
  if (m === 'focus') {
    destroyPetWindow();
  } else {
    ensurePet();
  }
  applyBackground();
  rebuildTrayMenu();
}

/** 首次安装 / 更新后弹窗让用户选择模式。 */
function maybeShowModeDialog() {
  const firstRun = !settings.modeChosen;
  const updated = settings.lastModeVersion !== app.getVersion();
  if (!firstRun && !updated) return;
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    title: APP_NAME,
    message: '选择你的 Bigfish 模式',
    detail: [
      '🐳 鲸鱼模式：桌宠鲸鱼娘陪伴，带背景图（默认）。',
      '🧘 专注模式：隐藏桌宠，恢复纯色背景，适合专心工作学习。',
      '',
      '之后可以在右下角托盘 → 模式 随时切换。',
    ].join('\n'),
    buttons: ['鲸鱼模式', '专注模式'],
    defaultId: 0,
    cancelId: 0,
  });
  setMode(choice === 0 ? 'whale' : 'focus');
}

/** 让用户选一张图作为自定义背景。 */
async function chooseBackground() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择背景图片',
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return;
  try {
    fs.copyFileSync(result.filePaths[0], path.join(app.getPath('userData'), 'custom-background.jpg'));
    applyBackground();
    notify(APP_NAME, '背景已更换');
  } catch (err) {
    console.error('[bigfish] 更换背景失败:', err);
  }
}

/** 恢复默认背景。 */
function resetBackground() {
  try { fs.unlinkSync(path.join(app.getPath('userData'), 'custom-background.jpg')); } catch { /* 没有自定义背景 */ }
  applyBackground();
  notify(APP_NAME, '已恢复默认背景');
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏 Bigfish', click: () => toggleMainWindow() },
    { label: '新手向导（设置 API Key）', click: () => createWelcomeWindow() },
    { label: '插件市场', click: () => createMarketWindow() },
    { label: '鲸鱼娘兑换屋', click: () => openExchangeWindow() },
    // 找回鲸鱼娘（US-14）：专注模式下桌宠窗口不存在 ⇒ 置灰不可用
    { label: '找回鲸鱼娘', enabled: settings.mode !== 'focus', click: () => summonPet() },
    { type: 'separator' },
    // 更新分组（U-7：首条分隔线后，「更换背景」组之前）
    { label: '检查更新', click: () => { manualCheckUpdates(); } },
    { label: '自动检查更新', type: 'checkbox', checked: settings.autoCheckUpdates, click: (item) => setAutoCheckUpdates(item.checked) },
    { type: 'separator' },
    { label: '更换背景', click: () => chooseBackground() },
    { label: '恢复默认背景', click: () => resetBackground() },
    { type: 'separator' },
    {
      label: '模式',
      submenu: [
        { label: '🐳 鲸鱼模式（桌宠 + 背景图）', type: 'radio', checked: settings.mode !== 'focus', click: () => setMode('whale') },
        { label: '🧘 专注模式（隐藏桌宠 + 纯色背景）', type: 'radio', checked: settings.mode === 'focus', click: () => setMode('focus') },
      ],
    },
    { label: '任务完成时通知', type: 'checkbox', checked: settings.notifyOnComplete, click: (item) => setNotify(item.checked) },
    { label: '开机自启', type: 'checkbox', checked: settings.launchAtLogin, click: (item) => setAutoStart(item.checked) },
    { type: 'separator' },
    {
      label: 'Windows 右键菜单',
      submenu: [
        { label: '安装「用 Bigfish 打开」', click: () => installContextMenu() },
        { label: '卸载', click: () => uninstallContextMenu() },
      ],
    },
    { type: 'separator' },
    { label: '重置插件配置（保留 API Key 和会话）', click: () => resetConfigKeepSessions() },
    { label: '彻底恢复出厂（清空所有）', click: () => resetAllData() },
    { label: '卸载 Bigfish', click: () => uninstall() },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function setNotify(enabled) {
  settings.notifyOnComplete = enabled;
  saveSettings();
  if (!enabled) { lastBusyAt = 0; notifiedForCycle = false; }
}

function setAutoStart(enabled) {
  settings.launchAtLogin = enabled;
  saveSettings();
  app.setLoginItemSettings({ openAtLogin: enabled });
}

function setAutoCheckUpdates(enabled) {
  settings.autoCheckUpdates = enabled;
  saveSettings();
  rebuildTrayMenu();
}

// ---------------------------------------------------------------------------
// Global shortcut
// ---------------------------------------------------------------------------
function registerShortcuts() {
  const accel = 'CommandOrControl+Shift+D';
  try {
    globalShortcut.register(accel, () => toggleMainWindow());
    console.log(`[bigfish] global shortcut registered: ${accel}`);
  } catch (err) {
    console.error('[bigfish] shortcut register failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Windows "Open with Bigfish" context menu
// ---------------------------------------------------------------------------
function runReg(args) {
  return new Promise((resolve) => {
    const child = spawn('reg', args, { stdio: 'ignore', windowsHide: true });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}

async function installContextMenu() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ type: 'info', title: APP_NAME, message: '右键菜单只在安装后的版本可用', detail: '请安装打包好的 Bigfish 后再设置右键菜单。' });
    return;
  }
  const exe = process.execPath;
  const cmd = `"${exe}" --open "%1"`;
  const roots = ['HKCU\\Software\\Classes\\*\\shell\\Bigfish', 'HKCU\\Software\\Classes\\Directory\\shell\\Bigfish'];
  for (const r of roots) {
    await runReg(['add', r, '/ve', '/t', 'REG_SZ', '/d', '用 Bigfish 打开', '/f']);
    await runReg(['add', `${r}\\command`, '/ve', '/t', 'REG_SZ', '/d', cmd, '/f']);
    await runReg(['add', r, '/v', 'Icon', '/t', 'REG_SZ', '/d', `${exe},0`, '/f']);
  }
  notify(APP_NAME, '已添加右键「用 Bigfish 打开」');
}

async function uninstallContextMenu() {
  await runReg(['delete', 'HKCU\\Software\\Classes\\*\\shell\\Bigfish', '/f']);
  await runReg(['delete', 'HKCU\\Software\\Classes\\Directory\\shell\\Bigfish', '/f']);
  notify(APP_NAME, '已移除右键菜单');
}

// ---------------------------------------------------------------------------
// --open <path> handling
// ---------------------------------------------------------------------------
function handleOpenArg(argv) {
  const i = argv.indexOf('--open');
  if (i === -1 || !argv[i + 1]) return;
  const target = argv[i + 1];
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  notify(APP_NAME, `已打开: ${target}`);
}

// ---------------------------------------------------------------------------
// Plugin manager — install/remove DSH plugins in the web profile
// (~/.dsh/profiles/web) using the bundled pnpm, then restart the backend.
// ---------------------------------------------------------------------------
const PLUGIN_REGISTRY_URL = 'https://awesome-dsh-plugin.com/plugins.json';
const PLUGIN_REGISTRY_FALLBACK = 'https://gitee.com/ludonghuai/big-fish/raw/main/plugins.json';
const NPM_REGISTRY = 'https://registry.npmmirror.com/';

function profileDir() {
  return path.join(dshHome(), 'profiles', 'web');
}
function bundledPluginsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bundled-plugins')
    : path.join(app.getAppPath(), 'bundled-plugins');
}
function bundledPnpmPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'node-runtime', 'pnpm', 'pnpm.mjs')
    : path.join(app.getAppPath(), 'node-runtime', 'pnpm', 'pnpm.mjs');
}
function runtimeNodeExe() {
  if (app.isPackaged) {
    const nodeBin = process.platform === 'win32' ? 'node.exe' : 'node';
    return path.join(process.resourcesPath, 'node-runtime', nodeBin);
  }
  return process.env.DSH_NODE || 'node';
}

function readProfileManifest() {
  const file = path.join(profileDir(), 'package.json');
  // 瞬时文件锁/并发写时重试，避免误判为"不存在"
  for (let i = 0; i < 3; i++) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (i === 2) {
        console.warn('[bigfish] readProfileManifest failed:', err && err.message);
        return null;
      }
      try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120); } catch { /* ignore */ }
    }
  }
  return null;
}
function writeProfileManifest(manifest) {
  const file = path.join(profileDir(), 'package.json');
  fs.mkdirSync(profileDir(), { recursive: true });
  // 原子写：先写临时文件再改名，杜绝读者读到半截 JSON
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}
function profileBundles() {
  const m = readProfileManifest();
  // 注意：dsh.profile 是对象 { bundles: [...] }，不是数组（勿用 Array.isArray(m.dsh.profile)）
  if (!m || !m.dsh || !m.dsh.profile || !Array.isArray(m.dsh.profile.bundles)) return [];
  return m.dsh.profile.bundles;
}
function addBundle(pkgName) {
  if (!isPlainPackageName(pkgName)) {
    console.warn('[bigfish] 拒绝把非包名写入 bundles:', pkgName);
    return false;
  }
  const m = readProfileManifest();
  // 防呆：读不到 manifest 直接抛错，绝不拿默认空表覆盖（会清空注册表）
  if (!m) throw new Error('无法读取 profile manifest，已中止（防止清空插件注册表）');
  if (!m.dsh) m.dsh = { profile: { bundles: [] } };
  if (!m.dsh.profile) m.dsh.profile = { bundles: [] };
  if (!Array.isArray(m.dsh.profile.bundles)) m.dsh.profile.bundles = [];
  if (!m.dsh.profile.bundles.includes(pkgName)) m.dsh.profile.bundles.push(pkgName);
  writeProfileManifest(m);
  return true;
}
function removeBundle(pkgName) {
  const m = readProfileManifest();
  if (!m || !m.dsh || !m.dsh.profile || !Array.isArray(m.dsh.profile.bundles)) return;
  m.dsh.profile.bundles = m.dsh.profile.bundles.filter((b) => b !== pkgName);
  writeProfileManifest(m);
}
/** 是否像合法的 npm 包名（拒绝 github:/git+/link: 等原始安装标识）。 */
function isPlainPackageName(name) {
  if (typeof name !== 'string' || !name) return false;
  if (/^(github:|git\+|link:|file:|\.|\/)/.test(name)) return false;
  if (name.startsWith('@')) {
    return /^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*$/.test(name);
  }
  return /^[a-z0-9-~][a-z0-9-._~]*$/.test(name);
}

/** 把安装标识解析成实际安装的包名（github:user/repo → 按仓库名精确匹配 node_modules 里真实包名）。 */
function resolveInstalledName(spec) {
  const base = String(spec || '').replace(/^builtin:/, '').split('#')[0];
  const candidates = listInstalledPlugins();
  if (candidates.includes(base)) return base;
  const repo = (base.match(/github:([^/]+\/[^/#@]+)/) || [])[1];
  if (repo) {
    const repoName = repo.split('/')[1].toLowerCase();
    // 精确匹配（绝不能 includes 子串：dsh-pet-remielle 会误匹配 dsh-pet）
    const hit = candidates.find((n) => n.split('/').pop().toLowerCase() === repoName);
    if (hit) return hit;
  }
  // 兜底：取末尾合法段（去掉版本号）
  const last = base.split('@').pop();
  return isPlainPackageName(last) ? last : null;
}

// ---------------------------------------------------------------------------
// 已装插件更新（设计档 §2.2.5 / AC10）——版本对比全在主进程，前端只按 id 匹配渲染。
// ---------------------------------------------------------------------------

/** 注册表条目 → 安装标识（与 market.js normalizePlugin 同口径：npm 优先，install 字段取标识，url 兜底）。 */
function pluginUpdateSpecOf(p) {
  let spec = p && p.npm;
  if (!spec && p && p.install) {
    const m = String(p.install).match(/add\s+(github:[^\s]+|link:[^\s]+|[^\s]+)/);
    if (m && m[1].startsWith('github:')) spec = m[1]; // 与 normalizePlugin 同口径：install 字段只采纳 github:
  }
  if (!spec && p && p.url) {
    const m = String(p.url).match(/github\.com\/([^/]+\/[^/]+)/);
    if (m) spec = 'github:' + m[1];
  }
  return spec || '';
}

/** 已装插件版本：profileDir()/node_modules/{realName}/package.json（读不到 → ''）。 */
function installedPluginVersion(realName) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(profileDir(), 'node_modules', realName, 'package.json'), 'utf8'));
    return pkg && pkg.version ? String(pkg.version) : '';
  } catch { return ''; }
}

/** 计算可更新插件清单（AC10）：已装版本 < 注册表 version 才入选；github: 按原 installSpec 重装。 */
function computePluginUpdates(plugins) {
  const updates = [];
  for (const p of plugins || []) {
    const version = p && typeof p.version === 'string' ? p.version.trim() : '';
    if (!version) continue; // 注册表条目缺 version → 无徽标（US-7 边界）
    const spec = pluginUpdateSpecOf(p);
    if (!spec || spec.startsWith('builtin:') || spec.startsWith('link:')) continue;
    const realName = resolveInstalledName(spec);
    if (!realName) continue;
    if (!isPluginInProfile(realName)) continue; // 未装条目不参与也不记日志（避免 market:list 刷日志）
    const installedVersion = installedPluginVersion(realName);
    if (!installedVersion) {
      updaterLog(`plugin update spec=${spec} result=skip detail=no-installed-version`);
      continue;
    }
    if (compareVersions(version, installedVersion) <= 0) continue;
    updates.push({
      id: (p.name || p.npm || spec || '').replace(/\s+/g, '-').toLowerCase(),
      name: p.name || p.npm || spec,
      updateSpec: spec.startsWith('github:') ? spec : `${realName}@${version}`,
      latestVersion: version,
      installedVersion,
    });
  }
  return updates;
}

/**
 * 启动前清理 profile 里损坏的 bundle 注册（例如被写进去的 github:xxx 原始标识），
 * 避免后端启动直接崩掉（dsh CLI 遇到不可解析的 bundle 会抛错退出）。
 */
function sanitizeProfileBundles() {
  try {
    const m = readProfileManifest();
    if (!m || !m.dsh || !m.dsh.profile || !Array.isArray(m.dsh.profile.bundles)) return;
    const before = m.dsh.profile.bundles;
    const cleaned = before.filter((b) => {
      if (!isPlainPackageName(b)) return false; // github:/git+/link: 等非法标识
      if (b.startsWith('@deepseek-ai/')) return true; // 官方基础包
      try { return fs.existsSync(path.join(profileDir(), 'node_modules', b)); } // 包必须真的装了
      catch { return false; }
    });
    if (cleaned.length !== before.length) {
      m.dsh.profile.bundles = cleaned;
      writeProfileManifest(m);
      console.warn('[bigfish] 已清理非法 bundle 注册:', before.filter((b) => !cleaned.includes(b)).join(', '));
    }
  } catch { /* 读不到就算了 */ }
}
function isPluginInProfile(pkgName) {
  if (profileBundles().includes(pkgName)) return true;
  try {
    return fs.existsSync(path.join(profileDir(), 'node_modules', pkgName));
  } catch {
    return false;
  }
}
/** Installed plugin names (from bundles + node_modules presence). */
function listInstalledPlugins() {
  const names = new Set(profileBundles());
  try {
    const nm = path.join(profileDir(), 'node_modules');
    if (fs.existsSync(nm)) {
      for (const entry of fs.readdirSync(nm)) {
        if (entry.startsWith('.') || entry === 'node_modules') continue; // 跳过 .pnpm 等元数据目录
        if (entry.startsWith('@')) {
          const scoped = path.join(nm, entry);
          if (fs.statSync(scoped).isDirectory()) {
            for (const sub of fs.readdirSync(scoped)) names.add(`${entry}/${sub}`);
          }
        } else if (fs.statSync(path.join(nm, entry)).isDirectory()) {
          names.add(entry);
        }
      }
    }
  } catch { /* best effort */ }
  return [...names].sort();
}

/** 已安装但被禁用的插件（在 node_modules 但不在 bundles 里 = 装了但没加载）。 */
function listDisabledPlugins() {
  const bundles = new Set(profileBundles());
  const out = [];
  try {
    const nm = path.join(profileDir(), 'node_modules');
    if (fs.existsSync(nm)) {
      for (const entry of fs.readdirSync(nm)) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        const names = [];
        if (entry.startsWith('@')) {
          const scoped = path.join(nm, entry);
          if (fs.statSync(scoped).isDirectory()) {
            for (const sub of fs.readdirSync(scoped)) names.push(`${entry}/${sub}`);
          }
        } else if (fs.statSync(path.join(nm, entry)).isDirectory()) {
          names.push(entry);
        }
        for (const n of names) {
          if (n.startsWith('@deepseek-ai/')) continue;
          if (!bundles.has(n)) out.push(n);
        }
      }
    }
  } catch { /* best effort */ }
  return out;
}

/** Run a command, capturing combined output. */
function runCmd(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...opts,
    });
    let out = '';
    const onData = (c) => { out += String(c); };
    if (child.stdout) child.stdout.on('data', onData);
    if (child.stderr) child.stderr.on('data', onData);
    child.on('error', (err) => resolve({ code: -1, output: out + '\n' + (err && err.message) }));
    child.on('close', (code) => resolve({ code, output: out }));
  });
}

/** pnpm add/remove 在 profile 目录（workspace 根）需要 -w 标志。 */
function pnpmArgs(action, spec) {
  const args = [bundledPnpmPath(), action];
  const ws = path.join(profileDir(), 'pnpm-workspace.yaml');
  if (fs.existsSync(ws) && (action === 'add' || action === 'remove')) args.push('-w');
  args.push('--dir', profileDir());
  // 用 --config.registry 而不是 --registry：pnpm remove 不识别 --registry
  args.push('--config.registry=' + NPM_REGISTRY);
  // store 固定到 DSH_HOME 下，避免写入程序安装目录（Program Files 只读）或系统盘
  args.push('--store-dir', path.join(dshHome(), 'pnpm-store'));
  if (action === 'add' && spec) args.push(spec);
  if (action === 'remove' && spec) args.push(spec);
  return args;
}

/** profile node_modules 顶层包名集合（跳过 .pnpm 等元数据）。 */
function topLevelModules() {
  const nm = path.join(profileDir(), 'node_modules');
  const out = new Set();
  try {
    for (const e of fs.readdirSync(nm)) {
      if (e.startsWith('.')) continue;
      if (e.startsWith('@')) {
        const scoped = path.join(nm, e);
        if (fs.statSync(scoped).isDirectory()) {
          for (const sub of fs.readdirSync(scoped)) out.add(`${e}/${sub}`);
        }
      } else if (fs.statSync(path.join(nm, e)).isDirectory()) {
        out.add(e);
      }
    }
  } catch { /* best effort */ }
  return out;
}

/** 安装插件：内置插件离线拷贝；npm 插件走 pnpm add。返回 { ok, message } */
async function installPlugin(spec) {
  const bundledName = String(spec).replace(/^builtin:/, '');
  const bundledSource = path.join(bundledPluginsDir(), bundledName);
  if (fs.existsSync(bundledSource)) {
    // 内置插件：直接拷贝进 profile 的 node_modules（离线，不依赖网络）
    const target = path.join(profileDir(), 'node_modules', bundledName);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(bundledSource, target, { recursive: true });
    addBundle(bundledName);
    return { ok: true, message: `已安装内置插件 ${bundledName}` };
  }
  // npm / GitHub 插件：用内置 pnpm 安装到 profile
  const beforeMods = topLevelModules();
  const beforeDeps = (() => { const b = readProfileManifest(); return b && b.dependencies ? Object.keys(b.dependencies) : []; })();
  // 更新分支（AC10）：目标已装（依赖键或顶层目录存在）→ 装完跳过 realName 探测与 addBundle
  //   （realName 探测只识别「新增」包——更新时依赖键与顶层名不变，会误报失败）
  const knownName = resolveInstalledName(spec);
  const isUpdate = !!knownName && (beforeDeps.includes(knownName) || beforeMods.has(knownName));
  const res = await runCmd(runtimeNodeExe(), pnpmArgs('add', spec), { timeout: 15 * 60 * 1000 });
  if (res.code !== 0) {
    return { ok: false, message: `安装失败（pnpm exit ${res.code}）：\n${res.output.slice(-800)}` };
  }
  if (isUpdate) {
    return { ok: true, message: `已更新 ${knownName}` };
  }
  // 解析【真实包名】注册 bundles（严禁把 github:user/repo 这类原始标识写进 bundles）
  let realName = null;
  const m = readProfileManifest();
  const afterDeps = m && m.dependencies ? Object.keys(m.dependencies) : [];
  const addedDeps = afterDeps.filter((d) => !beforeDeps.includes(d));
  if (addedDeps.length > 0) {
    realName = addedDeps[0]; // pnpm add 会把真实包名写进 dependencies
  } else {
    // 兜底：扫描 node_modules 新增的顶层包（pnpm 装好后按 package.json 名落位）
    const afterMods = topLevelModules();
    const newMods = [...afterMods].filter((n) => !beforeMods.has(n) && !n.startsWith('@deepseek-ai/'));
    if (newMods.length > 0) realName = newMods[0];
  }
  if (!realName) {
    return { ok: false, message: `安装没有产生可识别的新插件（pnpm 已退出 0 但未落包）。\n原始标识：${spec}\n若从 GitHub 安装，请确认仓库里有合法的 package.json。` };
  }
  addBundle(realName);
  return { ok: true, message: `已安装 ${realName}` };
}

/** 卸载插件：内置插件直接删目录；npm 插件走 pnpm remove。 */
async function uninstallPlugin(pkgName) {
  const bundledSource = path.join(bundledPluginsDir(), pkgName);
  if (fs.existsSync(bundledSource)) {
    const target = path.join(profileDir(), 'node_modules', pkgName);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    removeBundle(pkgName);
    return { ok: true, message: `已卸载内置插件 ${pkgName}` };
  }
  const res = await runCmd(runtimeNodeExe(), pnpmArgs('remove', pkgName), { timeout: 10 * 60 * 1000 });
  if (res.code !== 0) {
    // pnpm 可能已经改了一半，无论如何把 bundles 清理掉
    removeBundle(pkgName);
    return { ok: true, message: `已卸载 ${pkgName}（pnpm 有警告，已清理注册）` };
  }
  removeBundle(pkgName);
  return { ok: true, message: `已卸载 ${pkgName}` };
}

/** 重启后端并让主窗口重新加载（插件生效必须重启）。 */
async function restartBackend() {
  if (!mainWindow || mainWindow.isDestroyed()) {
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
    mainWindow.loadURL(`http://${HOST}:${port}`);
  } else {
    mainWindow.reload();
  }
  return true;
}

// ---------------------------------------------------------------------------
// 插件市场窗口（market.html）
// ---------------------------------------------------------------------------
let marketWindow = null;
let marketRegistryCache = null; // 最近一次 market:list 的注册表缓存（market:state 算 updates 用，不另发网络请求）

function createMarketWindow() {
  if (marketWindow && !marketWindow.isDestroyed()) {
    marketWindow.show();
    marketWindow.focus();
    return;
  }
  marketWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    title: 'Bigfish 插件市场',
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'market-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 缓存爆破：防止 Chromium file:// 缓存加载旧版 market.html 导致元素缺失
  marketWindow.loadFile(path.join(__dirname, 'market.html'), { query: { v: Date.now() } });
  marketWindow.webContents.on('console-message', (_e, level, message) => {
    try {
      const file = path.join(app.getPath('userData'), 'market.log');
      fs.appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${message}\n`);
    } catch { /* best effort */ }
  });
  marketWindow.on('closed', () => { marketWindow = null; });
}

/** 拉取市场目录：优先社区最大平台（awesome-dsh-plugin.com 在线全量），
 *  其次 Gitee 上的 Bigfish 精选目录，最后用内置本地副本。 */
async function fetchPluginRegistry() {
  const bundled = path.join(__dirname, 'plugins.json');
  let local = null;
  try { local = JSON.parse(fs.readFileSync(bundled, 'utf8')); } catch { /* no local */ }
  const tryFetch = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        const j = await res.json();
        if (j && Array.isArray(j.plugins)) return { source: 'remote', fetchedAt: Date.now(), plugins: j.plugins };
      }
    } catch { /* try next */ } finally { clearTimeout(timer); }
    return null;
  };
  const online = await tryFetch(PLUGIN_REGISTRY_URL);
  if (online) return online;
  const fallback = await tryFetch(PLUGIN_REGISTRY_FALLBACK);
  if (fallback) return { ...fallback, source: 'mirror' };
  if (local) return { source: 'local', fetchedAt: 0, plugins: local.plugins || [] };
  return { source: 'none', fetchedAt: 0, plugins: [] };
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
    handleOpenArg(argv);
  });

  app.whenReady().then(async () => {
    loadSettings();
    let booted = false;
    try {
      await startDsh();
      console.log(`[bigfish] backend ready at http://${HOST}:${port}`);
      createWindow();
      console.log('[bigfish] window created');
      booted = true;
    } catch (err) {
      // 第一次失败：清理残留后重试一次（常见于上次异常退出导致端口/进程残留）
      try {
        stopDsh();
        cleanupStaleDsh();
        await new Promise((r) => setTimeout(r, 1500));
        await startDsh();
        console.log(`[bigfish] backend ready (retry) at http://${HOST}:${port}`);
        createWindow();
        console.log('[bigfish] window created (retry)');
        booted = true;
      } catch (err2) {
        // 两次都失败：很可能是插件配置被改坏，引导用户重置（尽量保留信息）
        const message = err2 && err2.message ? err2.message : String(err2);
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          title: APP_NAME,
          message: '后端启动失败，可能是插件配置损坏',
          detail: [
            '错误：' + message,
            '',
            '常见原因：使用「创造模式」让 AI 装/删插件后，插件配置被改坏。',
            '',
            '· 重置插件配置：只清插件配置，保留 API Key、会话、工程，然后自动重试。',
            '· 彻底恢复出厂：清空所有数据（API Key、会话、工程都会删）。',
          ].join('\n'),
          buttons: ['重置插件配置并重试', '彻底恢复出厂', '退出'],
          defaultId: 0,
          cancelId: 2,
        });
        if (choice === 0 || choice === 1) {
          try {
            const home = dshHome();
            stopDsh();
            cleanupStaleDsh();
            await new Promise((r) => setTimeout(r, 1500));
            if (choice === 0) {
              fs.rmSync(path.join(home, 'profiles'), { recursive: true, force: true });
            } else {
              fs.rmSync(home, { recursive: true, force: true });
            }
            await startDsh();
            console.log(`[bigfish] backend ready (after reset) at http://${HOST}:${port}`);
            createWindow();
            console.log('[bigfish] window created (after reset)');
            booted = true;
          } catch (err3) {
            const m3 = err3 && err3.message ? err3.message : String(err3);
            dialog.showErrorBox(
              APP_NAME,
              '重置后仍无法启动：\n\n' + m3 + '\n\n错误日志：' + path.join(app.getPath('userData'), 'bigfish.log'),
            );
          }
        }
      }
    }

    if (!booted) { app.quit(); return; }

    createTray();
    registerShortcuts();
    startCompletionWatcher();
    loadAffinity();
    startAffinityWatcher();
    scheduleUpdateChecks();
    // 显示器配置变化（E5 三事件，DD-8）：失效拖动缓存 + 校正到可见区 + 落盘
    screen.on('display-added', (_e, display) => handleDisplayChange('added', display));
    screen.on('display-removed', (_e, display) => handleDisplayChange('removed', display));
    screen.on('display-metrics-changed', (_e, display, changedMetrics) => handleDisplayChange('metrics', display, changedMetrics));
    // 首次安装 / 更新后：弹窗让用户选择模式（鲸鱼 / 专注）
    maybeShowModeDialog();
    if (settings.petEnabled) {
      createPetWindow(petResolveStartPos());
      petGeomSnapshot('start'); // 启动建窗后 1 行 geom（发射规则①）
      scheduleWander();
      scheduleSleep();
      schedulePetChatter();
    }
    if (settings.launchAtLogin) setAutoStart(true);
    if (!settings.onboardingDone) createWelcomeWindow();

    handleOpenArg(process.argv);

    app.on('activate', () => {
      ensurePet();
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Live in the tray; do not quit.
  });

  app.on('before-quit', () => {
    quitting = true;
    petStopDrag('destroyed'); // 退出路径终止拖动（设计档 §2.2.4 的主进程清空点）
    petSavePos();             // 退出前兜底落盘（US-13，§2.3.2 调用时机表）
    globalShortcut.unregisterAll();
    stopCompletionWatcher();
    stopAffinityWatcher();
    saveAffinity();
    stopDsh();
  });

  app.on('will-quit', () => {
    stopDsh();
  });

  // Welcome wizard IPC
  ipcMain.on('welcome-open-url', (_e, url) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
  });
  ipcMain.on('welcome-done', () => {
    settings.onboardingDone = true;
    saveSettings();
    if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.close();
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  // Pet drag + click（拖动移动由主进程按全局光标绝对定位驱动，设计档 PET-DRAG §2.2）
  ipcMain.on('pet-drag-start', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    // 用户开始拖动：立即停掉走动动画，避免瞬移
    if (moveTimer) { clearInterval(moveTimer); moveTimer = null; }
    if (petState === 'walk-left' || petState === 'walk-right' || petState === 'run-left' || petState === 'run-right') setPetState('idle');
    // 清除待发的散步（根因 D：原实现在此处调 scheduleWander()，拖动中会被自主走动抢占窗口）
    clearTimeout(wanderTimer);
    wanderTimer = null;
    if (petDrag) { clearInterval(petDrag.timer); petDrag = null; } // 幂等：先停旧再建新
    const cursor = screen.getCursorScreenPoint();
    const pos = petWindow.getPosition();
    petDrag = {
      grabOffset: { x: cursor.x - pos[0], y: cursor.y - pos[1] },
      timer: setInterval(petDragTick, PET_DRAG_TICK_MS),
      lastApplied: [pos[0], pos[1]],
      tick: 0,
      lastMessageAt: Date.now(),
      displayBounds: null,       // 上一 tick 所在屏的 DIP 矩形（切换检测用，零 API 调用）
      displayId: null,           // 上一 tick 所在屏 id（唯一职责 = 切换检测的身份比较，§2.3.3）
      pendingSizeAnchor: null,   // 跨屏尺寸标记 { bounds }：窗口中心点进入新屏的首个 tick 校准一次（§2.3.3）
    };
    petSyncDragDisplayCache(cursor); // 拖动起点刷新缓存（§2.3.3）
    if (PET_DRAG_DEBUG) petDragLog(`drag-start grabOffset=${petPosText([petDrag.grabOffset.x, petDrag.grabOffset.y])} pos=${petPosText(pos)}`);
  });
  ipcMain.on('pet-drag-heartbeat', () => {
    // 心跳由渲染层定时器驱动：事件驱动的心跳会在长按不动时静默 → 被看门狗误判失联
    if (petDrag) petDrag.lastMessageAt = Date.now();
  });
  ipcMain.on('pet-drag-end', (_e, reason) => {
    // reason 由渲染层给出（pointerup / pointercancel / lostcapture）；缺省按 pointerup
    petStopDrag(/^(pointerup|pointercancel|lostcapture)$/.test(reason) ? reason : 'pointerup');
    if (!petWindow || petWindow.isDestroyed()) return;
    // 松手落点解析（US-10 + 骑线处置 §2.3.7）：唯一调用点 = 此处（petStopDrag 返回之后）——
    //   stale / destroyed 不校正不落盘（§2.3.2 注）；reason 已归一化，无需白名单过滤。
    //   两条校正规则由 petSettlePos 合并为**一次**位置写入（kind='visible' ⇒ drop；kind='straddle' ⇒ straddle）。
    const dropPos = petWindow.getPosition();
    const settled = petSettlePos(dropPos);
    const wasCorrected = settled.kind !== 'none';
    if (wasCorrected) petApplyPos(settled.pos, settled.kind === 'straddle' ? 'straddle' : 'drop');
    petCalibrateSize(); // 松手收口（§2.3.5-C 调用点⑦）：覆盖「停在骑线后松手」
    petSavePos();
    // 校正与挣脱必须离散（§2.3.6 / DD-14）：校正把窗口钳到边缘 ⇒ 若照常判贴墙则每次校正必误触发；
    //   骑线推离同规则豁免（推离落点正是某屏 bounds 缘，§2.3.7）。
    if (wasCorrected) {
      // 本次发生位置校正 ⇒ 豁免贴墙判定、不发 wall 行
      //   （AC1 判据 = geom-fix reason ∈ {drop, straddle} 在场 + wall 缺席）
      scheduleWander();
    } else {
      // 脱手：如果鲸鱼娘被拖到**整个桌面**的外缘，她会挣脱并往反方向跑
      //   （基准 = 全部显示器 bounds 的并集，§2.1 E 组 E1；不是所在屏工作区——两者用途不同）
      const bounds = petDesktopBounds();
      const [x] = petWindow.getPosition();
      const escaped = !!bounds && (x <= bounds.minX + PET_WALL_EPS || x >= bounds.maxX - PET_WALL_EPS);
      if (PET_GEOM_DEBUG) {
        petGeomLog(`wall x=${x} minX=${bounds ? bounds.minX : 'n/a'} maxX=${bounds ? bounds.maxX : 'n/a'} escaped=${escaped ? 1 : 0}`);
      }
      if (escaped) {
        petWanderDir = x <= bounds.minX + PET_WALL_EPS ? 'right' : 'left';
        petBounceLeft = 2;
        petForceRun = true;
        petSay('哇！被你拖到墙角啦，我跑！');
        setPetState('idle');
        doWander();
      } else {
        scheduleWander();
      }
    }
    petGeomSnapshot('drag-end'); // AC2 / AC8（B01）取证点：落点解析与尺寸校准**全部完成之后**（§2.3.2 注）
  });
  ipcMain.on('pet-clicked', () => {
    // 原地点击也起过跟随循环（按下即起）——点完即止，保证拖动状态在所有路径下清空
    petStopDrag('pointerup');
    wakePet();
    toggleMainWindow();
    petSay('要我帮忙吗？');
    // 点击 → 开心动画（新素材）
    setPetState('happy');
    clearTimeout(eatTimer);
    eatTimer = setTimeout(() => {
      if (petState === 'happy') setPetState('idle');
    }, 1600);
  });
  ipcMain.on('pet-right-clicked', () => {
    // 右键：打开鲸鱼娘兑换屋
    wakePet();
    petSay('要兑换点什么吗~');
    openExchangeWindow();
  });
  ipcMain.on('pet-set-ignore-mouse', (_e, ignore) => {
    // 点击穿透只在 Windows 上可靠；Linux 上一旦开启整条鱼都点不到
    if (process.platform !== 'win32') return;
    // 拖动期间拒绝「开启穿透」：穿透会切断事件流（根因 A 的主进程侧防守，设计档 §2.2.7）
    if (ignore && petDrag) return;
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });

  // 插件市场 IPC
  ipcMain.handle('market:list', async () => {
    const registry = await fetchPluginRegistry();
    marketRegistryCache = registry;
    const installed = listInstalledPlugins();
    const disabled = listDisabledPlugins();
    const bundledNames = [];
    try {
      bundledNames.push(...fs.readdirSync(bundledPluginsDir()));
    } catch { /* no bundled dir */ }
    const updates = computePluginUpdates(registry.plugins);
    return { registry, installed, disabled, bundledNames, updates, profileDir: profileDir(), dshHome: dshHome() };
  });
  // 快速状态：只读本地已装/已禁用（不拉在线目录），用于操作后即时刷新
  ipcMain.handle('market:state', () => ({
    installed: listInstalledPlugins(),
    disabled: listDisabledPlugins(),
    bundledNames: (() => { try { return fs.readdirSync(bundledPluginsDir()); } catch { return []; } })(),
    updates: computePluginUpdates((marketRegistryCache && marketRegistryCache.plugins) || []),
  }));
  ipcMain.handle('market:install', async (_e, spec) => {
    if (typeof spec !== 'string' || !spec) return { ok: false, message: '无效的插件标识' };
    return await installPlugin(spec);
  });
  ipcMain.handle('market:uninstall', async (_e, pkg) => {
    if (typeof pkg !== 'string' || !pkg) return { ok: false, message: '无效的插件名' };
    // 解析真实包名（防 github:xxx 原始标识）
    const real = resolveInstalledName(pkg) || pkg;
    return await uninstallPlugin(real);
  });
  // 禁用 = 从 bundles 移除（保留 node_modules，重启后不再加载）；启用 = 加回 bundles
  ipcMain.handle('market:disable', async (_e, pkg) => {
    const real = resolveInstalledName(pkg);
    if (!real) return { ok: false, message: '无法解析插件包名：' + String(pkg).slice(0, 60) };
    removeBundle(real);
    return { ok: true, message: `已禁用 ${real}（重启后生效）` };
  });
  ipcMain.handle('market:enable', async (_e, pkg) => {
    const real = resolveInstalledName(pkg);
    console.log('[bigfish] market:enable input=', JSON.stringify(pkg), 'resolved=', real, 'disabled=', JSON.stringify(listDisabledPlugins()));
    if (!real) return { ok: false, message: '无法解析插件包名：' + String(pkg).slice(0, 60) };
    if (!isPlainPackageName(real)) return { ok: false, message: '非法包名：' + real };
    const added = addBundle(real);
    console.log('[bigfish] market:enable added=', added, 'bundles=', JSON.stringify(profileBundles()));
    return { ok: added, message: added ? `已启用 ${real}（重启后生效）` : `写入失败：${real}` };
  });
  ipcMain.handle('market:restart', async () => {
    try {
      await restartBackend();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: String((err && err.message) || err) };
    }
  });
  // 插件更新（§2.2.5）：单个更新走 installPlugin + 一次 restartBackend；全部更新逐项执行后一次重启
  ipcMain.handle('market:update', async (_e, spec) => {
    if (typeof spec !== 'string' || !spec) return { ok: false, message: '无效的更新标识' };
    const res = await installPlugin(spec);
    if (!res.ok) {
      updaterLog(`plugin update spec=${spec} result=fail detail=${String(res.message).replace(/\s+/g, ' ').slice(0, 120)}`);
      return res;
    }
    try {
      await restartBackend();
    } catch (err) {
      updaterLog(`plugin update spec=${spec} result=fail detail=restart:${String((err && err.message) || err).slice(0, 120)}`);
      return { ok: false, message: '已安装但重启失败：' + ((err && err.message) || err) };
    }
    updaterLog(`plugin update spec=${spec} result=ok`);
    return res;
  });
  ipcMain.handle('market:update-all', async () => {
    const registry = await fetchPluginRegistry();
    const updates = computePluginUpdates(registry.plugins);
    const results = [];
    for (const u of updates) {
      const res = await installPlugin(u.updateSpec);
      results.push({ id: u.id, name: u.name, ok: res.ok, message: res.message });
      updaterLog(`plugin update spec=${u.updateSpec} result=${res.ok ? 'ok' : 'fail'} detail=${String(res.message).replace(/\s+/g, ' ').slice(0, 120)}`);
    }
    try {
      await restartBackend(); // 全部完成（含部分失败）后一次重启
    } catch (err) {
      results.push({ id: '', name: '后端重启', ok: false, message: '插件已更新但重启失败：' + ((err && err.message) || err) });
    }
    return results;
  });
  ipcMain.on('market-open-external', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
  });

  // 更新窗口 IPC（U-13：关闭只关窗不取消；取消 → 中止在途并清临时，回到可重试态）
  ipcMain.on('upd:cancel', () => {
    if (updateMode === 'harness') updater.cancelHarnessInstall();
    else updater.cancelAppDownload();
  });
  ipcMain.on('upd:install-now', () => {
    if (updateMode !== 'app' || !pendingAppFile) return;
    const res = updater.installApp(pendingAppFile);
    if (!res.ok) { sendUpdateStatus({ mode: 'app', phase: 'error', message: res.error }); return; }
    quitting = true;
    setTimeout(() => app.quit(), 800); // 先例：uninstall()
  });
  ipcMain.on('upd:retry', () => {
    if (updateMode === 'harness') {
      if (pendingHarnessInfo) startHarnessUpdate(pendingHarnessInfo);
    } else if (pendingAppInfo) {
      startAppDownload(pendingAppInfo);
    }
  });
  ipcMain.on('upd:close-window', () => {
    if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close();
  });

  // 好感度 / 兑换屋 IPC
  ipcMain.handle('affinity:view', () => affinityView());
  ipcMain.handle('affinity:exchange', () => {
    const gain = Math.floor(affinity.wallet / EXCHANGE_RATE);
    if (gain <= 0) return { ok: false, message: `还不够兑换 1💴（需 ${EXCHANGE_RATE} token）` };
    affinity.wallet -= gain * EXCHANGE_RATE; // 只花可兑换余额，不动终身消耗（好感不掉）
    affinity.currency += gain;
    saveAffinity();
    broadcastAffinity();
    return { ok: true, message: `兑换了 ${gain}💴`, view: affinityView() };
  });
  ipcMain.handle('affinity:buy', (_e, foodId) => {
    const food = FOODS.find((f) => f.id === foodId);
    if (!food) return { ok: false, message: '没有这种食物' };
    if (affinity.currency < food.price) return { ok: false, message: '💴 不够啦，先去兑换吧' };
    affinity.currency -= food.price;
    affinity.food[food.id] = (affinity.food[food.id] || 0) + 1;
    // 喂食：只加好感点（单向），不产生可兑换 token —— 杜绝"买食物→赚token→再换钱"循环
    affinity.bonus += Math.round(food.bonusTokens / AFFINITY_RATE);
    saveAffinity();
    // 鲸鱼吃播
    petSay(food.msg);
    setPetState('eat');
    clearTimeout(eatTimer);
    eatTimer = setTimeout(() => { if (petState === 'eat') setPetState('idle'); }, 2000);
    broadcastAffinity();
    return { ok: true, message: food.msg, view: affinityView() };
  });
}
