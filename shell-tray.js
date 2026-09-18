'use strict';
/**
 * shell-tray.js — 托盘菜单 + 全局快捷键 + Windows 右键菜单 + uninstall()（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6）。
 */

const { app, dialog, Tray, Menu, nativeImage, globalShortcut, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const settings = require('./shell-settings.js');
const assets = require('./shell-assets.js');
const win = require('./shell-window.js');
const mode = require('./shell-mode.js');
const update = require('./shell-update.js');
const market = require('./shell-market.js');
const affinity = require('./shell-affinity.js');
const pet = require('./shell-pet.js');
const physics = require('./shell-pet-physics.js');
const notifier = require('./shell-notify.js');

// 注入面（组合根 main.js 接线）：setQuitting（组合根）/ APP_NAME（常量）/ setPetWorkStatus（B19：工作状态开关传播面，§2.7）
let setQuitting = null;
let APP_NAME = null;
let setPetWorkStatus = null;
function init(deps) { setQuitting = deps.setQuitting; APP_NAME = deps.APP_NAME; setPetWorkStatus = deps.setPetWorkStatus; }

/** @type {Tray | null} */
let tray = null;

function uninstall() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ type: 'info', title: APP_NAME, message: '卸载功能只在安装版可用', detail: '请安装打包好的 Bigfish 后再使用卸载。' });
    return;
  }
  const uninstaller = path.join(path.dirname(process.execPath), 'Uninstall Bigfish.exe');
  if (fs.existsSync(uninstaller)) {
    setQuitting(true);
    spawn(uninstaller, [], { detached: true, stdio: 'ignore' });
    setTimeout(() => app.quit(), 800);
  } else {
    shell.openExternal('ms-settings:appsfeatures');
  }
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
  tray.on('click', () => win.toggleMainWindow());
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏主界面', click: () => win.toggleMainWindow() },
    { label: '检查更新', click: () => { update.manualCheckUpdates(); } },
    { type: 'separator' },
    // 模式提级为一级 radio（US-4 / 用户点名项）
    { label: '🐳 鲸鱼模式', type: 'radio', checked: settings.get().mode !== 'focus', click: () => mode.setMode('whale') },
    { label: '🧘 专注模式', type: 'radio', checked: settings.get().mode === 'focus', click: () => mode.setMode('focus') },
    { label: '更换背景…', click: () => mode.chooseBackground() },
    { label: '恢复默认背景', click: () => mode.resetBackground() },
    { type: 'separator' },
    { label: '插件市场', click: () => market.createMarketWindow() },
    // 鲸鱼娘兑换屋：一级常驻项（无 enabled 条件）——专注模式下唯一可达入口（US-4 硬要求 / DD-3）
    { label: '鲸鱼娘兑换屋', click: () => affinity.openExchangeWindow() },
    {
      label: '设置',
      submenu: [
        { label: '自动检查更新', type: 'checkbox', checked: settings.get().autoCheckUpdates, click: (item) => setAutoCheckUpdates(item.checked) },
        { label: '任务完成时通知', type: 'checkbox', checked: settings.get().notifyOnComplete, click: (item) => setNotify(item.checked) },
        // 甩抛物理手感（B20 / US-27）：专注模式（无桌宠窗口）下开关无对象 ⇒ 置灰（open-2 ①，同「找回鲸鱼娘」）
        { label: '甩抛物理手感', type: 'checkbox', enabled: settings.get().mode !== 'focus', checked: settings.get().petPhysicsEnabled, click: (item) => setPetPhysics(item.checked) },
        // 工作状态联动（B19 / US-23）：与「任务完成时通知」同形；专注模式（无桌宠窗口）下开关无对象 ⇒ 置灰（同物理开关口径）
        { label: '工作状态联动', type: 'checkbox', enabled: settings.get().mode !== 'focus', checked: settings.get().petWorkStatus, click: (item) => setPetWork(item.checked) },
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
    { label: '退出', click: () => { setQuitting(true); app.quit(); } },
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

/** 甩抛物理手感开关（B20 / US-27）：落盘 settings.json 顶层布尔；关闭时正在飞 ⇒ 立即停泊收口（§2.2.8）。 */
function setPetPhysics(enabled) {
  settings.get().petPhysicsEnabled = enabled;
  settings.saveSettings();
  physics.handlePhysicsToggle(enabled);
  rebuildTrayMenu();
}

/** 工作状态联动开关（B19 / US-23 / §2.8.3 #6）：写权 = 本处（落盘 settings.json 顶层布尔）；传播 = 注入面 setPetWorkStatus(checked)。 */
function setPetWork(enabled) {
  settings.get().petWorkStatus = enabled;
  settings.saveSettings();
  if (setPetWorkStatus) setPetWorkStatus(enabled);
  rebuildTrayMenu();
}

// ---------------------------------------------------------------------------
// Global shortcut
// ---------------------------------------------------------------------------
function registerShortcuts() {
  const accel = 'CommandOrControl+Shift+D';
  try {
    globalShortcut.register(accel, () => win.toggleMainWindow());
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

module.exports = {
  createTray,
  rebuildTrayMenu,
  registerShortcuts,
  setAutoStart,
  init,
};
