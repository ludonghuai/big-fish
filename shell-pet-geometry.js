'use strict';
/**
 * shell-pet-geometry.js — 桌宠几何 helper 组 + 日志 / 尺寸校准（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6 注 S4）。
 * 函数清单（注 S4）：petGeomLog … petSettlePos / handleDisplayChange / petGeomSnapshot / petSavePos / petPosText / petCalibrateSize。
 */

const { app, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const settings = require('./shell-settings.js');

// 注入面（组合根 main.js 接线）：getPetWindow（pet）/ getPetDrag（drag）——注 S4：无新注入项
let getPetWindow = null;
let getPetDrag = null;
function init(deps) { getPetWindow = deps.getPetWindow; getPetDrag = deps.getPetDrag; }

// ---------------------------------------------------------------------------
// Desktop pet — transparent floating window（鲸鱼娘）
// ---------------------------------------------------------------------------
// Pet geometry — 多屏几何与可见性（设计档 docs/design/PET-MULTIMONITOR.md §2.3.1）
//   全部几何判定收敛为下列 helper（单一来源，NFR-8）；取屏唯一入口 = petDisplayOf()，
//   其余调用点不得内联第二份实现。坐标口径 = DIP（证据 E1/E2）；窗口自身位置与尺寸的
//   坐标空间在上游未声明（证据 E6）——本组「仅在 DIP 假设成立时自洽」（设计档 §2.2）。
//   统一短路口径：返回 null 不等于「位置为零」，调用方拿到 null 必须跳过写入。
//   尺寸策略（§2.3.5）：petCalibrateSize() 是**唯一尺寸写入路径**（锚点 + 容差 + 不可判定门，DD-20）；
//   尺寸**写入** = setBounds（**尺寸专用形态**：不提供 x / y，第 13 轮改写，DD-25 / E8）· **读回** = getSize()（DD-21 / §2.2 Q7）；
//   **位置保护** = 写入前后各读一次位置、差异 > 1 DIP 才条件回写（§2.3.5-F）。
// ---------------------------------------------------------------------------
const PET_SIZE_DIP = { w: 250, h: 270 };  // 窗口逻辑尺寸（DIP），跨屏不变（US-11）；与建窗 / pet.html 同源
const PET_DEFAULT_MARGIN_DIP = 24;        // petDefaultPos() 的右下角边距（设计档 DD-6）
const PET_WALL_EPS = 4;                   // 贴墙判定阈值（px；B01 AC7 不回退，只改判定基准）
const PET_SIZE_TOLERANCE_DIP = 8;         // 尺寸判据容差（DIP，§2.3.5-A）：覆盖 R3 的 +2~+6 量化并留余量；禁用精确判等
const PET_WANDER_SIZE_CHECK_MS = 30000;   // 散步 / 跑步**段起点**兜底校准的最小间隔（ms；§2.1 H 组 H-3 / §2.3.5-B 第 4 条 / DD-22）⇒ 该路径频率 ≤2 次/分
const PET_GEOM_DEBUG = process.env.BIGFISH_PET_DEBUG === '1'; // 几何诊断日志开关（默认关闭，关闭时零开销）

/**
 * 尺寸锚点内存态（§2.3.5-A）：`{ w, h, scaleFactor } | null`——上次成功**写入尺寸（`setBounds`）**后**立即读回**的值
 * + **设锚点时的所在屏 scaleFactor**（后者与锚点同行登记，供 petCalibrateSize() 的 reason 判据句使用）。
 * `null` = 尚无锚点（仅出现在建窗后首次校准前）。
 */
let petSizeBaseline = null;

/**
 * 散步 / 跑步段起点兜底校准的时间戳（§2.3.5-B 第 4 条 / DD-22）：`0` = 从未校准过 ⇒ **首段起点必放行**。
 * 设置点 = 被门控放行的那一次兜底（`petCalibrateSize()` 之后）；建窗时随 `petSizeBaseline = null`
 * **同批置 0**（见 `pet.createPetWindow()`）。无窗口时不必清空——`petCalibrateSize()` 自身短路。
 */
let petWanderSizeCheckedAt = 0;

/** 追加一行几何诊断日志（尽力而为，先例：pet-drag.log / exchange.log）。 */
function petGeomLog(text) {
  try {
    const file = path.join(app.getPath('userData'), 'pet-geometry.log');
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${text}\n`);
  } catch { /* best effort */ }
}

/** 取屏唯一入口：DIP 点 → Display（证据 E3）。不读窗口，ready 之后恒有返回（E7）。 */
function petDisplayOf(point) {
  return screen.getDisplayNearestPoint({ x: point[0], y: point[1] });
}

/** 桌宠窗口中心点（DIP 位置）；无窗口 / 已销毁 → null（E6 依赖项）。 */
function petCenterDIP() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) return null;
  const [x, y] = getPetWindow().getPosition();
  return [x + PET_SIZE_DIP.w / 2, y + PET_SIZE_DIP.h / 2];
}

/** 桌宠中心点所在屏；无窗口 / 已销毁 → null。 */
function petCurrentDisplay() {
  const center = petCenterDIP();
  return center ? petDisplayOf(center) : null;
}

/** 某屏上窗口位置的合法区间（workArea 减去窗口尺寸）；入参 null → null（纯函数）。 */
function petWorkAreaBounds(display) {
  if (!display) return null;
  const wa = display.workArea;
  return {
    minX: wa.x,
    maxX: wa.x + wa.width - PET_SIZE_DIP.w,
    minY: wa.y,
    maxY: wa.y + wa.height - PET_SIZE_DIP.h,
  };
}

/**
 * 贴墙（挣脱）判定的基准（设计档 §2.1 E 组 E1 / DD-13 / §2.3.6）：**整个桌面** = 全部显示器
 * bounds（E2）的并集 x 极值；maxX = 并集右沿 − PET_SIZE_DIP.w（窗口沿恰好贴住桌面右缘）。
 * 与「散步边界 = 所在屏工作区」（petWorkAreaBounds）是**两套用途**，不得互换。
 * 纯函数、不读窗口、不取屏；getAllDisplays() 为空 → null（调用方短路，不判贴墙）。
 */
function petDesktopBounds() {
  let minX = Infinity;
  let right = -Infinity;
  for (const display of screen.getAllDisplays()) {
    const b = display.bounds;
    if (b.x < minX) minX = b.x;
    if (b.x + b.width > right) right = b.x + b.width;
  }
  if (minX === Infinity) return null; // 无显示器（实际不可达）⇒ 判定短路
  return { minX, maxX: right - PET_SIZE_DIP.w };
}

/** 「可见」的唯一口径（NFR-5）：中心点落在任一屏 workArea 内。入参 null → false（纯函数）。 */
function petIsVisible(pos) {
  if (!pos) return false;
  const cx = pos[0] + PET_SIZE_DIP.w / 2;
  const cy = pos[1] + PET_SIZE_DIP.h / 2;
  return screen.getAllDisplays().some((display) => {
    const wa = display.workArea;
    return cx >= wa.x && cx < wa.x + wa.width && cy >= wa.y && cy < wa.y + wa.height;
  });
}

/** 按「中心点最近的屏」把不可见位置钳回该屏区间；已可见则恒等返回（幂等、零写入）。 */
function petNearestVisiblePos(pos) {
  if (!pos) return null;
  if (petIsVisible(pos)) return pos;
  const anchor = [pos[0] + PET_SIZE_DIP.w / 2, pos[1] + PET_SIZE_DIP.h / 2];
  const bounds = petWorkAreaBounds(petDisplayOf(anchor));
  if (!bounds) return null;
  return [
    Math.round(Math.min(Math.max(pos[0], bounds.minX), bounds.maxX)),
    Math.round(Math.min(Math.max(pos[1], bounds.minY), bounds.maxY)),
  ];
}

/** 默认落点（DD-6）：主屏工作区右下角，留 PET_DEFAULT_MARGIN_DIP 边距。 */
function petDefaultPos() {
  const bounds = petWorkAreaBounds(screen.getPrimaryDisplay());
  if (!bounds) return [0, 0]; // 防御：screen 不可用时不让调用方拿到 null（实际不可达）
  return [bounds.maxX - PET_DEFAULT_MARGIN_DIP, bounds.maxY - PET_DEFAULT_MARGIN_DIP];
}

/**
 * 启动位置解析（US-13，建窗前调用）：无存档 → null（不带 x/y 建窗，保持现状，TC-18）；
 * 存档可见 → 存档值（TC-10）；存档非法（非整数 / 缺字段）、不可见或存档文件损坏
 * → petDefaultPos()（§2.3.4 后三种情形，TC-12 / TC-19），均记 pos-restore valid=0。
 * 启动位置解析（含其回落改写）只记 1 行（设计档 §3.3 发射规则）。
 */
let petStartPosLogged = false;
function petResolveStartPos() {
  const first = !petStartPosLogged;
  petStartPosLogged = true;
  const saved = settings.get().petPos;
  const hasArchive = !(saved === null || saved === undefined);
  const pos = (hasArchive && Number.isInteger(saved.x) && Number.isInteger(saved.y))
    ? [saved.x, saved.y] : null;
  if (pos && petIsVisible(pos)) {
    if (PET_GEOM_DEBUG && first) petGeomLog(`pos-restore pos=${petPosText(pos)} valid=1`);
    return pos;
  }
  if (!hasArchive && !settings.isFileCorrupt()) {
    // 真正无存档（首次运行 / 旧档缺键）⇒ 不带坐标建窗
    if (PET_GEOM_DEBUG && first) petGeomLog('pos-restore pos=n/a valid=0 note=no-archive');
    return null;
  }
  const fallback = petDefaultPos();
  if (PET_GEOM_DEBUG && first) {
    petGeomLog(`pos-restore pos=${petPosText(fallback)} valid=0`);
    petGeomLog(`geom-fix reason=start from=${pos ? petPosText(pos) : 'n/a'} to=${petPosText(fallback)}`);
  }
  return fallback;
}

/**
 * 位置持久化（US-13）：写 settings.get().petPos（DIP 整数）+ settings.saveSettings()；与上次写入值相同则跳过。
 * 只在离散停泊事件调用（松手 / 散步段末 / 显示器事件 / 找回 / 退出前），不得在 tick 内调用。
 * 无窗口 / 已销毁 → 直接返回（不写盘、不报错）。
 */
function petSavePos() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) return;
  const [x, y] = getPetWindow().getPosition();
  const px = Math.round(x);
  const py = Math.round(y);
  const last = settings.get().petPos;
  if (last && last.x === px && last.y === py) return; // 去重：与前次写入值相同则跳过
  settings.get().petPos = { x: px, y: py };
  settings.saveSettings();
  if (PET_GEOM_DEBUG) petGeomLog(`pos-save pos=${petPosText([px, py])}`);
}

/** 几何快照 1 行（AC2 / AC7 的取证点）：位置 / 尺寸 / 中心点 / 所在屏 / 工作区 / 可见性。 */
function petGeomSnapshot(tag) {
  if (!PET_GEOM_DEBUG) return;
  const center = petCenterDIP();
  if (!center) return;
  const pos = getPetWindow().getPosition();
  const display = petDisplayOf(center);
  const wa = display.workArea;
  petGeomLog(
    `geom tag=${tag} pos=${petPosText(pos)} size=${petPosText(getPetWindow().getSize())}`
    + ` center=${petPosText(center)} display=${display.id} scale=${display.scaleFactor}`
    + ` wa=(${wa.x},${wa.y},${wa.width},${wa.height}) visible=${petIsVisible(pos) ? 1 : 0}`,
  );
}

/**
 * 位置改写记 1 行（仅在真的发生改写时；幂等 no-op 时零行）。
 * 位置型行在 `reason ∈ {drop, straddle}` 时**另带** `display` / `bounds`（§3.3 列义（五））——
 *   这两类正是 petSettlePos 落点解析的产物，S5 / AC2（B03）的骑线部分要判「标称矩形 ⊆ 该屏 bounds」，
 *   故必须给出**目标屏**（该校正的中心点所在屏）与其 `bounds`；`start` / `display` / `summon` 不带。
 */
function petLogFix(reason, from, to) {
  if (!PET_GEOM_DEBUG) return;
  let extra = '';
  if (reason === 'drop' || reason === 'straddle') {
    const display = petDisplayOf([to[0] + PET_SIZE_DIP.w / 2, to[1] + PET_SIZE_DIP.h / 2]);
    if (display) {
      const b = display.bounds;
      extra = ` display=${display.id} bounds=(${b.x},${b.y},${b.width},${b.height})`;
    }
  }
  petGeomLog(`geom-fix reason=${reason} from=${petPosText(from)} to=${petPosText(to)}${extra}`);
}

/** 位置改写：目标与当前不同才写窗口并记 1 行 geom-fix（幂等时零写入零日志）。 */
function petApplyPos(target, reason) {
  if (!target || !getPetWindow() || getPetWindow().isDestroyed()) return;
  const before = getPetWindow().getPosition();
  if (before[0] === target[0] && before[1] === target[1]) return;
  getPetWindow().setPosition(target[0], target[1]);
  petLogFix(reason, before, target);
}

/** 拖动起点刷新「上一 tick 所在屏」缓存（§2.3.3；显示器事件路径已改为置失效标记，见 handleDisplayChange）。 */
function petSyncDragDisplayCache(cursor) {
  if (!getPetDrag()) return;
  const point = cursor || screen.getCursorScreenPoint();
  const display = petDisplayOf([point.x, point.y]);
  getPetDrag().displayBounds = display ? display.bounds : null;
  getPetDrag().displayId = display ? display.id : null;
}

/** 纯算术：DIP 点是否落在矩形内（拖动热路径用，无 API 调用）；入参任一为 null → false（纯函数，§2.3.1）。 */
function petPointInRect(point, rect) {
  if (!point || !rect) return false;
  return point.x >= rect.x && point.x < rect.x + rect.width
    && point.y >= rect.y && point.y < rect.y + rect.height;
}

/**
 * 纯算术：**标称矩形**（`pos` + `PET_SIZE_DIP`）是否完全落在矩形 `rect` 内（四角 ⊆）。
 * 右 / 下取**闭**区间（`rect` 为凸集 ⇒ 校验左上 / 右下两角即等价于四角 ⊆）——本判据问的是
 * 「**完全进入**」，与 `petPointInRect` 的**半开**区间用途不同，**不得互换**（§2.3.1）。
 * 入参任一为 null → false（纯函数；无 API 调用）。
 */
function petRectInside(pos, rect) {
  if (!pos || !rect) return false;
  return pos[0] >= rect.x && pos[0] + PET_SIZE_DIP.w <= rect.x + rect.width
    && pos[1] >= rect.y && pos[1] + PET_SIZE_DIP.h <= rect.y + rect.height;
}

/**
 * 混合 DPI 重叠判定（**单一来源**，承 NFR-8 / 设计档 §2.3.1）：标称矩形（`pos` +
 * `PET_SIZE_DIP`）是否与 `display` **以外**的、`scaleFactor` **不同**的屏重叠（区间相交，纯算术）。
 * **唯一消费方 = `petStraddleFix()`（骑线推离）**——第 10 轮起 `petCalibrateSize()` 第 ④ 步改为
 * **不可判定门**（DD-20），不再消费本判定；保留定义 = 单一来源，不得写第二份拷贝。
 * 入参任一为 null → false；每次调用一次 `getAllDisplays()` 遍历（E3）——调用方负责执行时点
 * （只该在写入判定时执行，不在每 tick 推导路径上）。纯函数、不读窗口。
 */
function petMixedScaleOverlap(pos, display) {
  if (!pos || !display || !display.bounds) return false;
  return screen.getAllDisplays().some((d) => {
    if (!d || !d.bounds || d.id === display.id || d.scaleFactor === display.scaleFactor) return false;
    const b = d.bounds;
    return pos[0] < b.x + b.width && pos[0] + PET_SIZE_DIP.w > b.x
      && pos[1] < b.y + b.height && pos[1] + PET_SIZE_DIP.h > b.y;
  });
}

/**
 * 骑线推离（§2.3.7 / 契约 §2.3.1）：标称矩形未完全落在**中心点所在屏** `bounds` 内、**且**与之
 * 重叠的其它屏中存在 `scaleFactor` **不同**者 ⇒ 钳入该屏 `bounds`（最小位移 = 逐轴钳入）；
 * 否则**恒等返回**（同 `scaleFactor` 的骑线无合成差异 ⇒ 不做无由的位置改写）。
 * 混合 DPI 判定 = `petMixedScaleOverlap`（单一来源；第 10 轮起本处为其**唯一消费方**，设计档 §2.3.1）。
 * 入参 null → null；无屏可取（screen 不可用）→ 恒等返回。纯函数、不读窗口。
 */
function petStraddleFix(pos) {
  if (!pos) return null;
  const center = [pos[0] + PET_SIZE_DIP.w / 2, pos[1] + PET_SIZE_DIP.h / 2];
  const display = petDisplayOf(center);
  if (!display) return pos;
  if (petRectInside(pos, display.bounds)) return pos; // 已完全落在该屏 ⇒ 不骑线
  if (!petMixedScaleOverlap(pos, display)) return pos; // 同 scaleFactor 的骑线无合成差异 ⇒ 不推
  const b = display.bounds;
  return [
    Math.round(Math.min(Math.max(pos[0], b.x), b.x + b.width - PET_SIZE_DIP.w)),
    Math.round(Math.min(Math.max(pos[1], b.y), b.y + b.height - PET_SIZE_DIP.h)),
  ];
}

/**
 * 落点解析组合（松手 / 显示器事件 / 建窗后**共用**，§2.3.6 / §2.3.7）：
 *   ① 可见性校正（`petNearestVisiblePos` ⇒ `kind='visible'`）② 骑线推离（`petStraddleFix` ⇒ `kind='straddle'`）。
 * 两条规则合并为**一次**位置写入（调用方当且仅当 `kind === 'none'` 时**零写入**）——
 * 前者成立时后者恒等返回（`workArea ⊆ bounds` ⇒ 标称矩形已在 `bounds` 内），故不会产生第二次跳。
 * 入参 null → `{ pos: null, kind: 'none' }`（调用方必须跳过写入，§2.3.1 短路口径）。纯函数、不读窗口。
 */
function petSettlePos(pos) {
  if (!pos) return { pos: null, kind: 'none' };
  let out = pos;
  let kind = 'none';
  const visible = petNearestVisiblePos(out);
  if (visible && (visible[0] !== out[0] || visible[1] !== out[1])) { out = visible; kind = 'visible'; }
  const straddle = petStraddleFix(out);
  if (straddle && (straddle[0] !== out[0] || straddle[1] !== out[1])) { out = straddle; kind = 'straddle'; }
  return { pos: out, kind };
}

/**
 * 显示器配置变化（E5 三事件，DD-8）：日志 1 行 →（非拖动时）回落可见区 → 尺寸校准 → 落盘。
 * **拖动中**（`getPetDrag() !== null`）：只置缓存失效标记**并清除跨屏尺寸标记**（§2.3.2「拖动中」行 /
 *   §2.3.3 / DD-19）——不校正、不落盘、不做尺寸校准：拖动期间位置由用户手指支配（US-2），且
 *   此处推进 displayId 会吞掉该次跨屏尺寸标记；失效标记由下一次拖动 tick 消费（§2.3.3），校正与落盘
 *   交给松手路径兜底。
 *   清除 `pendingSizeAnchor` 的理由（DD-19）：该标记承载的是「**新屏 bounds**」，屏几何已变 ⇒
 *   陈旧值不可信（可能指向一块已不存在的屏）；清除后由下一次切换检测按新屏重新置。
 * 专注模式（无窗口）时 helper 按短路口径返回 null ⇒ 不写入、不落盘。
 */
function handleDisplayChange(kind, display, metrics) {
  if (PET_GEOM_DEBUG) {
    petGeomLog(
      `display-change kind=${kind} id=${display ? display.id : 'n/a'}`
      + ` scale=${display ? display.scaleFactor : 'n/a'}`
      + ` metrics=${metrics && metrics.length ? metrics.join('|') : 'n/a'}`,
    );
  }
  if (getPetDrag()) {
    getPetDrag().displayBounds = null;      // 失效标记（此处不取屏；取屏留给下一 tick，§2.3.3）
    getPetDrag().pendingSizeAnchor = null;  // 同一失效一并清除（DD-19）：屏几何已变 ⇒「新屏 bounds」陈旧不可信
    petGeomSnapshot('display');   // 发射规则③：每个 screen 事件处理完成后 1 行
    return;
  }
  if (getPetWindow() && !getPetWindow().isDestroyed()) {
    // 落点解析与松手路径**共用** petSettlePos（§2.3.1 / §2.3.2）：拔屏后回落可见区 + 骑线推离，
    //   至多一次位置写入（kind='none' ⇒ 零写入）；缩放比变化后重新锚定尺寸。
    const settled = petSettlePos(getPetWindow().getPosition());
    if (settled.kind !== 'none') petApplyPos(settled.pos, 'display');
    petCalibrateSize();
    petSavePos();
  }
  petGeomSnapshot('display');
}

/** 位置元组 → 日志文本 (x,y)。 */
function petPosText(pos) { return `(${pos[0]},${pos[1]})`; }

/**
 * 尺寸校准（**唯一尺寸写入路径**，取代原「期望值判等」式尺寸断言，设计档 §2.3.5-A / C）——五步判定次序：
 *   ① 窗口守卫（`!getPetWindow() || isDestroyed()` → 返回）② `getSize()` 1 次 ③ 锚点非空 ∧ 逐分量
 *   `|cur − 锚点| ≤ 容差` → 返回（**零写入零日志**：同屏静止 / 量化误差的常见路径）
 *   ④ **不可判定门**（第 10 轮更名 / 改写，DD-20；原「混合 DPI 门」的**骑线拦截子句已删**——
 *   其前提经 §2.2 Q6 证伪）：`petCurrentDisplay()` 为 null（窗口中心点不在任何屏上）→ 返回
 *   （**推迟**写入——第 ⑤ 步需该屏 `scaleFactor` 入锚点，中心点不在任何屏上时无从取得）。
 *   **这是唯一的推迟条件**：与其它屏（含 `scaleFactor` **不同**者）重叠、与桌面外（无屏覆盖处）重叠 ⇒ **一律过门**（照第 ⑤ 步写入）。
 *   ⑤ **尺寸写入 + 位置保护**（第 13 轮改写，DD-25 / §2.3.5-F；三步 + 一次复核）：Ⅰ 写入前读数 →
 *   Ⅱ **尺寸专用写入** = `setBounds({ width, height })`（**不提供 `x` / `y`**：E8 ⇒ 调用方不传位置，
 *   旧「读位置 → 原样传回」形态已废）→ Ⅲ 写入后读数校验：任一分量之差 **> 1 DIP** ⇒ `setPosition`
 *   **条件回写**一次（值 = 写入前读数）并**复核** ⇒ `note=pos-restored` / `note=pos-unfixed`（复核仍不
 *   一致 ⇒ **判失败**，F15）；回写写的是同一位置值 ⇒ 非位置钳制、不发位置型行（§2.3.5-B 第 5 条）
 *   → Ⅳ `getSize()` 读回 → 更新锚点 → 记 1 行（发射时点 = 写入与复核**之后** ⇒ `pos-after` = 终值）。
 * `reason` 判据句（**唯一形态**，与 §2.3.5-B2 / §3.3 列义（四）同源，纯算术）：
 *   锚点为空 **∨** 当前所在屏 scaleFactor ≠ 设锚点时的 scaleFactor ⇒ `size-anchor`；否则 `size-drift`。
 *   不得写成「锚点为空 ⇒ size-anchor；否则 size-drift」——那会把拖动期跨屏的那一次记成 `size-drift`。
 * 无参（不得加 `reason` 入参）；无窗口 / 已销毁 → 直接返回。
 */
function petCalibrateSize() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) return;                 // ①
  const [cw, ch] = getPetWindow().getSize();                              // ②
  if (petSizeBaseline                                                 // ③
    && Math.abs(cw - petSizeBaseline.w) <= PET_SIZE_TOLERANCE_DIP
    && Math.abs(ch - petSizeBaseline.h) <= PET_SIZE_TOLERANCE_DIP) return;
  const display = petCurrentDisplay();                                // ④ 不可判定门（DD-20）
  if (!display) return;                                                // 无屏（中心点不在任何屏上）⇒ 不可判定 ⇒ 推迟
  // ⑤ 位置读数点（**单一定义**）：写入前读数与**回写后复核**共用同一处 `getPosition()` ⇒ 本函数内
  //   `getPosition()` 文本 2 处（§3.3 位置保护判别面的计数面）；回写路径上该读数点执行 2 次。
  const readPos = () => getPetWindow().getPosition();
  const pos = readPos();                                              // Ⅰ 写入前位置（pos 列 / 回写值共用）
  getPetWindow().setBounds({ width: PET_SIZE_DIP.w, height: PET_SIZE_DIP.h }); // Ⅱ 尺寸专用写入（不提供 x / y，E8）
  let posAfter = getPetWindow().getPosition(), note = '';                  // Ⅲ 写入后读数（校验）+ 回写留痕位
  if (Math.abs(posAfter[0] - pos[0]) > 1 || Math.abs(posAfter[1] - pos[1]) > 1) { // 容差 1 DIP（§2.2 位置侧实证 A 组：(−1,−1)）
    getPetWindow().setPosition(pos[0], pos[1]);                            // 条件回写（唯一一处；值 = 写入前读数）
    posAfter = readPos();                                             // 回写后复核
    note = (Math.abs(posAfter[0] - pos[0]) <= 1 && Math.abs(posAfter[1] - pos[1]) <= 1)
      ? 'pos-restored' : 'pos-unfixed';
  }
  const [aw, ah] = getPetWindow().getSize();                               // Ⅳ 读回尺寸
  const scale = display.scaleFactor;
  const reason = (!petSizeBaseline || petSizeBaseline.scaleFactor !== scale) ? 'size-anchor' : 'size-drift';
  petSizeBaseline = { w: aw, h: ah, scaleFactor: scale };             // 先更新锚点、后记 1 行（§2.3.5-C 第 ⑤ 步 ④ 的次序）
  if (PET_GEOM_DEBUG) {
    const b = display.bounds;
    petGeomLog(
      `geom-fix reason=${reason} size-from=${petPosText([cw, ch])} size-to=${petPosText([aw, ah])}`
      + ` display=${display.id} scale=${scale} bounds=(${b.x},${b.y},${b.width},${b.height})`
      + ` pos=${petPosText(pos)} pos-after=${petPosText(posAfter)}${note ? ` note=${note}` : ''}`,
    );
  }
}

// ---- 转发访问器（§2.2.6 允许面②：跨模块读写面）----
function resetSizeBaseline() { petSizeBaseline = null; }
function resetWanderSizeCheckedAt() { petWanderSizeCheckedAt = 0; }
function getWanderSizeCheckedAt() { return petWanderSizeCheckedAt; }
function setWanderSizeCheckedAt(v) { petWanderSizeCheckedAt = v; }

module.exports = {
  PET_SIZE_DIP,
  PET_WALL_EPS,
  PET_WANDER_SIZE_CHECK_MS,
  PET_GEOM_DEBUG,
  petGeomLog,
  petDisplayOf,
  petCurrentDisplay,
  petWorkAreaBounds,
  petDesktopBounds,
  petDefaultPos,
  petResolveStartPos,
  petSavePos,
  petGeomSnapshot,
  petApplyPos,
  petSyncDragDisplayCache,
  petPointInRect,
  petRectInside,
  petSettlePos,
  handleDisplayChange,
  petPosText,
  petCalibrateSize,
  resetSizeBaseline,
  resetWanderSizeCheckedAt,
  getWanderSizeCheckedAt,
  setWanderSizeCheckedAt,
  init,
};
