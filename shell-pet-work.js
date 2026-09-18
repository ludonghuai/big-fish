'use strict';
/**
 * shell-pet-work.js — 工作状态联动 I/O 档：fs.watch + 1 s tick + 读记录 + 档位下发 / 重断言 + 开关 + 降级 + 日志（B19；设计档 docs/design/PET-ANIMATION.md §2.7 / §2.8.1–§2.8.8）。
 * 依赖方向（§2.7）：只依赖 node:fs / node:path + 经 init(deps) 注入的访问器（组合根 main.js 接线，共 9 项）；
 *   不 require shell-notify.js / shell-affinity.js（DD-21，同族谓词重复 = 观察项 O16）；shell-pet.js 不 require 本档（反注入，背底档经 setBaseStateProvider 注入）。
 * I/O 形态（§2.8.1 / AC23④）：tick 内全程 fs.promises（readdir / stat / readFile）——零同步 I/O；mtime 未变 ⇒ 只 stat、不 readFile、不 JSON.parse。
 * 开关（§2.8.6）：关 ⇒ 读面不启动（不建 fs.watch、不跑 tick、零日志）+ 清档回 idle；开 ⇒ 立即读一次并进入 1 s tick；运行期切换即生效。
 *   与 B09 常驻 watcher 形态不同源（理由 = §2.7：1 s tick 每轮有 I/O，空转非零成本，与 NFR-14 < 1% 相抵；US-23 字面 =「关 ⇒ 读面不启动」）。
 * 降级（§2.8.7）：unavailable = 逐轮可恢复（tick 与 fs.watch 不停；封的是日志行，不是功能）；真正的锁存面只有「开关关闭」。
 */

const fs = require('node:fs');
const path = require('node:path');
const core = require('./pet-work-core.js');

// 注入面（组合根 main.js 接线；§2.8.3 修正轮 1 #5，共 9 项；`settings` 为注入面签名项——启动态判读在组合根（loadSettings 后），本档不读（§2.7③ 无双源判据））
let setPetState = null;
let getPetState = null;
let petSay = null;
let wakePet = null;
let logAnim = null;
let getPetWindow = null;
let getPetDrag = null;
let settings = null; // 保留注入面签名（§2.7 列举 9 项）；本档不消费——避免与组合根的启动态判读形成双源
let dshHome = null;

// ---- 状态 ----
let enabled = false;        // 开关（启动态 = init 后组合根按 settings.petWorkStatus 调 setEnabled，无双源）
let tickTimer = null;       // 1 s tick（null = 未跑）
let watcher = null;         // fs.watch 句柄（null = 未建；目录后出现 ⇒ 补建）
let scanRunning = false;    // 异步扫描在途标记（防重叠；承 B09 fallbackScanRunning 形）
let soonTimer = null;       // fs.watch 的提前扫描定时器（250 ms 去抖）
let lastGear = null;        // 记忆档位（§2.8.4 术语：本模块「最近一次实际下发的档位」；下发记录，非渲染层观测）
let derivePrev = { gear: null, doneBaseline: null, doneUntil: 0 }; // deriveGear 派生状态（§2.8.2）
let bubbleState = { gear: null, shown: false, lastAt: 0 };          // 气泡节流状态（§2.8.5）
let pickedName = null;      // 上一 tick 选取的记录名（切换 ⇒ doneBaseline 重置，§2.8.2 基线三条之「重置」）
const cache = new Map();    // name → { mtime, sig }：mtime 未变 ⇒ 复用上次解析（AC23 无冗余解析）
let diagUnavailableLogged = false;      // work diag reason=unavailable 封口（每监视器生命周期至多一条，§2.8.8）
const staleDiagLogged = new Set();      // 陈旧守卫诊断封口（每记录至多一条，§2.8.1）

/** 读面目录（段常量与 B09 同字面，§2.8.1；本模块自带——不 require shell-notify.js）。 */
const PROJCACHE_SEGMENTS = ['storages', 'session_projcache', 'sessions'];

function sessionsDir() {
  const home = dshHome && dshHome();
  return home ? path.join(home, ...PROJCACHE_SEGMENTS) : null;
}

function init(deps) {
  setPetState = deps.setPetState;
  getPetState = deps.getPetState;
  petSay = deps.petSay;
  wakePet = deps.wakePet;
  logAnim = deps.logAnim;
  getPetWindow = deps.getPetWindow;
  getPetDrag = deps.getPetDrag;
  settings = deps.settings;
  dshHome = deps.dshHome;
}

// ---------------------------------------------------------------------------
// 开关（§2.8.6 / §2.8.3 #6：传播面 = 托盘 checkbox click ⇒ setEnabled；写权 = 托盘，本模块不写 settings、不回调托盘）
// ---------------------------------------------------------------------------
/** 运行期切换即生效（TC-27）：开 ⇒ 复位基线 + 启动读面 + 立即读一次；关 ⇒ 停读面（零监听零定时器）+ 清档回 idle。 */
function setEnabled(on) {
  const want = on === true;
  if (want === enabled) return;
  enabled = want;
  if (want) {
    resetRuntime();
    startReadFace();
    scanOnce('toggle-on');
  } else {
    stopReadFace();
    clearGear();
  }
}

/** 运行态复位（基线「重置」面：开关重开 ⇒ doneBaseline = null 重建，避免对上一开窗期的历史回合补演收尾）。 */
function resetRuntime() {
  lastGear = null;
  derivePrev = { gear: null, doneBaseline: null, doneUntil: 0 };
  bubbleState = { gear: null, shown: false, lastAt: 0 };
  pickedName = null;
  cache.clear();
  staleDiagLogged.clear();
}

/** 启动读面：建 fs.watch（目录在）+ 起 1 s tick；目录不存在 ⇒ 只起 tick（目录出现后 tick 内补建监听，逐轮可恢复）。 */
function startReadFace() {
  stopReadFace();
  ensureWatcher();
  tickTimer = setInterval(() => { if (enabled) scanOnce('tick'); }, core.WORK_TICK_MS);
}

function stopReadFace() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (soonTimer) { clearTimeout(soonTimer); soonTimer = null; }
  closeWatcher();
  scanRunning = false;
}

/** 建监视器（幂等）：目录在场而未监听 ⇒ fs.watch + error 常驻监听（监听死去 ⇒ tick 兜底，§2.8.7 逐轮可恢复）。 */
function ensureWatcher() {
  if (watcher) return;
  const dir = sessionsDir();
  if (!dir) return;
  try {
    watcher = fs.watch(dir, () => { if (enabled) scheduleSoon(); });
    watcher.on('error', () => { closeWatcher(); });
    diagUnavailableLogged = false; // 诊断封口随监视器生命周期重置（§2.8.8）
  } catch { watcher = null; } // 目录不存在 / 平台不支持 ⇒ tick 兜底
}

function closeWatcher() {
  if (watcher) { try { watcher.close(); } catch { /* best effort */ } watcher = null; }
}

/** fs.watch 触发 ⇒ 250 ms 去抖后提前扫一次（低时延；不另起周期——时延上界仍由 1 s tick 兜底）。 */
function scheduleSoon() {
  if (soonTimer) return;
  soonTimer = setTimeout(() => { soonTimer = null; scanOnce('watch'); }, 250);
}

// ---------------------------------------------------------------------------
// 扫描（§2.8.1：readdir → 逐档 stat；mtime 未变 ⇒ 复用缓存；变了才 readFile + JSON.parse）
// ---------------------------------------------------------------------------
async function scanOnce(reason) {
  if (!enabled || scanRunning) return;
  const dir = sessionsDir();
  if (!dir) return;
  ensureWatcher(); // 目录（重）出现 ⇒ 补建监视器
  scanRunning = true;
  try {
    let names;
    try { names = await fs.promises.readdir(dir); } catch { names = []; } // 目录不存在 / 不可读 ⇒ 无候选（unavailable，逐轮可恢复）
    const jsons = names.filter((n) => typeof n === 'string' && n.endsWith('.json')); // `.json.bak.<stamp>` 天然排除（不递归）
    const cands = [];
    const missedThisTick = new Set(); // 本 tick 走了 readFile 分支的记录名（首扫 / mtime 变化 ⇒ miss，AC23 注 B①/B②）
    for (const n of jsons) {
      let mtime;
      try { mtime = (await fs.promises.stat(path.join(dir, n))).mtimeMs; } catch { continue; } // 单档 stat 失败 ⇒ 跳过（§2.8.7 行 4）
      const hit = cache.get(n);
      if (hit && hit.mtime === mtime) { // cache=hit：不 readFile、不 parse（AC23①）——含负缓存（不可解析 / 守卫不过的档同样按 mtime 免重读）
        if (hit.sig) cands.push({ name: n, mtime, sig: hit.sig });
        continue;
      }
      let doc = null;
      try { doc = JSON.parse(await fs.promises.readFile(path.join(dir, n), 'utf8')); } catch { cache.set(n, { mtime, sig: null }); continue; } // 破损单档 ⇒ 负缓存 + 跳过（TC-29；mtime 未变 ⇒ 下轮免重读）
      missedThisTick.add(n);
      if (!core.guardRows(doc)) { cache.set(n, { mtime, sig: null }); continue; } // 形态守卫不过 ⇒ 负缓存 + 不进候选（TC-30；ver 换代不误报、不重解析）
      const sig = core.recordSignals(doc); // 字段白名单：只取 openTurnStartSeq / lastTurn / openStep / pendingCalls
      cache.set(n, { mtime, sig });
      cands.push({ name: n, mtime, sig });
    }
    for (const k of cache.keys()) if (!jsons.includes(k)) cache.delete(k); // 缓存瘦身：已消失的名字不留（防长跑膨胀）
    const picked = core.pickRecord(cands); // 四段排序（§2.8.1；确定性 = TC-32）
    // cache 字段 = **选中记录口径**（AC23 注 B①：「pick 与 mtime 相同的连续行区间内 miss 恰 1 条」= 该 mtime 首次出现的那条；
    //   多会话并发时非选中记录的 miss 不计入 ⇒ 不影响注 B① 字面判据；无选中记录 ⇒ hit）
    const pickedCache = picked ? (missedThisTick.has(picked.name) ? 'miss' : 'hit') : 'hit';
    workLog('scan', 'reason=' + reason + ' n=' + jsons.length + ' pick=' + (picked ? picked.name : '-')
      + ' mtime=' + (picked ? Math.round(picked.mtime) : '-') + ' cache=' + pickedCache);
    applyTick(picked);
  } finally {
    scanRunning = false;
  }
}

// ---------------------------------------------------------------------------
// 档位下发与重断言（§2.8.4：共同门 + 两条互斥条款；排除面对「进入」与「保持」同样生效）
// ---------------------------------------------------------------------------
/** 共同门（§2.8.4）：拖动 ∨ 散步/跑步在途 ∨ 交互档在途 ⇒ 本 tick 让位（不下发、不写行、不更新 lastGear；下一 tick 重评）。 */
function gateBlocked() {
  if (getPetDrag && getPetDrag() !== null) return true;
  const s = getPetState ? getPetState() : null;
  return s === 'walk-left' || s === 'walk-right' || s === 'run-left' || s === 'run-right'
    || s === 'happy' || s === 'eat' || s === 'read' || s === 'starry' || s === 'scared';
}

/** 每次扫描的档位收口：extractSignals（含陈旧守卫）→ deriveGear → 共同门 → 下发条 / 重断言条 → unavailable 诊断 → 气泡。 */
function applyTick(picked) {
  const now = Date.now();
  if (picked && pickedName !== null && picked.name !== pickedName) {
    derivePrev.doneBaseline = null; // 基线「重置」：选取记录切换 ⇒ 重建（§2.8.2 基线三条）
  }
  const signals = picked ? core.extractSignals(picked.sig, picked.mtime, now) : null;
  if (picked) pickedName = picked.name;
  if (signals && signals.staleInFlight && !staleDiagLogged.has(picked.name)) {
    staleDiagLogged.add(picked.name); // 陈旧守卫诊断（每记录至多一条，§2.8.1 / TC-31）
    workLog('diag', 'reason=stale record=' + picked.name);
  }
  derivePrev = core.deriveGear(signals, derivePrev);
  const gear = derivePrev.gear;
  // 气泡状态机先走（含 gear === null 的清档 tick——「新的连续停留」置位需要经过 null 的转移，§2.8.5）：
  //   清档 / 收尾档不弹（纯函数侧返回 null）；发射面在下发门之后（无窗口 / 让位期间不弹）
  let bubbleText = null;
  if (signals) {
    const b = core.pickBubble(gear, bubbleState, now);
    bubbleState = b.state;
    bubbleText = b.text;
  }
  if (!enabled) return; // 扫描在途被关闭 ⇒ 只收口状态，不下发不诊断（TC-27 关面零新行）
  if (!picked) diagUnavailableOnce(); // unavailable 诊断（含「运行中从有记录转不可用」的转移，§2.8.7 行 1；封口每监视器生命周期一条）
  // 生命周期空转判据（§2.7 末行）：无桌宠窗口（专注模式 / 建窗前）⇒ 本 tick 不下发、不重断言、不弹气泡、不重排入睡——
  //   读面照跑（tick 与 fs.watch 不停，§2.8.7 逐轮可恢复），档位状态照常收口（回鲸鱼模式后自愈）；不依赖建窗 / 销毁钩子
  if (getPetWindow && getPetWindow() === null) return;
  if (gateBlocked()) return; // 让位（TC-33）：不下发、不写行、不更新 lastGear
  if (gear !== lastGear) {
    // 下发条（§2.8.4 条款 1）：进档先 wakePet（清入睡定时器并重排）；出档（回 idle）后再 wakePet（重排入睡计时）
    const from = lastGear;
    if (gear !== null) wakePet();
    setPetState(gear === null ? 'idle' : gear);
    if (gear === null) wakePet();
    lastGear = gear;
    workLog('gear', 't=' + now + ' from=' + (from === null ? '-' : from) + ' to=' + (gear === null ? 'idle' : gear)
      + ' rec=' + (picked ? picked.name : '-') + ' turn=' + (picked ? picked.sig.lastTurn : '-')
      + ' pend=' + (picked ? picked.sig.pendingCount : '-')
      + ' step=' + (picked && picked.sig.openStep !== null && picked.sig.openStep !== undefined ? 1 : 0));
  } else if (gear !== null) {
    // 重断言条（§2.8.4 条款 2）：gear === lastGear ∧ 非 null ⇒ 重发一次（链的「同档忽略」使重发幂等，不重启当前段；不改 lastGear）
    setPetState(gear);
    workLog('reassert', 't=' + now + ' gear=' + gear + ' state=' + (getPetState ? getPetState() : '-'));
  }
  // 气泡发射面（§2.8.5）：状态机已在上方先行（含清档转移，避免同档跨停留不重置）；此处只发——
  //   窗口在场且非让位（上方已 return）才到此处 ⇒ 与下发同门
  if (bubbleText !== null && getPetWindow && getPetWindow() !== null) {
    petSay(bubbleText);
    workLog('bubble', 't=' + now + ' gear=' + gear + ' text=' + bubbleText);
  }
}

/** 清档（开关关闭路径，§2.8.6：立即清空并回 idle + 重排入睡计时）；无窗口时只收状态（无 IPC 对象）。 */
function clearGear() {
  if (lastGear !== null) {
    if (getPetWindow && getPetWindow() !== null) {
      setPetState('idle');
      wakePet();
    }
    workLog('gear', 't=' + Date.now() + ' from=' + lastGear + ' to=idle rec=- turn=- pend=- step=0');
  }
  lastGear = null;
  derivePrev = { gear: null, doneBaseline: null, doneUntil: 0 };
  bubbleState = { gear: null, shown: false, lastAt: 0 };
  pickedName = null;
}

function diagUnavailableOnce() {
  if (diagUnavailableLogged) return;
  diagUnavailableLogged = true;
  workLog('diag', 'reason=unavailable');
}

// ---------------------------------------------------------------------------
// 日志（§2.8.8：仅 BIGFISH_PET_DEBUG=1——经 shell-pet.js 的 logAnim 注入（内部已判 debug），不新建日志文件）
// ---------------------------------------------------------------------------
function workLog(type, fields) {
  if (!logAnim) return;
  logAnim('work ' + type + (fields ? ' ' + fields : ''));
}

/** 背底档提供者（§2.8.4 背底档提供者行）：返回当前工作档（lastGear = 记忆档位）；无 ⇒ null（消费方兑 'idle'）。仅供散步起步门。 */
function baseState() { return lastGear; }

module.exports = { init, setEnabled, scanOnce, baseState };
