// Probe 2: pin down the size-coordinate-space mechanism.
//  Q1: create a window ON each display -> what does getSize() read?
//  Q2: move ONE window across displays and WAIT for DPI change to settle -> what does getSize() read?
// Run: npx electron probe-displays2.js
'use strict';
const { app, screen, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const all = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const centerOf = (d) => ({
    x: Math.round(d.bounds.x + d.bounds.width / 2 - 125),
    y: Math.round(d.bounds.y + d.bounds.height / 2 - 135),
  });

  console.log('');
  console.log('=== [Q1] Create a fresh window ON each display (wait 700ms before reading) ===');
  for (const d of all) {
    const c = centerOf(d);
    const w = new BrowserWindow({ x: c.x, y: c.y, width: 250, height: 270, show: false, frame: false });
    await sleep(700);
    console.log(`  on display id=${d.id} scale=${d.scaleFactor}: getSize()=${JSON.stringify(w.getSize())} getBounds()=${JSON.stringify(w.getBounds())}`);
    w.destroy();
    await sleep(200);
  }

  console.log('');
  console.log('=== [Q2] ONE window, moved across displays, WAIT 700ms after each move ===');
  const w = new BrowserWindow({ width: 250, height: 270, show: false, frame: false });
  await sleep(700);
  console.log(`  initial (primary): getSize()=${JSON.stringify(w.getSize())} getBounds()=${JSON.stringify(w.getBounds())}`);
  for (const d of all) {
    const c = centerOf(d);
    w.setBounds({ x: c.x, y: c.y, width: 250, height: 270 });
    const immediately = w.getSize();
    await sleep(700);
    const settled = w.getSize();
    console.log(`  move -> id=${d.id} scale=${d.scaleFactor}`);
    console.log(`      immediately: getSize()=${JSON.stringify(immediately)}`);
    console.log(`      settled   : getSize()=${JSON.stringify(settled)}`);
  }

  console.log('');
  console.log('=== [Q3] After settling on a display, does setSize(250,270) "stick"? ===');
  for (const d of all) {
    const c = centerOf(d);
    w.setBounds({ x: c.x, y: c.y, width: 250, height: 270 });
    await sleep(700);
    const before = w.getSize();
    w.setSize(250, 270);
    const justAfter = w.getSize();
    await sleep(700);
    const later = w.getSize();
    console.log(`  id=${d.id} scale=${d.scaleFactor}: before=${JSON.stringify(before)} -> setSize(250,270) -> justAfter=${JSON.stringify(justAfter)} -> 700ms later=${JSON.stringify(later)}`);
  }

  console.log('');
  console.log('=== [Q4] dipToScreenPoint round-trip on each display (physical vs DIP) ===');
  for (const d of all) {
    const c = centerOf(d);
    w.setBounds({ x: c.x, y: c.y, width: 250, height: 270 });
    await sleep(700);
    const b = w.getBounds();
    const phys = screen.dipToScreenPoint({ x: b.x, y: b.y });
    const ratio = b.x !== 0 ? (phys.x / b.x).toFixed(4) : 'n/a';
    console.log(`  id=${d.id} scale=${d.scaleFactor}: bounds(x,y)=(${b.x},${b.y}) -> physical=(${phys.x},${phys.y})  ratio=${ratio}`);
  }

  w.destroy();
  app.quit();
}

app.on('window-all-closed', () => { /* keep alive during probe */ });

app.whenReady().then(main);
