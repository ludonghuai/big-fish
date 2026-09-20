'use strict';
/**
 * shell-pet-drag.js — 拖动跟随 + 拖动 / 穿透 IPC 处理器函数（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6 注 S2）。
 * 函数清单（注 S2）：常量 PET_DRAG_* · petDragLog · petStopDrag · petDragTick · 状态 petDrag（经 getPetDrag() 暴露）·
 * 处理器 handlePetDragStart / handlePetDragHeartbeat / handlePetDragEnd / handlePetSetIgnoreMouse。
 */

const { app, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const geometry = require('./shell-pet-geometry.js');

// 注入面（组合根 main.js 接线）：getPetWindow（pet）+ pet 状态访问面（§2.2.6 注 S2）+ petWouldArmFlight（物理起飞预判，T60）
let getPetWindow = null;
let pet = null;
let petWouldArmFlight = null;
function init(deps) {
  getPetWindow = deps.getPetWindow;
  pet = deps.pet;
  // T60：物理域零副作用读面（shell-pet-physics.petWouldArmFlight）；未接线 ⇒ 恒 false（= 旧行为：彩蛋优先）
  petWouldArmFlight = typeof deps.petWouldArmFlight === 'function' ? deps.petWouldArmFlight : () => false;
}

// ---------------------------------------------------------------------------
// Pet drag-follow — 主进程按全局光标绝对定位驱动窗口（设计档 docs/design/PET-DRAG.md §2.2）
//   拖动开始时记抓取偏移 grabOffset = 光标 − 窗口位置（**全程恒定**：跨屏不重锚，§2.3.3 / DD-23）；
//   随后每 PET_DRAG_TICK_MS 读一次全局光标，按「光标 − grabOffset」推导目标位置，同目标去重后才写入（不做工作区钳制）。
// ---------------------------------------------------------------------------
const PET_DRAG_TICK_MS = 8;            // 标称跟随周期 ≈125Hz（JS 定时器粒度只会 ≥8ms，允许 +2ms 偏差）
const PET_DRAG_STALE_MS = 1800;        // 心跳失联阈值（NFR-2 的 2s 上限内留 200ms 余量）
const PET_DRAG_PROBE_MS = 250;         // drag-end 后的静态探针延迟（> NFR-2 的 200ms 上限）
const PET_DRAG_LOG_SAMPLE_TICKS = 16;  // 诊断日志采样频率：每 16 tick（≈128ms）一行
const PET_DRAG_DEBUG = process.env.BIGFISH_PET_DEBUG === '1'; // 日志开关，默认关闭且关闭时零开销

/** 追加一行拖拽诊断日志（尽力而为，先例：exchange.log）。 */
function petDragLog(text) {
  try {
    const file = path.join(app.getPath('userData'), 'pet-drag.log');
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${text}\n`);
  } catch { /* best effort */ }
}

/**
 * 拖动跟随状态（null = 未在拖动）。
 * 设置点：pet-drag-start（先停旧再建新，幂等）；清空点：petStopDrag（唯一出口，全路径覆盖）。
 * tick = 本次拖动的 tick 计数（仅用于日志采样节流，服务设计档 §3.3 的 16-tick 采样）。
 */
let petDrag = null;

/** 终止拖动跟随（唯一清空点）：停循环 → 最终位置同步 + 尺寸回拉 → 日志/探针 → 兜底通知渲染层。 */
function petStopDrag(reason) {
  if (!petDrag) return;
  const drag = petDrag;
  petDrag = null;
  clearInterval(drag.timer);
  const alive = !!getPetWindow() && !getPetWindow().isDestroyed();
  if (alive) {
    // 最终位置同步 + 尺寸回拉（AC8 的取证点＝拖动结束时刻的尺寸）
    const cursor = screen.getCursorScreenPoint();
    const target = [Math.round(cursor.x - drag.grabOffset.x), Math.round(cursor.y - drag.grabOffset.y)];
    if (target[0] !== drag.lastApplied[0] || target[1] !== drag.lastApplied[1]) {
      getPetWindow().setPosition(target[0], target[1]);
      drag.lastApplied = target;
    }
    geometry.petCalibrateSize(); // 终止即校准（§2.3.2 松手行注：与松手路径那一次不重复写——锚点已刷 ⇒ 落在容差内）
  }
  if (PET_DRAG_DEBUG) {
    petDragLog(alive
      ? `drag-end reason=${reason} pos=${geometry.petPosText(getPetWindow().getPosition())} size=${geometry.petPosText(getPetWindow().getSize())}`
      : `drag-end reason=${reason} pos=n/a size=n/a note=window-destroyed probe=skipped`);
    // 静态探针：drag-end 后 250ms（> NFR-2 的 200ms 上限）再采一次，使 AC3 可伪证
    if (alive && reason !== 'destroyed') {
      setTimeout(() => {
        if (!getPetWindow() || getPetWindow().isDestroyed()) return;
        petDragLog(`probe pos=${geometry.petPosText(getPetWindow().getPosition())} size=${geometry.petPosText(getPetWindow().getSize())}`);
      }, PET_DRAG_PROBE_MS);
    }
  }
  // 兜底终止（看门狗）时通知渲染层清拖动标志
  if (reason === 'stale' && alive) getPetWindow().webContents.send('pet-drag-cancel');
}

/**
 * 跟随循环的一个 tick：看门狗 → 读全局光标 → 显示器切换检测（US-12） → 推导目标
 *   → 同目标去重写入 → 跨屏尺寸标记（标称矩形完全进入新屏的首个 tick 校准一次）→ 采样日志。
 *   切换检测**不重锚抓取偏移**（`grabOffset` 全程恒定，§2.3.3 / DD-23）；热路径无新增 API 调用：
 *   切换检测与标记的消费判据均为纯算术比较。
 */
function petDragTick() {
  if (!petDrag) return;
  if (!getPetWindow() || getPetWindow().isDestroyed()) { petStopDrag('destroyed'); return; }
  const drag = petDrag;
  if (Date.now() - drag.lastMessageAt > PET_DRAG_STALE_MS) { petStopDrag('stale'); return; }
  const cursor = screen.getCursorScreenPoint();
  // 显示器切换检测（§2.3.3）：判定 = 「缓存失效 ∨ 光标越出缓存矩形 ⇒ 取屏一次」——
  //   缓存失效（displayBounds 为 null，来自拖动起点或拖动中收到的 E5 事件）必须在此消费；
  //   同屏内该判定只是一次纯算术矩形包含比较（零 API 调用，不触碰 NFR-1 开销判据）。
  if (!drag.displayBounds || !geometry.petPointInRect(cursor, drag.displayBounds)) {
    const next = geometry.petDisplayOf([cursor.x, cursor.y]);
    drag.displayBounds = next ? next.bounds : null;
    if (next && next.id !== drag.displayId) {
      // 切换检测（身份比较，§2.3.3）：**不重锚抓取偏移**（第 12 轮删除，DD-23）——位置 API 的坐标空间
      //   与所在屏 scaleFactor 无关且可逆（§2.2 R6）⇒ 跨屏无需换参考系；原重锚公式
      //   `grabOffset ← 光标 − getPosition()` 会把「光标自上一 tick 起的位移」吃进抓取偏移（R7）
      //   ⇒ 每跨一次屏偏一次、往返不可逆（= 用户报告症状）。
      const fromId = drag.displayId;
      drag.displayId = next.id;
      if (geometry.PET_GEOM_DEBUG) {
        geometry.petGeomLog(
          `geom-switch from=${fromId} display=${next.id} scale=${next.scaleFactor}`
          + ` size=${geometry.petPosText(getPetWindow().getSize())} pos=${geometry.petPosText(getPetWindow().getPosition())}`,
        );
      }
      // 跨屏的尺寸标记（§2.3.3 简化一 / §2.3.5-B2）：**无条件**置标记——不再比较 `scaleFactor`
      //   （原「上一 tick 所在屏 scaleFactor」字段与其刷新已删）：同 `scaleFactor` 的跨屏由校准第 ③ 步
      //   的容差自锁吸收（R1 的比值 = 1 ⇒ 读回不漂移 ⇒ 零写入零日志）；光标折返时按当前切换结果重算。
      drag.pendingSizeAnchor = { bounds: next.bounds };
    }
    // 同 id / 取屏失败（next 为 null）：§2.3.3「相同 ⇒ 仅刷新缓存」——缓存即上面的 displayBounds
  }
  const target = [Math.round(cursor.x - drag.grabOffset.x), Math.round(cursor.y - drag.grabOffset.y)];
  let wrote = 0;
  if (target[0] !== drag.lastApplied[0] || target[1] !== drag.lastApplied[1]) {  // 同目标去重
    getPetWindow().setPosition(target[0], target[1]);
    drag.lastApplied = target;
    wrote = 1;
  }
  // 跨屏尺寸标记的消费判据（2026-09-16 修正；原判据 = §2.3.3 简化二 / §2.1 F5 ② 的「窗口中心点
  //   进入新屏的首个 tick」）：每 tick 用**纯算术**判「**标称矩形完全进入新屏 `bounds`**」
  //   （petRectInside = 四角 ⊆，与 petStraddleFix 共用同一 helper），成立的**首个** tick 校准一次并清标记。
  //   改判据的理由（实机报告：位置处于屏交界临界点时持续抖动且位置偏移）：中心点进入时窗口仍骑线，
  //   混合 DPI 下 Windows 在骑线点附近持续按多数屏重整尺寸 ⇒ 校准第 ③ 步的容差短路失效 ⇒
  //   光标每次晃过交界都重新武装标记并被立即消费 = 一次真实 setBounds（= 抖动源）；且尺寸写入会
  //   静默改位置（§2.3.5-F-1 已登记：Δy 突变全部落在尺寸写入行；F16：拖动循环按写入意图去重、
  //   被改动的位置不会自愈）——骑线（临界）期改为**零写入**，窗口完全进入新屏才校准；停在骑线处
  //   松手由松手路径兜底（§2.3.7 推离 + 调用点⑦校准），功能无缺口。
  //   判据仍读本 tick 已推导的 target（写入之后调用，使校准读到的即目标位置）；无 getSize /
  //   无取屏调用——每跨屏事件至多一次尺寸写入、同屏内全程零次（写入纪律不变）。
  if (drag.pendingSizeAnchor && geometry.petRectInside(target, drag.pendingSizeAnchor.bounds)) {
    drag.pendingSizeAnchor = null;
    geometry.petCalibrateSize();
  }
  drag.tick++;
  if (PET_DRAG_DEBUG && drag.tick % PET_DRAG_LOG_SAMPLE_TICKS === 0) {
    const applied = getPetWindow().getPosition();
    const delta = [target[0] - applied[0], target[1] - applied[1]];
    const off = [Math.round(cursor.x - (applied[0] + drag.grabOffset.x)), Math.round(cursor.y - (applied[1] + drag.grabOffset.y))];
    petDragLog(`tick cursor=${geometry.petPosText([cursor.x, cursor.y])} target=${geometry.petPosText(target)} applied=${geometry.petPosText(applied)} delta=${geometry.petPosText(delta)} off=${geometry.petPosText(off)} wrote=${wrote} size=${geometry.petPosText(getPetWindow().getSize())}`);
  }
}

function handlePetDragStart() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) return;
  // 用户开始拖动：立即停掉走动动画，避免瞬移
  if (pet.getMoveTimer()) { clearInterval(pet.getMoveTimer()); pet.setMoveTimer(null); }
  if (pet.getPetState() === 'walk-left' || pet.getPetState() === 'walk-right' || pet.getPetState() === 'run-left' || pet.getPetState() === 'run-right') pet.setPetState('idle');
  // 清除待发的散步（根因 D：原实现在此处调 pet.scheduleWander()，拖动中会被自主走动抢占窗口）
  clearTimeout(pet.getWanderTimer());
  pet.setWanderTimer(null);
  if (petDrag) { clearInterval(petDrag.timer); petDrag = null; } // 幂等：先停旧再建新
  const cursor = screen.getCursorScreenPoint();
  const pos = getPetWindow().getPosition();
  petDrag = {
    grabOffset: { x: cursor.x - pos[0], y: cursor.y - pos[1] },
    timer: setInterval(petDragTick, PET_DRAG_TICK_MS),
    lastApplied: [pos[0], pos[1]],
    tick: 0,
    lastMessageAt: Date.now(),
    displayBounds: null,       // 上一 tick 所在屏的 DIP 矩形（切换检测用，零 API 调用）
    displayId: null,           // 上一 tick 所在屏 id（唯一职责 = 切换检测的身份比较，§2.3.3）
    pendingSizeAnchor: null,   // 跨屏尺寸标记 { bounds }：标称矩形完全进入新屏的首个 tick 校准一次（2026-09-16 修正；原 = 中心点进入）
  };
  geometry.petSyncDragDisplayCache(cursor); // 拖动起点刷新缓存（§2.3.3）
  if (PET_DRAG_DEBUG) petDragLog(`drag-start grabOffset=${geometry.petPosText([petDrag.grabOffset.x, petDrag.grabOffset.y])} pos=${geometry.petPosText(pos)}`);
}

function handlePetDragHeartbeat() {
  // 心跳由渲染层定时器驱动：事件驱动的心跳会在长按不动时静默 → 被看门狗误判失联
  if (petDrag) petDrag.lastMessageAt = Date.now();
}

function handlePetDragEnd(_e, reason) {
  // reason 由渲染层给出（pointerup / pointercancel / lostcapture）；缺省按 pointerup
  petStopDrag(/^(pointerup|pointercancel|lostcapture)$/.test(reason) ? reason : 'pointerup');
  if (!getPetWindow() || getPetWindow().isDestroyed()) return;
  // 松手落点解析（US-10 + 骑线处置 §2.3.7）：唯一调用点 = 此处（petStopDrag 返回之后）——
  //   stale / destroyed 不校正不落盘（§2.3.2 注）；reason 已归一化，无需白名单过滤。
  //   两条校正规则由 petSettlePos 合并为**一次**位置写入（kind='visible' ⇒ drop；kind='straddle' ⇒ straddle）。
  const dropPos = getPetWindow().getPosition();
  const settled = geometry.petSettlePos(dropPos);
  const wasCorrected = settled.kind !== 'none';
  if (wasCorrected) geometry.petApplyPos(settled.pos, settled.kind === 'straddle' ? 'straddle' : 'drop');
  geometry.petCalibrateSize(); // 松手收口（§2.3.5-C 调用点⑦）：覆盖「停在骑线后松手」
  geometry.petSavePos();
  // 校正与挣脱必须离散（§2.3.6 / DD-14）：校正把窗口钳到边缘 ⇒ 若照常判贴墙则每次校正必误触发；
  //   骑线推离同规则豁免（推离落点正是某屏 bounds 缘，§2.3.7）。
  if (wasCorrected) {
    // 本次发生位置校正 ⇒ 豁免贴墙判定、不发 wall 行
    //   （AC1 判据 = geom-fix reason ∈ {drop, straddle} 在场 + wall 缺席）
    pet.scheduleWander();
  } else {
    // 脱手：如果鲸鱼娘被拖到**整个桌面**的外缘，她会挣脱并往反方向跑
    //   （基准 = 全部显示器 bounds 的并集，§2.1 E 组 E1；不是所在屏工作区——两者用途不同）
    const bounds = geometry.petDesktopBounds();
    const [x] = getPetWindow().getPosition();
    const escaped = !!bounds && (x <= bounds.minX + geometry.PET_WALL_EPS || x >= bounds.maxX - geometry.PET_WALL_EPS);
    if (geometry.PET_GEOM_DEBUG) {
      geometry.petGeomLog(`wall x=${x} minX=${bounds ? bounds.minX : 'n/a'} maxX=${bounds ? bounds.maxX : 'n/a'} escaped=${escaped ? 1 : 0}`);
    }
    // 甩抛放行（T60，2026-09-20 用户裁定）：物理开 ∧ 本把是甩抛（物理自己的起飞门判 ok）⇒ 彩蛋不劫持，
    //   本把交给物理接管飞行（物理在同一事件上的评估经 setImmediate 晚到，正好接上）；慢放 ⇒ 彩蛋照触发（US-7 不回退）
    if (escaped && !petWouldArmFlight()) {
      pet.setWanderDir(x <= bounds.minX + geometry.PET_WALL_EPS ? 'right' : 'left');
      pet.setBounceLeft(2);
      pet.setForceRun(true);
      pet.petSay('哇！被你拖到墙角啦，我跑！');
      pet.setPetState('idle');
      pet.doWander();
    } else {
      pet.scheduleWander();
    }
  }
  geometry.petGeomSnapshot('drag-end'); // AC2 / AC8（B01）取证点：落点解析与尺寸校准**全部完成之后**（§2.3.2 注）
}

function handlePetSetIgnoreMouse(_e, ignore) {
  // 点击穿透只在 Windows 上可靠；Linux 上一旦开启整条鱼都点不到
  if (process.platform !== 'win32') return;
  // 拖动期间拒绝「开启穿透」：穿透会切断事件流（根因 A 的主进程侧防守，设计档 §2.2.7）
  if (ignore && petDrag) return;
  if (getPetWindow() && !getPetWindow().isDestroyed()) {
    getPetWindow().setIgnoreMouseEvents(ignore, { forward: true });
  }
}

/** 拖动状态访问器（null = 未在拖动；跨模块读面）。 */
function getPetDrag() { return petDrag; }

module.exports = {
  petStopDrag,
  getPetDrag,
  handlePetDragStart,
  handlePetDragHeartbeat,
  handlePetDragEnd,
  handlePetSetIgnoreMouse,
  init,
};
