'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('exchangeAPI', {
  view: () => ipcRenderer.invoke('affinity:view'),
  exchange: () => ipcRenderer.invoke('affinity:exchange'),
  buy: (foodId) => ipcRenderer.invoke('affinity:buy', foodId),
  unlock: () => ipcRenderer.invoke('unlock:view'),
  // B35 图鉴卡片墙（PET-GALLERY §2.4.3；桥键三枚逐名登记——硬约束 9）
  prefsLike: (name, on) => ipcRenderer.invoke('prefs:like', { name, on }),
  prefsBlock: (name, on) => ipcRenderer.invoke('prefs:block', { name, on }),
  setFavOnly: (on) => ipcRenderer.invoke('unlock:fav-only', { on }),
});
