'use strict';
/**
 * shell-affinity.js — 好感度 + 兑换屋窗口 + 重置两函数 + affinity:* 处理器函数（B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6）。
 */

const { app, BrowserWindow, screen, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const backend = require('./shell-backend.js');
const notifier = require('./shell-notify.js');
const assets = require('./shell-assets.js');

// 注入面（组合根 main.js 接线）：getPetWindow + pet 状态访问面（pet）/ setQuitting（组合根）/ APP_NAME（常量）
let getPetWindow = null;
let pet = null;
let setQuitting = null;
let APP_NAME = null;
function init(deps) {
  getPetWindow = deps.getPetWindow;
  pet = deps.pet;
  setQuitting = deps.setQuitting;
  APP_NAME = deps.APP_NAME;
}

// ---------------------------------------------------------------------------
// 好感度 & 兑换系统
//   好感度：按真实消耗的 token（uncachedInput + output）累积，
//           每 AFFINITY_RATE 个 token 得 1 点，按等级阈值升级。
//   兑换屋：右键鲸鱼娘打开，token → 💴，💴 买食物喂食（喂食加好感）。
// ---------------------------------------------------------------------------
const AFFINITY_RATE = 500;       // 每消耗 500 token = 1 好感点（门槛更低，条动得快）
const EXCHANGE_RATE = 1000;      // 1000 token 兑换 1 💴（门槛更低）
const LEVEL_THRESHOLDS = [0, 20, 50, 100, 180, 300, 450, 650, 900, 1200];
const FOODS = [
  { id: 'fish', name: '小鱼干', price: 1, emoji: '🐟', bonusTokens: 2000, msg: '小鱼干真香~ 好感+4' },
  { id: 'cake', name: '小蛋糕', price: 2, emoji: '🍰', bonusTokens: 4000, msg: '蛋糕好好吃~ 好感+8' },
  { id: 'milk', name: '珍珠奶茶', price: 3, emoji: '🧋', bonusTokens: 6000, msg: '奶茶赛高~ 好感+12' },
];

function affinityFile() {
  return path.join(app.getPath('userData'), 'affinity.json');
}
// 三池分离，杜绝"买食物→赚token→再换钱"的印钞机漏洞：
//   usage  终身消耗的 token（只来自真实 AI 使用，只增不减）→ 决定好感度
//   wallet 可兑换余额（来自使用，兑换时花掉）→ 换 💴
//   bonus  喂食获得的好感点（单向加成，不产生可兑换 token）
let affinity = { usage: 0, wallet: 0, bonus: 0, currency: 0, food: {} };
function loadAffinity() {
  try {
    const saved = JSON.parse(fs.readFileSync(affinityFile(), 'utf8'));
    affinity = {
      usage: Number(saved.usage) || Number(saved.tokens) || 0,
      wallet: Number(saved.wallet) || Number(saved.tokens) || 0,
      bonus: Number(saved.bonus) || 0,
      currency: Number(saved.currency) || 0,
      food: saved.food || {},
    };
  } catch { /* 首次使用 */ }
}
function saveAffinity() {
  try {
    fs.mkdirSync(path.dirname(affinityFile()), { recursive: true });
    fs.writeFileSync(affinityFile(), JSON.stringify(affinity, null, 2), 'utf8');
  } catch (err) { console.error('[bigfish] affinity save failed:', err); }
}

/** 从 dsh 会话缓存汇总已消耗 token（真实信号）。读不到返回 null。 */
function sumSessionTokens() {
  try {
    const file = path.join(backend.dshHome(), 'storages', 'session_projcache.json');
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const sessions = (j.tables && j.tables.sessions) || {};
    let sum = 0;
    for (const key of Object.keys(sessions)) {
      const rows = (sessions[key].rows) || {};
      const tu = rows.tokenUsage && rows.tokenUsage.val;
      if (tu && tu.totals) {
        sum += (tu.totals.uncachedInputTokens || 0) + (tu.totals.outputTokens || 0);
      }
    }
    return sum;
  } catch { return null; }
}
let lastTokenSum = null;
let affinityWatcherTimer = null;

function affinityView() {
  // 好感 = 终身使用换算 + 喂食加成（只增不减，兑换不影响好感）
  const points = Math.floor(affinity.usage / AFFINITY_RATE) + affinity.bonus;
  let level = 1, curThr = LEVEL_THRESHOLDS[0], nextThr = LEVEL_THRESHOLDS[1];
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (points >= LEVEL_THRESHOLDS[i]) { level = i + 1; curThr = LEVEL_THRESHOLDS[i]; nextThr = LEVEL_THRESHOLDS[i + 1]; }
  }
  const progress = nextThr === undefined ? 1 : Math.min(1, (points - curThr) / (nextThr - curThr));
  return {
    level,
    points,
    pointsToNext: nextThr === undefined ? points : nextThr,
    progress,
    tokens: affinity.wallet,      // 可兑换余额
    usage: affinity.usage,        // 终身消耗
    bonus: affinity.bonus,
    currency: affinity.currency,
    food: { ...affinity.food },
    foods: FOODS.map((f) => ({ ...f, bonusPoints: Math.round(f.bonusTokens / AFFINITY_RATE) })),
    exchangeRate: EXCHANGE_RATE,
    affinityRate: AFFINITY_RATE,
  };
}
function broadcastAffinity() {
  if (getPetWindow() && !getPetWindow().isDestroyed()) {
    getPetWindow().webContents.send('pet-affinity', affinityView());
  }
}

function startAffinityWatcher() {
  stopAffinityWatcher();
  const sum = sumSessionTokens();
  // 首次使用：把历史消耗一并计入（好感条立刻有进度，之后只累计新增）
  if (affinity.usage === 0 && sum !== null && sum > 0) {
    affinity.usage = sum;
    affinity.wallet = sum;
    saveAffinity();
  }
  lastTokenSum = sum; // 基线：之后只统计新增消耗
  affinityWatcherTimer = setInterval(() => {
    const s2 = sumSessionTokens();
    if (s2 !== null && lastTokenSum !== null) {
      if (s2 > lastTokenSum) {
        const delta = s2 - lastTokenSum;
        lastTokenSum = s2;
        affinity.usage += delta;  // 终身消耗（只增不减）
        affinity.wallet += delta; // 可兑换余额
        saveAffinity();
        // 每攒够 1 点好感才提示（避免刷屏）
        if (Math.floor(affinity.usage / AFFINITY_RATE) > Math.floor((affinity.usage - delta) / AFFINITY_RATE)) {
          const v = affinityView();
          pet.petSay(`好感 +1，现在是 Lv.${v.level} 啦~`);
        }
      } else if (s2 < lastTokenSum) {
        lastTokenSum = s2; // 会话被清理/重建，重新基线
      }
    }
    // 每次都广播（桌宠窗口重建后也能拿到最新值）
    broadcastAffinity();
  }, 10000);
}
function stopAffinityWatcher() {
  if (affinityWatcherTimer) { clearInterval(affinityWatcherTimer); affinityWatcherTimer = null; }
}

/** 右键鲸鱼娘：在它旁边打开兑换窗口。 */
let exchangeWindow = null;
function openExchangeWindow() {
  if (exchangeWindow && !exchangeWindow.isDestroyed()) {
    exchangeWindow.show();
    exchangeWindow.focus();
    return;
  }
  exchangeWindow = new BrowserWindow({
    width: 320,
    height: 500,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '鲸鱼娘兑换屋',
    autoHideMenuBar: true,
    backgroundColor: '#14161c',
    icon: assets.appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'exchange-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 放在鲸鱼娘右侧（放不下就放左边）
  if (getPetWindow() && !getPetWindow().isDestroyed()) {
    const [px, py] = getPetWindow().getPosition();
    const [pw] = getPetWindow().getSize();
    const { workAreaSize } = screen.getPrimaryDisplay();
    let x = px + pw + 6;
    if (x + 320 > workAreaSize.width) x = Math.max(0, px - 326);
    exchangeWindow.setPosition(Math.round(x), Math.round(Math.max(0, Math.min(py, workAreaSize.height - 500))));
  }
  // 缓存爆破：防止 Chromium file:// 缓存加载旧版 exchange.html 导致元素缺失
  const cacheBust = Date.now();
  exchangeWindow.loadFile(path.join(__dirname, 'exchange.html'), { query: { v: cacheBust } });
  exchangeWindow.webContents.on('console-message', (_e, level, message) => {
    try {
      const file = path.join(app.getPath('userData'), 'exchange.log');
      fs.appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${message}\n`);
    } catch { /* best effort */ }
  });
  exchangeWindow.on('closed', () => { exchangeWindow = null; });
}

/** 重置所有数据（删掉 .dsh 目录），用于解决"配置改坏/黑屏/无法回复"等问题。 */
async function resetAllData() {
  const home = backend.dshHome();
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: APP_NAME,
    message: '确定要重置所有数据吗？',
    detail: [
      '什么时候该重置：程序黑屏/白屏、界面打不开、一直"回复失败"、改坏了配置、或更换账号想清空所有内容。',
      '',
      '会删除什么：API Key、所有会话记录、预设、设置等（相当于恢复出厂设置）。',
      '',
      '风险提示：删除后不可恢复，需要重新填写 API Key 才能继续使用。',
    ].join('\n'),
    buttons: ['重置并退出', '取消'],
    defaultId: 1,
    cancelId: 1,
  });
  if (choice !== 0) return;
  try {
    backend.stopDsh();
    await new Promise((r) => setTimeout(r, 1500));
    fs.rmSync(home, { recursive: true, force: true });
    notifier.notify(APP_NAME, '数据已重置，即将退出，请重新打开');
  } catch (err) {
    console.error('[bigfish] 重置数据失败:', err);
    dialog.showErrorBox(APP_NAME, '重置失败，请手动删除 ' + home);
  }
  setQuitting(true);
  app.quit();
}

/** 重置配置但保留会话和工程（用于"AI 删插件改坏配置导致后端超时"等场景）。 */
async function resetConfigKeepSessions() {
  const home = backend.dshHome();
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: APP_NAME,
    message: '确定要重置插件配置吗？（保留 API Key 和会话）',
    detail: [
      '什么时候用：让 AI 装/删插件后进不去、启动一直超时。',
      '',
      '会删除什么：插件配置（profiles 目录）。',
      '',
      '会保留什么：API Key、设置、会话记录、工程/工作区数据。',
    ].join('\n'),
    buttons: ['重置并退出', '取消'],
    defaultId: 1,
    cancelId: 1,
  });
  if (choice !== 0) return;
  try {
    backend.stopDsh();
    await new Promise((r) => setTimeout(r, 1500));
    fs.rmSync(path.join(home, 'profiles'), { recursive: true, force: true });
    notifier.notify(APP_NAME, '插件配置已重置，API Key、会话和工程已保留。即将退出，请重新打开');
  } catch (err) {
    console.error('[bigfish] 重置配置失败:', err);
    dialog.showErrorBox(APP_NAME, '重置失败，请手动删除 ' + path.join(home, 'profiles'));
  }
  setQuitting(true);
  app.quit();
}

function handleAffinityView() { return affinityView(); }

function handleAffinityExchange() {
  const gain = Math.floor(affinity.wallet / EXCHANGE_RATE);
  if (gain <= 0) return { ok: false, message: `还不够兑换 1💴（需 ${EXCHANGE_RATE} token）` };
  affinity.wallet -= gain * EXCHANGE_RATE; // 只花可兑换余额，不动终身消耗（好感不掉）
  affinity.currency += gain;
  saveAffinity();
  broadcastAffinity();
  return { ok: true, message: `兑换了 ${gain}💴`, view: affinityView() };
}

function handleAffinityBuy(_e, foodId) {
  const food = FOODS.find((f) => f.id === foodId);
  if (!food) return { ok: false, message: '没有这种食物' };
  if (affinity.currency < food.price) return { ok: false, message: '💴 不够啦，先去兑换吧' };
  affinity.currency -= food.price;
  affinity.food[food.id] = (affinity.food[food.id] || 0) + 1;
  // 喂食：只加好感点（单向），不产生可兑换 token —— 杜绝"买食物→赚token→再换钱"循环
  affinity.bonus += Math.round(food.bonusTokens / AFFINITY_RATE);
  saveAffinity();
  // 鲸鱼吃播
  pet.petSay(food.msg);
  pet.setPetState('eat');
  clearTimeout(pet.getEatTimer());
  pet.setEatTimer(setTimeout(() => { if (pet.getPetState() === 'eat') pet.setPetState('idle'); }, 2000));
  broadcastAffinity();
  return { ok: true, message: food.msg, view: affinityView() };
}

module.exports = {
  loadAffinity,
  saveAffinity,
  startAffinityWatcher,
  stopAffinityWatcher,
  broadcastAffinity,
  openExchangeWindow,
  resetAllData,
  resetConfigKeepSessions,
  handleAffinityView,
  handleAffinityExchange,
  handleAffinityBuy,
  init,
};
