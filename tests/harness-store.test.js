'use strict';
/**
 * 开发期单元断言 —— Harness 版本库面（B04；设计档 docs/design/AUTO-UPDATE.md §3.3 T-A1…T-A8，
 * 映射 §3.2 的 TC-16 / TC-26…TC-31 + AC9-b / AC13）。
 * 运行：node --test tests/harness-store.test.js
 * 直驱 harness-store.js（纯 Node、无 Electron、不 spawn 真 pnpm：冒烟 runner 以假实现注入）。
 * 退役/转正处置在批次档 §6 逐条判定（默认退役）。
 */
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('../harness-store.js');

const V = '0.1.5-rc.1';      // 目标版本（批次档 §1.6 事实 7 的目标）
const PREV = '0.1.0-rc.6';   // 出厂 / 上一版本
const TMP = [];

function tmpUserData(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bigfish-hs-${name}-`));
  TMP.push(dir);
  return dir;
}

after(() => {
  for (const dir of TMP) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/** 造一个可解析的运行时副本：bin.js + dsh 包 package.json.version（可分别抽掉 / 改版本）。 */
function makeCopy(dir, version, { bin = true, pkgVersion = version } = {}) {
  const pkgDir = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh');
  fs.mkdirSync(path.join(pkgDir, 'lib'), { recursive: true });
  if (bin) fs.writeFileSync(path.join(pkgDir, 'lib', 'bin.js'), '// dsh bin\n');
  if (pkgVersion) {
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: pkgVersion }));
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'dsh-runtime-update', private: true, dependencies: {} }));
  return dir;
}

const versionDir = (userData, version) => path.join(userData, 'dsh-update', 'versions', version);
const relVersion = (version) => 'dsh-update/versions/' + version;
const pointerFile = (userData) => path.join(userData, 'dsh-active.json');
const writeRawPointer = (userData, text) => fs.writeFileSync(pointerFile(userData), text);
const validEntry = (version, prev = null) => ({ version, dir: relVersion(version), prev, activatedAt: new Date().toISOString() });
/** 假冒烟 runner（注入面：本仓不自建子进程）。 */
const runner = (code = 0, output = V) => async () => ({ code, output });

// ---------------------------------------------------------------------------
// T-A1 正常：prepare / activate / 解析 / 复核（§3.3；TC-16）
// ---------------------------------------------------------------------------
test('T-A1 prepare + activate：版本目录落盘 → 指针命中 → verifyActive ok:1 stage:smoke', async () => {
  const userData = tmpUserData('ta1');
  // ① prepare：版本目录 + 精确版本依赖（不改名 / 不移动，I-1）
  const fresh = store.prepareVersionDir(userData, '0.1.6');
  const manifest = JSON.parse(fs.readFileSync(path.join(fresh, 'package.json'), 'utf8'));
  assert.strictEqual(manifest.name, 'dsh-runtime-update');
  assert.deepStrictEqual(manifest.dependencies, { '@deepseek-ai/dsh': '0.1.6' });

  const dir = makeCopy(versionDir(userData, V), V);
  const act = await store.activate(userData, V, runner());
  assert.strictEqual(act.ok, true);
  assert.strictEqual(act.mode, 'activated');
  const p = store.readPointer(userData);
  assert.strictEqual(p.version, V);
  assert.strictEqual(p.dir, relVersion(V)); // userData 相对路径（DD-20）
  assert.strictEqual(p.prev, null);
  assert.strictEqual(store.resolveActiveBin(userData), store.binPathIn(dir));
  const verify = await store.verifyActive(userData, V, runner());
  assert.strictEqual(verify.ok, true);
  assert.strictEqual(verify.stage, 'smoke');

  // 重装守卫：目标目录 == 活跃目录 → 拒绝（绝不在活跃副本原地重装），活跃副本不被清
  assert.throws(() => store.prepareVersionDir(userData, V), /guard-active-dir/);
  assert.strictEqual(fs.existsSync(store.binPathIn(dir)), true);
  // 非法版本名（路径穿越面）→ throw
  assert.throws(() => store.prepareVersionDir(userData, '../../evil'), /invalid-version-name/);
});

// ---------------------------------------------------------------------------
// T-A2 错误：失效副本故障注入（§3.3；TC-26 / AC9-b）
// ---------------------------------------------------------------------------
test('T-A2 失效副本（bin.js 缺失）：verify ok:0 stage:resolve → activate 回滚回出厂', async () => {
  const userData = tmpUserData('ta2');
  const broken = versionDir(userData, V);
  makeCopy(broken, V, { bin: false });
  const verify = await store.verifyActive(userData, V, runner());
  assert.strictEqual(verify.ok, false);
  assert.strictEqual(verify.stage, 'resolve');

  const act = await store.activate(userData, V, runner()); // 无 prev → 清指针 = 回出厂
  assert.strictEqual(act.ok, false);
  assert.strictEqual(act.stage, 'verify');
  assert.strictEqual(act.detail, 'verify-fail:resolve');
  assert.strictEqual(act.mode, 'factory');
  assert.strictEqual(act.rollbackDetail, 'factory');
  assert.strictEqual(act.rolledBack, true);
  assert.strictEqual(store.readPointer(userData), null);
  assert.strictEqual(store.resolveActiveBin(userData), null); // 解析回退出厂（main.js 兜底）
  assert.strictEqual(fs.existsSync(broken), false);            // 失效版本目录已回收
});

test('T-A2b 失效副本（悬空链接）：有 prev → activate 回滚回 prev；不可构造则跳过', async (t) => {
  const userData = tmpUserData('ta2b');
  const dir = versionDir(userData, V);
  makeCopy(dir, V);
  const dshDir = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh');
  fs.rmSync(dshDir, { recursive: true, force: true });
  try {
    fs.symlinkSync(path.join(userData, 'not-exist-target'), dshDir, 'junction'); // junction 目标不存在 = 树内链接悬空
  } catch (err) {
    t.skip('本平台不可构造 junction：' + ((err && err.message) || err));
    return;
  }
  const prevDir = versionDir(userData, PREV);
  makeCopy(prevDir, PREV);
  store.writePointer(userData, validEntry(PREV));
  const act = await store.activate(userData, V, runner());
  assert.strictEqual(act.ok, false);
  assert.strictEqual(act.detail, 'verify-fail:resolve');
  assert.strictEqual(act.mode, 'restored');
  assert.strictEqual(act.rollbackDetail, 'restored:' + PREV);
  assert.strictEqual(store.readPointer(userData).version, PREV);
  assert.strictEqual(store.resolveActiveBin(userData), store.binPathIn(prevDir));
});

// ---------------------------------------------------------------------------
// T-A3 / T-A4 错误：版本读数面 / 冒烟面失败（§3.3；TC-26 / AC13）
// ---------------------------------------------------------------------------
test('T-A3 版本读数 ≠ 目标：verify ok:0 stage:version → 回滚', async () => {
  const userData = tmpUserData('ta3');
  makeCopy(versionDir(userData, V), V, { pkgVersion: '9.9.9' });
  store.writePointer(userData, validEntry(V));
  const verify = await store.verifyActive(userData, V, runner());
  assert.strictEqual(verify.ok, false);
  assert.strictEqual(verify.stage, 'version');
  const act = await store.activate(userData, V, runner());
  assert.strictEqual(act.detail, 'verify-fail:version');
  assert.strictEqual(act.mode, 'factory');
  assert.strictEqual(store.readPointer(userData), null);
});

test('T-A4 冒烟失败（非零 / 输出不含版本）：verify stage:smoke → activate 回滚并回报 restored', async () => {
  const userData = tmpUserData('ta4');
  makeCopy(versionDir(userData, PREV), PREV);
  store.writePointer(userData, validEntry(PREV));

  makeCopy(versionDir(userData, V), V);
  const act = await store.activate(userData, V, runner(1, 'boom'));
  assert.strictEqual(act.ok, false);
  assert.strictEqual(act.stage, 'verify');
  assert.strictEqual(act.verifyStage, 'smoke');
  assert.strictEqual(act.detail, 'verify-fail:smoke');
  assert.strictEqual(act.mode, 'restored');
  assert.strictEqual(act.rollbackDetail, 'restored:' + PREV);
  assert.strictEqual(store.readPointer(userData).version, PREV); // 指针回 prev，旧版可启动

  makeCopy(versionDir(userData, V), V);
  const act2 = await store.activate(userData, V, runner(0, 'dsh 9.9.9'));
  assert.strictEqual(act2.detail, 'verify-fail:smoke');
  assert.strictEqual(act2.rolledBack, true);
  assert.strictEqual(store.resolveActiveBin(userData), store.binPathIn(versionDir(userData, PREV)));

  // 场景 ③：runner 抛异常 —— 不得静默放行（AC9-b）
  makeCopy(versionDir(userData, V), V);
  const act3 = await store.activate(userData, V, async () => { throw new Error('runner exploded'); });
  assert.strictEqual(act3.detail, 'verify-fail:smoke');
  assert.strictEqual(act3.rolledBack, true);
  assert.strictEqual(store.readPointer(userData).version, PREV);
});

// ---------------------------------------------------------------------------
// T-A5 / T-A6 边界：旧布局迁移 / 版本 GC（§3.3；TC-27…TC-29 / AC13）
// ---------------------------------------------------------------------------
test('T-A5 无指针 + 旧布局：可解析 → 采纳写指针；不可解析 → 回收', () => {
  // ① 可解析 → 采纳（不重装、不删除该副本；POSIX 上已更新过的用户）
  const u1 = tmpUserData('ta5a');
  const legacy = path.join(u1, 'dsh');
  makeCopy(legacy, PREV);
  const r1 = store.cleanup(u1);
  assert.strictEqual(r1.legacy, 'adopted');
  assert.strictEqual(r1.adopted, PREV);
  assert.strictEqual(r1.legacyVersion, PREV);
  assert.strictEqual(r1.active, PREV);
  assert.deepStrictEqual(r1.removed, []);
  assert.strictEqual(store.readPointer(u1).dir, 'dsh');
  assert.strictEqual(store.resolveActiveBin(u1), store.binPathIn(legacy));
  assert.strictEqual(fs.existsSync(legacy), true);

  // ② 不可解析（本缺陷产物：失效 junction 树）→ 回收，不写指针
  const u2 = tmpUserData('ta5b');
  const broken = path.join(u2, 'dsh');
  makeCopy(broken, V, { bin: false });
  const r2 = store.cleanup(u2);
  assert.strictEqual(r2.legacy, 'removed');
  assert.strictEqual(r2.legacyVersion, 'unknown');
  assert.strictEqual(r2.active, null);
  assert.strictEqual(fs.existsSync(broken), false);
  assert.strictEqual(store.readPointer(u2), null);
  assert.strictEqual(store.resolveActiveBin(u2), null); // 回退出厂副本
});

test('T-A6 版本 GC：只删非活跃者（含可解析非活跃旧布局），现行副本保留，悬空 prev 置 null', () => {
  const userData = tmpUserData('ta6');
  const A = makeCopy(versionDir(userData, PREV), PREV);
  const B = versionDir(userData, V);
  makeCopy(B, V);
  const legacyDsh = path.join(userData, 'dsh');
  makeCopy(legacyDsh, '0.1.0-rc.5'); // 可解析但非活跃（指针不指向它）
  fs.mkdirSync(path.join(userData, 'dsh-prev', 'x'), { recursive: true });
  fs.mkdirSync(path.join(userData, 'dsh-update', 'staging', 'x'), { recursive: true });
  store.writePointer(userData, {
    version: PREV,
    dir: relVersion(PREV),
    prev: { version: V, dir: relVersion(V) },
    activatedAt: new Date().toISOString(),
  });

  const res = store.cleanup(userData);
  assert.strictEqual(res.active, PREV);
  assert.strictEqual(res.removed.length, 4); // B + 可解析非活跃 dsh + dsh-prev + staging
  assert.strictEqual(fs.existsSync(A), true); // 现行副本保留（AC13 不误删）
  assert.strictEqual(fs.existsSync(B), false);
  assert.strictEqual(fs.existsSync(legacyDsh), false);
  assert.strictEqual(fs.existsSync(path.join(userData, 'dsh-prev')), false);
  assert.strictEqual(fs.existsSync(path.join(userData, 'dsh-update', 'staging')), false);
  assert.strictEqual(store.readPointer(userData).prev, null); // prev 引用被回收目录 → 一并置 null
  assert.strictEqual(store.resolveActiveBin(userData), store.binPathIn(A));
});

// ---------------------------------------------------------------------------
// T-A7 / T-A8 指针防御与原子写（§3.3；TC-30）
// ---------------------------------------------------------------------------
test('T-A7 指针吸形：坏 JSON / 越出 userData / 绝对路径 / 非法版本名 / 非法 prev → readPointer null', () => {
  const userData = tmpUserData('ta7');
  const bad = [
    'not-json{',
    '[]',
    JSON.stringify({ version: V, dir: '../../x' }),
    JSON.stringify({ version: V, dir: path.resolve(userData, 'dsh-update', 'versions', V) }),
    JSON.stringify({ version: '../../evil', dir: relVersion(V) }),
    JSON.stringify({ version: V, dir: relVersion(V), prev: { version: V, dir: '..' } }),
    JSON.stringify({ version: V, dir: relVersion(V), prev: 'dsh' }),
    JSON.stringify({ version: V }),
  ];
  for (const text of bad) {
    writeRawPointer(userData, text);
    assert.strictEqual(store.readPointer(userData), null, '应判为无指针：' + text);
  }
  assert.strictEqual(store.resolveActiveBin(userData), null); // 不越出 userData、不抛异常
});

test('T-A8 指针原子写：回读完整 JSON、无 .tmp 残留、非法 entry 不污染既有指针', () => {
  const userData = tmpUserData('ta8');
  const entry = validEntry(V);
  store.writePointer(userData, entry);
  const parsed = JSON.parse(fs.readFileSync(pointerFile(userData), 'utf8')); // 完整 JSON（非半写）
  assert.strictEqual(parsed.version, V);
  assert.strictEqual(parsed.dir, relVersion(V));
  assert.strictEqual(parsed.prev, null);
  assert.deepStrictEqual(store.readPointer(userData), { ...entry, prev: null });
  assert.deepStrictEqual(fs.readdirSync(userData).filter((f) => f.includes('.tmp')), []);
  assert.throws(() => store.writePointer(userData, { version: '../x', dir: relVersion(V) }), /invalid-pointer-entry/);
  assert.throws(() => store.writePointer(userData, { version: V }), /invalid-pointer-entry/);
  assert.strictEqual(store.readPointer(userData).version, V); // 既有指针未被污染
});
