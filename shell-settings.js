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
  petPhysicsEnabled: false, // 甩抛物理手感（B20 / US-27）：默认关（U-1 ②「默认行为保守」——开关改的是可感知的松手后行为）
  petWorkStatus: false,   // 工作状态联动（B19 / US-23）：默认关（U-1 采用推荐值——样本 workStatusEnabled 注释明写默认关 + 保守默认；开关改的是可感知的动画档位）
  petUnlockSeason: true,  // 时节门（B23 / US-38）：默认开（用户 2026-09-20 裁定「做了门禁就要使用」；关 = 该门来源不做过滤）
  petUnlockMeal: true,    // 饭点门（B23 / US-39）：默认开（同上）
  petUnlockLevel: true,   // 等级门（B23 / US-40）：默认开（同上）
  petUnlockFavOnly: false, // 只看喜欢（B35 / US-47）：默认关；开 = 链面「喜欢 ∩ 已解锁 − 屏蔽」合取 + 卡墙只显喜欢组（双面同键，无双源）
  petUnlockLv10: true,    // Lv.10 特权（B35 / US-49）：默认开（D-4 + U-5 ②）；满级后时节 / 饭点时间窗与「一天一次」解除；关 ⇒ 满级回 B23 语义
  petExchangeSize: null,  // 兑换屋尺寸（B35 / US-44 / US-50）：{ w, h } 或 null = 未调过（默认 720×560；读取走 clampWindowSize 钳制）
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
