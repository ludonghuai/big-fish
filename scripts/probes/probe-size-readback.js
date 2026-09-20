'use strict';
/**
 * probe-size-readback.js — setSize / setBounds 后立即 getSize 在混合 DPI 屏是否稳定（B15；设计档 docs/design/PET-MULTIMONITOR.md §2.2）。
 * Probe 3: is getSize() immediately after setSize/setBounds STABLE across mixed-DPI screens?
 * This tests the hypothesis behind the "size flickers / drag gets sluggish" report.
 * 跑法：npx electron scripts/probes/probe-size-readback.js
 */
const { app, screen, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('window-all-closed', () => { /* keep alive */ });

async function main() {
  const all = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const secondary = all.find((d) => d.id !== primary.id);
  if (!secondary) { console.log('need 2+ displays'); app.quit(); return; }

  const tag = (d) => (d.id === primary.id ? `主屏(SF ${d.scaleFactor})` : `副屏(SF ${d.scaleFactor})`);
  const w = new BrowserWindow({ width: 250, height: 270, show: false, frame: false });
  await sleep(700);

  const c = (d) => ({
    x: Math.round(d.bounds.x + d.bounds.width / 2 - 125),
    y: Math.round(d.bounds.y + d.bounds.height / 2 - 135),
  });

  // 副 ↔ 主 来回四趟（模拟用户反复拖过交界）
  for (const d of [secondary, primary, secondary, primary]) {
    const p = c(d);
    w.setBounds({ x: p.x, y: p.y, width: 250, height: 270 });
    console.log(`\n=== 移到 ${tag(d)} ===`);
    console.log(`  setBounds 后立即 : ${JSON.stringify(w.getSize())}`);
    for (const t of [16, 50, 150, 500]) {
      await sleep(t);
      console.log(`  +${String(t).padStart(3)}ms          : ${JSON.stringify(w.getSize())}`);
    }
    console.log('  --- setSize(250,270) 后（= 我们代码的做法）---');
    w.setSize(250, 270);
    console.log(`  立即             : ${JSON.stringify(w.getSize())}   <== 锚点取的就是这个值`);
    for (const t of [16, 50, 150, 500]) {
      await sleep(t);
      console.log(`  +${String(t).padStart(3)}ms          : ${JSON.stringify(w.getSize())}`);
    }
  }

  console.log('\n=== 判读 ===');
  console.log('  若「立即」与「+150ms」不同  ==> 立即读回是过渡值，锚点会被写错（假设成立）');
  console.log('  若全程都相同               ==> 假设不成立，另找原因');

  w.destroy();
  app.quit();
}

app.whenReady().then(main);
