'use strict';

/**
 * Bigfish — 源码运行的依赖自检（开发用；不进安装包，不参与打包）。
 *
 * 仓库不提交 node_modules（≈750 MB / 4.3 万个文件，且 electron、koffi、node-pty 都是
 * 平台专有二进制，跨平台拉下来直接不能用），所以克隆后有两处依赖要装：
 *   ① 仓库根      : electron / electron-builder（devDependencies）。缺了 `npm start` 直接报
 *                   "'electron' 不是内部或外部命令"。
 *   ② dsh-bundle/ : 后端 @deepseek-ai/dsh（生产依赖）。main.js 会 spawn 它的 lib/bin.js
 *                   （见 main.js 的 dshBinPath()），缺了会「就绪等待」90 秒超时——表现是
 *                   窗口黑屏且没有任何报错。
 *
 * 挂载点（见 package.json）：
 *   postinstall --bundle-only : 根依赖刚装完，只需补 ②；带 ① 会与 npm install 递归。
 *   prestart                  : 两处都查——把「克隆后忘了装后端」这条路直接堵死。
 * 依赖齐全时本脚本只做两次 fs 存在性检查：不联网、不起 npm 进程、无额外耗时。
 *
 * 环境变量：
 *   BIGFISH_SKIP_ENSURE_DEPS=1  跳过整个自检（CI 自管依赖 / 离线调试）
 *   ELECTRON_MIRROR             透传给 electron 的 postinstall（国内镜像加速下载）
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BUNDLE_DIR = path.join(ROOT, 'dsh-bundle');
const DSH_BIN = path.join(BUNDLE_DIR, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');

/**
 * electron 的二进制路径。electron 包的 postinstall 会解压 dist 并写 path.txt；
 * 没跑完（被安装脚本白名单拦下、下载中断）时这两者会缺失 ⇒ 视为「根依赖没装好」。
 */
function electronBinary() {
  try {
    const rel = fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'path.txt'), 'utf8').trim();
    return path.join(ROOT, 'node_modules', 'electron', 'dist', rel);
  } catch {
    return null;
  }
}

function rootDepsReady() {
  const bin = electronBinary();
  return !!bin && fs.existsSync(bin);
}

function bundleDepsReady() {
  return fs.existsSync(DSH_BIN);
}

/** 跑一次 npm install（stdio 直通，进度条照常显示）；返回是否成功。 */
function npmInstall(cwd, args, label) {
  console.log(`[bigfish] ${label}`);
  const res = spawnSync(['npm', ...args].join(' '), { cwd, stdio: 'inherit', shell: true });
  return res.status === 0;
}

if (String(process.env.BIGFISH_SKIP_ENSURE_DEPS || '') === '1') {
  console.log('[bigfish] 依赖自检已跳过（BIGFISH_SKIP_ENSURE_DEPS=1）');
  process.exit(0);
}

const bundleOnly = process.argv.includes('--bundle-only');

if (!bundleOnly && !rootDepsReady()) {
  npmInstall(ROOT, ['install', '--no-audit', '--no-fund'], '根依赖缺失（electron），正在安装…');
}

if (!bundleDepsReady()) {
  npmInstall(BUNDLE_DIR, ['install', '--omit=dev', '--no-audit', '--no-fund'], '后端依赖缺失（@deepseek-ai/dsh），正在安装…');
}

const rootOk = bundleOnly || rootDepsReady();
const bundleOk = bundleDepsReady();
if (rootOk && bundleOk) process.exit(0);

console.error('\n[bigfish] 依赖仍不完整，请先处理下面各项再运行：');
if (!rootOk) {
  console.error('  · Electron 二进制缺失（node_modules/electron/dist 下没有可执行文件）。');
  console.error('    国内网络可换镜像后重试：');
  console.error('      set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/');
  console.error('      npm install');
  console.error('    若 npm 拦下了安装脚本（npm 11.6+ 的 install-scripts 白名单），放行后重试；');
  console.error('    或手动解压 npm 缓存里的 electron-v*.zip 到 node_modules/electron/dist，');
  console.error('    并在同目录写入 path.txt（Windows 内容为 electron.exe）。');
}
if (!bundleOk) {
  console.error(`  · 后端依赖缺失（${path.relative(ROOT, DSH_BIN)} 不存在）。手动安装：`);
  console.error('      cd dsh-bundle && npm install --omit=dev');
}
process.exit(1);
