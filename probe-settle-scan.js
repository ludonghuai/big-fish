// Probe 5: replay the pet's drop-correction math (petSettlePos) verbatim across
// every height on the primary screen. Answers: "at which y does she get bounced,
// and to where?" — the exact question the user reports.
// Run: npx electron probe-settle-scan.js
'use strict';
const { app, screen } = require('electron');

// ---- 逐字复现 main.js 的纯函数（PET_SIZE_DIP / petWorkAreaBounds / petIsVisible /
//      petNearestVisiblePos / petMixedScaleOverlap / petStraddleFix / petSettlePos）----
const PET_SIZE_DIP = { w: 250, h: 270 };
const petDisplayOf = (p) => screen.getDisplayNearestPoint({ x: p[0], y: p[1] });

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

function petIsVisible(pos) {
  if (!pos) return false;
  const cx = pos[0] + PET_SIZE_DIP.w / 2;
  const cy = pos[1] + PET_SIZE_DIP.h / 2;
  return screen.getAllDisplays().some((display) => {
    const wa = display.workArea;
    return cx >= wa.x && cx < wa.x + wa.width && cy >= wa.y && cy < wa.y + wa.height;
  });
}

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

function petMixedScaleOverlap(pos, display) {
  if (!pos || !display || !display.bounds) return false;
  return screen.getAllDisplays().some((d) => {
    if (!d || !d.bounds || d.id === display.id || d.scaleFactor === display.scaleFactor) return false;
    const b = d.bounds;
    return pos[0] < b.x + b.width && pos[0] + PET_SIZE_DIP.w > b.x
      && pos[1] < b.y + b.height && pos[1] + PET_SIZE_DIP.h > b.y;
  });
}

function petStraddleFix(pos) {
  if (!pos) return null;
  const center = [pos[0] + PET_SIZE_DIP.w / 2, pos[1] + PET_SIZE_DIP.h / 2];
  const display = petDisplayOf(center);
  if (!display) return pos;
  if (pos[0] >= display.bounds.x && pos[0] + PET_SIZE_DIP.w <= display.bounds.x + display.bounds.width
    && pos[1] >= display.bounds.y && pos[1] + PET_SIZE_DIP.h <= display.bounds.y + display.bounds.height) return pos;
  if (!petMixedScaleOverlap(pos, display)) return pos;
  const b = display.bounds;
  return [
    Math.round(Math.min(Math.max(pos[0], b.x), b.x + b.width - PET_SIZE_DIP.w)),
    Math.round(Math.min(Math.max(pos[1], b.y), b.y + b.height - PET_SIZE_DIP.h)),
  ];
}

function petSettlePos(pos) {
  if (!pos) return { pos: null, kind: 'none' };
  let out = pos, kind = 'none';
  const visible = petNearestVisiblePos(out);
  if (visible && (visible[0] !== out[0] || visible[1] !== out[1])) { out = visible; kind = 'visible'; }
  const straddle = petStraddleFix(out);
  if (straddle && (straddle[0] !== out[0] || straddle[1] !== out[1])) { out = straddle; kind = 'straddle'; }
  return { pos: out, kind };
}
// ---------------------------------------------------------------------------

app.on('window-all-closed', () => {});
app.whenReady().then(() => {
  const p = screen.getPrimaryDisplay();
  const wa = p.workArea;
  console.log(`主屏 bounds = ${JSON.stringify(p.bounds)}`);
  console.log(`主屏 workArea = ${JSON.stringify(wa)}  (SF ${p.scaleFactor})`);
  console.log(`窗口 ${PET_SIZE_DIP.w}×${PET_SIZE_DIP.h}`);
  console.log(`⇒ petWorkAreaBounds: y ∈ [${wa.y}, ${wa.y + wa.height - PET_SIZE_DIP.h}]`);
  console.log('');

  const cx = Math.round(wa.x + wa.width / 2 - PET_SIZE_DIP.w / 2);
  console.log(`=== 在主屏中部 (x=${cx}) 沿高度扫描：松手时她会不会被"弹" ===`);
  console.log('  y(窗口)   她的脚(y+244)  屏高占比   结果');
  let bounced = 0;
  for (let y = 0; y + PET_SIZE_DIP.h <= p.bounds.y + p.bounds.height + 60; y += 10) {
    const pos = [cx, y];
    const r = petSettlePos(pos);
    const changed = r.pos[0] !== pos[0] || r.pos[1] !== pos[1];
    if (changed) bounced++;
    const foot = y + 244;
    const pct = Math.round((foot / p.bounds.height) * 100);
    if (changed) {
      console.log(`  y=${String(y).padStart(3)}   脚=${String(foot).padStart(3)}      ${String(pct).padStart(3)}%     ★被弹到 ${JSON.stringify(r.pos)} (kind=${r.kind})`);
    } else if (y % 50 === 0) {
      console.log(`  y=${String(y).padStart(3)}   脚=${String(foot).padStart(3)}      ${String(pct).padStart(3)}%     不变`);
    }
  }
  console.log(`\n被弹的高度数 = ${bounced}`);

  console.log('\n=== 判读 ===');
  console.log('  若「不变」一直到很高才出现 ==> 校正没问题，用户的"弹回"另有原因');
  console.log('  若 y 在某个值以上就被弹 ==> 该处即"空气墙"，与 petWorkAreaBounds.maxY 对照');

  app.quit();
});
