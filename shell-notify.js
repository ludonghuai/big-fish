'use strict';
/**
 * shell-notify.js — 系统通知 + 任务完成提醒（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6）。
 * 属主状态：completionWatcherTimer / lastBusyAt / notifiedForCycle——跨模块写经 setLastBusyAt / setNotifiedForCycle。
 */

const { Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assets = require('./shell-assets.js');
const settings = require('./shell-settings.js');

// 注入面（组合根 main.js 接线）：getDshHome（backend）/ petSay（pet）/ IDLE_NOTIFY_MS（常量）
let getDshHome = null;
let petSay = null;
let IDLE_NOTIFY_MS = 0;
function init(deps) { getDshHome = deps.getDshHome; petSay = deps.petSay; IDLE_NOTIFY_MS = deps.IDLE_NOTIFY_MS; }

let completionWatcherTimer = null;
let lastBusyAt = 0;
let notifiedForCycle = false;

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  try {
    const n = new Notification({ title, body, icon: assets.appIconPath() });
    if (typeof onClick === 'function') n.on('click', onClick); // 气泡点击（U-2：点击查看 → 弹窗）
    n.show();
  } catch (err) {
    console.error('[bigfish] notification failed:', err);
  }
}

// Heuristic "task completed" detector: watch DSH_HOME (excluding the static
// profiles/ tree) for writes; after a burst of activity followed by idle, notify.

function latestMtime(dir, skipNames, out) {
  out = out || { t: 0 };
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (skipNames && skipNames.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      latestMtime(full, skipNames, out);
    } else if (e.isFile()) {
      try {
        const t = fs.statSync(full).mtimeMs;
        if (t > out.t) out.t = t;
      } catch { /* ignore */ }
    }
  }
  return out;
}

function startCompletionWatcher() {
  stopCompletionWatcher();
  const skip = new Set(['profiles', 'node_modules']);
  completionWatcherTimer = setInterval(() => {
    if (!settings.get().notifyOnComplete) return;
    const { t } = latestMtime(backend.dshHome(), skip);
    const now = Date.now();
    if (t > lastBusyAt + 2000 && now - t < 2000) {
      // fresh write => busy
      lastBusyAt = now;
      notifiedForCycle = false;
    } else if (lastBusyAt > 0 && now - lastBusyAt > IDLE_NOTIFY_MS && !notifiedForCycle) {
      notifiedForCycle = true;
      const msg = 'Bigfish 任务已完成';
      notify(msg, '后端已空闲，可以回来看看结果了');
      petSay('任务完成啦！');
    }
  }, 5000);
}

function stopCompletionWatcher() {
  if (completionWatcherTimer) {
    clearInterval(completionWatcherTimer);
    completionWatcherTimer = null;
  }
}

// ---- 转发访问器（§2.2.6 允许面②：setNotify 的跨模块写面）----
function setLastBusyAt(v) { lastBusyAt = v; }
function setNotifiedForCycle(v) { notifiedForCycle = v; }

module.exports = {
  notify,
  latestMtime,
  startCompletionWatcher,
  stopCompletionWatcher,
  setLastBusyAt,
  setNotifiedForCycle,
  init,
};
