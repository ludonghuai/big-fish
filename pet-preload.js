'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  dragStart: () => ipcRenderer.send('pet-drag-start'),
  dragHeartbeat: () => ipcRenderer.send('pet-drag-heartbeat'),
  dragEnd: (reason) => ipcRenderer.send('pet-drag-end', reason),
  clicked: () => ipcRenderer.send('pet-clicked'),
  rightClicked: () => ipcRenderer.send('pet-right-clicked'),
  onSay: (cb) => ipcRenderer.on('pet-say', (_e, msg) => cb(msg)),
  onState: (cb) => ipcRenderer.on('pet-state', (_e, s) => cb(s)),
  onAffinity: (cb) => ipcRenderer.on('pet-affinity', (_e, a) => cb(a)),
  onDragCancel: (cb) => ipcRenderer.on('pet-drag-cancel', () => cb()),
  setIgnoreMouse: (ignore) => ipcRenderer.send('pet-set-ignore-mouse', ignore),
});
