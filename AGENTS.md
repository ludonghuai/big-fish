# AGENTS.md —— 本仓工程纪律（Bigfish）

> 本档是本仓**工程纪律的唯一权威句**：只写规则与指针，**不重述**别处全文（细节按指针跳转，单一权威源）。
> 读者 = 接手本仓的人与 AI 代理。四要素：写权矩阵 · 四步流程 · 门禁现状与目标 · 文档体系入口。
> 变更记录见文末。

---

## 一、角色与写权矩阵

| 产物 | 写权 | 说明 |
|---|---|---|
| 需求档 `docs/requirements/<板块>.md` · 设计档 `docs/design/<主题>.md` · **规范档 `docs/CONVENTIONS.md`** · `AGENTS.md` · `.editorconfig` | **eng-designer** | 文档层长寿命产物；起草与修订同权 |
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

**现状 = 0/3**（实测，as-of 2026-09-17）：

1. `package.json:13-26` 的 scripts（**12 项**；行号只作 as-of 参考）**无 `test`**（= postinstall / prestart / start / pack / dist / dist:win / dist:mac / dist:linux / icons / make-latest / bundle:refresh / bundle:check）。
2. `.github/workflows/build.yml`（75 行）**无 lint / test 步骤**（只有构建与产物上传）。
3. 全仓**无 lint / format 配置**（`.eslintrc*` / `eslint.config.*` / `.prettierrc*` 全零命中）。

**目标（归 B16，本档只声明目标与指针，不写实现）**：三道门 = `lint` → `test:full` → `test:integration`，并由 CI（`.github/**`）接线。
现存 `tests/`（3 档：`update-lib.test.js` / `update-stub.mjs` / `harness-store.test.js`）为**开发期工具**，不构成仓门禁。

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
