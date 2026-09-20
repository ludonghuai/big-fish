'use strict';
/**
 * b33-market-tarball.test.js — B33 行为面断言：github tarball 安装链（TC-107…TC-110）+ 市场 UI 两处（TC-111 失败前缀 / TC-112 弹窗重入）
 * （B33；设计档 docs/design/SHELL-UX.md §2.2.16；手段 14 ② 同 b28 档）
 * 运行：node --test tests/b33-market-tarball.test.js（不登记 package.json、不入 build.files；
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

// ---------------------------------------------------------------------------
// 夹具基建（临时目录 / 假加载器 / 假子进程 / 假 fetch）
// ---------------------------------------------------------------------------
const TMP = [];
function mkTmp(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `b33-${name}-`));
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

/** 子进程桩（spawn 为加载时解构 ⇒ 先于 require 就位；手段 14 ②）。 */
const SPAWN = [];
let SPAWN_EXIT = 1;
let SPAWN_STDERR = ''; // close 前经 stderr 吐出的文本（模拟 pnpm 失败输出）
let SPAWN_HOOK = null; // close 前回调（成功面模拟 pnpm 把真名写进 dependencies）
function fakeSpawn(command, args) {
  SPAWN.push({ command, args: args || [] });
  const child = new EventEmitter();
  child.stdout = null;
  child.stderr = new EventEmitter();
  setImmediate(() => {
    if (SPAWN_STDERR) child.stderr.emit('data', SPAWN_STDERR);
    if (SPAWN_HOOK) SPAWN_HOOK({ command, args });
    child.emit('close', SPAWN_EXIT);
  });
  return child;
}

let FIXTURE_ROOT = null;
const fakeElectron = { app: { isPackaged: false, getAppPath: () => FIXTURE_ROOT, getPath: () => path.join(FIXTURE_ROOT, 'userData') } };
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

/** 加载 shell-plugins.js（连带 shell-plugin-fetch.js；同一假模块面 + 缓存刷新）。 */
function loadPlugins(root) {
  FIXTURE_ROOT = root;
  SPAWN.length = 0;
  SPAWN_EXIT = 1;
  SPAWN_STDERR = '';
  SPAWN_HOOK = null;
  const origLoad = installFakeLoader();
  let mod;
  try {
    for (const key of Object.keys(require.cache)) {
      if (/shell-(plugins|plugin-fetch)\.js$/.test(key)) delete require.cache[key];
    }
    mod = require('../shell-plugins.js');
  } finally {
    Module._load = origLoad;
  }
  mod.init({ updaterLog: () => {} });
  return mod;
}

/** github 安装夹具：空 profile（bundled-plugins 不存在 ⇒ github 面必走下载链）。 */
function githubFixture(name) {
  const root = mkTmp(name);
  writeJson(path.join(root, 'home', 'profiles', 'web', 'package.json'), { name: 'web', private: true, dsh: { profile: { bundles: [] } } });
  return { root, plugins: loadPlugins(root) };
}

/** fetch 桩（本测试文件进程级隔离：node --test 每档一子进程）。 */
const FETCH_CALLS = [];
let FETCH_HANDLER = () => Promise.reject(new Error('unset-fetch-handler'));
globalThis.fetch = (url) => {
  FETCH_CALLS.push(String(url));
  return FETCH_HANDLER(url);
};
function stubFetch(handler) {
  FETCH_CALLS.length = 0;
  FETCH_HANDLER = handler;
}

/** gzip 形假响应（魔数 1f 8b 开头即可过防呆面）。 */
function fakeGzipResponse() {
  const body = Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.from('fake-tarball')]);
  const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
  return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(ab) });
}

/** SPAWN_HOOK 工厂：模拟 pnpm add 成功并把真名写进 profile dependencies。 */
function hookWritesDeps(root, realName) {
  return () => {
    const file = path.join(root, 'home', 'profiles', 'web', 'package.json');
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    m.dependencies = { [realName]: 'file:../../plugin-tarballs/x.tgz' };
    fs.writeFileSync(file, JSON.stringify(m, null, 2));
  };
}

// ---------------------------------------------------------------------------
// github tarball 安装链（TC-107…TC-110）
// ---------------------------------------------------------------------------
test('TC-107 github 源成功链：codeload 直连 → pnpm add 本地 tgz → 真名注册 bundles', async () => {
  const { root, plugins } = githubFixture('tc94');
  stubFetch(() => fakeGzipResponse());
  SPAWN_EXIT = 0;
  SPAWN_HOOK = hookWritesDeps(root, 'dsh-x');
  const res = await plugins.installPlugin('github:owner/dsh-x');
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(FETCH_CALLS.length, 1, '直连成功不应回退镜像');
  assert.strictEqual(FETCH_CALLS[0], 'https://codeload.github.com/owner/dsh-x/tar.gz/HEAD');
  assert.strictEqual(SPAWN.length, 1, '应起一次 pnpm add');
  const addSpec = String(SPAWN[0].args[SPAWN[0].args.length - 1]);
  assert.ok(/plugin-tarballs\/owner-dsh-x\.tgz$/.test(addSpec), `pnpm 实参应为本地 tgz：${addSpec}`);
  assert.ok(!addSpec.includes('github:'), 'pnpm 实参不得带 github: 原始标识');
  assert.ok(fs.existsSync(path.join(root, 'home', 'plugin-tarballs', 'owner-dsh-x.tgz')), 'tarball 应持久落盘');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'home', 'profiles', 'web', 'package.json'), 'utf8'));
  assert.ok(manifest.dsh.profile.bundles.includes('dsh-x'), 'bundles 应注册真名');
});

test('TC-108 直连失败回退镜像：第二源成功 ⇒ 装成', async () => {
  const { root, plugins } = githubFixture('tc95');
  stubFetch((url) => (String(url).startsWith('https://codeload.github.com/') ? Promise.reject(new Error('connect reset')) : fakeGzipResponse()));
  SPAWN_EXIT = 0;
  SPAWN_HOOK = hookWritesDeps(root, 'dsh-y');
  const res = await plugins.installPlugin('github:owner/dsh-y');
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(FETCH_CALLS.length, 2, '直连失败后应尝试第二源');
  assert.ok(FETCH_CALLS[1].startsWith('https://ghproxy.net/'), `第二源应为镜像表首项：${FETCH_CALLS[1]}`);
});

test('TC-109 全源失败：中文指引 + 不起 pnpm + 注册面零改动', async () => {
  const { root, plugins } = githubFixture('tc96');
  const pluginFetch = require('../shell-plugin-fetch.js'); // loadPlugins 已带假面加载 ⇒ 取缓存同实例
  stubFetch(() => Promise.reject(new Error('connect reset')));
  const res = await plugins.installPlugin('github:owner/dsh-z');
  assert.strictEqual(res.ok, false);
  assert.ok(res.message.includes('GitHub 直连与镜像源均不可用'), res.message);
  assert.ok(!/pnpm\.cjs|at\s+async/.test(res.message), '不应含堆栈帧');
  assert.strictEqual(SPAWN.length, 0, '下载全败不应起 pnpm');
  assert.strictEqual(FETCH_CALLS.length, 1 + pluginFetch.GITHUB_MIRRORS.length, '应尝遍下载链（直连 + 镜像表）');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'home', 'profiles', 'web', 'package.json'), 'utf8'));
  assert.deepStrictEqual(manifest.dsh.profile.bundles, [], 'bundles 不应改动');
});

test('TC-110 pnpm 失败归类：网络受限句 + 原始输出不进 message', async () => {
  const { root, plugins } = githubFixture('tc97');
  stubFetch(() => fakeGzipResponse());
  SPAWN_EXIT = 1;
  SPAWN_STDERR = 'ERR_PNPM_GIT_CLONE_FAILED  Failed to clone\nfatal: Connection was reset\nPlease make sure you have the correct access rights and the repository exists.\n    at async getRepoRefs (D:\\x\\pnpm.cjs:50247:23)';
  const res = await plugins.installPlugin('github:owner/dsh-w');
  assert.strictEqual(res.ok, false);
  assert.ok(res.message.startsWith('安装失败：'), res.message);
  assert.ok(res.message.includes('网络受限'), res.message);
  assert.ok(!res.message.includes('pnpm.cjs') && !res.message.includes('at async'), '不应含堆栈帧');
  assert.ok(!res.message.includes('access rights'), '不应含原始英文报错');
});

// ---------------------------------------------------------------------------
// 市场 UI 两面（TC-111 / TC-112）：vm + 极简 DOM 桩（同 b28 手段）
// ---------------------------------------------------------------------------
const MARKET_SRC = fs.readFileSync(path.join(__dirname, '..', 'market.js'), 'utf8');
const MARKET_UPDATE_SRC = fs.readFileSync(path.join(__dirname, '..', 'market-update.js'), 'utf8'); // 同页第二只 <script>（failText / updOf 由此提供）

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
  return {
    list: async () => ({ registry: { source: 'remote', plugins }, installed, disabled: [], bundledNames, updates: [], profileDir: '/p', dshHome: '/h' }),
    state: async () => ({ installed, disabled: [], bundledNames, updates: [] }),
    install: async () => ({ ok: true, message: '已安装' }),
    uninstall: async () => ({ ok: true, message: '已卸载' }),
    disable: async () => ({ ok: true, message: '已禁用' }),
    enable: async () => ({ ok: true, message: '已启用' }),
    restart: async () => ({ ok: true }),
    openExternal: () => {},
  };
}

const ticks = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

/** 载入 market.js（+ market-update.js sibling）并等 refresh() 渲染完成。 */
async function driveMarket(installed, bundledNames, plugins) {
  const dom = makeDom();
  const api = makeApi(plugins || [], installed, bundledNames || []);
  const ctx = vm.createContext({ window: { marketAPI: api }, document: dom.document, setTimeout: () => 0, console });
  vm.runInContext(MARKET_SRC, ctx, { filename: 'market.js' });
  vm.runInContext(MARKET_UPDATE_SRC, ctx, { filename: 'market-update.js' });
  await ticks(5);
  return { dom, ctx, api };
}

test('TC-111 安装失败 toast 不叠双重前缀', async () => {
  const catalog = [{ name: 'g', owner: 'o', url: 'https://github.com/o/g', category: 'fun', description: { zh: 'x' }, npm: null, stars: 0, install: 'dsh plugin --profile web add github:o/g' }];
  const { dom, api } = await driveMarket([], [], catalog);
  api.install = async () => ({ ok: false, message: '安装失败：网络受限，无法连接插件源。' }); // 换桩：主进程归类后的失败
  const btn = dom.all.find((e) => e.tagName === 'BUTTON' && e.textContent === '安装');
  assert.ok(btn, 'github 条目应渲染「安装」按钮');
  const done = btn.onclick(); // 触发 onInstall（confirmModal 悬挂待确认）
  await ticks(2);
  dom.byId.get('m-ok').onclick(); // 点「安装」确认
  await done;
  await ticks(3);
  const text = dom.byId.get('toasts').children.map((t) => t.textContent).join('\n');
  assert.ok(!text.includes('安装失败：安装失败'), `toast 叠了双重前缀：${text}`);
  assert.ok(text.includes('安装失败：网络受限'), text);
});

test('TC-112 弹窗重入守卫：第二次 showModal 立即 resolve(false)，前者不被覆盖', async () => {
  const { dom, ctx } = await driveMarket([], [], []);
  const showModal = vm.runInContext('showModal', ctx);
  const node = dom.document.createElement('div');
  const p1 = showModal('第一框', node, '确定');
  const p2 = showModal('第二框', node, '确定');
  assert.strictEqual(await p2, false, '重入应立即取消后者');
  dom.byId.get('m-ok').onclick(); // 关闭第一框
  assert.strictEqual(await p1, true, '前者应正常结算');
});
