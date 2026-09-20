'use strict';
/**
 * shell-pet.js — 桌宠窗口与状态机 + 台词 + 点击 IPC 处理器函数（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6 注 S3）。
 * 函数清单（注 S3）：PET_QUOTES · petSay · playIdleVariant · schedulePetChatter · clearPetTimers · setPetState · scheduleSleep · wakePet ·
 * scheduleWander · doWander · summonPet · createPetWindow · ensurePet · destroyPetWindow · 状态（petWindow / petState / 定时器 / 散步状态）·
 * 处理器 handlePetClicked / handlePetRightClicked。
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const core = require('./pet-chain-core.js');
const settings = require('./shell-settings.js');
const geometry = require('./shell-pet-geometry.js');
const drag = require('./shell-pet-drag.js');
const physics = require('./shell-pet-physics.js');

// 注入面（组合根 main.js 接线）：showMainWindow（window）/ openExchangeWindow、broadcastAffinity（affinity）
let showMainWindow = null;
let openExchangeWindow = null;
let broadcastAffinity = null;
function init(deps) {
  showMainWindow = deps.showMainWindow;
  openExchangeWindow = deps.openExchangeWindow;
  broadcastAffinity = deps.broadcastAffinity;
  // 渲染层请求一次散步（复用既有 doWander 的守卫与位移纪律；本批不改其内部，DD-6）
  ipcMain.on('pet-chain-move', () => doWander());
  // 物理域接线（B20）：doWander 守卫读 physics.isFlying()（下面 require 定序先于本 init 调用）
  physics.init({
    getPetWindow,
    getPetDrag: drag.getPetDrag,
    getMoveTimer,
    settings,
    setPetState,
  });
}

// ---------------------------------------------------------------------------
// 动画链：池装载 + V1–V6 校验 + 下发（B18；设计档 docs/design/PET-ANIMATION.md §2.2.2 / §2.2.7 / §2.2.11）
// ---------------------------------------------------------------------------
const ANIM_POOL_PATH = path.join(__dirname, 'assets', 'pet-anim', 'pool.json');
const ANIM_LOG_NAME = 'pet-anim.log';
let animPoolResult = null; // 池装载结果缓存（每次重建窗口复用；换池需重启）

/** debug 开关（承既有 `BIGFISH_PET_DEBUG` 口径；关闭时零日志、零监听）。 */
function animDebug() { return process.env.BIGFISH_PET_DEBUG === '1'; }

/** 链日志落盘：主进程行 + 渲染层 `[pet-anim]` 行同文件追加（设计档 §2.2.11）；B19 起工作模块（shell-pet-work.js）的 `work *` 行同注入面（§2.8.8，不新建日志文件）。 */
function animLog(line) {
  if (!animDebug()) return;
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), ANIM_LOG_NAME), '[' + new Date().toISOString() + '] ' + line + '\n');
  } catch { /* 日志失败不影响链 */ }
}

/** 动画链日志注入面（B19 / §2.8.8）：供工作状态模块的 `work *` 诊断行复用同一日志文件与 debug 开关；已含 debug 判定。 */
function logAnim(line) { animLog(line); }

/** 池装载 + 校验（V1–V6 谓词与 JSON 破损在 pet-chain-core.js；本处只注入 fs 探针并给出日志行）。 */
function loadAnimPool() {
  let text = null;
  try { text = fs.readFileSync(ANIM_POOL_PATH, 'utf8'); } catch { /* 缺失 ⇒ 与 V1 同码（TC-10） */ }
  const r = text === null ? { ok: false, reason: 'V1' } : core.parsePool(text, (rel) => {
    try {
      const st = fs.statSync(path.join(__dirname, rel));
      return { exists: true, size: st.size };
    } catch { return { exists: false, size: 0 }; }
  });
  if (!r.ok) return { payload: { ok: false, reason: r.reason }, line: 'anim pool ok=0 reason=' + r.reason };
  const s = r.stats;
  return {
    payload: { ok: true, pool: r.pool },
    line: 'anim pool ok=1 slots=' + s.slots + ' segs=' + s.segs + ' bytes=' + s.bytes + ' max=' + s.max,
  };
}

/** 池下发（建窗 did-finish-load 后一次，设计档 §2.2.7）；ok=0 ⇒ 渲染层保持 PNG 通道。 */
function sendAnimConfig() {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (!animPoolResult) animPoolResult = loadAnimPool();
  animLog(animPoolResult.line);
  petWindow.webContents.send('pet-chain-config', Object.assign({ debug: animDebug() }, animPoolResult.payload));
}

/** @type {BrowserWindow | null} */
let petWindow = null;

const PET_QUOTES = [
  // 人设·打招呼
  '我是深海里的鲸鱼公主，很高兴见到你~',
  '欢迎回来，我的小伙伴！',
  '鲸鱼公主来啦，今天也要一起加油哦！',
  '深海那么大，但我只想陪你~',
  // 人设·撒娇/互动
  '哼，都不理我，我要吐泡泡了~',
  '抱抱我嘛，我可是会喷水的公主！',
  '你忙的时候，我会乖乖在旁边看着你~',
  '我的尾巴会发光，但只有你才看得到哦~',
  // 趣味·小知识（鲸鱼相关）
  '小知识：蓝鲸的心跳每分钟只有 6 次哦~',
  '你知道吗？鲸鱼其实是哺乳动物，不是鱼！',
  '鲸鱼唱歌能传 1600 公里远，我的歌声呢~',
  '座头鲸会跳出海面，像是在跳芭蕾~',
  '小知识：抹香鲸可以潜水 90 分钟不上来！',
  // 趣味·日常生活
  '要不要我帮你把今天的任务列个清单？',
  '查资料、写报告、做 PPT，说一声就行~',
  '记得喝口水休息一下，别太累啦！',
  '作业写完记得检查一遍哦~',
  // 加油打气
  '今天也要元气满满！',
  '你已经很棒了，剩下的事交给我！',
  '别怕麻烦，我一直都在~',
];

function petSay(msg) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet-say', msg);
  }
}

/** 待机时随机表演一段小动作（看书/星星眼/惊吓/开心），随后回到待机；工作档在途（记录新鲜期）不让位自主起步（B26 / §2.12.2 补漏门）。 */
function playIdleVariant() {
  // 补漏起步门（B26 / §2.12.2）：与 scheduleWander 同判据形态、同常量来源——档位保持仍在（petBaseState 非 idle）时自主小动作不起步
  if (!petWindow || petWindow.isDestroyed() || petState !== 'idle' || petBaseState() !== 'idle') return;
  const variants = ['read', 'starry', 'scared', 'happy'];
  const v = variants[Math.floor(Math.random() * variants.length)];
  setPetState(v);
  setTimeout(() => {
    if (petState === v) setPetState('idle');
  }, 2400);
}

function schedulePetChatter() {
  clearTimeout(chatterTimer);
  chatterTimer = setTimeout(() => {
    if (petWindow && !petWindow.isDestroyed() && petState === 'idle') {
      // 40% 概率先表演一段小动作，再说话
      if (Math.random() < 0.4) playIdleVariant();
      petSay(PET_QUOTES[Math.floor(Math.random() * PET_QUOTES.length)]);
    }
    schedulePetChatter();
  }, 90000); // 固定 1.5 分钟说一句
}

/** 找回鲸鱼娘（US-14）：拉回主屏默认落点并落盘；专注模式下入口置灰、此处分外守卫。 */
function summonPet() {
  if (settings.get().mode === 'focus') return;
  ensurePet();
  if (!petWindow || petWindow.isDestroyed()) return;
  geometry.petApplyPos(geometry.petDefaultPos(), 'summon');
  geometry.petCalibrateSize();
  geometry.petSavePos();
}

function createPetWindow(startPos) {
  if (petWindow && !petWindow.isDestroyed()) { petWindow.show(); return; }
  petWindow = new BrowserWindow({
    width: geometry.PET_SIZE_DIP.w,
    height: geometry.PET_SIZE_DIP.h,
    ...(startPos ? { x: startPos[0], y: startPos[1] } : {}),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'pet-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  petWindow.setAlwaysOnTop(true, 'floating');
  // 点击穿透只在 Windows 上可靠；Linux 上开启会导致桌宠点不到
  if (process.platform === 'win32') {
    petWindow.setIgnoreMouseEvents(true, { forward: true });
  }
  petWindow.loadFile(path.join(__dirname, 'pet.html'));
  petWindow.webContents.on('did-finish-load', () => {
    // 新窗口加载完成立刻推送好感度，避免切换模式后条子显示 0
    broadcastAffinity();
    sendAnimConfig(); // 动画池下发（建窗后一次；池非法 ⇒ ok=0 且渲染层留 PNG 通道）
  });
  // 链日志捕获（仅 debug：关闭时不挂监听，零开销）
  if (animDebug()) {
    petWindow.webContents.on('console-message', (_e, level, message) => {
      if (typeof message === 'string' && message.indexOf('[pet-anim]') === 0) animLog(message.slice(10).trim());
    });
  }
  // 渲染进程异常退出 → 跟随循环终止（设计档 §2.2.6）
  petWindow.webContents.on('render-process-gone', () => drag.petStopDrag('destroyed'));
  petWindow.on('closed', () => {
    drag.petStopDrag('destroyed'); // 窗口关闭路径终止拖动（设计档 §2.2.6）
    petWindow = null;
  });
  // 建窗后一次（§2.3.2 建窗后行 / §2.3.5-C 调用点①）：先做一次**骑线推离**（仅在真的发生推离时
  //   记 geom-fix reason=straddle），再建立 / 重定尺寸锚点——次序与松手行同源（先定位置、再定尺寸锚点）。
  //   第 10 轮起校准的门 = **不可判定门**（§2.3.5-C 第 4 步 / DD-20）⇒ 推离**不再是过门的前提**；
  //   推离本身按 §2.3.7 独立发生（唯一理由 = 不让「一半大一半小」停留）。
  //   该路径本不执行贴墙判定 ⇒ wall 行照常缺席（豁免规则照用，§2.3.6 / §2.3.7）。
  // 新建窗口 ⇒ 锚点作废（§2.3.5-A：「null」仅出现在建窗后首次校准前）——不得复用上一窗口的锚点与其 scaleFactor
  geometry.resetSizeBaseline();
  geometry.resetWanderSizeCheckedAt(); // 散步段起点兜底的门控时间戳同批复位（§2.3.5-B 第 4 条的状态生命周期）
  const bootSettle = geometry.petSettlePos(petWindow.getPosition());
  if (bootSettle.kind === 'straddle') geometry.petApplyPos(bootSettle.pos, 'straddle');
  geometry.petCalibrateSize();
}

/** 桌宠启用但窗口没了时，重建它（解决关窗后桌宠消失）。 */
function ensurePet() {
  if (settings.get().petEnabled && (!petWindow || petWindow.isDestroyed())) {
    // 重建也走启动位置解析（US-13：模式切回鲸鱼时不回到系统默认落点）
    createPetWindow(geometry.petResolveStartPos());
  }
}

function destroyPetWindow() {
  clearPetTimers();
  petWanderDir = null;
  petBounceLeft = 0;
  physics.quit(); // 物理飞行态一并终止（B20：销毁路径停点，docs/design/PET-MOVEMENT.md §2.2.10 第 9 行）
  if (petWindow && !petWindow.isDestroyed()) petWindow.destroy();
  petWindow = null;
  drag.petStopDrag('destroyed'); // 拖动跟随循环一并终止（幂等：clearPetTimers 已停过则此处 no-op）
}

// ---------------------------------------------------------------------------
// Pet state machine (idle / eat / sleep / walk / run + happy/read/scared/starry)
// ---------------------------------------------------------------------------
let petState = 'idle';
// 工作状态背底档提供者（B19）：由 shell-pet-work.js 经 setBaseStateProvider 注入（反注入——shell-pet.js 不 require 工作模块，
//   docs/design/PET-ANIMATION.md §2.7）；仅用于散步起步门（§2.8.4「散步/入睡的让位」行），不改变任何既有状态语义。
let petBaseStateProvider = null;

/** 工作档背底档提供者注入（组合根接线；shell-pet-work.init 后调用）。 */
function setBaseStateProvider(fn) { petBaseStateProvider = fn; }

/** 背底档读取（§2.8.4）：提供者未注入 / 返回空 ⇒ 'idle'。散步起步门消费（scheduleWander）。 */
function petBaseState() { return petBaseStateProvider ? petBaseStateProvider() ?? 'idle' : 'idle'; }
let wanderTimer = null;
let sleepTimer = null;
let eatTimer = null;
let moveTimer = null;
let chatterTimer = null;
let petWanderDir = null;   // null=未在散步；'left'/'right' 当前移动方向
let petBounceLeft = 0;     // 撞墙后还剩几次折返
let petForceRun = false;   // 脱手逃跑等场景强制跑步

function clearPetTimers() {
  clearTimeout(wanderTimer);
  clearTimeout(sleepTimer);
  clearTimeout(eatTimer);
  clearTimeout(chatterTimer);
  clearInterval(moveTimer);
  wanderTimer = sleepTimer = eatTimer = moveTimer = chatterTimer = null;
  physics.quit(); // 物理飞行 / 采样循环同样是桌宠定时器，一并终止（NFR-4：异常路径也清空；B20）
  drag.petStopDrag('destroyed'); // 拖动跟随循环同样是桌宠定时器，一并终止（NFR-2：异常路径也清空）
}

function setPetState(state) {
  petState = state;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet-state', state);
  }
}

function scheduleSleep() {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    if (petState === 'idle') setPetState('sleep');
  }, 120 * 1000); // 2 min idle -> sleep
}

function wakePet() {
  clearTimeout(sleepTimer);
  if (petState === 'sleep') setPetState('idle');
  scheduleSleep();
}

function scheduleWander() {
  clearTimeout(wanderTimer);
  wanderTimer = setTimeout(() => {
    // 起步门（B19 / §2.8.4）：仅 idle 态且无工作档在途（背底档）才起步——「工作档期间不启动散步」（US-21 / DD-23）
    if (petState === 'idle' && petBaseState() === 'idle') doWander();
    else scheduleWander();
  }, 15000 + Math.random() * 20000);
}

// 逃跑腿专用常量（B27 / R22-① + T59/T60 位移窗；docs/design/PET-ANIMATION.md §2.14.8 常量表）：定义单点、doWander escape 分支单点消费（AC34⑤）。
const ESCAPE_LEG_MIN_DIP = 300;   // px：逃跑腿最短腿长（腿长 = MIN + rand×RANGE ⇒ 300~600）
const ESCAPE_LEG_RANGE_DIP = 300; // px：随机腿长增量
const ESCAPE_RUN_START_MS = 1750; // ms：逃跑素材起跑点（原地左转奔跑 ≈10.04 s：0~1.3 s 正面站立、~1.75 s 起侧身奔跑——逐帧标定）——escape 腿位移与该点对齐（T59）
const ESCAPE_TRIP_MS = 4000;      // ms：素材跑停站直点（3.9~4.2 s 跑停微晃、4.3 s 起前扑摔倒——逐帧标定）——escape 腿时长 = TRIP − RUN_START = 2250 ms，移速按腿长派生（T60；ESCAPE_LEG_SPEED 退役）

/**
 * 散步/跑步：随机走一段距离就停下休息（不必走完全程）。
 * 只有中途碰到墙壁才折返，折返 petBounceLeft 次后歇着。
 * 20% 概率跑步（更快更远）；脱手逃跑（petForceRun）强制跑步。
 * 边界 = 桌宠当前所在屏的工作区（US-9，不跨屏）；y 写前归位（根因 2）。
 */
function doWander() {
  // 拖动态守卫：任何来源的散步都不得在拖动中移动窗口（根因 D）；B20：物理飞行中散步同样不得启动
  //（位移仲裁交接④：守卫失败即 scheduleWander() 重排 = 既有自愈，docs/design/PET-MOVEMENT.md §2.2.2）
  if (!petWindow || petWindow.isDestroyed() || petState !== 'idle' || drag.getPetDrag() !== null || physics.isFlying()) {
    scheduleWander();
    return;
  }
  // 段起点算一次边界（所在屏口径），段内不重算；y 归位与撞墙判定取边界口径（B26 / §2.2.13 起地面口径，B27 / §2.2.14 四面推广；判空与 petWorkAreaBounds 同源）
  const bounds = physics.petEdgeBounds(geometry.petWorkAreaBounds(geometry.petCurrentDisplay()));
  if (!bounds) {
    scheduleWander();
    return;
  }
  if (!petWanderDir) petWanderDir = Math.random() < 0.5 ? 'left' : 'right';
  if (petBounceLeft <= 0) petBounceLeft = 1 + Math.floor(Math.random() * 2); // 撞墙后折返 1~2 次
  const [x, y] = petWindow.getPosition();
  // y 归位：写入前钳入所在屏工作区，消除「纵向失踪」（根因 2 / TC-9）
  const targetY = Math.round(Math.min(Math.max(y, bounds.minY), bounds.maxY));
  const run = petForceRun || Math.random() < 0.2;
  // B21：petForceRun 为真时用 escape 档名（US-31）
  const escape = petForceRun;
  petForceRun = false;
  // 随机走一段（不一定到墙）；B27：逃跑分支取专用腿参数（R22-①，§2.14.8——不改普通跑步分支）
  const distance = escape ? ESCAPE_LEG_MIN_DIP + Math.random() * ESCAPE_LEG_RANGE_DIP : (run ? 200 + Math.random() * 300 : 80 + Math.random() * 200);
  let targetX = petWanderDir === 'left' ? x - distance : x + distance;
  const hitWall = petWanderDir === 'left' ? targetX <= bounds.minX : targetX >= bounds.maxX;
  if (hitWall) {
    // 撞墙：走到墙为止，之后折返（墙 = 所在屏工作区边缘，US-9）
    targetX = petWanderDir === 'left' ? bounds.minX : bounds.maxX;
  }
  const dist = Math.abs(targetX - x);
  if (dist < 4) {
    // 已经在墙边且方向朝墙 → 直接折返
    petWanderDir = petWanderDir === 'left' ? 'right' : 'left';
    setPetState('idle');
    doWander();
    return;
  }
  // 时长（T60，2026-09-20 用户裁定）：escape 腿 = 位移窗定值（ESCAPE_TRIP_MS − ESCAPE_RUN_START_MS），移速 = 腿长 ÷ 窗长派生
  //   （≈0.13~0.27 px/ms，较原 0.45 慢一半到三分之二；撞墙腿长缩短 ⇒ 只慢、不错节奏）；walk/run 腿照旧（0.34 / 0.17，下限 250 ms）。
  const duration = escape ? ESCAPE_TRIP_MS - ESCAPE_RUN_START_MS : Math.max(250, dist / (run ? 0.34 : 0.17));
  // 位移与素材起跑点对齐（T59，2026-09-20 用户裁定）：escape 腿位移时钟整体后移 ESCAPE_RUN_START_MS——
  // 素材前段（站立 + 转身）窗口原地不动，奔跑姿态一出来位移同步起跑；walk/run 腿 = 0 照旧。零新增定时器（偏移只做进既有 moveTimer）。
  const moveDelayMs = escape ? ESCAPE_RUN_START_MS : 0;
  setPetState((escape ? 'escape-' : (run ? 'run-' : 'walk-')) + petWanderDir);
  const startX = x;
  const startTime = Date.now();
  let segStartLogged = false;
  // 段起点低频兜底校准（§2.3.5-B 第 4 条 / DD-22 / H-3）：本时点在 setInterval(moveTimer, 16) **之前**
  //   ⇒ 运动尚未开始、窗口静止 ⇒ 读回不进「移动中的噪声带」（§2.3.5-A 第 5 点），
  //   且即使触发 setBounds 也不与任何移动循环争窗口（本缺陷的机制即「setBounds 同时设位置与尺寸」）。
  //   频率上界 = ≤1 次 / geometry.PET_WANDER_SIZE_CHECK_MS（30 s；现状逐帧调用约 3750 次/分 ⇒ 本轮删除）。
  //   禁止形态（§2.3.5-B 第 4 条）：不得恢复逐帧调用；不得改为「每 N 个 tick」（= 段内、运动在途）；不得挪到段末。
  if (Date.now() - geometry.getWanderSizeCheckedAt() >= geometry.PET_WANDER_SIZE_CHECK_MS) {
    geometry.petCalibrateSize();
    geometry.setWanderSizeCheckedAt(Date.now());
  }
  clearInterval(moveTimer);
  moveTimer = setInterval(() => {
    const t = Math.min(1, Math.max(0, (Date.now() - startTime - moveDelayMs) / duration));
    const nx = Math.round(startX + (targetX - startX) * t);
    petWindow.setPosition(nx, targetY); // y = 归位后的值（写入前钳制，根因 2）
    // 段起点（y 归位后）1 行 geom——AC7 取证点
    if (!segStartLogged) { segStartLogged = true; geometry.petGeomSnapshot('seg-start'); }
    // 运动在途（本回调内）**零尺寸判定、零尺寸写入**（§2.3.5-B 第 4 条 / DD-22）：原逐帧的尺寸校准
    //   调用已删——移动中的读回噪声带（+0…+34 DIP）跨过容差 8 ⇒ 每帧判「漂移」⇒ 每帧尺寸写入
    //   （同时设位置与尺寸）⇒ 与移动循环互相打断。本路径唯一的校准时点 = 段起点兜底（见上方门控块）。
    if (t >= 1) {
      clearInterval(moveTimer);
      moveTimer = null;
      // 段末 1 行 geom（AC7 取证点）+ 离散停泊事件落盘（US-13，不在 tick 内写盘）
      geometry.petGeomSnapshot('seg-end');
      geometry.petSavePos();
      if (hitWall) {
        // 撞墙 → 折返（1~2 次后停下休息）
        petBounceLeft--;
        if (petBounceLeft > 0) {
          petWanderDir = petWanderDir === 'left' ? 'right' : 'left';
          setPetState('idle');
          doWander();
        } else {
          petWanderDir = null;
          petBounceLeft = 0;
          setPetState('idle');
          scheduleWander();
        }
      } else {
        // 正常走完一段 → 停下休息
        petWanderDir = null;
        petBounceLeft = 0;
        setPetState('idle');
        scheduleWander();
      }
    }
  }, 16);
}

function handlePetClicked() {
  // 原地点击也起过跟随循环（按下即起）——点完即止，保证拖动状态在所有路径下清空
  drag.petStopDrag('pointerup');
  wakePet();
  showMainWindow(); // 只开不隐（US-1 / R3）；隐藏只走托盘项
  petSay('要我帮忙吗？');
  // 点击 → 开心动画（新素材）
  setPetState('happy');
  clearTimeout(eatTimer);
  eatTimer = setTimeout(() => {
    if (petState === 'happy') setPetState('idle');
  }, 1600);
}

function handlePetRightClicked() {
  // 右键：打开鲸鱼娘兑换屋
  wakePet();
  petSay('要兑换点什么吗~');
  openExchangeWindow();
}

// ---- 状态访问器（§2.2.6 允许面②：跨模块读写面）----
function getPetWindow() { return petWindow; }
function getPetState() { return petState; }
function getMoveTimer() { return moveTimer; }
function setMoveTimer(v) { moveTimer = v; }
function getWanderTimer() { return wanderTimer; }
function setWanderTimer(v) { wanderTimer = v; }
function getEatTimer() { return eatTimer; }
function setEatTimer(v) { eatTimer = v; }
function setWanderDir(v) { petWanderDir = v; }
function setBounceLeft(v) { petBounceLeft = v; }
function setForceRun(v) { petForceRun = v; }

module.exports = {
  petSay,
  playIdleVariant,
  schedulePetChatter,
  clearPetTimers,
  setPetState,
  getPetState,
  scheduleSleep,
  wakePet,
  scheduleWander,
  doWander,
  summonPet,
  createPetWindow,
  ensurePet,
  destroyPetWindow,
  getPetWindow,
  getMoveTimer,
  setMoveTimer,
  getWanderTimer,
  setWanderTimer,
  getEatTimer,
  setEatTimer,
  setWanderDir,
  setBounceLeft,
  setForceRun,
  handlePetClicked,
  handlePetRightClicked,
  logAnim,
  setBaseStateProvider,
  petBaseState,
  init,
};
