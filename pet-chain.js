'use strict';
/**
 * pet-chain.js — 双缓冲视频播放器 + 动画链运转 + 三级回落 + 链日志（B18 + B21 衔接 + R1/R2 + drag/escape + B27 静默 + B23 门控名单喂入 + B35 偏好双名单）。
 * 边界（设计档 §2.2.1）：零 fs / 零 fetch——池数据只来自主进程的 `pet-chain-config`；本档不碰窗口几何。
 * 函数清单：onConfig · setSlot · setDragging · startSlot · chainStep · enterQuiet · quietExpire · clearQuiet · switchTo · handleEnded · requestMove · onPlayFail · setChannel · applyMediaBox · log；applyAllowSet · reportMealPlayed（B23）；stillPickable · settleExcludedPlaying（B35）。
 * 全局出口（渲染层内部接口，承设计档 §2.2.1）：window.petChain = { videoActive, hitRect, setSlot, setDragging }。
 */

const core = window.PetChainCore;

const els = { stage: document.getElementById('pet-stage'), img: document.getElementById('pet'), media: Array.prototype.slice.call(document.querySelectorAll('video.pet-media')) };

let debug = false, mode = 'png';  // 链日志总开关（按 BIGFISH_PET_DEBUG 下发，关闭时零日志）/ 回落链当前通道（§2.2.8）
let entering = false;       // 已收到合法池、首个视频帧未就绪（此期间 PNG 仍在场——US-16：不得两帧皆空）
let pool = null;            // 已校验池（含 src 映射）
let slot = 'idle';          // 当前语义档位（主进程 pet-state）
let facing = 'left';        // 朝向：walk-* / run-* / escape-* 档位推导；'right' ⇒ 视频镜像
let front = 0, gen = 0;     // 前台渲染位索引 / 自增代次（竞态防护）
let pending = null, playing = null;  // { name, loop, gen } / { name, kind, loop, slotKey, mirror }
let cur = null;             // 当前段名（链的「避开连播」基准）
let failCount = 0, moveWait = null, blocked = false;   // 级③ 回落判据 / 散步请求观测定时器 / 整体回落标志
let preEndTimer = null, pauseTimer = null, dragActive = false;  // B21：预触发定时器 / 淡出窗末 pause 定时器 / 拖动在途（避 pet.js 同名 let）
let quietActive = false, quietTimer = null;  // B27 静默运行期状态（§2.14.9）：动作类段末进入；计时到点或槽位到达退出
let allowSet = null, mealMap = {}, lastPoolKey = null;  // B23：可入选段名集合（null = 无门控 ⇒ 不过滤）/ 三餐段名 → 饭点键 / 上次池指纹
let blockSet = [], likeSet = [], weightOf = null;       // B35：屏蔽名单（events 过滤唯一输入）/ 喜欢名单 / 类内选段加权函数（null = 既有均匀，DD-B35-3）
const lastPick = {};        // 池键 → 上一次该档抽中的段（避开连播，US-17 / AC6）

const box = core.mediaBox({
  canvas: core.PET_MEDIA_CANVAS, body: core.PET_MEDIA_BODY,
  targetH: core.PET_BODY_TARGET_H, feetY: core.PET_FEET_Y,
});

/** 链日志：debug 关闭时不产生任何行（主进程也只在 debug 下捕获）。 */
function log(line) { if (debug) console.log('[pet-anim] ' + line); }
function now() { return Math.round(performance.now()); }

/** 媒体盒落位（§2.2.6 算式；只改窗口内容排布，不写窗口位置 / 尺寸）。 */
function applyMediaBox() {
  if (!els.stage) return;
  els.stage.style.left = box.left.toFixed(1) + 'px';
  els.stage.style.top = box.top.toFixed(1) + 'px';
  els.stage.style.width = box.w.toFixed(1) + 'px';
  els.stage.style.height = box.h.toFixed(1) + 'px';
}

/** 通道切换（下行 = 立即交回 PNG）；上行只就位媒体盒、PNG 留在场，首个视频帧就绪由 commitVideo 一次性交换（US-16：不得两帧皆空）。禁止形态①：本函数不动 is-front 归属（摘旧帧的唯一发生点 = switchTo 的就绪回调）。 */
function setChannel(next) {
  mode = next;
  entering = false;
  if (els.stage) els.stage.style.display = next === 'video' ? '' : 'none';
  if (els.img) els.img.style.display = next === 'video' ? 'none' : '';
  if (next !== 'video') { clearQuiet(); clearPreEndTimer(); clearPauseTimer(); for (const el of els.media) { el.onended = null; el.pause(); } pending = null; playing = null; }   // B21：回落时清预触发 / 淡出窗定时器；B27：静默打断（§2.14.9 清除面）
}

/** 进视频通道的准备态：媒体盒就位、PNG 仍在场（入场窗口内窗口内容不为空）。 */
function enterVideo() { entering = true; applyMediaBox(); if (els.stage) els.stage.style.display = ''; }

/** 首个视频帧就绪 ⇒ 真正切到视频通道（隐藏既有 PNG <img>；命中区来源随之切换，§2.2.6）。 */
function commitVideo() { entering = false; mode = 'video'; if (els.img) els.img.style.display = 'none'; }

/** 主进程池下发（`pet-chain-config`）：ok=0 时保持 PNG 通道（级① 回落）。 */
function onConfig(config) {
  if (!config) return;
  debug = !!config.debug;
  if (!config.ok) { log('anim fallback reason=pool'); return; }
  if (els.media.length !== 2) { log('anim fallback reason=media-count'); return; } // 运行期不变量（NFR-10）
  const poolKey = JSON.stringify(config.pool);
  allowSet = Array.isArray(config.allowSet) ? config.allowSet : null;   // B23：门控名单（设计档 PET-UNLOCK.md §2.5.3）
  blockSet = Array.isArray(config.blockSet) ? config.blockSet : [];     // B35：屏蔽名单（PET-GALLERY §2.4.3；独占三段结构上不入内）
  likeSet = Array.isArray(config.likeSet) ? config.likeSet : [];        // B35：喜欢名单（weightOf 构造输入）
  mealMap = config.lockHint && config.lockHint.meals && typeof config.lockHint.meals === 'object' ? config.lockHint.meals : {};
  // B23：池未变 ⇒ 本条下发是**门控重下发**（§2.5.4 重算点）——只换名单、**不重置播放态**（否则饭点演过 / 升级 / 开关翻转会立刻切走在播段）
  // B35：prefs 重下发同路（触发面 ⑥⑦）；在播 loop 段已被排除 ⇒ 温和收尾（U-8 ②，不硬切）
  if (poolKey === lastPoolKey) { applyAllowSet(config.pool); settleExcludedPlaying(); return; }
  lastPoolKey = poolKey;
  clearQuiet();   // B27：池重配打断静默（§2.14.9 清除面；非静默时零行）
  applyAllowSet(config.pool);
  blocked = false;
  enterVideo();
  cur = null;
  playing = null;
  chainStep('start');
}

/** B23 门控喂入（设计档 docs/design/PET-UNLOCK.md §2.5.3 / DD-B23-2）：分类动作按 allowSet **硬排除**——锁住的段不入抽（非权重调零）；
 *  空分类保留（weight 照旧，既有 pickWeightedCategory 只滤 actions.length > 0）；idle / turn / moves 基础档与 events 事件档**不过滤**（不属解锁系统管辖）。
 *  B35 扩展（PET-GALLERY §2.5.2 / DD-B35-4）：events 按 blockSet 过滤（独占三段结构上不可屏蔽 ⇒ drag / escape / quiet 永不空）；
 *  weightOf = likeSet 命中 ⇒ PET_FAV_WEIGHT（类内选段加权；事件档轮换不加权）；同一 blockSet / likeSet 名单下发、无双源。
 *  过滤发生在数据进入既有掷骰函数之前 ⇒ 掷骰次序与函数签名逐字不变；每次下发按 `config.pool` 原池重建（幂等；池未变时不重置播放态）。 */
function applyAllowSet(base) {
  if (!base) return;
  const bset = {};
  for (const n of blockSet) bset[n] = true;
  const lset = {};
  for (const n of likeSet) lset[n] = true;
  weightOf = likeSet.length ? (n) => (lset[n] ? core.PET_FAV_WEIGHT : 1) : null;
  const ev = {};   // 事件档过滤（字符串档同语义：被屏蔽 ⇒ 空数组 ⇒ event-empty 回落）
  for (const k of Object.keys(base.events)) { const v = base.events[k]; ev[k] = Array.isArray(v) ? v.filter((n) => !bset[n]) : (bset[v] ? [] : v); }
  if (!allowSet) { pool = Object.assign({}, base, { events: ev }); return; }   // 无门控（未下发 / 规则档坏 ⇒ allowSet=null）⇒ 分类不过滤、事件档照滤
  const set = {};
  for (const n of allowSet) set[n] = true;
  pool = Object.assign({}, base, { events: ev, categories: base.categories.map((c) => Object.assign({}, c, { actions: c.actions.filter((n) => set[n]) })) });
}

/** B35 在播段排除判定（温和切换谓词）：过滤后池内任何档位仍含该名 ⇒ 可再入选（idle / turn / moves 不属过滤面 ⇒ 恒真）。 */
function stillPickable(name) {
  if (!pool) return true;
  if (pool.idle.indexOf(name) >= 0 || pool.turn.indexOf(name) >= 0 || pool.moves.walk.indexOf(name) >= 0 || pool.moves.run.indexOf(name) >= 0) return true;
  for (const c of pool.categories) if (c.actions.indexOf(name) >= 0) return true;
  for (const k of Object.keys(pool.events)) { const v = pool.events[k]; if (typeof v === 'string' ? v === name : v.indexOf(name) >= 0) return true; }
  return false;
}

/** B35 温和切换（U-8 ② / §2.5.2）：在播段不切断——仅「loop 段且已被排除」⇒ 置 loop=false **并同置 onended 收尾挂钩**（既有 handleEnded 入口，
 *  走段末决策 triggerChainDecision('ended', 0)；gen / playing 守卫逐字沿用——与 switchTo 的 loop=false 分支同形；**不补武装预触发**（武装时点已过，
 *  收尾走 ended 兜底 overlap=0）；挂钩失效 = 换段（old.onended=null）/ 通道回落（setChannel 清除面）既有路径。 */
function settleExcludedPlaying() {
  if (!playing || playing.loop !== true || stillPickable(playing.name)) return;
  const elF = els.media[front];
  if (!elF) return;
  playing.loop = false;
  elF.loop = false;
  elF.onended = () => handleEnded(elF, gen);
  log('anim prefs-settle anim=' + playing.name + ' loop=0');
}

/** B23 饭点「演过」上报（设计档 §2.5.3）：渲染层只上报段名对应的饭点键、不自判（一天一次判据单点在主进程）。 */
function reportMealPlayed(mealKey) { try { window.petAPI.mealPlayed(mealKey); } catch { /* 旧 preload 无该通道 ⇒ 忽略 */ } }

/** 语义档位变化（pet.js 的 setState 上报）：规则 2 = 同档忽略；规则 3 = 定时器回 idle 不切断事件段。 */
function setSlot(s) {
  if (typeof s !== 'string' || s === slot) return;
  slot = s;
  if (s === 'walk-left' || s === 'run-left' || s === 'escape-left') facing = 'left';
  else if (s === 'walk-right' || s === 'run-right' || s === 'escape-right') facing = 'right';
  if (!pool || blocked) return;   // 级①（池不可用）/ 级③（已整体回落）：本会话不再进视频通道
  if (dragActive) return;         // B21：拖动让位守卫——拖动期间只更新 slot 变量、不 startSlot
  if (s === 'idle' && mode === 'video' && playing && playing.kind === 'event' && !playing.loop) return;
  startSlot(s);
}

/** B21 拖动起止上报（pet.js 的 beginDrag / clearDragState 调用）：起拖入 drag 档，松手重断言当前 slot。 */
function setDragging(v) { if (dragActive === v) return; dragActive = v; startSlot(v ? 'drag' : slot); }

/** 档内抽段（§2.2.2 slot 语义）：避开该档上一次抽中的段（无史时避开当前正播段）；日志行 `anim slot`。 */
function pickFor(key, slotVal) {
  const exclude = lastPick[key] !== undefined ? lastPick[key] : cur;
  const name = core.pickSlot(slotVal, exclude);
  lastPick[key] = name;
  log('anim slot key=' + key + ' pick=' + name + ' exclude=' + (exclude === null || exclude === undefined ? '-' : exclude));
  return name;
}

/** 回视频通道（级② 期间的情形）；池不可用 / 级③ 已回落时不进入。 */
function toVideo() { if (mode !== 'video') enterVideo(); }

/** 档位 → 池键（§2.2.3 的 11 档映射表 + B21 drag/escape）。 */
function startSlot(s) {
  clearQuiet();   // B27：任何槽位到达即打断静默（§2.14.9 退出路 ②；非静默时零行）
  if (!pool || blocked) return;
  if (s === 'idle') { toVideo(); chainStep('slot-idle'); return; }
  if (s === 'walk-left' || s === 'walk-right') { toVideo(); switchTo(pickFor('moves.walk', pool.moves.walk), true, 'slot-walk', facing === 'right', 'walk'); return; }
  if (s === 'run-left' || s === 'run-right') {
    toVideo();
    if (!pool.moves.run.length) { log('anim slot-miss slot=moves.run fallback=walk'); switchTo(pickFor('moves.walk', pool.moves.walk), true, 'slot-run', facing === 'right', 'run'); return; }
    switchTo(pickFor('moves.run', pool.moves.run), true, 'slot-run', facing === 'right', 'run');
    return;
  }
  if (s === 'escape-left' || s === 'escape-right' || s === 'drag') {   // B21：escape / drag 交互档；B27：escape = loop=false 单遍（drag 仍 true）
    const key = s === 'drag' ? 'drag' : 'escape';
    const sv = pool.events[key];
    toVideo();
    if (!sv) { log('anim slot-miss slot=events.' + key + ' fallback=png'); setChannel('png'); return; }
    switchTo(pickFor('events.' + key, sv), s === 'drag', s === 'drag' ? 'slot-drag' : 'slot-escape', s === 'drag' ? false : facing === 'right', 'event');
    return;
  }
  const slotVal = pool.events[s];
  if (slotVal === undefined) { log('anim slot-miss slot=events.' + s + ' fallback=png'); setChannel('png'); return; }
  if (Array.isArray(slotVal) && slotVal.length === 0) { log('anim event-empty slot=' + s); return; }   // B35：事件全屏蔽 ⇒ 动画面忽略（不切段、保持当前段——硬约束 4 / DD-B35-10；状态机与台词面不动）
  toVideo();
  const single = typeof slotVal === 'string' || slotVal.length <= 1;
  switchTo(pickFor('events.' + s, slotVal), s === 'sleep' || single, 'slot-' + s, false, 'event');
}

/** 该次链决策所用池的候选数：单候选 ⇒ `loop=true`（§2.2.3 idle 行 / TC-5：不重载、不闪断）；turn 行固定 `false`。 */
function chainPoolSize(d) {
  if (d.kind === 'idle') return pool.idle.length;
  if (d.kind !== 'action') return 2;
  const c = pool.categories.filter((x) => x.id === d.category)[0];
  return c ? c.actions.length : pool.idle.length;
}

/** 链的一步（只在 idle 档运转，§2.2.4 规则 1）；掷出 move ⇒ 发散步请求后重掷一次。 */
function chainStep(reason, allowMove) {
  if ((mode !== 'video' && !entering) || !pool) return;
  const d = core.pickChainNext({ weights: pool.weights, roll: Math.random(), cur, facing, pool, weightOf });   // B35：weightOf 透传（null = 既有均匀）
  log('anim chain kind=' + d.kind + ' pick=' + (d.name === null ? '-' : d.name) + ' mirror=' + (d.mirror ? 1 : 0) + ' cat=' + (d.category === null ? '-' : d.category));
  if (d.kind === 'move' && allowMove !== false) { requestMove(); chainStep('move-ack', false); return; }
  if (d.name === null) return;
  switchTo(d.name, chainPoolSize(d) <= 1, reason, d.mirror, d.kind === 'turn' ? 'turn' : d.kind);
}

/** B21 定时器清理（被换段 / 回落 / 结束时调用）。 */
function clearPreEndTimer() { if (preEndTimer) { clearTimeout(preEndTimer); preEndTimer = null; } }
function clearPauseTimer() { if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; } }

/** B21 段末前预触发（设计档 §2.13.4）：仅 loop=false 段；armed 于 play 成功后；回调校验 gen 与段名。 */
function schedulePreEnd(el, dur) {
  clearPreEndTimer();
  const N = core.PET_OVERLAP_MS;   // 单一消费点（NFR-23 / AC27 ⑤）
  if (!dur || dur <= N) return;
  const armedAt = now();
  const armedName = playing ? playing.name : null;
  preEndTimer = setTimeout(() => {
    preEndTimer = null;
    if (!playing || !el || armedName !== playing.name || gen !== pending?.gen) return;
    const overlap = Math.max(0, Math.round(dur - (now() - armedAt)));   // 实测剩余（定时器只晚不早 ⇒ ≤ N）
    triggerChainDecision('pre-end', overlap);
  }, Math.max(0, dur - N));
}

/** B21 段末决策统一入口（ended / 预触发共用 decideNext——决策同源，防两处漂移）。 */
function triggerChainDecision(reason, overlap) {
  if (mode !== 'video' || !pool || !playing) return;
  if (playing.kind === 'turn') facing = facing === 'right' ? 'left' : 'right';   // 翻转由本档执行（§2.13.4；B18 同款）；B27：先于 decideNext、与下一计划类型解耦（§2.14.9）
  const d = core.decideNext({ pool, weights: pool.weights, roll: Math.random(), slot, playing, cur, facing, quiet: quietActive, weightOf });   // B35：weightOf 透传
  if (d.plan === 'rotate') { lastPick['events.' + slot] = d.name; switchTo(d.name, false, reason, d.mirror, 'event', overlap); return; }
  if (d.plan === 'quiet') { switchTo(d.name, true, 'quiet', false, 'quiet', overlap); return; }   // B27：静默段循环（§2.14.9）；quietActive/计时器/enter 行落账 = 播放成功回调（AC33①②③）
  if (d.plan === 'chain') { switchTo(d.name, chainPoolSize(d) <= 1, reason, d.mirror, d.kind === 'turn' ? 'turn' : d.kind, overlap); return; }
  requestMove();   // plan === 'none'（= 掷出 move）：发散步请求后回链重掷
  chainStep(reason, false);
}

/** B27 静默进入落账（§2.14.9 进入面；由 switchTo 播放成功回调调用）：enter 行落在 switch 行之后（AC33①② 区间锚）、与计时器武装同 tick（AC33③ 时长）。 */
function enterQuiet(name) {
  const dur = core.PET_QUIET_MS;   // 单点消费（§2.14.8 常量表：计时器与 enter dur 字段同源一处读取）
  quietActive = true;
  quietTimer = setTimeout(quietExpire, dur);
  log('anim quiet enter name=' + name + ' dur=' + dur);
}

/** B27 静默计时到点（§2.14.9 退出路 ①）：先落 end 行、再回链重掷——决策行在 quiet end 之后、区间外（AC33② 显式豁免）。 */
function quietExpire() {
  quietTimer = null;
  quietActive = false;
  log('anim quiet end reason=timer');
  triggerChainDecision('quiet-end', 0);
}

/** B27 静默清除面（§2.14.9 退出路 ②）：非 idle 槽进入（startSlot 首行）/ 通道回落（setChannel 下行）/ 池重配（onConfig）/ 播中出错（onPlayFail 入口）四处调用；幂等——非静默时零行零日志。 */
function clearQuiet() {
  if (!quietActive) return;
  if (quietTimer) { clearTimeout(quietTimer); quietTimer = null; }
  quietActive = false;
  log('anim quiet end reason=slot');
}

/** 切换序列（§2.2.5 五步 + B21 衔接 + R1/R2）：写 back 位 → 等就绪 → 校验代次 → 换前台 → play。 */
function switchTo(name, loop, reason, mirror, kind, overlap) {
  if ((mode !== 'video' && !entering) || !pool) return;
  const j = core.judgeSwitch({ playing, name, mirror });   // B21 R1/R2 唯一前置判定
  if (j === 'hold-same') {   // R1：同段不重播——使在途预载失效（不 gen++：保住挂起的淡出窗 pause 回调）+ 同步槽键 / 镜像
    pending = null;
    const elB = els.media[1 - front];
    if (elB && elB.onended) { elB.onended = null; elB.onerror = null; elB.pause(); }   // 孤儿预载解除武装（onended 在场 ⇒ 在途预载，非淡出窗旧段）
    if (playing) { playing.slotKey = slot; playing.mirror = mirror; }
    log('anim hold reason=same same=1 name=' + name + ' key=' + (playing ? playing.slotKey : '-'));
    return;
  }
  if (j === 'hold-mirror') {   // R2：仅镜像变化只改 transform，不重载（pending 失效同上）
    pending = null;
    const elB = els.media[1 - front];
    if (elB && elB.onended) { elB.onended = null; elB.onerror = null; elB.pause(); }   // 孤儿预载解除武装（同上）
    const elF = els.media[front];
    if (elF) elF.style.transform = mirror ? 'scaleX(-1)' : '';
    if (playing) { playing.slotKey = slot; playing.mirror = mirror; }
    log('anim hold reason=mirror name=' + name + ' key=' + (playing ? playing.slotKey : '-'));
    return;
  }
  const src = pool.src[name];
  if (typeof src !== 'string') { log('anim slot-miss slot=' + slot + ' fallback=none'); return; }
  const el = els.media[1 - front], old = els.media[front];
  if (!el || !old) return;
  const g = ++gen;
  const from = cur;
  const t0 = now();
  pending = { name, loop, gen: g };
  clearPreEndTimer();
  clearPauseTimer();
  el.loop = !!loop; el.muted = true; el.playsInline = true; el.autoplay = true;
  el.onended = loop ? null : () => handleEnded(el, g);
  el.onerror = () => onPlayFail(name, 'error');
  el.style.transform = mirror ? 'scaleX(-1)' : '';
  el.src = src;
  el.load();
  const ready = () => {
    if (!pending || pending.gen !== g) return;   // 过期（竞态防护）：丢弃本次切换
    const tReady = now();
    const overlapMs = overlap ?? 0;
    el.classList.add('is-front');
    if (entering) commitVideo();  // 首帧就绪与摘 PNG 同帧提交（入场不出现两帧皆空）
    old.classList.remove('is-front');            // 旧段摘前台只发生在此回调内（禁止形态①）
    old.onended = null;
    // B21：旧段 pause 唯一调用点 = 淡出窗末回调（时长 = 运行期读 CSS transition-duration；reduce ⇒ 0 ⇒ 即刻 pause）
    const transDur = getComputedStyle(el).transitionDuration;
    const fadeMs = transDur && transDur !== '0s' && transDur !== 'none' ? Math.round(parseFloat(transDur) * 1000) : 0;
    const oldEl = old, oldGen = g, oldName = from;
    pauseTimer = setTimeout(() => {
      pauseTimer = null;
      // 失效守卫（F-3）：gen 未变 ∧ 元素仍承载旧段名 ∧ 未当前台 ⇒ 才 pause（防暂停新前台）
      if (gen !== oldGen || !oldEl || oldEl.classList.contains('is-front')) return;
      const srcName = decodeURIComponent(String(oldEl.currentSrc || '').split('/').pop() || '').replace(/\.webm$/, '');
      if (srcName === oldName) oldEl.pause();
    }, fadeMs);
    front = 1 - front;
    playing = { name, kind, loop: !!loop, slotKey: slot, mirror };
    cur = name;
    el.play().then(() => {
      failCount = 0;
      log('anim switch anim=' + name + ' from=' + (from === null ? '-' : from) + ' t0=' + t0 + ' ready=' + tReady + ' shown=' + now()
        + ' readyState=' + el.readyState + ' loop=' + (loop ? 1 : 0) + ' reason=' + reason + ' overlap=' + overlapMs);
      if (mealMap[name]) reportMealPlayed(mealMap[name]);   // B23：三餐段演成 ⇒ 上报（主进程落盘后立即重下发）
      if (reason === 'quiet') enterQuiet(name);   // B27：静默落账在 switch 行之后（§2.14.9；AC33①②③）
      if (!loop && Number.isFinite(el.duration) && el.duration > 0) schedulePreEnd(el, el.duration * 1000);   // B21：loop=false 段武装预触发
    }).catch((err) => onPlayFail(name, String(err)));
  };
  if (el.readyState >= 2) ready();
  else el.addEventListener('loadeddata', ready, { once: true });
}

/** 段结束（§2.2.4 规则 3）：统一走段末决策（B21；overlap=0 兜底）。 */
function handleEnded(el, g) {
  if (mode !== 'video' || gen !== g || !playing) return;
  const dur = Number.isFinite(el.duration) ? el.duration.toFixed(2) : '-';
  log('anim ended anim=' + playing.name + ' t=' + now() + ' dur=' + dur);
  triggerChainDecision('ended', 0);
}

/** move 档（§2.2.4 规则 4）：请求既有 doWander()，≤1 s 观测 walk-* / run-*，超时记 ack=timeout 并继续链。 */
function requestMove() {
  clearTimeout(moveWait);
  try { window.petAPI.chainMove(); } catch { /* 旧 preload 无该通道 ⇒ 视作未接单 */ }
  log('anim move-req sent=1 ack=pending');
  moveWait = setTimeout(() => {
    moveWait = null;
    const hit = slot === 'walk-left' || slot === 'walk-right' ? 'walk' : (slot === 'run-left' || slot === 'run-right' ? 'run' : 'timeout');
    log('anim move-req sent=0 ack=' + hit);
    if (hit === 'timeout') chainStep('move-timeout');
  }, 1000);
}

/** 播放失败（级③）：逐段跳过；连续 ≥3 段失败 ⇒ 整体回落 PNG（不静默）。 */
function onPlayFail(name, err) {
  clearQuiet();   // B27：播中出错短路静默（§2.14.9 清除面第 4 点；非静默时零行）
  failCount += 1;
  log('anim play-fail anim=' + name + ' err=' + err + ' n=' + failCount);
  if (failCount >= 3) { blocked = true; log('anim fallback reason=play-failed'); setChannel('png'); return; }
  chainStep('play-fail');
}

setChannel('png'); // 初始 = PNG 通道（池未下发 / 非法时保持不变，级① 回落）
if (window.petAPI.onChainConfig) window.petAPI.onChainConfig(onConfig);

window.petChain = {
  videoActive() { return mode === 'video'; },   // 视频通道是否在场（pet.js 命中区来源判据，§2.2.6）
  hitRect() { return mode === 'video' ? box.hit : null; },   // 视频通道命中矩形（PNG 通道由 pet.js 读 img 矩形）
  setSlot,
  setDragging,
};
