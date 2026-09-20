'use strict';

/**
 * Bigfish — Electron desktop shell for DeepSeek Harness.
 *
 * Architecture:
 *   1. Find a free localhost port.
 *   2. Spawn the bundled `@deepseek-ai/dsh` CLI in "web" profile as a child
 *      process (this is the same backend that `dsh web` runs).
 *   3. Wait until the backend responds on 127.0.0.1:<port>.
 *   4. Open a native BrowserWindow pointing at that local URL.
 *
 * Desktop-product extras (on top of the plain web shell):
 *   - system tray + global shortcut to summon the window
 *   - minimize-to-tray (closing the window keeps the app alive)
 *   - completion notifications (heuristic: backend writes then goes idle)
 *   - desktop pet (鲸鱼娘): transparent floating window, draggable,
 *     碰墙折返的散步/跑步、点击互动、随机说话与小动作、好感度条
 *   - 好感度 & 兑换屋：按真实 token 消耗累积好感/等级，右键鲸鱼娘把 token
 *     换成 💴 买食物喂食
 *   - plugin ecosystem: bundled pnpm installs/removes DSH plugins in the web
 *     profile, and a native "插件市场" window browses/installs/uninstalls them
 *   - launch at login, and a Windows "Open with Bigfish" context menu
 *
 * B06 F6（设计档 docs/design/SHELL-UX.md §2.2.6）：本文件 = 组合根——常量 / userData 覆盖 / 单实例锁 /
 * whenReady 引导 / 退出钩子 / 模块接线（init(deps)）；各域实现分居 15 个 shell-*.js 平铺模块。
 */

const { app, dialog, screen, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const settings = require('./shell-settings.js');
const notifier = require('./shell-notify.js');
const backend = require('./shell-backend.js');
const geometry = require('./shell-pet-geometry.js');
const drag = require('./shell-pet-drag.js');
const pet = require('./shell-pet.js');
const physics = require('./shell-pet-physics.js');
const work = require('./shell-pet-work.js');
const affinity = require('./shell-affinity.js');
const affinityCore = require('./affinity-core.js');
const unlockCore = require('./pet-unlock-core.js');   // B23：解锁核（组合根绑定，经两处 init(deps) 注入送达——设计档 PET-UNLOCK.md §2.2.4 A 路线）
const mode = require('./shell-mode.js');
const plugins = require('./shell-plugins.js');
const win = require('./shell-window.js');
const tray = require('./shell-tray.js');
const update = require('./shell-update.js');
const ipc = require('./shell-ipc.js');

const APP_NAME = 'Bigfish';
const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 90 * 1000;
// B09（US-12 / 设计档 §2.2.12「阈值取值」）：8 s = 投影缓存写后阈值 5000 ms + 3000 ms 余量
// （8000 > 5000 = 判定承重前提：静默达阈值时快照必已折叠最近一次会话事件）
const IDLE_NOTIFY_MS = 8 * 1000;
const IDLE_NOTIFY_FALLBACK_MS = 30 * 1000; // 判定源不可用（unavailable）时的降级阈值 = 现状语义（§2.2.12 规则②）
// B30（US-17 / §2.2.12 判据句②）：等待确认阈值 60 s（高于完成阈值 8 s 一个量级——正常思考 / 短调用不触发）
const WAITING_NOTIFY_MS = 60 * 1000;

/** 空闲阈值（默认 `IDLE_NOTIFY_MS` = 8000 ms）；env `BIGFISH_IDLE_NOTIFY_MS` 可覆盖（测试钩子，承 `webUrlWaitMs()` 形）。 */
function idleNotifyMs(defaultMs = IDLE_NOTIFY_MS) {
  const raw = process.env.BIGFISH_IDLE_NOTIFY_MS;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return defaultMs;
}

/** 等待确认阈值（默认 `WAITING_NOTIFY_MS` = 60000 ms）；env `BIGFISH_WAITING_NOTIFY_MS` 可覆盖（测试钩子，承 `idleNotifyMs()` 形：空 / 非有限数 / 负数 ⇒ 取默认）。 */
function waitingNotifyMs(defaultMs = WAITING_NOTIFY_MS) {
  const raw = process.env.BIGFISH_WAITING_NOTIFY_MS;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return defaultMs;
}

// 测试/多实例：允许用环境变量指定 userData（避免 --user-data-dir 经 cmd 转发被改坏）
if (process.env.BIGFISH_USER_DATA && String(process.env.BIGFISH_USER_DATA).trim() !== '') {
  try { app.setPath('userData', String(process.env.BIGFISH_USER_DATA).trim()); } catch { /* ignore */ }
}

let quitting = false;
function isQuitting() { return quitting; }
function setQuitting(v) { quitting = v; }

// ---- 模块接线（依赖注入；设计档 docs/design/SHELL-UX.md §2.2.6 依赖方向规则）----
notifier.init({ getDshHome: backend.dshHome, petSay: pet.petSay, IDLE_NOTIFY_MS: idleNotifyMs(), IDLE_NOTIFY_FALLBACK_MS, WAITING_NOTIFY_MS: waitingNotifyMs() });
backend.init({ HOST, READY_TIMEOUT_MS, sanitizeProfileBundles: plugins.sanitizeProfileBundles, getMainWindow: win.getMainWindow });
geometry.init({ getPetWindow: pet.getPetWindow, getPetDrag: drag.getPetDrag });
drag.init({ getPetWindow: pet.getPetWindow, pet, petWouldArmFlight: physics.petWouldArmFlight }); // T60：甩抛放行面接线
pet.init({ showMainWindow: win.showMainWindow, openExchangeWindow: affinity.openExchangeWindow, broadcastAffinity: affinity.broadcastAffinity, affinityLevelProvider: () => affinity.affinityLevel(), notifyUnlock: notifier.notifyUnlock, unlockCore });   // B23：解锁门控注入面（等级访问器 + 提示复用入口 + 核档注入）
// 工作状态联动接线（B19 / §2.7 注入面 9 项；shell-pet.js 不 require 工作模块 ⇒ 背底档经 setBaseStateProvider 注入）
work.init({
  setPetState: pet.setPetState,
  getPetState: pet.getPetState,
  petSay: pet.petSay,
  wakePet: pet.wakePet,
  logAnim: pet.logAnim,
  getPetWindow: pet.getPetWindow,
  getPetDrag: drag.getPetDrag,
  settings,
  dshHome: backend.dshHome,
});
pet.setBaseStateProvider(() => work.baseState()); // 背底档提供者（§2.8.4：仅散步起步门消费）
// B20 D-1 修偏（2026-09-18）：physics.init 调用在 B20 交付时遗漏（三行注释在场但无调用——批次档 B20 §4.1）；
//   补上组合根接线（设计档 PET-MOVEMENT.md §2.7 注入面表；deps 同 pet.init 内既有接线，双处幂等——init 只保存 deps）
physics.init({
  getPetWindow: pet.getPetWindow,
  getPetDrag: drag.getPetDrag,
  getMoveTimer: pet.getMoveTimer,
  settings,
  setPetState: pet.setPetState,
});
affinity.init({ getPetWindow: pet.getPetWindow, pet, setQuitting, APP_NAME, affinityCore, settings, unlockCore });   // B23：settings + 核档注入（图鉴开关态读取；核档经组合根送达）
mode.init({ getMainWindow: win.getMainWindow, destroyPetWindow: pet.destroyPetWindow, ensurePet: pet.ensurePet, rebuildTrayMenu: tray.rebuildTrayMenu, notify: notifier.notify, APP_NAME });
plugins.init({ updaterLog: update.updaterLog });
update.init({ setQuitting, APP_NAME, runtimeNodeExe: plugins.runtimeNodeExe, bundledPnpmPath: plugins.bundledPnpmPath });
win.init({ HOST, APP_NAME, isQuitting });
tray.init({ setQuitting, APP_NAME, setPetWorkStatus: work.setEnabled });

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    win.showMainWindow();
    win.handleOpenArg(argv);
  });

  app.whenReady().then(async () => {
    settings.loadSettings();
    let booted = false;
    try {
      await backend.startDsh();
      console.log(`[bigfish] backend ready at http://${HOST}:${backend.getPort()}`);
      win.createWindow();
      console.log('[bigfish] window created');
      booted = true;
    } catch (err) {
      // 第一次失败：清理残留后重试一次（常见于上次异常退出导致端口/进程残留）
      try {
        backend.stopDsh();
        backend.cleanupStaleDsh();
        await new Promise((r) => setTimeout(r, 1500));
        await backend.startDsh();
        console.log(`[bigfish] backend ready (retry) at http://${HOST}:${backend.getPort()}`);
        win.createWindow();
        console.log('[bigfish] window created (retry)');
        booted = true;
      } catch (err2) {
        // 两次都失败：很可能是插件配置被改坏，引导用户重置（尽量保留信息）
        const message = err2 && err2.message ? err2.message : String(err2);
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          title: APP_NAME,
          message: '后端启动失败，可能是插件配置损坏',
          detail: [
            '错误：' + message,
            '',
            '常见原因：使用「创造模式」让 AI 装/删插件后，插件配置被改坏。',
            '',
            '· 重置插件配置：只清插件配置，保留 API Key、会话、工程，然后自动重试。',
            '· 彻底恢复出厂：清空所有数据（API Key、会话、工程都会删）。',
          ].join('\n'),
          buttons: ['重置插件配置并重试', '彻底恢复出厂', '退出'],
          defaultId: 0,
          cancelId: 2,
        });
        if (choice === 0 || choice === 1) {
          try {
            const home = backend.dshHome();
            backend.stopDsh();
            backend.cleanupStaleDsh();
            await new Promise((r) => setTimeout(r, 1500));
            if (choice === 0) {
              fs.rmSync(path.join(home, 'profiles'), { recursive: true, force: true });
            } else {
              fs.rmSync(home, { recursive: true, force: true });
            }
            await backend.startDsh();
            console.log(`[bigfish] backend ready (after reset) at http://${HOST}:${backend.getPort()}`);
            win.createWindow();
            console.log('[bigfish] window created (after reset)');
            booted = true;
          } catch (err3) {
            const m3 = err3 && err3.message ? err3.message : String(err3);
            dialog.showErrorBox(
              APP_NAME,
              '重置后仍无法启动：\n\n' + m3 + '\n\n错误日志：' + path.join(app.getPath('userData'), 'bigfish.log'),
            );
          }
        }
      }
    }

    if (!booted) { app.quit(); return; }

    tray.createTray();
    tray.registerShortcuts();
    notifier.startCompletionWatcher();
    affinity.loadAffinity();
    affinity.startAffinityWatcher();
    update.scheduleUpdateChecks();
    // 显示器配置变化（E5 三事件，DD-8）：失效拖动缓存 + 校正到可见区 + 落盘
    // 物理停点先于几何三条（E7 / 交接⑥：飞行中先零写入停物理，再由几何事件路径校正；
    //   判据 = 日志 phys-stop reason=display-change 早于 geom tag=display，§2.8）
    physics.registerScreenStops(screen);
    screen.on('display-added', (_e, display) => geometry.handleDisplayChange('added', display));
    screen.on('display-removed', (_e, display) => geometry.handleDisplayChange('removed', display));
    screen.on('display-metrics-changed', (_e, display, changedMetrics) => geometry.handleDisplayChange('metrics', display, changedMetrics));
    // 首次安装 / 更新后：弹窗让用户选择模式（鲸鱼 / 专注）
    mode.maybeShowModeDialog();
    if (settings.get().petEnabled) {
      pet.createPetWindow(geometry.petResolveStartPos());
      geometry.petGeomSnapshot('start'); // 启动建窗后 1 行 geom（发射规则①）
      pet.scheduleWander();
      pet.scheduleSleep();
      pet.schedulePetChatter();
    }
    // 工作状态联动启动态（B19 / §2.8.6：启动与运行期同一判据 = settings.petWorkStatus，无双源；
    //   关 ⇒ 读面不启动（零监听零定时器零日志），开 ⇒ 立即读一次并进入 1 s tick）
    if (settings.get().petWorkStatus) work.setEnabled(true);
    if (settings.get().launchAtLogin) tray.setAutoStart(true);

    win.handleOpenArg(process.argv);

    app.on('activate', () => {
      // Dock 点击 = 用户主动显示请求：显示 + 聚焦（零窗口时建窗后显示）——macOS 目视项 TC-26
      pet.ensurePet();
      win.showMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Live in the tray; do not quit.
  });

  app.on('before-quit', () => {
    quitting = true;
    drag.petStopDrag('destroyed'); // 退出路径终止拖动（设计档 §2.2.4 的主进程清空点）
    physics.quit();                // 退出路径终止物理飞行（B20：§2.2.10 第 9 行——只停循环 + 日志，零写入）
    geometry.petSavePos();             // 退出前兜底落盘（US-13，§2.3.2 调用时机表）
    globalShortcut.unregisterAll();
    notifier.stopCompletionWatcher();
    affinity.stopAffinityWatcher();
    work.setEnabled(false); // 工作状态读面一并停（退出路径零定时器；§2.8.6 关语义同构）
    affinity.saveAffinity();
    backend.stopDsh();
  });

  app.on('will-quit', () => {
    backend.stopDsh();
  });

  // IPC 通道注册（shell-ipc.js——通道 → 域处理器函数，薄绑定）
  ipc.register();
}
