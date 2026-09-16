'use strict';
/**
 * shell-ipc.js — IPC 通道注册层（薄绑定：通道 → 域处理器函数；B06 F6 拆分，设计档 docs/design/SHELL-UX.md §2.2.6 依赖方向规则 4）。
 * 通道清单单点可审计——注册顺序与拆分前 main.js 逐条一致。
 */
const { ipcMain } = require('electron');
const pet = require('./shell-pet.js');
const drag = require('./shell-pet-drag.js');
const affinity = require('./shell-affinity.js');
const market = require('./shell-market.js');
const update = require('./shell-update.js');

/** 注册全部 IPC 通道（组合根在取得单实例锁后调用；每通道一条薄绑定）。 */
function register() {
  // Pet drag + click（拖动移动由主进程按全局光标绝对定位驱动，设计档 PET-DRAG §2.2）
  ipcMain.on('pet-drag-start', drag.handlePetDragStart);
  ipcMain.on('pet-drag-heartbeat', drag.handlePetDragHeartbeat);
  ipcMain.on('pet-drag-end', drag.handlePetDragEnd);
  ipcMain.on('pet-clicked', pet.handlePetClicked);
  ipcMain.on('pet-right-clicked', pet.handlePetRightClicked);
  ipcMain.on('pet-set-ignore-mouse', drag.handlePetSetIgnoreMouse);
  // 插件市场 IPC
  ipcMain.handle('market:list', market.marketList);
  ipcMain.handle('market:state', market.marketState);
  ipcMain.handle('market:install', market.marketInstall);
  ipcMain.handle('market:uninstall', market.marketUninstall);
  ipcMain.handle('market:disable', market.marketDisable);
  ipcMain.handle('market:enable', market.marketEnable);
  ipcMain.handle('market:restart', market.marketRestart);
  ipcMain.handle('market:update', market.marketUpdate);
  ipcMain.handle('market:update-all', market.marketUpdateAll);
  ipcMain.on('market-open-external', market.marketOpenExternal);
  // 更新窗口 IPC（U-13：关闭只关窗不取消；取消 → 中止在途并清临时，回到可重试态）
  ipcMain.on('upd:cancel', update.handleUpdCancel);
  ipcMain.on('upd:install-now', update.handleUpdInstallNow);
  ipcMain.on('upd:retry', update.handleUpdRetry);
  ipcMain.on('upd:close-window', update.handleUpdCloseWindow);
  // 好感度 / 兑换屋 IPC
  ipcMain.handle('affinity:view', affinity.handleAffinityView);
  ipcMain.handle('affinity:exchange', affinity.handleAffinityExchange);
  ipcMain.handle('affinity:buy', affinity.handleAffinityBuy);
}

module.exports = { register };
