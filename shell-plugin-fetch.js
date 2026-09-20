'use strict';
/**
 * shell-plugin-fetch.js — GitHub tarball 下载链 + 安装失败文案分类（B33；设计档 docs/design/SHELL-UX.md §2.2.16）。
 * github: 源弃用 git 协议（国内无代理环境多不可达 + 依赖本机 git 环境），改走 HTTPS tarball：codeload 直连优先、公共镜像回退。
 */

const fs = require('node:fs');
const path = require('node:path');
const backend = require('./shell-backend.js');

/** 单源超时（毫秒）；逐源串行尝试，总耗时上限 ≈ 源数 × 该值。 */
const FETCH_TIMEOUT_MS = 45 * 1000;
/** 公共镜像前缀表（易变资源：失效只改本表；codeload 直连恒为第一源，不在表内）。 */
const GITHUB_MIRRORS = [
  'https://ghproxy.net/',
  'https://ghfast.top/',
  'https://gh-proxy.com/',
];

/** github 安装标识 → { owner, repo, ref }（入参已过 installSpecKind 白名单，字符集受限，无注入面）。 */
function parseGithubSpec(spec) {
  const rest = String(spec).slice('github:'.length);
  const hash = rest.indexOf('#');
  const pair = hash === -1 ? rest : rest.slice(0, hash);
  const ref = hash === -1 ? '' : rest.slice(hash + 1);
  const [owner, repo] = pair.split('/');
  return { owner, repo, ref };
}

/** 下载链（按序）：codeload `/tar.gz/<ref|HEAD>` 直连 + 各镜像的 github `/archive/` 形态。 */
function githubTarballUrls(owner, repo, ref) {
  const r = ref || 'HEAD';
  const urls = [`https://codeload.github.com/${owner}/${repo}/tar.gz/${r}`];
  for (const m of GITHUB_MIRRORS) urls.push(`${m}https://github.com/${owner}/${repo}/archive/${r}.tar.gz`);
  return urls;
}

/** tarball 持久落点（pnpm 会把 file: 引用写进 profile manifest，文件必须留住；ref 只保留文件系统安全字符）。 */
function pluginTarballPath(owner, repo, ref) {
  const safeRef = ref ? '-' + ref.replace(/[^A-Za-z0-9._-]+/g, '-') : '';
  return path.join(backend.dshHome(), 'plugin-tarballs', `${owner}-${repo}${safeRef}.tgz`);
}

/**
 * 逐源下载 tarball。成功 → { ok:true, file, url, attempts }；全败 → { ok:false, attempts }。
 * 防呆：响应体须为 gzip（魔数 1f 8b）——镜像错误页（HTML 200）不得落盘。
 */
async function downloadPluginTarball(spec) {
  const { owner, repo, ref } = parseGithubSpec(spec);
  const file = pluginTarballPath(owner, repo, ref);
  const attempts = [];
  for (const url of githubTarballUrls(owner, repo, ref)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) { attempts.push(`${url} → HTTP ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) { attempts.push(`${url} → 非 gzip 内容`); continue; }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      return { ok: true, file, url, attempts };
    } catch (err) {
      attempts.push(`${url} → ${err && err.name === 'AbortError' ? '超时' : String((err && err.message) || err).slice(0, 80)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, attempts };
}

/** pnpm / 下载失败输出 → 一句中文指引（UI 不再展示原始堆栈）；归不了类 → ''（调用方给兜底句）。 */
function friendlyInstallError(output) {
  const s = String(output || '');
  if (/ENOENT|spawn\s+git/i.test(s)) return '本机缺少必要组件（git）';
  if (/ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|Connection was reset|Failed to clone|access rights|repository exists/i.test(s)) return '网络受限，无法连接插件源';
  if (/\b404\b|Not Found/i.test(s)) return '插件源不存在或已下架';
  if (/package\.json|NO_PACKAGE_MANIFEST/i.test(s)) return '插件包缺少合法的 package.json';
  return '';
}

module.exports = {
  FETCH_TIMEOUT_MS,
  GITHUB_MIRRORS,
  parseGithubSpec,
  githubTarballUrls,
  pluginTarballPath,
  downloadPluginTarball,
  friendlyInstallError,
};
