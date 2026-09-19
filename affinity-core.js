'use strict';
/**
 * affinity-core.js — 好感度数值面纯函数核心：常量表 / 等级判定 / 点数换算 / 视图组装（满级分支）/ 播报谓词 / 购买校验（B31；设计档 docs/design/PET-AFFINITY.md §2.6）。
 * 边界（§2.6）：零 require('electron') / 零 fs / 零定时器 / 零 IPC——可被 node 直接装载（NFR-26，桩测装载真实实现）；
 *   消费面 = 经组合根 main.js 的 init(deps) 注入 shell-affinity.js（本档不被壳档静态 require——判据 D②，§2.9）。
 * 函数清单：levelForPoints · affinityPoints · buildAffinityView · shouldAnnounceLevelUp · applyFoodPurchase；常量：AFFINITY_RATE / EXCHANGE_RATE / LEVEL_THRESHOLDS / MAX_LEVEL / FOODS；双环境导出尾巴见档末。
 */

// ---- 常量（设计档 §2.2 / §2.3；桩测逐值断言）----
/** 每消耗 500 token = 1 好感点（B31 保持 500 不变——只动阈值与喂食面，最少移动件，DD-2）。 */
const AFFINITY_RATE = 500;
/** 10,000 token 兑换 1 💴（1,000 → 10,000；随点数 ×100 同调，设计档 §2.3）。 */
const EXCHANGE_RATE = 10000;
/** 等级阈值表（10 档、严格递增；顶档 63,000 点 ≈ 3,150 万 token ≈ 25 次长任务——用户裁定 A，设计档 §2.2）。 */
const LEVEL_THRESHOLDS = [0, 120, 350, 900, 2600, 5000, 9000, 16000, 30000, 63000];
/** 等级上限（= LEVEL_THRESHOLDS.length，即 10；满级分支的唯一依据，设计档 §2.4）。 */
const MAX_LEVEL = LEVEL_THRESHOLDS.length;
/** 食品表（设计档 §2.3 甲案：每💴 40 点 = 被动 2 倍；bonusPoints = round(bonusTokens / AFFINITY_RATE)）。 */
const FOODS = [
  { id: 'fish', name: '小鱼干', price: 10, emoji: '🐟', bonusTokens: 200000, msg: '小鱼干真香~ 好感+400' },
  { id: 'cake', name: '小蛋糕', price: 20, emoji: '🍰', bonusTokens: 400000, msg: '蛋糕好好吃~ 好感+800' },
  { id: 'milk', name: '珍珠奶茶', price: 30, emoji: '🧋', bonusTokens: 600000, msg: '奶茶赛高~ 好感+1200' },
];

/** 等级判定（现 shell-affinity.js 等级循环迁出，as-of 2026-09-19）：points 及格线至多者 ⇒ 1..MAX_LEVEL。 */
function levelForPoints(points) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (points >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

/** 好感点数 = floor(usage / AFFINITY_RATE) + bonus（现 shell-affinity.js:138 迁出；只增不减、不封顶）。 */
function affinityPoints(usage, bonus) {
  return Math.floor(usage / AFFINITY_RATE) + bonus;
}

/**
 * 视图组装（现 shell-affinity.js:136-158 迁出 + 满级分支扩展，设计档 §2.4）：
 * maxed = level === MAX_LEVEL（显示面唯一分支依据）；满级 pointsToNext = 'MAX'（字符串）· progress 恒 1；
 * 点数内部仍真实累积（只增不减语义不变——收敛的是显示面与播报面，不是数据面）。
 */
function buildAffinityView(state) {
  const st = state || {};
  const usage = st.usage || 0;
  const bonus = st.bonus || 0;
  const points = affinityPoints(usage, bonus);
  const level = levelForPoints(points);
  const maxed = level === MAX_LEVEL;
  const curThr = LEVEL_THRESHOLDS[level - 1];
  const nextThr = maxed ? undefined : LEVEL_THRESHOLDS[level];
  const progress = maxed ? 1 : Math.max(0, Math.min(1, (points - curThr) / (nextThr - curThr)));
  return {
    level,
    points,
    pointsToNext: maxed ? 'MAX' : nextThr,
    progress,
    maxed,
    tokens: st.wallet || 0,       // 可兑换余额
    usage,                        // 终身消耗
    bonus,
    currency: st.currency || 0,
    food: { ...(st.food || {}) },
    foods: FOODS.map((f) => ({ ...f, bonusPoints: Math.round(f.bonusTokens / AFFINITY_RATE) })),
    exchangeRate: EXCHANGE_RATE,
    affinityRate: AFFINITY_RATE,
  };
}

/** 播报谓词（NFR-26 第三项，设计档 §2.4）：等级严格上升 ⇒ true；满级后等级不可能再升（恒 false）⇒ 自然零播报。 */
function shouldAnnounceLevelUp(before, after) {
  return after > before;
}

/**
 * 购买校验与状态转移（现 shell-affinity.js:325-331 纯化，设计档 §2.6）：纯函数——不改入参、不改闭包状态。
 * 喂食语义（只加 bonus、不产生可兑换 token——杜绝"买食物→赚token→再换钱"循环）在成功路径内逐字保留。
 * 返回 { ok:true, state }（currency − price · bonus + bonusPoints · food[id] +1；usage / wallet 原样带回）
 *   或 { ok:false, message }（id 不存在 / currency 不足——数值零变动）。
 */
function applyFoodPurchase(state, foodId) {
  const st = state || {};
  const food = FOODS.find((f) => f.id === foodId);
  if (!food) return { ok: false, message: '没有这种食物' };
  const currency = st.currency || 0;
  if (currency < food.price) return { ok: false, message: '💴 不够啦，先去兑换吧' };
  const foodCounts = { ...(st.food || {}) };
  foodCounts[food.id] = (foodCounts[food.id] || 0) + 1;
  return {
    ok: true,
    state: {
      usage: st.usage,
      wallet: st.wallet,
      bonus: (st.bonus || 0) + Math.round(food.bonusTokens / AFFINITY_RATE),
      currency: currency - food.price,
      food: foodCounts,
    },
  };
}

const AffinityCore = {
  AFFINITY_RATE, EXCHANGE_RATE, LEVEL_THRESHOLDS, MAX_LEVEL, FOODS,
  levelForPoints, affinityPoints, buildAffinityView, shouldAnnounceLevelUp, applyFoodPurchase,
};

// 双环境导出尾巴：node（桩测 / 主进程 require）与浏览器（<script> 全局）同源装载（口径同 pet-work-core.js）。
if (typeof module !== 'undefined' && module.exports) module.exports = AffinityCore;
if (typeof window !== 'undefined') window.AffinityCore = AffinityCore;
