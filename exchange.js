'use strict';
/* 鲸鱼娘兑换屋 renderer（B35 重写：喂养面头部卡 + 食品网格 + 图鉴视频卡片墙；设计档 docs/design/PET-GALLERY.md §2.3 / §2.5.3） */
const api = window.exchangeAPI;

let view = null;
let busy = false;

function fmt(n) {
  return Number(n || 0).toLocaleString('zh-CN');
}

function showMsg(text, isErr) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.style.color = isErr ? '#ff8f8f' : '#ffb86b';
}

// ---------------------------------------------------------------------------
// 喂养面（US-45）：头部卡字段 + 食品卡片网格（数据通道零改动；观感 = 人工目视 AC-B35-12）
// ---------------------------------------------------------------------------
function render() {
  if (!view) return;
  document.getElementById('usage').textContent = fmt(view.usage);
  document.getElementById('tokens').textContent = fmt(view.tokens);
  document.getElementById('affinity').textContent = view.maxed ? `Lv.${view.level} · MAX` : `Lv.${view.level} · ${view.points} 点`;
  document.getElementById('currency').textContent = fmt(view.currency);
  document.getElementById('rate-hint').textContent = `${fmt(view.exchangeRate)} token = 1💴`;
  const canExchange = Math.floor((view.tokens || 0) / view.exchangeRate);
  document.getElementById('exchange').disabled = canExchange <= 0;
  document.getElementById('exchange').textContent = canExchange > 0 ? `兑换 💴（可兑 ${canExchange}💴）` : '兑换 💴';
  renderFoods();
}

/** 食品卡片网格（图标 / 名 / 持有 / 加成 / 价格 / 买钮；createElement 构建——桩测可断言，TC-B35-22）。 */
function renderFoods() {
  const grid = document.getElementById('foods');
  grid.innerHTML = '';
  for (const f of view.foods || []) {
    const owned = (view.food && view.food[f.id]) || 0;
    const card = document.createElement('div');
    card.className = 'food-card';
    const emoji = document.createElement('div');
    emoji.className = 'emoji';
    emoji.textContent = f.emoji;
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = f.name;
    const ownedEl = document.createElement('div');
    ownedEl.className = 'owned';
    ownedEl.textContent = `持有 ×${owned}`;
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = `喂食好感 +${f.bonusPoints} · ${f.msg}`;
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = `${f.price}💴`;
    const buy = document.createElement('button');
    buy.className = 'buy';
    buy.textContent = '买';
    buy.disabled = busy || view.currency < f.price;
    buy.addEventListener('click', () => doBuy(f.id));
    for (const el of [emoji, name, ownedEl, desc, price, buy]) card.appendChild(el);
    grid.appendChild(card);
  }
}

async function doBuy(id) {
  if (busy) return;
  busy = true;
  render();
  try {
    const res = await api.buy(id);
    if (!res.ok) { showMsg(res.message, true); return; }
    view = res.view;
    render();
    showMsg('✅ ' + res.message);
  } catch (err) {
    showMsg('购买出错：' + (err && err.message || err), true);
    console.error('[exchange] buy error', err);
  } finally {
    busy = false;
    render();
  }
}

async function refresh() {
  try {
    view = await api.view();
    render();
    // 图鉴卡在场时随既有 refresh 节拍（5 s tick + 窗口聚焦）重取，避免陈旧（指纹不变 ⇒ 不重建卡墙 DOM）
    if (!document.getElementById('panel-unlock').hidden) await refreshUnlock();
  } catch (err) {
    console.error('[exchange] refresh error', err);
    showMsg('刷新失败：' + (err && err.message || err), true);
  }
}

document.getElementById('exchange').onclick = async () => {
  if (busy) return;
  busy = true;
  render();
  try {
    const res = await api.exchange();
    if (!res.ok) { showMsg(res.message, true); return; }
    view = res.view;
    render();
    showMsg('✅ ' + res.message);
  } catch (err) {
    showMsg('兑换出错：' + (err && err.message || err), true);
    console.error('[exchange] exchange error', err);
  } finally {
    busy = false;
    render();
  }
};

// 每 5 秒刷新一次（token 持续累积）；窗口聚焦时也立刻刷新，避免陈旧数据
setInterval(refresh, 5000);
window.addEventListener('focus', refresh);
refresh();

// ---------------------------------------------------------------------------
// B35 动作图鉴 = 视频卡片墙（US-46…US-49；渲染零判定——数据由主进程 `unlock:view` 组装，PET-GALLERY §3.2）
// ---------------------------------------------------------------------------
let unlock = null;
let unlockFingerprint = '';   // 视图指纹（关键形态 JSON）：不变 ⇒ 不重建卡墙 DOM（防 5 s 节拍打断在播视频，§2.5.3）
const cardEls = new Map();    // 卡实例键 → { card, video }（本帧卡墙元素索引；重建即重置）
const playState = new Map();  // 卡实例键 → { visible, playing }（键序 = 入视先后——playbackPlan 补播次序输入）
let cardSeq = 0;              // 卡实例序号：同名段在分类组与常驻区可并存（悠闲哼歌 / 摇扇纳凉 ∈ 小动作 ∧ idle）⇒ 调度以「名#序号」为键，不吃名字冲突
let io = null;                // IntersectionObserver（阈值 0.25，根容器 = 视口——卡墙滚动框即文档）

function pct(u, t) { return t > 0 ? Math.round((u / t) * 100) : 0; }

/** 标签卡切换（默认停「喂养」卡——右键打开行为与今天一致）。 */
function switchTab(which) {
  document.getElementById('tab-food').classList.toggle('active', which === 'food');
  document.getElementById('tab-unlock').classList.toggle('active', which === 'unlock');
  document.getElementById('panel-food').hidden = which !== 'food';
  document.getElementById('panel-unlock').hidden = which !== 'unlock';
  if (which === 'unlock') refreshUnlock();
}

/** 徽标样式名（展示面映射，判定零改动）。 */
function badgeClass(b) {
  if (b === '已解锁') return 'b-unlocked';
  if (b === '♥ 喜欢') return 'b-liked';
  if (b === '已屏蔽') return 'b-blocked';
  if (b === '特权') return 'b-priv';
  return 'b-tag';
}

/** 卡片构建：视频位（懒加载——未入视不赋 src）+ 名 + 条件 + 徽标行 + 操作钮（按 likeable / blockable 显隐；独占段标「不可屏蔽」）。 */
function buildCard(c) {
  const el = document.createElement('div');
  el.className = 'g-card' + (c.unlocked ? '' : ' locked') + (c.blocked ? ' blocked-card' : '');
  el.dataset.name = c.name;
  const uid = c.name + '#' + cardSeq++;   // 卡实例键（同名段分类组 / 常驻区并存 ⇒ 播放调度按实例）
  el.dataset.uid = uid;
  const vw = document.createElement('div');
  vw.className = 'g-video';
  const v = document.createElement('video');
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = 'none';
  v.dataset.src = c.src;
  vw.appendChild(v);
  el.appendChild(vw);
  const body = document.createElement('div');
  body.className = 'g-body';
  const nm = document.createElement('div');
  nm.className = 'g-name';
  nm.textContent = c.name;
  const cond = document.createElement('div');
  cond.className = 'g-cond';
  cond.textContent = c.cond;
  const badges = document.createElement('div');
  badges.className = 'g-badges';
  for (const b of c.badges || []) {
    const s = document.createElement('span');
    s.className = 'g-badge ' + badgeClass(b);
    s.textContent = b;
    badges.appendChild(s);
  }
  const ops = document.createElement('div');
  ops.className = 'g-ops';
  if (c.likeable) {
    const lb = document.createElement('button');
    lb.className = 'g-op' + (c.liked ? ' on-like' : '');
    lb.textContent = c.liked ? '♥ 已喜欢' : '☆ 喜欢';
    lb.addEventListener('click', () => doLike(c));
    ops.appendChild(lb);
  }
  if (c.blockable) {
    const bb = document.createElement('button');
    bb.className = 'g-op' + (c.blocked ? ' on-block' : '');
    bb.textContent = c.blocked ? '取消屏蔽' : '⊘ 屏蔽';
    bb.addEventListener('click', () => doBlock(c));
    ops.appendChild(bb);
  } else if (c.likeable) {
    const note = document.createElement('div');
    note.className = 'g-note';
    note.textContent = '事件独占 · 不可屏蔽';
    ops.appendChild(note);
  }
  for (const x of [nm, cond, badges, ops]) body.appendChild(x);
  el.appendChild(body);
  cardEls.set(uid, { card: el, video: v });
  return el;
}

/** 卡组（标题行 + 网格容器）。 */
function addGroup(wall, title, countText) {
  const g = document.createElement('div');
  g.className = 'g-group';
  g.textContent = title + ' ';
  const c = document.createElement('span');
  c.className = 'cnt';
  c.textContent = countText || '';
  g.appendChild(c);
  wall.appendChild(g);
  const grid = document.createElement('div');
  grid.className = 'g-wall';
  wall.appendChild(grid);
  return grid;
}

/** 卡墙渲染（分组 / 徽标 / 置顶 / favOnly 过滤——§2.3；渲染零判定）。 */
function renderUnlock() {
  if (!unlock) return;
  const t = unlock.totals || { unlocked: 0, total: 0 };
  document.getElementById('gallery-total').textContent = `${t.unlocked} / ${t.total}（${pct(t.unlocked, t.total)}%）`;
  document.getElementById('gallery-bar').style.width = pct(t.unlocked, t.total) + '%';
  let nBlocked = 0;
  for (const sec of unlock.sections || []) for (const c of sec.cards || []) if (c.blocked) nBlocked += 1;
  document.getElementById('gallery-liked').textContent = String((unlock.favorites || []).length);
  document.getElementById('gallery-blocked').textContent = String(nBlocked);
  document.getElementById('fav-only').checked = unlock.favOnly === true;
  const wall = document.getElementById('gallery');
  wall.innerHTML = '';
  cardEls.clear();
  cardSeq = 0;
  const favs = unlock.favorites || [];
  if (unlock.favOnly) {   // 只看喜欢 ⇒ 全墙只显喜欢组（双面同键；空态给提示行——§2.2.7 / O-B35-3）
    if (favs.length) {
      const grid = addGroup(wall, '♥ 喜欢', String(favs.length));
      for (const c of favs) grid.appendChild(buildCard(c));
    } else {
      const e = document.createElement('div');
      e.className = 'g-empty';
      e.textContent = '还没有喜欢的动作——点卡片上的 ☆ 把她喜欢的表演收藏起来吧';
      wall.appendChild(e);
    }
  } else {
    if (favs.length) {   // 喜欢组置顶（D-2；收藏段不重出于分类组）
      const grid = addGroup(wall, '♥ 喜欢', String(favs.length));
      for (const c of favs) grid.appendChild(buildCard(c));
    }
    for (const sec of unlock.sections || []) {
      const grid = addGroup(wall, `${sec.id}（${sec.unlocked}/${sec.total}）`, '');
      for (const c of sec.cards || []) grid.appendChild(buildCard(c));
    }
    const resident = unlock.resident || [];
    if (resident.length) {   // 常驻 / 事件区（签展示、不计分母）沉底
      const grid = addGroup(wall, '常驻 / 事件', String(resident.length));
      for (const c of resident) grid.appendChild(buildCard(c));
    }
  }
  armObserver();
}

/** IO 武装（阈值 0.25）：重建即断开重挂；在播集合随 DOM 重建重置（观感 = 一次重排，§2.5.3）。 */
function armObserver() {
  if (io) io.disconnect();
  playState.clear();
  io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const uid = en.target && en.target.dataset ? en.target.dataset.uid : null;
      if (!uid) continue;
      const st = playState.get(uid) || { visible: false, playing: false };
      st.visible = !!en.isIntersecting;
      if (!playState.has(uid)) playState.set(uid, st);
      else st.visible = !!en.isIntersecting;
      if (st.visible) {   // 微修③：入视即赋 src + 载首帧（preload 升 metadata）——可见待命卡不黑框；播放仍按 cap ≤8 调度（NFR-30）
        const rec = cardEls.get(uid);
        if (rec && rec.video && !rec.video.src) { rec.video.src = rec.video.dataset.src; rec.video.preload = 'metadata'; rec.video.load(); }
      }
    }
    applyPlaybackPlan();
  }, { threshold: 0.25 });
  for (const el of document.querySelectorAll('.g-card')) io.observe(el);
}

/** 播放调度：并发上限内「入视即播」（懒加载赋 src）/「离屏即停」（pause）——计划 = pet-unlock-core.playbackPlan（同源纯函数）。 */
function applyPlaybackPlan() {
  if (!window.PetUnlockCore || !window.PetUnlockCore.playbackPlan) return;
  const input = {};
  for (const [k, v] of playState) input[k] = v;
  const plan = window.PetUnlockCore.playbackPlan(input, window.PetUnlockCore.GALLERY_MAX_PLAYING);
  for (const name of plan.play) {
    const rec = cardEls.get(name);
    if (!rec || !rec.video) continue;
    if (!rec.video.src) rec.video.src = rec.video.dataset.src;
    const p = rec.video.play();
    if (p && p.catch) p.catch(() => { /* 自动播放失败不冒泡（muted loop 正常可播） */ });
    const st = playState.get(name);
    if (st) st.playing = true;
  }
  for (const name of plan.pause) {
    const rec = cardEls.get(name);
    if (rec && rec.video) rec.video.pause();
    const st = playState.get(name);
    if (st) st.playing = false;
  }
}

/** 喜欢交互（US-47）：toggle 落盘后按返回视图原地重渲（置顶分组即时生效）。 */
async function doLike(c) {
  try {
    const res = await api.prefsLike(c.name, !c.liked);
    if (!res || !res.ok) return;
    unlock = res.view;
    unlockFingerprint = JSON.stringify(res.view);
    renderUnlock();
  } catch (err) { console.error('[exchange] prefsLike error', err); }
}

/** 屏蔽交互（US-48）：独占段 { ok:false } ⇒ 提示（结构上不会发生——UI 已无钮，防御面）。 */
async function doBlock(c) {
  try {
    const res = await api.prefsBlock(c.name, !c.blocked);
    if (!res || !res.ok) { showMsg((res && res.message) || '该动作不可屏蔽', true); return; }
    unlock = res.view;
    unlockFingerprint = JSON.stringify(res.view);
    renderUnlock();
  } catch (err) { console.error('[exchange] prefsBlock error', err); }
}

async function refreshUnlock() {
  try {
    const next = await api.unlock();
    const fp = JSON.stringify(next);
    if (fp === unlockFingerprint) return;   // 指纹不变 ⇒ 跳过重建（在播视频不被 5 s 节拍打断）
    unlockFingerprint = fp;
    unlock = next;
    renderUnlock();
  } catch (err) {
    console.error('[exchange] unlock error', err);
    showMsg('图鉴加载失败：' + (err && err.message || err), true);
  }
}

document.getElementById('tab-food').onclick = () => switchTab('food');
document.getElementById('tab-unlock').onclick = () => switchTab('unlock');
document.getElementById('fav-only').addEventListener('change', async (e) => {
  try {
    await api.setFavOnly(!!e.target.checked);
    await refreshUnlock();   // payload 含 favOnly ⇒ 指纹必变 ⇒ 全墙按双面语义重渲
  } catch (err) { console.error('[exchange] favOnly error', err); }
});
