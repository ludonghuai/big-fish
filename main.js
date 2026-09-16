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
const settings = require('./shell-settings.js');
const assets = require('./shell-assets.js');
const notifier = require('./shell-notify.js');
const backend = require('./shell-backend.js');
const geometry = require('./shell-pet-geometry.js');
const drag = require('./shell-pet-drag.js');
const pet = require('./shell-pet.js');
const affinity = require('./shell-affinity.js');
const mode = require('./shell-mode.js');
const plugins = require('./shell-plugins.js');

const APP_NAME = 'Bigfish';
const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 90 * 1000;
const IDLE_NOTIFY_MS = 30 * 1000; // backend quiet for this long after activity => "done"

// 测试/多实例：允许用环境变量指定 userData（避免 --user-data-dir 经 cmd 转发被改坏）
if (process.env.BIGFISH_USER_DATA && String(process.env.BIGFISH_USER_DATA).trim() !== '') {
  try { app.setPath('userData', String(process.env.BIGFISH_USER_DATA).trim()); } catch { /* ignore */ }
}

let quitting = false;
function isQuitting() { return quitting; }
function setQuitting(v) { quitting = v; }

/** 主窗口访问器（组合根中间态：window 模块迁移前由 main 提供）。 */
function getMainWindow() { return mainWindow; }

// ---- 模块接线（依赖注入；设计档 docs/design/SHELL-UX.md §2.2.6 依赖方向规则）----
notifier.init({ getDshHome: backend.dshHome, petSay: pet.petSay, IDLE_NOTIFY_MS });
backend.init({ HOST, READY_TIMEOUT_MS, sanitizeProfileBundles: plugins.sanitizeProfileBundles, getMainWindow: getMainWindow });
geometry.init({ getPetWindow: pet.getPetWindow, getPetDrag: drag.getPetDrag });
drag.init({ getPetWindow: pet.getPetWindow, pet });
pet.init({ showMainWindow: showMainWindow, openExchangeWindow: affinity.openExchangeWindow, broadcastAffinity: affinity.broadcastAffinity });
affinity.init({ getPetWindow: pet.getPetWindow, pet, setQuitting, APP_NAME });
mode.init({ getMainWindow: getMainWindow, destroyPetWindow: pet.destroyPetWindow, ensurePet: pet.ensurePet, rebuildTrayMenu: rebuildTrayMenu, notify: notifier.notify, APP_NAME });
plugins.init({ updaterLog: updaterLog });

// 检查更新：从 Gitee 仓库 raw 拉取 latest.json（唯一清单源；AC6）。
// 测试钩子：BIGFISH_UPDATE_URL 可覆盖（设计档 §2.2.2 假清单桩；仅此面允许 http 本地桩）。
const UPDATE_MANIFEST_URL = process.env.BIGFISH_UPDATE_URL
  || 'https://gitee.com/ludonghuai/big-fish/raw/main/latest.json';
const UPDATE_POLL_MS = Number(process.env.BIGFISH_UPDATE_INTERVAL_MS) || 21600000; // 6h（AC2 短轮询可覆盖）

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let tray = null;

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
//   shell-update.js：门禁、弹窗/气泡、更新窗口生命周期、6h 轮询、Harness 停-切-启编排。
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
    icon: assets.appIconPath(),
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
  notifier.notify(`发现新版本 v${info.version}`, '点击查看', () => showAppUpdateDialog(info));
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
    notifier.notify(APP_NAME, '已是最新版本');
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
  notifier.notify(`发现 Harness 新版本 v${res.latest}`, '点击查看', () => showHarnessUpdateDialog(res));
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
 * installHarness 在冒烟通过后回调 { phase:'stop-backend' } 并等待其完成——shell-update.js 在该回调停后端
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
      backend.stopDsh();
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
      try { await backend.restartBackend(); } catch { /* 旧版仍在，尽力重启 */ }
    }
    const message = outcome.error === 'canceled'
      ? outcome.error
      : /^(activate-fail|pointer-fail|verify-fail|guard-active-dir)/.test(String(outcome.error))
        ? '更新失败，旧版不受影响，可重试' // 设计档 §2.2.4 ①⑤⑥ 指定文案
        : outcome.error;
    sendUpdateStatus({ mode: 'harness', phase: outcome.error === 'canceled' ? 'canceled' : 'error', message });
    return;
  }
  updaterLog(`harness activate dsh active path=${backend.dshBinPath()} version=${backend.getCurrentDshVersion()}`); // 重启前按实际解析结果记（AC9 机器证据）
  try {
    await backend.restartBackend();
    updaterLog(`harness restart backend ready port=${backend.getPort()}`);
    updater.cleanupHarnessStale();
    sendUpdateStatus({ mode: 'harness', phase: 'done' });
  } catch (err) {
    updater.rollbackHarness();
    try { await backend.restartBackend(); } catch { /* 尽力 */ }
    sendUpdateStatus({ mode: 'harness', phase: 'error', message: '更新失败，已回退旧版，可重试' });
  }
}

// ---- 门禁 + 调度（§2.2.7） ----
async function manualCheckUpdates() {
  if (updateGateBlocked('manual')) { notifier.notify(APP_NAME, '检查/更新正在进行'); return; }
  // App 面：dev 下不执行、无 UI，仅记 gate 行（US-6 / DD-9）；Harness 面两态同路径
  if (app.isPackaged) await runAppCheck('manual');
  else updaterLog('update gate reason=manual face=app skipped=dev');
  await runHarnessCheck('manual');
}

async function runAutoChecks(reason) {
  if (!settings.get().autoCheckUpdates) { updaterLog(`update gate reason=${reason} skipped=toggle-off`); return; }
  if (updateGateBlocked(reason)) return;
  // App 面：dev 下静默跳过（记 gate 行）；Harness 面两态同路径
  if (app.isPackaged) await runAppCheck(reason);
  else updaterLog(`update gate reason=${reason} face=app skipped=dev`);
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
    dirs: { userData: app.getPath('userData'), dshHome: backend.dshHome() },
    runtime: { nodeExe: plugins.runtimeNodeExe(), pnpm: plugins.bundledPnpmPath() },
    log: updaterLog,
    getCurrentVersion: () => app.getVersion(),
    getCurrentDshVersion: backend.getCurrentDshVersion,
  });
  updater.startupCleanup();
  setTimeout(() => { runAutoChecks('startup'); }, 5000);
  setInterval(() => { runAutoChecks('poll'); }, UPDATE_POLL_MS);
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    icon: assets.appIconPath(),
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0b0f',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
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
    if (origin !== `http://${HOST}:${backend.getPort()}`) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    }
  });

  // 页面加载完成后注入半透明背景
  mainWindow.webContents.on('did-finish-load', () => mode.applyBackground());

  mainWindow.loadURL(`http://${HOST}:${backend.getPort()}`);
}

/** 显示并聚焦主界面（US-1「只开不隐」；F4 起为唯一显示入口）。 */
function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    if (!mainWindow) return;
    // 建窗路径（零窗口时）：等 ready-to-show 首帧就绪再显示，避免露出未加载的空窗
    mainWindow.once('ready-to-show', () => { mainWindow?.show(); mainWindow?.focus(); });
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleMainWindow() {
  pet.ensurePet();
  if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
  else showMainWindow();
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function createTray() {
  const icon = assets.trayIconPath();
  if (icon) {
    tray = new Tray(nativeImage.createFromPath(icon));
  } else {
    tray = new Tray(nativeImage.createEmpty());
  }
  tray.setToolTip(APP_NAME);
  tray.on('click', () => toggleMainWindow());
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏主界面', click: () => toggleMainWindow() },
    { label: '检查更新', click: () => { manualCheckUpdates(); } },
    { type: 'separator' },
    // 模式提级为一级 radio（US-4 / 用户点名项）
    { label: '🐳 鲸鱼模式', type: 'radio', checked: settings.get().mode !== 'focus', click: () => mode.setMode('whale') },
    { label: '🧘 专注模式', type: 'radio', checked: settings.get().mode === 'focus', click: () => mode.setMode('focus') },
    { label: '更换背景…', click: () => mode.chooseBackground() },
    { label: '恢复默认背景', click: () => mode.resetBackground() },
    { type: 'separator' },
    { label: '插件市场', click: () => createMarketWindow() },
    // 鲸鱼娘兑换屋：一级常驻项（无 enabled 条件）——专注模式下唯一可达入口（US-4 硬要求 / DD-3）
    { label: '鲸鱼娘兑换屋', click: () => affinity.openExchangeWindow() },
    {
      label: '设置',
      submenu: [
        { label: '自动检查更新', type: 'checkbox', checked: settings.get().autoCheckUpdates, click: (item) => setAutoCheckUpdates(item.checked) },
        { label: '任务完成时通知', type: 'checkbox', checked: settings.get().notifyOnComplete, click: (item) => setNotify(item.checked) },
        { label: '开机自启', type: 'checkbox', checked: settings.get().launchAtLogin, click: (item) => setAutoStart(item.checked) },
        {
          label: 'Windows 右键菜单',
          submenu: [
            { label: '安装「用 Bigfish 打开」', click: () => installContextMenu() },
            { label: '卸载', click: () => uninstallContextMenu() },
          ],
        },
      ],
    },
    { type: 'separator' },
    {
      label: '高级',
      submenu: [
        // 找回鲸鱼娘（US-14）：专注模式下桌宠窗口不存在 ⇒ 置灰不可用；低频救援动作归「高级 ▸」（DD-16）
        { label: '找回鲸鱼娘', enabled: settings.get().mode !== 'focus', click: () => pet.summonPet() },
        { label: '重置插件配置（保留 API Key 和会话）', click: () => affinity.resetConfigKeepSessions() },
        { label: '彻底恢复出厂（清空所有）', click: () => affinity.resetAllData() },
        { label: '卸载 Bigfish', click: () => uninstall() },
      ],
    },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function setNotify(enabled) {
  settings.get().notifyOnComplete = enabled;
  settings.saveSettings();
  if (!enabled) { notifier.setLastBusyAt(0); notifier.setNotifiedForCycle(false); }
}

function setAutoStart(enabled) {
  settings.get().launchAtLogin = enabled;
  settings.saveSettings();
  app.setLoginItemSettings({ openAtLogin: enabled });
}

function setAutoCheckUpdates(enabled) {
  settings.get().autoCheckUpdates = enabled;
  settings.saveSettings();
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
  notifier.notify(APP_NAME, '已添加右键「用 Bigfish 打开」');
}

async function uninstallContextMenu() {
  await runReg(['delete', 'HKCU\\Software\\Classes\\*\\shell\\Bigfish', '/f']);
  await runReg(['delete', 'HKCU\\Software\\Classes\\Directory\\shell\\Bigfish', '/f']);
  notifier.notify(APP_NAME, '已移除右键菜单');
}

// ---------------------------------------------------------------------------
// --open <path> handling
// ---------------------------------------------------------------------------
function handleOpenArg(argv) {
  const i = argv.indexOf('--open');
  if (i === -1 || !argv[i + 1]) return;
  const target = argv[i + 1];
  showMainWindow();
  notifier.notify(APP_NAME, `已打开: ${target}`);
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
    icon: assets.appIconPath(),
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
  const online = await tryFetch(plugins.PLUGIN_REGISTRY_URL);
  if (online) return online;
  const fallback = await tryFetch(plugins.PLUGIN_REGISTRY_FALLBACK);
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
    showMainWindow();
    handleOpenArg(argv);
  });

  app.whenReady().then(async () => {
    settings.loadSettings();
    let booted = false;
    try {
      await backend.startDsh();
      console.log(`[bigfish] backend ready at http://${HOST}:${backend.getPort()}`);
      createWindow();
      console.log('[bigfish] window created');
      booted = true;
    } catch (err) {
      // 第一次失败：清理残留后重试一次（常见于上次异常退出导致端口/进程残留）
      try {
        backend.stopDsh();
        backend.cleanupStaleDsh();
        await new Promise((r) => setTimeout(r, 1500));
        await backend.startDsh();
        console.log(`[bigfish] backend ready (retry) at http://${HOST}:${backend.getPort()}`);
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
            const home = backend.dshHome();
            backend.stopDsh();
            backend.cleanupStaleDsh();
            await new Promise((r) => setTimeout(r, 1500));
            if (choice === 0) {
              fs.rmSync(path.join(home, 'profiles'), { recursive: true, force: true });
            } else {
              fs.rmSync(home, { recursive: true, force: true });
            }
            await backend.startDsh();
            console.log(`[bigfish] backend ready (after reset) at http://${HOST}:${backend.getPort()}`);
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
    notifier.startCompletionWatcher();
    affinity.loadAffinity();
    affinity.startAffinityWatcher();
    scheduleUpdateChecks();
    // 显示器配置变化（E5 三事件，DD-8）：失效拖动缓存 + 校正到可见区 + 落盘
    screen.on('display-added', (_e, display) => geometry.handleDisplayChange('added', display));
    screen.on('display-removed', (_e, display) => geometry.handleDisplayChange('removed', display));
    screen.on('display-metrics-changed', (_e, display, changedMetrics) => geometry.handleDisplayChange('metrics', display, changedMetrics));
    // 首次安装 / 更新后：弹窗让用户选择模式（鲸鱼 / 专注）
    mode.maybeShowModeDialog();
    if (settings.get().petEnabled) {
      pet.createPetWindow(geometry.petResolveStartPos());
      geometry.petGeomSnapshot('start'); // 启动建窗后 1 行 geom（发射规则①）
      pet.scheduleWander();
      pet.scheduleSleep();
      pet.schedulePetChatter();
    }
    if (settings.get().launchAtLogin) setAutoStart(true);

    handleOpenArg(process.argv);

    app.on('activate', () => {
      // Dock 点击 = 用户主动显示请求：显示 + 聚焦（零窗口时建窗后显示）——macOS 目视项 TC-26
      pet.ensurePet();
      showMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Live in the tray; do not quit.
  });

  app.on('before-quit', () => {
    quitting = true;
    drag.petStopDrag('destroyed'); // 退出路径终止拖动（设计档 §2.2.4 的主进程清空点）
    geometry.petSavePos();             // 退出前兜底落盘（US-13，§2.3.2 调用时机表）
    globalShortcut.unregisterAll();
    notifier.stopCompletionWatcher();
    affinity.stopAffinityWatcher();
    affinity.saveAffinity();
    backend.stopDsh();
  });

  app.on('will-quit', () => {
    backend.stopDsh();
  });

  // Pet drag + click（拖动移动由主进程按全局光标绝对定位驱动，设计档 PET-DRAG §2.2）
  ipcMain.on('pet-drag-start', drag.handlePetDragStart);
  ipcMain.on('pet-drag-heartbeat', drag.handlePetDragHeartbeat);
  ipcMain.on('pet-drag-end', drag.handlePetDragEnd);
  ipcMain.on('pet-clicked', pet.handlePetClicked);
  ipcMain.on('pet-right-clicked', pet.handlePetRightClicked);
  ipcMain.on('pet-set-ignore-mouse', drag.handlePetSetIgnoreMouse);

  // 插件市场 IPC
  ipcMain.handle('market:list', async () => {
    const registry = await fetchPluginRegistry();
    marketRegistryCache = registry;
    const installed = plugins.listInstalledPlugins();
    const disabled = plugins.listDisabledPlugins();
    const bundledNames = [];
    try {
      bundledNames.push(...fs.readdirSync(plugins.bundledPluginsDir()));
    } catch { /* no bundled dir */ }
    const updates = plugins.computePluginUpdates(registry.plugins);
    return { registry, installed, disabled, bundledNames, updates, profileDir: plugins.profileDir(), dshHome: backend.dshHome() };
  });
  // 快速状态：只读本地已装/已禁用（不拉在线目录），用于操作后即时刷新
  ipcMain.handle('market:state', () => ({
    installed: plugins.listInstalledPlugins(),
    disabled: plugins.listDisabledPlugins(),
    bundledNames: (() => { try { return fs.readdirSync(plugins.bundledPluginsDir()); } catch { return []; } })(),
    updates: plugins.computePluginUpdates((marketRegistryCache && marketRegistryCache.plugins) || []),
  }));
  ipcMain.handle('market:install', async (_e, spec) => {
    if (typeof spec !== 'string' || !spec) return { ok: false, message: '无效的插件标识' };
    return await plugins.installPlugin(spec);
  });
  ipcMain.handle('market:uninstall', async (_e, pkg) => {
    if (typeof pkg !== 'string' || !pkg) return { ok: false, message: '无效的插件名' };
    // 解析真实包名（防 github:xxx 原始标识）
    const real = plugins.resolveInstalledName(pkg) || pkg;
    return await plugins.uninstallPlugin(real);
  });
  // 禁用 = 从 bundles 移除（保留 node_modules，重启后不再加载）；启用 = 加回 bundles
  ipcMain.handle('market:disable', async (_e, pkg) => {
    const real = plugins.resolveInstalledName(pkg);
    if (!real) return { ok: false, message: '无法解析插件包名：' + String(pkg).slice(0, 60) };
    plugins.removeBundle(real);
    return { ok: true, message: `已禁用 ${real}（重启后生效）` };
  });
  ipcMain.handle('market:enable', async (_e, pkg) => {
    const real = plugins.resolveInstalledName(pkg);
    console.log('[bigfish] market:enable input=', JSON.stringify(pkg), 'resolved=', real, 'disabled=', JSON.stringify(plugins.listDisabledPlugins()));
    if (!real) return { ok: false, message: '无法解析插件包名：' + String(pkg).slice(0, 60) };
    if (!plugins.isPlainPackageName(real)) return { ok: false, message: '非法包名：' + real };
    const added = plugins.addBundle(real);
    console.log('[bigfish] market:enable added=', added, 'bundles=', JSON.stringify(plugins.profileBundles()));
    return { ok: added, message: added ? `已启用 ${real}（重启后生效）` : `写入失败：${real}` };
  });
  ipcMain.handle('market:restart', async () => {
    try {
      await backend.restartBackend();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: String((err && err.message) || err) };
    }
  });
  // 插件更新（§2.2.5）：单个更新走 installPlugin + 一次 restartBackend；全部更新逐项执行后一次重启
  ipcMain.handle('market:update', async (_e, spec) => {
    if (typeof spec !== 'string' || !spec) return { ok: false, message: '无效的更新标识' };
    const res = await plugins.installPlugin(spec);
    if (!res.ok) {
      updaterLog(`plugin update spec=${spec} result=fail detail=${String(res.message).replace(/\s+/g, ' ').slice(0, 120)}`);
      return res;
    }
    try {
      await backend.restartBackend();
    } catch (err) {
      updaterLog(`plugin update spec=${spec} result=fail detail=restart:${String((err && err.message) || err).slice(0, 120)}`);
      return { ok: false, message: '已安装但重启失败：' + ((err && err.message) || err) };
    }
    updaterLog(`plugin update spec=${spec} result=ok`);
    return res;
  });
  ipcMain.handle('market:update-all', async () => {
    const registry = await fetchPluginRegistry();
    const updates = plugins.computePluginUpdates(registry.plugins);
    const results = [];
    for (const u of updates) {
      const res = await plugins.installPlugin(u.updateSpec);
      results.push({ id: u.id, name: u.name, ok: res.ok, message: res.message });
      updaterLog(`plugin update spec=${u.updateSpec} result=${res.ok ? 'ok' : 'fail'} detail=${String(res.message).replace(/\s+/g, ' ').slice(0, 120)}`);
    }
    try {
      await backend.restartBackend(); // 全部完成（含部分失败）后一次重启
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
  ipcMain.handle('affinity:view', affinity.handleAffinityView);
  ipcMain.handle('affinity:exchange', affinity.handleAffinityExchange);
  ipcMain.handle('affinity:buy', affinity.handleAffinityBuy);
}
