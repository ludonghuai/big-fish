'use strict';
/**
 * probe-pet-media.js — 桌宠视频通道开发期探针（B18；设计档 docs/design/PET-ANIMATION.md §3.3 手段 2 / §2.5 观察项 O5）。
 *
 * 用途（O5 取证 + §2.2.6 常量校准）：
 *   ① 透明窗内 VP9-alpha 合成：窗口级像素采样——素材透明区 alpha = 0（非黑底）、身体区 alpha > 0；
 *   ② `file://` 页面相对路径 `<video>` 加载：readyState / videoWidth / videoHeight / error / 播放推进；
 *   ③ 首帧 alpha 包围盒（解码级，canvas 采样）→ 校准 pet-chain-core.js 的 PET_MEDIA_BODY；
 *   ④ `<video class="pet-media">` 元素计数（NFR-10 的「恒 2」判据）+ 双通道命中矩形（§2.2.6）；
 *   ⑤ reduce 模式计算样式（AC10 四项；`--reduce` 经 CDP Emulation.setEmulatedMedia 模拟）。
 * 跑法：npx electron probe-pet-media.js [--reduce] [--durations]
 *   `--durations` = 逐段时长清单（池设计取证：段时长决定链的换段频率）。
 * 说明：探针自建同配置透明窗（transparent / frame:false / sandbox:true / pet-preload.js，与 shell-pet.js 建窗同源），
 *   不改产品代码、不写任何文件；`--allow-file-access-from-files` 仅为 canvas 取帧诊断（不属产品配置）。
 * 不入包（docs/CONVENTIONS.md §八）。
 */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const core = require('./pet-chain-core.js');

// canvas 取帧（getImageData）对 file:// 视频需要该开关；仅探针使用，产品不启用。
app.commandLine.appendSwitch('allow-file-access-from-files');
// 隔离 userData（与主进程 main.js 的 BIGFISH_USER_DATA 开发钩子同口径）——链日志落在该目录下。
if (process.env.BIGFISH_USER_DATA && process.env.BIGFISH_USER_DATA.trim() !== '') {
  try { app.setPath('userData', process.env.BIGFISH_USER_DATA.trim()); } catch { /* 路径非法则用默认 */ }
}

const ROOT = __dirname;
const WEBM_DIR = path.join(ROOT, 'assets', 'pet-anim', 'webm');
const POOL_PATH = path.join(ROOT, 'assets', 'pet-anim', 'pool.json');
const REDUCE = process.argv.includes('--reduce');
const DURATIONS = process.argv.includes('--durations');
const CHAIN = (() => { const i = process.argv.indexOf('--chain'); return i < 0 ? 0 : Number(process.argv[i + 1] || 20); })();
const TRIGGER = process.argv.includes('--trigger');
const STATE = (() => { const i = process.argv.indexOf('--state'); return i < 0 ? null : process.argv[i + 1]; })();
const ENTRY = process.argv.includes('--entry');

/** 主进程侧的文件探针（core 零 fs ⇒ 由调用方注入）。 */
function poolProbe(rel) {
  try {
    const st = fs.statSync(path.join(ROOT, rel));
    return { exists: true, size: st.size };
  } catch { return { exists: false, size: 0 }; }
}

/** 取样本片段：优先池内首个 idle 段；池不可用（缺失 / 非法）时退回目录首个 webm。 */
function pickSample() {
  let pool = null;
  try {
    const r = core.parsePool(fs.readFileSync(POOL_PATH, 'utf8'), poolProbe);
    if (r.ok) pool = r.pool;
  } catch { /* 池尚未产出（探针先行时属正常） */ }
  if (pool) return { pool, src: pool.src[pool.idle[0]], name: pool.idle[0] };
  const f = fs.readdirSync(WEBM_DIR).filter((n) => n.endsWith('.webm')).sort()[0];
  const name = f.slice(0, -'.webm'.length);
  return { pool: null, src: core.segSrc('assets/pet-anim/webm', name, '.webm'), name };
}

/** 逐段时长清单（串行：每次只挂一个 <video>，避免同时解码）。 */
async function durations(wc, names) {
  const out = await wc.executeJavaScript(`(async () => {
    const names = ${JSON.stringify(names)};
    const v = document.getElementById('probe-video');
    const res = [];
    for (const n of names) {
      v.src = 'assets/pet-anim/webm/' + encodeURIComponent(n) + '.webm';
      v.load();
      const dur = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), 6000);
        v.addEventListener('loadedmetadata', () => { clearTimeout(t); resolve(v.duration); }, { once: true });
        v.addEventListener('error', () => { clearTimeout(t); resolve(null); }, { once: true });
      });
      res.push([n, dur]);
    }
    return res;
  })()`);
  let sum = 0;
  let n = 0;
  for (const [name, dur] of out) {
    if (typeof dur === 'number' && isFinite(dur)) { sum += dur; n += 1; }
    console.log(`  ${name} dur=${dur === null ? 'n/a' : dur.toFixed(2) + 's'}`);
  }
  console.log(`[probe] durations: n=${n} total=${sum.toFixed(1)}s avg=${n ? (sum / n).toFixed(2) : 'n/a'}s`);
}

/**
 * 窗口级像素读（capturePage 位图 = BGRA，尺寸为**物理像素** = DIP × scaleFactor）。
 * O5 判据：视频区「身体之外」的像素 alpha ≈ 0（= 窗口透明背景，非黑底）；身体区 alpha = 255（视频层确在画面内）。
 */
function readWindowAlpha(shot, sf) {
  const bmp = shot.getBitmap();
  const { width: w, height: h } = shot.getSize();
  const at = (dx, dy) => {
    const x = Math.min(w - 1, Math.round(dx * sf));
    const y = Math.min(h - 1, Math.round(dy * sf));
    const i = (y * w + x) * 4;
    return [bmp[i + 2], bmp[i + 1], bmp[i], bmp[i + 3]]; // RGB + A（DIP 入参）
  };
  const outside = [at(2, 2), at(637, 2), at(2, 357), at(637, 357), at(620, 180)];
  const inside = [at(320, 200), at(320, 100), at(320, 300)];
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1;
  let maxY = -1;
  let n = 0;
  for (let y = 0; y < 360; y += 2) {
    for (let x = 0; x < 640; x += 2) {
      if (at(x, y)[3] > 8) {
        n += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    w, h, sf,
    videoOutside: outside,
    videoOutsideMaxAlpha: Math.max(...outside.map((p) => p[3])),
    videoOutsideAnyBlackOpaque: outside.some((p) => p[3] > 200 && p[0] + p[1] + p[2] < 24),
    videoInside: inside,
    opaqueN: n,
    bbox: { minX, minY, maxX, maxY },
  };
}

/**
 * `--chain <秒>` 驱动模式：经**真实** shell-pet.js 通路起桌宠窗（不启后端 / 主窗 / 托盘），跑链后回读 pet-anim.log。
 *   `--trigger` = 每 12 s 走一次真实点击链（handlePetClicked：happy 档 + 1.6 s 回 idle）——AC6 取证；
 *   `--state <名>` = 启动 2 s 后下发一次指定语义档位（walk-* / run-* / events 档）——AC8 ② 取证。
 */
async function runChain(sec) {
  const settings = require('./shell-settings.js');
  const geometry = require('./shell-pet-geometry.js');
  const drag = require('./shell-pet-drag.js');
  const pet = require('./shell-pet.js');
  settings.loadSettings();
  geometry.init({ getPetWindow: pet.getPetWindow, getPetDrag: drag.getPetDrag });
  drag.init({ getPetWindow: pet.getPetWindow, pet });
  pet.init({ showMainWindow: () => {}, openExchangeWindow: () => {}, broadcastAffinity: () => {} });
  pet.createPetWindow(geometry.petResolveStartPos());
  pet.scheduleWander();
  const timers = [];
  const memOf = () => {
    const m = app.getAppMetrics().filter((x) => x.type === 'Tab' || x.type === 'Renderer').map((x) => x.memory.workingSetSize);
    return m.length ? Math.max(...m) : 0;
  };
  await new Promise((r) => setTimeout(r, 3000));
  const mem0 = memOf();
  // `--entry`：「两帧皆空」探测器（US-16）——首次入场完成后注入，跨 PNG↔视频往返采样
  let entryWin = null;
  if (ENTRY) {
    entryWin = pet.getPetWindow();
    await entryWin.webContents.executeJavaScript(`(() => {
      window.__blank = { n: 0, png: 0, vid: 0 };
      window.__blankTimer = setInterval(() => {
        const img = document.getElementById('pet');
        const front = document.querySelector('video.pet-media.is-front');
        const png = !!img && getComputedStyle(img).display !== 'none';
        if (png) window.__blank.png += 1;
        if (front) window.__blank.vid += 1;
        if (!png && !front) window.__blank.n += 1;
      }, 10);
      return 0;
    })()`);
  }
  if (STATE) timers.push(setTimeout(() => pet.setPetState(STATE), 2000));
  if (TRIGGER) timers.push(setInterval(() => pet.handlePetClicked(), 12000));
  await new Promise((r) => setTimeout(r, Math.max(0, sec - 3) * 1000));
  const mem1 = memOf();
  for (const t of timers) { clearTimeout(t); clearInterval(t); }
  console.log(`[probe] renderer workingSetSize：首帧=${mem0}KB 结束=${mem1}KB 增幅=${mem1 - mem0}KB（NFR-10 阈值 51200KB）`);
  const domFacts = await pet.getPetWindow().webContents.executeJavaScript(`(() => {
    const v = document.querySelector('video.pet-media.is-front');
    const stage = document.getElementById('pet-stage');
    return {
      frontClass: v ? v.className : null,
      transform: v ? v.style.transform : null,
      src: v && v.currentSrc ? decodeURIComponent(v.currentSrc.split('/').pop()) : null,
      stageDisplay: stage ? getComputedStyle(stage).display : null,
      petDisplay: getComputedStyle(document.getElementById('pet')).display,
    };
  })()`);
  console.log(`[probe] 前台渲染位读数：${JSON.stringify(domFacts)}`);
  if (entryWin) {
    const s = await entryWin.webContents.executeJavaScript('(() => { clearInterval(window.__blankTimer); return window.__blank; })()');
    console.log(`[probe] 入场窗口采样：blank=${s.n} pngVisible=${s.png} videoFront=${s.vid}（10 ms 采样；blank=0 且两相位均 > 0 = 检测有效且未出现空白）`);
  }
  const logPath = path.join(app.getPath('userData'), 'pet-anim.log');
  const lines = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').trim().split('\n') : [];
  console.log(`[probe] chain 驱动 ${sec}s 完成；pet-anim.log = ${logPath}（${lines.length} 行）`);
  for (const l of lines) console.log('  ' + l);
  const count = (k) => lines.filter((l) => l.includes('anim ' + k + ' ')).length;
  console.log(`[probe] 行数统计：pool=${count('pool')} chain=${count('chain')} switch=${count('switch')} ended=${count('ended')} slot=${count('slot')} slot-miss=${count('slot-miss')} play-fail=${count('play-fail')} fallback=${count('fallback')} move-req=${count('move-req')}`);
}

app.whenReady().then(async () => {
  if (CHAIN > 0) {
    await runChain(CHAIN);
    app.exit(0);
    return;
  }
  const sample = pickSample();
  console.log(`[probe] sample = ${sample.name} / src = ${sample.src} / pool = ${sample.pool ? 'valid' : 'unavailable'}`);

  const win = new BrowserWindow({
    width: 660,
    height: 380,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(ROOT, 'pet-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.join(ROOT, 'pet.html'));
  const wc = win.webContents;

  // reduce 模拟（AC10）：CDP 的媒体特性仿真 ⇒ 页面 matchMedia 与 CSS @media 同时命中
  if (REDUCE) {
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
  }

  // 注入一个全尺寸视频（640×360 @ (0,0)）——探针自持，不依赖页面是否已含媒体盒
  const loaded = await wc.executeJavaScript(`(() => new Promise((resolve) => {
    const v = document.createElement('video');
    v.id = 'probe-video';
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.style.cssText = 'position:absolute;left:0;top:0;width:640px;height:360px';
    document.body.appendChild(v);
    const done = (phase) => resolve({ phase, readyState: v.readyState, w: v.videoWidth, h: v.videoHeight, err: v.error ? v.error.code : null });
    v.addEventListener('loadeddata', () => done('loadeddata'), { once: true });
    v.addEventListener('error', () => done('error'), { once: true });
    setTimeout(() => done('timeout'), 8000);
    v.src = ${JSON.stringify(sample.src)};
  }))()`);
  console.log(`[probe] video load: phase=${loaded.phase} readyState=${loaded.readyState} ${loaded.w}x${loaded.h} err=${loaded.err}`);

  const frame = await wc.executeJavaScript(`(() => {
    const v = document.getElementById('probe-video');
    const c = document.createElement('canvas');
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 360;
    const g = c.getContext('2d');
    g.drawImage(v, 0, 0);
    let d; try { d = g.getImageData(0, 0, c.width, c.height).data; } catch (e) { return { error: String(e) }; }
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, opaque = 0, semi = 0, darkOpaque = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4, a = d[i + 3];
        if (a > 8) {
          opaque++;
          if (d[i] + d[i + 1] + d[i + 2] < 24) darkOpaque++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        } else if (a > 0) semi++;
      }
    }
    const at = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    return { w: c.width, h: c.height, bbox: { minX, minY, maxX, maxY }, opaque, semi, darkOpaque, corner: at(2, 2), center: at(320, 200), foot: at(320, 330) };
  })()`);
  if (frame.error) console.log(`[probe] frame(canvas) 读失败：${frame.error}（窗口级采样仍有效）`);
  else {
    console.log(`[probe] frame(canvas ${frame.w}x${frame.h}) alpha bbox = x[${frame.bbox.minX},${frame.bbox.maxX}] y[${frame.bbox.minY},${frame.bbox.maxY}]`);
    console.log(`[probe] frame alpha: opaque(>8)=${frame.opaque} semi=${frame.semi} darkOpaque=${frame.darkOpaque} px`);
    console.log(`[probe] px(2,2)=${JSON.stringify(frame.corner)} px(320,200)=${JSON.stringify(frame.center)} px(320,330)=${JSON.stringify(frame.foot)}`);
  }

  // 播放推进（证明可播）：1 s 后 currentTime > 0
  const played = await wc.executeJavaScript(`(async () => {
    const v = document.getElementById('probe-video');
    const ok = await v.play().then(() => true).catch((e) => String(e));
    await new Promise((r) => setTimeout(r, 1000));
    return { play: ok, currentTime: v.currentTime, paused: v.paused };
  })()`);
  console.log(`[probe] play: ok=${played.play} t=${Number(played.currentTime).toFixed(2)}s paused=${played.paused}`);

  await new Promise((r) => setTimeout(r, 300));
  const shot = await wc.capturePage();
  const sf = shot.getSize().width / 660; // capturePage 位图 = 物理像素 ⇒ 由窗口 DIP 宽反推 scaleFactor
  const winAlpha = readWindowAlpha(shot, sf);
  console.log(`[probe] window alpha(${winAlpha.w}x${winAlpha.h} px, sf=${sf.toFixed(4)}):`);
  console.log(`  视频区外侧采样（DIP 4 角 + 右侧中部）=${JSON.stringify(winAlpha.videoOutside)} 最大 alpha=${winAlpha.videoOutsideMaxAlpha} 黑底不透明=${winAlpha.videoOutsideAnyBlackOpaque}`);
  console.log(`  身体区采样（DIP (320,100)/(320,200)/(320,300)）=${JSON.stringify(winAlpha.videoInside)}`);
  console.log(`  全窗不透明像素(2px 步长)=${winAlpha.opaqueN} bbox(DIP)=x[${winAlpha.bbox.minX},${winAlpha.bbox.maxX}] y[${winAlpha.bbox.minY},${winAlpha.bbox.maxY}]`);

  // 媒体盒 + 双通道命中矩形（§2.2.6）+ <video> 计数（NFR-10）
  const box = core.mediaBox({
    canvas: core.PET_MEDIA_CANVAS, body: core.PET_MEDIA_BODY,
    targetH: core.PET_BODY_TARGET_H, feetY: core.PET_FEET_Y,
  });
  console.log(`[probe] mediaBox: scale=${box.scale.toFixed(5)} box=(${box.left.toFixed(1)}, ${box.top.toFixed(1)}, ${box.w.toFixed(1)}, ${box.h.toFixed(1)})`);
  console.log(`[probe] hit(视频身体盒)=(${box.hit.left.toFixed(1)}, ${box.hit.top.toFixed(1)}, ${box.hit.w.toFixed(1)}, ${box.hit.h.toFixed(1)}) 媒体盒下沿=${(box.top + box.h).toFixed(1)}`);
  const dom = await wc.executeJavaScript(`(() => {
    const media = document.querySelectorAll('video.pet-media');
    const img = document.getElementById('pet');
    const r = img ? img.getBoundingClientRect() : null;
    const stage = document.getElementById('pet-stage');
    const bubble = document.getElementById('bubble');
    const q = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
    const oldShow = bubble ? bubble.classList.contains('show') : false;
    if (bubble) bubble.classList.add('show');
    const styles = {
      reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
      mediaTransition: q('.pet-media', 'transitionDuration'),
      bobAnimation: q('#pet.animate-bob', 'animationName'),
      bubbleAnimation: q('#bubble.show', 'animationName'),
      affinityTransition: q('#affinity-fill', 'transitionDuration'),
    };
    if (bubble && !oldShow) bubble.classList.remove('show');
    return {
      petMedia: media.length, videos: document.querySelectorAll('video').length, hasStage: !!stage,
      pngRect: r ? { left: +r.left.toFixed(1), top: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : null,
      styles,
    };
  })()`);
  console.log(`[probe] DOM: video.pet-media=${dom.petMedia} video(all)=${dom.videos} #pet-stage 在场=${dom.hasStage} #pet rect=${JSON.stringify(dom.pngRect)}`);
  console.log(`[probe] reduce 计算样式：${JSON.stringify(dom.styles)}`);
  console.log(`[probe] renderer memory = ${JSON.stringify(app.getAppMetrics().filter((m) => m.type === 'Tab' || m.type === 'Renderer').map((m) => ({ type: m.type, workingSetSize: m.memory.workingSetSize })))}`);

  if (DURATIONS) {
    const names = sample.pool ? [...new Set([...sample.pool.idle, ...sample.pool.turn, ...sample.pool.moves.walk, ...sample.pool.moves.run, ...sample.pool.categories.flatMap((c) => c.actions), ...Object.values(sample.pool.events).flat()])] : [];
    console.log(`[probe] durations（池内 ${names.length} 段）:`);
    await durations(wc, names);
  }

  const o5 = loaded.phase === 'loadeddata' && loaded.w === core.PET_MEDIA_CANVAS.w && loaded.h === core.PET_MEDIA_CANVAS.h
    && winAlpha.videoOutsideMaxAlpha <= 8 && !winAlpha.videoOutsideAnyBlackOpaque && played.currentTime > 0;
  console.log(`[probe] VERDICT O5 = ${o5 ? 'pass' : 'fail'}（file:// 相对路径加载 + 640×360 + 透明区 alpha≈0（非黑底）+ 播放推进）`);
  win.destroy();
  app.exit(o5 ? 0 : 1);
}).catch((err) => {
  console.error('[probe] fatal:', err);
  app.exit(2);
});
