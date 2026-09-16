'use strict';
/**
 * 开发期单元断言（AC8；设计档 docs/design/AUTO-UPDATE.md §2.2.6 断言表 + §3.2 TC-15）。
 * 运行：node --test tests/update-lib.test.js
 * 退役/转正处置在批次档 §6 逐条判定（默认退役）。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { compareVersions, parseRegistryMetadata, decideUpdate } = require('../update-lib.js');

// §2.2.6 断言表（AC8 单元断言固定用例）
const TABLE = [
  ['0.1.5-rc.1', '0.1.0-rc.6', 1],   // AC8 出厂比对（0.1.0-rc.6 vs latest 0.1.5-rc.1 判定有更新）
  ['0.1.5-rc.2', '0.1.5-rc.1', 1],
  ['0.1.5', '0.1.5-rc.1', 1],        // 正式版 > 预发布
  ['0.1.5-rc.1', '0.1.5', -1],
  ['0.1.5-alpha.1', '0.1.5-rc.1', -1],
  ['0.1.5-rc.10', '0.1.5-rc.9', 1],  // 数值比较，非字典序
  ['0.1.3', '0.1.2', 1],             // App 版本形态
  ['0.1.10', '0.1.9', 1],
  ['1.2', '1.2.0', 0],
  ['0.1.5-rc.1', '0.1.5-rc.1', 0],
];
for (const [a, b, want] of TABLE) {
  test(`compareVersions(${a}, ${b}) ${want > 0 ? '>' : want < 0 ? '<' : '='} 0`, () => {
    assert.strictEqual(Math.sign(compareVersions(a, b)), want);
  });
}

// 宽松口径：数字段某位非数字按 0 处理、不抛异常（设计档 §2.2.6）
test('compareVersions 畸形输入不抛异常（非数字位按 0）', () => {
  assert.strictEqual(compareVersions('1.x.3', '1.0.3'), 0);
  assert.strictEqual(compareVersions('', '0.0.1'), -1);
  assert.strictEqual(compareVersions('0.1.2', ''), 1);
});

// parseRegistryMetadata 假源 fixture（dist-tags.latest = 0.1.5-rc.1，与批次档 §1.6 事实 6 实测同形）
const FIXTURE = {
  'dist-tags': { latest: '0.1.5-rc.1', next: '0.1.5-rc.2', alpha: '0.1.6-alpha.1' },
  versions: {
    '0.1.5-rc.1': {
      name: '@deepseek-ai/dsh',
      version: '0.1.5-rc.1',
      dist: {
        tarball: 'https://registry.npmmirror.com/@deepseek-ai/dsh/-/dsh-0.1.5-rc.1.tgz',
        integrity: 'sha512-fixture-integrity',
      },
    },
  },
};

test('parseRegistryMetadata 读取 dist-tags.latest 与 dist.{tarball,integrity}', () => {
  const parsed = parseRegistryMetadata(FIXTURE);
  assert.strictEqual(parsed.latest, '0.1.5-rc.1');
  assert.ok(parsed.tarball.includes('dsh-0.1.5-rc.1.tgz'));
  assert.strictEqual(parsed.integrity, 'sha512-fixture-integrity');
});

test('parseRegistryMetadata 缺 dist-tags.latest 抛错', () => {
  assert.throws(() => parseRegistryMetadata({ versions: {} }), /dist-tags\.latest/);
});

test('parseRegistryMetadata 缺 dist.tarball 抛错', () => {
  assert.throws(
    () => parseRegistryMetadata({ 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} } }),
    /dist\.tarball/,
  );
});

// decideUpdate（AC8：出厂 0.1.0-rc.6 vs latest 0.1.5-rc.1 判定有更新）
test('decideUpdate 出厂 vs latest 判定有更新', () => {
  const d = decideUpdate('0.1.5-rc.1', '0.1.0-rc.6');
  assert.strictEqual(d.update, true);
  assert.strictEqual(d.latest, '0.1.5-rc.1');
  assert.strictEqual(d.current, '0.1.0-rc.6');
});

test('decideUpdate 同版本判定无更新', () => {
  assert.strictEqual(decideUpdate('0.1.2', '0.1.2').update, false);
});

test('decideUpdate 降级（latest 更小）判定无更新', () => {
  assert.strictEqual(decideUpdate('0.1.0', '0.1.2').update, false);
});
