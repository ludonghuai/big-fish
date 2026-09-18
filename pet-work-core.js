'use strict';
/**
 * pet-work-core.js — 工作状态档位派生纯函数核心：常量表 / 形态守卫 / 记录信号 / 四段选取 / 陈旧守卫 / 档位派生（含 B26 保持条）/ 气泡节流（B19 / B26；设计档 docs/design/PET-ANIMATION.md §2.8.1 / §2.8.2 / §2.8.5 / §2.12）。
 * 边界（设计档 §2.7）：零 fs / 零 IPC / 零 electron / 零定时器 / 零 DOM——可被 node 直接装载（NFR-17，桩测装载真实实现）；双环境导出尾巴见档末。
 * 字段白名单（NFR-15 / §2.8.1）：只消费 turnBoundary.val.{openTurnStartSeq,lastTurn} · sessionStats.val.{openStep,pendingCalls} · 记录文件名——零字段取自内容行。
 * 函数清单：guardRows · recordSignals · pickRecord · extractSignals · deriveGear · pickBubble；常量表 + 文案表（WORK_QUOTES）。
 */

// ---- 常量（设计档 §2.8.2；桩测逐值断言）----
/** 读面 tick 周期（ms；I/O 档使用）。 */
const WORK_TICK_MS = 1000;
/** 记录陈旧阈（ms）：回合在途 ∧ mtime 落后超它 ⇒ 按「无在途回合」处理（防后端被强杀后永久忙碌，§2.8.1 陈旧守卫）。 */
const WORK_STALE_MS = 60000;
/** 收尾档保持期（ms；O19：一处可调，用户实机后可复核取值）。 */
const WORK_DONE_HOLD_MS = 3000;
/** 两条工作气泡的最小间隔（ms，§2.8.5；同档间隔）。 */
const WORK_BUBBLE_MIN_GAP_MS = 30000;
/** 跨档全局下限（ms，§2.8.5：任意两条工作气泡间隔 ≥ 它，防三档连弹；B26 新增）。 */
const WORK_BUBBLE_GLOBAL_GAP_MS = 10000;
/** 形态守卫：行版本（NFR-17 版本守卫；换代 ⇒ unavailable，不猜测）。 */
const WORK_TURN_BOUNDARY_VER = 2;
const WORK_SESSION_STATS_VER = 1;

/** 气泡文案表（§2.8.5，本仓自写；每档等概率抽 1；收尾档不弹——避开与「任务完成」提醒撞车，依据 = shell-notify.js 完成提醒面）。 */
const WORK_QUOTES = {
  'work-thinking': ['正在想下一步呢…', '让我整理一下思路~'],
  'work-working': ['正在处理这一步…', '手上还有活儿在跑哦~'],
};

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

/**
 * 形态守卫（§2.8.1）：turnBoundary.ver===2 ∧ val 为对象 ∧ openTurnStartSeq 为 null 或非负整数；
 * sessionStats.ver===1 ∧ val 为对象 ∧ openStep 字段在场 ∧ pendingCalls 为对象。任一不符 ⇒ false（读面按 unavailable 处置，不误报）。
 */
function guardRows(doc) {
  const rows = doc && doc.record && doc.record.rows;
  if (!isObj(rows)) return false;
  const tb = rows.turnBoundary;
  const ss = rows.sessionStats;
  if (!isObj(tb) || tb.ver !== WORK_TURN_BOUNDARY_VER || !isObj(tb.val)) return false;
  const ots = tb.val.openTurnStartSeq;
  if (ots !== null && !(typeof ots === 'number' && Number.isInteger(ots) && ots >= 0)) return false;
  if (!isObj(ss) || ss.ver !== WORK_SESSION_STATS_VER || !isObj(ss.val)) return false;
  if (!Object.prototype.hasOwnProperty.call(ss.val, 'openStep')) return false;
  if (!isObj(ss.val.pendingCalls)) return false;
  return true;
}

/**
 * 记录信号（字段白名单面；调用前置 = guardRows(doc) 已过）：inFlight（回合在途）/ lastTurn / pendingCount（在跑工具调用数）/ openStep。
 * lastTurn 取 turnBoundary.val.lastTurn（与 openTurnStartSeq 同行 ⇒ 同一原子快照内自洽，§1.3.5 注 W1）；非整数 / 负数 ⇒ 按 0 读（守门但不误报）。
 */
function recordSignals(doc) {
  const val = doc.record.rows.turnBoundary.val;
  const sv = doc.record.rows.sessionStats.val;
  const lastTurn = val.lastTurn;
  return {
    inFlight: val.openTurnStartSeq !== null,
    lastTurn: typeof lastTurn === 'number' && Number.isInteger(lastTurn) && lastTurn >= 0 ? lastTurn : 0,
    pendingCount: Object.keys(sv.pendingCalls).length,
    openStep: Object.prototype.hasOwnProperty.call(sv, 'openStep') ? sv.openStep : null,
  };
}

/**
 * 选取排序（§2.8.1 四段，确定性；同一输入多次扫描同结果 = TC-32）：
 * ① 回合在途者优先；② lastTurn 大者；③ mtime 新者；④ 文件名升序。cands = [{name, mtime, sig}]；空 ⇒ null（unavailable）。
 */
function pickRecord(cands) {
  const arr = (Array.isArray(cands) ? cands : []).filter((c) => c && typeof c.name === 'string' && typeof c.mtime === 'number' && c.sig && typeof c.sig.inFlight === 'boolean');
  if (!arr.length) return null;
  const sorted = arr.slice().sort((a, b) => {
    if (a.sig.inFlight !== b.sig.inFlight) return a.sig.inFlight ? -1 : 1;
    if (a.sig.lastTurn !== b.sig.lastTurn) return b.sig.lastTurn - a.sig.lastTurn;
    if (a.mtime !== b.mtime) return b.mtime - a.mtime;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });
  return sorted[0];
}

/**
 * 信号提取（§2.8.1 + 陈旧守卫）：选中记录的 sig + mtime + now ⇒ deriveGear 的输入。
 * 陈旧守卫：回合在途 ∧ now − mtime > WORK_STALE_MS ⇒ inFlight 强制 false（按「无在途回合」处理；staleInFlight 标记供 I/O 侧诊断行）。
 */
function extractSignals(sig, mtime, now) {
  if (!sig) return { available: false, now, fresh: false, inFlight: false, staleInFlight: false, lastTurn: 0, pendingCount: 0, openStep: null };
  const fresh = (now - mtime) <= WORK_STALE_MS;
  return {
    available: true,
    now,
    fresh,
    inFlight: sig.inFlight && fresh,
    staleInFlight: sig.inFlight && !fresh,
    lastTurn: sig.lastTurn,
    pendingCount: sig.pendingCount,
    openStep: sig.openStep,
  };
}

/**
 * 档位派生（§2.8.2 规则 1–8，自上而下短路；「工具优先于思考」= 规则 2 先于 3——并行调用窗口内二者可同时在场）。
 * prev = { gear, doneBaseline, doneUntil }（I/O 档持有的派生状态；初值三 null/0）。
 * 规则 5 基线三条（修正轮 1 #4，持久信号）：建立（doneBaseline===null 的首个「无在途 ∧ 新鲜」观测只建基线、不触发——避免开机对历史回合补演）/
 * 更新（触发收尾档即置 doneBaseline = lastTurn）/ 重置（I/O 侧在选取记录切换或开关重开时置 null）。
 * 收尾保持期：触发后 WORK_DONE_HOLD_MS 内不落规则 6；期内回合重新在途 ⇒ 规则 2 / 3 立即接管（分支在前）；期满后落规则 7（保持）或 8（清档）。
 * 规则 7 保持条（B26 / §2.12.2）：选中记录新鲜期间不落 idle、维持上一档位（含 work-done；prev.gear === null ⇒ 仍 null）——自主动作被既有 petState==='idle' 守卫挡住（效力边界 = §2.12.3）。
 */
function deriveGear(signals, prev) {
  const p = prev || { gear: null, doneBaseline: null, doneUntil: 0 };
  const out = { gear: p.gear, doneBaseline: p.doneBaseline, doneUntil: p.doneUntil };
  if (!signals || !signals.available) { out.gear = null; return out; }               // 规则 1：unavailable / 无候选 ⇒ 清档
  if (signals.inFlight) {
    if (signals.pendingCount > 0) { out.gear = 'work-working'; return out; }          // 规则 2：工具执行中（工具优先）
    if (signals.openStep !== null && signals.openStep !== undefined) { out.gear = 'work-thinking'; return out; } // 规则 3：生成中
    return out;                                                                       // 规则 4：保持上一档（step 边界瞬间，不抖动）
  }
  if (signals.fresh && out.doneBaseline === null) {                                   // 基线建立：首个「无在途 ∧ 新鲜」观测只建基线、不触发——建基线后同样走保持条（§2.8.2 ④：out.gear 维持 prev.gear；启动时 prev.gear === null ⇒ 与今天同形）
    out.doneBaseline = signals.lastTurn;
    return out;
  }
  if (signals.fresh && signals.lastTurn > out.doneBaseline) {                         // 规则 5：收尾档（lastTurn 增量 ∧ 无在途 ∧ 新鲜）
    out.gear = 'work-done';
    out.doneBaseline = signals.lastTurn;
    out.doneUntil = signals.now + WORK_DONE_HOLD_MS;
    return out;
  }
  if (p.gear === 'work-done' && p.doneUntil > signals.now) { out.gear = 'work-done'; return out; } // 收尾保持期内不落清档
  if (signals.fresh) return out;                                                             // 规则 7：记录新鲜 ⇒ 维持上一档位（含 work-done；B26 / §2.12.2）
  out.gear = null;                                                                    // 规则 8：记录陈旧 / 长期空闲 ⇒ 清档（B26 起 = 有界端）
  return out;
}

/**
 * 气泡节流（§2.8.5 判据句，B26 三条件）：① 同档一次（档内首 tick）；② 同档两条 ≥ WORK_BUBBLE_MIN_GAP_MS；
 * ③ 跨档全局下限：任意两条工作气泡（跨档）间隔 ≥ WORK_BUBBLE_GLOBAL_GAP_MS（防三档连弹）。
 * 收尾档（文案表无键）与清档不弹。state = { gear, shown, lastAtByGear, lastAtAll }（B26：原单值 lastAt 拆为按档 + 全局两面）；
 * 返回 { text, state }（text = null ⇒ 本次不弹，不影响档位切换）。
 */
function pickBubble(gear, state, now) {
  const p = state || { gear: null, shown: false, lastAtByGear: {}, lastAtAll: 0 };
  const next = { gear: p.gear, shown: p.shown, lastAtByGear: p.lastAtByGear, lastAtAll: p.lastAtAll };
  const g = gear === undefined ? null : gear;
  if (next.gear !== g) { next.gear = g; next.shown = false; }                         // 新的连续停留（或离开工作档）⇒ 重置该档「已弹」位
  const quotes = g !== null && Object.prototype.hasOwnProperty.call(WORK_QUOTES, g) ? WORK_QUOTES[g] : null;
  if (!quotes) return { text: null, state: next };                                    // 清档 / 收尾档 ⇒ 不弹
  if (next.shown) return { text: null, state: next };                                 // 条件①：同档一次
  if (now - next.lastAtAll < WORK_BUBBLE_GLOBAL_GAP_MS) return { text: null, state: next }; // 条件③：跨档全局下限不足 ⇒ 不弹
  const lastAtGear = Object.prototype.hasOwnProperty.call(next.lastAtByGear, g) ? next.lastAtByGear[g] : 0;
  if (now - lastAtGear < WORK_BUBBLE_MIN_GAP_MS) return { text: null, state: next };  // 条件②：同档间隔不足 ⇒ 不弹
  const text = quotes[Math.floor(Math.random() * quotes.length)];
  next.shown = true;
  next.lastAtByGear = { ...next.lastAtByGear, [g]: now };                             // 按档写入（新对象，不改性入参）
  next.lastAtAll = now;
  return { text, state: next };
}

const PetWorkCore = {
  WORK_TICK_MS, WORK_STALE_MS, WORK_DONE_HOLD_MS, WORK_BUBBLE_MIN_GAP_MS, WORK_BUBBLE_GLOBAL_GAP_MS,
  WORK_TURN_BOUNDARY_VER, WORK_SESSION_STATS_VER, WORK_QUOTES,
  guardRows, recordSignals, pickRecord, extractSignals, deriveGear, pickBubble,
};

// 双环境导出尾巴：node（桩测 / 主进程 require）与浏览器（<script> 全局）同源装载（口径同 pet-chain-core.js）。
if (typeof module !== 'undefined' && module.exports) module.exports = PetWorkCore;
if (typeof window !== 'undefined') window.PetWorkCore = PetWorkCore;
