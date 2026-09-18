'use strict';
/**
 * shell-pet-physics.js — 桌宠物理域实现：拖动期光标采样 + 起飞门 + 飞行循环 + 停泊收口 + 挤压 IPC（B20 / B26；设计档 docs/design/PET-MOVEMENT.md §2.2.1 / §2.2.2 / §2.2.5 / §2.2.6 / §2.2.11 / §2.2.13）。
 * 函数清单：physLog · init · isFlying · handleTrailStart / sampleCursor / handleTrailEnd · evaluateArm / armFlight ·
 *   startFlightLoop · flightTick · sendSquash · stopFlight（停泊收口）· handlePhysicsToggle · registerScreenStops · quit。
 * 依赖方向：只读 geometry helper（petWorkAreaBounds / petCurrentDisplay / petSettlePos / petApplyPos /
 *   petCalibrateSize / petSavePos / petGeomSnapshot / petPosText）+ 经 init(deps) 注入的访问器
 *   （getPetWindow / getPetDrag / getMoveTimer / settings / setPetState）。
 * 禁（NFR-8 / NFR-18）：不自造第二份几何判定、不新增尺寸写入路径；flightTick 体内零 petSavePos / 零 petCalibrateSize / 零 getSize。
 * 地面口径（B26 / §2.2.13）：飞行 bounds = core.groundBounds(geometry.petWorkAreaBounds(...))——物理地面 = 可见身体底沿（原窗口矩形口径只作 maxY 中间量）；
 *   groundBounds 经 module.exports 转暴露（散步 y 归位同口径取用，不新增 require 边）。
 */

const { app, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const core = require('./pet-physics-core.js');
const geometry = require('./shell-pet-geometry.js');

// 注入面（组合根 main.js 接线；§2.2.1）：只保存 deps + 注册本模块自有的两条拖动事件监听器
// （§2.8：init 不触 screen——三条 screen.on 由组合根经 registerScreenStops 在 whenReady 内、几何三条之前注册，E7）
let getPetWindow = null;
let getPetDrag = null;
let getMoveTimer = null;
let settings = null;
let setPetState = null;

/**
 * init（deps）：只保存依赖（不触 screen，§2.8）。拖动事件监听（pet-drag-start / pet-drag-end）的
 * 注册点 = shell-ipc.js（设计档 §2.2.5 第 2 条「注册在 shell-ipc.js」）——与冻结面既有绑定并存，
 * 不依赖监听顺序：起飞评估在 setImmediate，晚于同一事件的全部监听器（含冻结面收口，DD-4）。
 * G3 会话幂等 = sessionSeq（drag 会话序号，每次 drag-start 递增；由 handleTrailStart 维护）。
 */
function init(deps) {
  getPetWindow = deps.getPetWindow;
  getPetDrag = deps.getPetDrag;
  getMoveTimer = deps.getMoveTimer;
  settings = deps.settings;
  setPetState = deps.setPetState;
}

// ---------------------------------------------------------------------------
// 状态（§2.2.1 / §2.2.2）
// ---------------------------------------------------------------------------
/** 飞行态（null = 未在飞）：{ state, bounds, timer, startAt, steps, prevGrounded, lastApplied, animState }。 */
let flying = null;
/** 光标轨迹（§2.2.5）：[{t,x,y}]，t = performance.now()；保留窗口 200 ms（trimTrail）。 */
let trail = [];
/** 光标采样器定时器（null = 未采样；仅物理开启且拖动中运行——关闭态零定时器，AC8④ / TC-23）。 */
let trailTimer = null;
/** G3 会话幂等：当前 drag 会话序号（pet-drag-start 递增）/ 已消费（评估过）的序号。 */
let sessionSeq = 0;
let lastEvaluatedSeq = 0;
const PHYSICS_DEBUG = process.env.BIGFISH_PET_DEBUG === '1'; // 物理诊断日志开关（默认关闭，关闭时零开销）

/** 追加一行物理诊断日志（userData/pet-physics.log，最佳努力；先例 pet-drag.log / pet-geometry.log，DD-13）。 */
function physLog(line) {
  if (!PHYSICS_DEBUG) return;
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'pet-physics.log'), '[' + new Date().toISOString() + '] ' + line + '\n');
  } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// 拖动期光标轨迹采样（§2.2.5 第 1 条：仅位置变化才记点）
// ---------------------------------------------------------------------------
function handleTrailStart() {
  sessionSeq += 1;
  if (settings.get().petPhysicsEnabled !== true) return; // G1：开关关闭 ⇒ 采样器不起（零定时器、零日志）
  const win = getPetWindow && getPetWindow();
  if (!win || win.isDestroyed()) return;
  trail = [];
  stopTrailSampler();
  trailTimer = setInterval(sampleCursor, core.PHYS_TRAIL_MS);
  // 诊断行（修偏轮 2）：处理器被调用 + 采样器已起——下次「甩了没反应」不再靠外部推断；
  //   关闭态（G1 早退）零日志保持（AC8④ / TC-23），故本行在 G1 之后
  physLog('phys-trail-start seq=' + sessionSeq);
}

function sampleCursor() {
  const win = getPetWindow && getPetWindow();
  if (!win || win.isDestroyed()) { stopTrailSampler(); return; }
  if (getPetDrag && getPetDrag() === null) { stopTrailSampler(); return; } // 拖动已停（drag-end / 点击收口）⇒ 采样器自停
  const c = screen.getCursorScreenPoint();
  const last = trail.length ? trail[trail.length - 1] : null;
  if (last && last.x === c.x && last.y === c.y) return; // 仅位置变化才记点（「松手前停顿」自然过期，TC-12）
  const now = performance.now();
  trail.push({ t: now, x: c.x, y: c.y });
  trail = core.trimTrail(trail, now);
}

function stopTrailSampler() {
  if (trailTimer) { clearInterval(trailTimer); trailTimer = null; }
}

/**
 * pet-drag-end 处理器（ipcMain 派发形态 = (event, reason)，与冻结面 handlePetDragEnd(_e, reason) 同通道同形）。
 * 修偏轮 2（B20 · 2026-09-18 实机修偏）：原单参签名把 IpcMainEvent 绑进 reasonRaw ⇒ 归一化恒拒 ⇒ 静默清轨迹、零日志
 *   ——即用户实机「甩了无任何反应」的真因（离屏复现：probe arg1=IpcMainEvent arg2=reason，2026-09-18）。
 */
function handleTrailEnd(_event, reasonRaw) {
  stopTrailSampler();
  if (settings.get().petPhysicsEnabled !== true) { trail = []; return; } // 关闭态：零评估零日志（§2.2.10 行 1）
  const reason = typeof reasonRaw === 'string' ? reasonRaw : '';
  // G6：reason 归一化（非法 ⇒ 清轨迹、不起飞，§2.2.5 第 2 条）；合法 ⇒ setImmediate 评估（DD-4）。
  //   非法（含非字符串 / 空串的异常派发）⇒ 留 bad-reason 取证行（§2.2.11 词表项；修偏轮 2 前该词无产出行）
  if (!/^(pointerup|pointercancel|lostcapture)$/.test(reason)) {
    physLog('phys-stop reason=bad-reason pos=' + physPos(getPetWindow && getPetWindow()));
    trail = [];
    return;
  }
  setImmediate(evaluateArm, sessionSeq);
}

// ---------------------------------------------------------------------------
// 起飞评估（armGate 消费，§2.2.2 / §2.2.5）
// ---------------------------------------------------------------------------
function evaluateArm(seq) {
  const now = performance.now();
  const win = getPetWindow && getPetWindow();
  // 地面口径（B26 / §2.2.13）：groundBounds 只抬 maxY（可见脚底踩实），null 透传 ⇒ G8 no-bounds 照旧
  const waBounds = win && !win.isDestroyed() ? geometry.petWorkAreaBounds(geometry.petCurrentDisplay()) : null;
  const bounds = core.groundBounds(waBounds);
  const gate = core.armGate({
    enabled: settings.get().petPhysicsEnabled === true,
    windowAlive: !!(win && !win.isDestroyed()),
    sessionSeq: seq,
    lastEvaluatedSeq,
    dragActive: !!(getPetDrag && getPetDrag() !== null),
    wanderInFlight: !!(getMoveTimer && getMoveTimer() !== null),
    reasonOk: true, // G6 已在 handleTrailEnd 前置执法（归一化处）；删前置须同步改为传入归一化结果
    trail,
    now,
    physics: core.PHYSICS,
    bounds,
    flying: flying !== null,
  });
  lastEvaluatedSeq = seq; // 会话已消费（无论结果——同一会话只评估一次，G3）
  if (!gate.ok) {
    // 各 G 的 reason 原样落 phys-stop（词表 = §2.2.11 的 14 个；G4 drag-active 照抄，不换词）；
    //   toggle-off 静默（关闭态零日志，AC8④ / TC-23）；飞行中抢占的 phys-stop reason=drag-preempt
    //   由 flightTick 首行产出（交接② / §2.2.10 行 6 的字面判据），display-change 由 registerScreenStops 产出
    if (gate.reason === 'toggle-off') { /* 关闭态零日志（AC8④ / TC-23）*/ }
    else physLog('phys-stop reason=' + gate.reason + ' pos=' + physPos(win));
    trail = [];
    return;
  }
  armFlight(win, gate, bounds, now);
}

/** 起飞（phys-arm）：起飞归一化钳入 + prevGrounded 初值 + 建飞行态 + 起循环（§2.2.5 第 4 / 7 条）。 */
function armFlight(win, gate, bounds, now) {
  const [px, py] = win.getPosition(); // s0 = 冻结面收口之后的终值（§2.2.5 第 4 条）
  // 起飞归一化（§2.2.5 第 7 条）：B03 settle 只保中心点可见，s0 可合法落在窗口矩形区间外（US-2 允许拖出屏）
  //   ⇒ 一次性钳入；位移由首个 tick 的一次 setPosition 落地（不新增写入时点；已知限制 O-10）
  const s0 = {
    x: Math.min(Math.max(px, bounds.minX), bounds.maxX),
    y: Math.min(Math.max(py, bounds.minY), bounds.maxY),
    vx: gate.vel.vx,
    vy: gate.vel.vy,
  };
  flying = {
    state: s0,
    bounds,
    timer: null,
    startAt: now,
    steps: 0,
    prevGrounded: s0.y >= bounds.maxY, // 贴地位形起飞不产生伪挤压（AC4⑤ / §2.2.5 第 7 条）
    lastApplied: [Math.round(px), Math.round(py)], // 同目标去重基准（与冻结面 lastApplied 同形）
    animState: null,
  };
  physLog(
    'phys-arm vel=(' + Math.round(gate.vel.vx) + ',' + Math.round(gate.vel.vy) + ')'
    + ' pos=' + geometry.petPosText([px, py]) + ' bounds=(' + bounds.minX + ',' + bounds.minY + ',' + bounds.maxX + ',' + bounds.maxY + ')'
    + ' trail=' + trail.length,
  );
  trail = [];
  startFlightLoop();
}

function startFlightLoop() {
  const flight = flying;
  const armedAt = performance.now();
  let last = armedAt;
  const loop = () => {
    if (flying !== flight) return; // 已收口（tick 内 stopFlight 已清 timer 与 flying）
    const now = performance.now();
    flightTick(now - last);
    last = now;
    if (flying !== flight) return;
    if (now - armedAt >= core.PHYS_MAX_FLIGHT_MS) stopFlight('timeout'); // 5 s 硬上界（§2.2.6）
  };
  flight.timer = setInterval(loop, core.PHYS_POLL_MS);
}

// ---------------------------------------------------------------------------
// 飞行 tick（§2.2.4 步进 + §2.2.2 交接② 抢占首行；tick 体内零 petSavePos / 零 petCalibrateSize / 零 getSize）
// ---------------------------------------------------------------------------
function flightTick(dtMs) {
  if (!flying) return;
  // 交接② 抢占首行：drag 已起 ⇒ 立即停、零写入（AC5②；JS 单线程 ⇒ tick 执行不可被 IPC 处理器插入）
  // phys-stop 取证行（§2.2.10 行 6 字面判据：drag-preempt 之后无 phys-tick … wrote=1）
  if (getPetDrag && getPetDrag() !== null) {
    physLog('phys-stop reason=drag-preempt pos=' + physPos(getPetWindow && getPetWindow()));
    stopFlight('drag-preempt');
    return;
  }
  const win = getPetWindow && getPetWindow();
  if (!win || win.isDestroyed()) { stopFlight('destroyed'); return; }
  if (settings.get().petPhysicsEnabled !== true) { stopFlight('toggle'); return; }
  try {
    const fallingVy = flying.state.vy; // Q 弹冲击速度 = 本步积分前的 vy（§2.2.7）
    const res = core.throwStep(flying.state, dtMs / 1000, flying.bounds, core.PHYSICS);
    flying.state = { x: res.x, y: res.y, vx: res.vx, vy: res.vy };
    flying.steps += 1;
    const rounded = [Math.round(res.x), Math.round(res.y)];
    // 同目标去重（NFR-18：每 tick 至多 1 次写；位置未变 ⇒ 零写入）
    const wrote = (flying.lastApplied[0] !== rounded[0] || flying.lastApplied[1] !== rounded[1]) ? 1 : 0;
    if (wrote) { win.setPosition(rounded[0], rounded[1]); flying.lastApplied = rounded; }
    // Q 弹触发（§2.2.7）：landed ∧ 上一帧未贴地 ⇒ 一次落地至多一次
    if (res.landed && !flying.prevGrounded) {
      const depth = core.landingSquash(fallingVy);
      if (PHYSICS_DEBUG) physLog('phys-land impact=' + Math.round(Math.abs(fallingVy)) + ' depth=' + depth.toFixed(3));
      sendSquash(win, depth);
    }
    flying.prevGrounded = res.landed;
    // 飞行期动作档（DD-11）：|vx| ≥ PHYS_RUN_SPEED ⇒ run-*，否则 walk-*（不新增档位名；只在变化时下发，防 IPC 洪泛）
    const anim = (Math.abs(res.vx) >= core.PHYS_RUN_SPEED ? 'run-' : 'walk-') + (res.vx >= 0 ? 'right' : 'left');
    if (anim !== flying.animState) { flying.animState = anim; setPetState(anim); }
    if (PHYSICS_DEBUG && flying.steps % 16 === 0) {
      physLog('phys-tick n=' + flying.steps + ' pos=' + geometry.petPosText(rounded)
        + ' vel=(' + Math.round(res.vx) + ',' + Math.round(res.vy) + ')'
        + ' bounced=' + (res.bounced ? 1 : 0) + ' atRest=' + (res.atRest ? 1 : 0) + ' wrote=' + wrote);
    }
    if (res.atRest) stopFlight('atRest');
  } catch (err) {
    physLog('phys-error err=' + (err && err.message ? err.message : String(err)));
    stopFlight('error');
  }
}

/** Q 弹 IPC（§2.2.7）：一次落地至多一次；reduce-motion 由渲染层 CSS 分支处置（U-9）。 */
function sendSquash(win, depth) {
  try {
    win.webContents.send('pet:physics-squash', depth);
    if (PHYSICS_DEBUG) physLog('phys-squash depth=' + depth.toFixed(3));
  } catch { /* 渲染层不在场 ⇒ 最佳努力 */ }
}

// ---------------------------------------------------------------------------
// 停泊收口（§2.2.6：严格顺序——先停循环，再离散几何序列；clearInterval 先于停泊序列，AC7②）
// ---------------------------------------------------------------------------
/**
 * 停泊收口。步骤 1（恒执行）：clearInterval + flying = null + 清轨迹——先停循环，此后不可能再有 tick 写入。
 * timeout ⇒ 强制落地（步骤 1 之后、几何序列之前）：y = maxY + 速度归零 + 一次 setPosition（snap=1，不得停在半空）。
 * 步骤 2（几何离散序列：settle → calibrate → savePos → snapshot）只对 {atRest, timeout, toggle, error} 执行——
 *   toggle / error 承 §2.2.8「立即停泊收口」/ §2.2.10 行 7「停泊序列」（TC-24 落盘一次）；drag-preempt / display-change
 *   零写入（§2.2.10 行 5 / 6：几何写由抢占方或几何事件路径承担）；destroyed / quit 跳过步骤 2 与 3（窗口不在场）。
 * 步骤 3（窗口在场时）：复位飞行期动作档为 idle。步骤 4（恒执行，最佳努力）：phys-rest 诊断行。
 */
function stopFlight(reason) {
  if (!flying) return;
  const flight = flying;
  const flightMs = Math.round(performance.now() - flight.startAt);
  const win = getPetWindow && getPetWindow();
  const alive = !!(win && !win.isDestroyed());
  // 步骤 1：先停循环
  if (flight.timer) { clearInterval(flight.timer); flight.timer = null; }
  flying = null;
  stopTrailSampler();
  trail = [];
  // timeout 的强制落地（§2.2.6 本轮修正）：收到地面 + 速度归零 + 一次 setPosition（本次收口的第一次位置写入）
  let snap = 0;
  if (reason === 'timeout' && alive) {
    const [x] = win.getPosition();
    win.setPosition(Math.round(Math.min(Math.max(x, flight.bounds.minX), flight.bounds.maxX)), flight.bounds.maxY);
    snap = 1;
  }
  const dock = reason === 'atRest' || reason === 'timeout' || reason === 'toggle' || reason === 'error';
  if (alive && dock) {
    const settled = geometry.petSettlePos(win.getPosition());
    if (settled.kind !== 'none') geometry.petApplyPos(settled.pos, 'physics-rest'); // 至多一次位置写入
    geometry.petCalibrateSize(); // 唯一尺寸写入路径；窗口已静止（与散步段起点同前提）
    geometry.petSavePos();       // 离散停泊落盘，至多一次
    geometry.petGeomSnapshot('physics-rest'); // 取证行
  }
  if (alive) setPetState('idle'); // 步骤 3：复位飞行期动作档（destroyed / quit 跳过，§2.2.6）
  physLog('phys-rest pos=' + physPos(win) + ' reason=' + reason + ' snap=' + snap + ' flight=' + flightMs + ' steps=' + flight.steps);
}

// ---------------------------------------------------------------------------
// 显式停点（DD-14 三重覆盖：tick 首行守卫 + 本处显式停点；quit / destroyed 窗口不在场 ⇒ 只停循环 + 日志）
// ---------------------------------------------------------------------------
/** 开关切换（§2.2.8）：飞行中关闭 ⇒ 立即停泊收口（reason=toggle，不留飞行态）；打开 ⇒ 无动作。 */
function handlePhysicsToggle(enabled) {
  if (enabled !== false) return;
  stopTrailSampler(); // 拖动中关闭 ⇒ 采样器一并停（AC8④/TC-23 的零定时器面严格化；trail 留存无害——评估前置 G1 拒绝）
  if (flying) stopFlight('toggle');
}

/**
 * 显示器事件停点（E5 三事件；§2.2.2 交接⑥）：先停物理（零写入——display-change 不进停泊几何序列）
 *   ⇒ 几何事件路径做校正 / 校准 / 落盘。emitter = screen；注册次序 = 组合根在 whenReady 内、
 *   几何三条 screen.on 之前（E7；判据 = 日志 phys-stop reason=display-change 早于 geom tag=display）。
 */
function registerScreenStops(emitter) {
  const stop = () => {
    if (!flying) return;
    physLog('phys-stop reason=display-change pos=' + physPos(getPetWindow && getPetWindow())); // 取证行（交接⑥ / §2.2.10 行 6）
    stopFlight('display-change');
  };
  emitter.on('display-added', stop);
  emitter.on('display-removed', stop);
  emitter.on('display-metrics-changed', stop);
}

/** 退出停点（before-quit）：物理停（不落盘、无几何写）；窗口仍在场时步骤 3（动作复位）照常执行（对将死窗口的一次无害 IPC）；窗口不在场 ⇒ 只停循环 + 日志。 */
function quit() { if (flying) stopFlight('quit'); }

/** 状态访问器（shell-pet.js 的 doWander 守卫消费，交接④：飞行中散步不得启动）。 */
function isFlying() { return flying !== null; }

function physPos(win) {
  return (win && !win.isDestroyed()) ? geometry.petPosText(win.getPosition()) : 'n/a';
}

module.exports = { init, isFlying, handlePhysicsToggle, registerScreenStops, quit, stopFlight, handleTrailStart, handleTrailEnd, groundBounds: core.groundBounds };
