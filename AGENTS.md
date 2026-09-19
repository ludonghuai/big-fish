# AGENTS.md —— 本仓工程纪律（Bigfish）

> 本档是本仓**工程纪律的唯一权威句**：只写规则与指针，**不重述**别处全文（细节按指针跳转，单一权威源）。
> 读者 = 接手本仓的人与 AI 代理。四要素：写权矩阵 · 四步流程 · 门禁现状与目标 · 文档体系入口。
> 变更记录见文末。

---

## 一、角色与写权矩阵

| 产物 | 写权 | 说明 |
|---|---|---|
| 需求档 `docs/requirements/<板块>.md` · 设计档 `docs/design/<主题>.md` · **规范档 `docs/CONVENTIONS.md`** · **定位档 `docs/SAMPLES.md`** · `AGENTS.md` · `.editorconfig` | **eng-designer** | 文档层长寿命产物；起草与修订同权 |
| 批次档 `docs/batches/<批次>-<主题>.md` | **六段一作者**（append-only） | §1 / §4 / §6 = 主 agent · §2 = eng-designer · §3 = 评审子代理 · §5 = eng-coder；子代理写自己那段，不经父侧转述 |
| 台账 `docs/TODO.md`（归档档 `docs/TODO-archive.md`）· 文档地图 `docs/README.md` · `CHANGELOG.md` | **主 agent** | 索引与台账类；其他角色只在报告里给**建议行** |
| 提示词 `bundled-skills/*.md`（产品代码，随包发） | 主 agent 内容权 + **eng-coder** 落笔 | 不走文档流程 |
| 业务代码 `*.js` · `package.json` · CI `.github/**` | **eng-coder**（持设计凭证） | 实施权；凭证 = 设计评审通过后签发 |

---

## 二、流程（四步，不跳步）

**需求 → 设计 → 开发 → 测试**，四步按序推进；**设计未经评审与用户批准，不得进入实施**。

- 需求：讨论清楚要什么 → 落成需求档（三层：总目标 / 功能用户故事 / 非功能标准）并确认。
- 设计：方案与理由、受影响文件全清单、可验证的验收标准 → 落成设计档（一主题一档）。
- 评审与批准：设计评审的**发起权在用户**（任何角色不自发起）；评审通过 + 用户明确批准后签发设计凭证。
- 开发与测试：eng-coder 持凭证实施；交付后走审计与交付评审；验收勾销写批次档 §6（设计档内不记勾销状态）。
- 批次档在飞时的设计评审**必须传 `batchDoc`**（评审者据此把发现表与 VERDICT 写入 §3）。
- 层与清单（需求档 / 设计档 / 批次档 / 台账 / 提示词）→ `docs/README.md`（本档不重述落点约定）。

---

## 三、门禁（现状与目标）

**现状 = 3/3**（三道发布门全落地 + CI 真绿；实测 as-of 2026-09-19，证据 = `docs/batches/B16-test-gates.md` §6）：

1. `package.json:13-30` 的 scripts（**16 项**；行号只作 as-of 参考）含 `lint` / `test` / `test:full` / `test:integration`。
2. `.github/workflows/gates.yml` 已接线（windows-latest；push / PR / dispatch；三步只调 npm script）——CI **真绿 ×3 runs**（用户 2026-09-19 截图，含 `4f5d425`）。
3. lint / format 面 = **自研门禁** `scripts/gates/**`（七判据 + 结构三条；基线冻结 + 逐条消解期）。本仓自有代码**仍无 eslint / prettier 配置**（自有代码面零命中；仅 `samples/dsh-pet/dsh-pet/` 第三方样例自带 `eslint.config.js` / `.prettierrc.json`，不属本仓门禁面）。

**门禁定义（已达成；细节指针化，本档不重述）**：三道门 = `lint` → `test:full` → `test:integration`，由 CI（`gates.yml`）接线；判据与基线机制 → `docs/CONVENTIONS.md`，实施与验收 → `docs/batches/B16-test-gates.md` §5-6。
`tests/` 现含 **9 档**（计数 as-of 2026-09-19 实测）：`harness-store.test.js` / `update-lib.test.js` / `update-stub.mjs` / `b12-plugin-guards.test.js` / `layer.js` + `tests/integration/`（`harness.js` + 3 场景）；实测全绿 = 单元 45 用例 + 集成 3 场景。

---

## 四、文档体系入口

| 要找什么 | 去哪 |
|---|---|
| 落点约定 · 当前文档清单 · 三档关系 | `docs/README.md` |
| 代码规范（文件头 / 命名 / 注释语言 / 注入面 / 行宽行数 / EOL / 提交） | `docs/CONVENTIONS.md` |
| 需求池 · 技术待办 | `docs/TODO.md` |
| 变更史（仓库面）· 对外说明（用户面） | `CHANGELOG.md` · `版本说明.txt` |
| 环境搭建 / 打包 / 运行 | `README.md` · `使用说明.txt` |

---

## 五、变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-17 | 建档（B11）：写权矩阵 / 四步流程 / 门禁现状 0/3 与目标（归 B16）/ 文档体系入口四要素 + 指针；代码规范指向 `docs/CONVENTIONS.md`（回指批次档 `docs/batches/B11-conventions.md` §1.6 AC1）。 |
| 2026-09-17 | **B08 收口轮（门禁现状 ① 行同步）**：scripts 行锚与列举按 as-of 实测更正——`package.json:13-24`（10 项）→ **`:13-26`**（**12 项**：补 `bundle:refresh` / `bundle:check`；注「行号只作 as-of 参考」）；成因 = B08 增两行 scripts ⇒ 其后各行整体 +2。**「无 `test`」结论与现状 0/3 不变。** |
| 2026-09-18 | **B16 落笔轮（§三 计数订正）**：`tests/` 计数 **3 档 → 4 档**（漏 `b12-plugin-guards.test.js`；实测 as-of 2026-09-18）+ 补「现状 0/3 与目标段随 B16 实施后同步」注记。**「无 `test`」与现状 0/3 结论不变**（实施未动）。依据 = 批次档 `docs/batches/B16-test-gates.md` §1.3-4。 |
| 2026-09-19 | **B16 收口轮（§三 同步）**：门禁现状 **0/3 → 3/3**（scripts 16 项含 `lint`/`test`/`test:full`/`test:integration`；`gates.yml` 接线 + CI 真绿 ×3；lint/format = 自研门禁 `scripts/gates/**`）；`tests/` 计数 4 → **9 档**；目标段改「已达成」+ 删同步注记。依据 = `docs/batches/B16-test-gates.md` §6。 |
| 2026-09-19 | **B29 实施轮（判据 E 权威句与写权矩阵同步）**：§三 门禁面「六判据」→「**七判据**」（第七判据 E = 样本区解耦 `samples-guard`，判据句权威 = `docs/CONVENTIONS.md` §四）；§一 写权矩阵 eng-designer 行补**定位档 `docs/SAMPLES.md`**（B29 open ② 已裁采纳）。依据 = 批次档 `docs/batches/B29-samples-guard.md` §2 · AC-B29-6。 |
