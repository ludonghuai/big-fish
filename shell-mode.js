'use strict';
/**
 * shell-mode.js — 背景与模式（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6）。
 */

const { app, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const settings = require('./shell-settings.js');

// 注入面（组合根 main.js 接线）：getMainWindow（window）/ destroyPetWindow、ensurePet（pet）/
//                                 rebuildTrayMenu（tray）/ notify（notify）/ APP_NAME（常量）
let getMainWindow = null;
let destroyPetWindow = null;
let ensurePet = null;
let rebuildTrayMenu = null;
let notify = null;
let APP_NAME = null;
function init(deps) {
  getMainWindow = deps.getMainWindow;
  destroyPetWindow = deps.destroyPetWindow;
  ensurePet = deps.ensurePet;
  rebuildTrayMenu = deps.rebuildTrayMenu;
  notify = deps.notify;
  APP_NAME = deps.APP_NAME;
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
  if (!getMainWindow() || getMainWindow().isDestroyed()) return;
  if (bgCssKey) {
    try { getMainWindow().webContents.removeInsertedCSS(bgCssKey); } catch { /* ignore */ }
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
  getMainWindow().webContents.insertCSS(css).then((key) => { bgCssKey = key; }).catch(() => {});
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
    destroyPetWindow();
  } else {
    ensurePet();
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
  const result = await dialog.showOpenDialog(getMainWindow(), {
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

module.exports = {
  applyBackground,
  setMode,
  maybeShowModeDialog,
  chooseBackground,
  resetBackground,
  init,
};
