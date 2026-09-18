'use strict';
/**
 * s2-pet-main-path.scenario.js — 场景二「桌宠主链路」（B16；设计档 docs/design/REPO-CONVENTIONS.md §A.2.2.4）。
 * 驱动 = 进程内（electron 本档）真 BrowserWindow + 真 shell-pet-geometry.js + 真 shell-settings.js；
 * BIGFISH_PET_DEBUG=1 ⇒ 断言面 = 行为面（pet-geometry.log 落盘行 + settings.json 的 petPos + 窗口实际位置）。
 * 判据：① geom tag=start ② petPos = 窗口位置（±1 DIP）③ handleDisplayChange('metrics', …) 后 tag=display + 中心点 ∈ workArea。
 * 上限 60 s。退出码：0 = PASS；1 = FAIL（摘要行 SCENARIO S2 PASS / FAIL）。
 */

const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./harness.js');

const SCENARIO = 's2';
const userData = path.join(harness.USERDATA_ROOT, SCENARIO);
process.env.BIGFISH_USER_DATA = userData;
process.env.BIGFISH_PET_DEBUG = '1';

// 与 main.js:67 同款隔离：userData 路径覆写（须在 geometry/settings 模块使用前生效——
// petGeomLog / settingsPath 每次调用重取 getPath，但隔离语义与生产一致）
fs.mkdirSync(userData, { recursive: true });
try { app.setPath('userData', userData); } catch { /* 路径非法则用默认 */ }

const geometry = require(path.join(harness.REPO_ROOT, 'shell-pet-geometry.js'));
const settings = require(path.join(harness.REPO_ROOT, 'shell-settings.js'));

function readGeomLog() {
  try { return fs.readFileSync(path.join(userData, 'pet-geometry.log'), 'utf8'); } catch { return ''; }
}

function fail(msg) {
  process.stdout.write(`SCENARIO S2 FAIL :: ${msg}\n`);
  process.exit(1);
}

app.whenReady().then(async () => {
  try {
    // 内部上限 60 s（设计 A.2.2.4：超时判红——进程内场景挂死时由 fail() 超时定时器兜底）
    setTimeout(() => fail('场景超时（60 s 上限，whenReady 后未走完判据）'), 60 * 1000).unref?.();
    let win = new BrowserWindow({
      width: geometry.PET_SIZE_DIP.w,
      height: geometry.PET_SIZE_DIP.h,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      show: false,
    });
    geometry.init({ getPetWindow: () => win, getPetDrag: () => null });
    settings.loadSettings();

    // ① 启动建窗后 geom tag=start（main.js:207 生产绑定同款调用）
    geometry.petGeomSnapshot('start');
    const firstLog = readGeomLog();
    const startLine = firstLog.match(/geom tag=start pos=\([^)]*\) size=\([^)]*\) center=\([^)]*\) display=\d+ scale=[\d.]+ wa=\([^)]*\) visible=[01]/);
    if (!startLine) fail(`pet-geometry.log 无 geom tag=start 行（log 尾 = ${JSON.stringify(firstLog.slice(-200))}）`);

    // ② petPos = 窗口实际位置（±1 DIP）：先落盘再读回
    geometry.petSavePos();
    settings.saveSettings();
    const saved = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
    const [wx, wy] = win.getPosition();
    if (!saved.petPos || Math.abs(saved.petPos.x - wx) > 1 || Math.abs(saved.petPos.y - wy) > 1) {
      fail(`settings.petPos (${JSON.stringify(saved.petPos)}) ≠ 窗口实际位置 (${wx},${wy})（±1 DIP 判据）`);
    }

    // ③ 显示器事件真代码路径：handleDisplayChange('metrics', <display>, [])
    const display = screen.getDisplayMatching(win.getBounds());
    geometry.handleDisplayChange('metrics', display, []);
    const log = readGeomLog();
    if (!/geom tag=display pos=\([^)]*\) size=\([^)]*\)/.test(log)) {
      fail(`pet-geometry.log 无 geom tag=display 行（log 尾 = ${JSON.stringify(log.slice(-200))}）`);
    }
    // 中心点仍落在某显示器 workArea 内（可见性口径 NFR-5）
    const [cx, cy] = [wx + geometry.PET_SIZE_DIP.w / 2, wy + geometry.PET_SIZE_DIP.h / 2];
    const inWorkArea = screen.getAllDisplays().some((d) => {
      const wa = d.workArea;
      return cx >= wa.x && cx < wa.x + wa.width && cy >= wa.y && cy < wa.y + wa.height;
    });
    if (!inWorkArea) fail(`窗口中心点 (${cx},${cy}) 不在任何显示器 workArea 内`);

    win.destroy();
    // 摘要行只由运行器统一打印（S2 场内零摘要输出）；成功后清理隔离面（设计 A.2.2.4：成功后清理）
    harness.cleanupScenario(SCENARIO);
    app.exit(0); // 进程内场景：直接退出 electron（不新增产品测试钩子，DD-A10；杀树会误杀自己 → 非零退）
  } catch (err) {
    fail(err && err.message ? err.message : String(err));
  }
});
