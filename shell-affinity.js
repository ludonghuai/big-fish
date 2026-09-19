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

// 注入面（组合根 main.js 接线）：getPetWindow + pet 状态访问面（pet）/ setQuitting（组合根）/ APP_NAME（常量）/
//   affinityCore（好感度数值面纯函数核心 affinity-core.js——不新增静态相对 require，判据 D② 扇出保持 3）
let getPetWindow = null;
let pet = null;
let setQuitting = null;
let APP_NAME = null;
let affinityCore = null;
function init(deps) {
  getPetWindow = deps.getPetWindow;
  pet = deps.pet;
  setQuitting = deps.setQuitting;
  APP_NAME = deps.APP_NAME;
  affinityCore = deps.affinityCore;
}

// ---------------------------------------------------------------------------
// 好感度 & 兑换系统
//   好感度：按真实消耗的 token 累积——计费口径 B = uncachedInput + cacheRead
//           + cacheWrite + output（只读 totals）；读面 = per-record 目录优先 + 旧单文件兜底。
//           每 AFFINITY_RATE 个 token 得 1 点，按等级阈值升级。
//   兑换屋：右键鲸鱼娘打开，token → 💴，💴 买食物喂食（喂食加好感）。
// ---------------------------------------------------------------------------
// 数值面常量（AFFINITY_RATE / EXCHANGE_RATE / LEVEL_THRESHOLDS / FOODS）已核心化至 affinity-core.js（B31 §2.6）
//   ——经 init(deps) 注入消费；本档零数值定义（改值只改 core 一处）。

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

// 读面常量（B10；设计档 docs/design/SHELL-UX.md §2.2.13）：
//   计费口径 B = uncachedInput + cacheRead + cacheWrite + output（只读 totals，不读 last.buckets）；
//   诊断标记 = 每进程至多一条（两形态均不可用时发射）。
const TOKEN_BUCKETS = ['uncachedInputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens'];
let affinityDiagLogged = false;

/** 计费口径 B：`totals` 四桶之和（缺桶按 0）。 */
function bucketSum(totals) {
  let sum = 0;
  for (const bucket of TOKEN_BUCKETS) sum += Number(totals[bucket]) || 0;
  return sum;
}

/** per-record 记录文件的 `totals`（字面访问链 = `<文件对象>.record.rows.tokenUsage.val.totals`）；无 ⇒ null。 */
function recordTotals(record) {
  const val = record && record.record && record.record.rows && record.record.rows.tokenUsage
    && record.record.rows.tokenUsage.val;
  return (val && val.totals) || null;
}

/** 旧单文件形态（0.1.0 期）：`tables.sessions[*].rows.tokenUsage.val.totals` 全量求和；不可用 ⇒ null。
 *  可用判据（设计档 §2.2.13「旧面可用判据」）= 可解析 **且** ≥1 条有效会话条目（有 `rows.tokenUsage.val.totals` 可取）——仅「可解析」不构成可用。
 *  兜底 = 带消解期的条件性保留（保留至 B08 收口点；到期条件见设计档 §2.2.13「消解期（旧布局兜底）」）。 */
function legacySessionTokens() {
  try {
    const file = path.join(backend.dshHome(), 'storages', 'session_projcache.json');
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const sessions = (j.tables && j.tables.sessions) || {};
    let sum = 0;
    let valid = 0; // 有效会话条目数（有 totals 可取者）——0 条 ⇒ 该形态不可用
    for (const key of Object.keys(sessions)) {
      const rows = (sessions[key] && sessions[key].rows) || {};
      const val = rows.tokenUsage && rows.tokenUsage.val;
      if (val && val.totals) { valid += 1; sum += bucketSum(val.totals); }
    }
    return valid >= 1 ? sum : null; // 无有效条目 ⇒ 不可用 ⇒ null（不得返回 0——0 会使已计入的消耗在读数回升时被重复计入）
  } catch { return null; }
}

/** 从 dsh 会话缓存汇总已消耗 token（真实信号；计费口径 B）。
 *  读面四步判据（设计档 §2.2.13）：① 枚举 `storages/session_projcache/sessions/*.json`（不递归）；
 *  ② 可解析记录 ≥ 1 ⇒ 只读目录面；③ 目录面不可用 ⇒ 读旧单文件；④ 两者皆不可用 ⇒ null（不是 0），不抛错。 */
function sumSessionTokens() {
  const dir = path.join(backend.dshHome(), 'storages', 'session_projcache', 'sessions');
  let sum = 0;
  let parseable = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue; // `*.json.bak.<stamp>` / 子目录 / 临时档天然排除
      try {
        const totals = recordTotals(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
        parseable += 1; // 可解析记录（totals 缺失仍计入，按 0 贡献）
        if (totals) sum += bucketSum(totals);
      } catch { /* 单条损坏（半写 / 非法 JSON）只跳过该条 */ }
    }
  } catch { /* 目录不存在 / 不可读 ⇒ 走旧面 */ }
  if (parseable >= 1) return sum; // 目录面可用 ⇒ 专读（不叠加旧面——防同一批消耗双计）
  const legacy = legacySessionTokens();
  if (legacy !== null) return legacy;
  if (!affinityDiagLogged) {
    affinityDiagLogged = true;
    backend.writeDiag(`[bigfish] affinity token source unavailable; dir=${fs.existsSync(dir) ? 'yes' : 'no'}; real-usage accumulation is off`);
  }
  return null;
}
let lastTokenSum = null;
let affinityWatcherTimer = null;

function affinityView() {
  // 好感 = 终身使用换算 + 喂食加成（只增不减，兑换不影响好感）——数值面在 affinityCore（B31 §2.6）
  return affinityCore.buildAffinityView(affinity);
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
    if (lastTokenSum === null && s2 !== null) lastTokenSum = s2; // 启动期读面不可用 ⇒ 首次读到非 null 水位时只重建基线、不计 delta（设计档 §2.2.13「基线重建」）
    if (s2 !== null && lastTokenSum !== null) {
      if (s2 > lastTokenSum) {
        const delta = s2 - lastTokenSum;
        lastTokenSum = s2;
        const before = affinityView().level; // delta 计入前取值（升级播报判据，设计档 §2.4）
        affinity.usage += delta;  // 终身消耗（只增不减）
        affinity.wallet += delta; // 可兑换余额
        saveAffinity();
        // 升级播报：等级严格上升才播一次（满级后等级不可能再升 ⇒ 自然零播报，设计档 §2.4）
        const v = affinityView();
        if (affinityCore.shouldAnnounceLevelUp(before, v.level)) pet.petSay(`好感满满，升到 Lv.${v.level} 啦~`);
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
  const gain = Math.floor(affinity.wallet / affinityCore.EXCHANGE_RATE);
  if (gain <= 0) return { ok: false, message: `还不够兑换 1💴（需 ${affinityCore.EXCHANGE_RATE} token）` };
  affinity.wallet -= gain * affinityCore.EXCHANGE_RATE; // 只花可兑换余额，不动终身消耗（好感不掉）
  affinity.currency += gain;
  saveAffinity();
  broadcastAffinity();
  return { ok: true, message: `兑换了 ${gain}💴`, view: affinityView() };
}

function handleAffinityBuy(_e, foodId) {
  const before = affinityView().level; // bonus 计入前取值（升级播报判据，设计档 §2.4）
  const r = affinityCore.applyFoodPurchase(affinity, foodId);
  if (!r.ok) return { ok: false, message: r.message };
  Object.assign(affinity, r.state); // 购买校验与状态转移（含喂食单向语义）在 core 内（B31 §2.6）
  saveAffinity();
  const food = affinityCore.FOODS.find((f) => f.id === foodId);
  // 鲸鱼吃播
  pet.petSay(food.msg);
  pet.setPetState('eat');
  clearTimeout(pet.getEatTimer());
  pet.setEatTimer(setTimeout(() => { if (pet.getPetState() === 'eat') pet.setPetState('idle'); }, 2000));
  // 升级播报（先 food.msg 后本条；bonus 跨档才播一次，满级恒 false ⇒ 零播报，设计档 §2.4）
  const v = affinityView();
  if (affinityCore.shouldAnnounceLevelUp(before, v.level)) pet.petSay(`好感满满，升到 Lv.${v.level} 啦~`);
  broadcastAffinity();
  return { ok: true, message: food.msg, view: v };
}

module.exports = {
  loadAffinity,
  saveAffinity,
  startAffinityWatcher,
  stopAffinityWatcher,
  sumSessionTokens,
  broadcastAffinity,
  openExchangeWindow,
  resetAllData,
  resetConfigKeepSessions,
  handleAffinityView,
  handleAffinityExchange,
  handleAffinityBuy,
  init,
};
