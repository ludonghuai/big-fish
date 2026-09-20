'use strict';
/**
 * make-latest.js — 发布侧辅助脚本（B15；设计档 docs/design/AUTO-UPDATE.md §2.2.8 / AC11 / TC-21 / TC-22）。
 * 用法：node scripts/make-latest.js [--version <v>] [--note <文本>]
 *   version 缺省读 package.json.version；
 *   扫描 dist/：Bigfish.Setup.{v}.exe / Bigfish-{v}-arm64.dmg / Bigfish-{v}.AppImage；
 *   对存在的文件算 sha256 → 组装 latest.json（version/note/urls[GitHub Releases]/sha256）写仓库根；
 *   缺失的平台跳过（urls 与 sha256 均不含该平台）；
 *   打印上传清单（GitHub 建 release v{v} 传附件 + Gitee 建 tag + 提交 latest.json）。
 * 退出码：0 成功 / 1 参数或产物缺失错误。本脚本为发布侧工具，不进 build.files（不随包分发）。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// 附件托管在 GitHub Releases（Gitee 发行版附件单文件上限 100MB，装不下约 276MB 安装包）
const RELEASES_DOWNLOAD = 'https://github.com/ludonghuai/big-fish/releases/download';
const RAW_MANIFEST = 'https://gitee.com/ludonghuai/big-fish/raw/main/latest.json';

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

function parseArgs(argv) {
  let version = '';
  let note = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--version' && argv[i + 1]) version = argv[++i];
    else if (argv[i] === '--note' && argv[i + 1]) note = argv[++i];
  }
  return { version, note };
}

function main() {
  const { version: vArg, note: noteArg } = parseArgs(process.argv.slice(2));
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  // 归一化：剥前导 v（--version v0.1.3 不应拼出 /vv0.1.3/ 的 URL）
  const version = String(vArg || (pkg && pkg.version) || '').replace(/^v/, '');
  if (!version) fail('无法确定版本号：package.json 缺 version 且未传 --version');

  const artifacts = {
    win32: `Bigfish.Setup.${version}.exe`,
    darwin: `Bigfish-${version}-arm64.dmg`,
    linux: `Bigfish-${version}.AppImage`,
  };
  const distDir = path.join(__dirname, '..', 'dist');
  const urls = {};
  const sha256 = {};
  const found = [];
  for (const [platform, file] of Object.entries(artifacts)) {
    const full = path.join(distDir, file);
    if (!fs.existsSync(full)) continue;
    sha256[platform] = sha256File(full);
    urls[platform] = `${RELEASES_DOWNLOAD}/v${version}/${file}`;
    found.push({ platform, file, full });
  }
  if (found.length === 0) {
    fail(`dist/ 下没有找到任何 ${version} 的安装包产物（${Object.values(artifacts).join(' / ')}）`);
  }

  // note：--note 优先；缺省沿用现有 latest.json 的 note（避免发版时无意清空说明）
  let existingNote = '';
  try {
    const existing = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'latest.json'), 'utf8'));
    existingNote = existing && existing.note ? String(existing.note) : '';
  } catch { /* 无现有清单 */ }

  const manifest = {
    version,
    note: noteArg || existingNote,
    urls,
    sha256,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'latest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`✓ latest.json 已生成（version ${version}，含 ${found.length} 个平台 + sha256）`);
  console.log('');
  console.log('上传清单：');
  console.log('  1. GitHub 建仓 ludonghuai/big-fish（如未建）并建 release v' + version + '，上传附件：');
  for (const f of found) console.log('     · ' + f.full);
  console.log('  2. Gitee 建 tag v' + version + '（仅代码与发行说明；附件超 100MB 上限不传）');
  console.log('  3. 提交仓库文件：latest.json（urls 指向 GitHub 附件）');
  console.log('     raw 路径：' + RAW_MANIFEST);
  process.exit(0);
}

main();
