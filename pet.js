'use strict';
const img = document.getElementById('pet');
const bubble = document.getElementById('bubble');
const affinityFill = document.getElementById('affinity-fill');
const affinityLabel = document.getElementById('affinity-label');

// 新素材：assets/pet-new/<动作>/<动作>-NN.png（240x220 统一画布，共 11 个动作）
// 待机用回原来的帧（新截的待机帧有问题）
const FRAMES = {
  idle: ['assets/pet/idle.png'],
  eat: ['assets/pet-new/eat/eat-01.png', 'assets/pet-new/eat/eat-02.png', 'assets/pet-new/eat/eat-03.png', 'assets/pet-new/eat/eat-04.png'],
  sleep: ['assets/pet-new/sleep/sleep-01.png', 'assets/pet-new/sleep/sleep-02.png'],
  'walk-left': ['assets/pet-new/walk-left/walk-left-01.png', 'assets/pet-new/walk-left/walk-left-02.png', 'assets/pet-new/walk-left/walk-left-03.png', 'assets/pet-new/walk-left/walk-left-04.png'],
  'walk-right': ['assets/pet-new/walk-right/walk-right-01.png', 'assets/pet-new/walk-right/walk-right-02.png', 'assets/pet-new/walk-right/walk-right-03.png', 'assets/pet-new/walk-right/walk-right-04.png'],
  'run-left': ['assets/pet-new/run-left/run-left-01.png', 'assets/pet-new/run-left/run-left-02.png', 'assets/pet-new/run-left/run-left-03.png', 'assets/pet-new/run-left/run-left-04.png'],
  'run-right': ['assets/pet-new/run-right/run-right-01.png', 'assets/pet-new/run-right/run-right-02.png', 'assets/pet-new/run-right/run-right-03.png', 'assets/pet-new/run-right/run-right-04.png'],
  happy: ['assets/pet-new/happy/happy-01.png', 'assets/pet-new/happy/happy-02.png', 'assets/pet-new/happy/happy-03.png', 'assets/pet-new/happy/happy-04.png'],
  read: ['assets/pet-new/read/read-01.png', 'assets/pet-new/read/read-02.png', 'assets/pet-new/read/read-03.png', 'assets/pet-new/read/read-04.png'],
  scared: ['assets/pet-new/scared/scared-01.png', 'assets/pet-new/scared/scared-02.png', 'assets/pet-new/scared/scared-03.png', 'assets/pet-new/scared/scared-04.png'],
  starry: ['assets/pet-new/starry/starry-01.png', 'assets/pet-new/starry/starry-02.png', 'assets/pet-new/starry/starry-03.png', 'assets/pet-new/starry/starry-04.png'],
};
const FRAME_MS = {
  idle: 0, eat: 200, sleep: 600,
  'walk-left': 200, 'walk-right': 200, 'run-left': 120, 'run-right': 120,
  happy: 200, read: 260, scared: 200, starry: 220,
};

let state = 'idle';
let frameIndex = 0;
let animTimer = null;

function setState(s) {
  // B19（§2.8.7 行 3 / AC21）：链上报先行——未知档位（无 PNG 帧，如 work-*）也上报给动画链（视频通道照播）；
  //   PNG 通道下未知档位渲染待机帧（不空白、不报错；现有 11 档逐位不变——FRAMES 有帧则照旧 renderPng(s)）。
  //   重断言的重复下发幂等由 renderPng('idle') 的单帧无定时器形态承担（FRAME_MS.idle = 0 ⇒ 无 timer 重启、同值 src、bob class 不变）
  notifySlot(s);
  if (FRAMES[s]) { renderPng(s); return; }
  renderPng('idle');
}

/** 语义档位 → 动画链（pet-chain.js 的全局出口；本档只上报，不参与选段，设计档 §2.2.1）。 */
function notifySlot(s) {
  if (window.petChain) window.petChain.setSlot(s);
}

/** PNG 通道渲染（逐帧）：与改造前逐位一致——帧表 / 节奏 / 尺寸口径零变更（US-18 边界）。 */
function renderPng(s) {
  state = s;
  frameIndex = 0;
  if (animTimer) { clearInterval(animTimer); animTimer = null; }
  img.src = FRAMES[s][0];
  // 待机帧是 160x160 满幅原图，缩到与新帧(240x220)里鲸鱼同等大小（约 140px），
  // 避免旧待机图看起来偏大
  img.style.height = s === 'idle' ? '140px' : '200px';
  img.classList.toggle('animate-bob', s === 'idle');
  if (FRAMES[s].length > 1 && FRAME_MS[s] > 0) {
    animTimer = setInterval(() => {
      frameIndex = (frameIndex + 1) % FRAMES[s].length;
      img.src = FRAMES[s][frameIndex];
    }, FRAME_MS[s]);
  }
}

// drag to move; a click (no movement) summons the main window
// 窗口位置由主进程按全局光标绝对定位推导（本层只识别起止、保活与穿透守卫）
let dragging = false;
let moved = false;
let dragPointerId = null;
let startX = 0;
let startY = 0;
let dragHeartbeatTimer = null;
const PET_DRAG_KEEPALIVE_MS = 500;   // 心跳周期（定时器驱动，与鼠标事件无关）

/** 停心跳定时器。 */
function stopDragHeartbeat() {
  if (dragHeartbeatTimer) { clearInterval(dragHeartbeatTimer); dragHeartbeatTimer = null; }
}

/** 起拖入口：pointerdown 与伪取消后的对称自愈共用（设计档 §2.2.4.1）。 */
function beginDrag(e) {
  dragging = true;
  moved = false;
  startX = e.screenX;
  startY = e.screenY;
  document.body.style.cursor = 'grabbing';
  // 自认为处于穿透态时先请求恢复可交互（异步 IPC 窗口期的防守，设计档 §2.2.7）
  if (!lastInteractive) window.petAPI.setIgnoreMouse(false);
  try { document.body.setPointerCapture(e.pointerId); dragPointerId = e.pointerId; } catch { dragPointerId = null; }
  window.petAPI.dragStart();
  stopDragHeartbeat();
  dragHeartbeatTimer = setInterval(() => window.petAPI.dragHeartbeat(), PET_DRAG_KEEPALIVE_MS);
  // B21：上报动画链 drag 档
  if (window.petChain) window.petChain.setDragging(true);
}

/** 清空拖动标志（不通知主进程）。 */
function clearDragState() {
  dragging = false;
  stopDragHeartbeat();
  document.body.style.cursor = 'grab';
  if (dragPointerId !== null) {
    try { document.body.releasePointerCapture(dragPointerId); } catch { /* 已隐式释放 */ }
    dragPointerId = null;
  }
  // B21：上报动画链结束 drag 档
  if (window.petChain) window.petChain.setDragging(false);
}

/** 拖动结束：清标志并通知主进程终止跟随（reason ∈ pointerup|pointercancel|lostcapture）。 */
function endDrag(reason) {
  if (!dragging) return;
  clearDragState();
  window.petAPI.dragEnd(reason);
}

window.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return; // 左键守卫（F1）：仅左键进入拖动 / 点击链；右键链唯一入口 = contextmenu
  beginDrag(e);
});
window.addEventListener('pointermove', (e) => {
  if (dragging) {
    // 自愈：pointerup 丢失（键已松开）——按既有的点击/拖动语义收尾，避免误触贴墙挣脱分支
    if (e.buttons === 0) {
      if (moved) endDrag('pointerup');
      else { clearDragState(); window.petAPI.clicked(); }
      return;
    }
    if (Math.abs(e.screenX - startX) + Math.abs(e.screenY - startY) > 5) moved = true;
    return;
  }
  // 伪取消的对称自愈：仍按住 + 命中点在窗口内 → 重新起拖（设计档 §2.2.4.1）
  if ((e.buttons & 1) !== 0 && isInteractivePoint(e.clientX, e.clientY)) beginDrag(e);
});
window.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return; // 左键守卫（F1）：仅左键走「点松收尾」（moved 分支不变）
  if (!dragging) return;
  // 点击 / 拖动判定沿用既有语义：屏幕坐标位移 > 5px 判为拖动
  if (moved) endDrag('pointerup');
  else { clearDragState(); window.petAPI.clicked(); }
  // 拖动结束：用松手时的命中点重算，恢复既有的动态穿透（设计档 §2.2.7）
  applyInteractivity(e.clientX, e.clientY);
});
window.addEventListener('pointercancel', () => endDrag('pointercancel'));
window.addEventListener('lostpointercapture', () => endDrag('lostcapture'));
window.petAPI.onDragCancel(() => clearDragState());
// 右键：在鲸鱼旁打开兑换窗口
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.petAPI.rightClicked();
});

window.petAPI.onSay((msg) => {
  bubble.textContent = msg;
  bubble.classList.add('show');
  setTimeout(() => bubble.classList.remove('show'), 4000);
});
window.petAPI.onState((s) => setState(s));

// Q 弹挤压（B20 / US-25，设计档 docs/design/PET-MOVEMENT.md §2.2.7）：落地撞击时在 #pet-squash 上
//   逐帧 scaleY（squashScale 曲线 + SQ_DURATION_MS 均取自 window.PetPhysicsCore——单一来源，不复制定义）；
//   reduce-motion 由 CSS 分支处置（U-9：不播放）。重入 ⇒ 重起一段（新撞击中断旧动画）。
const squashLayer = document.getElementById('pet-squash');
let squashRaf = 0;
function playSquash(depth) {
  if (!squashLayer || !window.PetPhysicsCore) return;
  if (squashRaf) cancelAnimationFrame(squashRaf);
  const duration = window.PetPhysicsCore.SQ_DURATION_MS;
  const scale = window.PetPhysicsCore.squashScale;
  const start = performance.now();
  const frame = (now) => {
    const u = Math.min(1, (now - start) / duration);
    squashLayer.style.transform = 'scaleY(' + scale(u, depth) + ')';
    if (u < 1) { squashRaf = requestAnimationFrame(frame); return; }
    squashLayer.style.transform = '';
    squashRaf = 0;
  };
  squashRaf = requestAnimationFrame(frame);
}
window.petAPI.onPhysicsSquash((depth) => playSquash(depth));
// 好感度：level / points / pointsToNext / progress(0~1)
window.petAPI.onAffinity((a) => {
  if (a && affinityFill && affinityLabel) {
    affinityFill.style.width = Math.round((a.progress || 0) * 100) + '%';
    affinityLabel.textContent = 'Lv.' + a.level + ' 好感 ' + a.points + '/' + a.pointsToNext;
  }
});

// 点击穿透只在 Windows 上可靠；Linux 上开启会导致整个桌宠点不到。
// 用 navigator.platform 判断（渲染进程里拿不到 process.platform）
const isWindows = /Win/i.test(navigator.platform || '');
// 渲染层自认为「当前命中点可交互」的状态——win32 穿透判定维护，拖动起止也要读它
let lastInteractive = false;

// Click-through: only the pet image and the visible bubble capture the mouse;
// the transparent surroundings pass clicks through to the desktop.
/** 命中矩形：视频通道 = 链按池内身体盒映射的矩形；PNG 通道 = 既有 img 矩形（设计档 §2.2.6 / DD-10）。 */
function hitRect() {
  const chain = window.petChain;
  if (chain && chain.videoActive()) {
    const r = chain.hitRect();
    if (r) return { left: r.left, top: r.top, right: r.left + r.w, bottom: r.top + r.h };
  }
  const b = img.getBoundingClientRect();
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
}

function isInteractivePoint(x, y) {
  const r = hitRect();
  if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  if (bubble.classList.contains('show')) {
    const br = bubble.getBoundingClientRect();
    if (x >= br.left && x <= br.right && y >= br.top && y <= br.bottom) return true;
  }
  return false;
}

/** 按命中点应用穿透状态（仅 win32 生效；主进程侧另有平台判定）。 */
function applyInteractivity(x, y) {
  if (!isWindows) return;
  const interactive = isInteractivePoint(x, y);
  if (interactive === lastInteractive) return;
  lastInteractive = interactive;
  window.petAPI.setIgnoreMouse(!interactive);
}

if (isWindows) {
  window.addEventListener('mousemove', (e) => {
    if (dragging) return;   // 拖动期间不切换穿透（根因 A 的渲染层守卫）
    applyInteractivity(e.clientX, e.clientY);
  });
  window.addEventListener('mouseleave', () => {
    if (dragging) return;   // 拖动期间不切换穿透（根因 A 的渲染层守卫）
    if (lastInteractive) {
      lastInteractive = false;
      window.petAPI.setIgnoreMouse(false);
    }
  });
}

setState('idle');
