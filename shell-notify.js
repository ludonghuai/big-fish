'use strict';
/**
 * shell-notify.js — 系统通知 + 任务完成提醒（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6）。
 * 属主状态：completionWatcherTimer / lastBusyAt / notifiedForCycle / completionGate*（判定面，B09 §2.2.12）——
 * 跨模块写经 setLastBusyAt / setNotifiedForCycle。
 */

const { Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assets = require('./shell-assets.js');
const settings = require('./shell-settings.js');
// B16 修偏（2026-09-18，实机发现）：测试卫生开关 BIGFISH_TEST_NO_NOTIFY=1 —— 集成层场景
//   真启动时会据桩元数据走「发现新版本」路径并弹真实 Windows 通知（用户实机撞见 v0.1.9 假通知）。
//   本开关启动时读一次，短路 notify()（通知唯一出口：更新气泡 / 完成提醒全走此）；
//   默认关 = 生产零影响；模态弹窗面不经此（场景由 seed modeChosen + 永不走 manual 规避）。
const NOTIFY_SUPPRESSED = process.env.BIGFISH_TEST_NO_NOTIFY === '1';
// B09 §2.2.12「降级与可观测性」：判定诊断行经 backend.writeDiag(line) 双写 console + bigfish.log。
// 依赖方向合规：同层（L1）+ 无环（shell-backend.js 只 require electron / node 内置 / harness-store.js）。
const backend = require('./shell-backend.js');

// 注入面（组合根 main.js 接线）：getDshHome（backend）/ petSay（pet）/ IDLE_NOTIFY_MS + IDLE_NOTIFY_FALLBACK_MS（常量）
let getDshHome = null;
let petSay = null;
let IDLE_NOTIFY_MS = 0;
let IDLE_NOTIFY_FALLBACK_MS = 0;
function init(deps) {
  getDshHome = deps.getDshHome; petSay = deps.petSay;
  IDLE_NOTIFY_MS = deps.IDLE_NOTIFY_MS; IDLE_NOTIFY_FALLBACK_MS = deps.IDLE_NOTIFY_FALLBACK_MS;
}

let completionWatcherTimer = null;
let completionFsWatcher = null;   // fs.watch 句柄（Windows：OS 级递归监听，零轮询开销）
let fallbackScanRunning = false;  // 回落路径的异步扫描在途标记（防重叠）
let lastSeenMtime = null;         // 回落路径的 mtime 基线（null = 首次扫描只建基线，不报 busy）
let lastBusyAt = 0;
let notifiedForCycle = false;

// ---- 完成判定面（B09 / US-12；设计档 §2.2.12）——判定源 = Harness 会话投影缓存；对通知只做抑制 ----
const GATE_FRESH_TOLERANCE_MS = 1000;                // 规则③ 快照新鲜度容差（mtime(C) + 容差 < mtime(L) ⇒ stale）
const GATE_TURN_BOUNDARY_VER = 2;                    // 规则② rows.turnBoundary 行版本守卫（形态换代 ⇒ unavailable）
const GATE_STALE_MAX_MS = 30 * 1000;                 // 规则③′ stale 抑制上界（持续 stale ⇒ 按 unavailable 处置）
const SESSION_LOG_NAME = 'session.v3.jsonl.zstd';    // 规则① 具名谓词：深度 3 段 + 文件名写死（不做目录递归遍历）
const PROJCACHE_SEGMENTS = ['storages', 'session_projcache', 'sessions'];
let completionGateMemo = { lastBusyAt: 0, verdict: null, staleSince: 0 }; // 按末次写入时刻记忆 + stale 上界起算点
let completionGateProbeRunning = false;              // 判定在途标记（防重叠；与 fallbackScanRunning 同形）
let completionGateDiagLogged = false;                // 降级诊断行至多一条 / 监视器生命周期
let completionGateStaleLogged = false;               // stale 诊断行至多一条 / 监视器生命周期

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function notify(title, body, onClick) {
  if (NOTIFY_SUPPRESSED) return; // B16 修偏：测试场景抑制真实桌面通知（默认关）
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

// ---------------------------------------------------------------------------
// Completion gate（B09 / US-12；设计档 §2.2.12 判定规则 ①–⑤ + ③′）
// ---------------------------------------------------------------------------

/**
 * 完成判定（规则 ①–⑤）：一次性给出 `done` / `open` / `stale` / `unavailable` 四态之一。
 * 取档（规则① 具名谓词）：L = `<dshHome>/sessions/<项目段>/<会话段>/session.v3.jsonl.zstd` 中 mtime 最大者
 *   （深度 3 段 + 文件名写死，**无 `**` 无界写法、不做目录递归遍历**——按会话段数计，不按文件数计）；
 *   C = `<dshHome>/storages/session_projcache/sessions/*.json` 中 mtime 最大者。
 * 全程 fs.promises（调用处无同步 I/O）；全包 try/catch（读失败不抛出——不新增失败面）。
 * 规则②：L 读不出 / C 缺失 / 不可解析 / 无 `record.rows.turnBoundary` / `ver !== 2` / 无 `val` ⇒ unavailable；
 * 规则③：`mtime(C) + GATE_FRESH_TOLERANCE_MS < mtime(L)` ⇒ stale；规则④：`openTurnStartSeq !== null` ⇒ open。
 */
async function completionGate() {
  try {
    const home = getDshHome();
    const sessionsDir = path.join(home, 'sessions');
    let projects;
    try { projects = await fs.promises.readdir(sessionsDir, { withFileTypes: true }); } catch { projects = []; }
    let logMtime = null;
    for (const proj of projects) {
      if (!proj.isDirectory()) continue;
      let sessions;
      try { sessions = await fs.promises.readdir(path.join(sessionsDir, proj.name), { withFileTypes: true }); } catch { continue; }
      for (const s of sessions) {
        if (!s.isDirectory()) continue;
        try {
          const t = (await fs.promises.stat(path.join(sessionsDir, proj.name, s.name, SESSION_LOG_NAME))).mtimeMs;
          if (logMtime === null || t > logMtime) logMtime = t;
        } catch { /* 该会话段无日志档 ⇒ 跳过（不递归） */ }
      }
    }
    if (logMtime === null) return 'unavailable'; // 判据不完整（读不出）⇒ 降级，不误报
    const projDir = path.join(home, ...PROJCACHE_SEGMENTS);
    let entries;
    try { entries = await fs.promises.readdir(projDir, { withFileTypes: true }); } catch { return 'unavailable'; }
    let newest = null;
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.json')) continue; // `.json.bak.<stamp>` 类天然排除
      const full = path.join(projDir, e.name);
      let mtime;
      try { mtime = (await fs.promises.stat(full)).mtimeMs; } catch { continue; }
      if (newest === null || mtime > newest.mtime) newest = { mtime, full };
    }
    if (newest === null) return 'unavailable';
    let doc = null;
    try { doc = JSON.parse(await fs.promises.readFile(newest.full, 'utf8')); } catch { doc = null; }
    const rows = doc && doc.record && doc.record.rows;
    const tb = rows && rows.turnBoundary;
    if (!tb || tb.ver !== GATE_TURN_BOUNDARY_VER || !tb.val) return 'unavailable'; // 规则②：形态不符 / 换代
    if (newest.mtime + GATE_FRESH_TOLERANCE_MS < logMtime) return 'stale'; // 规则③：快照落后 ⇒ 本轮不提醒
    if (tb.val.openTurnStartSeq !== null) return 'open'; // 规则④：回合在途 ⇒ 不提醒
    return 'done'; // 规则⑤ ⇒ 提醒一次
  } catch { return 'unavailable'; }
}

/** 降级诊断行（规则② / ③′）：每监视器生命周期至多一条（`completionGateDiagLogged` 封口）。 */
function completionGateLogDiag() {
  if (completionGateDiagLogged) return;
  completionGateDiagLogged = true;
  backend.writeDiag(`[bigfish] completion gate unavailable; falling back to idle threshold ${IDLE_NOTIFY_FALLBACK_MS}ms`);
}

/** stale 诊断行（规则③）：每监视器生命周期至多一条（`completionGateStaleLogged` 封口）。 */
function completionGateLogStale() {
  if (completionGateStaleLogged) return;
  completionGateStaleLogged = true;
  backend.writeDiag('[bigfish] completion gate stale; snapshot behind session log — reminder suppressed');
}

/** 提醒一次（规则⑤：既有通知语句逐字保留；`notifiedForCycle` 一周期一次语义不变）。 */
function completionGateFire() {
  notifiedForCycle = true;
  const msg = 'Bigfish 任务已完成';
  notify(msg, '后端已空闲，可以回来看看结果了');
  petSay('任务完成啦！');
}

/**
 * 判定结果的处置（规则 ②·③′·④·⑤；纯算术——无 I/O）：本轮是否应提醒。
 * `done` ⇒ 提醒一次；`unavailable`（与超抑制上界的 `stale`，规则③′）⇒ 退回降级阈值（现状语义）；
 * `open` / `stale` ⇒ 本轮不提醒（非降级态、不改阈值）。
 */
function completionGateDue() {
  const memo = completionGateMemo;
  if (lastBusyAt === 0 || memo.lastBusyAt !== lastBusyAt || notifiedForCycle) return false;
  const idle = Date.now() - lastBusyAt;
  if (memo.verdict === 'done') return true;
  if (memo.verdict === 'unavailable') { completionGateLogDiag(); return idle > IDLE_NOTIFY_FALLBACK_MS; }
  if (memo.verdict === 'stale' && memo.staleSince > 0 && Date.now() - memo.staleSince >= GATE_STALE_MAX_MS) {
    completionGateLogDiag(); // 规则③′：持续 stale ≥ 30 s ⇒ 按 unavailable 处置（降级 + 该行）
    return idle > IDLE_NOTIFY_FALLBACK_MS;
  }
  return false;
}

/**
 * 判定准入（每静默窗至多一次读）：异步 + 防重叠；结果按发起时的 `lastBusyAt` 记忆——任何新写入
 * （含 `setLastBusyAt` 跨模块清零）自动失效重判。判定不抛（内部 try/catch），catch 仅作兜底。
 */
function completionGateProbe() {
  if (completionGateProbeRunning) return;
  completionGateProbeRunning = true;
  const at = lastBusyAt;
  completionGate().then((verdict) => {
    // 监视器已停（退出路径 / before-quit）⇒ 在途判定结果不再消费（不新增「退出期提醒」面）
    if (!completionWatcherTimer) return;
    completionGateMemo.lastBusyAt = at;
    completionGateMemo.staleSince = verdict !== 'stale'
      ? 0
      : (completionGateMemo.verdict === 'stale' && completionGateMemo.staleSince > 0 ? completionGateMemo.staleSince : Date.now());
    completionGateMemo.verdict = verdict;
    if (verdict === 'unavailable') completionGateLogDiag();
    else if (verdict === 'stale') completionGateLogStale();
    if (completionGateDue()) completionGateFire();
  }).catch(() => { /* 兜底：判定不致命 */ }).finally(() => { completionGateProbeRunning = false; });
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
 * B09（§2.2.12）判定面：静默达阈值后先过 `completionGate()`（读 Harness 会话投影缓存的回合边界 +
 *   会话日志 mtime 新鲜度，四态 open / stale / unavailable / done）——done ⇒ 提醒一次；open（回合在途）/
 *   stale（快照落后）⇒ 本轮不提醒（非降级）；unavailable ⇒ 退回 IDLE_NOTIFY_FALLBACK_MS（30 s = 现状语义）+ 一条诊断行。
 *   判定为 fs.promises 异步、按 lastBusyAt 记忆（每静默窗至多一次读）⇒ 5 s 回调内仍无同步 I/O。
 * 事件过滤（watch 与回落同谓词 = isIgnoredPath）：路径任一段落为 profiles / node_modules 的变动不算 busy
 *   （= 旧实现的 skip 语义原样）。
 */
function startCompletionWatcher() {
  stopCompletionWatcher();
  // 判定面随监视器生命周期重置（诊断行「每生命周期至多一条」的口径 = 本处重置）
  completionGateMemo = { lastBusyAt: 0, verdict: null, staleSince: 0 };
  completionGateDiagLogged = false;
  completionGateStaleLogged = false;
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
      // 判定面（US-12）：每静默窗至多一次读（异步 + 防重叠）；完成后由处置面收口
      if (completionGateMemo.lastBusyAt !== lastBusyAt) completionGateProbe();
      // 处置面：done ⇒ 提醒一次；open / stale ⇒ 本轮不提醒；unavailable ⇒ 退回 30 s（现状语义）
      if (completionGateDue()) completionGateFire();
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
