'use strict';
/**
 * layer.js — 测试分层标记（B16；设计档 docs/design/REPO-CONVENTIONS.md §A.2.2.3）。
 * slow(name, fn) = 以 `[slow] ` 前缀注册用例 + 快层置 skip；isFastLayer() = 读 BIGFISH_TEST_LAYER。
 * 层注入口径：层由运行器（scripts/test-run.js）注入环境变量，命令面无层 flag（A.2.2.1）。
 * 用例命名规则：`[slow]` 前缀 = 运行器判「>500 ms 已归册」的唯一标记（硬红判据的数据面）。
 */

const { test } = require('node:test');

/** 当前是否快层（BIGFISH_TEST_LAYER === 'fast'；缺省非 fast = 全量执行）。 */
function isFastLayer() {
  return process.env.BIGFISH_TEST_LAYER === 'fast';
}

/**
 * 慢测层用例：>500 ms 的重 IO 用例（真 fs / 子进程 / 定时器 / 网络）。
 * 快层自动 skip（本层跑不了的代价由全量层 test:full 承载）。
 * @param {string} name 用例名（不带 [slow] 前缀——前缀由本函数加）
 * @param {Function} fn 用例体
 */
function slow(name, fn) {
  test(`[slow] ${name}`, { skip: isFastLayer() }, fn);
}

module.exports = { slow, isFastLayer };
