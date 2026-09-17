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
let completionFsWatcher = null;   // fs.watch 句柄（Windows：OS 级递归监听，零轮询开销）
let fallbackScanRunning = false;  // 回落路径的异步扫描在途标记（防重叠）
let lastSeenMtime = null;         // 回落路径的 mtime 基线（null = 首次扫描只建基线，不报 busy）
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

/** 忽略面（busy 谓词用；= 旧实现 skip 语义原样）：路径任一段落命中 ⇒ 该写入不计忙。 */
const IGNORED_SEGMENTS = new Set(['profiles', 'node_modules']);

/**
 * busy 谓词（单一实现，watch 与回落两路共用）：相对路径「任一段落」∈ IGNORED_SEGMENTS ⇒ 忽略。
 * 文件名缺失（Windows 偶发 null / 空）⇒ false = 计忙（保守：宁可推迟通知，不误报「完成」）。
 */
function isIgnoredPath(relPath) {
  if (!relPath) return false;
  return String(relPath).split(/[\\/]/).some((seg) => IGNORED_SEGMENTS.has(seg));
}

/**
 * 异步扫描（回落路径使用）：递归取最新 mtime；全程 fs.promises ⇒ 不阻塞主进程事件循环
 * （Windows 主路径 = fs.watch，不走这里）。忽略面与 watch 路径共用 isIgnoredPath。
 */
async function latestMtimeAsync(dir, relPath) {
  let latest = 0;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return latest;
  }
  for (const e of entries) {
    const childRel = relPath ? `${relPath}/${e.name}` : e.name;
    if (isIgnoredPath(childRel)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const t = await latestMtimeAsync(full, childRel);
      if (t > latest) latest = t;
    } else if (e.isFile()) {
      try {
        const t = (await fs.promises.stat(full)).mtimeMs;
        if (t > latest) latest = t;
      } catch { /* ignore */ }
    }
  }
  return latest;
}

/**
 * 任务完成探测（2026-09-17 重写：消除「每 5 秒同步遍历整个 dshHome」的卡顿源）。
 * 旧实现每 5000ms 在主进程同步递归 stat 全树（本机实测 ~2 万文件、单次 ~2.2s）⇒
 *   主进程每 5~6 秒被阻塞 1~2 秒，表现为周期性卡顿 / 鼠标短暂失效。
 * 新实现：
 *   主路径（Windows，Node ≥20 支持 recursive watch）= fs.watch OS 级递归监听，事件到达即记 busy，零磁盘轮询；
 *   回落路径（recursive watch 建监听即抛错经 try/catch 进入；运行期 error 亦切此路——修正 D）= latestMtimeAsync
 *     异步扫描（不阻塞），在途时跳过重叠触发；
 *   定时器每 5s 只做空闲判定的纯算术（无 I/O）：busy 后静默超 IDLE_NOTIFY_MS 且未报过 ⇒ 通知一次。
 * 事件过滤（watch 与回落同谓词 = isIgnoredPath）：路径任一段落为 profiles / node_modules 的变动不算 busy
 *   （= 旧实现的 skip 语义原样）。
 */
function startCompletionWatcher() {
  stopCompletionWatcher();
  let useWatch = false;
  try {
    completionFsWatcher = fs.watch(getDshHome(), { recursive: true }, (_event, filename) => {
      if (!settings.get().notifyOnComplete) return; // 修正 C：关闭期间的活动不记账（重开不补发）
      if (isIgnoredPath(filename)) return;
      lastBusyAt = Date.now();
      notifiedForCycle = false;
    });
    // 修正 D：常驻 error 监听——监听死去即切回落路径并留诊断行（不再静默失效）
    completionFsWatcher.on('error', () => {
      useWatch = false;
      console.log('[bigfish] completion watcher unavailable; falling back to async scan');
    });
    useWatch = true;
  } catch { useWatch = false; } // recursive watch 建监听即抛错（非 Windows）⇒ 回落异步扫描
  completionWatcherTimer = setInterval(() => {
    // 关闭期间不推进也不保留回落基线（重开首扫只重建）；并清忙态——与托盘开关的清零同语义
    // （shell-tray.js 的 setNotify(false) 面），防「切换瞬间在途的回落扫描」把忙态回填 ⇒ 重开补发
    if (!settings.get().notifyOnComplete) {
      lastSeenMtime = null; lastBusyAt = 0; notifiedForCycle = false; return;
    }
    if (!useWatch && !fallbackScanRunning) {
      fallbackScanRunning = true;
      latestMtimeAsync(getDshHome(), '').then((t) => {
        if (lastSeenMtime === null) {
          lastSeenMtime = t; // 首次扫描只建基线（对齐旧语义：无新写入不报 busy）
        } else if (t > lastSeenMtime) {
          lastSeenMtime = t;
          lastBusyAt = Date.now();
          notifiedForCycle = false;
        }
      }).catch(() => {}).finally(() => { fallbackScanRunning = false; });
    }
    if (lastBusyAt > 0 && Date.now() - lastBusyAt > IDLE_NOTIFY_MS && !notifiedForCycle) {
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
  if (completionFsWatcher) {
    try { completionFsWatcher.close(); } catch { /* best effort */ }
    completionFsWatcher = null;
  }
}

// ---- 转发访问器（§2.2.6 允许面②：setNotify 的跨模块写面）----
function setLastBusyAt(v) { lastBusyAt = v; }
function setNotifiedForCycle(v) { notifiedForCycle = v; }

module.exports = {
  notify,
  startCompletionWatcher,
  stopCompletionWatcher,
  setLastBusyAt,
  setNotifiedForCycle,
  init,
};
