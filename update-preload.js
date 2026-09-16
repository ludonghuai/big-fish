'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updAPI', {
  onStatus: (cb) => ipcRenderer.on('upd:status', (_e, payload) => cb(payload)),
  cancel: () => ipcRenderer.send('upd:cancel'),
  installNow: () => ipcRenderer.send('upd:install-now'),
  retry: () => ipcRenderer.send('upd:retry'),
  closeWindow: () => ipcRenderer.send('upd:close-window'),
});
