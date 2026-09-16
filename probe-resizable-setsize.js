// Probe 6: does `resizable: false` block setSize()?
// The log shows `size-from === size-to` on every geom-fix row => setSize appears to be a no-op.
// This compares a resizable:false window against a resizable:true one under identical steps.
// Run: npx electron probe-resizable-setsize.js
'use strict';
const { app, screen, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('window-all-closed', () => { /* keep alive */ });

async function trial(label, opts) {
  const w = new BrowserWindow({ width: 250, height: 270, show: false, frame: false, ...opts });
  await sleep(500);
  const p = screen.getPrimaryDisplay();
  const cx = Math.round(p.workArea.x + p.workArea.width / 2 - 125);
  const cy = Math.round(p.workArea.y + 100);

  console.log(`\n=== ${label} ===`);
  console.log(`  刚建窗        : size=${JSON.stringify(w.getSize())} resizable=${w.isResizable()}`);
  w.setBounds({ x: cx, y: cy, width: 250, height: 270 });
  await sleep(300);
  console.log(`  setBounds 后  : size=${JSON.stringify(w.getSize())}`);

  // 故意把它弄坏，再试着用 setSize 拉回来
  w.setSize(400, 430);
  await sleep(200);
  const broken = w.getSize();
  console.log(`  setSize(400,430) 后 : size=${JSON.stringify(broken)}  ${broken[0] === 400 ? '（生效）' : '（★未生效）'}`);

  w.setSize(250, 270);
  await sleep(200);
  const fixed = w.getSize();
  console.log(`  setSize(250,270) 后 : size=${JSON.stringify(fixed)}  ${fixed[0] === 250 ? '（生效）' : '（★未生效）'}`);

  // 再测 setBounds 能否改尺寸（另一条路径）
  w.setBounds({ x: cx, y: cy, width: 250, height: 270 });
  await sleep(200);
  const viaBounds = w.getSize();
  console.log(`  setBounds(250,270) 后: size=${JSON.stringify(viaBounds)}  ${viaBounds[0] === 250 ? '（生效）' : '（★未生效）'}`);

  w.destroy();
  await sleep(200);
}

async function main() {
  await trial('A · resizable: false（= 现行桌宠窗口）', { resizable: false });
  await trial('B · resizable: true （对照组）', { resizable: true });

  console.log('\n=== 判读 ===');
  console.log('  A 组「★未生效」而 B 组生效  ==> resizable:false 就是 setSize 失效的原因（改窗口选项即可）');
  console.log('  两组都生效                  ==> 另有原因，须继续查');
  app.quit();
}

app.whenReady().then(main);
