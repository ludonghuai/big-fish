'use strict';
/**
 * shell-assets.js — 图标路径（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6）。
 */

const path = require('node:path');
const fs = require('node:fs');

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
function appIconPath() {
  const candidates = [
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, 'build', 'icon.png'),
    path.join(__dirname, 'build', 'icon.ico'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return undefined;
}
function trayIconPath() {
  const candidates = [
    path.join(__dirname, 'assets', 'tray.png'),
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, 'build', 'tray.png'),
    path.join(__dirname, 'build', 'icon.png'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return undefined;
}

module.exports = { appIconPath, trayIconPath };
