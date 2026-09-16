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
backend.init({ HOST, READY_TIMEOUT_MS, sanitizeProfileBundles: sanitizeProfileBundles, getMainWindow: getMainWindow });
geometry.init({ getPetWindow: pet.getPetWindow, getPetDrag: drag.getPetDrag });
drag.init({ getPetWindow: pet.getPetWindow, pet });
pet.init({ showMainWindow: showMainWindow, openExchangeWindow: openExchangeWindow, broadcastAffinity: broadcastAffinity });

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
    runtime: { nodeExe: runtimeNodeExe(), pnpm: bundledPnpmPath() },
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
  mainWindow.webContents.on('did-finish-load', () => applyBackground());

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
    const file = path.join(backend.dshHome(), 'storages', 'session_projcache.json');
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
  if (pet.getPetWindow() && !pet.getPetWindow().isDestroyed()) {
    pet.getPetWindow().webContents.send('pet-affinity', affinityView());
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
          pet.petSay(`好感 +1，现在是 Lv.${v.level} 啦~`);
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
    icon: assets.appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'exchange-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 放在鲸鱼娘右侧（放不下就放左边）
  if (pet.getPetWindow() && !pet.getPetWindow().isDestroyed()) {
    const [px, py] = pet.getPetWindow().getPosition();
    const [pw] = pet.getPetWindow().getSize();
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
  const home = backend.dshHome();
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
    backend.stopDsh();
    await new Promise((r) => setTimeout(r, 1500));
    fs.rmSync(home, { recursive: true, force: true });
    notifier.notify(APP_NAME, '数据已重置，即将退出，请重新打开');
  } catch (err) {
    console.error('[bigfish] 重置数据失败:', err);
    dialog.showErrorBox(APP_NAME, '重置失败，请手动删除 ' + home);
  }
  quitting = true;
  app.quit();
}

/** 重置配置但保留会话和工程（用于"AI 删插件改坏配置导致后端超时"等场景）。 */
async function resetConfigKeepSessions() {
  const home = backend.dshHome();
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
    backend.stopDsh();
    await new Promise((r) => setTimeout(r, 1500));
    fs.rmSync(path.join(home, 'profiles'), { recursive: true, force: true });
    notifier.notify(APP_NAME, '插件配置已重置，API Key、会话和工程已保留。即将退出，请重新打开');
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
  if (settings.get().mode === 'focus') {
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
  settings.get().mode = m;
  settings.get().petEnabled = m === 'whale';
  settings.get().modeChosen = true;
  settings.get().lastModeVersion = app.getVersion();
  settings.saveSettings();
  if (m === 'focus') {
    pet.destroyPetWindow();
  } else {
    pet.ensurePet();
  }
  applyBackground();
  rebuildTrayMenu();
}

/** 首次安装 / 更新后弹窗让用户选择模式。 */
function maybeShowModeDialog() {
  const firstRun = !settings.get().modeChosen;
  const updated = settings.get().lastModeVersion !== app.getVersion();
  if (!firstRun && !updated) return;
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    title: APP_NAME,
    message: '选择你的 Bigfish 模式',
    detail: [
      '🐳 鲸鱼模式：桌宠鲸鱼娘陪伴，带背景图（默认）。',
      '🧘 专注模式：隐藏桌宠，恢复纯色背景，适合专心工作学习。',
      '',
      '之后可以在托盘菜单切换「🐳 鲸鱼模式 / 🧘 专注模式」。',
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
    notifier.notify(APP_NAME, '背景已更换');
  } catch (err) {
    console.error('[bigfish] 更换背景失败:', err);
  }
}

/** 恢复默认背景。 */
function resetBackground() {
  try { fs.unlinkSync(path.join(app.getPath('userData'), 'custom-background.jpg')); } catch { /* 没有自定义背景 */ }
  applyBackground();
  notifier.notify(APP_NAME, '已恢复默认背景');
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏主界面', click: () => toggleMainWindow() },
    { label: '检查更新', click: () => { manualCheckUpdates(); } },
    { type: 'separator' },
    // 模式提级为一级 radio（US-4 / 用户点名项）
    { label: '🐳 鲸鱼模式', type: 'radio', checked: settings.get().mode !== 'focus', click: () => setMode('whale') },
    { label: '🧘 专注模式', type: 'radio', checked: settings.get().mode === 'focus', click: () => setMode('focus') },
    { label: '更换背景…', click: () => chooseBackground() },
    { label: '恢复默认背景', click: () => resetBackground() },
    { type: 'separator' },
    { label: '插件市场', click: () => createMarketWindow() },
    // 鲸鱼娘兑换屋：一级常驻项（无 enabled 条件）——专注模式下唯一可达入口（US-4 硬要求 / DD-3）
    { label: '鲸鱼娘兑换屋', click: () => openExchangeWindow() },
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
        { label: '重置插件配置（保留 API Key 和会话）', click: () => resetConfigKeepSessions() },
        { label: '彻底恢复出厂（清空所有）', click: () => resetAllData() },
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
// Plugin manager — install/remove DSH plugins in the web profile
// (~/.dsh/profiles/web) using the bundled pnpm, then restart the backend.
// ---------------------------------------------------------------------------
const PLUGIN_REGISTRY_URL = 'https://awesome-dsh-plugin.com/plugins.json';
const PLUGIN_REGISTRY_FALLBACK = 'https://gitee.com/ludonghuai/big-fish/raw/main/plugins.json';
const NPM_REGISTRY = 'https://registry.npmmirror.com/';

function profileDir() {
  return path.join(backend.dshHome(), 'profiles', 'web');
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
  args.push('--store-dir', path.join(backend.dshHome(), 'pnpm-store'));
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
    loadAffinity();
    startAffinityWatcher();
    scheduleUpdateChecks();
    // 显示器配置变化（E5 三事件，DD-8）：失效拖动缓存 + 校正到可见区 + 落盘
    screen.on('display-added', (_e, display) => geometry.handleDisplayChange('added', display));
    screen.on('display-removed', (_e, display) => geometry.handleDisplayChange('removed', display));
    screen.on('display-metrics-changed', (_e, display, changedMetrics) => geometry.handleDisplayChange('metrics', display, changedMetrics));
    // 首次安装 / 更新后：弹窗让用户选择模式（鲸鱼 / 专注）
    maybeShowModeDialog();
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
    stopAffinityWatcher();
    saveAffinity();
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
    const installed = listInstalledPlugins();
    const disabled = listDisabledPlugins();
    const bundledNames = [];
    try {
      bundledNames.push(...fs.readdirSync(bundledPluginsDir()));
    } catch { /* no bundled dir */ }
    const updates = computePluginUpdates(registry.plugins);
    return { registry, installed, disabled, bundledNames, updates, profileDir: profileDir(), dshHome: backend.dshHome() };
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
      await backend.restartBackend();
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
    const updates = computePluginUpdates(registry.plugins);
    const results = [];
    for (const u of updates) {
      const res = await installPlugin(u.updateSpec);
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
    pet.petSay(food.msg);
    pet.setPetState('eat');
    clearTimeout(pet.getEatTimer());
    pet.setEatTimer(setTimeout(() => { if (pet.getPetState() === 'eat') pet.setPetState('idle'); }, 2000));
    broadcastAffinity();
    return { ok: true, message: food.msg, view: affinityView() };
  });
}
