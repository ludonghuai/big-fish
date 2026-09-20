'use strict';
/**
 * shell-plugins.js — 插件引擎（profile 读写 / bundles 防呆 / 版本对比 / installPlugin / uninstallPlugin / pnpm + github tarball 通道）
 * （B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6；B33 github tarball 链契约 = §2.2.16）。
 */

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { compareVersions } = require('./update-lib.js');
const backend = require('./shell-backend.js');
const pluginFetch = require('./shell-plugin-fetch.js');

// 注入面（组合根 main.js 接线）：updaterLog（update 域日志；§2.2.6 依赖方向规则 2）
let updaterLog = null;
function init(deps) { updaterLog = deps.updaterLog; }

// ---------------------------------------------------------------------------
// Plugin manager — install/remove DSH plugins in the web profile
// (~/.dsh/profiles/web) using the bundled pnpm, then restart the backend.
// ---------------------------------------------------------------------------
const PLUGIN_REGISTRY_URL = 'https://awesome-dsh-plugin.com/plugins.json';
const PLUGIN_REGISTRY_FALLBACK = 'https://gitee.com/ludonghuai/big-fish/raw/main/plugins.json';
const NPM_REGISTRY = 'https://registry.npmmirror.com/';

function profileDir() {
  return path.join(backend.dshHome(), 'profiles', 'web');
}
/** profile 的 node_modules 基准路径（越界校验基准 / 扫描面共用；B12 两处包含判定的 base 单一来源）。 */
function nodeModulesDir() {
  return path.join(profileDir(), 'node_modules');
}
function bundledPluginsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bundled-plugins')
    : path.join(app.getAppPath(), 'bundled-plugins');
}
function bundledPnpmPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'node-runtime', 'pnpm', 'pnpm.mjs')
    : path.join(app.getAppPath(), 'node-runtime', 'pnpm', 'pnpm.mjs');
}
function runtimeNodeExe() {
  if (app.isPackaged) {
    const nodeBin = process.platform === 'win32' ? 'node.exe' : 'node';
    return path.join(process.resourcesPath, 'node-runtime', nodeBin);
  }
  return process.env.DSH_NODE || 'node';
}

function readProfileManifest() {
  const file = path.join(profileDir(), 'package.json');
  // 瞬时文件锁/并发写时重试，避免误判为"不存在"
  for (let i = 0; i < 3; i++) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (i === 2) {
        console.warn('[bigfish] readProfileManifest failed:', err && err.message);
        return null;
      }
      try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120); } catch { /* ignore */ }
    }
  }
  return null;
}
function writeProfileManifest(manifest) {
  const file = path.join(profileDir(), 'package.json');
  fs.mkdirSync(profileDir(), { recursive: true });
  // 原子写：先写临时文件再改名，杜绝读者读到半截 JSON
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}
function profileBundles() {
  const m = readProfileManifest();
  // 注意：dsh.profile 是对象 { bundles: [...] }，不是数组（勿用 Array.isArray(m.dsh.profile)）
  if (!m || !m.dsh || !m.dsh.profile || !Array.isArray(m.dsh.profile.bundles)) return [];
  return m.dsh.profile.bundles;
}
function addBundle(pkgName) {
  if (!isPlainPackageName(pkgName)) {
    console.warn('[bigfish] 拒绝把非包名写入 bundles:', pkgName);
    return false;
  }
  const m = readProfileManifest();
  // 防呆：读不到 manifest 直接抛错，绝不拿默认空表覆盖（会清空注册表）
  if (!m) throw new Error('无法读取 profile manifest，已中止（防止清空插件注册表）');
  if (!m.dsh) m.dsh = { profile: { bundles: [] } };
  if (!m.dsh.profile) m.dsh.profile = { bundles: [] };
  if (!Array.isArray(m.dsh.profile.bundles)) m.dsh.profile.bundles = [];
  if (!m.dsh.profile.bundles.includes(pkgName)) m.dsh.profile.bundles.push(pkgName);
  writeProfileManifest(m);
  return true;
}
/** 注销 bundle；返回是否真写盘（B34：读不到 manifest ⇒ false，调用方不得报假成功）。 */
function removeBundle(pkgName) {
  const m = readProfileManifest();
  if (!m || !m.dsh || !m.dsh.profile || !Array.isArray(m.dsh.profile.bundles)) return false;
  m.dsh.profile.bundles = m.dsh.profile.bundles.filter((b) => b !== pkgName);
  writeProfileManifest(m);
  return true;
}
/** 是否像合法的 npm 包名（拒绝 github:/git+/link: 等原始安装标识）。 */
function isPlainPackageName(name) {
  if (typeof name !== 'string' || !name) return false;
  if (/^(github:|git\+|link:|file:|\.|\/)/.test(name)) return false;
  if (name.startsWith('@')) {
    return /^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*$/.test(name);
  }
  return /^[a-z0-9-~][a-z0-9-._~]*$/.test(name);
}

// ---------------------------------------------------------------------------
// 扫描快照（B12 / US-15）：单次请求一次扫描 + 复用；缺省（未传 ctx）自建一次
// ---------------------------------------------------------------------------

/** 单次扫描快照 { names, nameSet, bundles, entries, versions }（设计档 docs/design/SHELL-UX.md §2.2.14「扫描契约」）。 */
function scanProfile() {
  const bundles = profileBundles();
  const names = new Set(bundles);
  const entries = new Set();
  try {
    const nm = nodeModulesDir();
    if (fs.existsSync(nm)) {
      for (const entry of fs.readdirSync(nm)) {
        entries.add(entry); // 顶层全部条目名（含点目录与文件）= existsSync(nm/<名>) 的判定面
        if (entry.startsWith('.') || entry === 'node_modules') continue; // 跳过 .pnpm 等元数据目录
        if (entry.startsWith('@')) {
          const scoped = path.join(nm, entry);
          if (fs.statSync(scoped).isDirectory()) {
            for (const sub of fs.readdirSync(scoped)) { names.add(`${entry}/${sub}`); entries.add(`${entry}/${sub}`); }
          }
        } else if (fs.statSync(path.join(nm, entry)).isDirectory()) {
          names.add(entry);
        }
      }
    }
  } catch { /* best effort */ }
  return { names: [...names].sort(), nameSet: new Set(names), bundles: new Set(bundles), entries, versions: new Map() };
}

/** 把安装标识解析成实际安装的包名（github:user/repo → 按仓库名精确匹配 node_modules 里真实包名）。 */
function resolveInstalledName(spec, ctx) {
  const base = String(spec || '').replace(/^builtin:/, '').split('#')[0];
  const candidates = listInstalledPlugins(ctx);
  if (candidates.includes(base)) return base;
  const repo = (base.match(/github:([^/]+\/[^/#@]+)/) || [])[1];
  if (repo) {
    const repoName = repo.split('/')[1].toLowerCase();
    // 精确匹配（绝不能 includes 子串：dsh-pet-remielle 会误匹配 dsh-pet）
    const hit = candidates.find((n) => n.split('/').pop().toLowerCase() === repoName);
    if (hit) return hit;
  }
  // 兜底：取末尾合法段（去掉版本号）
  const last = base.split('@').pop();
  return isPlainPackageName(last) ? last : null;
}

// ---------------------------------------------------------------------------
// 已装插件更新（设计档 §2.2.5 / AC10）——版本对比全在主进程，前端只按 id 匹配渲染。
// ---------------------------------------------------------------------------

/** 注册表条目 → 安装标识（与 market.js normalizePlugin 同口径：npm 优先，install 字段取标识，url 兜底）。 */
function pluginUpdateSpecOf(p) {
  let spec = p && p.npm;
  if (!spec && p && p.install) {
    const m = String(p.install).match(/add\s+(github:[^\s]+|link:[^\s]+|[^\s]+)/);
    if (m && m[1].startsWith('github:')) spec = m[1]; // 与 normalizePlugin 同口径：install 字段只采纳 github:
  }
  if (!spec && p && p.url) {
    const m = String(p.url).match(/github\.com\/([^/]+\/[^/]+)/);
    if (m) spec = 'github:' + m[1];
  }
  return spec || '';
}

/** 已装插件版本：profileDir()/node_modules/{realName}/package.json（读不到 → ''；同一请求内按 realName 记忆）。 */
function installedPluginVersion(realName, ctx) {
  const snap = ctx || scanProfile();
  if (snap.versions.has(realName)) return snap.versions.get(realName);
  let version = '';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(profileDir(), 'node_modules', realName, 'package.json'), 'utf8'));
    version = pkg && pkg.version ? String(pkg.version) : '';
  } catch { version = ''; }
  snap.versions.set(realName, version);
  return version;
}

/** 计算可更新插件清单（AC10）：已装版本 < 注册表 version 才入选；github: 按原 installSpec 重装。 */
function computePluginUpdates(plugins, ctx) {
  const snap = ctx || scanProfile(); // 单次扫描：循环体内不再触发扫描面（US-15；缺省自建一次）
  const updates = [];
  for (const p of plugins || []) {
    const version = p && typeof p.version === 'string' ? p.version.trim() : '';
    if (!version) continue; // 注册表条目缺 version → 无徽标（US-7 边界）
    const spec = pluginUpdateSpecOf(p);
    if (!spec || spec.startsWith('builtin:') || spec.startsWith('link:')) continue;
    const realName = resolveInstalledName(spec, snap);
    if (!realName) continue;
    if (!isPluginInProfile(realName, snap)) continue; // 未装条目不参与也不记日志（避免 market:list 刷日志）
    const installedVersion = installedPluginVersion(realName, snap);
    if (!installedVersion) {
      updaterLog(`plugin update spec=${spec} result=skip detail=no-installed-version`);
      continue;
    }
    if (compareVersions(version, installedVersion) <= 0) continue;
    updates.push({
      id: (p.name || p.npm || spec || '').replace(/\s+/g, '-').toLowerCase(),
      name: p.name || p.npm || spec,
      updateSpec: spec.startsWith('github:') ? spec : `${realName}@${version}`,
      latestVersion: version,
      installedVersion,
    });
  }
  return updates;
}

/**
 * 启动前清理 profile 里损坏的 bundle 注册（例如被写进去的 github:xxx 原始标识），
 * 避免后端启动直接崩掉（dsh CLI 遇到不可解析的 bundle 会抛错退出）。
 */
function sanitizeProfileBundles() {
  try {
    const m = readProfileManifest();
    if (!m || !m.dsh || !m.dsh.profile || !Array.isArray(m.dsh.profile.bundles)) return;
    const before = m.dsh.profile.bundles;
    const cleaned = before.filter((b) => {
      if (!isPlainPackageName(b)) return false; // github:/git+/link: 等非法标识
      if (b.startsWith('@deepseek-ai/')) return true; // 官方基础包
      try { return fs.existsSync(path.join(profileDir(), 'node_modules', b)); } // 包必须真的装了
      catch { return false; }
    });
    if (cleaned.length !== before.length) {
      m.dsh.profile.bundles = cleaned;
      writeProfileManifest(m);
      console.warn('[bigfish] 已清理非法 bundle 注册:', before.filter((b) => !cleaned.includes(b)).join(', '));
    }
  } catch { /* 读不到就算了 */ }
}
function isPluginInProfile(pkgName, ctx) {
  const snap = ctx || scanProfile();
  return snap.bundles.has(pkgName) || snap.entries.has(pkgName);
}
/** Installed plugin names (from bundles + node_modules presence). */
function listInstalledPlugins(ctx) {
  return (ctx || scanProfile()).names;
}

/** 已安装但被禁用的插件（在 node_modules 但不在 bundles 里 = 装了但没加载）。 */
function listDisabledPlugins(ctx) {
  const snap = ctx || scanProfile();
  const out = [];
  // entries 的插入序 = readdir 序（@scope/x 紧随其父条目）⇒ 与改前的遍历序逐条一致
  for (const n of snap.entries) {
    if (!snap.nameSet.has(n) || snap.bundles.has(n)) continue; // nameSet = bundles ∪ node_modules 目录名
    if (n.startsWith('@deepseek-ai/')) continue;
    out.push(n);
  }
  return out;
}

/** Run a command, capturing combined output. */
function runCmd(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...opts,
    });
    let out = '';
    const onData = (c) => { out += String(c); };
    if (child.stdout) child.stdout.on('data', onData);
    if (child.stderr) child.stderr.on('data', onData);
    child.on('error', (err) => resolve({ code: -1, output: out + '\n' + (err && err.message) }));
    child.on('close', (code) => resolve({ code, output: out }));
  });
}

/** pnpm add/remove 在 profile 目录（workspace 根）需要 -w 标志。 */
function pnpmArgs(action, spec) {
  const args = [bundledPnpmPath(), action];
  const ws = path.join(profileDir(), 'pnpm-workspace.yaml');
  if (fs.existsSync(ws) && (action === 'add' || action === 'remove')) args.push('-w');
  args.push('--dir', profileDir());
  // 用 --config.registry 而不是 --registry：pnpm remove 不识别 --registry
  args.push('--config.registry=' + NPM_REGISTRY);
  // store 固定到 DSH_HOME 下，避免写入程序安装目录（Program Files 只读）或系统盘
  args.push('--store-dir', path.join(backend.dshHome(), 'pnpm-store'));
  if (action === 'add' && spec) args.push(spec);
  if (action === 'remove' && spec) args.push(spec);
  return args;
}

/** profile node_modules 顶层包名集合（跳过 .pnpm 等元数据）。 */
function topLevelModules() {
  const nm = nodeModulesDir();
  const out = new Set();
  try {
    for (const e of fs.readdirSync(nm)) {
      if (e.startsWith('.')) continue;
      if (e.startsWith('@')) {
        const scoped = path.join(nm, e);
        if (fs.statSync(scoped).isDirectory()) {
          for (const sub of fs.readdirSync(scoped)) out.add(`${e}/${sub}`);
        }
      } else if (fs.statSync(path.join(nm, e)).isDirectory()) {
        out.add(e);
      }
    }
  } catch { /* best effort */ }
  return out;
}

// ---------------------------------------------------------------------------
// 安全门（B12 / US-14）：入参三形态白名单（主防线）+ 包含判定（纵深防御）
// ---------------------------------------------------------------------------

/** 形态 ② 的排除判据：`..` 与全点段（设计档 docs/design/SHELL-UX.md §2.2.14「入参门判据句」）。 */
function isDotSegment(seg) {
  return /^\.+$/.test(seg);
}

/** 入参三形态门（US-14 契约第一层）：'bundled' | 'github' | 'npm' | null（null ⇒ 拒绝）。 */
function installSpecKind(spec) {
  if (typeof spec !== 'string' || !spec) return null;
  if (spec.startsWith('builtin:')) return isPlainPackageName(spec.slice(8)) ? 'bundled' : null;
  if (spec.startsWith('github:')) {
    const rest = spec.slice(7);
    const hash = rest.indexOf('#');
    const m = (hash === -1 ? rest : rest.slice(0, hash)).match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);
    if (!m || isDotSegment(m[1]) || isDotSegment(m[2])) return null;
    if (hash === -1) return 'github';
    const frag = rest.slice(hash + 1);
    if (!/^[A-Za-z0-9._:@/-]+$/.test(frag) || frag.split('/').includes('..')) return null;
    return 'github';
  }
  if (isPlainPackageName(spec)) return 'bundled'; // 裸纯包名 = 内置形态（源不存在时落回 npm / pnpm 面）
  const at = spec.lastIndexOf('@');
  const base = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : '';
  if (!isPlainPackageName(base)) return null;
  if (at > 0 && !/^[A-Za-z0-9\-._+~^*<>=|]+$/.test(version)) return null;
  return 'npm';
}

/** 越界校验判据（US-14 契约第二层）：严格包含（`rel === ''` = 基准自身 ⇒ 不算通过）；词法判定、不 realpath。 */
function isInsideDir(child, base) {
  const rel = path.relative(path.resolve(base), path.resolve(child));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** 拒绝消息（US-14 契约第四层）：只回显入参前 60 字符，不含任何绝对路径。 */
function rejectSpec(prefix, spec) {
  return { ok: false, message: prefix + String(spec).slice(0, 60) };
}

/** 安装失败细节落 update 域日志（UI 只给归类指引——B33；原始输出不弹窗）。 */
function logInstallFail(spec, detail) {
  if (updaterLog) updaterLog(`plugin install spec=${String(spec).slice(0, 80)} result=fail detail=${String(detail).replace(/\s+/g, ' ').slice(0, 200)}`);
}

/** 安装插件：内置插件离线拷贝；npm 插件走 pnpm add。返回 { ok, message } */
async function installPlugin(spec) {
  const kind = installSpecKind(spec);
  if (kind === null) return rejectSpec('无效的插件标识：', spec);
  const bundledName = String(spec).replace(/^builtin:/, ''); // 计算面（全形态必经；与改前 :312 / :359 同源）
  const bundledSource = path.join(bundledPluginsDir(), bundledName);
  if (!isInsideDir(bundledSource, bundledPluginsDir())) return rejectSpec('插件标识越界，已拒绝：', spec);
  if (kind === 'bundled' && fs.existsSync(bundledSource)) {
    // 内置插件：直接拷贝进 profile 的 node_modules（离线，不依赖网络）
    const target = path.join(profileDir(), 'node_modules', bundledName);
    if (!isInsideDir(target, nodeModulesDir())) return rejectSpec('插件标识越界，已拒绝：', spec);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(bundledSource, target, { recursive: true });
    addBundle(bundledName);
    return { ok: true, message: `已安装内置插件 ${bundledName}` };
  }
  // npm / GitHub 插件：用内置 pnpm 安装到 profile
  // github 源（B33）：弃用 git 协议（国内无代理多不可达 + 依赖本机 git），先走 HTTPS tarball 下载链再 pnpm add 本地包
  let addSpec = spec;
  if (kind === 'github') {
    const dl = await pluginFetch.downloadPluginTarball(spec);
    if (!dl.ok) {
      logInstallFail(spec, 'tarball: ' + dl.attempts.join(' ; '));
      return { ok: false, message: '安装失败：下载插件包失败——GitHub 直连与镜像源均不可用（网络受限）。可检查网络或代理后重试，或稍后再试（镜像源可能临时失效）。' };
    }
    // 相对 profile 目录的 posix 形态：避免盘符被 pnpm 误解析，与 manifest 的 file: 引用同径
    addSpec = path.relative(profileDir(), dl.file).split(path.sep).join('/');
    if (updaterLog) updaterLog(`plugin install spec=${spec} tarball=${dl.url}`);
  }
  const beforeMods = topLevelModules();
  const beforeDeps = (() => { const b = readProfileManifest(); return b && b.dependencies ? Object.keys(b.dependencies) : []; })();
  // 更新分支（AC10）：目标已装（依赖键或顶层目录存在）→ 装完跳过 realName 探测与 addBundle
  //   （realName 探测只识别「新增」包——更新时依赖键与顶层名不变，会误报失败）
  const knownName = resolveInstalledName(spec);
  const isUpdate = !!knownName && (beforeDeps.includes(knownName) || beforeMods.has(knownName));
  const res = await runCmd(runtimeNodeExe(), pnpmArgs('add', addSpec), { timeout: 15 * 60 * 1000 });
  if (res.code !== 0) {
    logInstallFail(spec, `pnpm exit ${res.code}: ${res.output.slice(-400)}`);
    const why = pluginFetch.friendlyInstallError(res.output);
    return { ok: false, message: why ? `安装失败：${why}。可稍后重试；技术细节已记入日志。` : '安装失败：插件源返回了无法归类的错误。可稍后重试；技术细节已记入日志。' };
  }
  if (isUpdate) {
    return { ok: true, message: `已更新 ${knownName}` };
  }
  // 解析【真实包名】注册 bundles（严禁把 github:user/repo 这类原始标识写进 bundles）
  let realName = null;
  const m = readProfileManifest();
  const afterDeps = m && m.dependencies ? Object.keys(m.dependencies) : [];
  const addedDeps = afterDeps.filter((d) => !beforeDeps.includes(d));
  if (addedDeps.length > 0) {
    realName = addedDeps[0]; // pnpm add 会把真实包名写进 dependencies
  } else {
    // 兜底：扫描 node_modules 新增的顶层包（pnpm 装好后按 package.json 名落位）
    const afterMods = topLevelModules();
    const newMods = [...afterMods].filter((n) => !beforeMods.has(n) && !n.startsWith('@deepseek-ai/'));
    if (newMods.length > 0) realName = newMods[0];
  }
  if (!realName) {
    return { ok: false, message: `安装没有产生可识别的新插件（pnpm 已退出 0 但未落包）。\n原始标识：${spec}\n若从 GitHub 安装，请确认仓库里有合法的 package.json。` };
  }
  addBundle(realName);
  return { ok: true, message: `已安装 ${realName}` };
}

/** 卸载插件：内置插件直接删目录；npm 插件走 pnpm remove（B12：入参门 + 卸载面解析门 + 越界校验）。 */
async function uninstallPlugin(pkgName) {
  if (installSpecKind(pkgName) === null) return rejectSpec('无效的插件标识：', pkgName);
  const realName = resolveInstalledName(pkgName); // 解析门：解析不到已装对象 ⇒ 无可卸载对象
  if (realName === null || !isPluginInProfile(realName)) return rejectSpec('未安装或无法解析：', pkgName);
  const bundledSource = path.join(bundledPluginsDir(), realName);
  if (!isInsideDir(bundledSource, bundledPluginsDir())) return rejectSpec('插件标识越界，已拒绝：', pkgName);
  if (fs.existsSync(bundledSource)) {
    const target = path.join(profileDir(), 'node_modules', realName);
    if (!isInsideDir(target, nodeModulesDir())) return rejectSpec('插件标识越界，已拒绝：', pkgName);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    removeBundle(realName);
    return { ok: true, message: `已卸载内置插件 ${realName}` };
  }
  // 受管 tarball 记录（B34）：dependencies 里 file: 指向 plugin-tarballs 的条目，卸载成功后清理安装包；外物不动
  const depSpec = (() => { const m = readProfileManifest(); return m && m.dependencies ? m.dependencies[realName] : ''; })();
  const res = await runCmd(runtimeNodeExe(), pnpmArgs('remove', realName), { timeout: 10 * 60 * 1000 });
  if (res.code !== 0) {
    // pnpm 可能已经改了一半，无论如何把 bundles 清理掉
    removeBundle(realName);
    return { ok: true, message: `已卸载 ${realName}（pnpm 有警告，已清理注册）` };
  }
  removeBundle(realName);
  if (typeof depSpec === 'string' && depSpec.startsWith('file:')) {
    const tgz = path.resolve(profileDir(), depSpec.slice('file:'.length));
    if (isInsideDir(tgz, path.join(backend.dshHome(), 'plugin-tarballs'))) {
      try { fs.rmSync(tgz, { force: true }); } catch { /* best effort */ }
    }
  }
  return { ok: true, message: `已卸载 ${realName}` };
}

module.exports = {
  PLUGIN_REGISTRY_URL,
  PLUGIN_REGISTRY_FALLBACK,
  profileDir,

  bundledPluginsDir,
  bundledPnpmPath,
  runtimeNodeExe,
  profileBundles,
  addBundle,
  removeBundle,
  isPlainPackageName,
  installSpecKind,
  isInsideDir,
  scanProfile,
  resolveInstalledName,
  computePluginUpdates,
  sanitizeProfileBundles,
  listInstalledPlugins,
  listDisabledPlugins,
  installPlugin,
  uninstallPlugin,
  init,
};
