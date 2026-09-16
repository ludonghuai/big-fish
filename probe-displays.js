// Diagnostic probe: display geometry + BrowserWindow size/position coordinate space.
// Purpose: settle the E6 question — are setSize/getSize/getPosition in DIP or physical pixels?
// Run: npx electron probe-displays.js
'use strict';
const { app, screen, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  console.log('');
  console.log('=== [1] Displays (Electron view) ===');
  const all = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  for (const d of all) {
    console.log(`  id=${d.id}  scaleFactor=${d.scaleFactor}`);
    console.log(`     bounds   = ${JSON.stringify(d.bounds)}`);
    console.log(`     workArea = ${JSON.stringify(d.workArea)}`);
  }
  console.log(`  primary: id=${primary.id} scaleFactor=${primary.scaleFactor} bounds=${JSON.stringify(primary.bounds)}`);

  console.log('');
  console.log('=== [2] BrowserWindow size/position coordinate space ===');
  const win = new BrowserWindow({ width: 250, height: 270, show: false, frame: false, transparent: true });
  console.log(`  created with 250x270 -> getSize()=${JSON.stringify(win.getSize())}  getBounds()=${JSON.stringify(win.getBounds())}`);

  for (const d of all) {
    const wantX = Math.round(d.bounds.x + d.bounds.width / 2 - 125);
    const wantY = Math.round(d.bounds.y + d.bounds.height / 2 - 135);
    win.setBounds({ x: wantX, y: wantY, width: 250, height: 270 });
    console.log(`  -> move to display id=${d.id} (scaleFactor=${d.scaleFactor}), requested x=${wantX} y=${wantY} 250x270`);
    console.log(`     getPosition()=${JSON.stringify(win.getPosition())}  getSize()=${JSON.stringify(win.getSize())}  getBounds()=${JSON.stringify(win.getBounds())}`);
  }

  console.log('');
  console.log('=== [3] dipToScreenPoint / screenToDipPoint (win32) ===');
  try {
    if (typeof screen.dipToScreenPoint === 'function') {
      for (const p of [{ x: 100, y: 100 }, { x: 300, y: 300 }]) {
        console.log(`  dipToScreenPoint(${JSON.stringify(p)}) = ${JSON.stringify(screen.dipToScreenPoint(p))}`);
        console.log(`  screenToDipPoint(${JSON.stringify(p)}) = ${JSON.stringify(screen.screenToDipPoint(p))}`);
      }
    } else {
      console.log('  not available');
    }
  } catch (e) {
    console.log('  error: ' + e.message);
  }

  console.log('');
  console.log('=== [4] Interpretation ===');
  console.log('  getSize() stays 250x270 on EVERY display  -> size APIs are DIP (E6 assumption holds)');
  console.log('  getSize() grows with scaleFactor (e.g. 375x405 at 1.5) -> size APIs are PHYSICAL pixels (E6 falsified)');
  console.log('');
  win.destroy();
  app.quit();
});
