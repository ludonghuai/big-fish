'use strict';
/**
 * pet-chain-core.js — 动画链决策纯函数 + 池校验 + 媒体盒几何（B18；设计档 docs/design/PET-ANIMATION.md §2.2.2 / §2.2.4 / §2.2.6）。
 * 边界（设计档 §2.2.1）：零 DOM / 零 IPC / 零 fs——可被 node 直接装载（桩测装载真实实现，DD-14）。
 * 函数清单：rollKind · pick · pickWeightedCategory · pickSlot · nextInSlot · pickChainNext · decideNext · judgeSwitch · mediaBox · segSrc · parsePool · validatePool；双环境导出尾巴见档末。
 */

// ---- 常量（设计档 §2.2.6 常量表）----
/** 素材画布（实测 640×360）。 */
const PET_MEDIA_CANVAS = { w: 640, h: 360 };
/** 身体盒（画布坐标）：初值 = 样本 HIT_BOX；实现期以 probe-pet-media.js 实测首帧 alpha 包围盒校准（证据落批次档 §5）。 */
const PET_MEDIA_BODY = { x0: 200, y0: 50, x1: 440, y1: 335 };
/** 视频通道身体目标高（对齐既有 #pet 的 200px）。 */
const PET_BODY_TARGET_H = 200;
/** 脚底纵坐标：270 − 26（与 #pet 的 bottom:26px 同源）。 */
const PET_FEET_Y = 244;
/** 窗口逻辑宽度（US-11 的 250×270；只读常量——本档不写窗口位置 / 尺寸）。 */
const PET_STAGE_W = 250;
/** V3 单段体积上界（NFR-10）。 */
const SEG_MAX_BYTES = 1.5 * 1024 * 1024;
/** B21 衔接提前量（段末前多少毫秒起下一段；NFR-23 单点定义单点消费；初值 = 临时值，实机标定后定值）。 */
const PET_OVERLAP_MS = 1200;
/** B27 真·静默期（ms）：动作类段（action / turn）末进入静默，静默内零链决策（§2.14.2 / §2.14.9；U-1 = 40% / 30 s，实机标定路径 = 本常量一处）。 */
const PET_QUIET_MS = 30000;

// ---- 链决策（设计档 §2.2.4）----
/** 按权重掷骰：roll ∈ [0,1) ⇒ 'idle' | 'turn' | 'move' | 'action'（余量全归 action，见档内「权重余量」契约）。 */
function rollKind(roll, weights) {
  if (roll < weights.idle / 100) return 'idle';
  if (roll < (weights.idle + weights.turn) / 100) return 'turn';
  if (roll < (weights.idle + weights.turn + weights.move) / 100) return 'move';
  return 'action';
}

/** 等概率抽 1，尽量避开 exclude；排除后为空 ⇒ 退回原池（不返回 undefined）。 */
function pick(pool, exclude) {
  const entries = exclude === undefined ? pool : pool.filter((n) => n !== exclude);
  const src = entries.length ? entries : pool;
  return src[Math.floor(Math.random() * src.length)];
}

/** 按权重抽分类；noMirror 分类在 facing='right' 时被滤（全被滤 ⇒ 退回全池）；无可用分类 ⇒ null。 */
function pickWeightedCategory(categories, facing) {
  const cats = categories.filter((c) => c.actions.length > 0);
  if (!cats.length) return null;
  const filtered = cats.filter((c) => !(c.noMirror && facing === 'right'));
  const eligible = filtered.length ? filtered : cats;
  const total = eligible.reduce((s, c) => s + c.weight, 0);
  if (!(total > 0)) return eligible[0];
  let t = Math.random() * total;
  for (const c of eligible) { t -= c.weight; if (t <= 0) return c; }
  return eligible[eligible.length - 1];
}

/** 档位取值：字符串原样返回；数组 = 档内抽 1（避开 exclude）；单候选 + 排除自己 ⇒ 退回原数组。 */
function pickSlot(slot, exclude) {
  if (typeof slot === 'string') return slot;
  const entries = exclude === undefined ? slot : slot.filter((n) => n !== exclude);
  const src = entries.length ? entries : slot;
  return src[Math.floor(Math.random() * src.length)];
}

/** 多候选档位播完轮换到非当前候选；单候选 / 不在该档 ⇒ null（承样本 nextWorkStatusAnim 语义）。 */
function nextInSlot(slot, current) {
  if (!Array.isArray(slot) || slot.length <= 1 || !slot.includes(current)) return null;
  return pickSlot(slot, current);
}

/** 链的一步决策；kind='move' ⇒ name=null（由调用方发散步请求，设计档 §2.2.4 规则 4）。 */
function pickChainNext(input) {
  const { weights, pool, cur, facing } = input;
  const kind = rollKind(input.roll, weights);
  if (kind === 'idle') return { kind, name: pick(pool.idle, cur), mirror: false, category: null };
  if (kind === 'turn') return { kind, name: pick(pool.turn, cur), mirror: false, category: null };
  if (kind === 'move') return { kind, name: null, mirror: false, category: null };
  const cat = pickWeightedCategory(pool.categories, facing);
  if (!cat) return { kind: 'idle', name: pick(pool.idle, cur), mirror: false, category: 'FALLBACK' };
  return { kind: 'action', name: pick(cat.actions, cur), mirror: facing === 'right' && !cat.noMirror, category: cat.id };
}

/** B21 段末决策（设计档 §2.13.4；B27 扩展 = §2.14.9）：输入池/权重/掷骰/当前档位/正播段/朝向/静默标记 ⇒ 输出四类计划（rotate/quiet/chain/none；roll 注入保确定性）。
 * 判定次序（§2.14.9）：① rotate（事件段多候选轮换，逐字不变）→ ② 静默判定 → ③ 链掷骰（逐字不变）。 */
function decideNext(input) {
  const { pool, weights, roll, slot, playing, cur, facing } = input;
  // 事件段仍在同档且有多个候选 ⇒ 档内轮换（复用 nextInSlot，其契约不改）
  if (playing && playing.kind === 'event' && playing.slotKey === slot) {
    const next = nextInSlot(pool.events[slot], playing.name);
    if (next) return { plan: 'rotate', name: next, mirror: false };
  }
  // B27 静默判定（§2.14.9 ②）：只在 idle 槽 ∧ 非静默中 ∧ 正播段为动作类（action / turn）时进入；
  // turn 段的翻转在调用方（pet-chain.js triggerChainDecision）先行执行、与本计划类型解耦（§2.14.9——翻转照执行，不因 quiet 被吞）。
  if (slot === 'idle' && !input.quiet && playing && (playing.kind === 'action' || playing.kind === 'turn')) {
    const quietSegs = pool.events && pool.events.quiet !== undefined ? pool.events.quiet : null;
    return { plan: 'quiet', name: quietSegs ? pickSlot(quietSegs, cur) : pool.idle[0], mirror: false };
  }
  const d = pickChainNext({ weights, pool, cur, facing, roll });
  if (d.name === null) return { plan: 'none' };
  return { plan: 'chain', name: d.name, mirror: d.mirror, kind: d.kind, category: d.category };
}

/** B21 R1/R2 选段修正（设计档 §2.13.5；B27 作用域扩展 = §2.14.9）：输入当前播放状态/目标段名/镜像 ⇒ 输出 reload/hold-same/hold-mirror。
 * 作用域前提（B27 扩展）：`playing.loop === true ∨ String(playing.slotKey).startsWith('escape-')`——escape 档自 B27 起为 loop=false 单遍段，折返 / 同段重入仍不重启段；其余（一次性反馈段）照常 reload。 */
function judgeSwitch(input) {
  const { playing, name, mirror } = input;
  // 未在播 ⇒ reload；loop=true 持续档或 escape-* 单遍段（B27 扩展）⇒ 进 hold 判定；其余 loop=false ⇒ reload（一次性反馈段照常重播）
  if (!playing || !(playing.loop === true || String(playing.slotKey).startsWith('escape-'))) return 'reload';
  if (name === playing.name && mirror === playing.mirror) return 'hold-same';   // R1：同段同镜像不重播
  if (name === playing.name) return 'hold-mirror';                              // R2：仅镜像变化只改 transform
  return 'reload';
}

// ---- 媒体盒几何（设计档 §2.2.6；纯计算，无 DOM）----
/**
 * 媒体盒与命中矩形（单位 = CSS px = DIP）；返回 scale / left·top·w·h（媒体盒）/ hit（身体盒映射）/ bodyBottom。
 */
function mediaBox(input) {
  const { canvas, body, targetH, feetY } = input;
  const stageW = input.stageW === undefined ? PET_STAGE_W : input.stageW;
  const scale = targetH / (body.y1 - body.y0);
  const w = canvas.w * scale;
  const left = (stageW - w) / 2;
  const top = feetY - body.y1 * scale;
  return {
    scale,
    left,
    top,
    w,
    h: canvas.h * scale,
    hit: { left: left + body.x0 * scale, top: top + body.y0 * scale, w: (body.x1 - body.x0) * scale, h: targetH },
    bodyBottom: feetY,
  };
}

// ---- 池装载与校验（设计档 §2.2.2 V1–V6；probe 由调用方注入 ⇒ 本档零 fs）----
const POOL_KEYS = ['version', 'canvas', 'body', 'dir', 'ext', 'weights', 'idle', 'turn', 'moves', 'categories', 'events'];
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function isStrArr(v) { return Array.isArray(v) && v.every((n) => typeof n === 'string' && n.length > 0); }
/** 档位取值形态：非空字符串 或 非空字符串数组。 */
function slotOk(s) { return typeof s === 'string' ? s.length > 0 : isStrArr(s) && s.length > 0; }
/** 片段名安全（V6）：不含 `..` · 不含路径分隔符 · 非绝对路径形态（空名不属路径面 ⇒ 由 V1/V5 拦截）。 */
function nameSafe(n) { return typeof n === 'string' && !n.includes('..') && !n.includes('/') && !n.includes('\\') && !/^[a-zA-Z]:/.test(n); }
/** 目录安全（V6）：相对目录形态——不含 `..` / 反斜杠 / 绝对路径前缀（`/` 作目录分隔合法，本批 dir = assets/pet-anim/webm）。 */
function dirSafe(d) { return typeof d === 'string' && d.length > 0 && !d.includes('..') && !d.includes('\\') && !/^([a-zA-Z]:|\/)/.test(d); }

/** 池内声明的全部片段名（含重复；去重由调用方做）。 */
function allNames(p) {
  const out = p.idle.concat(p.turn, p.moves.walk, p.moves.run);
  for (const c of p.categories) out.push(...c.actions);
  for (const k of Object.keys(p.events)) { const s = p.events[k]; if (typeof s === 'string') out.push(s); else out.push(...s); }
  return out;
}

/**
 * 池校验 V1–V6（任一不过 ⇒ {ok:false, reason:'V<n>'}；V1–V6 谓词 6 类）。
 * probe(relPath) ⇒ {exists:boolean, size:number}：相对路径（未编码）→ 文件事实；注入使本档保持零 fs。
 * 通过 ⇒ {ok:true, pool: <原池 + src 映射>, stats:{slots,segs,bytes,max}}。
 */
function validatePool(data, probe) {
  if (!isObj(data)) return { ok: false, reason: 'V1' };
  for (const k of POOL_KEYS) if (!(k in data)) return { ok: false, reason: 'V1' };
  const cv = data.canvas;
  const bd = data.body;
  const w = data.weights;
  if (!Number.isInteger(data.version) || data.version < 1) return { ok: false, reason: 'V1' };
  if (!isObj(cv) || !(cv.w > 0) || !(cv.h > 0)) return { ok: false, reason: 'V1' };
  if (!isObj(bd) || !(bd.x0 >= 0) || !(bd.x0 < bd.x1) || !(bd.x1 <= cv.w) || !(bd.y0 >= 0) || !(bd.y0 < bd.y1) || !(bd.y1 <= cv.h)) return { ok: false, reason: 'V1' };
  if (typeof data.dir !== 'string' || typeof data.ext !== 'string') return { ok: false, reason: 'V1' };
  if (!isObj(w) || ![w.idle, w.turn, w.move].every((n) => isNum(n) && n >= 0)) return { ok: false, reason: 'V1' };
  if (!isStrArr(data.idle) || !isStrArr(data.turn)) return { ok: false, reason: 'V1' };
  if (!isObj(data.moves) || !isStrArr(data.moves.walk) || !isStrArr(data.moves.run)) return { ok: false, reason: 'V1' };
  if (!Array.isArray(data.categories)) return { ok: false, reason: 'V1' };
  for (const c of data.categories) {
    if (!isObj(c) || typeof c.id !== 'string' || !isNum(c.weight) || c.weight < 0 || !isStrArr(c.actions)) return { ok: false, reason: 'V1' };
  }
  if (!isObj(data.events)) return { ok: false, reason: 'V1' };
  for (const k of Object.keys(data.events)) {
    const s = data.events[k];
    if (typeof s !== 'string' && !isStrArr(s)) return { ok: false, reason: 'V1' };
  }
  // V6 路径安全
  if (!dirSafe(data.dir)) return { ok: false, reason: 'V6' };
  if (allNames(data).some((n) => !nameSafe(n))) return { ok: false, reason: 'V6' };
  // V4 权重合法（仅防笔误：各权重 ≥0 且合计 ≤100；不要求合计 = 100——余量归 action 分支）
  let wsum = w.idle + w.turn + w.move;
  for (const c of data.categories) wsum += c.weight;
  if (wsum > 100) return { ok: false, reason: 'V4' };
  // V5 档位下界
  if (data.idle.length < 1 || data.turn.length < 1 || data.moves.walk.length < 1 || data.categories.length < 1) return { ok: false, reason: 'V5' };
  for (const k of Object.keys(data.events)) if (!slotOk(data.events[k])) return { ok: false, reason: 'V5' };
  // V2 引用可解析 + V3 单段体积上界（去重后逐段核对）
  const uniq = [...new Set(allNames(data))];
  const src = {};
  let bytes = 0;
  let max = 0;
  for (const n of uniq) {
    const st = probe(data.dir + '/' + n + data.ext);
    if (!st || !st.exists) return { ok: false, reason: 'V2', detail: n };
    if (st.size > SEG_MAX_BYTES) return { ok: false, reason: 'V3', detail: n };
    src[n] = segSrc(data.dir, n, data.ext);
    bytes += st.size;
    if (st.size > max) max = st.size;
  }
  const slots = 4 + data.categories.length + Object.keys(data.events).length;
  return { ok: true, pool: Object.assign({}, data, { src }), stats: { slots, segs: uniq.length, bytes, max } };
}

/** 片段 URL：池条目 = 片段名（不含路径 / 扩展名）⇒ 百分号编码后拼 dir + ext（中文名必须编码）。 */
function segSrc(dir, name, ext) {
  return dir + '/' + encodeURIComponent(name) + ext;
}

/** JSON 文本 → 校验：解析失败 ⇒ {ok:false, reason:'JSON'}（第 7 类非法池，与 §3.1 AC1 同口径）。 */
function parsePool(text, probe) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'JSON' }; }
  return validatePool(data, probe);
}

const PetChainCore = {
  rollKind, pick, pickWeightedCategory, pickSlot, nextInSlot, pickChainNext, decideNext, judgeSwitch, mediaBox, segSrc, parsePool, validatePool,
  PET_MEDIA_CANVAS, PET_MEDIA_BODY, PET_BODY_TARGET_H, PET_FEET_Y, PET_STAGE_W, SEG_MAX_BYTES, PET_OVERLAP_MS, PET_QUIET_MS,
};

// 双环境导出尾巴：node（桩测 / 主进程 require）与浏览器（<script> 全局）同源装载。
if (typeof module !== 'undefined' && module.exports) module.exports = PetChainCore;
if (typeof window !== 'undefined') window.PetChainCore = PetChainCore;
