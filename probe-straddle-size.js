// Probe 4: is setSize(250,270) RELIABLE when the window straddles the boundary
// between two different-DPI screens? (The design forbids writing size while straddling —
// this probe tests whether that ban is actually necessary on this machine.)
// Run: npx electron probe-straddle-size.js
'use strict';
const { app, screen, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('window-all-closed', () => { /* keep alive */ });

async function main() {
  const all = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const secondary = all.find((d) => d.id !== primary.id);
  if (!secondary) { console.log('need 2+ displays'); app.quit(); return; }

  // 交界 x：主屏右边界 vs 副屏左边界
  const pR = primary.bounds.x + primary.bounds.width;
  const sL = secondary.bounds.x;
  console.log(`主屏 bounds=${JSON.stringify(primary.bounds)} (SF ${primary.scaleFactor})`);
  console.log(`副屏 bounds=${JSON.stringify(secondary.bounds)} (SF ${secondary.scaleFactor})`);
  console.log(`交界：主屏右=${pR}  副屏左=${sL}`);

  const w = new BrowserWindow({ width: 250, height: 270, show: false, frame: false });
  await sleep(700);

  // 把窗口精确摆在交界上（各占一半）：窗口左上 x = 交界 - 125
  const seamX = Math.min(pR, sL) === pR ? pR : sL; // 取交界坐标
  const straddleX = Math.round(seamX - 125);
  const y = Math.round(primary.bounds.y + primary.bounds.height / 2 - 135);

  console.log(`\n=== 窗口骑线摆放：x=${straddleX} y=${y}（宽 250，跨在 ${seamX} 上）===`);
  w.setBounds({ x: straddleX, y, width: 250, height: 270 });
  await sleep(700);
  console.log(`  骑线就位后 getSize() = ${JSON.stringify(w.getSize())}`);
  console.log(`  getBounds()          = ${JSON.stringify(w.getBounds())}`);

  console.log('\n=== 在骑线状态下 setSize(250,270) — 设计禁止的做法 ===');
  for (let i = 1; i <= 3; i++) {
    w.setSize(250, 270);
    const imm = w.getSize();
    await sleep(300);
    const later = w.getSize();
    console.log(`  第 ${i} 次: 立即=${JSON.stringify(imm)}  300ms后=${JSON.stringify(later)}  ${imm[0] === later[0] && imm[1] === later[1] ? '稳定' : '★变化'}`);
  }

  console.log('\n=== 对照：同屏内（主屏中央）setSize 三次 ===');
  const cx = Math.round(primary.bounds.x + primary.bounds.width / 2 - 125);
  w.setBounds({ x: cx, y, width: 250, height: 270 });
  await sleep(700);
  for (let i = 1; i <= 3; i++) {
    w.setSize(250, 270);
    const imm = w.getSize();
    await sleep(300);
    const later = w.getSize();
    console.log(`  第 ${i} 次: 立即=${JSON.stringify(imm)}  300ms后=${JSON.stringify(later)}  ${imm[0] === later[0] && imm[1] === later[1] ? '稳定' : '★变化'}`);
  }

  console.log('\n=== 判读 ===');
  console.log('  骑线时三次都稳定且 == 同屏内值  ==> 骑线写入其实是可靠的（禁令可放宽，窗口期可消除）');
  console.log('  骑线时出现 ★变化 / 值不同       ==> 禁令有必要，须另想办法缩短窗口期');

  w.destroy();
  app.quit();
}

app.whenReady().then(main);
