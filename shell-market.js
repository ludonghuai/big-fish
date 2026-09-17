'use strict';
/**
 * shell-market.js — 市场窗口 + 注册表拉取 + market:* 处理器函数（含 plugin update 日志行）
 * （B06 F6 拆分；设计档 docs/design/SHELL-UX.md §2.2.6）。
 */

const { BrowserWindow, app, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const plugins = require('./shell-plugins.js');
const backend = require('./shell-backend.js');
const assets = require('./shell-assets.js');
const update = require('./shell-update.js');

// ---------------------------------------------------------------------------
// 插件市场窗口（market.html）
// ---------------------------------------------------------------------------
let marketWindow = null;
let marketRegistryCache = null; // 最近一次 market:list 的注册表缓存（market:state 算 updates 用，不另发网络请求）

function createMarketWindow() {
  if (marketWindow && !marketWindow.isDestroyed()) {
    marketWindow.show();
    marketWindow.focus();
    return;
  }
  marketWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    title: 'Bigfish 插件市场',
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    icon: assets.appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'market-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 缓存爆破：防止 Chromium file:// 缓存加载旧版 market.html 导致元素缺失
  marketWindow.loadFile(path.join(__dirname, 'market.html'), { query: { v: Date.now() } });
  marketWindow.webContents.on('console-message', (_e, level, message) => {
    try {
      const file = path.join(app.getPath('userData'), 'market.log');
      fs.appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${message}\n`);
    } catch { /* best effort */ }
  });
  marketWindow.on('closed', () => { marketWindow = null; });
}

/** 拉取市场目录：优先社区最大平台（awesome-dsh-plugin.com 在线全量），
 *  其次 Gitee 上的 Bigfish 精选目录，最后用内置本地副本。 */
async function fetchPluginRegistry() {
  const bundled = path.join(__dirname, 'plugins.json');
  let local = null;
  try { local = JSON.parse(fs.readFileSync(bundled, 'utf8')); } catch { /* no local */ }
  const tryFetch = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        const j = await res.json();
        if (j && Array.isArray(j.plugins)) return { source: 'remote', fetchedAt: Date.now(), plugins: j.plugins };
      }
    } catch { /* try next */ } finally { clearTimeout(timer); }
    return null;
  };
  const online = await tryFetch(plugins.PLUGIN_REGISTRY_URL);
  if (online) return online;
  const fallback = await tryFetch(plugins.PLUGIN_REGISTRY_FALLBACK);
  if (fallback) return { ...fallback, source: 'mirror' };
  if (local) return { source: 'local', fetchedAt: 0, plugins: local.plugins || [] };
  return { source: 'none', fetchedAt: 0, plugins: [] };
}

async function marketList() {
  const registry = await fetchPluginRegistry();
  marketRegistryCache = registry;
  const ctx = plugins.scanProfile(); // 单次请求一次扫描 + 三消费面复用（US-15）
  const installed = plugins.listInstalledPlugins(ctx);
  const disabled = plugins.listDisabledPlugins(ctx);
  const bundledNames = [];
  try {
    bundledNames.push(...fs.readdirSync(plugins.bundledPluginsDir()));
  } catch { /* no bundled dir */ }
  const updates = plugins.computePluginUpdates(registry.plugins, ctx);
  return { registry, installed, disabled, bundledNames, updates, profileDir: plugins.profileDir(), dshHome: backend.dshHome() };
}

  // 快速状态：只读本地已装/已禁用（不拉在线目录），用于操作后即时刷新

function marketState() {
  const ctx = plugins.scanProfile(); // 单次请求一次扫描 + 三消费面复用（US-15）
  return ({
  installed: plugins.listInstalledPlugins(ctx),
  disabled: plugins.listDisabledPlugins(ctx),
  bundledNames: (() => { try { return fs.readdirSync(plugins.bundledPluginsDir()); } catch { return []; } })(),
  updates: plugins.computePluginUpdates((marketRegistryCache && marketRegistryCache.plugins) || [], ctx),
  });
}

async function marketInstall(_e, spec) {
  if (typeof spec !== 'string' || !spec) return { ok: false, message: '无效的插件标识' };
  return await plugins.installPlugin(spec);
}

async function marketUninstall(_e, pkg) {
  if (typeof pkg !== 'string' || !pkg) return { ok: false, message: '无效的插件名' };
  // 解析真实包名（防 github:xxx 原始标识）
  const real = plugins.resolveInstalledName(pkg) || pkg;
  return await plugins.uninstallPlugin(real);
}

  // 禁用 = 从 bundles 移除（保留 node_modules，重启后不再加载）；启用 = 加回 bundles

async function marketDisable(_e, pkg) {
  const real = plugins.resolveInstalledName(pkg);
  if (!real) return { ok: false, message: '无法解析插件包名：' + String(pkg).slice(0, 60) };
  plugins.removeBundle(real);
  return { ok: true, message: `已禁用 ${real}（重启后生效）` };
}

async function marketEnable(_e, pkg) {
  const real = plugins.resolveInstalledName(pkg);
  console.log('[bigfish] market:enable input=', JSON.stringify(pkg), 'resolved=', real, 'disabled=', JSON.stringify(plugins.listDisabledPlugins()));
  if (!real) return { ok: false, message: '无法解析插件包名：' + String(pkg).slice(0, 60) };
  if (!plugins.isPlainPackageName(real)) return { ok: false, message: '非法包名：' + real };
  const added = plugins.addBundle(real);
  console.log('[bigfish] market:enable added=', added, 'bundles=', JSON.stringify(plugins.profileBundles()));
  return { ok: added, message: added ? `已启用 ${real}（重启后生效）` : `写入失败：${real}` };
}

async function marketRestart() {
  try {
    await backend.restartBackend();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
}

  // 插件更新（§2.2.5）：单个更新走 installPlugin + 一次 restartBackend；全部更新逐项执行后一次重启

async function marketUpdate(_e, spec) {
  if (typeof spec !== 'string' || !spec) return { ok: false, message: '无效的更新标识' };
  const res = await plugins.installPlugin(spec);
  if (!res.ok) {
    update.updaterLog(`plugin update spec=${spec} result=fail detail=${String(res.message).replace(/\s+/g, ' ').slice(0, 120)}`);
    return res;
  }
  try {
    await backend.restartBackend();
  } catch (err) {
    update.updaterLog(`plugin update spec=${spec} result=fail detail=restart:${String((err && err.message) || err).slice(0, 120)}`);
    return { ok: false, message: '已安装但重启失败：' + ((err && err.message) || err) };
  }
  update.updaterLog(`plugin update spec=${spec} result=ok`);
  return res;
}

async function marketUpdateAll() {
  const registry = await fetchPluginRegistry();
  const updates = plugins.computePluginUpdates(registry.plugins);
  const results = [];
  for (const u of updates) {
    const res = await plugins.installPlugin(u.updateSpec);
    results.push({ id: u.id, name: u.name, ok: res.ok, message: res.message });
    update.updaterLog(`plugin update spec=${u.updateSpec} result=${res.ok ? 'ok' : 'fail'} detail=${String(res.message).replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  try {
    await backend.restartBackend(); // 全部完成（含部分失败）后一次重启
  } catch (err) {
    results.push({ id: '', name: '后端重启', ok: false, message: '插件已更新但重启失败：' + ((err && err.message) || err) });
  }
  return results;
}

function marketOpenExternal(_e, url) {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
}

module.exports = {
  createMarketWindow,
  marketList,
  marketState,
  marketInstall,
  marketUninstall,
  marketDisable,
  marketEnable,
  marketRestart,
  marketUpdate,
  marketUpdateAll,
  marketOpenExternal,
};
