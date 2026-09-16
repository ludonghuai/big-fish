'use strict';
/**
 * shell-settings.js — settings 载入 / 保存 / 默认值（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6）。
 * 属主状态：settings 对象 / settingsFileCorrupt——跨模块读写经 get() / isFileCorrupt()（§2.2.6 依赖方向规则 3）。
 */

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// ---------------------------------------------------------------------------
// Settings (persisted to userData/settings.json)
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  notifyOnComplete: true,
  launchAtLogin: false,
  autoCheckUpdates: true, // 自动检查更新开关（启动检查 + 6h 轮询；托盘 checkbox，§2.2.7）
  petEnabled: true,
  mode: 'whale',        // 'whale' 鲸鱼模式（桌宠+背景图） | 'focus' 专注模式（无桌宠、纯色背景）
  modeChosen: false,    // 是否已弹过模式选择
  lastModeVersion: '',  // 上次选择模式时的版本号（更新后重新弹窗）
  petPos: null,         // 桌宠上次位置（DIP 整数 { x, y }；null = 无存档）——US-13
};
let settings = { ...DEFAULT_SETTINGS };

// settings.json 存在但无法解析（整个 JSON 损坏）——与「无存档」区分：
//   无存档（首次运行）⇒ 不带 x/y 建窗（TC-18）；损坏 ⇒ 回落 geometry.petDefaultPos()（TC-19）。
let settingsFileCorrupt = false;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}
function loadSettings() {
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
    settingsFileCorrupt = false;
  } catch (err) {
    // ENOENT = 文件不存在（首次运行，无存档）；其余（解析失败 / 不可读）= 存档损坏
    settingsFileCorrupt = !!err && err.code !== 'ENOENT';
    settings = { ...DEFAULT_SETTINGS };
  }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('[bigfish] failed to save settings:', err);
  }
}

module.exports = {
  loadSettings,
  saveSettings,
  /** settings 对象访问器（loadSettings 后为磁盘载入副本；跨模块读写面）。 */
  get() { return settings; },
  /** settings.json 损坏标志（「无存档」与「存档损坏」的区分面）。 */
  isFileCorrupt() { return settingsFileCorrupt; },
};
