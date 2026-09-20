'use strict';
/**
 * b34-market-followup.test.js — B34 行为面断言：禁用诚实面（TC-114）+ 受管 tarball 清理（TC-115 / TC-116）
 * + 全部更新空结果两面（TC-117 / TC-118）（B34；设计档 docs/design/SHELL-UX.md §2.2.17；桩手法同 b28/b33 档）
 * 运行：node --test tests/b34-market-followup.test.js（不登记 package.json、不入 build.files；
 *       test-run.js 档发现自动收档，test / test:full 自动纳入）
 * 寿命口径 = 开发期工具（①；批次收口逐条判处置，默认退役——设计档 §3.3 手段 14 / DD-57）。
 */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { slow } = require('./layer.js');

// ---------------------------------------------------------------------------
// 夹具基建（同 b33 档：临时目录 / 假加载器 / 假子进程 / 假 fetch + 重启探针）
// ---------------------------------------------------------------------------
const TMP = [];
function mkTmp(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `b34-${name}-`));
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

const SPAWN = [];
let SPAWN_EXIT = 1;
function fakeSpawn(command, args) {
  SPAWN.push({ command, args: args || [] });
  const child = new EventEmitter();
  child.stdout = null;
  child.stderr = new EventEmitter();
  setImmediate(() => child.emit('close', SPAWN_EXIT));
  return child;
}

let FIXTURE_ROOT = null;
let RESTART_CALLS = 0;
const fakeElectron = {
  app: { isPackaged: false, getAppPath: () => FIXTURE_ROOT, getPath: () => path.join(FIXTURE_ROOT, 'userData') },
  BrowserWindow: class {},
  shell: { openExternal: () => {} },
  dialog: {},
  Notification: class {},
};
const fakeBackend = {
  dshHome: () => path.join(FIXTURE_ROOT, 'home'),
  restartBackend: async () => { RESTART_CALLS++; },
};
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
function clearDomainCache() {
  for (const key of Object.keys(require.cache)) {
    if (/shell-(market|plugins|plugin-fetch|update|notify|settings|assets)\.js$/.test(key)
      || /shell-backend\.js$/.test(key) || /updater\.js$/.test(key)
      || /harness-store\.js$/.test(key) || /update-lib\.js$/.test(key)) delete require.cache[key];
  }
}

/** 加载 shell-plugins.js（假面 + 缓存刷新；卸载面用例直接调它）。 */
function loadPlugins(root) {
  FIXTURE_ROOT = root;
  SPAWN.length = 0;
  SPAWN_EXIT = 1;
  const origLoad = installFakeLoader();
  let mod;
  try {
    clearDomainCache();
    mod = require('../shell-plugins.js');
  } finally {
    Module._load = origLoad;
  }
  mod.init({ updaterLog: () => {} });
  return mod;
}

/** 加载 shell-market.js（禁用 / 全部更新用例的直接调用面）。 */
function loadShellMarket(root) {
  FIXTURE_ROOT = root;
  SPAWN.length = 0;
  SPAWN_EXIT = 1;
  RESTART_CALLS = 0;
  const origLoad = installFakeLoader();
  let mod;
  try {
    clearDomainCache();
    mod = require('../shell-market.js');
  } finally {
    Module._load = origLoad;
  }
  require('../shell-plugins.js').init({ updaterLog: () => {} });
  return mod;
}

/** fetch 桩（进程级隔离；缺省立即拒——防真网络 15 s 超时拖垮快慢门）。 */
const FETCH_CALLS = [];
let FETCH_HANDLER = () => Promise.reject(new Error('test-offline'));
globalThis.fetch = (url) => {
  FETCH_CALLS.push(String(url));
  return FETCH_HANDLER(url);
};

// ---------------------------------------------------------------------------
// TC-114 禁用诚实面（B34：profile 清单不可读 ⇒ 不得报假成功）
// 注 = 慢测层（slow()）：清单不可读触发 readProfileManifest 三重试（解析门 + 写盘门双读 ≈ 500 ms）
// ---------------------------------------------------------------------------
slow('TC-114 禁用：清单损坏报「禁用失败」（假成功消除）+ 正常面零回退', async () => {
  const root = mkTmp('tc114');
  // 清单损坏（非法 JSON）+ node_modules/dsh-x 在场（解析面走目录扫描）
  fs.mkdirSync(path.join(root, 'home', 'profiles', 'web'), { recursive: true });
  fs.writeFileSync(path.join(root, 'home', 'profiles', 'web', 'package.json'), '{broken json', 'utf8');
  writeJson(path.join(root, 'home', 'profiles', 'web', 'node_modules', 'dsh-x', 'package.json'), { name: 'dsh-x', version: '1.0.0' });
  const market = loadShellMarket(root); // 单实例：清单按调用时实读，改写文件即可切态（快慢门 <500 ms 预算）
  const bad = await market.marketDisable(null, 'dsh-x');
  assert.strictEqual(bad.ok, false, '清单不可读不得报成功');
  assert.ok(String(bad.message).startsWith('禁用失败：'), bad.message);

  // 正常面：清单合法 + bundles 含 dsh-x ⇒ 禁用成功且真写盘
  writeJson(path.join(root, 'home', 'profiles', 'web', 'package.json'), { name: 'web', private: true, dsh: { profile: { bundles: ['dsh-x'] } } });
  const good = await market.marketDisable(null, 'dsh-x');
  assert.deepStrictEqual(good, { ok: true, message: '已禁用 dsh-x（重启后生效）' });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'home', 'profiles', 'web', 'package.json'), 'utf8'));
  assert.deepStrictEqual(manifest.dsh.profile.bundles, [], 'bundles 应真注销');
});

// ---------------------------------------------------------------------------
// TC-115 / TC-116 受管 tarball 清理（B34：卸载成功 ⇒ 清安装包；外物不动）
// ---------------------------------------------------------------------------
test('TC-115 卸载经 tarball 安装的插件：受管安装包随卸载清理', async () => {
  const root = mkTmp('tc115');
  writeJson(path.join(root, 'home', 'profiles', 'web', 'package.json'), {
    name: 'web', private: true,
    dependencies: { 'dsh-x': 'file:../../plugin-tarballs/owner-dsh-x.tgz' },
    dsh: { profile: { bundles: ['dsh-x'] } },
  });
  writeJson(path.join(root, 'home', 'profiles', 'web', 'node_modules', 'dsh-x', 'package.json'), { name: 'dsh-x', version: '1.0.0' });
  const tgz = path.join(root, 'home', 'plugin-tarballs', 'owner-dsh-x.tgz');
  writeJson(tgz, { fake: 'tarball' });
  const plugins = loadPlugins(root);
  SPAWN_EXIT = 0;
  const res = await plugins.uninstallPlugin('dsh-x');
  assert.deepStrictEqual(res, { ok: true, message: '已卸载 dsh-x' });
  assert.ok(!fs.existsSync(tgz), '受管 tarball 应随卸载清理');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'home', 'profiles', 'web', 'package.json'), 'utf8'));
  assert.deepStrictEqual(manifest.dsh.profile.bundles, [], 'bundles 应注销');
});

test('TC-116 卸载 npm 源插件：非受管依赖不动（外物不动面）', async () => {
  const root = mkTmp('tc116');
  writeJson(path.join(root, 'home', 'profiles', 'web', 'package.json'), {
    name: 'web', private: true,
    dependencies: { 'dsh-y': '^1.0.0' },
    dsh: { profile: { bundles: ['dsh-y'] } },
  });
  writeJson(path.join(root, 'home', 'profiles', 'web', 'node_modules', 'dsh-y', 'package.json'), { name: 'dsh-y', version: '1.0.0' });
  const stray = path.join(root, 'home', 'plugin-tarballs', 'keep.tgz'); // 无主之物的看门件
  writeJson(stray, { keep: true });
  const plugins = loadPlugins(root);
  SPAWN_EXIT = 0;
  const res = await plugins.uninstallPlugin('dsh-y');
  assert.deepStrictEqual(res, { ok: true, message: '已卸载 dsh-y' });
  assert.ok(fs.existsSync(stray), 'registry 依赖卸载不得触碰 plugin-tarballs 外物');
});

// ---------------------------------------------------------------------------
// TC-117 / TC-118 全部更新空结果两面（B34：不重启、不报「成功 0 / 失败 0」）
// ---------------------------------------------------------------------------
test('TC-117 全部更新无可更新项：返回空表 + 不重启后端 + 不起 pnpm', async () => {
  const root = mkTmp('tc117');
  writeJson(path.join(root, 'home', 'profiles', 'web', 'package.json'), { name: 'web', private: true, dsh: { profile: { bundles: [] } } });
  const market = loadShellMarket(root);
  FETCH_CALLS.length = 0;
  const results = await market.marketUpdateAll();
  assert.deepStrictEqual(results, [], '无可更新项应返回空表');
  assert.strictEqual(RESTART_CALLS, 0, '空更新不得重启后端');
  assert.strictEqual(SPAWN.length, 0, '空更新不得起 pnpm');
});

// ---------------------------------------------------------------------------
// 渲染面（TC-118）：vm + 极简 DOM 桩（同 b33 档）
// ---------------------------------------------------------------------------
const MARKET_SRC = fs.readFileSync(path.join(__dirname, '..', 'market.js'), 'utf8');
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

const ticks = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

test('TC-118 全部更新空结果：toast 报「全部已最新」，不报「成功 0 / 失败 0」', async () => {
  const dom = makeDom();
  const api = {
    list: async () => ({ registry: { source: 'remote', plugins: [] }, installed: [], disabled: [], bundledNames: [], updates: [], profileDir: '/p', dshHome: '/h' }),
    state: async () => ({ installed: [], disabled: [], bundledNames: [], updates: [] }),
    install: async () => ({ ok: true, message: '已安装' }),
    uninstall: async () => ({ ok: true, message: '已卸载' }),
    disable: async () => ({ ok: true, message: '已禁用' }),
    enable: async () => ({ ok: true, message: '已启用' }),
    restart: async () => ({ ok: true }),
    update: async () => ({ ok: true, message: '已更新' }),
    updateAll: async () => [], // 主进程空表面（TC-117 同形）
    openExternal: () => {},
  };
  const ctx = vm.createContext({ window: { marketAPI: api }, document: dom.document, setTimeout: () => 0, console });
  vm.runInContext(MARKET_SRC, ctx, { filename: 'market.js' });
  vm.runInContext(MARKET_UPDATE_SRC, ctx, { filename: 'market-update.js' });
  await ticks(5);
  await dom.byId.get('update-all').onclick(); // 触发 doUpdateAll
  await ticks(3);
  const text = dom.byId.get('toasts').children.map((t) => t.textContent).join('\n');
  assert.ok(text.includes('没有可更新的插件'), text);
  assert.ok(!text.includes('成功 0'), `不应报「成功 0 / 失败 0」：${text}`);
});
