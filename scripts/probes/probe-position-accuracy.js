'use strict';
/**
 * probe-position-accuracy.js — setPosition / setBounds 在双屏各自是否位置精确（B15；设计档 docs/design/PET-MULTIMONITOR.md §2.2）。
 * Probe 7: is setPosition()/setBounds() position-accurate on BOTH screens?
 * Hypothesis for "capture point drifts after crossing and coming back":
 * the readback position may differ from the requested one, per-screen — the re-anchor
 * (grabOffset = cursor - getPosition()) would then bake that error in on every crossing.
 * 跑法：npx electron scripts/probes/probe-position-accuracy.js
 */
const { app, screen, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('window-all-closed', () => {});

async function main() {
  const all = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const others = all.filter((d) => d.id !== primary.id);
  const w = new BrowserWindow({ width: 250, height: 270, show: false, frame: false, resizable: false });
  await sleep(700);

  const centerOf = (d) => ({
    x: Math.round(d.bounds.x + d.bounds.width / 2 - 125),
    y: Math.round(d.bounds.y + d.bounds.height / 2 - 135),
  });

  console.log('=== A. setPosition 精度（同一屏上请求 vs 读回）===');
  for (const d of all) {
    const c = centerOf(d);
    w.setBounds({ x: c.x, y: c.y, width: 250, height: 270 });
    await sleep(400);
    for (const probe of [
      { x: c.x, y: c.y },
      { x: c.x + 37, y: c.y + 23 },
      { x: c.x + 61, y: c.y + 47 },
    ]) {
      w.setPosition(probe.x, probe.y);
      await sleep(120);
      const got = w.getPosition();
      const ex = got[0] - probe.x, ey = got[1] - probe.y;
      console.log(`  屏 ${d.id === primary.id ? '主屏' : '副屏'}(SF ${d.scaleFactor})  请求(${probe.x},${probe.y}) → 读回(${got[0]},${got[1]})  误差=(${ex},${ey})`);
    }
  }

  console.log('\n=== B. 往返可逆性（同一请求值，A→B→A 后是否回到同一读回）===');
  const A = primary, B = others[0];
  const trace = [];
  for (const d of [A, B, A, B, A]) {
    const c = centerOf(d);
    const req = { x: c.x + 11, y: c.y + 13 };   // 每屏用"屏内相对同一点"
    w.setBounds({ x: req.x, y: req.y, width: 250, height: 270 });
    await sleep(400);
    const got = w.getBounds();
    trace.push({ d: d.id === primary.id ? '主屏' : '副屏', sf: d.scaleFactor, req, got: [got.x, got.y], size: [got.width, got.height] });
    console.log(`  → ${d.id === primary.id ? '主屏' : '副屏'}(SF ${d.scaleFactor}) 请求(${req.x},${req.y}) 读回(${got.x},${got.y}) size=(${got.width},${got.height})`);
  }

  console.log('\n=== C. 同屏两次往返（严格可逆性：回到 A 屏两次，读回是否一致）===');
  const aTrace = trace.filter((t) => t.d === '主屏');
  console.log(`  主屏读回序列: ${aTrace.map((t) => `(${t.got})`).join(' → ')}`);
  console.log(`  size 序列  : ${aTrace.map((t) => `(${t.size})`).join(' → ')}`);

  console.log('\n=== 判读 ===');
  console.log('  A 组若误差恒为 0        ==> 位置 API 精确，用户看到的偏移另有原因');
  console.log('  A 组若两屏误差不同      ==> 位置面坐标空间不一致（E6 位置面被证伪）⇒ 重锚会累积该误差');
  console.log('  C 组若主屏读回不一致    ==> 往返不可逆，即用户报告的"回来时偏移"');

  w.destroy();
  app.quit();
}

app.whenReady().then(main);
