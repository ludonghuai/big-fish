'use strict';
/**
 * update-lib.js — 自动更新纯函数模块（设计档 docs/design/AUTO-UPDATE.md §2.2.1）。
 * 无 Electron 依赖，可被 node --test 直接加载（AC8 / TC-15）。
 * 版本比较为全仓唯一实现（NFR-4）：App 版本（0.1.2 形态）与 Harness 版本
 * （0.1.0-rc.6 形态）共用同一语义，main.js 不得内联第二份。
 */

/** 拆分版本号：数字段 + 预发布段。'0.1.5-rc.1' → 数字 [0,1,5] + 预发布 ['rc','1']；无 '-' 则预发布段空。 */
function splitVersion(v) {
  const s = String(v == null ? '' : v).trim();
  const dash = s.indexOf('-');
  const core = dash === -1 ? s : s.slice(0, dash);
  const pre = dash === -1 ? '' : s.slice(dash + 1);
  return {
    // 非数字位按 0 处理（沿用既有 compareVersions 的宽松口径，不抛异常——设计档 §2.2.6）
    nums: core.split('.').map((x) => (x !== '' && !isNaN(Number(x)) ? Number(x) : 0)),
    pre: pre ? pre.split('.') : [],
  };
}

/**
 * semver 口径比较预发布段（设计档 §2.2.6）：
 * 空段一方更大（正式版 > 预发布）；双方非空 → 逐标识符——纯数字按数值比、
 * 数字 < 非数字、非数字按字典序、前缀相等时短者小。
 */
function comparePre(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNum = x !== '' && !isNaN(Number(x));
    const yNum = y !== '' && !isNaN(Number(y));
    if (xNum && yNum) {
      if (Number(x) !== Number(y)) return Number(x) > Number(y) ? 1 : -1;
    } else if (xNum !== yNum) {
      return xNum ? -1 : 1;
    } else if (x !== y) {
      return x > y ? 1 : -1;
    }
  }
  return 0;
}

/**
 * semver-lite 版本比较：数字段逐位比较（缺位补 0，与既有逻辑同）；
 * 数字段相等时按预发布规则比较 -rc.N 等后缀。返回 1 / -1 / 0。
 */
function compareVersions(a, b) {
  const va = splitVersion(a);
  const vb = splitVersion(b);
  const len = Math.max(va.nums.length, vb.nums.length);
  for (let i = 0; i < len; i++) {
    const x = va.nums[i] || 0;
    const y = vb.nums[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return comparePre(va.pre, vb.pre);
}

/**
 * 解析 npm 注册表元数据（Harness 检查，设计档 §2.2.4）：
 * dist-tags.latest + versions[latest].dist.{tarball, integrity}。
 * 缺 latest 或 tarball → 抛错（上层走兜底源 / 记为检查失败）。
 */
function parseRegistryMetadata(json) {
  if (!json || typeof json !== 'object') throw new Error('registry metadata not an object');
  const latest = json['dist-tags'] && json['dist-tags'].latest;
  if (typeof latest !== 'string' || !latest) throw new Error('registry metadata missing dist-tags.latest');
  const entry = json.versions && json.versions[latest];
  const dist = entry && entry.dist;
  const tarball = dist && dist.tarball;
  if (typeof tarball !== 'string' || !tarball) {
    throw new Error('registry metadata missing dist.tarball for ' + latest);
  }
  return { latest, tarball, integrity: typeof dist.integrity === 'string' ? dist.integrity : '' };
}

/** 更新判定：latest 严格大于 current 才算有更新（-rc.N 语义共用 compareVersions）。 */
function decideUpdate(latest, current) {
  const compare = compareVersions(String(latest || ''), String(current || ''));
  return { update: compare > 0, latest: String(latest || ''), current: String(current || ''), compare };
}

module.exports = { compareVersions, parseRegistryMetadata, decideUpdate };
