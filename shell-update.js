'use strict';
/**
 * shell-update.js — 更新编排（呈现 / 门禁 / 调度 / Harness 停-切-启编排）+ upd:* 处理器函数
 * （B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6）。
 */

const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const updater = require('./updater.js');
const backend = require('./shell-backend.js');
const notifier = require('./shell-notify.js');
const settings = require('./shell-settings.js');
const assets = require('./shell-assets.js');

// 注入面（组合根 main.js 接线）：setQuitting（组合根）/ APP_NAME（常量）/
//                                 runtimeNodeExe、bundledPnpmPath（plugins——update 复用插件引擎的运行时路径）
let setQuitting = null;
let APP_NAME = null;
let runtimeNodeExe = null;
let bundledPnpmPath = null;
function init(deps) {
  setQuitting = deps.setQuitting;
  APP_NAME = deps.APP_NAME;
  runtimeNodeExe = deps.runtimeNodeExe;
  bundledPnpmPath = deps.bundledPnpmPath;
}

// 检查更新：从 Gitee 仓库 raw 拉取 latest.json（唯一清单源；AC6）。
// 测试钩子：BIGFISH_UPDATE_URL 可覆盖（设计档 §2.2.2 假清单桩；仅此面允许 http 本地桩）。
const UPDATE_MANIFEST_URL = process.env.BIGFISH_UPDATE_URL
  || 'https://gitee.com/ludonghuai/big-fish/raw/main/latest.json';
const UPDATE_POLL_MS = Number(process.env.BIGFISH_UPDATE_INTERVAL_MS) || 21600000; // 6h（AC2 短轮询可覆盖）

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

function handleUpdCancel() {
  if (updateMode === 'harness') updater.cancelHarnessInstall();
  else updater.cancelAppDownload();
}

function handleUpdInstallNow() {
  if (updateMode !== 'app' || !pendingAppFile) return;
  const res = updater.installApp(pendingAppFile);
  if (!res.ok) { sendUpdateStatus({ mode: 'app', phase: 'error', message: res.error }); return; }
  setQuitting(true);
  setTimeout(() => app.quit(), 800); // 先例：uninstall()
}

function handleUpdRetry() {
  if (updateMode === 'harness') {
    if (pendingHarnessInfo) startHarnessUpdate(pendingHarnessInfo);
  } else if (pendingAppInfo) {
    startAppDownload(pendingAppInfo);
  }
}

function handleUpdCloseWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close();
}

module.exports = {
  updaterLog,
  scheduleUpdateChecks,
  manualCheckUpdates,
  handleUpdCancel,
  handleUpdInstallNow,
  handleUpdRetry,
  handleUpdCloseWindow,
  init,
};
