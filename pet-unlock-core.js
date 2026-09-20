'use strict';
/**
 * pet-unlock-core.js — 动作解锁三把锁纯函数核：时节 / 饭点 / 等级三门判定 + 可选集计算 + 规则档校验 + 解锁来源键（B23；设计档 docs/design/PET-UNLOCK.md §2.5.1）。
 * 边界（设计档 §2.5.1）：零 DOM / 零 IPC / 零 fs——可被 node 直接装载（桩测装载真实实现，NFR-27）；时钟一律入参 `now`，本档不自行取时（AC-B23-10 符号级断言）。
 * 函数清单：rollDayKey · resolveWindows · isSeasonOpen · isMealOpen · validateRules · eligible · unlockKeys · unlockNotice · mealKeyOf · prunePlayedMeals · mealPlayed · gateStep · unlockView（图鉴视图面）；双环境导出尾巴见档末。
 */

// ---- 基础谓词（形态谓词集中一处；判定函数只吃已注入的入参） ----
/** 非数组对象。 */
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
/** 合法 ISO 自然日（`YYYY-MM-DD`）。 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
function isDay(v) { return typeof v === 'string' && DAY_RE.test(v); }
/** `HH:MM` → 自午夜分钟数；形态不合法（非 `HH:MM` / 越界）⇒ null。 */
function hm2min(s) {
  if (typeof s !== 'string' || !/^\d{2}:\d{2}$/.test(s)) return null;
  const h = Number(s.slice(0, 2)); const m = Number(s.slice(3));
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** 自然日键（本机时钟 00:00 分界；形态 = `YYYY-MM-DD`——`unlock-state.json` 的 playedMeals 键，设计档 §2.4.2）。 */
function rollDayKey(now) {
  const p = (n) => String(n).padStart(2, '0');
  return now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
}

/** 某节日条目在某年的窗口 `[start, end] | null`（键 = 该次节日的公历年份；§2.4.1 数据面）。 */
function resolveWindows(rule, year) {
  if (!isObj(rule) || !isObj(rule.windows)) return null;
  const w = rule.windows[String(year)];
  if (!Array.isArray(w) || w.length !== 2 || !isDay(w[0]) || !isDay(w[1]) || w[0] > w[1]) return null;
  return [w[0], w[1]];
}

/** 时节门：`now` 的自然日落入该条目任一窗口（闭区间）⇒ true（§2.5.1 合取语义 / §2.5.2 时间语义）。
 *  跨公历年键遍历：窗口键 = 该次节日的公历年份，而合法农历窗口可自然伸入次年 1 月（如腊八 2028 / 2031）——故按全部窗口取包含判定。 */
function isSeasonOpen(rule, now) {
  if (!isObj(rule) || !isObj(rule.windows)) return false;
  const day = rollDayKey(now);
  for (const key of Object.keys(rule.windows)) {
    const w = rule.windows[key];
    if (Array.isArray(w) && w.length === 2 && w[0] <= day && day <= w[1]) return true;
  }
  return false;
}

/** 饭点门：`now` 的时刻落入 `meals[mealKey]` 闭区间 ⇒ true（窗口倒置 / 形态不合法 ⇒ false）。 */
function isMealOpen(meals, mealKey, now) {
  if (!isObj(meals)) return false;
  const w = meals[mealKey];
  if (!Array.isArray(w) || w.length !== 2) return false;
  const a = hm2min(w[0]); const b = hm2min(w[1]);
  if (a === null || b === null || a > b) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= a && t <= b;
}

const MEAL_KEYS = ['breakfast', 'lunch', 'dinner'];

/**
 * 规则档显式校验（设计档 §2.6 四谓词 + §2.5.2 表到期；NFR-29）⇒ { ok, reason }。
 * 谓词：R1 结构 / R2 三餐窗口（键齐 · 形态合法 · 不倒置 · 不重叠——TC-B23-5 前提）/ R3 饭点段引用闭合 /
 *        R4 时节条目（形态 · 窗口倒置即拒绝 · 引用闭合）/ R5 等级门域（段名恰一次 + 覆盖谓词：并集 = 池段 − 时节段 − 饭点段，无遗漏）。
 * `poolNames` = 池 categories 段名数组（图鉴 / 链的门控域 = categories 面）；`now` 省略 ⇒ 跳过表到期检查。
 */
function validateRules(rules, poolNames, now) {
  const names = Array.isArray(poolNames) ? poolNames : [];
  if (!isObj(rules)) return { ok: false, reason: 'R1-shape' };
  if (!Number.isInteger(rules.version) || rules.version < 1) return { ok: false, reason: 'R1-version' };
  if (!isDay(rules.tableExpiry)) return { ok: false, reason: 'R1-expiry' };
  if (now instanceof Date && rollDayKey(now) > rules.tableExpiry) return { ok: false, reason: 'R1-expired' };
  const meals = rules.meals;
  if (!isObj(meals)) return { ok: false, reason: 'R2-meals' };
  const spans = [];
  for (const k of MEAL_KEYS) {
    const w = meals[k];
    if (!Array.isArray(w) || w.length !== 2) return { ok: false, reason: 'R2-meals' };
    const a = hm2min(w[0]); const b = hm2min(w[1]);
    if (a === null || b === null || a > b) return { ok: false, reason: 'R2-meals' };
    spans.push([a, b]);
  }
  for (let i = 1; i < spans.length; i++) if (spans[i][0] <= spans[i - 1][1]) return { ok: false, reason: 'R2-meals-overlap' };
  const mealActions = rules.mealActions;
  if (!isObj(mealActions)) return { ok: false, reason: 'R3-meals' };
  const mealNames = [];
  for (const k of MEAL_KEYS) {
    const n = mealActions[k];
    if (typeof n !== 'string' || !n || names.indexOf(n) < 0) return { ok: false, reason: 'R3-meals' };
    mealNames.push(n);
  }
  if (!Array.isArray(rules.seasonal)) return { ok: false, reason: 'R4-seasonal' };
  const seasonNames = [];
  for (const rule of rules.seasonal) {
    if (!isObj(rule) || typeof rule.action !== 'string' || !rule.action || typeof rule.name !== 'string' || !isObj(rule.windows)) return { ok: false, reason: 'R4-seasonal' };
    if (names.indexOf(rule.action) < 0) return { ok: false, reason: 'R4-ref' };
    const years = Object.keys(rule.windows);
    if (!years.length) return { ok: false, reason: 'R4-window' };
    for (const y of years) {
      const w = rule.windows[y];
      if (!Array.isArray(w) || w.length !== 2 || !isDay(w[0]) || !isDay(w[1]) || w[0] > w[1]) return { ok: false, reason: 'R4-window' };
    }
    seasonNames.push(rule.action);
  }
  if (!Array.isArray(rules.levelUnlock)) return { ok: false, reason: 'R5-level' };
  const seen = {};
  let listed = 0;
  for (const row of rules.levelUnlock) {
    if (!isObj(row) || !Number.isInteger(row.level) || row.level < 1 || row.level > 10 || !Array.isArray(row.actions)) return { ok: false, reason: 'R5-level' };
    for (const n of row.actions) {
      if (typeof n !== 'string' || names.indexOf(n) < 0) return { ok: false, reason: 'R5-ref' };
      if (seen[n] || seasonNames.indexOf(n) >= 0 || mealNames.indexOf(n) >= 0) return { ok: false, reason: 'R5-domain' };
      seen[n] = true; listed += 1;
    }
  }
  const expect = names.filter((n) => seasonNames.indexOf(n) < 0 && mealNames.indexOf(n) < 0);
  if (listed !== expect.length || expect.some((n) => !seen[n])) return { ok: false, reason: 'R5-coverage' };
  return { ok: true, reason: '' };
}

/** 等级门域的解锁级查表（段名 → 级；不在表内 ⇒ 0 = 不由等级门管）。 */
function levelOf(rules, name) {
  if (!isObj(rules) || !Array.isArray(rules.levelUnlock)) return 0;
  for (const row of rules.levelUnlock) if (Array.isArray(row.actions) && row.actions.indexOf(name) >= 0) return row.level;
  return 0;
}

/**
 * 可选集计算（核心入口，设计档 §2.5.1）⇒ { allowSet, lockedNames }。
 * 合取语义：时节段 = 时节门 ∧ 当日 ∈ 窗口（D-2：不按等级锁）；饭点段 = 饭点门 ∧ 当刻 ∈ 窗口 ∧ 当日未演；
 *   普通段 = 等级门 ∧ level ≥ 解锁级。**状态面**（「当日已演」排除）不随开关走（§2.5.1 ②，TC-B23-19）；
 *   **集合面**：任一门关闭 = 该门来源不做过滤（全解锁；三开关全关 ⇒ allowSet = 全池，TC-B23-18）。
 * `input` = { poolNames, rules, now, level, switches, playedMeals, quiet }；`quiet` = 规则档坏 / 表过期时的「无锁」回落标记。
 */
function eligible(input) {
  const src = input || {};
  const pool = Array.isArray(src.poolNames) ? src.poolNames : [];
  const rules = src.rules;
  const now = src.now;
  const sw = isObj(src.switches) ? src.switches : {};
  const played = isObj(src.playedMeals) ? src.playedMeals : {};
  const level = Number.isFinite(src.level) ? src.level : 1;
  const allowSet = [];
  const lockedNames = [];
  const day = now instanceof Date ? rollDayKey(now) : null;
  const seasonOn = sw.season !== false;
  const mealOn = sw.meal !== false;
  const levelOn = sw.level !== false;
  const mealActions = isObj(rules) && isObj(rules.mealActions) ? rules.mealActions : {};
  const seasonOf = {};
  if (isObj(rules) && Array.isArray(rules.seasonal)) for (const rule of rules.seasonal) if (isObj(rule)) seasonOf[rule.action] = rule;
  const playedToday = Array.isArray(played[day]) ? played[day] : [];
  for (const name of pool) {
    if (src.quiet === true) { allowSet.push(name); continue; }   // 坏档 / 过期 ⇒ 整体回落「无锁」（NFR-29）
    if (seasonOf[name]) {   // 时节域：D-2 = 只按日期锁
      if (!seasonOn || isSeasonOpen(seasonOf[name], now)) allowSet.push(name); else lockedNames.push(name);
    } else if (mealKeyOf(rules, name)) {   // 饭点域：时刻窗 + 状态面「一天一次」
      const key = mealKeyOf(rules, name);
      if (playedToday.indexOf(key) >= 0) lockedNames.push(name);
      else if (!mealOn || isMealOpen(rules.meals, key, now)) allowSet.push(name);
      else lockedNames.push(name);
    } else {   // 等级门域
      const need = levelOf(rules, name);
      if (!levelOn || need === 0 || level >= need) allowSet.push(name); else lockedNames.push(name);
    }
  }
  return { allowSet, lockedNames };
}

/** 命中窗口的年份键（含 `now` 的自然日 ∈ 某窗口；无命中 ⇒ null）——**跨公历年窗口**（腊八 2028 / 2031）两侧同键 ⇒ 同一节日实例只提示一次。 */
function seasonWindowYear(rule, now) {
  if (!isObj(rule) || !isObj(rule.windows)) return null;
  const day = rollDayKey(now);
  for (const key of Object.keys(rule.windows)) {
    const w = rule.windows[key];
    if (Array.isArray(w) && w.length === 2 && w[0] <= day && day <= w[1]) return key;
  }
  return null;
}

/** 当前开放的解锁来源键（US-42 提示面输入）：等级门开 ⇒ `level:<n>`（n = 2…当前级）；时节门开 ⇒ `season:<窗口年键>-<节日名>`（命中窗口）。 */
function unlockKeys(input) {
  const src = input || {};
  const rules = src.rules;
  const sw = isObj(src.switches) ? src.switches : {};
  const keys = [];
  if (isObj(rules) && sw.level !== false) {
    const level = Number.isFinite(src.level) ? src.level : 1;
    for (let n = 2; n <= level; n++) keys.push('level:' + n);
  }
  if (isObj(rules) && Array.isArray(rules.seasonal) && sw.season !== false && src.now instanceof Date) {
    for (const rule of rules.seasonal) {
      const y = isObj(rule) ? seasonWindowYear(rule, src.now) : null;
      if (y !== null) keys.push('season:' + y + '-' + rule.name);
    }
  }
  return keys;
}

/** 解锁提示判据（US-42 / AC-B23-7）：`fresh` = 本次新开放且不在 `notified` 快照内的键；`notified` = 合并后的新快照（纯函数，不改入参）。 */
function unlockNotice(input) {
  const src = input || {};
  const prev = isObj(src.notified) ? src.notified : {};
  const keys = unlockKeys(src);
  const fresh = keys.filter((k) => !prev[k]);
  const notified = Object.assign({}, prev);
  for (const k of keys) notified[k] = true;
  return { fresh, notified };
}

/** 段名 → 饭点键（不属于三餐 ⇒ null；一天一次判据的段级入口，§2.5.3）。 */
function mealKeyOf(rules, name) {
  if (!isObj(rules) || !isObj(rules.mealActions)) return null;
  for (const k of Object.keys(rules.mealActions)) if (rules.mealActions[k] === name) return k;
  return null;
}

// ---- 图鉴视图面（US-43 / §2.3；纯函数——数据读取在壳层，组装在本档，与链同源单点）----
const MEAL_LABEL = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner'];

/** 解锁条件串（U-10 可读化）：饭点 = 时段 + 一天一次；时节 = **命中窗口优先**（无命中 ⇒ 下一未到窗口 ⇒ 末条）；等级 = 规则档解锁级（运行时值、零阈值数字）。 */
function unlockCondition(name, rules, now) {
  const mk = mealKeyOf(rules, name);
  if (mk) { const w = ((rules.meals || {})[mk]) || []; return MEAL_LABEL[mk] + '时段（' + w[0] + '–' + w[1] + '）一天一次'; }
  const season = (isObj(rules) && Array.isArray(rules.seasonal) ? rules.seasonal : []).find((r) => r.action === name);
  if (season) {
    const wins = season.windows || {};
    const ys = Object.keys(wins).sort();
    const day = rollDayKey(now);
    const hit = ys.find((y) => wins[y][0] <= day && day <= wins[y][1]);
    const next = ys.find((y) => wins[y][0] > day);
    const w = wins[hit || next || ys[ys.length - 1]];
    return w ? season.name + '：' + w[0] + ' 至 ' + w[1] : season.name;
  }
  const row = (isObj(rules) && Array.isArray(rules.levelUnlock) ? rules.levelUnlock : []).find((r) => (r.actions || []).indexOf(name) >= 0);
  return row ? '好感 Lv.' + row.level + ' 解锁' : '常规动作';
}

/** 组内排序键（U-9 ①）：等级域按解锁级升序 → 时节域按**命中窗口**（无命中 ⇒ 下一未到窗口 ⇒ 末条）日期序 → 饭点域按餐序。 */
function unlockSortKey(name, rules, now) {
  const mk = mealKeyOf(rules, name);
  if (mk) return '2' + MEAL_ORDER.indexOf(mk);
  const season = (isObj(rules) && Array.isArray(rules.seasonal) ? rules.seasonal : []).find((r) => r.action === name);
  if (season) {
    const wins = season.windows || {};
    const ys = Object.keys(wins).sort();
    const day = rollDayKey(now);
    const hit = ys.find((y) => wins[y][0] <= day && day <= wins[y][1]);
    const next = ys.find((y) => wins[y][0] > day);
    const w = wins[hit || next || ys[ys.length - 1]];
    return '1' + (w ? w[0] : '');
  }
  const row = (isObj(rules) && Array.isArray(rules.levelUnlock) ? rules.levelUnlock : []).find((r) => (r.actions || []).indexOf(name) >= 0);
  return '0' + String(row ? row.level : 0).padStart(2, '0');
}

/**
 * 图鉴视图（US-43 / AC-B23-8）⇒ { rows, totals, byCategory }：行 = 动作名 / 分类 / 条件串 / 解锁态；
 * 百分比分母 = **可解锁面**（categories 段——排除基础档 / 事件档，§2.2.3 口径 ②）；分组与组内排序 = U-9 ①；
 * 判定与链同源（本档 `eligible` 单点）；规则档不可用 ⇒ 全部按已解锁展示（与链同源回落）。
 */
function unlockView(input) {
  const src = input || {};
  const pool = src.pool && Array.isArray(src.pool.categories) ? src.pool : { categories: [] };
  const rules = src.rules;
  const now = src.now;
  const names = pool.categories.flatMap((c) => c.actions);
  const valid = validateRules(rules, names, now).ok;
  const allowed = valid ? eligible({ poolNames: names, rules, now, level: src.level, switches: src.switches, playedMeals: src.playedMeals }).allowSet : names;
  const set = {};
  for (const n of allowed) set[n] = true;
  const rows = [];
  const byCategory = {};
  let unlocked = 0;
  for (const c of pool.categories) {
    const list = c.actions.slice().sort((a, b) => (unlockSortKey(a, rules, now) < unlockSortKey(b, rules, now) ? -1 : 1));
    let catUnlocked = 0;
    for (const n of list) {
      const u = !!set[n];
      if (u) { unlocked += 1; catUnlocked += 1; }
      rows.push({ name: n, category: c.id, cond: valid ? unlockCondition(n, rules, now) : '规则档不可用', unlocked: u });
    }
    byCategory[c.id] = { unlocked: catUnlocked, total: c.actions.length };
  }
  return { rows, totals: { unlocked, total: names.length }, byCategory };
}

/** playedMeals 裁剪（保留最近 `keep` 天 + 必保当前日键；O-B23-4；返回新对象，不改入参）。 */
function prunePlayedMeals(playedMeals, day, keep) {
  const src = isObj(playedMeals) ? playedMeals : {};
  const keys = Object.keys(src).sort();
  const drop = keys.length - Math.max(1, Number.isFinite(keep) ? keep : 60);
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    if (i < drop && keys[i] !== day) continue;
    out[keys[i]] = src[keys[i]];
  }
  return out;
}

/** 饭点「演过」置位（纯函数，§2.5.3）：饭点键合法且当日未演 ⇒ 返回新 state；无变更 ⇒ null（不改入参）。 */
function mealPlayed(state, mealKey, day) {
  if (MEAL_KEYS.indexOf(mealKey) < 0 || typeof day !== 'string') return null;
  const prev = isObj(state) ? state : {};
  const played = isObj(prev.playedMeals) ? prev.playedMeals : {};
  const list = Array.isArray(played[day]) ? played[day] : [];
  if (list.indexOf(mealKey) >= 0) return null;
  const next = Object.assign({}, played);
  next[day] = list.concat([mealKey]);
  return { playedMeals: next, notified: isObj(prev.notified) ? prev.notified : {} };
}

/**
 * 门控一步（纯函数；规则档原文 → 校验 + 跨日裁剪 + 三门判定 + 提示判据）⇒ { allowSet, lockHint, fresh, state }。
 * `input` = { rulesText, poolNames, now, level, switches, state }；规则档解析失败 / 校验不过 / 表过期 ⇒
 *   `allowSet = null` 与 `lockHint.valid = false`（渲染层不达滤 = 回落「无锁」，NFR-29）；`state` 返回新对象（不改入参）。
 * `lockHint` = { valid, reason, switches, meals }（meals = 段名 → 饭点键映射；不含等级数值与阈值）。
 */
function gateStep(input) {
  const src = input || {};
  const now = src.now;
  const sw = isObj(src.switches) ? src.switches : {};
  const prev = isObj(src.state) ? src.state : {};
  const day = now instanceof Date ? rollDayKey(now) : null;
  const playedMeals = prunePlayedMeals(prev.playedMeals, day, 60);
  const notified = isObj(prev.notified) ? prev.notified : {};
  let rules = null;
  try { rules = JSON.parse(src.rulesText); } catch { rules = null; }
  const v = validateRules(rules, src.poolNames, now);
  if (!v.ok) return { allowSet: null, lockHint: { valid: false, reason: v.reason, switches: sw, meals: {} }, fresh: [], state: { playedMeals, notified } };
  const allowSet = eligible({ poolNames: src.poolNames, rules, now, level: src.level, switches: sw, playedMeals }).allowSet;
  const notice = unlockNotice({ rules, now, level: src.level, switches: sw, notified });
  const meals = {};
  for (const k of MEAL_KEYS) if (typeof rules.mealActions[k] === 'string') meals[rules.mealActions[k]] = k;
  return { allowSet, lockHint: { valid: true, reason: '', switches: sw, meals }, fresh: notice.fresh, state: { playedMeals, notified: notice.notified } };
}

const PetUnlockCore = {
  rollDayKey, resolveWindows, isSeasonOpen, isMealOpen, validateRules, eligible, unlockKeys, unlockNotice, mealKeyOf, prunePlayedMeals, mealPlayed, gateStep, unlockView,
};

// 双环境导出尾巴：node（桩测 / 主进程 require）与浏览器（<script> 全局）同源装载（口径同 pet-chain-core.js:225-227）。
if (typeof module !== 'undefined' && module.exports) module.exports = PetUnlockCore;
if (typeof window !== 'undefined') window.PetUnlockCore = PetUnlockCore;
