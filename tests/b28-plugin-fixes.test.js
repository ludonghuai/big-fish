'use strict';
/**
 * b28-plugin-fixes.test.js — B28 行为面断言：T32 卸载夹具（TC-91 / TC-92 / TC-93）+
 * T22 vm 桩（TC-88 / TC-89）+ bundledNames 目录过滤（TC-90）。
 * （B28；设计档 docs/design/SHELL-UX.md §3.3 手段 14 / §3.2 TC-88…TC-93）
 * 运行：node --test tests/b28-plugin-fixes.test.js（不登记 package.json、不入 build.files；
 *       test-run.js 档发现自动收档，test / test:full 自动纳入）
 * 寿命口径 = 开发期工具（①；批次收口逐条判处置，默认退役——设计档 §3.3 手段 14 / DD-57）。
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `b28-${name}-`));
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

/** 夹具全量快照（路径 + 内容哈希）——用于「零 fs 改动」断言（TC-93）。 */
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

/** 子进程计数器——须在 require('./shell-plugins.js') 之前就位（spawn 为加载时解构；手段 14 ②）。 */
const SPAWN = [];
let SPAWN_EXIT = 1;
function fakeSpawn(command, args) {
  SPAWN.push({ command, args: args || [] });
  const child = new EventEmitter();
  child.stdout = null;
  child.stderr = null;
  setImmediate(() => child.emit('close', SPAWN_EXIT));
  return child;
}

/** 假模块面（加载时解构 ⇒ 先于 require 就位；dshHome / getAppPath 按调用时读取 ⇒ 逐测试切换夹具根）。 */
let FIXTURE_ROOT = null;
const fakeElectron = {
  app: { isPackaged: false, getAppPath: () => FIXTURE_ROOT, getPath: () => path.join(FIXTURE_ROOT, 'userData') },
  BrowserWindow: class {},
  shell: { openExternal: () => {} },
  dialog: {},
  Notification: class {},
};
const fakeBackend = { dshHome: () => path.join(FIXTURE_ROOT, 'home') };
function installFakeLoader() {
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return fakeElectron;
    if (request === 'node:child_process') return { spawn: fakeSpawn };
    if (/shell-backend\.js$/.test(request)) return fakeBackend;
    return origLoad.call(this, request, parent, isMain);
  };
  return origLoad;
}

/** 加载 shell-plugins.js：注入假 electron / 假 shell-backend / 假 child_process（手段 14 ②）。 */
function loadPlugins(root) {
  FIXTURE_ROOT = root;
  SPAWN.length = 0;
  const origLoad = installFakeLoader();
  let mod;
  try {
    for (const key of Object.keys(require.cache)) {
      if (/shell-plugins\.js$/.test(key)) delete require.cache[key];
    }
    mod = require('../shell-plugins.js');
  } finally {
    Module._load = origLoad;
  }
  mod.init({ updaterLog: () => {} }); // 缺省日志出口（防 computePluginUpdates 触 updaterLog 时未注入）
  return mod;
}

/** 加载 shell-market.js（TC-90 直接调用面）：同族假模块 + 全链缓存刷新。 */
function loadShellMarket(root) {
  FIXTURE_ROOT = root;
  SPAWN.length = 0;
  const origLoad = installFakeLoader();
  let mod;
  try {
    for (const key of Object.keys(require.cache)) {
      if (/shell-(market|plugins|update|notify|settings|assets)\.js$/.test(key)
        || /shell-backend\.js$/.test(key) || /updater\.js$/.test(key)
        || /harness-store\.js$/.test(key) || /update-lib\.js$/.test(key)) delete require.cache[key];
    }
    mod = require('../shell-market.js');
  } finally {
    Module._load = origLoad;
  }
  require('../shell-plugins.js').init({ updaterLog: () => {} });
  return mod;
}

/** T32 卸载夹具：bundled-plugins/x（源）+ profile（bundles + node_modules 点名列表）。 */
function uninstallFixture(name, { bundles, nodeModules }) {
  const root = mkTmp(name);
  writeJson(path.join(root, 'bundled-plugins', 'x', 'package.json'), { name: 'x', version: '1.0.0' });
  writeJson(path.join(root, 'bundled-plugins', 'x', 'index.js'), { ok: true });
  writeJson(path.join(root, 'home', 'profiles', 'web', 'package.json'), { name: 'web', private: true, dsh: { profile: { bundles } } });
  for (const n of nodeModules || []) {
    writeJson(path.join(root, 'home', 'profiles', 'web', 'node_modules', n, 'package.json'), { name: n, version: '1.0.0' });
  }
  return { root, plugins: loadPlugins(root) };
}

// ---------------------------------------------------------------------------
// T32 卸载面（TC-91 / TC-92 / TC-93）
// ---------------------------------------------------------------------------
test('TC-91 uninstallPlugin(builtin:x)：真卸载 + 消息带真名（假成功消除）', async () => {
  const { root, plugins } = uninstallFixture('tc91', { bundles: ['x'], nodeModules: ['x'] });
  const res = await plugins.uninstallPlugin('builtin:x');
  assert.deepStrictEqual(res, { ok: true, message: '已卸载内置插件 x' });
  assert.ok(!fs.existsSync(path.join(root, 'home', 'profiles', 'web', 'node_modules', 'x')), 'node_modules/x 应已删除');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'home', 'profiles', 'web', 'package.json'), 'utf8'));
  assert.ok(!manifest.dsh.profile.bundles.includes('x'), 'bundles 应已注销 x');
  assert.strictEqual(SPAWN.length, 0, '内置面不应起子进程');
});

test('TC-92 uninstallPlugin(github:owner/dsh-x)：动作面收 realName（pnpm remove 实参 = dsh-x）', async () => {
  const { root, plugins } = uninstallFixture('tc92', { bundles: ['dsh-x'], nodeModules: ['dsh-x'] });
  SPAWN_EXIT = 0;
  const res = await plugins.uninstallPlugin('github:owner/dsh-x');
  assert.deepStrictEqual(res, { ok: true, message: '已卸载 dsh-x' });
  assert.strictEqual(SPAWN.length, 1, '应起一次 pnpm remove');
  const args = SPAWN[0].args;
  assert.ok(args.includes('remove'), 'pnpm 动作应为 remove');
  assert.ok(args.includes('dsh-x'), 'pnpm 实参应为解析后真名 dsh-x');
  assert.ok(!args.some((a) => String(a).includes('github:')), 'pnpm 实参不得带 github: 原始标识');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'home', 'profiles', 'web', 'package.json'), 'utf8'));
  assert.ok(!manifest.dsh.profile.bundles.includes('dsh-x'), 'bundles 应已注销 dsh-x');
});

test('TC-93 uninstallPlugin(未装纯包名)：解析门拒绝 + 零 fs 改动 / 零子进程', async () => {
  const { root, plugins } = uninstallFixture('tc93', { bundles: ['x'], nodeModules: ['x'] });
  const before = fsState(root);
  SPAWN.length = 0;
  const res = await plugins.uninstallPlugin('never-installed');
  assert.strictEqual(res.ok, false);
  assert.ok(String(res.message).startsWith('未安装或无法解析：'), '应命中解析门消息前缀');
  assert.deepStrictEqual(fsState(root), before, '未装名卸载不得改动夹具');
  assert.strictEqual(SPAWN.length, 0, '不应起子进程');
});

// ---------------------------------------------------------------------------
// T22 面：vm + 极简 DOM 桩（TC-88 / TC-89）
// ---------------------------------------------------------------------------
const MARKET_SRC = fs.readFileSync(path.join(__dirname, '..', 'market.js'), 'utf8');
// 同页第二只 <script>（market.js 的 sibling——`updOf` 由此提供；与 market.html 加载序一致）
const MARKET_UPDATE_SRC = fs.readFileSync(path.join(__dirname, '..', 'market-update.js'), 'utf8');

function makeDom() {
  const all = [];
  const byId = new Map();
  function mkText(t) { return { nodeType: 3, textContent: String(t), children: [], parentNode: null }; }
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
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  return { document, all, byId };
}

function makeApi(plugins, installed, bundledNames) {
  const calls = { install: [], uninstall: [] };
  return {
    calls,
    list: async () => ({ registry: { source: 'remote', plugins }, installed, disabled: [], bundledNames, updates: [], profileDir: '/p', dshHome: '/h' }),
    state: async () => ({ installed, disabled: [], bundledNames, updates: [] }),
    install: async (spec) => { calls.install.push(spec); return { ok: true, message: '已安装' }; },
    uninstall: async (spec) => { calls.uninstall.push(spec); return { ok: true, message: '已卸载' }; },
    disable: async () => ({ ok: true, message: '已禁用' }),
    enable: async () => ({ ok: true, message: '已启用' }),
    restart: async () => ({ ok: true }),
    openExternal: () => {},
  };
}

const ticks = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

/** 载入 market.js（+ market-update.js sibling）并等 refresh() 渲染完成。 */
async function driveMarket(installed, bundledNames) {
  const dom = makeDom();
  const api = makeApi([], installed, bundledNames);
  const ctx = vm.createContext({ window: { marketAPI: api }, document: dom.document, setTimeout: () => 0, console });
  vm.runInContext(MARKET_SRC, ctx, { filename: 'market.js' });
  vm.runInContext(MARKET_UPDATE_SRC, ctx, { filename: 'market-update.js' });
  await ticks(5);
  return { dom, ctx, api };
}

test('TC-88 内置条目未装：normalizePlugin 认 builtin: + 卡片显「一键安装」', async () => {
  const { dom, ctx } = await driveMarket([], ['x']);
  const np = vm.runInContext('normalizePlugin', ctx);
  const entry = np({ name: 'x', category: 'official', official: true, bundled: true, description: { zh: 'Bigfish 内置插件', en: 'Bundled Bigfish plugin' }, install: 'builtin:x' }, true);
  assert.strictEqual(entry.installSpec, 'builtin:x', '内置条目 installSpec 应为 builtin:x');
  // github: 同口径不回退（改动只增 builtin: 识别面）
  const gh = np({ name: 'g', install: 'add github:owner/repo' }, false);
  assert.strictEqual(gh.installSpec, 'github:owner/repo', 'github: 形态识别不得回退');
  assert.strictEqual(gh.isGitHub, true, 'github: 形态 isGitHub 标记不得回退');
  const btn = dom.all.find((e) => e.tagName === 'BUTTON' && e.textContent === '一键安装');
  assert.ok(btn, '未装内置条目应显示「一键安装」按钮');
  assert.ok(!dom.all.some((e) => e.tagName === 'SPAN' && e.textContent === '不可一键安装'), '「不可一键安装」徽章应消失');
});

test('TC-89 内置条目已装：卡片显「✓ 已安装」+ 卸载按钮（「一键安装」消失）', async () => {
  const { dom } = await driveMarket(['x'], ['x']);
  assert.ok(dom.all.some((e) => e.tagName === 'SPAN' && e.textContent === '✓ 已安装'), '应显示「✓ 已安装」标签');
  assert.ok(dom.all.some((e) => e.tagName === 'BUTTON' && e.textContent === '卸载'), '应显示卸载按钮');
  assert.ok(!dom.all.some((e) => e.tagName === 'BUTTON' && e.textContent === '一键安装'), '已装条目不应显示「一键安装」');
  assert.ok(!dom.all.some((e) => e.tagName === 'SPAN' && e.textContent === '不可一键安装'), '「不可一键安装」徽章应消失');
});

// ---------------------------------------------------------------------------
// bundledNames 目录过滤（TC-90）
// ---------------------------------------------------------------------------
/** TC-90 夹具：bundled-plugins 含 README.txt 文件 + x/ 目录。 */
function bundledNamesFixture(name) {
  const root = mkTmp(name);
  writeJson(path.join(root, 'bundled-plugins', 'README.txt'), { readme: true });
  writeJson(path.join(root, 'bundled-plugins', 'x', 'package.json'), { name: 'x', version: '1.0.0' });
  writeJson(path.join(root, 'home', 'profiles', 'web', 'package.json'), { name: 'web', private: true, dsh: { profile: { bundles: [] } } });
  return root;
}

test('TC-90 bundledNames 目录过滤：README.txt 不进名单（marketState / marketList 两面）', async () => {
  const root = bundledNamesFixture('tc90');
  const market = loadShellMarket(root);
  assert.deepStrictEqual(market.marketState().bundledNames, ['x'], 'marketState 应只收目录条目');
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('test-offline')); // 断网桩：拉取面快速回落本地目录
  try {
    const list = await market.marketList();
    assert.deepStrictEqual(list.bundledNames, ['x'], 'marketList 应只收目录条目');
  } finally {
    globalThis.fetch = origFetch;
  }
});
