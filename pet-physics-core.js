'use strict';
/**
 * pet-physics-core.js — 桌宠甩抛物理纯函数核心 + 位移仲裁判定 + 地面口径（B20 / B26；设计档 docs/design/PET-MOVEMENT.md §2.2.3 / §2.2.4 / §2.2.5 / §2.2.12 / §2.2.13）。
 * 边界（设计档 §2.2.1）：零 electron / 零 fs / 零定时器 / 零 DOM ⇒ 可被 node 直接装载（NFR-20，桩测装载真实实现）；
 *   渲染层经 pet.html 的 <script src> 装载（window.PetPhysicsCore，挤压曲线单一来源，§2.2.7 / AC4④）。
 * 函数清单：trimTrail · gatePeakSpeed · isQuietPlacement · estimateReleaseVelocity · groundBounds · throwStep ·
 *   landingSquash · squashScale · decideOwnership · armGate · canTakeOff；常量表 = PHYSICS + 本仓新增节拍 / 门窗 / 地面常量。
 * 坐标语义：x / y = 窗口左上角 DIP（与冻结面同空间，§2.2.4）；速度 px/s。
 */

// ---------------------------------------------------------------------------
// 物理参数表（本批唯一权威处，设计档 §2.2.3；值 = 用户 2026-09-18 裁定 B + 样本照搬）
// ---------------------------------------------------------------------------
const PHYSICS = {
  /** 竖直重力加速度（px/s²）；0 合法（无重力 ⇒ 由 5 s 硬上界收口）。来源 = 样本 config.jsonc:91。 */
  gravity: 1400,
  /** 碰壁 / 触地恢复系数（0~1）。本仓调（用户 2026-09-18 裁定 B）；样本 = 0.78（差异登记 = 设计档 O-12）。
   *  待实机标定（到期条件 = 用户实机感受一次后的裁定轮）；可逆变 = 本表一处常量。 */
  restitution: 0.55,
  /** 接地水平速度衰减（/s）：vx *= max(0, 1 − f·dt)。来源 = 样本 config.jsonc:93。 */
  groundFriction: 2.5,
  /** true = 撞顶反弹；false = 顶部无边界（越界保持，仅重力回落）。来源 = 样本 config.jsonc:94。 */
  ceilingBounce: true,
  /** 总力度（×，> 0）：初速与软上限整体增益。**只放大飞行初速，不进起飞门判据**（§2.2.12 / O-11）。 */
  throwPower: 1.0,
};

// ---- 常量（出处 = 样本 physics.ts 逐值照搬，设计档 §2.2.3 常量表）----
/** 轨迹保留窗口（ms）：只留最近这一段做估算。 */
const TRAIL_KEEP_MS = 200;
/** 初速估算窗口（ms）。 */
const RELEASE_WINDOW_MS = 150;
/** 松手前停顿超过它 = 温柔放下（不可估）。 */
const RELEASE_STALE_MS = 150;
/** 窗口太短视为不可估算（ms）。 */
const MIN_SPAN_MS = 20;
/** 分段速度的最小 dt（ms）：过小 dt 会把抖动放大成虚假峰值，短段向前合并。 */
const SEG_MIN_DT_MS = 8;
/**
 * 起飞门阈值 T（px/s）——**本仓唯一阈值常量、仓内仅一处定义**（AC17 / TC-32 机检 = 定义命中数 == 1）。
 * 值逐字照搬样本 DEAD_ZONE_SPEED（= 500）。判据 = 门量 v ≥ T（**闭区间**）⇒ 起飞。
 * 可调单一常量 + **待实机标定**：标定路径 = 拖动期光标轨迹（日志）复算窗内峰值速度，
 * 取「正常放下」与「甩动」两簇分界；到期条件 = 用户实机感受一次（缓放不飞 / 中速不飞 / 快甩飞）后的裁定轮（U-10）。
 */
const TAKEOFF_MIN_SPEED = 500;
/** 甩出速度软上限（px/s）：cap·(1 − e^(−s/cap))（×throwPower，§2.2.3）。 */
const MAX_THROW_SPEED = 3600;
/** 初速大小 = 端点均值×(1−w) + 峰值×w。 */
const PEAK_WEIGHT = 0.5;
/** 参考加速度（px/s²）：末段加速达到它即吃满增益——**只作用于飞行初速，不进起飞门判据**（DD-16 / AC20）。 */
const ACCEL_REF = 8000;
/** 加速度增益上限：仍在加速的甩动最多放大 60%——**不进起飞门判据**（DD-16 / AC20）。 */
const ACCEL_GAIN_MAX = 0.6;
/** 单步最大 dt（s）：防卡顿巨帧跳变。 */
const MAX_STEP_DT = 0.05;
/** 落地时 |vy| 小于它直接停竖直（px/s）。 */
const REST_VY = 40;
/** 地面上 |vx| 小于它认为已静止（px/s）。 */
const REST_VX = 15;
/** 挤压下压幅度（基准值）。 */
const SQ_SQUASH = 0.55;
/** 落地最大下压幅度。 */
const SQ_MAX_SQUASH = 0.55;
/** 挤压时长（ms）。 */
const SQ_DURATION_MS = 220;
/** 落地冲击速度基准：低于此 = 轻落（按下限幅度）。 */
const SQ_SOFT_SPEED = 300;
/** 落地冲击速度上限：达到 / 超过此 = 重砸（吃满最大下压）。 */
const SQ_HARD_SPEED = 1500;

// ---- 本仓新增常量（设计档 §2.2.3「本仓新增」表）----
/** 飞行 tick 周期（ms；= 散步 tick 同频，不引入新节拍）。 */
const PHYS_POLL_MS = 16;
/** 拖动期光标采样周期（ms；仅拖动中运行）。 */
const PHYS_TRAIL_MS = 16;
/** 飞行硬上界（ms）：超时 ⇒ 强制落地收口（y = maxY + 速度归零 → 停泊序列；不得停在半空）。 */
const PHYS_MAX_FLIGHT_MS = 5000;
/** 飞行期动作档分界（px/s）：|vx| ≥ 该值 ⇒ run-*，否则 walk-*（不新增档位名）。 */
const PHYS_RUN_SPEED = 900;
/** 起飞门窗（ms）——**峰值窗与静默窗同窗**；可调、待实机标定。 */
const GATE_WINDOW_MS = 120;
/** 静默判据（px）：窗内端点位移 ≤ 该值 = 「位移接近 0」⇒ 判放置（quiet-dwell）；
 *  与既有「位移 > 5px 判为拖动」口径同源（pet.js:121）。 */
const QUIET_SPAN_MAX_DIP = 5;
/** 渲染层可见身体锚点内缩（DIP）= 窗高 270 − PET_FEET_Y(244)，与 #pet{bottom:26px} 同源（§2.1 J 组 / DD-17；B26）。 */
const FEET_ANCHOR_INSET_DIP = 26;
/** alpha 残差补偿（DIP）：实测视频 ≈4.2 / PNG 动画帧 ≈3.6 取较大者（O-13）；回正路径 = 本常量改 0（U-7；B26）。 */
const FEET_ALPHA_MARGIN_DIP = 4;
/** 地面增量唯一消费值（DIP）= 锚点 + 残差；groundBounds 与散步 y 归位上界同取（§2.2.13 / AC21①；B26）。 */
const FEET_INSET_DIP = FEET_ANCHOR_INSET_DIP + FEET_ALPHA_MARGIN_DIP;

// ---------------------------------------------------------------------------
// 轨迹（trail）纯函数（设计档 §2.2.5）
// ---------------------------------------------------------------------------
/** 剔除超过保留窗口的旧采样（顺带排序去重，调用前采样按时间追加即可）。 */
function trimTrail(trail, now) {
  const cutoff = now - TRAIL_KEEP_MS;
  let i = 0;
  while (i < trail.length && trail[i].t < cutoff) i += 1;
  return i === 0 ? trail : trail.slice(i);
}

/** 软钳速：cap·(1 − e^(−s/cap))——任意力度下单调可区分、渐近不超过 cap。 */
function softClampSpeed(speed) {
  if (speed <= 0) return 0;
  return MAX_THROW_SPEED * (1 - Math.exp(-speed / MAX_THROW_SPEED));
}

/** 门内样本集：末样本年龄 ≤ GATE_WINDOW_MS 的样本（静默窗 = 峰值窗，§2.2.12）。 */
function gateWindow(trail, now) {
  return trail.filter((s) => now - s.t <= GATE_WINDOW_MS);
}

/** 分段速度（过密采样向前合并，dt 下限 SEG_MIN_DT_MS；与样本同口径）。 */
function segmentSpeeds(win) {
  const out = [];
  if (win.length < 2) return out;
  let px = win[0].x;
  let py = win[0].y;
  let pt = win[0].t;
  for (const s of win.slice(1)) {
    const dt = s.t - pt;
    if (dt >= SEG_MIN_DT_MS) {
      out.push({ speed: (Math.hypot(s.x - px, s.y - py) / dt) * 1000, tEnd: s.t });
      px = s.x;
      py = s.y;
      pt = s.t;
    }
  }
  return out;
}

/**
 * 门量 v（px/s，标量）= 松手前 GATE_WINDOW_MS（120 ms）窗内的**峰值分段速度**（§2.2.12 / DD-16）。
 * 分段合并口径 = SEG_MIN_DT_MS；窗内样本 < 2 ⇒ 0（不可估面由 armGate G7 先行拒绝）。
 * **不是** estimateReleaseVelocity 的幅值（那是飞行初速）——门量回答「扔没扔」，初速回答「扔多远」。
 */
function gatePeakSpeed(trail, now) {
  const win = gateWindow(trail, now);
  if (win.length < 2) return 0;
  const segs = segmentSpeeds(win);
  if (!segs.length) return 0;
  return segs.reduce((m, s) => Math.max(m, s.speed), 0);
}

/**
 * 静默放置规则（G11 / §2.2.12）：同一 GATE_WINDOW_MS 窗内**端点位移** ≤ QUIET_SPAN_MAX_DIP ⇒ 判放置
 * （「挪到位 → 停一下 → 松手」）——单看速度会把这一常见动作误判为甩。
 */
function isQuietPlacement(trail, now) {
  const win = gateWindow(trail, now);
  if (win.length < 2) return true; // 窗内样本不足 ⇒ 无位移可言 ⇒ 静默（随 G7 一同拒绝）
  const [f, l] = [win[0], win[win.length - 1]];
  return Math.hypot(l.x - f.x, l.y - f.y) <= QUIET_SPAN_MAX_DIP;
}

/** 起飞阈值判定（G10 / §2.2.12）：门量 v ≥ T ⇒ 起飞（**闭区间**：恰等于 T ⇒ 起飞）。 */
function canTakeOff(v) {
  return v >= TAKEOFF_MIN_SPEED;
}

/**
 * 由拖拽轨迹估算松手初速 { vx, vy }（px/s；**只决定飞行初速、不进起飞门判据**，§2.2.5 第 3 / 6 条）。
 * 方向：窗口首末端点位移方向（抗抖）。大小：端点平均与峰值按 PEAK_WEIGHT 加权，
 * 末段仍在加速时按 ACCEL_REF 比例增益（最多 ACCEL_GAIN_MAX），软钳速封顶，最后整体 ×throwPower。
 * null 分支 = **四类**（AC3）：空轨迹 / 末样本过期（> RELEASE_STALE_MS）/ 窗口太短（span < MIN_SPAN_MS）/
 * 纯抖动（窗口内位移 ≈0）——**低速不再判 null**（由起飞门 G10 拒绝，§2.2.12 与样本差异①）。
 */
function estimateReleaseVelocity(trail, now, physics) {
  const p = physics || PHYSICS;
  if (trail.length === 0) return null;
  const last = trail[trail.length - 1];
  if (now - last.t > RELEASE_STALE_MS) return null;
  const win = trail.filter((s) => now - s.t <= RELEASE_WINDOW_MS);
  if (win.length < 2) return null;
  const t0 = win[0].t;
  const x0 = win[0].x;
  const y0 = win[0].y;
  const t1 = win[win.length - 1].t;
  const x1 = win[win.length - 1].x;
  const y1 = win[win.length - 1].y;
  const spanMs = t1 - t0;
  if (spanMs < MIN_SPAN_MS) return null;
  const baseVx = ((x1 - x0) / spanMs) * 1000;
  const baseVy = ((y1 - y0) / spanMs) * 1000;
  const baseSpeed = Math.hypot(baseVx, baseVy);
  if (baseSpeed < 1e-6) return null; // 窗口内几乎纯抖动：没有可靠方向
  const segs = segmentSpeeds(win);
  const peakSpeed = segs.length ? segs.reduce((m, s) => Math.max(m, s.speed), 0) : baseSpeed;
  // 末段加速度：末段峰值速度相对首段的斜率（仍在加速的甩动放大**初速**，不进门判据，AC20）
  let accel = 0;
  if (segs.length >= 2) {
    const lastSeg = segs[segs.length - 1];
    const firstSeg = segs[0];
    accel = (lastSeg.speed - firstSeg.speed) / Math.max((lastSeg.tEnd - firstSeg.tEnd) / 1000, MIN_SPAN_MS / 1000);
  }
  const speedBeforeClamp =
    ((1 - PEAK_WEIGHT) * baseSpeed + PEAK_WEIGHT * peakSpeed)
    * (1 + Math.min(Math.max(accel, 0) / ACCEL_REF, 1) * ACCEL_GAIN_MAX);
  const speed = softClampSpeed(speedBeforeClamp) * p.throwPower;
  return { vx: (baseVx / baseSpeed) * speed, vy: (baseVy / baseSpeed) * speed };
}

/** 地面口径（B26 / §2.2.13）：物理地面 = 可见身体底沿 ⇒ 只抬 maxY（+FEET_INSET_DIP，minX/maxX/minY 逐字不变，返回新对象不改入参）；bounds == null ⇒ null（与 G8 no-bounds 同源）；消费点 = 飞行 bounds 与散步 y 归位。 */
function groundBounds(bounds) {
  if (bounds == null) return null;
  return { ...bounds, maxY: bounds.maxY + FEET_INSET_DIP };
}

// ---------------------------------------------------------------------------
// 抛体步进（设计档 §2.2.4；与样本 throwStep 同语义 + 新增 landed 标志）
// ---------------------------------------------------------------------------
/**
 * 抛体单步积分 + 边界反弹（semi-implicit：先 vy += g·dt 再位移；dt 夹到 [0, MAX_STEP_DT]）。
 * 边界 = 起飞时算一次、全程恒定（{minX, minY, maxX, maxY}，窗口矩形口径）。
 * 返回更新后的状态与标志：bounced = 本步是否碰边 / 触地 / 撞顶；landed = 本步**触地**（Q 弹触发面，
 * 与样本用 y ≥ maxY−1 反推不同——本仓显式化，§2.2.4 唯一差异）；atRest = 贴地低速（或碰边后整体低速）。
 * ceilingBounce = false ⇒ 顶部无边界：不夹不弹（越界保持，仅重力回落）。
 */
function throwStep(s, dtRaw, b, physics) {
  const p = physics || PHYSICS;
  const dt = Math.min(Math.max(dtRaw, 0), MAX_STEP_DT);
  let { x, y, vx, vy } = s;
  vy += p.gravity * dt;
  x += vx * dt;
  y += vy * dt;
  let bounced = false;
  let landed = false;
  if (x < b.minX) {
    x = b.minX;
    vx = Math.abs(vx) * p.restitution;
    bounced = true;
  } else if (x > b.maxX) {
    x = b.maxX;
    vx = -Math.abs(vx) * p.restitution;
    bounced = true;
  }
  if (y < b.minY) {
    if (p.ceilingBounce) {
      y = b.minY;
      vy = Math.abs(vy) * p.restitution;
      bounced = true;
    }
  } else if (y >= b.maxY) {
    y = b.maxY;
    vx *= Math.max(0, 1 - p.groundFriction * dt);
    if (Math.abs(vy) < REST_VY) vy = 0;
    else vy = -Math.abs(vy) * p.restitution;
    bounced = true;
    landed = true;
  }
  const speed = Math.hypot(vx, vy);
  const atRest =
    (y >= b.maxY - 1 && Math.abs(vy) < 1 && Math.abs(vx) < REST_VX)
    || (bounced && speed < REST_VY && Math.abs(vy) < 1);
  return { x, y, vx, vy, bounced, landed, atRest };
}

// ---------------------------------------------------------------------------
// Q 弹挤压曲线（设计档 §2.2.7；样本逐字同语义——本档 = 唯一处定义，渲染层按名引用）
// ---------------------------------------------------------------------------
/** 落地冲击速度 → 下压幅度 scaleY 值（速度越大压得越狠；轻落下限 0.8）。 */
function landingSquash(impactSpeed) {
  const t = Math.min(Math.max((Math.abs(impactSpeed) - SQ_SOFT_SPEED) / (SQ_HARD_SPEED - SQ_SOFT_SPEED), 0), 1);
  return Math.min(0.8, 1 - t * (1 - SQ_MAX_SQUASH));
}

/**
 * Q 弹挤压曲线：u∈[0,1] 进度 → scaleY。下压段（0~0.45）ease-in 压缩；
 * 回弹段（0.45~1）easeOutBack 带回弹过冲（上界 1.12）。
 */
function squashScale(u, squash) {
  const sq = squash === undefined ? SQ_SQUASH : squash;
  if (u < 0.45) {
    const p = u / 0.45;
    return 1 - (1 - sq) * p * p;
  }
  const p = (u - 0.45) / 0.55;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const f = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  return Math.min(1.12, sq + (1 - sq) * Math.max(f, 0));
}

// ---------------------------------------------------------------------------
// 位移仲裁判定（设计档 §2.2.2；纯函数）
// ---------------------------------------------------------------------------
/** 单写者令牌派生：dragActive > physicsFlying > wanderInFlight > null（W1 拖拽不进状态机，只读派生）。 */
function decideOwnership(o) {
  if (o.dragActive) return 'drag';
  if (o.physicsFlying) return 'physics';
  if (o.wanderInFlight) return 'wander';
  return null;
}

/**
 * 起飞门（armGate，11 条，§2.2.2 / AC6）：逐条评估，任一不过 ⇒ { ok: false, gate: 'G<n>', reason }（零写入）。
 * gates = G1 开关 / G2 窗口在场 / G3 会话幂等 / G4 无拖动 / G5 无散步段 / G6 reason 合法 /
 *   G7 轨迹可估（四类细分）/ G8 边界可取 / G9 无飞行 / G10 起飞阈值 / G11 非静默放置。
 * 全通过 ⇒ { ok: true, vel, gatePeak }（vel = 飞行初速；gatePeak = 门量，诊断用）。
 * **门判据在未增益的原始速度上比较（throwPower 不进门，§2.2.12 / O-11）。**
 */
function armGate(input) {
  if (input.enabled !== true) return { ok: false, gate: 'G1', reason: 'toggle-off' };
  if (!input.windowAlive) return { ok: false, gate: 'G2', reason: 'destroyed' };
  if (input.sessionSeq === input.lastEvaluatedSeq) return { ok: false, gate: 'G3', reason: 'duplicate' };
  if (input.dragActive) return { ok: false, gate: 'G4', reason: 'drag-active' };
  if (input.wanderInFlight) return { ok: false, gate: 'G5', reason: 'wander-busy' };
  if (!input.reasonOk) return { ok: false, gate: 'G6', reason: 'bad-reason' };
  const vel = estimateReleaseVelocity(input.trail, input.now, input.physics);
  if (vel === null) return { ok: false, gate: 'G7', reason: estimateReleaseFailReason(input.trail, input.now) };
  if (!input.bounds) return { ok: false, gate: 'G8', reason: 'no-bounds' };
  if (input.flying) return { ok: false, gate: 'G9', reason: 'already-flying' };
  // 静默支（G11）先于阈值支（G10）评估：§2.2.12「**一律**判放置」——静默窗内手没在动（位移 ≤ 5px，含窗空）
  //   时无论速度如何都判放置，使 TC-35（静默）/ TC-36（缓放）两支可区分（AC19）；两支各自可独立置假（AC6）
  if (isQuietPlacement(input.trail, input.now)) return { ok: false, gate: 'G11', reason: 'quiet-dwell' };
  const v = gatePeakSpeed(input.trail, input.now);
  if (!canTakeOff(v)) return { ok: false, gate: 'G10', reason: 'below-threshold' };
  return { ok: true, vel, gatePeak: v };
}

/** G7 的细分 reason：空轨迹 no-trail / 末样本过期 stale / 窗口太短 too-short / 纯抖动 jitter。 */
function estimateReleaseFailReason(trail, now) {
  if (trail.length === 0) return 'no-trail';
  const last = trail[trail.length - 1];
  if (now - last.t > RELEASE_STALE_MS) return 'stale';
  const win = trail.filter((s) => now - s.t <= RELEASE_WINDOW_MS);
  if (win.length < 2) return 'too-short';
  const spanMs = win[win.length - 1].t - win[0].t;
  if (spanMs < MIN_SPAN_MS) return 'too-short';
  return 'jitter';
}

const PetPhysicsCore = {
  PHYSICS,
  TRAIL_KEEP_MS, RELEASE_WINDOW_MS, RELEASE_STALE_MS, MIN_SPAN_MS, SEG_MIN_DT_MS, TAKEOFF_MIN_SPEED,
  MAX_THROW_SPEED, PEAK_WEIGHT, ACCEL_REF, ACCEL_GAIN_MAX, MAX_STEP_DT, REST_VY, REST_VX,
  SQ_SQUASH, SQ_MAX_SQUASH, SQ_DURATION_MS, SQ_SOFT_SPEED, SQ_HARD_SPEED,
  PHYS_POLL_MS, PHYS_TRAIL_MS, PHYS_MAX_FLIGHT_MS, PHYS_RUN_SPEED, GATE_WINDOW_MS, QUIET_SPAN_MAX_DIP,
  FEET_ANCHOR_INSET_DIP, FEET_ALPHA_MARGIN_DIP, FEET_INSET_DIP,
  trimTrail, gatePeakSpeed, isQuietPlacement, canTakeOff, estimateReleaseVelocity, groundBounds, throwStep,
  landingSquash, squashScale, decideOwnership, armGate,
};

// 双环境导出尾巴：node（桩测 / 主进程 require）与浏览器（<script> 全局）同源装载（口径同 pet-chain-core.js）。
if (typeof module !== 'undefined' && module.exports) module.exports = PetPhysicsCore;
if (typeof window !== 'undefined') window.PetPhysicsCore = PetPhysicsCore;
