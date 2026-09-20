'use strict';
/**
 * pet-unlock-core.js — 动作解锁三把锁纯函数核：时节 / 饭点 / 等级三门判定 + 可选集计算 + 规则档校验 + 解锁来源键（B23；设计档 docs/design/PET-UNLOCK.md §2.5.1）。
 * 边界（设计档 §2.5.1）：零 DOM / 零 IPC / 零 fs——可被 node 直接装载（桩测装载真实实现，NFR-27）；时钟一律入参 `now`，本档不自行取时（AC-B23-10 符号级断言）。
 * 函数清单：rollDayKey · resolveWindows · isSeasonOpen · isMealOpen · validateRules · eligible · unlockKeys · unlockNotice · mealKeyOf · prunePlayedMeals · mealPlayed · gateStep · unlockView（图鉴卡片墙视图面）
 *   · validatePrefs · togglePref · playbackPlan · clampWindowSize（B35；设计档 docs/design/PET-GALLERY.md §2.5.1）；常量 GALLERY_MAX_PLAYING；双环境导出尾巴见档末。
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
 * 可选集计算（核心入口，PET-UNLOCK §2.5.1 + PET-GALLERY §2.5.1）⇒ { allowSet, lockedNames }。
 * 合取语义：时节 = 门 ∧ 当日 ∈ 窗口（D-2 不按等级锁）；饭点 = 门 ∧ 当刻 ∈ 窗口 ∧ 当日未演（状态面不随开关走）；普通 = 门 ∧ level ≥ 级；
 *   任一门关 = 该门来源不过滤（全关 ⇒ 全池）。B35 三谓词（`prefs` / `favOnly` / `lv10` 缺席 ⇒ B23 语义逐字）：屏蔽 = 硬排除（优先一切域，D-3）；
 *   `lv10Free = lv10 开 ∧ level ≥ 10` ⇒ 时节日期窗 / 饭点时刻窗 / 一天一次三解除（D-4）；`favOnly` ⇒ 合取「∧ 喜欢」（不越锁，域门在先）。
 * `input` = { poolNames, rules, now, level, switches, playedMeals, quiet, prefs }；`quiet` = 坏档 / 过期「无锁」回落标记。
 */
function eligible(input) {
  const src = input || {};
  const pool = Array.isArray(src.poolNames) ? src.poolNames : [];
  const rules = src.rules;
  const now = src.now;
  const sw = isObj(src.switches) ? src.switches : {};
  const played = isObj(src.playedMeals) ? src.playedMeals : {};
  const level = Number.isFinite(src.level) ? src.level : 1;
  const prefs = isObj(src.prefs) ? src.prefs : {};
  const liked = {}; for (const n of (Array.isArray(prefs.liked) ? prefs.liked : [])) liked[n] = true;
  const blocked = {}; for (const n of (Array.isArray(prefs.blocked) ? prefs.blocked : [])) blocked[n] = true;
  const favOnly = sw.favOnly === true, lv10Free = sw.lv10 !== false && level >= 10;   // lv10Free：Lv.1–9 / 开关关两路恒假 ⇒ 既有路径逐字（硬约束 5）
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
    if (blocked[name]) { lockedNames.push(name); continue; }   // 屏蔽优先于一切域（D-3 / §2.2.4）
    let pass;
    if (src.quiet === true) pass = true;   // 坏档 / 过期 ⇒ 整体回落「无锁」（NFR-29；特权不改本路径）
    else if (seasonOf[name]) pass = !seasonOn || lv10Free || isSeasonOpen(seasonOf[name], now);   // 时节域：D-2 只按日期锁；D-4 特权解除日期窗
    else if (mealKeyOf(rules, name)) {   // 饭点域：时刻窗 + 状态面「一天一次」；D-4 特权两判齐解
      const key = mealKeyOf(rules, name);
      pass = (lv10Free || playedToday.indexOf(key) < 0) && (!mealOn || lv10Free || isMealOpen(rules.meals, key, now));
    } else { const need = levelOf(rules, name); pass = !levelOn || need === 0 || level >= need; }   // 等级门域：照旧（Lv.10 本就全量收口）
    if (pass && favOnly && !liked[name]) pass = false;   // favOnly 合取（锁着的喜欢段仍不入选）
    if (pass) allowSet.push(name); else lockedNames.push(name);
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
 * 图鉴卡片墙视图（B35 / US-46；`unlock:view` 通道原地演进 §2.2.9——B23 文字行形态退役）⇒ { favorites, sections, resident, totals, favOnly, level }。
 * card = { name, src, cond, unlocked, liked, blocked, likeable, blockable, badges }；覆盖 = categories 80 主面（排序承 B23 U-9①；喜欢组置顶、收藏段不重出）
 *   + 常驻 / 事件 16 签展示（基础档 8 + 事件独占 8——不计分母、不可喜欢不可屏蔽）。「已解锁」= 三锁 + 特权（不含屏蔽与 favOnly）；判定 = 本档 eligible 单点；
 * 「特权」徽标（修正轮 #4+N3）= 时节 / 饭点域 ∧ 对应门开 ∧ 无特权下当刻为锁 ∧ lv10Free ∧ 未被屏蔽；规则档不可用 ⇒ 全部按已解锁展示（同源回落）。
 */
function unlockView(input) {
  const src = input || {};
  const pool = src.pool && Array.isArray(src.pool.categories) ? src.pool : { categories: [] };
  const rules = src.rules;
  const now = src.now;
  const level = Number.isFinite(src.level) ? src.level : 1;
  const sw = isObj(src.switches) ? src.switches : {};
  const names = pool.categories.flatMap((c) => c.actions);
  const dir = typeof pool.dir === 'string' ? pool.dir : '';
  const ext = typeof pool.ext === 'string' ? pool.ext : '';
  const ev = isObj(pool.events) ? pool.events : {};
  const protectedNames = [];   // 独占三段（events.drag / escape / quiet 唯一段）= 结构保护（US-48）
  for (const k of ['drag', 'escape', 'quiet']) for (const n of (Array.isArray(ev[k]) ? ev[k] : [ev[k]])) {
    if (typeof n === 'string' && protectedNames.indexOf(n) < 0) protectedNames.push(n);
  }
  const prefs = validatePrefs(src.prefs, names, protectedNames);
  const likedSet = {}; for (const n of prefs.liked) likedSet[n] = true;
  const blockedSet = {}; for (const n of prefs.blocked) blockedSet[n] = true;
  const valid = validateRules(rules, names, now).ok;
  const gate = valid ? eligible({ poolNames: names, rules, now, level, switches: { season: sw.season, meal: sw.meal, level: sw.level, lv10: sw.lv10 }, playedMeals: src.playedMeals }).allowSet : names;
  const unlockSet = {};
  for (const n of gate) unlockSet[n] = true;
  const lv10Free = sw.lv10 !== false && level >= 10, day = now instanceof Date ? rollDayKey(now) : null;
  const playedToday = isObj(src.playedMeals) && Array.isArray(src.playedMeals[day]) ? src.playedMeals[day] : [];
  const seasonOf = {};
  if (isObj(rules) && Array.isArray(rules.seasonal)) for (const r of rules.seasonal) if (isObj(r)) seasonOf[r.action] = r;
  const privileged = (name) => {   // 「特权」徽标谓词（本应被时间锁住、因满级而放行的段）
    if (!lv10Free || blockedSet[name]) return false;
    if (seasonOf[name]) return sw.season !== false && !isSeasonOpen(seasonOf[name], now);
    const mk = mealKeyOf(rules, name);
    if (mk) return sw.meal !== false && (playedToday.indexOf(mk) >= 0 || !isMealOpen(rules.meals, mk, now));
    return false;
  };
  const card = (name) => {
    const u = !!unlockSet[name];
    const badges = [u ? '已解锁' : '未解锁'];
    if (likedSet[name]) badges.push('♥ 喜欢');
    if (blockedSet[name]) badges.push('已屏蔽');
    if (privileged(name)) badges.push('特权');
    if (protectedNames.indexOf(name) >= 0) badges.push('事件独占');
    return {
      name, src: dir + '/' + encodeURIComponent(name) + ext, cond: valid ? unlockCondition(name, rules, now) : '规则档不可用',
      unlocked: u, liked: !!likedSet[name], blocked: !!blockedSet[name], likeable: true, blockable: protectedNames.indexOf(name) < 0, badges,
    };
  };
  const favorites = prefs.liked.map(card);
  const sections = [];
  let unlocked = 0;
  for (const c of pool.categories) {
    const list = c.actions.slice().sort((a, b) => (unlockSortKey(a, rules, now) < unlockSortKey(b, rules, now) ? -1 : 1));
    let catUnlocked = 0;
    const cards = [];
    for (const n of list) {
      if (unlockSet[n]) { unlocked += 1; catUnlocked += 1; }
      if (likedSet[n]) continue;   // 喜欢组置顶、不重出于分类组（D-2 / §2.3）
      cards.push(card(n));
    }
    sections.push({ id: c.id, unlocked: catUnlocked, total: c.actions.length, cards });
  }
  // 常驻 / 事件区（签展示、不计分母）：基础档（idle / turn / moves）+ 事件独占段（events 内不在 categories 与基础档的名）
  const resident = [];
  const seen = {};
  const baseNames = [];
  const mv = isObj(pool.moves) ? pool.moves : {};
  for (const arr of [pool.idle, pool.turn, mv.walk, mv.run]) for (const n of (Array.isArray(arr) ? arr : [])) baseNames.push(n);
  const catSet = {}; for (const n of names) catSet[n] = true;
  const baseSet = {}; for (const n of baseNames) baseSet[n] = true;
  const pushResident = (name, tag) => {
    if (typeof name !== 'string' || seen[name]) return;
    seen[name] = true;
    resident.push({ name, src: dir + '/' + encodeURIComponent(name) + ext, cond: tag === '常驻' ? '常驻动作 · 始终可演' : '事件动作 · 触发表演', unlocked: true, liked: false, blocked: false, likeable: false, blockable: false, badges: [tag] });
  };
  for (const n of baseNames) pushResident(n, '常驻');
  for (const k of Object.keys(ev)) for (const n of (Array.isArray(ev[k]) ? ev[k] : [ev[k]])) if (!catSet[n] && !baseSet[n]) pushResident(n, '事件');
  return { favorites, sections, resident, totals: { unlocked, total: names.length }, favOnly: sw.favOnly === true, level };
}

// ---- B35 偏好面（喜欢 / 屏蔽；设计档 PET-GALLERY.md §2.4.1 / §2.5.1；纯函数，判定与链同源单点）----
/** 卡墙并发上限（NFR-30 / U-3；单点定义——exchange.js 经 `window.PetUnlockCore` 消费）。 */
const GALLERY_MAX_PLAYING = 8;

/** prefs 校验归一化（NFR-33 谓词单点）⇒ { liked, blocked }：池外名剔除（两集合 ⊆ categories 段）· 去重 · 独占段移出 blocked（结构保护，US-48）· 交集按屏蔽归一。 */
function validatePrefs(prefs, poolNames, protectedNames) {
  const src = isObj(prefs) ? prefs : {};
  const inPool = {}; for (const n of (Array.isArray(poolNames) ? poolNames : [])) inPool[n] = true;
  const prot = {}; for (const n of (Array.isArray(protectedNames) ? protectedNames : [])) prot[n] = true;
  const liked = [];
  for (const n of (Array.isArray(src.liked) ? src.liked : [])) {
    if (typeof n !== 'string' || !inPool[n] || liked.indexOf(n) >= 0) continue;
    liked.push(n);
  }
  const blocked = [];
  for (const n of (Array.isArray(src.blocked) ? src.blocked : [])) {
    if (typeof n !== 'string' || !inPool[n] || prot[n] || blocked.indexOf(n) >= 0) continue;
    blocked.push(n);
  }
  return { liked: liked.filter((n) => blocked.indexOf(n) < 0), blocked };
}

/** 喜欢 / 屏蔽互斥翻转的原子纯函数（IPC 处理器唯一 mutation 入口）⇒ newPrefs | null（kind 非法或 `ctx.blockable=false` 的屏蔽 ⇒ null；like 置位即清 block，反之亦然）。 */
function togglePref(prefs, name, kind, on, ctx) {
  if (typeof name !== 'string' || !name) return null;
  if (kind !== 'like' && kind !== 'block') return null;
  if (kind === 'block' && isObj(ctx) && ctx.blockable === false) return null;
  const src = isObj(prefs) ? prefs : {};
  const liked = (Array.isArray(src.liked) ? src.liked : []).slice();
  const blocked = (Array.isArray(src.blocked) ? src.blocked : []).slice();
  const flip = (arr, add) => {
    const i = arr.indexOf(name);
    if (add && i < 0) arr.push(name);
    if (!add && i >= 0) arr.splice(i, 1);
  };
  if (kind === 'like') { flip(liked, !!on); if (on) flip(blocked, false); }
  else { flip(blocked, !!on); if (on) flip(liked, false); }
  return { liked, blocked };
}

/** 卡墙播放计划（US-46 / NFR-30 / §2.5.3）⇒ { play, pause }：`cards` = 卡名 → { visible, playing }（键序 = 入视先后，补播同序）；可见 ∧ 未播 ∧ 播数 < cap ⇒ play；不可见 ∧ 在播 ⇒ pause；可见超 cap ⇒ 待命。 */
function playbackPlan(cards, cap) {
  const src = isObj(cards) ? cards : {};
  const limit = Number.isFinite(cap) ? Math.max(0, cap) : GALLERY_MAX_PLAYING;
  const keys = Object.keys(src);
  const pause = [];
  let used = 0;
  for (const k of keys) {
    const c = isObj(src[k]) ? src[k] : {};
    if (c.playing && c.visible) used += 1;
    else if (c.playing && !c.visible) pause.push(k);
  }
  const play = [];
  for (const k of keys) {
    const c = isObj(src[k]) ? src[k] : {};
    if (c.visible && !c.playing && used < limit) { play.push(k); used += 1; }
  }
  return { play, pause };
}

/** 弹窗尺寸钳制（US-44 / TC-B35-18）：非法 / null ⇒ 默认；钳入 [min, workArea]。`limits` = { minW, minH, defW, defH }（数值权威 = shell-affinity.js 的 EXCHANGE_* 常量；本档内值 = 缺省兜底）。 */
function clampWindowSize(size, workArea, limits) {
  const lim = isObj(limits) ? limits : {};
  const minW = lim.minW > 0 ? lim.minW : 480;
  const minH = lim.minH > 0 ? lim.minH : 420;
  const defW = lim.defW > 0 ? lim.defW : 720;
  const defH = lim.defH > 0 ? lim.defH : 560;
  const wa = isObj(workArea) ? workArea : {};
  const maxW = Math.max(minW, wa.width > 0 ? wa.width : defW);
  const maxH = Math.max(minH, wa.height > 0 ? wa.height : defH);
  const w = isObj(size) ? Number(size.w) : NaN;
  const h = isObj(size) ? Number(size.h) : NaN;
  if (!Number.isFinite(w) || !Number.isFinite(h)) return { w: Math.min(defW, maxW), h: Math.min(defH, maxH) };
  return { w: Math.round(Math.min(Math.max(w, minW), maxW)), h: Math.round(Math.min(Math.max(h, minH), maxH)) };
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
 * 门控一步（纯函数；规则档原文 → 校验 + 跨日裁剪 + 三门判定 + 提示判据）⇒ { allowSet, lockHint, fresh, state, blockSet, likeSet }。
 * `input` = { rulesText, poolNames, now, level, switches, state, prefs, protectedNames }；规则档不可用 ⇒ `allowSet = null`（回落「无锁」，NFR-29）。
 * B35：`switches` 增 `favOnly` / `lv10`（缺席 = false / true）；`prefs` 经 `validatePrefs` 归一化后入 `eligible`（合取在主进程完成——渲染层零判定，承 DD-B23-8），
 *   归一化集合以 `blockSet` / `likeSet` 输出（payload 直用；规则档不可用路径照出——事件过滤不依赖规则档）。`lockHint` = { valid, reason, switches, meals }。
 */
function gateStep(input) {
  const src = input || {};
  const now = src.now;
  const sw = isObj(src.switches) ? src.switches : {};
  const prev = isObj(src.state) ? src.state : {};
  const day = now instanceof Date ? rollDayKey(now) : null;
  const playedMeals = prunePlayedMeals(prev.playedMeals, day, 60);
  const notified = isObj(prev.notified) ? prev.notified : {};
  const prefsN = validatePrefs(src.prefs, src.poolNames, src.protectedNames);
  let rules = null;
  try { rules = JSON.parse(src.rulesText); } catch { rules = null; }
  const v = validateRules(rules, src.poolNames, now);
  if (!v.ok) return { allowSet: null, lockHint: { valid: false, reason: v.reason, switches: sw, meals: {} }, fresh: [], state: { playedMeals, notified }, blockSet: prefsN.blocked, likeSet: prefsN.liked };
  const allowSet = eligible({ poolNames: src.poolNames, rules, now, level: src.level, switches: sw, playedMeals, prefs: prefsN }).allowSet;
  const notice = unlockNotice({ rules, now, level: src.level, switches: sw, notified });
  const meals = {};
  for (const k of MEAL_KEYS) if (typeof rules.mealActions[k] === 'string') meals[rules.mealActions[k]] = k;
  return { allowSet, lockHint: { valid: true, reason: '', switches: sw, meals }, fresh: notice.fresh, state: { playedMeals, notified: notice.notified }, blockSet: prefsN.blocked, likeSet: prefsN.liked };
}

const PetUnlockCore = {
  rollDayKey, resolveWindows, isSeasonOpen, isMealOpen, validateRules, eligible, unlockKeys, unlockNotice, mealKeyOf, prunePlayedMeals, mealPlayed, gateStep, unlockView,
  validatePrefs, togglePref, playbackPlan, clampWindowSize, GALLERY_MAX_PLAYING,
};

// 双环境导出尾巴：node（桩测 / 主进程 require）与浏览器（<script> 全局）同源装载（口径同 pet-chain-core.js:225-227）。
if (typeof module !== 'undefined' && module.exports) module.exports = PetUnlockCore;
if (typeof window !== 'undefined') window.PetUnlockCore = PetUnlockCore;
