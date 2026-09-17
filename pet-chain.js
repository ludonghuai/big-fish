'use strict';
/**
 * pet-chain.js — 双缓冲视频播放器 + 动画链运转 + 三级回落 + 链日志（B18；设计档 docs/design/PET-ANIMATION.md §2.2.5 / §2.2.8 / §2.2.9 / §2.2.11）。
 * 边界（设计档 §2.2.1）：零 fs / 零 fetch——池数据只来自主进程的 `pet-chain-config`；本档不碰窗口几何。
 * 函数清单：onConfig · setSlot · startSlot · chainStep · switchTo · handleEnded · requestMove · onPlayFail · setChannel · applyMediaBox · log。
 * 全局出口（渲染层内部接口，承设计档 §2.2.1）：window.petChain = { videoActive, hitRect, setSlot }。
 */

const core = window.PetChainCore;

const els = {
  stage: document.getElementById('pet-stage'),
  img: document.getElementById('pet'),
  media: Array.prototype.slice.call(document.querySelectorAll('video.pet-media')),
};

let debug = false;          // 链日志总开关（主进程按 BIGFISH_PET_DEBUG 下发；关闭时零日志）
let mode = 'png';           // 回落链的当前通道（设计档 §2.2.8）
let entering = false;       // 已收到合法池、首个视频帧未就绪（此期间 PNG 仍在场——US-16：不得两帧皆空）
let pool = null;            // 已校验池（含 src 映射）
let slot = 'idle';          // 当前语义档位（主进程 pet-state）
let facing = 'left';        // 朝向：由 walk-* / run-* 档位推导；'right' ⇒ 视频镜像
let front = 0;              // 前台渲染位索引
let gen = 0;                // 自增代次（竞态防护）
let pending = null;         // { name, loop, gen }
let playing = null;         // { name, kind, loop, slotKey }
let cur = null;             // 当前段名（链的「避开连播」基准）
let failCount = 0;          // 连续失败计数（级③ 回落判据）
let moveWait = null;        // 散步请求的观测定时器
let blocked = false;        // 级③：播放连续失败已整体回落 ⇒ 本会话不再进视频通道
const lastPick = {};        // 池键 → 上一次该档抽中的段（避开连播同一段，US-17 / AC6）

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

/**
 * 通道切换（下行 = 立即交回 PNG）；上行不在此处完成——`enterVideo()` 只就位媒体盒、PNG 留在场，
 * 首个视频帧就绪时由 `commitVideo()` 一次性交换（US-16：任何时刻不得两帧皆空）。禁止形态① 遵守：
 * 本函数**不动** `is-front` 归属（摘旧帧的唯一发生点 = `switchTo` 的就绪回调）。
 */
function setChannel(next) {
  mode = next;
  entering = false;
  if (els.stage) els.stage.style.display = next === 'video' ? '' : 'none';
  if (els.img) els.img.style.display = next === 'video' ? 'none' : '';
  if (next !== 'video') { for (const el of els.media) { el.onended = null; el.pause(); } pending = null; playing = null; }
}

/** 进视频通道的准备态：媒体盒就位、PNG 仍在场（入场窗口内窗口内容不为空）。 */
function enterVideo() {
  entering = true;
  applyMediaBox();
  if (els.stage) els.stage.style.display = '';
}

/** 首个视频帧就绪 ⇒ 真正切到视频通道（隐藏既有 PNG <img>；命中区来源随之切换，§2.2.6）。 */
function commitVideo() {
  entering = false;
  mode = 'video';
  if (els.img) els.img.style.display = 'none';
}

/** 主进程池下发（`pet-chain-config`）：ok=0 时保持 PNG 通道（级① 回落）。 */
function onConfig(config) {
  if (!config) return;
  debug = !!config.debug;
  if (!config.ok) { log('anim fallback reason=pool'); return; }
  if (els.media.length !== 2) { log('anim fallback reason=media-count'); return; } // 运行期不变量（NFR-10）
  pool = config.pool;
  blocked = false;
  enterVideo();
  cur = null;
  playing = null;
  chainStep('start');
}

/** 语义档位变化（pet.js 的 setState 上报）：规则 2 = 同档忽略；规则 3 = 定时器回 idle 不切断事件段。 */
function setSlot(s) {
  if (typeof s !== 'string' || s === slot) return;
  slot = s;
  if (s === 'walk-left' || s === 'run-left') facing = 'left';
  else if (s === 'walk-right' || s === 'run-right') facing = 'right';
  if (!pool || blocked) return;   // 级①（池不可用）/ 级③（已整体回落）：本会话不再进视频通道
  if (s === 'idle' && mode === 'video' && playing && playing.kind === 'event' && !playing.loop) return;
  startSlot(s);
}

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

/** 档位 → 池键（§2.2.3 的 11 档映射表）。 */
function startSlot(s) {
  if (!pool || blocked) return;
  if (s === 'idle') { toVideo(); chainStep('slot-idle'); return; }
  if (s === 'walk-left' || s === 'walk-right') { toVideo(); switchTo(pickFor('moves.walk', pool.moves.walk), true, 'slot-walk', facing === 'right', 'walk'); return; }
  if (s === 'run-left' || s === 'run-right') {
    toVideo();
    if (!pool.moves.run.length) {
      log('anim slot-miss slot=moves.run fallback=walk');
      switchTo(pickFor('moves.walk', pool.moves.walk), true, 'slot-run', facing === 'right', 'run');
      return;
    }
    switchTo(pickFor('moves.run', pool.moves.run), true, 'slot-run', facing === 'right', 'run');
    return;
  }
  const slotVal = pool.events[s];
  if (slotVal === undefined) { log('anim slot-miss slot=events.' + s + ' fallback=png'); setChannel('png'); return; }
  toVideo();
  const single = typeof slotVal === 'string' || slotVal.length <= 1;
  switchTo(pickFor('events.' + s, slotVal), s === 'sleep' || single, 'slot-' + s, false, 'event');
}

/** 该次链决策所用池的候选数：单候选 ⇒ `loop=true`（§2.2.3 idle 行 / TC-5：不重载、不闪断）；turn 行固定 `false`。 */
function chainPoolSize(d) {
  if (d.kind === 'idle') return pool.idle.length;
  if (d.kind === 'action') {
    const c = pool.categories.filter((x) => x.id === d.category)[0];
    return c ? c.actions.length : pool.idle.length;
  }
  return 2;
}

/** 链的一步（只在 idle 档运转，§2.2.4 规则 1）；掷出 move ⇒ 发散步请求后重掷一次。 */
function chainStep(reason, allowMove) {
  if ((mode !== 'video' && !entering) || !pool) return;
  const d = core.pickChainNext({ weights: pool.weights, roll: Math.random(), cur, facing, pool });
  log('anim chain kind=' + d.kind + ' pick=' + (d.name === null ? '-' : d.name) + ' mirror=' + (d.mirror ? 1 : 0) + ' cat=' + (d.category === null ? '-' : d.category));
  if (d.kind === 'move' && allowMove !== false) { requestMove(); chainStep('move-ack', false); return; }
  if (d.name === null) return;
  switchTo(d.name, chainPoolSize(d) <= 1, reason, d.mirror, d.kind === 'turn' ? 'turn' : d.kind);
}

/** 切换序列（§2.2.5 五步）：写 back 位 → 等就绪 → 校验代次 → 换前台 → play。 */
function switchTo(name, loop, reason, mirror, kind) {
  if ((mode !== 'video' && !entering) || !pool) return;
  const src = pool.src[name];
  if (typeof src !== 'string') { log('anim slot-miss slot=' + slot + ' fallback=none'); return; }
  const el = els.media[1 - front], old = els.media[front];
  if (!el || !old) return;
  const g = ++gen;
  const from = cur;
  const t0 = now();
  pending = { name, loop, gen: g };
  el.loop = !!loop; el.muted = true; el.playsInline = true; el.autoplay = true;
  el.onended = loop ? null : () => handleEnded(el, g);
  el.onerror = () => onPlayFail(name, 'error');
  el.style.transform = mirror ? 'scaleX(-1)' : '';
  el.src = src;
  el.load();
  const ready = () => {
    if (!pending || pending.gen !== g) return;   // 过期（竞态防护）：丢弃本次切换
    const tReady = now();
    el.classList.add('is-front');
    if (entering) commitVideo();  // 首帧就绪与摘 PNG 同帧提交（入场不出现两帧皆空）
    old.classList.remove('is-front');            // 旧段摘前台只发生在此回调内（禁止形态①）
    old.onended = null;
    old.pause();
    front = 1 - front;
    playing = { name, kind, loop: !!loop, slotKey: slot };
    cur = name;
    el.play().then(() => {
      failCount = 0;
      log('anim switch anim=' + name + ' from=' + (from === null ? '-' : from) + ' t0=' + t0 + ' ready=' + tReady + ' shown=' + now()
        + ' readyState=' + el.readyState + ' loop=' + (loop ? 1 : 0) + ' reason=' + reason);
    }).catch((err) => onPlayFail(name, String(err)));
  };
  if (el.readyState >= 2) ready();
  else el.addEventListener('loadeddata', ready, { once: true });
}

/** 段结束（§2.2.4 规则 3）：事件段 → 档内轮换或回链；turn 段 → 翻转朝向回链；其余 → 回链。 */
function handleEnded(el, g) {
  if (mode !== 'video' || gen !== g || !playing) return;
  const dur = Number.isFinite(el.duration) ? el.duration.toFixed(2) : '-';
  log('anim ended anim=' + playing.name + ' t=' + now() + ' dur=' + dur);
  if (playing.kind === 'event') {
    const next = playing.slotKey === slot ? core.nextInSlot(pool.events[slot], playing.name) : null;
    if (next) { lastPick['events.' + slot] = next; switchTo(next, false, 'slot-rotate', false, 'event'); return; }
    chainStep('event-end');
    return;
  }
  if (playing.kind === 'turn') facing = facing === 'right' ? 'left' : 'right';
  chainStep('ended');
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
  failCount += 1;
  log('anim play-fail anim=' + name + ' err=' + err + ' n=' + failCount);
  if (failCount >= 3) { blocked = true; log('anim fallback reason=play-failed'); setChannel('png'); return; }
  chainStep('play-fail');
}

setChannel('png'); // 初始 = PNG 通道（池未下发 / 非法时保持不变，级① 回落）
if (window.petAPI.onChainConfig) window.petAPI.onChainConfig(onConfig);

window.petChain = {
  /** 视频通道是否在场（pet.js 的命中区来源判据，§2.2.6）。 */
  videoActive() { return mode === 'video'; },
  /** 视频通道命中矩形（身体盒映射到窗口坐标；PNG 通道由 pet.js 读既有 img 矩形）。 */
  hitRect() { return mode === 'video' ? box.hit : null; },
  setSlot,
};
