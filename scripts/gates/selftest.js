'use strict';
/**
 * selftest.js — 判据自证夹具（TC-B16-01…14 + TC-B29-01…06 的结构面）：在 os.tmpdir() 临时档树内造违规面，
 * 逐一验证判据边界 / 错误面；try/finally 清理；判据函数以参数接收 root 与 baseline。
 * （B16；设计档 docs/design/REPO-CONVENTIONS.md §A.2.2.2 自证面 / §A.3.2 TC-B16-01…14）。
 * 夹具根不在仓库根之下 ⇒ 永不在门禁扫描面内（A.2.2.2 夹具隔离面）。
 * 依赖方向：只依赖 lib.js / checks.js；被 run.js 每次 lint 跑（DD-A6：门禁是承重件，须常驻可回放）。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lib = require('./lib.js');
const checks = require('./checks.js');

/** 断言计数与失败收集（非零退出由 run.js 汇总）。 */
let passed = 0;
const failures = [];
/** 仅现状锚（TC-B29-06，liveAnchorOnly）红 = 仓内违规而非门禁坏（run.js 据此分流：落判据 E 块以判据码报告）。 */
let liveAnchorOnly = false;

function assertOk(cond, label) {
  if (cond) { passed++; }
  else { failures.push(label); }
}

/** 夹具根：mkdtemp 临时树（b16-gate- 前缀；A.2.2.2 夹具隔离面）。 */
function fixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'b16-gate-'));
}

/** 写档（UTF-8；自动建父目录）。 */
function writeFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

// ---------------------------------------------------------------------------
// 夹具树构造（按 TC 面；每例独立小树，互不残留）
// ---------------------------------------------------------------------------

/** TC-B16-01/02/03/04/05/06：宽度夹具（恰 300 / 301 / CRLF+300 / 台账表格行 / 批次 §3 段 / 新增档）。 */
function widthFixture() {
  const root = fixtureRoot();
  writeFile(root, 'docs/CONVENTIONS.md', 'x'.repeat(300) + '\n'); // 恰 300 ⇒ 合规（TC-01）
  writeFile(root, 'docs/plain.md', 'y'.repeat(301) + '\n');       // 301 ⇒ 红（TC-02）
  writeFile(root, 'docs/crlf.md', 'z'.repeat(300) + '\r\n');      // 300+CR ⇒ 合规（TC-03）
  writeFile(root, 'docs/README.md', '|' + 'a'.repeat(400) + '\n'); // 台账表格行 ⇒ 豁免（TC-04）
  writeFile(root, 'docs/batches/B01-x.md', [
    '# B01',
    '',
    '## §2 任务书',
    'w'.repeat(400),   // §2 段内超宽 ⇒ 计入（TC-05）
    '',
    '## §3 评审',
    'v'.repeat(400),   // §3 段内超宽 ⇒ 豁免（TC-05）
    '',
    '## §4 裁决',
  ].join('\n') + '\n');
  writeFile(root, 'docs/TODO.md', '|' + 'b'.repeat(400) + '\n'); // 台账表格行 ⇒ 豁免（TC-04 同族）
  return { root, files: lib.listFiles(root) };
}

/** TC-B16-07/08：行数夹具（恰 500 / 501 / 480）。 */
function linesFixture() {
  const root = fixtureRoot();
  writeFile(root, 'a.js', 'x'.repeat(1) + '\n'.repeat(499) + '\n'); // 500 行 ⇒ 合规
  writeFile(root, 'b.js', '\n'.repeat(500) + '\n');                // 501 行 ⇒ 红
  writeFile(root, 'c.js', '\n'.repeat(479) + '\n');                 // 480 行 ⇒ 提示行（不拦）
  return { root, files: lib.listFiles(root) };
}

/** TC-B16-09：依赖环夹具（A↔B 互 require）。 */
function cycleFixture() {
  const root = fixtureRoot();
  writeFile(root, 'a.js', "'use strict';\nconst b = require('./b.js');\nmodule.exports = {};\n");
  writeFile(root, 'b.js', "'use strict';\nconst a = require('./a.js');\nmodule.exports = {};\n");
  return { root, files: lib.listFiles(root) };
}

/** TC-B16-10：fan-out 夹具（新档出度 4 + 基线冻结档出度恰为冻结值）。 */
function fanoutFixture() {
  const root = fixtureRoot();
  for (let i = 1; i <= 4; i++) writeFile(root, `m${i}.js`, "'use strict';\nmodule.exports = {};\n");
  writeFile(root, 'big.js', "'use strict';\n" + [1, 2, 3, 4].map((i) => `const m${i} = require('./m${i}.js');`).join('\n') + '\nmodule.exports = {};\n');
  writeFile(root, 'frozen.js', "'use strict';\n" + [1, 2, 3].map((i) => `const m${i} = require('./m${i}.js');`).join('\n') + '\nmodule.exports = {};\n');
  return { root, files: lib.listFiles(root) };
}

/** TC-B16-11/12：组装面夹具（D③ 三种红 + 真实 main.js 面）。 */
function assemblyFixture() {
  const root = fixtureRoot();
  // 绑定面：settings（免检）+ notifier（恰 1 处 init）
  writeFile(root, 'shell-settings.js', "'use strict';\nmodule.exports = { loadSettings() {} };\n");
  writeFile(root, 'shell-notify.js', "'use strict';\nfunction init() {}\nmodule.exports = { init };\n");
  writeFile(root, 'main.js', [
    "'use strict';",
    "const settings = require('./shell-settings.js');",
    "const notifier = require('./shell-notify.js');",
    'notifier.init();',
  ].join('\n') + '\n');
  return { root, files: lib.listFiles(root) };
}

/** TC-B29-01…05：samples 判据夹具（E① 违规档 / E② 违规 package.json / 边界档——每例按需造）。 */
function samplesFixture() {
  const root = fixtureRoot();
  // TC-B29-01：a.js = 路径形态（行 2）+ 末段形态（行 3）→ ref ×2
  writeFile(root, 'a.js', [
    "'use strict';",
    "const x = require('./samples/x.js');",
    "const y = require('./samples');",
    'module.exports = {};',
  ].join('\n') + '\n');
  // TC-B29-02：b.js = 引号形态（行 2）+ 反引号末段形态（行 3）→ ref ×2
  writeFile(root, 'b.js', [
    "'use strict';",
    "const dir = path.join(base, 'samples', name);",
    'const bare = `./samples`;',
    'module.exports = {};',
  ].join('\n') + '\n');
  // TC-B29-03：违规 package.json（build.files + extraResources.from 登记 samples）→ pkg-build + pkg-extra，无 ref 贡献
  writeFile(root, 'package.json', JSON.stringify({
    name: 'fixture',
    build: {
      files: ['main.js', 'samples/dsh-pet'],
      extraResources: [{ from: 'samples', to: 'dsh' }],
    },
  }, null, 2) + '\n');
  // TC-B29-05：边界档（裸标识符 / 末段近似串 / 文档面）→ 不判
  writeFile(root, 'c.js', [
    "'use strict';",
    'const samples = 1;',
    "const p = 'samples-x';",
    'module.exports = {};',
  ].join('\n') + '\n');
  writeFile(root, 'd.md', '样本区 samples/ 说明（文档面，不属引用面）\n');
  return root;
}

// ---------------------------------------------------------------------------
// 主入口：跑 20 例自证（TC-B16-01…14 + TC-B29-01…06；每例 = 造夹具 → 调判据 → 断言 → 清理）
// ---------------------------------------------------------------------------

function runSelftest() {
  // TC-B16-01 恰 300 字符 ⇒ 合规
  {
    const { root, files } = widthFixture();
    try {
      const res = checks.checkWidth(files, root);
      assertOk(!(res.violations['docs/CONVENTIONS.md'] > 0), 'TC-01: 恰 300 字符行判合规');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-02 301 字符 ⇒ 红（点名档）
  {
    const { root, files } = widthFixture();
    try {
      const res = checks.checkWidth(files, root);
      assertOk(res.violations['docs/plain.md'] === 1, 'TC-02: 301 字符行判红（点名档）');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-03 CRLF 档 300+CR ⇒ 合规（去 CR 后 300）
  {
    const { root, files } = widthFixture();
    try {
      const res = checks.checkWidth(files, root);
      assertOk(!(res.violations['docs/crlf.md'] > 0), 'TC-03: CRLF 档 300+CR 判合规');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-04 台账/地图表格行 400 字符 ⇒ 豁免
  {
    const { root, files } = widthFixture();
    try {
      const res = checks.checkWidth(files, root);
      assertOk(!('docs/README.md' in res.violations) && !('docs/TODO.md' in res.violations), 'TC-04: 台账/地图表格行判豁免');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-05 批次档 §3 段 400 vs §2 段 400 ⇒ §3 豁免、§2 计入
  {
    const { root, files } = widthFixture();
    try {
      const res = checks.checkWidth(files, root);
      assertOk(res.violations['docs/batches/B01-x.md'] === 1, 'TC-05: §3 豁免 + §2 计入');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-06 临时新增档含 2 行超宽（不在基线）⇒ 红（新增即拦）
  {
    const root = fixtureRoot();
    try {
      writeFile(root, 'new.md', 'n'.repeat(301) + '\n' + 'n'.repeat(302) + '\n');
      const files = lib.listFiles(root);
      const res = checks.checkWidth(files, root);
      const cmp = checks.compareBaseline(res.violations, {});
      assertOk(cmp.length === 1 && cmp[0].kind === 'new' && cmp[0].current === 2, 'TC-06: 新增档 2 行超宽判红（新增即拦）');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-07 恰 500 行 ⇒ 合规；501 ⇒ 红
  {
    const { root, files } = linesFixture();
    try {
      const res = checks.checkLines(files, root);
      const has500 = res.near.some((n) => n.file === 'a.js' && n.lines === 500);
      const has501 = res.violations.some((v) => v.file === 'b.js' && v.lines === 501);
      assertOk(has500 && has501, 'TC-07: 500 合规 + 501 红');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-08 480 行 ⇒ 提示行（不判红）
  {
    const { root, files } = linesFixture();
    try {
      const res = checks.checkLines(files, root);
      assertOk(res.near.some((n) => n.file === 'c.js') && !res.violations.some((v) => v.file === 'c.js'), 'TC-08: 480 行出提示不判红');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-09 A↔B 互 require ⇒ 判红（报环路径）；真实仓库 ⇒ 0 环
  {
    const { root, files } = cycleFixture();
    try {
      const res = checks.checkDag(files, root);
      assertOk(res.cycles.length >= 1, 'TC-09: 互 require 判红（报环路径）');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-10 新档出度 4 ⇒ 红；基线档出度 = 冻结值 ⇒ 绿
  {
    const { root, files } = fanoutFixture();
    try {
      const res = checks.checkFanout(files, root);
      const cmp = checks.compareBaseline(res.violations, { 'frozen.js': 3 });
      const big = cmp.find((c) => c.file === 'big.js');
      const frozen = cmp.find((c) => c.file === 'frozen.js');
      assertOk(!!(big && big.kind === 'new' && big.current === 4) && (!frozen || frozen.kind !== 'increased'), 'TC-10: 新档出度 4 判红 + 冻结档恰为冻结值 ⇒ 绿');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-11 D③ 三种红：① 删一处 init( ② 同档双调用 ③ const { init } = require(…) 形态
  {
    const root = fixtureRoot();
    try {
      const problems = [];
      // ① 删 init 调用（免检清单外）⇒ 红
      writeFile(root, 'shell-notify.js', "'use strict';\nfunction init() {}\nmodule.exports = { init };\n");
      writeFile(root, 'main.js', [
        "const notifier = require('./shell-notify.js');",
      ].join('\n') + '\n');
      let res = checks.checkAssembly(lib.listFiles(root), root, { assemblyExempt: [] });
      if (!res.violations.some((v) => v.kind === 'missing' && v.name === 'notifier')) problems.push('11a');
      // ② 双调用 ⇒ 红
      writeFile(root, 'main.js', [
        "const notifier = require('./shell-notify.js');",
        'notifier.init();',
        'notifier.init();',
      ].join('\n') + '\n');
      res = checks.checkAssembly(lib.listFiles(root), root, { assemblyExempt: [] });
      if (!res.violations.some((v) => v.kind === 'multiple' && v.name === 'notifier')) problems.push('11b');
      // ③ const { init } = require(…) 形态（解构绑定）⇒ 红（fail-closed）
      writeFile(root, 'main.js', [
        "const { init } = require('./shell-notify.js');",
        'init();',
      ].join('\n') + '\n');
      res = checks.checkAssembly(lib.listFiles(root), root, { assemblyExempt: [] });
      if (res.violations.length < 1) problems.push('11c');
      assertOk(problems.length === 0, `TC-11: D③ 三种红（删调 / 双调 / 解构 fail-closed；问题 = ${problems.join(',') || '无'}）`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-12 真实 main.js ⇒ 13/13 恰一处（免检 4 档；B31：+affinity-core.js 绑定 1 条 + 免检 1 档；B23：+pet-unlock-core.js 绑定 1 条 + 免检 1 档）
  {
    const baseline = lib.loadBaseline(path.join(checks.REPO_ROOT, 'scripts', 'gates', 'baseline.json'));
    const res = checks.checkAssembly(lib.listFiles(checks.REPO_ROOT), checks.REPO_ROOT, baseline);
    const ok = res.ok + res.exemptChecked;
    assertOk(res.ok === 13 && ok === 17 && res.violations.length === 0, `TC-12: 真实 main.js 17 条绑定全合规（13 init + 4 免检）`);
  }
  // TC-B16-13 基线陈旧：夹具违规已清零而条目未缩减 ⇒ 红
  {
    const root = fixtureRoot();
    try {
      writeFile(root, 'clean.md', 'ok\n'); // 无违规
      const files = lib.listFiles(root);
      const res = checks.checkWidth(files, root);
      const cmp = checks.compareBaseline(res.violations, { 'clean.md': 5 });
      assertOk(cmp.length === 1 && cmp[0].kind === 'stale', 'TC-13: 基线陈旧判红（要求缩减）');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B16-14 基线上调：冻结值 < 现状值 ⇒ 红（只减不增）
  {
    const root = fixtureRoot();
    try {
      writeFile(root, 'grow.md', 'g'.repeat(301) + '\n' + 'g'.repeat(302) + '\n');
      const files = lib.listFiles(root);
      const res = checks.checkWidth(files, root);
      const cmp = checks.compareBaseline(res.violations, { 'grow.md': 1 });
      assertOk(cmp.length === 1 && cmp[0].kind === 'increased' && cmp[0].current === 2, 'TC-14: 冻结值 < 现状值 ⇒ 红（只减不增）');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }

  // ---- B29 判据 E 自证（TC-B29-01…06；设计档附 A-续 §A-B29.3.2）----

  // TC-B29-01 a.js 路径形态 + 末段形态 ⇒ ref ×2（逐行各一条）
  {
    const root = samplesFixture();
    try {
      const res = checks.checkSamples(lib.listFiles(root), root);
      const a = res.refs.filter((r) => r.file === 'a.js');
      assertOk(a.length === 2 && a[0].line === 2 && a[1].line === 3, `TC-B29-01: 路径/末段形态逐行各一条（实得 ${a.length}）`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B29-02 b.js 引号形态 + 反引号末段形态 ⇒ ref ×2
  {
    const root = samplesFixture();
    try {
      const res = checks.checkSamples(lib.listFiles(root), root);
      const b = res.refs.filter((r) => r.file === 'b.js');
      assertOk(b.length === 2 && b[0].line === 2 && b[1].line === 3, `TC-B29-02: 引号/反引号末段形态逐行各一条（实得 ${b.length}）`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B29-03 违规 package.json ⇒ pkg-build + pkg-extra 各 1，该档零 ref 贡献（E① 排除 package.json——防同键双报）
  {
    const root = samplesFixture();
    try {
      const res = checks.checkSamples(lib.listFiles(root), root);
      const pkgRedOnly = res.pkg.filter((v) => v.kind === 'pkg-build' || v.kind === 'pkg-extra');
      const pkgRef = res.refs.filter((r) => r.file === 'package.json');
      assertOk(pkgRedOnly.length === 2 && pkgRef.length === 0, `TC-B29-03: pkg-build+pkg-extra 各 1 且 package.json 零 ref 贡献（实得 pkg=${pkgRedOnly.length}/pkgRef=${pkgRef.length}）`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B29-04 夹具根无 package.json ⇒ pkg-unreadable fail-closed（退出 2 由 run.js 分流——本例验 kind）
  {
    const root = fixtureRoot();
    try {
      writeFile(root, 'clean.js', "'use strict';\nmodule.exports = {};\n");
      const res = checks.checkSamples(lib.listFiles(root), root);
      assertOk(res.pkg.length === 1 && res.pkg[0].kind === 'pkg-unreadable', `TC-B29-04: 缺 package.json ⇒ pkg-unreadable（实得 ${res.pkg.map((v) => v.kind).join(',') || '空'}）`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B29-05 边界：裸标识符 / 末段近似串 / 文档面 ⇒ 不判（变量名不误报）
  {
    const root = samplesFixture();
    try {
      const res = checks.checkSamples(lib.listFiles(root), root);
      const c = res.refs.filter((r) => r.file === 'c.js');
      const d = res.refs.filter((r) => r.file === 'd.md');
      assertOk(c.length === 0 && d.length === 0, `TC-B29-05: 裸标识符/近似串/文档面不判（实得 c=${c.length} d=${d.length}）`);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // TC-B29-06 真实仓库面 ⇒ 0 违规（现状锚：零命中恒绿；红 = 仓内违规非门禁坏 ⇒ liveAnchorOnly，run.js 分流）
  {
    const res = checks.checkSamples(lib.listFiles(checks.REPO_ROOT), checks.REPO_ROOT);
    const cond = res.refs.length === 0 && res.pkg.length === 0;
    if (cond) passed++;
    else { failures.push(`TC-B29-06: 现状锚红（refs=${res.refs.length} pkg=${res.pkg.length}——仓内违规或门禁坏）`); liveAnchorOnly = true; }
  }

  return { passed, failures, total: passed + failures.length, liveAnchorOnly };
}

module.exports = { runSelftest };
