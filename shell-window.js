'use strict';
/**
 * shell-window.js — 主窗口（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6）。
 */

const { BrowserWindow, shell } = require('electron');
const path = require('node:path');
const assets = require('./shell-assets.js');
const backend = require('./shell-backend.js');
const mode = require('./shell-mode.js');
const pet = require('./shell-pet.js');
const notifier = require('./shell-notify.js');

// 注入面（组合根 main.js 接线）：HOST / APP_NAME（常量）/ isQuitting（组合根）
let HOST = null;
let APP_NAME = null;
let isQuitting = null;
function init(deps) { HOST = deps.HOST; APP_NAME = deps.APP_NAME; isQuitting = deps.isQuitting; }

/** @type {BrowserWindow | null} */
let mainWindow = null;

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
    if (!isQuitting()) {
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
// --open <path> handling
// ---------------------------------------------------------------------------
function handleOpenArg(argv) {
  const i = argv.indexOf('--open');
  if (i === -1 || !argv[i + 1]) return;
  const target = argv[i + 1];
  showMainWindow();
  notifier.notify(APP_NAME, `已打开: ${target}`);
}

/** 主窗口访问器（跨模块读面；无窗口时为 null）。 */
function getMainWindow() { return mainWindow; }

module.exports = {
  createWindow,
  showMainWindow,
  toggleMainWindow,
  getMainWindow,
  handleOpenArg,
  init,
};
