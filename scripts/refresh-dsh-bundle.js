'use strict';
/**
 * refresh-dsh-bundle.js — 内置 bundle（出厂冻结树）的刷新路径与只读判定（B08；设计档 docs/design/AUTO-UPDATE.md §2.2.10）。
 * 函数清单：parseArgs · usage · getJson · fetchTag · readPin · writePin · lockState · smoke · npmInstall · restorePair · summarize · main。
 * 依赖方向：维护侧工具——只用 Node 内置 + npm CLI（零第三方依赖，先例 scripts/ensure-deps.js）；不进 build.files；
 *           与 scripts/ensure-deps.js 写同一目录（dsh-bundle/），两者不得同时执行（设计档 §2.2.10 产物链）。
 * 判定口径：离线版钉版 = 注册表 `latest` dist-tag（精确串，与 US-6 / DD-5 同口径；不追 next / alpha）；
 *           `--check` 退出码 0 = 已最新且锁自洽 / 1 = 落后 / 2 = 取版本失败或锁自洽不过；
 *           刷新失败不留半成品（钉版回 pin0 + 锁回 lock0 的二元组写回）。
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const ROOT = path.join(__dirname, '..');
const BUNDLE_DIR = path.join(ROOT, 'dsh-bundle');
const BUNDLE_PKG = path.join(BUNDLE_DIR, 'package.json');
const BUNDLE_LOCK = path.join(BUNDLE_DIR, 'package-lock.json');
const DSH_NAME = '@deepseek-ai/dsh';
const DSH_BIN = path.join(BUNDLE_DIR, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');

// 取版本源（默认顺序 = npmmirror 优先 → npmjs 兜底重试一次）；--registry 传参时两处同源（设计档 §2.2.10 / L15）
const REGISTRY_NPMIRROR = 'https://registry.npmmirror.com';
const REGISTRY_NPMJS = 'https://registry.npmjs.org';
const FETCH_TIMEOUT_MS = 10000;

const EXIT_OK = 0;      // 已最新（且锁自洽）/ 刷新成功 / 修复成功
const EXIT_BEHIND = 1;  // 落后（仅 --check）
const EXIT_FAIL = 2;    // 取版本失败 / 锁自洽不过 / 刷新（含修复）失败

/** 启动时二元组（②；失败面写回的唯一数据源——main 读到后装配）。 */
let snapshot = null;

/** 「已开始改写落盘」标记：异常（catch-all）路径据此决定是否补写回（DD-26 失败面不得漏）。 */
let pairTouched = false;

/** catch-all 摘要的取值面（parseArgs / fetchTag 逐段落笔——异常时也报真实 tag 与源）。 */
const ctx = { tag: 'latest', source: 'unknown' };

/** 取锁文件字节数（无锁 = 0）。 */
function lockBytes() {
  try { return fs.statSync(BUNDLE_LOCK).size; } catch { return 0; }
}

/** 摘要行（每次运行恒在场；字段 = action / pin / tag / registry / lock，detail 仅失败面附加）。 */
function summarize(action, pin0, next, tag, source, lock, detail) {
  const tail = detail ? ` detail=${detail}` : '';
  console.log(`bundle refresh action=${action} pin=${pin0} -> ${next} tag=${tag} registry=${source} lock=${lock}${tail}`);
}

function usage() {
  console.error('用法：node scripts/refresh-dsh-bundle.js [--check] [--registry <url>] [--tag <dist-tag>]');
  console.error('  --check         只读判定（不写任何文件）；退出码 0 = 已最新且锁自洽 / 1 = 落后 / 2 = 取版本失败或锁自洽不过');
  console.error('  --registry <url>  同时约束取版本与 npm install（默认 = npmmirror 优先，失败改 npmjs 兜底）');
  console.error('  --tag <dist-tag>  默认 latest（不追 next / alpha）');
}

function parseArgs(argv) {
  const out = { check: false, registry: null, tag: 'latest' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const name = eq === -1 ? a : a.slice(0, eq);
    const inline = eq === -1 ? null : a.slice(eq + 1);
    if (a === '--check') { out.check = true; continue; }
    if (name === '--registry' || name === '--tag') {
      const v = inline !== null ? inline : argv[i + 1];
      if (inline === null) i += 1;
      // 取值以 `--` 开头 ⇒ 视作漏值（如 `--registry --check` 不得把 `--check` 当 URL 吞掉）
      if (!v || v.startsWith('--')) return { error: `${name} 需要一个取值` };
      if (name === '--registry') out.registry = v; else out.tag = v;
      continue;
    }
    return { error: `未知参数：${a}` };
  }
  return out;
}

/** 注册表元数据 URL（`<registry>/<包名>`；尾斜杠归一）。 */
function metaUrl(base) {
  return `${String(base).replace(/\/+$/, '')}/${DSH_NAME}`;
}

/** GET 一个 JSON 端点（超时 10s；http/https 按 URL 协议自选——TC-37 的不可达地址即 http）。 */
function getJson(url) {
  return new Promise((resolve) => {
    let mod;
    try { mod = new URL(url).protocol === 'https:' ? https : http; } catch { resolve({ ok: false, error: `URL 非法：${url}` }); return; }
    const req = mod.get(url, { timeout: FETCH_TIMEOUT_MS }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) { resolve({ ok: false, error: `HTTP ${res.statusCode}` }); return; }
        try { resolve({ ok: true, json: JSON.parse(body) }); } catch (e) { resolve({ ok: false, error: `响应非 JSON（${e.message}）` }); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error(`超时（${FETCH_TIMEOUT_MS} ms）`)); });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

/** ① 取 dist-tags[tag] → 目标版本；返回 { ok, version, source } 或 { ok:false, error }。 */
async function fetchTag(tag, registry) {
  const candidates = registry
    ? [{ base: registry, source: `custom:${registry}` }]
    : [{ base: REGISTRY_NPMIRROR, source: 'npmmirror' }, { base: REGISTRY_NPMJS, source: 'npmjs' }];
  const errors = [];
  for (const c of candidates) {
    const r = await getJson(metaUrl(c.base));
    if (!r.ok) { errors.push(`${c.source}: ${r.error}`); continue; }
    const v = r.json && r.json['dist-tags'] && r.json['dist-tags'][tag];
    if (!v) { errors.push(`${c.source}: dist-tags.${tag} 缺失`); continue; }
    return { ok: true, version: String(v), source: c.source };
  }
  return { ok: false, error: errors.join('; ') };
}

/** 读当前钉版（② 的 pin0 = 启动时形态；原文一并带回，供失败面写回）。 */
function readPin() {
  const raw = fs.readFileSync(BUNDLE_PKG);
  const pkg = JSON.parse(raw.toString('utf8'));
  const pin = pkg && pkg.dependencies && pkg.dependencies[DSH_NAME];
  if (typeof pin !== 'string' || pin === '') throw new Error(`${path.relative(ROOT, BUNDLE_PKG)} 缺少 ${DSH_NAME} 精确钉版`);
  return { raw, pin };
}

/** ③ 写钉版 = target（文本级值替换——除该行值外逐字节不动，不重排 JSON）。 */
function writePin(target, pin0) {
  const src = fs.readFileSync(BUNDLE_PKG, 'utf8');
  const re = new RegExp(`("@deepseek-ai/dsh"\\s*:\\s*)"${pin0.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
  const hits = src.match(re);
  if (!hits || hits.length !== 1) throw new Error(`钉版行匹配数 = ${hits ? hits.length : 0}（期望 1）`);
  fs.writeFileSync(BUNDLE_PKG, src.replace(re, `$1"${target}"`));
  return readPin().pin === target; // D6 回读核对
}

/** ⑥ 锁自洽断言（= NFR-5 的「等价校验」）：锁根依赖串与 dsh 条目版本 == target。 */
function lockState(target) {
  let lock;
  try { lock = JSON.parse(fs.readFileSync(BUNDLE_LOCK, 'utf8')); } catch (e) { return { ok: false, error: `锁文件读取/解析失败：${e.message}`, bytes: lockBytes() }; }
  const root = lock.packages && lock.packages[''] && lock.packages[''].dependencies;
  const entry = lock.packages && lock.packages[`node_modules/${DSH_NAME}`];
  const rootPin = root ? root[DSH_NAME] : undefined;
  const entryVersion = entry ? entry.version : undefined;
  const ok = rootPin === target && entryVersion === target;
  const detail = ok ? '' : `锁根依赖串=${rootPin === undefined ? '(缺失)' : rootPin} 锁内 dsh 条目版本=${entryVersion === undefined ? '(缺失)' : entryVersion}`;
  return { ok, error: detail, bytes: lockBytes() };
}

/** ⑤ 安装后冒烟：跑刷新所得的树 `bin.js --version`，退出 0 且输出含 target。 */
function smoke(target) {
  if (!fs.existsSync(DSH_BIN)) return { ok: false, error: `bin.js 不存在（${path.relative(ROOT, DSH_BIN)}）` };
  const res = spawnSync(process.execPath, [DSH_BIN, '--version'], { encoding: 'utf8', timeout: 60000 });
  const full = `${res.stdout || ''}${res.stderr || ''}`.trim();
  const out = full.split('\n')[0];
  if (res.status !== 0) return { ok: false, out, error: `退出码 ${res.status}` };
  if (!full.includes(target)) return { ok: false, out, error: `输出不含 ${target}（实测 ${out}）` };
  return { ok: true, out };
}

/** ④ cwd=dsh-bundle 跑 npm install（--save-exact 保精确钉版；--registry 两处同源）。 */
function npmInstall(registry) {
  const args = ['install', '--omit=dev', '--save-exact', '--no-audit', '--no-fund'];
  if (registry) args.push('--registry', registry);
  console.log(`[bundle] cd ${path.relative(ROOT, BUNDLE_DIR)} && npm ${args.join(' ')}`);
  const res = spawnSync(['npm', ...args].join(' '), { cwd: BUNDLE_DIR, stdio: 'inherit', shell: true });
  return res.status === 0;
}

/** 失败面二元组写回（钉版 → pin0 + 锁 → lock0）；返回是否写回成功。 */
function restorePair(pinBytes, lockBytes0) {
  try {
    fs.writeFileSync(BUNDLE_PKG, pinBytes);
    if (lockBytes0 === null) fs.rmSync(BUNDLE_LOCK, { force: true });
    else fs.writeFileSync(BUNDLE_LOCK, lockBytes0);
    return true;
  } catch { return false; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    usage();
    summarize('refresh', '(未知)', '(未知)', ctx.tag, ctx.source, lockBytes(), `bad-args: ${args.error}`);
    return EXIT_FAIL;
  }
  ctx.tag = args.tag;

  const fetched = await fetchTag(args.tag, args.registry);
  if (!fetched.ok) {
    ctx.tag = args.tag;
    summarize('refresh', '(未知)', '(未知)', args.tag, args.registry ? `custom:${args.registry}` : 'unknown', lockBytes(), `fetch-fail: ${fetched.error}`);
    return EXIT_FAIL;
  }
  const target = fetched.version;
  const source = fetched.source;
  ctx.source = source;

  let pin0;
  let pinBytes;
  try { ({ raw: pinBytes, pin: pin0 } = readPin()); } catch (e) {
    summarize('refresh', '(未知)', target, args.tag, source, lockBytes(), `pin-read-fail: ${e.message}`);
    return EXIT_FAIL;
  }
  const lockBytes0 = fs.existsSync(BUNDLE_LOCK) ? fs.readFileSync(BUNDLE_LOCK) : null;
  snapshot = { pinBytes, lockBytes0 };

  // ---- 只读判定（--check）：三态，判定次序 = 落后优先 ----
  if (args.check) {
    if (pin0 !== target) {
      const st = lockState(target);
      summarize('refresh', pin0, target, args.tag, source, st.bytes, 'behind');
      return EXIT_BEHIND;
    }
    const st = lockState(target);
    if (!st.ok) {
      summarize('repair', pin0, target, args.tag, source, st.bytes, `lock-inconsistent: ${st.error}`);
      return EXIT_FAIL;
    }
    summarize('none', pin0, target, args.tag, source, st.bytes, '');
    return EXIT_OK;
  }

  // ---- 幂等面（②b）与修复面（②c）：已最新时 ⑤⑥ 仍为可达面 ----
  if (pin0 === target) {
    const s1 = smoke(target);
    const l1 = lockState(target);
    if (s1.ok && l1.ok) {
      summarize('none', pin0, target, args.tag, source, l1.bytes, '');
      return EXIT_OK;
    }
    const why1 = s1.ok ? `lock-inconsistent: ${l1.error}` : `smoke-fail: ${s1.error}`;
    console.log(`[bundle] 钉版已最新但自洽不过（${why1}）→ 走修复面（重跑安装）`);
    pairTouched = true;
    if (!npmInstall(args.registry)) {
      const restored = restorePair(pinBytes, lockBytes0);
      summarize('repair-fail', pin0, target, args.tag, source, restored ? lockBytes() : 'restore-fail', 'install-fail');
      return EXIT_FAIL;
    }
    const s2 = smoke(target);
    const l2 = lockState(target);
    if (s2.ok && l2.ok) {
      summarize('repair', pin0, target, args.tag, source, l2.bytes, '');
      return EXIT_OK;
    }
    const why2 = s2.ok ? `lock-inconsistent: ${l2.error}` : `smoke-fail: ${s2.error}`;
    const restored = restorePair(pinBytes, lockBytes0);
    summarize('repair-fail', pin0, target, args.tag, source, restored ? lockBytes() : 'restore-fail', why2);
    return EXIT_FAIL;
  }

  // ---- 刷新面（① 已取版本 → ③ 写钉版 → ④ 安装 → ⑤ 冒烟 → ⑥ 自洽） ----
  const fail = (detail) => {
    const restored = restorePair(pinBytes, lockBytes0);
    if (!restored) console.error(`[bundle] 二元组写回失败——请手工兜底：git checkout -- dsh-bundle/package.json dsh-bundle/package-lock.json`);
    else console.error('[bundle] 已写回启动时形态（钉版 + 锁），未留半成品');
    summarize('refresh', pin0, target, args.tag, source, restored ? lockBytes() : 'restore-fail', detail);
    return EXIT_FAIL;
  };

  pairTouched = true; // ③ 起即进入落盘面——后续任何失败都必须成对写回
  try {
    if (!writePin(target, pin0)) throw new Error('钉版回读核对失败');
  } catch (e) {
    return fail(`pin-write-fail: ${e.message}`);
  }
  if (!npmInstall(args.registry)) return fail('install-fail');
  const s = smoke(target);
  if (!s.ok) return fail(`smoke-fail: ${s.error}`);
  const l = lockState(target);
  if (!l.ok) return fail(`lock-inconsistent: ${l.error}`);
  console.log(`[bundle] 冒烟通过：${s.out}`);
  summarize('refresh', pin0, target, args.tag, source, l.bytes, '');
  return EXIT_OK;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[bundle] 未预期错误：${err && err.stack ? err.stack : err}`);
    // 异常兜底同样不留半成品：③ 起若已改写落盘，则补写回启动时二元组（DD-26 失败面统一形态）
    const restored = !pairTouched || !snapshot ? true : restorePair(snapshot.pinBytes, snapshot.lockBytes0);
    if (!restored) console.error('[bundle] 二元组写回失败——请手工兜底：git checkout -- dsh-bundle/package.json dsh-bundle/package-lock.json');
    summarize('refresh', snapshot ? snapshot.pin : '(未知)', '(未知)', ctx.tag, ctx.source, restored ? lockBytes() : 'restore-fail', 'unexpected-error');
    process.exit(EXIT_FAIL);
  });
