'use strict';
/**
 * b12-plugin-guards.test.js — B12 三层夹具：守卫面（穿越枚举 + 形态正负例）/ XSS 面（vm + DOM 桩）/ 扫描面（计数器 + 黄金样本）。
 * （B12；设计档 docs/design/SHELL-UX.md §3.3 手段 13 / §3.2 TC-68…TC-87）
 * 运行：node --test tests/b12-plugin-guards.test.js（不登记 package.json、不入 build.files）
 * 寿命口径 = 开发期工具（①；批次收口逐条判处置，默认退役——设计档 §3.3 手段 13 / DD-46）。
 */
const { test, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

// ---------------------------------------------------------------------------
// 夹具基建（临时目录 / 假加载器 / fs 快照）
// ---------------------------------------------------------------------------
const TMP = [];
function mkTmp(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `b12-${name}-`));
  TMP.push(dir);
  return dir;
}
after(() => {
  for (const dir of TMP) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

/** 子进程计数器——须在 require('./shell-plugins.js') 之前就位（spawn 为加载时解构；手段 13 ②）。 */
const SPAWN = [];
function fakeSpawn(command, args) {
  SPAWN.push({ command, args: args || [] });
  const child = new EventEmitter();
  child.stdout = null;
  child.stderr = null;
  setImmediate(() => child.emit('close', 1)); // 非 0 ⇒ 早退，不触后续 fs
  return child;
}

/** 加载 shell-plugins.js：注入假 electron / 假 shell-backend / 假 child_process（手段 13 ②）。 */
function loadPlugins(root) {
  SPAWN.length = 0;
  const fakeElectron = { app: { isPackaged: false, getAppPath: () => root, getPath: () => path.join(root, 'userData') } };
  const fakeBackend = { dshHome: () => path.join(root, 'home') };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return fakeElectron;
    if (request === 'node:child_process') return { spawn: fakeSpawn };
    if (/shell-backend\.js$/.test(request)) return fakeBackend;
    return origLoad.call(this, request, parent, isMain);
  };
  let mod;
  try {
    for (const key of Object.keys(require.cache)) {
      if (/shell-plugins\.js$/.test(key)) delete require.cache[key];
    }
    mod = require('../shell-plugins.js');
  } finally {
    Module._load = origLoad;
  }
  mod.init({ updaterLog: () => {} }); // 缺省日志出口（需采集行序列的用例自行重设）
  return mod;
}

/** 夹具全量快照（路径 + 内容哈希）——用于「两侧夹具 fs 零改动」断言。 */
function fsState(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(`${path.relative(root, p)}|${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  walk(root);
  return out;
}

/** 守卫面夹具：bundled-plugins + profile（含 bundles / node_modules / 一个「外部」哨兵目录）。 */
function guardFixture(name) {
  const root = mkTmp(name);
  writeJson(path.join(root, 'bundled-plugins', 'dsh-builtin-x', 'package.json'), { name: 'dsh-builtin-x', version: '1.0.0' });
  writeJson(path.join(root, 'bundled-plugins', 'dsh-builtin-x', 'index.js'), { ok: true });
  writeJson(path.join(root, 'bundled-plugins', '@scope', 'dsh-scoped', 'package.json'), { name: '@scope/dsh-scoped', version: '1.0.0' });
  writeJson(path.join(root, 'home', 'profiles', 'web', 'package.json'), { name: 'web', private: true, dsh: { profile: { bundles: [] } } });
  writeJson(path.join(root, 'home', 'profiles', 'web', 'node_modules', 'dsh-pet', 'package.json'), { name: 'dsh-pet', version: '1.0.0' });
  writeJson(path.join(root, 'home', 'sessions', 'keep.json'), { keep: true }); // 越界目标哨兵（旧实现下会被递归删）
  writeJson(path.join(root, 'home', '.credentials.yaml'), { keep: true });
  return { root, plugins: loadPlugins(root) };
}

// ---------------------------------------------------------------------------
// 守卫面：形态谓词（TC-72 / TC-73 / TC-74）
// ---------------------------------------------------------------------------
test('TC-72 形态正例：installSpecKind 均非 null（npm / github / bundled 面）', () => {
  const { plugins } = guardFixture('tc72');
  const positives = ['dsh-pet', '@scope/name', 'name@1.2.3', '@scope/name@1.2.3-rc.1', 'github:owner/repo', 'github:owner/repo#path:/packages/x', 'builtin:dsh-pet', 'builtin:@scope/name'];
  for (const spec of positives) assert.notStrictEqual(plugins.installSpecKind(spec), null, `正例被拒：${spec}`);
});

test('TC-73 形态负例：installSpecKind 均 null（非字符串不抛错）', () => {
  const { plugins } = guardFixture('tc73');
  const negatives = ['link:../x', 'file:/etc/passwd', 'git+https://x/y', '@scope/..', 'github:', 'github:owner', 'github:../..', '', null, 42, {}];
  for (const spec of negatives) assert.strictEqual(plugins.installSpecKind(spec), null, `负例被放行：${String(spec)}`);
});

test('TC-74 isInsideDir 真值表（严格包含——rel === "" 不算通过）', () => {
  const { root, plugins } = guardFixture('tc74');
  const nm = path.join(root, 'nm');
  const bundled = path.join(root, 'bundled');
  assert.strictEqual(plugins.isInsideDir(path.join(nm, 'a'), nm), true);
  assert.strictEqual(plugins.isInsideDir(path.join(nm, '..', '..'), nm), false);
  assert.strictEqual(plugins.isInsideDir(nm, nm), false);
  assert.strictEqual(plugins.isInsideDir(path.join(bundled, 'x'), bundled), true);
  assert.strictEqual(plugins.isInsideDir(path.join(bundled, '..', 'profiles'), bundled), false);
});

// ---------------------------------------------------------------------------
// 守卫面：穿越枚举（TC-70 / TC-71 / TC-75 / AC26）
// ---------------------------------------------------------------------------
const TRAVERSAL = ['../../..', 'builtin:../../..', '..\\..\\..', '/abs/path', 'C:\\Windows', '@scope/..', '..', 'a/../../b', '\\\\srv\\share', 'file:/etc/passwd', 'git+https://x/y', 'builtin:/abs', 'github:../..'];

async function assertTraversalRejected(root, plugins, fn, spec) {
  const before = fsState(root);
  const res = await fn(spec);
  assert.strictEqual(res.ok, false, `${spec} 未被拒：${JSON.stringify(res)}`);
  assert.match(String(res.message), /^无效的插件标识：/, `${spec} 拒绝消息前缀不符：${res.message}`);
  assert.deepStrictEqual(fsState(root), before, `${spec} 触碰了夹具文件系统`);
  assert.strictEqual(SPAWN.length, 0, `${spec} 起了子进程`);
  for (const base of [path.join(root, 'bundled-plugins'), path.join(root, 'home'), path.join(root, 'userData')]) {
    assert.ok(!String(res.message).includes(base), `${spec} 消息泄漏基准目录：${res.message}`);
  }
  return res;
}

test('TC-70 installPlugin：穿越枚举（注① 全量 13 形）全部 { ok:false } 且夹具零改动', async () => {
  const { root, plugins } = guardFixture('tc70');
  for (const spec of TRAVERSAL) await assertTraversalRejected(root, plugins, (s) => plugins.installPlugin(s), spec);
});

test('TC-71 uninstallPlugin：同枚举（13 形）全部 { ok:false } 且目标目录未被删除', async () => {
  const { root, plugins } = guardFixture('tc71');
  for (const spec of TRAVERSAL) await assertTraversalRejected(root, plugins, (s) => plugins.uninstallPlugin(s), spec);
  assert.ok(fs.existsSync(path.join(root, 'home', 'sessions', 'keep.json')), '越界哨兵被删除');
});

test('TC-75 拒绝消息形态：不含盘符形态（非路径入参）；前缀串不含基准目录取值', async () => {
  const { root, plugins } = guardFixture('tc75');
  const msgs = [];
  for (const spec of ['../../..', 'builtin:../../..', '@scope/..', '..', 'github:../..', 'a/../../b']) {
    msgs.push(String((await plugins.installPlugin(spec)).message));
    msgs.push(String((await plugins.uninstallPlugin(spec)).message));
  }
  for (const m of msgs) {
    assert.ok(!/[A-Za-z]:[/\\]/.test(m), `消息含盘符形态：${m}`);
    assert.ok(!m.includes(root), `消息含夹具绝对路径：${m}`);
  }
});

// ---------------------------------------------------------------------------
// 守卫面：内置面 / 裸纯包名 / scoped / 卸载面解析门（TC-68 / TC-69 / TC-84 / TC-87 / TC-76）
// ---------------------------------------------------------------------------
test('AC31 静态命中：越界前缀串在场（函数级取证面——运行时不可达，设计档 §3.1 AC31 判据细化②）', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'shell-plugins.js'), 'utf8');
  assert.ok(src.includes('插件标识越界，已拒绝：'), '越界拒绝前缀串不在场');
  assert.ok(/>\s*installSpecKind|function installSpecKind/.test(src), 'installSpecKind 不在场');
  assert.ok(/function isInsideDir/.test(src), 'isInsideDir 不在场');
  assert.ok(/function scanProfile/.test(src), 'scanProfile 不在场');
});

test('TC-68 installPlugin(builtin:<名>)：内置拷贝面零回退 + bundles 注册', async () => {
  const { root, plugins } = guardFixture('tc68');
  const res = await plugins.installPlugin('builtin:dsh-builtin-x');
  assert.deepStrictEqual(res, { ok: true, message: '已安装内置插件 dsh-builtin-x' });
  const src = path.join(root, 'bundled-plugins', 'dsh-builtin-x');
  const dst = path.join(root, 'home', 'profiles', 'web', 'node_modules', 'dsh-builtin-x');
  for (const f of ['package.json', 'index.js']) {
    assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(path.join(dst, f))).digest('hex'),
      crypto.createHash('sha256').update(fs.readFileSync(path.join(src, f))).digest('hex'), `${f} 内容不一致`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'home', 'profiles', 'web', 'package.json'), 'utf8'));
  assert.ok(manifest.dsh.profile.bundles.includes('dsh-builtin-x'), 'bundles 未注册');
  assert.strictEqual(SPAWN.length, 0, '内置面不应起子进程');
});

test('TC-69 uninstallPlugin(<名>)：内置面删除 + bundles 注销', async () => {
  const { root, plugins } = guardFixture('tc69');
  await plugins.installPlugin('builtin:dsh-builtin-x');
  SPAWN.length = 0;
  const res = await plugins.uninstallPlugin('dsh-builtin-x');
  assert.deepStrictEqual(res, { ok: true, message: '已卸载内置插件 dsh-builtin-x' });
  assert.ok(!fs.existsSync(path.join(root, 'home', 'profiles', 'web', 'node_modules', 'dsh-builtin-x')));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'home', 'profiles', 'web', 'package.json'), 'utf8'));
  assert.ok(!manifest.dsh.profile.bundles.includes('dsh-builtin-x'));
  assert.strictEqual(SPAWN.length, 0);
});

test('TC-84 installPlugin(builtin:@scope/名)：嵌套目标中间目录创建 + 两处包含判定均过', async () => {
  const { root, plugins } = guardFixture('tc84');
  const res = await plugins.installPlugin('builtin:@scope/dsh-scoped');
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.ok(fs.existsSync(path.join(root, 'home', 'profiles', 'web', 'node_modules', '@scope', 'dsh-scoped', 'package.json')));
});

test('TC-87 裸纯包名但内置源不存在 ⇒ 落回 npm / pnpm 面（与改前同径）', async () => {
  const { root, plugins } = guardFixture('tc87');
  const res = await plugins.installPlugin('dsh-not-bundled');
  assert.strictEqual(SPAWN.length, 1, '未走 pnpm 面');
  assert.ok(SPAWN[0].args.includes('add') && SPAWN[0].args.includes('dsh-not-bundled'), JSON.stringify(SPAWN[0].args));
  assert.strictEqual(res.ok, false); // 假 spawn 以非 0 退出早退（不进后续 fs 面）
  assert.ok(!fs.existsSync(path.join(root, 'home', 'profiles', 'web', 'node_modules', 'dsh-not-bundled')));
});

test('TC-76 卸载面解析门：解析不到已装对象 ⇒ { ok:false, message:"未安装或无法解析：…" }', async () => {
  const { root, plugins } = guardFixture('tc76');
  for (const spec of ['github:owner/repo', 'dsh-never-installed']) {
    const before = fsState(root);
    const res = await plugins.uninstallPlugin(spec);
    assert.strictEqual(res.ok, false, `${spec} 未被拒`);
    assert.match(String(res.message), /^未安装或无法解析：/, `${spec} 消息不符：${res.message}`);
    assert.ok(!String(res.message).includes(root), '消息含绝对路径');
    assert.deepStrictEqual(fsState(root), before, `${spec} 触碰了夹具文件系统`);
    assert.strictEqual(SPAWN.length, 0, `${spec} 起了子进程`);
  }
});

// ---------------------------------------------------------------------------
// XSS 面：vm + 极简 DOM 桩（TC-77 / TC-78 / TC-79）
// ---------------------------------------------------------------------------
const MARKET_SRC = fs.readFileSync(path.join(__dirname, '..', 'market.js'), 'utf8');
// 同页第二只 <script>（market.js 的 sibling——`updOf` 由此提供；与 market.html 加载序一致）
const MARKET_UPDATE_SRC = fs.readFileSync(path.join(__dirname, '..', 'market-update.js'), 'utf8');
const MALICIOUS = ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '"><svg onload=alert(1)>'];
const LEGAL = 'bigfish-demo-plugin';

function makeDom() {
  const all = [];
  const byId = new Map();
  function mkText(t) { return { nodeType: 3, textContent: String(t), children: [], parentNode: null }; }
  function parseInto(host, html) {
    const re = /<\/?([a-zA-Z][\w:-]*)([^>]*)>/g;
    let last = 0;
    let m;
    while ((m = re.exec(html))) {
      const text = html.slice(last, m.index);
      if (text) host.appendChild(mkText(text));
      last = m.index + m[0].length;
      if (m[0][1] !== '/') host.appendChild(mkEl(m[1]));
    }
    if (html.slice(last)) host.appendChild(mkText(html.slice(last)));
  }
  function mkEl(tag) {
    const e = { nodeType: 1, tagName: String(tag).toUpperCase(), children: [], parentNode: null, style: {}, _text: '', className: '', hidden: false, disabled: false, onclick: null };
    e.classList = {
      add(c) { e.className = (e.className ? e.className + ' ' : '') + c; },
      remove(c) { e.className = (e.className || '').split(' ').filter((x) => x && x !== c).join(' '); },
      toggle(c, on) { if (on) e.classList.add(c); else e.classList.remove(c); },
    };
    Object.defineProperty(e, 'textContent', {
      get: () => e._text + e.children.map((c) => c.textContent).join(''),
      set: (v) => { e.children.length = 0; e._text = String(v); },
    });
    Object.defineProperty(e, 'innerHTML', {
      // 回归哨兵：修复后 market.js 全文 0 处 innerHTML；若被调用，标记会被解析成元素并可被断言捕获
      get: () => e.textContent,
      set: (v) => { e.children.length = 0; e._text = ''; parseInto(e, String(v)); },
    });
    e.appendChild = (c) => { c.parentNode = e; e.children.push(c); return c; };
    e.removeChild = (c) => { e.children = e.children.filter((x) => x !== c); return c; };
    e.addEventListener = () => {};
    e.setAttribute = () => {};
    e.querySelectorAll = () => [];
    all.push(e);
    return e;
  }
  const document = {
    createElement: (t) => mkEl(t),
    createTextNode: (t) => mkText(t),
    createDocumentFragment: () => mkEl('#fragment'),
    getElementById: (id) => { if (!byId.has(id)) byId.set(id, mkEl('div')); return byId.get(id); },
    querySelectorAll: (sel) => (String(sel).includes('.btn') ? all.filter((e) => e.tagName === 'BUTTON' && (e.className || '').includes('btn')) : []),
    addEventListener: () => {},
  };
  return { document, all, byId };
}

function makeApi(plugins, installed) {
  const calls = { install: [], uninstall: [] };
  return {
    calls,
    list: async () => ({ registry: { source: 'remote', plugins }, installed, disabled: [], bundledNames: [], updates: [], profileDir: '/p', dshHome: '/h' }),
    state: async () => ({ installed, disabled: [], bundledNames: [], updates: [] }),
    install: async (spec) => { calls.install.push(spec); return { ok: true, message: '已安装' }; },
    uninstall: async (spec) => { calls.uninstall.push(spec); return { ok: true, message: '已卸载' }; },
    disable: async () => ({ ok: true, message: '已禁用' }),
    enable: async () => ({ ok: true, message: '已启用' }),
    restart: async () => ({ ok: true }),
    openExternal: () => {},
  };
}

const ticks = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
function elementTags(root) {
  const out = [];
  for (const c of root.children) {
    if (c.nodeType !== 1) continue;
    if (!c.tagName.startsWith('#')) out.push(c.tagName); // 片段节点（#fragment）不登记但需递归
    out.push(...elementTags(c));
  }
  return out;
}

/** 载入 market.js 并点出目标按钮 ⇒ 读弹窗标题 / 正文（DOM 桩面）。 */
async function driveModal(entry, installed, label) {
  const dom = makeDom();
  const api = makeApi([entry], installed);
  const ctx = vm.createContext({ window: { marketAPI: api }, document: dom.document, setTimeout: () => 0, console });
  vm.runInContext(MARKET_SRC, ctx, { filename: 'market.js' });
  vm.runInContext(MARKET_UPDATE_SRC, ctx, { filename: 'market-update.js' });
  await ticks(4);
  const btn = dom.all.find((e) => e.tagName === 'BUTTON' && typeof e.onclick === 'function' && e.textContent === label);
  assert.ok(btn, `未渲染出「${label}」按钮`);
  btn.onclick();
  await ticks(4);
  const title = dom.byId.get('m-title').textContent;
  const body = dom.byId.get('m-body');
  const card = dom.all.find((e) => (e.className || '') === 'card');
  const snap = {
    title, tags: elementTags(body), text: body.textContent,
    cardTags: card ? elementTags(card) : [], cardText: card ? card.textContent : '',
  };
  dom.byId.get('m-ok').onclick();
  await ticks(4);
  return snap;
}

test('TC-77 / TC-78 恶意 name / desc / owner / url 三形态：弹窗与卡片只产生文本节点（元素面与合法输入相同）', async () => {
  const legal = {
    install: await driveModal({ name: LEGAL, npm: LEGAL, version: '1.0.0', description: { zh: LEGAL }, owner: LEGAL, url: 'https://example.test/x' }, [], '安装'),
    uninstall: await driveModal({ name: LEGAL, npm: 'x-pkg', version: '1.0.0', description: { zh: LEGAL }, owner: LEGAL, url: 'https://example.test/x' }, ['x-pkg'], '卸载'),
    disable: await driveModal({ name: LEGAL, npm: 'x-pkg', version: '1.0.0', description: { zh: LEGAL }, owner: LEGAL, url: 'https://example.test/x' }, ['x-pkg'], '禁用'),
  };
  const entryOf = (bad, npm) => ({ name: bad, npm, version: '1.0.0', description: { zh: bad }, owner: bad, url: 'javascript:' + bad });
  // 文案冻结（改前 HTML 串的 textContent 逐字——US-14「外观与文案逐字不变」判据面）
  const COPY = {
    install: { title: `安装「${LEGAL}」？`, text: `插件名：${LEGAL}安装完成后需要重启一次才会生效（会自动重启，不用手动操作）。来源：npm 官方仓库` },
    uninstall: { title: `卸载「${LEGAL}」？`, text: '将移除插件 x-pkg 及其注册。卸载后需要重启一次生效。' },
    disable: { title: `禁用「${LEGAL}」？`, text: '将停用插件 x-pkg（保留文件，不删除）。禁用后需要重启一次生效。' },
  };
  for (const key of Object.keys(COPY)) {
    assert.strictEqual(legal[key].title, COPY[key].title, `${key}：弹窗标题文案回退`);
    assert.strictEqual(legal[key].text, COPY[key].text, `${key}：弹窗正文文案回退`);
  }
  // 字段类型异常（非字符串 / 对象 description）不得抛错、按旧语义走文本节点（评审修正轮 1 #1）
  const weird = await driveModal({ name: 'x', npm: 'x-pkg', version: '1.0.0', description: {}, owner: {}, url: '' }, ['x-pkg'], '卸载');
  assert.ok(weird.text.length > 0 && !weird.tags.some((t) => ['IMG', 'SCRIPT', 'SVG'].includes(t)), '字段类型异常时渲染面异常');
  for (const bad of MALICIOUS) {
    const cases = {
      install: await driveModal(entryOf(bad, bad), [], '安装'),
      uninstall: await driveModal(entryOf(bad, 'x-pkg'), ['x-pkg'], '卸载'),
      disable: await driveModal(entryOf(bad, 'x-pkg'), ['x-pkg'], '禁用'),
    };
    for (const key of Object.keys(cases)) {
      const got = cases[key];
      for (const [faceName, tags] of [['弹窗', got.tags], ['卡片', got.cardTags]]) {
        const want = faceName === '弹窗' ? legal[key].tags : legal[key].cardTags;
        assert.ok(tags.length > 0 && want.length > 0, `${bad} / ${key} / ${faceName}：取证面为空集（空过）`);
        assert.deepStrictEqual(tags, want, `${bad} / ${key} / ${faceName}：元素节点面与合法输入不同`);
        for (const tag of tags) assert.ok(!['IMG', 'SCRIPT', 'SVG'].includes(tag), `${bad} / ${key} / ${faceName}：注入出 ${tag} 元素`);
      }
      assert.ok((got.title + got.text).includes(bad), `${bad} / ${key}：弹窗内恶意串未逐字以文本呈现`);
      assert.ok(got.cardText.includes(bad), `${bad} / ${key}：卡片内恶意串未逐字以文本呈现`);
    }
  }
});

test('TC-79 静态判据：market.js 全文 innerHTML / insertAdjacentHTML / outerHTML / document.write 各 0 处', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'market.js'), 'utf8');
  for (const sym of ['innerHTML', 'insertAdjacentHTML', 'outerHTML', 'document.write']) {
    assert.strictEqual(src.split(sym).length - 1, 0, `market.js 含 ${sym}`);
  }
  const calls = src.split('confirmModal(').length - 1;
  assert.strictEqual(calls, 4, `confirmModal( 命中 ${calls} 处（1 定义 + 3 调用）`);
});

// AC27 ③（结构面：四处守卫面各随一次包含判定且先于 fs 调用）/ AC28 ① 细化④（parts 形参 = 第三实参起，为节点构造）
test('AC27 ③ / AC28 ① 结构判据：四处守卫面顺序 + 三处 confirmModal 的 parts 形参为节点构造', () => {
  const lines = fs.readFileSync(path.join(__dirname, '..', 'shell-plugins.js'), 'utf8').split('\n');
  const faces = lines.map((l, i) => [i, l]).filter(([, l]) => l.includes('path.join(') && /(bundledSource|const target)/.test(l));
  assert.strictEqual(faces.length, 4, `守卫面 path.join 数 = ${faces.length}（期望 4：两函数 × 两面）`);
  for (const [i, l] of faces) {
    assert.match(lines[i + 1], /^\s*if \(!isInsideDir\(/, `L${i + 2} 未紧随包含判定：${l.trim()}`);
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'market.js'), 'utf8');
  const calls = [...src.matchAll(/confirmModal\(/g)].map((m) => m.index).slice(1);
  assert.strictEqual(calls.length, 3, `confirmModal 调用点 = ${calls.length}`);
  for (const at of calls) {
    const args = src.slice(at, at + 420);
    assert.match(args, /el\(|frag\(|para\(/, '调用点实参非节点构造');
    assert.ok(!/<\/?(p|code|b|span|div|script|img|svg)\b/i.test(args), '调用点实参含 HTML 字符串');
  }
});

// ---------------------------------------------------------------------------
// 扫描面：黄金样本（TC-80）+ 计数器（TC-81 / TC-82）
// ---------------------------------------------------------------------------
const P_UPDATE = { name: 'dsh-pet', npm: 'dsh-pet', version: '9.9.9' };
const P_MISSING = { name: 'nope', npm: 'dsh-nope', version: '2.0.0' };
const P_NOVER = { name: 'nv', npm: 'dsh-no-version', version: '3.0.0' };

// 黄金样本（改前实现实测冻结——设计档 §3.3 手段 13 ③；改前/改后逐字相等为 AC29 判据）
const GOLDEN_UPDATES = [{ id: 'dsh-pet', name: 'dsh-pet', updateSpec: 'dsh-pet@9.9.9', latestVersion: '9.9.9', installedVersion: '1.0.0' }];
const GOLDEN_LOG = ['plugin update spec=dsh-no-version result=skip detail=no-installed-version'];

function scanFixture(name, withProfile = true) {
  const root = mkTmp(name);
  const web = path.join(root, 'home', 'profiles', 'web');
  if (withProfile) {
    writeJson(path.join(web, 'package.json'), { name: 'web', private: true, dependencies: { 'dsh-pet': '1.0.0' }, dsh: { profile: { bundles: ['dsh-pet'] } } });
    writeJson(path.join(web, 'node_modules', 'dsh-pet', 'package.json'), { name: 'dsh-pet', version: '1.0.0' });
    writeJson(path.join(web, 'node_modules', 'dsh-no-version', 'package.json'), { name: 'dsh-no-version' });
    writeJson(path.join(web, 'node_modules', '@scope', 'pkg', 'package.json'), { name: '@scope/pkg', version: '0.1.0' });
    fs.mkdirSync(path.join(web, 'node_modules', '.pnpm'), { recursive: true });
    fs.writeFileSync(path.join(web, 'node_modules', '.modules.yaml'), 'lockfileVersion: 9\n');
  }
  return { root, web, plugins: loadPlugins(root) };
}

test('TC-80 黄金样本：computePluginUpdates 返回值与 updaterLog 行序列（改前实测冻结）', () => {
  const { plugins } = scanFixture('tc80');
  const log = [];
  plugins.init({ updaterLog: (l) => log.push(l) });
  const updates = plugins.computePluginUpdates([P_UPDATE, P_MISSING, P_NOVER]);
  assert.deepStrictEqual(updates, GOLDEN_UPDATES, '更新清单与黄金样本不符（判定回退）');
  assert.deepStrictEqual(log, GOLDEN_LOG, 'updaterLog 行序列与黄金样本不符');
});

function countCalls(fn) {
  const seen = { readdirSync: [], statSync: 0, readFileSync: 0 };
  const orig = { readdirSync: fs.readdirSync, statSync: fs.statSync, readFileSync: fs.readFileSync };
  fs.readdirSync = function (...a) { seen.readdirSync.push(a[0]); return orig.readdirSync.apply(fs, a); };
  fs.statSync = function (...a) { seen.statSync += 1; return orig.statSync.apply(fs, a); };
  fs.readFileSync = function (...a) { seen.readFileSync += 1; return orig.readFileSync.apply(fs, a); };
  try { fn(); } finally {
    fs.readdirSync = orig.readdirSync;
    fs.statSync = orig.statSync;
    fs.readFileSync = orig.readFileSync;
  }
  return seen;
}

test('TC-81 计数器：N=2 与 N=3727 的 fs 调用计数相等；node_modules 顶层 readdirSync = 1 / 次调用', () => {
  const { web, plugins } = scanFixture('tc81');
  const reg2 = [P_UPDATE, P_NOVER];
  const regN = [];
  while (regN.length < 3727) regN.push(reg2[regN.length % 2]);
  const c2 = countCalls(() => plugins.computePluginUpdates(reg2));
  const cN = countCalls(() => plugins.computePluginUpdates(regN));
  assert.strictEqual(cN.readdirSync.length, c2.readdirSync.length, 'readdirSync 计数随 N 变化');
  assert.strictEqual(cN.statSync, c2.statSync, 'statSync 计数随 N 变化');
  assert.strictEqual(cN.readFileSync, c2.readFileSync, 'readFileSync 计数随 N 变化');
  const nm = path.join(web, 'node_modules');
  assert.strictEqual(c2.readdirSync.filter((p) => p === nm).length, 1, 'node_modules 顶层 readdirSync 非 1 次');
  assert.strictEqual(cN.readdirSync.filter((p) => p === nm).length, 1, 'node_modules 顶层 readdirSync 非 1 次');
});

test('TC-82 降级夹具：无 profile manifest / 空 node_modules ⇒ 不抛、返回空集', () => {
  const { plugins } = scanFixture('tc82', false);
  plugins.init({ updaterLog: () => {} });
  assert.deepStrictEqual(plugins.listInstalledPlugins(), []);
  assert.deepStrictEqual(plugins.listDisabledPlugins(), []);
  assert.deepStrictEqual(plugins.computePluginUpdates([P_UPDATE, P_NOVER]), []);
});

test('AC29 快照复用：同一 ctx 下三个消费面零顶层扫描（node_modules readdirSync 计数 = 0）', () => {
  const { web, plugins } = scanFixture('tc81b');
  const ctx = plugins.scanProfile();
  const seen = countCalls(() => {
    plugins.listInstalledPlugins(ctx);
    plugins.listDisabledPlugins(ctx);
    plugins.computePluginUpdates([P_UPDATE, P_NOVER], ctx);
  });
  assert.strictEqual(seen.readdirSync.filter((p) => p === path.join(web, 'node_modules')).length, 0, 'ctx 面仍有顶层扫描');
});
