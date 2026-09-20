# REPO-CONVENTIONS —— 仓库规范基建设计（B11）

> 设计档（长寿命）：需求层 / 设计层 / 测试层 + 变更记录。
> 回指：批次档 `docs/batches/B11-conventions.md` §1（立案 · §1.3 体检实证 · §1.6 AC1–AC6）与 §2（任务书）。
> **附 A = B16 面**（测试分层与门禁）：回指批次档 `docs/batches/B16-test-gates.md` §1（三方同源 = §1.4 五件 + §1.5 硬约束）；B11 面 = §一–§三（节号与指针零改动）。
> **附 A-续 = B29 面**（`samples/` 解耦判据 E 与定位收口）：回指批次档 `docs/batches/B29-samples-guard.md` §1（三方同源 = §1.4「做」三项 + §1.5 硬约束）；B16 面 = 附 A（A.1–A.3，节号与指针零改动）。
> 需求来源 = 台账 R11「接手项目规范化」① 规范载体——**工程/流程类需求，本仓无对应需求档**：需求条文由批次档 §1 承载（三方同源 = `docs/batches/B11-conventions.md` §1.6 的 AC1–AC6）。
> 落点约定（层与清单）→ `docs/README.md`；本档不重述。

---

## 一、需求层

### 1.1 总体需求

为**接手本仓的人与 AI 代理**解决一个具体问题：本仓工程纪律目前只存在于批次档的复述与主 agent 的记忆里——**没有可引用的规则句**（`AGENTS.md` / `CONTRIBUTING.md` / `CHANGELOG.md` / `.editorconfig` / lint-format 配置全零命中——负结论见批次档 `docs/batches/B11-conventions.md` §1.1）。
本批把规则**立住**：落成可被后续每批引用的成文规范，且**不改任何业务代码**。

### 1.2 功能性需求（逐条可交付）

| # | 需求 | 范围边界（明确不做什么） |
|---|---|---|
| F1 | `AGENTS.md`（根，新建）= 本仓工程纪律的**唯一权威句**，四要素：① 角色与写权矩阵 ② 四步流程与评审发起权 ③ 门禁现状与目标 ④ 文档体系入口 | 不重述 `docs/README.md` 的落点约定、不重述规范档条文（只给指针）；短句 + 指针，不抄纪律全文 |
| F2 | **代码规范档**（落点由本设计裁定，见 §2.1.1）= 代码形态的**唯一权威句**：文件头标准形（以 B04/B06 世代为标准形，前世代为待迁移面）· 命名 · 注释语言 · 模块注入面 · 行宽/行数成文判据（含 EOL 口径与豁免面）· EOL 与空白 · 提交与变更 · 开发期脚本 | 不改任何 `.js`；前世代只给**目标形态 + 迁移面清单**，迁移另批（另批项，见 §2.3） |
| F3 | **`.editorconfig`**（根，新建）：EOL / 缩进 / 字符集 / 末行换行 | 不执行格式化；不设 `max_line_length`（豁免面表达不了，见 §2.2.4） |
| F4 | **lint / format 取舍**成文：≥2 候选逐项判据 + 选定理由 + 被否决理由；若引入则成文「纯格式化单独提交、分批」的执行纪律 | 本批不装依赖、不接线、不跑首次格式化；机检接入归 B16 |
| F5 | **`CHANGELOG.md` 起步**（形态裁定）+ 与 `版本说明.txt` 的分工（= 批次档 §1.6 AC5 措辞；本批出形态与分工，本体 = 父侧落档项，见 §2.1.4） | 本设计者不写 `CHANGELOG.md`（父侧维护档，写权 = 主 agent）；只给形态与首批条目口径 |

### 1.3 非功能性需求

| # | 约束 | 度量方式 |
|---|---|---|
| NFR-1 | **零业务代码改动** | `git diff --name-only` 只出现文档与配置档（本批允许集见 §3.1 AC6） |
| NFR-2 | **零新依赖** | `package.json` 的 `dependencies` / `devDependencies` 不变 |
| NFR-3 | **规则句可机检** | 每条验收标准给出可执行命令（`grep` / `node` 脚本），见 §3.1 |
| NFR-4 | **单一权威源（D2）** | 同一机制只在一处详述：门禁只在 `AGENTS.md`、代码形态只在规范档、落点约定只在 `docs/README.md`；其余处只出现指针 |
| NFR-5 | **与实测相容** | 凡陈述现状必须带实测口径（数字 / 文件数 / 行号）；禁止绝对化断言（把现状写成「全都一致 / 都已统一」一类即与实证相抵） |
| NFR-6 | 文档可读性 | 本批新增档在豁免面外**无 >300 字符单行**；表格与列表正常换行，不压超长单行 |

### 1.4 回指

- 验收标准 = 批次档 §1.6 的 **AC1–AC6**（§3.1 逐条回指，**逐字同号**，不增不改）。
- 台账 **R11** 的「① 规范载体」= 本批范围；R11 的 ② 文档补齐 → B14、③ 代码优化串 → B17+（不在本批）。
- §1.5 的五项待决（规范档落点 / lint 取舍 / CHANGELOG 形态 / 前世代迁移 / 行宽行数是否升门禁）= 本档 §2.1 与 §2.4 逐项裁定。

---

## 二、设计层

### 2.1 方案选型对比

判据来自 §1.2 / §1.3；被否决候选逐条写否决理由。

#### 2.1.1 代码规范档的落点（候选 4）

判据：D2 单一权威源风险 · 读者发现路径（人 + 代理）· 与地图和落点约定的相容 · 寿命与更新频率 · 体量与扫读性 · 维护成本。

| # | 候选 | 判据逐项评估 | 取舍（选定代价） | 结论 |
|---|---|---|---|---|
| 1 | `AGENTS.md` 内小节 | 单档无重复风险；但把「代理入口档」变成规范全文档（≈200 行）⇒ 扫读性下降，且与本批对 `AGENTS.md` 的写作要求（短句 + 指针、不抄纪律全文）相抵；此后每改一条规范都要动入口档 | 代价：省一个文件 | **否决** |
| 2 | `docs/CONVENTIONS.md`（docs/ 顶层新档，与 `docs/README.md` / `docs/TODO.md` 同级） | 与既有四层（需求 / 设计 / 批次 / 台账）同族，可按同一落点约定被引用；**地图天然是发现路径**；与 `AGENTS.md` 分工干净（流程 vs 形态），D2 无重复面 | 代价：给 docs/ 增「规范档」一层（需主 agent 在地图与落点约定各加一行，建议原文见 §2.3） | **选定** |
| 3 | 根目录档（`CONVENTIONS.md` / `CODE-STYLE.md`） | 发现路径 = 仓库根；但根目录已承载 41 个 `.js` + 5 个用户面文档（README 的用户文档表只列用户面四档）⇒ 工程面与用户面混层；**不进地图 ⇒ 新读者发现路径弱** | 代价：避开地图改动 | **否决** |
| 4 | `docs/standards/conventions.md`（新子目录） | 层级更「清晰」；但本仓约定是一板块一档，**单档不成层**，新增子目录徒增层级与指针长度 | — | **否决** |

#### 2.1.2 `.editorconfig` 的 EOL 策略（候选 3）

实测基线（as-of 2026-09-17，`git ls-files --eol` + 逐档字节比对）：93 个文本档**索引 EOL 全为 LF**；工作区 = **51 LF / 42 CRLF**（签出/编辑器漂移面）；本机 `core.autocrlf = true`；全仓**无** `.gitattributes`；93 档**全部**已带末行换行、**0 行**行尾空白、**0 档** Tab 缩进。

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | `end_of_line = lf`（全局文本） | 与**仓库真值（索引全 LF）**一致；全仓套用 ⇒ 工作区 **42 档**字节变化、**git 提交面 0 档 diff**（本机已实证：`main.js` 工作区 CRLF + 索引 LF ⇒ `git diff --numstat main.js` 空）；漂移收敛 | 代价：无 `core.autocrlf` 的克隆里，首次保存会产生 42 档整档 EOL diff（缓解 = `.gitattributes`，见 §2.3 出批项） | **选定** |
| 2 | `end_of_line = unset`（不强制） | 零 diff、零风险；但漂移不收敛（Windows 编辑器新建档默认 CRLF，无 autocrlf 者直接入库）⇒ 与「把规则立住」的目的相抵 | — | **否决** |
| 3 | `end_of_line = crlf`（全局文本） | 与仓库真值相背；全仓套用 ⇒ 工作区 **51 档**变化，把多数档推向错误方向 | — | **否决** |

#### 2.1.3 lint / format（候选 3）

判据：现有代码改动量 · 与「不改行为」的冲突面 · CI 接线成本 · **零新依赖优先**。

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **不引入**（`.editorconfig` + 成文约定） | 代码改动量 **0**；「不改行为」冲突面 **0**；接线成本 **0**；新依赖 **0** | 代价：规则暂无机检执行者 ⇒ 机检归 B16（零依赖 node 脚本 + CI 步骤），本批只成文 | **选定（本批）** |
| 2 | 轻量 formatter（只格式化，如 Prettier / dprint） | 覆盖面 = 42 个 `.js` / `.mjs`（6,679 行）⇒ 首次全量重排造成**整仓 blame 断层**（接手项目的 blame 是稀缺资产，§1.4 边界已明文禁用）；新增 1 个 devDependency；会把格式 diff 混进功能提交 | — | **否决（本批）**（收益 < blame 代价） |
| 3 | ESLint + Prettier | 同候选 2 的重排面；另 `eslint:recommended` 对**无 lint 历史**的存量代码会产生大量新增告警，需逐条豁免或整改 ⇒ 与「本批不改业务代码」边界直接冲突；2 个依赖 + 配置面 | — | **否决（本批）** |

选定后仍**成文**一条前置约束（只写在规范档 §七 · 唯一处）：将来若引入 formatter / linter，**纯格式化必须单独提交、分批执行**，且不与行为改动同提交。

#### 2.1.4 `CHANGELOG.md` 形态（候选 3）

判据：与 `版本说明.txt` 的分工清晰度（D2 防双维护）· 读者适配 · 每批维护成本 · 现有素材可移植性。

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **Keep a Changelog 全量**（Added / Changed / Fixed / Removed / Deprecated / Security + `[Unreleased]`，倒序，SemVer） | 分类固定 ⇒ 接手者可按类型检索；与用户面 `版本说明.txt` 分工最清晰（全量源 vs 摘要）；每批维护成本 = 收口时按批次档 §6 核销落 1–N 行 | 代价：需要维护纪律（每批/每版落一次） | **选定** |
| 2 | 版本级摘要（每版一段自由叙述） | 无分类 ⇒ 检索弱；形态与 `版本说明.txt` 接近 ⇒ **双维护风险高**（正是 D2 要避免的） | — | **否决** |
| 3 | 只记破坏性变更 | 维护成本最低；但绝大多数变更不留痕 ⇒ 接手者拿不到变更史，与 `版本说明.txt` 也不构成互补 | — | **否决** |

**分工（单点详述，防双维护）**：

- `CHANGELOG.md`（根，**仓库面**）= 变更史**全量权威源**，开发者语汇，条目带批次档指针；结构 = `[Unreleased]` + 每版一节（倒序）。
- `版本说明.txt`（根，**用户面**）= 由 `CHANGELOG.md` **摘要生成**的对外说明（用户语汇 + 安装包清单 + 下载地址；读者见 `README.md:139-142` 用户文档表），自身不再独立登记变更。
- 方向单一：**CHANGELOG → 版本说明**；不得反向回填。0.0.1 的首批条目 = **一次性回溯种子**（素材源 = 既有 `版本说明.txt` 的「一、本期核心 / 二、稳定性修复」两段）。

### 2.2 契约与结构

#### 2.2.1 四档指针图（各机制只在一处详述）

```
AGENTS.md（根 · 代理与人入口）
  ├─ 详述：写权矩阵 / 四步流程 / 门禁现状与目标
  ├─ 指针 → docs/README.md           （落点约定 + 当前文档清单 + 三档关系）
  ├─ 指针 → docs/CONVENTIONS.md      （代码形态）
  ├─ 指针 → docs/TODO.md             （需求池 / 技术待办）
  └─ 指针 → CHANGELOG.md / 版本说明.txt（变更史 / 对外说明）
docs/CONVENTIONS.md
  ├─ 详述：文件头 / 命名 / 注释语言 / 注入面 / EOL 与空白 / 提交与变更 / 开发期脚本
  ├─ 详述（**唯一处**）：行宽 ≤300 / 行数 ≤500 / 豁免面 / 口径 = 不含行尾 CR → **本档 §五**；
  │   其余提及只作指针或声明（地图 `docs/README.md` §一「行宽约定（项目声明）」行 · `.editorconfig` 的「不设 max_line_length」理由注）
  ├─ 指针 → .editorconfig            （格式声明）
  ├─ 指针 → docs/design/SHELL-UX.md §2.2.6（依赖方向与拆分纪律）
  └─ 指针 → docs/design/AUTO-UPDATE.md §2.2.8（发版流程；已在规范档 §七 补该指针）
```

#### 2.2.2 `AGENTS.md` 结构契约

五节标题**逐字固定**（供机检 grep）：`## 一、角色与写权矩阵` · `## 二、流程（四步，不跳步）` · `## 三、门禁（现状与目标）` · `## 四、文档体系入口` · `## 五、变更记录`；目标行数 ≈ 60–80（短句 + 指针）。

写权矩阵的内容契约：

| 产物 | 写权 |
|---|---|
| 需求档 `docs/requirements/<板块>.md` / 设计档 `docs/design/<主题>.md` / **规范档 `docs/CONVENTIONS.md`** / `AGENTS.md` / `.editorconfig` | eng-designer |
| 批次档 `docs/batches/<批次>-<主题>.md` | 六段一作者（append-only）：§1 / §4 / §6 = 主 agent · §2 = eng-designer · §3 = 评审子代理 · §5 = eng-coder |
| 台账 `docs/TODO.md`（+ `docs/TODO-archive.md`）/ 文档地图 `docs/README.md` / `CHANGELOG.md` | 主 agent |
| 提示词 `bundled-skills/*.md`（产品代码） | 主 agent 内容权 + eng-coder 落笔 |
| 业务代码 `*.js` / `package.json` / CI `.github/**` | eng-coder（持设计凭证） |

「规范档 = eng-designer」为本设计**新增行**（判据：与需求/设计档同族——长寿命文档层产物、走「设计 → 评审 → 落档」同一链条）——列为评审确认项（见 §2.7 ①）。

#### 2.2.3 代码规范档结构契约

章节标题**前缀逐字固定**（机检按**前缀匹配**；允许「（…）」说明后缀——实测 5 处带后缀，其信息保留不删）。前缀 = `## 零、现状基线` ·
`## 一、文件头` · `## 二、命名` · `## 三、注释语言` · `## 四、模块与依赖注入` · `## 五、行宽与行数` · `## 六、EOL / 空白 / 缩进` ·
`## 七、提交与变更` · `## 八、开发期脚本` · `## 变更记录`；带后缀 5 处（**行号只作 as-of 参考**，as-of 2026-09-17 修正轮 4）= `docs/CONVENTIONS.md:10`（零·实测 as-of）·
`:29`（一·标准形）· `:117`（五·成文判据）· `:130`（六·`.editorconfig` 的唯一详述处）· `:158`（八·探针 / 辅助）。目标行数 ≈ 100–140（**起草期目标**——现值以批次档 `docs/batches/B11-conventions.md` §2.13 实测为准；§2.12 表为修正轮 3 值）。

文件头**标准形 = 推荐形（写作面；取自 B04/B06 世代逐字同构形态，§1.3 ③；新档遵循、存量不追溯）**——判据见下三条：

```js
'use strict';
/**
 * <文件名>.js — <一句话职责>（<批次号>；设计档 docs/design/<主题>.md §<节>）。
 * <可选：函数清单 · 属主状态 · 依赖方向>
 */
```

**`.mjs`（ESM）同形但免判据 ①**：首行直接起 JSDoc 块（实测 `tests/update-stub.mjs:1` = `/**`）——ESM 隐式严格模式。

三条判据：① 第 1 行逐字 `'use strict';`——**适用范围 = `.js`（CJS）**，**`.mjs` 不适用**（ESM 隐式严格；推荐形：JSDoc 紧随、不加空行）；② **JSDoc 块（`/** … */`）在场** + 块内含**含路径**的设计档指针（细则见 ③）；③ **含路径**形态（D4：禁「设计档 §x」式相对指针）。

**推荐形（写作面；新档遵循，存量不追溯）**：JSDoc 首行 = `文件名 — 职责（批次；设计档 全路径 §节）`（模板见上代码块）；合规面 4 处存量档为其**非逐字变体**（**非缺陷，不迁移、不追溯**）——逐名清单见 `docs/CONVENTIONS.md` §1.1。

#### 2.2.4 `.editorconfig` 契约

`root = true` + `[*]`（`charset = utf-8` · `end_of_line = lf` · `insert_final_newline = true` · `trim_trailing_whitespace = true` · `indent_style = space` · `indent_size = 2`）+ `[*.md] trim_trailing_whitespace = false`（行尾两空格 = Markdown 硬换行语义）。

显式**不设**两项（含理由，避免后人误加）：

- `max_line_length`——豁免面（台账/地图表格行、批次档 §3）`.editorconfig` 表达不了，误报率高；行宽判据由规范档条 + B16 机检承载。
- `[*.cmd] end_of_line = crlf`——实测 `debug-pet.cmd` 现状为 LF 且可用 ⇒ 不特例化（少一处漂移面）。

#### 2.2.5 数据流 = 阅读流（本批无 UI）

本批无界面/交互面（N/A，见 §2.6）。「流」= 三条阅读路径：① 代理：`AGENTS.md` → 指针；② 人：`docs/README.md`（地图）→ 各层档；③ 接手者查变更：`CHANGELOG.md` → 批次档 §6（核销记录）。

### 2.3 受影响文件全清单（新建 4 · 修改 0 · 业务代码改动 0）

| 文件 | 现状 | 本批动作 | 预计行数 |
|---|---|---|---|
| `AGENTS.md` | 不存在 | 新建 | ≈ 70 |
| `docs/CONVENTIONS.md` | 不存在 | 新建（§2.1.1 选定落点） | ≈ 120 |
| `.editorconfig` | 不存在 | 新建 | ≈ 16 |
| `docs/design/REPO-CONVENTIONS.md` | 不存在 | 新建（本档） | ≈ 250 |
| `docs/batches/B11-conventions.md` | 存在（未跟踪） | 仅追加 §2（eng-designer 段） | + ≈ 150 |
| `docs/README.md` | 62 行 → **67 行** | **已落**（主 agent 2026-09-17）：§一 落点约定 **2 行**（入口档 `AGENTS.md` · 规范档 `docs/CONVENTIONS.md`）+ §二 当前文档 **3 行**（规范档 · 本设计档 · `CHANGELOG.md`） | 0（父侧） |
| `CHANGELOG.md` | 不存在 → **29 行** | **已落**（父侧 O6，2026-09-17）：`[Unreleased]` + `[0.0.1]` 骨架（形态见 §2.1.4、内容口径见批次档 §2.8） | 0（父侧） |
| 业务代码 41 个 `.js` + 1 个 `.mjs`（6,679 行） | — | **零改动**（本批不触碰） | 0 |

**超上限档（>500 行）的拆分计划：无**——本批不触碰 `.js`；贴线档 `market.js`（**恰 500 行**、零余量）在下一次改动前须先给拆分计划，该纪律写入规范档 §五。

**出批（另批）项**：

| # | 项 | 归属建议 | 判据 |
|---|---|---|---|
| O1 | **`.gitattributes`**（`* text=auto eol=lf`）把 EOL 口径固化到仓库（现依赖本机 `core.autocrlf`） | B15 仓库卫生 / 用户裁定 | §2.1.2：无 autocrlf 的克隆会把 CRLF 归一到错误方向 |
| O2 | 文件头**迁移**：**20 档** = 17 档无设计档指针 + 3 档相对指针（`update.js` · `make-latest.js` · `market-update.js`）；迁至规范档 §一 标准形 | 随下次动档的批次 / B17 | 本批零 `.js` 改动（§2.5）；逐名清单见 `docs/CONVENTIONS.md` §1.1 |
| O3 | 行宽/行数**升门禁句**（机检接入 CI） | B16 | §1.3 ⑤ / B16 范围；**B16 已落设计**（本档 **附 A**：判据 B/C + `npm run lint`） |
| O4 | 行宽债清理（非豁免面实测 **65 行**，见规范档 §五） | 台账 T13（主 agent） | 实测新增于 T13 登记面（AUTO-UPDATE 3 行）之外 |

### 2.4 关键决策记录

| # | 决策 | 理由 | 否决备选 |
|---|---|---|---|
| DD-1 | 规范档落点 = `docs/CONVENTIONS.md` | §2.1.1（发现路径 + 与四层同族 + D2 无重复） | `AGENTS.md` 内小节 / 根目录档 / 新子目录 |
| DD-2 | 「规范档 = eng-designer」写入写权矩阵（**新增行，待评审确认**） | 与需求/设计档同族的文档层长寿命产物 | 主 agent 内容权（判据不支撑：规范档非台账/索引类） |
| DD-3 | EOL = `lf`（与仓库真值一致；套用代价 42 档工作区 / 0 档提交面） | §2.1.2 | `unset` / `crlf` |
| DD-4 | 本批**不引入** lint/formatter；机检归 B16 | §2.1.3（零依赖优先 + blame 资产） | Prettier / ESLint + Prettier |
| DD-5 | `CHANGELOG.md` = Keep a Changelog 全量（仓库面）；`版本说明.txt` = 其派生摘要（方向单一） | §2.1.4 | 版本级摘要 / 只记破坏性变更 |
| DD-6 | 前世代文件头**迁移另批**；本批只给目标形态 + 迁移面清单 | 本批边界 = 不碰业务代码 | 本批顺带迁移（越界） |
| DD-7 | 行宽判据口径 = **不含行尾 CR** 的字符数 | 本仓工作区 42 档为 CRLF，含 CR 会把 300 字符行读成 301（`SHELL-UX.md` 误报先例） | 含 CR 计数 |
| DD-8 | 豁免面**照旧**（台账/地图表格行 + 批次档 §3），**不新增豁免** | 用户 2026-09-17 裁定 A / A′ 已定；新增豁免须用户裁定 | 给设计档表格行豁免等 |
| DD-9 | `AGENTS.md` 只写四要素 + 指针，**不抄**纪律全文 | NFR-4（D2）+ 本批对 F1 的写作要求 | 把规范条文并入 `AGENTS.md` |

### 2.5 边界（本设计不做的事）

- 不改任何 `.js` / `.mjs` / `package.json` / `.github/**`；不整仓格式化；不装依赖；不接线门禁。
- 不改既有需求档 / 设计档 / 批次档既有段落；不写 `CHANGELOG.md` 本体（父侧）；不改 `docs/README.md`、`docs/TODO.md`（只给建议行 / 只报告）。
- 不新增行宽豁免面；**不把「存量」当合法态**——前世代文件头 = 待迁移面（非合规面），迁移是另批项。
- 不做需求档条文修订：R11 属工程/流程类需求、无需求档（需求条文由批次档 §1 承载），本批无需求档写面。

### 2.6 UI / 交互决策

**N/A（本批无界面、无交互路径改动）**——显式声明，非遗漏：`git diff` 面只含文档与配置档；「交互」仅为 §2.2.5 的三条阅读路径，无 open 项。

### 2.7 待确认项（open）

| # | 待确认 | 影响面 |
|---|---|---|
| ① | 写权矩阵新增行「规范档 = eng-designer」（DD-2） | `AGENTS.md` 一行；若被否，改为「主 agent 内容权 + eng-designer 落笔」 |
| ② | 本批设计档落点（`docs/design/REPO-CONVENTIONS.md`）：写域清单未列、禁碰列 `docs/requirements\|design/**`——本设计按 §1.4 原文「**不改既有内容**」判定为「不得改既有档，可新建本批设计档」 | 若主 agent 本意为「本批不产出设计档」，本档整体改挂批次档 §2 / 指定落点 |
| ③ | 规范档落点若被否（DD-1），连带调整：本档标题、地图建议行、`AGENTS.md` 指针 | 三处一行改动 |

---

## 三、测试层

### 3.1 验收标准（逐条回指批次档 §1.6 的 AC1–AC6）

| # | 验收标准（回指 §1.6，逐字同号） | 判据（可机检） |
|---|---|---|
| AC1 | `AGENTS.md` 在场且含四要素（写权 / 流程 / 门禁现状与目标 / 文档体系入口） | `test -f AGENTS.md` 且 `grep -n '^## ' AGENTS.md` ≥ 5 行、四要素关键词逐条命中（「写权矩阵」「流程」「门禁」「文档体系入口」） |
| AC2 | 规范档在场，且 §1.3 的 ①–⑦ 逐项成文覆盖；规范句与实测一致（无绝对化现状断言） | ① 逐项 grep：①「kebab-case」· ②「注释语言」· ③「文件头」· ④「不含行尾 CR」· ⑤「行宽」+「行数」· ⑦「提交」→ `docs/CONVENTIONS.md`；⑥「0/3」→ `AGENTS.md`；② 九节标题**前缀匹配**（见 §2.2.3）；③ 取值串 = 例外清单 + 判据 ① 扩展名口径 + 判据 ② 宽口径 vs 推荐形（细则见下三条）；④ 反向机检：字面变体 0 命中 + 半自动人核 |
| AC3 | `.editorconfig` 在场且与 EOL 现状相容（给出全仓套用 diff 量化；不以格式化全仓为代价） | `test -f .editorconfig`；`grep -q 'end_of_line = lf'`；档内与设计档 §2.1.2 的量化句（42 档工作区 / 0 档提交面）同时在场；`git diff --name-only` 不含 EOL 翻转档 |
| AC4 | lint/format 取舍有 ≥2 候选的逐项判据 + 选定理由 + 被否决理由；若引入，执行纪律成文 | 设计档 §2.1.3（3 候选 × 4 判据 + 否决理由）在场；规范档 §七 含「纯格式化单独提交、分批」句 |
| AC5 | `CHANGELOG.md` **起步**且与 `版本说明.txt` 分工明确（不重复维护）（= 批次档 §1.6 原措辞） | **设计面**：本档 §2.1.4 分工三句在场（全量源 / 派生摘要 / 方向单一）+ 批次档 §2.8 含父侧落档项（形态 + 起步内容 + 首批条目口径）；**父侧面**：`test -f CHANGELOG.md` 且 `grep -q '^## \[Unreleased\]' CHANGELOG.md`（O6 落档后成立；核销 §6 复核） |
| AC6 | 零业务代码改动（`git diff --name-only` 仅文档与配置档）· 产物行宽 ≤300（豁免面除外） | 允许集（**交付时刻快照**，6 档——清单见下注）；核心判据 = `git diff --name-only` 不含 `.js` / `.mjs` / `package.json` / `.github/**`；行宽机检扫**五档**（见 TC-3），0 行超宽（口径 = 去行尾 CR） |

**AC2 的反向机检细则**（限**规则档** `docs/CONVENTIONS.md` · `AGENTS.md`，避免规则句自指）：

- 字面变体 **4 个**（**0 命中**为通过；变体经实测筛过——不取与「禁令句自身举例」或「带实测口径的数据行」相撞的串）：
  `grep -nE -e '100% 统一' -e '已全部统一' -e '均已统一' -e '全部统一' docs/CONVENTIONS.md AGENTS.md`。
- 半自动判据（拦余下变体——例「全都一致」与禁令句举例相撞、「全部合规」与 §六 末行换行数据行相撞）：
  `grep -nE '全部|统一|100%' docs/CONVENTIONS.md AGENTS.md` 的**每一命中行**须为「规则句」或**同行带实测口径**（数字 / 档数 / 行号），否则**人工核**。
- **命名现状口径**（修正轮 2）：§1.3 ① 的成文须为**例外清单 + 计数**——`docs/CONVENTIONS.md` §二 清单 = `afterPack.js`（camelCase）· `build/icon_background_removed.png`（snake_case）；**「camelCase / snake_case = 0」式绝对句不得出现**（机检该串须 **0 命中**）。
- **判据 ① 的扩展名口径**（修正轮 2）：`docs/CONVENTIONS.md` §一 与 §1.1 须同时出现「`.js` 适用 / `.mjs` 免」口径；**不得出现「`.mjs` 亦须 `'use strict';`」式表述**。
- **判据 ② 的口径**（修正轮 3）：判据 ② = **宽口径**（「JSDoc 块在场」+「块内含路径的设计档指针」）；「JSDoc 首行 = `文件名 — 职责（批次；设计档 全路径 §节）`」= **推荐形（写作面；新档遵循、存量不追溯）**。
  机检：`docs/CONVENTIONS.md` §一 的措辞须分清「判据（机检面）」与「推荐形（写作面）」；§1.1 须**逐名登记 4 处合规面形态差异**（`main.js` · `tests/harness-store.test.js` · `tests/update-lib.test.js` · `tests/update-stub.mjs`），且三分 **22 / 3 / 17 = 42 不变**；**不得出现**「合规面各档逐字同形」式表述。
- 现状实测（as-of 2026-09-17 修正轮 4；**行号只作 as-of 参考**）：变体机检 **4/4 零命中**；半自动候选 **6 行**全过——`docs/CONVENTIONS.md:5`（禁令句自身）· `:132`（规则句）· `:18` / `:136` / `:137`（各带实测口径）· `:174`（变更记录行，带计数口径）；`AGENTS.md` 0 命中。

**AC6 的允许集与时效**（以**交付时刻**为口径；父侧落 O5/O6 后按新允许集复核——核销 §6）：

- 允许集 6 档 = `AGENTS.md` · `.editorconfig` · `docs/CONVENTIONS.md` · `docs/design/REPO-CONVENTIONS.md` · `docs/batches/B11-conventions.md` · `CHANGELOG.md`。
- 父侧落档后（as-of 2026-09-17）：6 档已提交（`dfc9e42`），`git status` 只剩各批在途档的 §2 追加——判据核心（不含任何 `.js` / `.mjs`）不变。

### 3.2 用例表（正常 / 边界 / 错误）

| # | 类型 | 输入 | 期望输出 | 映射 |
|---|---|---|---|---|
| TC-1 | 正常 | `grep -n '^## ' AGENTS.md` | 命中五节标题；四要素关键词逐条可定位 | AC1 |
| TC-2 | 正常 | 逐项 grep §1.3 ①–⑦ 关键词（分档：规范档 / `AGENTS.md`） | 7/7 命中，且所在档 = 契约档（①–⑤⑦规范档 · ⑥ `AGENTS.md`） | AC2 |
| TC-3 | 正常 | node 脚本：`split(/\r?\n/)` 后逐行测 `length > 300`，扫**五档**：`.editorconfig` · `AGENTS.md` · `docs/CONVENTIONS.md` · 本设计档 · 批次档（**仅 §1 / §2**——§3 属豁免面） | 0 行超宽 | AC6 |
| TC-4 | 边界 | 新增档出现**恰 300 字符**（不含 CR）的行 | 判合规（不得报超宽） | AC6 |
| TC-5 | 边界 | CRLF 档中 300 字符 + `\r` 的行 | 判合规（去 `\r` 后 300）——`SHELL-UX.md` 误报先例 | AC6 |
| TC-6 | 边界 | 台账 `docs/TODO.md` / 地图 `docs/README.md` 的表格行超 300 字符 | 判**豁免**（机检不计入） | AC6 |
| TC-7 | 边界 | 把 93 个文本档按 `.editorconfig` 声明统一为 LF，再跑 `git diff --name-only` | 提交面 0 档变化（本机 `core.autocrlf=true`）；工作区 42 档字节变化 | AC3 |
| TC-8 | 错误 | 往 `docs/CONVENTIONS.md` 或 `AGENTS.md` 注入一行绝对化现状断言——变体逐个测（「全仓形态已 100% 统一」/「注释语言均已统一为中文」/「全仓形态全部统一」） | 反向机检 (a) 命中 ⇒ 判失败（4 变体须 0 命中）；未命中 (a) 的绝对化断言落 (b) 人核；注入行须先移除 | AC2 |
| TC-9 | 错误 | 新增档出现 >300 字符单行（豁免面外） | 机检非零退出，拦截交付 | AC6 |

---

## 附 A —— B16 面：测试分层与门禁（B16 批次修订）

> 本附节 = **B16 批次**（测试与门禁：发布门 0/3 → 3/3 + 结构判据机检）的完整设计（需求层 / 设计层 / 测试层）。
> 回指批次档 `docs/batches/B16-test-gates.md` §1；**B11 面 = §一–§三**（规范载体），其节号与指针零改动（本附节编号 A.x 独立）。
> 需求来源 = 批次档 §1（**工程/流程类需求，本仓无对应需求档**——依 B11 先例）；三方同源 = §1.4「做」五件 + §1.5 硬约束七条。
> 现状实测（as-of 2026-09-18，行号只作 as-of 参考）：`package.json:13-26` 的 **12** 项 scripts **无 `test`**；`.github/workflows/build.yml`（**74** 行）无 lint/test 步骤；
> 全仓无 lint/format 配置；`tests/` **4** 档 = 3 档 `*.test.js`（**45 用例全绿**，实测 1.20 s）+ 1 档假源桩 `update-stub.mjs`；
> 组装面 `main.js` 相对 require **15** 条 / `init(` 调用 **13** 处（免 `init` 2 档）；依赖图 **0 环**；fan-out 超限 **6** 档；非豁免面超宽行 **92** 行 / 16 档。

### A.1 需求层

#### A.1.1 总体需求

为**接手本仓的人与 AI 代理**解决一个具体问题：本仓的「改坏了」目前只能靠人眼、靠运气、靠用户实机发现——**发布门 0/3**（无 `test` 脚本 · CI 无 lint/test · 无 lint/format 配置），且**结构判据无机检**：
域模块 `init()` 漏调不可发现（B20 实测：批内 AC1–AC20 全绿而功能全死，= T37）· 域模块 fan-out 超限不可发现（= T39）。
本批把**验证链立住**：三道门（`lint` → `test:full` → `test:integration`）**可本地跑且与 CI 逐字同形**，并把**结构判据**（依赖无环 / fan-out ≤3 / 接线点唯一）纳入机检；**零业务行为变更**。

#### A.1.2 功能性需求（逐条 = 批次档 §1.4 的「做」五件）

| # | 需求（回指 §1.4） | 范围边界（明确不做什么） |
|---|---|---|
| F1 | **`lint` 门**（§1.4-1）= **自研零依赖机检**（依 B11 §2.1.3 的既定取舍）：语法 · 行宽/行数 · 结构判据三条；入口 = `npm run lint` | 不引入 ESLint / Prettier / formatter（B11 已裁，本批**不重开选型**）；不做格式化；不改运行时代码；**不做文件头判据机检**（出批项 O-A1） |
| F2 | **`test:full`**（§1.4-2）= 既有开发期桩测的**统一入口**（收编 3 档 45 用例）+ 慢测层机制 | 不重写既有 `tests/` 档正文（唯一例外 = TC-82 的 `slow()` 机械改标）；不新增第三方测试框架 |
| F3 | **`test:integration`**（§1.4-3）= **业务场景层**，首发三场景：应用能起 · 桌宠主链路 · 更新门禁 | 不做真机目视面；不做发布流程（T5/T7/T8 属发布面）；不覆盖托盘 / 插件市场 / 好感度面（分期清单 = 出批项 O-A2） |
| F4 | **CI 接线**（§1.4-4）= `lint` → `test:full` → `test:integration` 三步，**与本地逐字同形** | 不改 `build.yml` 的发版路径（tags 触发）；**CI 内不得出现裸命令**（只调 npm script） |
| F5 | **机检门禁句三条**（§1.4-5）: 行宽/行数（T26）· 组装面 `init` 接线（T37）· 结构判据三条（T39：依赖无环 / 域模块 fan-out ≤3 / 接线点唯一） | 不重构既有模块结构（U-4 = **基线冻结 + 只拦新增**）；**不新增行宽豁免面** |

#### A.1.3 非功能性需求

| # | 约束 | 度量方式 |
|---|---|---|
| NFR-A1 | **零业务行为变更**（§1.5-1） | 运行时代码面（`main.js` · `pet*` · `shell-*` · `market*` · `updater.js` · `harness-store.js` · `update-lib.js` · `*.html` · `*.json` 的 `build` 块）`git diff` 为空；既有 45 用例全绿；S1/S2 场景绿 |
| NFR-A2 | **零新增依赖**（§1.5-4 零依赖优先） | `package.json` 的 `dependencies` / `devDependencies` 并集不变（`git diff` 只含 `scripts` 块） |
| NFR-A3 | **门禁必须可本地跑**（§1.5-4） | 三条门命令本地控制台 0 退出；集成层**零外网依赖**（只连 `127.0.0.1` 桩） |
| NFR-A4 | **与 CI 逐字同形**（§1.5-4） | CI step 与本地**同源**（都调 `npm run <名>`；CI 不复制命令行内容）——同形由「单一命令源」保证，非逐字比对两份文本 |
| NFR-A5 | **禁散文锚**（§1.5-5） | 新增断言面逐条标注（行为面 / 结构机检面）；对**非测试档**的「读取 + 子串断言」**0 处** |
| NFR-A6 | **行宽 ≤300 / 单档 ≤500**（§1.5-6） | 本批新增/修改档在**门禁自身判据**下 0 新增违规；新增 `.js` 档全部 <500 行 |
| NFR-A7 | **测试分层纪律**（§1.5-2/3） | 单例 >500 ms 必须 `slow()` 归册（机检硬红）；集成层单独承载，不进快/慢二分 |
| NFR-A8 | **规则句可机检**（承 B11 NFR-3） | 每条验收标准给出可执行命令（见 A.3.1） |
| NFR-A9 | 单一权威源（D2） | 门禁的详述处 = **本附节**；`AGENTS.md` 只声明门名与实况、规范档只留判据句与指针（均不重述机检实现） |

#### A.1.4 回指

- 验收标准 = A.3.1 的 **AC-B16-1…AC-B16-12**，逐条回指批次档 §1.4（F1–F5）与 §1.5（硬约束 1–7）。
- 台账承载：**T4**（无测试基建）· **T26**（行宽/行数门禁）· **T37**（组装面机检）· **T39**（结构判据三条）；**T13**（行宽债）本批**只冻结不清偿**。
- 排期：**实施排在 B19 / B20 之后**（`package.json` 争用 ✗；批次档 §1.8）。

### A.2 设计层

#### A.2.1 方案选型对比（判据来自 A.1.2 / A.1.3；被否决候选逐条写否决理由）

**组 1 — `lint` 门的实现形态（候选 3）**

| # | 候选 | 判据逐项评估 | 取舍（选定代价） | 结论 |
|---|---|---|---|---|
| 1 | **自研零依赖机检**（node 脚本：语法 / 行宽行数 / 结构三条） | 新依赖 0；`git blame` 无断层；判据可逐条写成可机检句；覆盖面 = 已成立判据（T26/T37/T39） | 代价：规则覆盖窄于 ESLint（无 style/潜在 bug 类规则）；脚本自身需自证（→ DD-A6） | **选定**（B11 §2.1.3 的既定取舍，本批执行） |
| 2 | ESLint + Prettier | 与 B11 §2.1.3 的否决理由同：42 档以上代码首次全量重排 ⇒ blame 断层；`eslint:recommended` 对无 lint 历史存量产生大量告警 | — | **否决**（越 B11 裁定；本批不重开选型） |
| 3 | 只做语法检查（`node --check`） | 成本最低；但 T26/T37/T39 三条机检句**全部落空** ⇒ 与 §1.4-5 范围不符 | — | **否决**（不满足 F5） |

**组 2 — 单元层运行入口形态（候选 3）**

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **自研运行器**（`scripts/test-run.js`：档发现 → 设层环境变量 → spawn `node --test` → 解析 TAP 时长） | 一次解决三件事（① 档发现 · ② 层环境变量跨平台传递 · ③ >500 ms 未归册硬红）；零依赖（逐条实测依据见下注） | 代价：+1 档（≈110 行）需自证 | **选定** |
| 2 | 直用 `node --test "<glob>"` | 命令行最短；但无法承载层环境变量与时长硬红 ⇒ NFR-A7 落空；且 glob 面依赖 Node 版本（CI Node 22 / 本机 Node 24 跨版本） | — | **否决** |
| 3 | 第三方 runner（vitest / jest） | 与 §1.5「不引入重型测试框架」直接冲突；新增依赖 + 配置面 | — | **否决** |

**为何必须自研运行器（三条实测依据）**：① `node --test <目录>` 在本仓**实测失败**（Node 24 把目录当模块解析 ⇒ `MODULE_NOT_FOUND`，退出 1）；glob 形态依赖 Node ≥21 的 glob 面。
② npm script 内联 `set VAR=` 不可跨平台 ⇒ 层环境变量须由 JS 侧注入。③ 逐用例时长只有解析 TAP 才拿得到（硬红判据的数据源）。

**组 3 — CI 接线落点（候选 2）**

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **新增 `.github/workflows/gates.yml`** | 关切单一（门禁）；触发面 = `push` + `pull_request` + `workflow_dispatch`（每次改动都判）；不动发版链路 | 代价：CI 配置面 +1 档 | **选定** |
| 2 | 扩展 `build.yml` | 需改其触发面（现 = tags）⇒ 触碰发版链路；发版（三平台矩阵）与门禁（Windows 单平台）关切不同，混档后相互拖累与回归风险外溢 | — | **否决** |

**组 4 — 集成场景的驱动形态（候选 3）**

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **混合**：S1/S3 = 真启动 + 外部观测；S2 = 进程内模块驱动 | S1/S3 覆盖**组合根真接线 + 真后端**（T37 的教训面）；S2 的拖拽跟手面在「不新增产品测试钩子」前提下无法确定性驱动光标 ⇒ 改取「建窗 → 几何读回 → 显示器事件校正 → 落盘」链路 | 代价：两条驱动形态各一套夹具；S2 不覆盖拖拽跟手（登记为边界，见 A.2.5） | **选定** |
| 2 | 全进程内（`require` 产品模块 + 假 electron） | 覆盖面与既有桩测重叠，**不覆盖组合根与真后端**（正是 T37 的缺口面） | — | **否决** |
| 3 | 全外部观测（只启动 app 看落盘物） | 桌宠链路缺稳定外部观测面（拖动需真实光标 / 真机）⇒ 场景二空心 | — | **否决** |

**组 5 — 慢测层机制（候选 2）**

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **`slow()` 标记 + 快层自动 skip** | 承本仓既有口径（**>500 ms 归 `slow()`**，§1.5-3）；标记随用例走，无搬迁面；与「禁止新写散文锚」无关（标记是机检面） | 代价：每例改标决策需人判 ⇒ 由运行器硬红兜底 | **选定**（U-3 ①） |
| 2 | 独立目录 `tests/slow/` | 机制简单；但迁移面大（既有用例搬迁）、与 A.2.2.3 的命名分域叠加易混 | — | **否决** |

**组 6 — 结构判据的基线处理（候选 2）**

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **基线冻结 + 只拦新增**（U-4 ①） | 增量可控；不挡当前批次；**须带到期条件**（本设计逐条写死，见 A.2.2.6） | 代价：存量债仍在（92 行超宽 + 6 档 fan-out）；须有陈腐即红防永久豁免 | **选定** |
| 2 | 门禁一立即全绿（先清 92 行超宽 + 6 档 fan-out 拆分） | 终态最干净；但把老账一次性逼出 ⇒ 范围外（§1.4「不做：不重构既有模块结构」）且挡住当前批次 | — | **否决** |

#### A.2.2 契约与结构

##### A.2.2.1 门禁三层契约（命令 · 内容 · 摘要行 · 退出码）

| 层 | 命令 | 内容 | 摘要行（机器可 grep） |
|---|---|---|---|
| ① 静态机检 | `npm run lint` → `node scripts/gates/run.js` | 自证夹具（判据 A–C · D①②③ · **E（B29）** 的边界 / 错误面）→ **七条判据** | `GATE lint PASS checks=7 selftest=20/20`（B29 修订：判据 E 入队 ⇒ checks 6→7 · selftest 14→20；E 面 = 附 A-续） |
| ② 单元与桩测 | `npm run test`（快层）· **`npm run test:full`**（全量 = 门） | `tests/**/*.test.js`；慢测层自动 skip | `GATE test:full PASS pass=45 fail=0 skipped=0 ms=<n>` |
| ③ 集成场景 | `npm run test:integration` → `node scripts/test-integration.js` | 三场景（A.2.2.4），逐场景 spawn `electron` | `GATE test:integration PASS scenarios=3 pass=3 fail=0` |

**四条 script 的字面值**（实施 = 原样写入 `package.json` scripts 块；**单一命令源** —— F4 / NFR-A4 的「与 CI 逐字同形」依赖它）：

| script | 字面值 |
|---|---|
| `lint` | `node scripts/gates/run.js` |
| `test` | `node scripts/test-run.js` |
| `test:full` | `node scripts/test-run.js --full` |
| `test:integration` | `node scripts/test-integration.js` |

- **退出码**：`0` = 绿 · `1` = 判据红 · `2` = 门禁自身无法完成（**fail-closed**：档发现失败 / 基线档缺失 / 解析异常一律 2，绝不静默通过）。
- **命名来源**：`test:full` / `test:integration` = `AGENTS.md` §三 已声明的门名（单一权威源，**不重命名**）；`test` = 快层（同族的默认面）。
- **口径**：`test:full` **不含**集成层（否则第三道门冗余）——三层互不重叠、各自独立判红。
- **层注入口径（命令面无层 flag）**：层由**运行器**注入 —— 运行器按自身开关（`test` 缺省 / `test:full` 传 `--full`）置 `BIGFISH_TEST_LAYER` 后再 spawn 子进程，`tests/layer.js` 的 `isFastLayer()` 只读该环境变量（A.2.2.3）。⇒ `npm run test:full --slow` 的旧写法**作废**（层不经命令行参数传递）。
- **本批实施序（步序契约）**：① 落地 `scripts/gates/**` + `tests/layer.js` → ② 写 `baseline.json`（**取实施当日实测值**，见 A.2.2.6）→ ③ `test-run.js` + b12 的 `slow()` 改标 → ④ 集成三层（`harness.js` + 3 场景 + `test-integration.js` + stub 扩展）→ ⑤ `package.json` scripts → ⑥ `gates.yml` → ⑦ 本地三条门全绿取证。

##### A.2.2.2 机检判据逐条（七条：A · B · C · D①②③ · E —— 判据句 + 口径 + 机检方式 + 现状）

**扫描面（七条判据共用的档集合）**：仓库根起 `fs` 递归，**跳过清单** = 与根 `.gitignore` 同源的非仓库内容——
`node_modules` · `dist` · `electron-dist` · `node-runtime` · `samples` · `测试-更新功能` · `.git` · `.thincoder` · `.npm-cache` · `.electron-cache` ·
`.electron-builder-cache` · `.dsh-home*` · `.test-userdata*` · `.test-dsh-home` · `*.log` ·
`probe-electron.js` · `download-electron.js` · `download-node.js`。
**口径选择理由**：`git ls-files` 口径会**放过未 `git add` 的新档** ⇒ 「只拦新增」（U-4）的判据失效；故取「磁盘实际档树 − 非仓库内容」。清单唯一权威处 = `scripts/gates/lib.js`。
非文本档（读为 utf8 后含 NUL）跳过；生成档（`package-lock.json` 等）**不设豁免**（承 DD-8 / DD-A11：不新增豁免面）。
**生成档现状实测（as-of 2026-09-18）：`package-lock.json` 5,313 行 ⇒ 超宽 0 行**；未来依赖变更若引入 >300 字符行 ⇒ 该行不可拆（生成档）、又不在豁免面内 ⇒ **处置 = 停下报用户裁定**（基线**不得**用于冻结**新增**违规，见 A.2.2.6 判定规则 1；候选 ① 新增「生成档」豁免面 ② 改锁定源形态），**不静默放行**。

| # | 判据 | 判据句（权威源） | 机检口径（本附节 = 机检实现面） | 机检方式 |
|---|---|---|---|---|
| A | 语法 | 扫描面内每个 `.js` / `.mjs` 经 `node --check` **退出 0**（**权威 = 本附节** —— B16 新增判据，规范档暂无对应条文） | 无豁免 | `execFileSync('node', ['--check', 档])` 逐档 |
| B | 行宽 | 回指 `docs/CONVENTIONS.md` §五（单行 ≤300 字符） | 口径 = **不含行尾 CR**（承 DD-7）；豁免 = 台账 / 地图 / 归档档的**表格行**（`trim()` 后首字符 `\|`）+ **批次档 §3 段**（`^## §3 ` 起至下一 `^## ` 标题止）；**豁免面计数不含归档档**（D1） | 逐行测长 + 豁免面过滤；**基线** = 非豁免超宽行按档计数的冻结值 |
| C | 行数 | 回指 `docs/CONVENTIONS.md` §五（单档 ≤500 行） | 口径 = `\n` 计数（末行有换行不额外计）；`≥480` 输出**提示行**（不拦 —— 承规范档 §五「贴线档先给拆分计划」） | 同 B 的遍历 |
| D① | 依赖无环 | 回指 `docs/CONVENTIONS.md` §四 D① | 只认字面量 `require('.<相对>')`；边 = 解析到扫描面内档 | DFS 着色求环 |
| D② | 域模块 fan-out | 回指 `docs/CONVENTIONS.md` §四 D② | 域模块 = 扫描面内 `.js` / `.mjs` 去掉 `tests/` · `scripts/` · `probe-*`；组合根 `main.js` 免判（装配面天然高扇出） | 逐档出度计数；**基线** = 超限档的冻结值 |
| D③ | 接线点唯一 | 回指 `docs/CONVENTIONS.md` §四 D③ | **覆盖面 = 组合根绑定面**（口径见下条）；面内不导出 `init` 的档列入**免检清单**（含理由）；**未解析的 `require` 形态 = 红**（fail-closed） | 绑定正则 + 调用计数正则；免检清单在基线档 |
| E | 样本区零引用 | 权威 = `docs/CONVENTIONS.md` §四（B29 实施轮落笔）——判据句与口径见 附 A-续 §A-B29.2.2（本表只列名，不重述） | 同左 | 同左 |

- **判据句单一权威源（D2）**：B / C 的判据句权威 = `docs/CONVENTIONS.md` §五，D①②③ 的判据句权威 = `docs/CONVENTIONS.md` §四；本表只承载**机检口径与机检方式**，**不复述判据句**（防两处措辞分叉）；规范档只留判据句 + 机检实现面的指针。
- **D③ 的覆盖面 = 组合根绑定面**（判据闭合，2026-09-18 实测；B31 / B23 实施后计数与行锚同步，as-of 2026-09-20）：D③ 只对 `main.js` 的相对 `require`（`const <名> = require('<相对>')`）**绑定到的**档适用 —— `main.js:32-48` 共 **17** 条相对 require。
  `docs/CONVENTIONS.md` §四 列的「无 `init` 4 档」中：`shell-settings.js` / `shell-ipc.js` **在绑定面内** ⇒ 入免检清单；`shell-assets.js` / `shell-market.js` **未被组合根绑定**（`main.js` 全文无其 require）⇒ 不进绑定面、无需入清单。
  故基线 `assemblyExempt` = **4 档**（+ `affinity-core.js`——B31 新增绑定；+ `pet-unlock-core.js`——B23 新增绑定：两者均无 `init` 导出），与现状 `13/13 恰一处` 闭合。
- **D③ 即 §1.4-5 的 T39 ②「装配面唯一」的机检落点**（T37 的组装面接线漏调亦由本判据拦）——与 D①② 的分工见下。

**各判据现状（as-of 2026-09-18）**：

- **A**：51 档（50 `.js` + 1 `.mjs`）→ **0 失败**。
- **B**：非豁免 **92 行 / 16 档**；豁免面另计 = 批次档 §3 **121** 行 + 台账 / 地图 / 归档档的**表格行** **43** 行（台账 **31** + 地图 **12**，as-of 2026-09-18）。
  **豁免面计数不含归档档**（主 agent 裁决 D1：归档档已定案、不参与门禁计数 —— 计入会随每次归档漂数）；`docs/TODO-archive.md` **在扫描面内**、按**表格行豁免口径**处理（含归档 = 46 行，**不计**）。
  前三 = `docs/batches/B03-pet-multimonitor.md` **40** · `docs/design/PET-MULTIMONITOR.md` **18** · `docs/batches/B18-pet-animation-chain.md` **7**。
- **C**：最大 = `market.js` **500**（贴线）· `updater.js` 497 · `tests/b12-plugin-guards.test.js` 491；**0 档超限**。
- **D①**：**0 环**（基线不设条目）。
- **D②**：超限 **6 档** = `shell-tray` **10** · `shell-ipc` **6** · `shell-pet` / `shell-update` / `shell-window` 各 **5** · `shell-market` **4**。
- **D③**：**13/13 恰一处**（绑定面 **17** 条）；免检 **4 档** = `shell-settings.js`（工具档，无 `init`）· `shell-ipc.js`（走 `register()` 接线）· `affinity-core.js`（B31 新增，无 `init` 导出——结构性免检）· `pet-unlock-core.js`（B23 新增，无 `init` 导出——同形结构性免检）。（D③ 数随 B31 / B23 同步，as-of 2026-09-20）
  T37（B20 实机：`physics.init` 漏调致功能全死而 AC 全绿）正是本判据的拦截面。

- **F1 覆盖面 = 七条判据**（A 语法 · B 行宽 · C 行数 · D① 无环 · D② fan-out · D③ 接线点唯一 · **E 样本区零引用（B29）**）——与 A.2.2.1 的 `checks=7` 同口径；七条各出一行 `CHECK …` 摘要（A.3.1 AC-B16-6/7/8 据此逐条回指；E 的回指 = 附 A-续 A-B29.3.1）。
- **自证面**：内联 `--selftest` 自证 **TC-B16-01…14 + TC-B29-01…06（B29）**（结构面，每次 `npm run lint` 跑）；**TC-B16-15…24** 由各自执行面承载（慢层运行器 / 集成场景 / 结构 grep），不在自证内。
- **自证夹具隔离面（承 TC-B16-06 / 09 / 13）**：判据函数以**参数**接收 `root` 与 `baseline`（缺省 = 真实值）⇒ 夹具在 `fs.mkdtempSync(path.join(os.tmpdir(), 'b16-gate-'))` 的**临时档树**内造档，**不往仓库写任何档**。
  夹具树内容 = 自造超宽行 `.md` / 互 `require` 的 `.js` / 违规基线条目；清理 = `try` / `finally` 内 `fs.rmSync(root, { recursive: true, force: true })`。
  **与跳过清单的关系**：夹具根在 `os.tmpdir()` ⇒ **永不在门禁扫描面内**（扫描面 = 仓库根起递归）⇒ 无需新增跳过条目；若改用「仓库内临时根」（**不推荐**）⇒ 该根须同时写入跳过清单并保证 `finally` 清理，否则残档会被真实判据当**新增违规** ✗。
- **D③（= T39 ②「装配面唯一」）的拦截面与 D①② 的分工**：D③ 拦「接线漏调 / 重调」（B20 实机事故 = T37 面）；D② 拦「拼接式耦合」（域间 `require` 泛滥）；D① 拦环。三者判据不同，**不得合并**。
- **判据 B/C 的自陈**：本批新增/修改档自身须过判据 B/C（NFR-A6）——即门禁**扫自己**（防「新写的机检档自己超宽」）。

##### A.2.2.3 测试分层与运行契约

- **域划分（机检可判）**：`tests/**/*.test.js` = **单元/桩测层**（`test` / `test:full`）；`tests/integration/**/*.scenario.js` = **集成层**（`test:integration`）。两域**后缀不同** ⇒ 运行器发现规则互不误收（DD-A12）。
- **慢测层契约**：`tests/layer.js` 导出 `slow(name, fn)`（= 以 `[slow] ` 前缀注册用例，并在快层置 `skip`）与 `isFastLayer()`（读 `process.env.BIGFISH_TEST_LAYER === 'fast'`）。
  - 快层（`npm run test`）⇒ `[slow]` 用例 skip；全量（`npm run test:full`）⇒ 全部执行（**层由运行器注入 `BIGFISH_TEST_LAYER`、命令面无层 flag** —— 见 A.2.2.1）。
  - **硬红**：运行器解析 TAP 逐用例时长，任何**非 `[slow]`** 用例 >500 ms ⇒ 层判红，输出 `SLOW-UNREGISTERED <档> :: <用例> <ms>`。
  - **现状实测**：45 用例中**恰 1 例** >500 ms = `tests/b12-plugin-guards.test.js` 的 `TC-82 降级夹具：无 profile manifest / 空 node_modules ⇒ 不抛、返回空集`（**756.6 ms**）⇒ 本批改标 `slow()`（机械改标 + 引入 1 行，非重写）。
  - **集成层不参与**快/慢二分（天然全慢），由 `test:integration` 单独承载。
- **断言面纪律**：新增断言只写 ① **行为面**（进程退出码 / 产品自身落盘物与诊断日志行 / 文件系统结果）② **结构机检面**（档内容结构）。**禁**「读非测试档 + 子串断言」式散文锚（NFR-A5）；禁止面的**可判形态**与**允许面**见 A.3.1 AC-B16-9。
- **收编口径**：既有 3 档 `*.test.js` 正文**不改**（唯一例外 = 上条 `slow()` 改标）；`tests/update-stub.mjs` 作**假源桩**被集成层复用（A.2.2.5）。

##### A.2.2.4 集成场景契约（首发三场景）

| 场景 | 驱动 | 上限 | 断言面 |
|---|---|---|---|
| **S1 应用能起** | 真启动 `electron .` + 外部观测落盘物 | 180 s | 行为面 |
| **S2 桌宠主链路** | 进程内驱动（`electron tests/integration/s2-pet-main-path.scenario.js`） | 60 s | 行为面 |
| **S3 更新门禁** | 真启动 + 外部观测（同 S1 夹具，`autoCheckUpdates:true`） | 200 s | 行为面 |

**S1 环境与种子**：`BIGFISH_USER_DATA=<repo>/.test-userdata-b16/s1` · `DSH_HOME=<repo>/.test-dsh-home/s1` · `BIGFISH_SKIP_ENSURE_DEPS=1` ·
更新源三 URL 指向本地桩 · `BIGFISH_UPDATE_INTERVAL_MS=86400000`；**种子 `settings.json`** = `modeChosen:true` + `lastModeVersion:<app 版本>` + `petEnabled:false` + `autoCheckUpdates:false`。

**S1 判据**：`<userData>/bigfish.log` 出现 `[bigfish] backend web url captured port=<数字>`，**且**不出现 `backend web url not captured`，**且**断言时刻进程仍存活。

**S2 环境**：真 `BrowserWindow`（透明 / 无框 / 尺寸 = `geometry.PET_SIZE_DIP`）+ 真 `shell-pet-geometry.js` + 真 `shell-settings.js`；`BIGFISH_PET_DEBUG=1`；`BIGFISH_USER_DATA=<…>/s2`。

**S2 判据**：① `pet-geometry.log` 出现 `geom tag=start`（含 `pos=` / `size=` / `center=` / `visible=`）；
② `settings.json` 的 `petPos` = 窗口实际位置（**±1 DIP**）；
③ 触发一次真代码路径 `handleDisplayChange('metrics', <display>, [])` 后出现 `geom tag=display`，且窗口中心点仍落在某显示器 `workArea` 内。

**S3 环境**：除 S1 外 + `BIGFISH_UPDATE_URL=<桩>/latest.json`；子态 a = registry `?latest=0.1.5-rc.1`；子态 b = registry `?latest=0.1.9`。

**S3 判据**：两子态均须 —— `updater.log` 含 `update gate reason=startup face=app skipped=dev`（**App 面 dev 不检查**）**且不含** `result=error`；
子态 a 另含 `update check reason=startup type=harness result=up-to-date latest=0.1.5-rc.1 current=<当前>`；
  子态 b 另含 `result=update-available latest=0.1.9` **且不含** `harness install phase=`（**放行 = 只提示不自动装**，不自动改环境）。

**判据串的源码证据行（as-of 2026-09-18 实测；串 = 逐字取自源码模板）**：

- `BIGFISH_PET_DEBUG` 读取面：`shell-pet-geometry.js:34` · `shell-pet-drag.js:27` · `shell-pet-physics.js:52` · `shell-pet.js:46` · `pet-chain.js:17`（均 `=== '1'`，关闭时零日志）。
- `geom tag=<tag> pos=… size=… center=… display=… scale=… wa=… visible=…`：模板 = `shell-pet-geometry.js:193-197`；`tag=start` 的调用点 = `main.js:207`；`tag=display` = `shell-pet-geometry.js:334` / `:345`。
- `backend web url captured port=<数字> token=<yes|no>`：`shell-backend.js:155`；反例串 `backend web url not captured port=<数字> reason=…`：`shell-backend.js:257`。
- 两个落盘物：`bigfish.log` = `shell-backend.js:44` / `:60-61`（`writeDiag`）· `:215`；`pet-geometry.log` = `shell-pet-geometry.js:51-55`（`:53` 拼 userData 路径）。
- `update gate reason=startup face=app skipped=dev`：模板 = `shell-update.js:274`；`reason=startup` 的来源 = `shell-update.js:293`（`runAutoChecks('startup')`，启动后 5 s）。
- `update check reason=<r> type=harness result=<up-to-date|update-available> latest=… current=…`：`updater.js:239`；`result=error` 行 = `updater.js:243`；`updater.log` 落点 = `shell-update.js:53`。
- `harness install phase=<phase> ok=… detail=…`：`updater.js:350`（回滚面 `:391` / `:432`）。
- `DSH_NODE`：`shell-backend.js:110` · `shell-plugins.js:48`（未设 ⇒ 回退 `'node'`）。
- S2 驱动的 `handleDisplayChange('metrics', <display>, [])`：定义 = `shell-pet-geometry.js:323`（签名 `kind, display, metrics`）· 导出 = `:429` · 生产绑定 = `main.js:202`；`petGeomSnapshot` 导出 = `:423`。

- **S1 的关键前置（否则必挂）**：`modeChosen:true` 且 `lastModeVersion` = 当前 app 版本 —— 否则 `shell-mode.js:103` 的 `dialog.showMessageBoxSync` 会**阻塞**在模态框上（同族：`main.js:145` 的后端失败对话框 ⇒ 启动失败时进程阻塞而非退出，故场景必须以**超时**判红并记录「无 captured 行 + 进程仍活」这条判别线索）。
- **进程回收**：场景结束杀**进程树**（Windows `taskkill /PID <pid> /T /F`；POSIX 进程组 `SIGTERM`）—— 不新增产品测试钩子（DD-A10）。
- **取证**：场景失败时保留 `.test-userdata-b16/` 与 `.test-dsh-home/`（已在 `.gitignore` 内）供事后读日志；成功后清理。
- **分批执行**：运行器支持 `--only S1|S2|S3`（开发期单场景回路）；默认顺序执行三场景。

##### A.2.2.5 假更新源契约（复用 `tests/update-stub.mjs`）

- 增**只读**查询参数 `?latest=<version>`（作用于 `/registry/npmmirror` 与 `/registry/npmjs`），缺省值 = 现状 `0.1.5-rc.1` ⇒ **对既有手测用法零行为变更**。
- 用法 / 端口（`node tests/update-stub.mjs [port]`）/ `/latest.json` 的 App 假版本（0.9.9 → dev 面不消费）/ `?fail=1` 源回退面 / `?tamper=1` / `?slow=1` **均不变**。
- 单一假源（不建第二桩，DD-A7）：集成层的 registry 与 manifest 两面都由本桩承载。

##### A.2.2.6 基线契约（`scripts/gates/baseline.json`）

**形态**（手写冻结档，**门禁永不自动写入**——自写基线的门禁 = 自证空洞）：

```json
{
  "asOf": "2026-09-18",
  "width":  { "docs/batches/B03-pet-multimonitor.md": 40, "docs/design/PET-MULTIMONITOR.md": 18 },
  "fanout": { "shell-tray.js": 10, "shell-ipc.js": 6, "shell-pet.js": 5, "shell-update.js": 5, "shell-window.js": 5, "shell-market.js": 4 },
  "cycles": 0,
  "assemblyExempt": [
    { "file": "shell-settings.js", "why": "工具档，无 init 导出（settings 载入/保存/访问器）" },
    { "file": "shell-ipc.js", "why": "以 register() 接线（通道→域处理器薄绑定），无 init" }
  ],
  "expires": {
    "width": "随 T13 消解路径逐档归零（活文档面随 B14 修正；批次档历史段随该档下次被合法动笔）⇒ 条目归零即删",
    "fanout": "随 T39 的归属批次（B17 代码优化串）把 6 档降到 ≤3 ⇒ 全部删除",
    "hardRule": "本机制不得用于冻结任何**新增**违规（新档违规一律红）"
  }
}
```

（**以上为节选**：`width` 块只列前 2 档，实际档数与逐档值见 A.2.2.2 现状；`fanout` 列全 6 档。实施首步按 R3 取**当日实测值**写入，**不得照抄本示例数字**。）

**判定规则（四条，可机检）**：

1. **新增即拦**：`现状值 > 冻结值` ⇒ 红；新档（不在冻结表中）出现违规 ⇒ 红。
2. **陈腐即红**：冻结条目在现状中已不复存在（超宽归零 / 出度 ≤3 / 免检档已获 `init`）⇒ 红，要求同步缩减条目（**防基线变永久豁免**；承「存量不是合法态」）。
3. **只减不增**：上调冻结值须在批次档登记理由与**新到期条件**（`git diff` 即留痕，评审可见）。
4. **到期条件逐条写死**（U-4 要求，见上 `expires`）——无到期条件的例外不得设；归零即删条目。

- **基线建档口径**：实施首步（A.2.2.1 步序 ②）跑判据取**当日实测值**写入 —— 本附节的现状数字是 **as-of 2026-09-18** 参考值；在飞批次（B19 / B20 / B23 / B24）落档可能移动这些值（例：`market.js` 现 500 行贴线）。

##### A.2.2.7 数据流（本批无 UI）

门禁的输入 = ① 磁盘档树（扫描面）② `baseline.json`（冻结值）③ 环境变量（层 / 场景 / 桩端口）；输出 = ① stdout 摘要行（A.2.2.1）② 退出码（0/1/2）③ 场景落盘物（`.test-userdata-b16/` 等）；消费方 = 人（本地）· CI（`gates.yml`）· **批次 §6 核销**（U-6 = 摘录三层摘要行）。
**多实现面（本地 / CI）约束**：命令**单源**于 `package.json` scripts，CI 只调用不复制 ⇒ 不存在两份命令文本的逐字一致问题（NFR-A4）。

#### A.2.3 受影响文件全清单（新建 13 · 修改 5 · 运行时代码改动 0）

**新建（13 档）**

| 文件 | 动作 | 预计行数 |
|---|---|---|
| `scripts/gates/lib.js` | 新建：扫描面发现（跳过清单唯一权威处）+ 判据工具 + 基线载入 + 摘要输出 | ≈120 |
| `scripts/gates/checks.js` | 新建：六条判据（A · B · C · D①②③）实现 | ≈230 |
| `scripts/gates/selftest.js` | 新建：判据边界 / 错误面夹具（A.3.2 的 TC 面） | ≈170 |
| `scripts/gates/run.js` | 新建：入口（自证 → 六条判据 → 摘要行 → 退出码） | ≈70 |
| `scripts/gates/baseline.json` | 新建：冻结基线 + 到期条件（形态见 A.2.2.6） | ≈50 |
| `scripts/test-run.js` | 新建：单元层运行器（档发现 + 层环境 + TAP 时长硬红 + 摘要行） | ≈120 |
| `scripts/test-integration.js` | 新建：集成层运行器（逐场景 spawn `electron` + `--only` + 摘要行） | ≈100 |
| `tests/layer.js` | 新建：`slow()` / `isFastLayer()` | ≈35 |
| `tests/integration/harness.js` | 新建：临时 userData / DSH_HOME + settings 种子 + 桩启停 + 里程碑等待 + 杀进程树 | ≈160 |
| `tests/integration/s1-app-start.scenario.js` | 新建：场景一 | ≈60 |
| `tests/integration/s2-pet-main-path.scenario.js` | 新建：场景二 | ≈120 |
| `tests/integration/s3-update-gate.scenario.js` | 新建：场景三（两子态） | ≈100 |
| `.github/workflows/gates.yml` | 新建：门禁 workflow（`windows-latest`；`push` + `pull_request` + `workflow_dispatch`） | ≈50 |

**修改（5 档——含 `package.json` 的排期争用）**

| 文件 | 现状 | 本批动作 | 预计增量 |
|---|---|---|---|
| `package.json` | **136** 行（scripts 12 项） | 增 `lint` / `test` / `test:full` / `test:integration` 四项（依赖块不动） | +6 行 → 142 · **实施须等 B19 / B20 让出** |
| `tests/b12-plugin-guards.test.js` | **491** 行（贴线） | `TC-82` 机械改标 `slow()` + 引入 `tests/layer.js`（**不重写正文**） | +2 行 → 493 · 拆分计划见下 |
| `tests/update-stub.mjs` | **91** 行 | 增 `?latest=<version>` 只读参数（缺省不变） | +8 行 → 99 |
| `docs/CONVENTIONS.md` | **175** 行 | §四 增三条结构判据句 + §五 的「升门禁句」行改为已落地 + 变更记录 1 行 | ≈+15 行 → **190**（**已落**，as-of 2026-09-18 实测；写权 = eng-designer，A.2.7 ① 已闭合） |
| `docs/design/REPO-CONVENTIONS.md` | **286** 行 | 本附节（A.1–A.3）+ 顶注 1 行 + §2.3 出批项 O3 注 1 行 + 变更记录 2 行（**已落**：**700** 行，as-of 2026-09-18 实测） | **+414** 行 → **700** |

**拆出档（贴线档 ≥480 行，规范档 §五 要求的必填面）**

- `tests/b12-plugin-guards.test.js`（491 → 493 行）**拆分计划**：按夹具三面拆为 `tests/b12/guards.test.js`（守卫面 / 穿越枚举）·
  `tests/b12/xss.test.js`（XSS + `vm` + DOM 桩）· `tests/b12/scan.test.js`（扫描面 + 计数器 + 黄金样本），共享夹具抽 `tests/b12/fixtures.js`。
  **行为零回退判据** = 拆分前后用例数 **19 不变** + 全绿 + 断言集逐条对应。**执行 = 另批**（本批只给计划，不把测试拆分混进基建批）。
- `market.js`（**恰 500** 行）· `updater.js`（497 行）本批**不触碰** ⇒ 无需计划（改它们时随批给）。

**运行时代码（本批零改动，判据面）**：`main.js`（249 行）· 15 档 `shell-*.js` · `pet*` 6 档 · `market*` 4 档 · `update*`/`updater.js` · `harness-store.js` · `update-lib.js` · 4 档 `*.html` · `package.json` 的 `build` 块 — 逐档 `git diff` 为空（NFR-A1）。

**出批（另批）项**

| # | 项 | 归属建议 | 判据 |
|---|---|---|---|
| O-A1 | **文件头三条判据机检**（规范档 §一 判据 ①②③） | 随 T25 迁移面（B17 代码优化串） | 判据 ② 为**宽口径**（「JSDoc 块在场 + 块内含路径的设计档指针」）⇒ 解析歧义率高，误报集中于 20 档迁移面；不在 §1.4-5 三条范围内（**不扩本批范围**） |
| O-A2 | 集成层**扩面**（托盘 / 插件市场 / 好感度 / 通知 / 首启模式弹窗） | 分期批（§1.4-3「分期扩面」） | 首发三场景之外的业务面；扩面须逐场景给判据 |
| O-A3 | CI 的 `paths` 过滤（docs-only 改动跳过集成层） | **用户裁定** | 会引入改动类盲区；本批取「不设过滤」= 简单 + 不漏判 |
| O-A4 | 集成层多场景**共享一次启动**（省时） | 视首次 CI 实测时长 | 现形态 = 逐场景独立（失败归因清晰）；时长成为负担再优化 |
| O-A5 | **行宽债清偿**（现状 92 行；T13 记 65 —— 计数漂移见 A.2.7 ⑤） | T13 / B14（主 agent） | 基线冻结 ≠ 清偿；到期条件见 A.2.2.6 |
| O-A6 | 测试**命名分域纪律**成文（`.test.js` vs `.scenario.js`） | 随 O-A1 同批入规范档 | 本批已实现，成文归规范档（本批不写规范档正文，见 A.2.7 ①） |

#### A.2.4 关键决策记录

| # | 决策 | 理由 | 否决备选 |
|---|---|---|---|
| DD-A1 | `lint` = **自研零依赖机检**（语法 + 形态 + 结构），不引 ESLint / Prettier | B11 §2.1.3 既定取舍（零依赖 + 保 `git blame`）；本批**不重开选型** | ESLint 生态 / 只语法检查 |
| DD-A2 | 单元层入口 = **自研运行器**封装 `node --test` | 一次解决：档发现（`node --test <目录>` 本仓**实测失败**）、层环境变量跨平台、>500 ms 硬红；零依赖 | 直用 glob / 第三方 runner |
| DD-A3 | CI = **新增 `gates.yml`**，不动 `build.yml` | 关切单一；发版路径（tags）与门禁（push/PR）分离，避免回归外溢 | 扩展 `build.yml` |
| DD-A4 | 集成驱动 = **混合**（S1/S3 外部观测 + S2 进程内） | S1/S3 覆盖组合根真接线 + 真后端；S2 在「不新增产品钩子」下无法确定性驱动光标 ⇒ 取几何 / 事件 / 落盘链路 | 全进程内 / 全外部观测 |
| DD-A5 | 慢测层 = `slow()` 标记 + 快层 skip | 承本仓既有口径（>500 ms 归 `slow()`）；标记随用例走 | 独立 `tests/slow/` 目录 |
| DD-A6 | 判据自证 = **内联 `--selftest` 夹具**（每次门禁跑） | 门禁是承重件，边界 / 错误面须**可回放且常驻**；独立测试档会落「单元测试默认退役」处置 ⇒ 证明面消失 | 独立 `tests/gates.test.js` / 不做自证 |
| DD-A7 | 假更新源 = **复用并扩展** `tests/update-stub.mjs` | D2：一个假源单一权威；扩展为只读参数、缺省不变 | 集成层自建第二桩 |
| DD-A8 | 结构判据基线 = **冻结 + 只拦新增**（U-4 ①）+ 到期条件 + 陈腐即红 | 增量可控、不挡当前批次；陈腐即红防永久豁免 | 门禁一立即全绿 |
| DD-A9 | 判据口径 = 行宽**不含行尾 CR** · 行数 = `\n` 计数 | 承 DD-7 与规范档 §五（防 CRLF 档误报；`market.js` 恰 500 的口径 = `\n` 计数） | 含 CR / 按显示行 |
| DD-A10 | **不新增产品测试钩子**；进程回收 = 杀进程树 | 「零业务行为变更」优先；杀树足以回收后端子进程 | 新增 `BIGFISH_TEST_QUIT_AFTER_MS` 类钩子 |
| DD-A11 | **不新增行宽豁免面**；**基线不是豁免面** | 承 DD-8（豁免须用户裁定）；基线 = 冻结台账 + 到期条件（可减可清） | 给生成档 / 锁档新增豁免 |
| DD-A12 | 集成场景后缀 `.scenario.js`（与 `.test.js` 分域） | 机检可判的域划分，杜绝 `test:full` 误收集成层 | 同用 `.test.js` + 目录排除（排除规则易腐） |
| DD-A13 | 三层门各自非零退即红 + 各出一行机器摘要 | §6 核销（U-6）与 CI 判读只需一行；三行 = 门禁全貌 | 只靠退出码（核销取证面缺失） |

#### A.2.5 边界（本设计不做的事）

- **不改任何运行时代码**：`main.js` / `shell-*` / `pet*` / `market*` / `updater.js` / `harness-store.js` / `update-lib.js` / `*.html` / `package.json` 的 `build` 块一律零改动（唯一 `package.json` 改动 = `scripts` 四项）。
- **不重构既有模块结构**：6 档 fan-out 违规与 92 行超宽**只冻结不清理**（U-4 ① + §1.4「不做」）。
- **不引入**第三方 linter / formatter / 测试框架；**零新增依赖**。
- **不做**文件头判据机检（O-A1）· **不做**发布流程（T5 / T7 / T8）· **不动** `build.files` 白名单面（除必要 `test` 脚本面）。
- **不覆盖**拖拽跟手面（S2 边界见 A.2.2.4）：真实光标不可确定性驱动 ⇒ 该面仍由 B03 桩测 + 真机目视承载（**如实声明，非静默省略**）。
- **不写**规范档正文 / `AGENTS.md` / 台账 / 地图（归属与父侧，见 A.2.7）。
- **不新增**行宽豁免面；**不把基线当豁免**。

#### A.2.6 UI / 交互决策

**N/A（本批无界面、无交互路径改动）** —— 显式声明，非遗漏：`git diff` 的运行时代码面为空；「交互」仅为 A.2.2.7 的门禁输入输出流，无 `open` 项。

#### A.2.7 待确认 / open

| # | 待确认 | 影响面 |
|---|---|---|
| ① | ~~规范档 `docs/CONVENTIONS.md` 的落笔归属~~ **已裁 / 已落（2026-09-18）**：写权 = eng-designer（`AGENTS.md` §一 写权矩阵）；§四 结构判据三条 + §五 门禁句 + 变更记录行已落（批次档 §2.8）。**判据句权威 = 规范档 §四 / §五**（本附节只留机检口径 + 回指，见 A.2.2.2） | 无（项已闭合） |
| ② | 本设计的落点 = **本档附 A**（照批次档 §1 头部指令）；若改判为独立档 `docs/design/TEST-GATES.md`（理由：主题 = 验证链、与 B11「规范载体」不同），A.1–A.3 整体平移、**零语义改动** | 本档顶注 + 地图 1 行（主 agent） |
| ③ | **CI 真绿为实机项**：本地无法证明 CI 上跑绿（需一次真实 push / PR） | AC-B16-5 的实机段；实施后由主 agent 触发核销 |
| ④ | **集成层在 CI runner 上的可跑性**（Electron GUI + 真后端 + 冷 runner 时长）同样为实机项；本机可跑 = 硬约束（§1.5-4），CI 面实施后首次验证 | 若 CI 不可跑 ⇒ 停下上报（不静默降级为「只本地跑」） |
| ⑤ | 台账 **T13** 记「非豁免面 65 行」（as-of B11），现状实测 **92 行** ⇒ 计数漂移，归 T13 / B14 对账（本批冻结值取现状） | 台账 T13 行（主 agent） |

### A.3 测试层

#### A.3.1 验收标准（逐条回指批次档 §1）

| # | 验收标准（回指 §1） | 判据（可机检） |
|---|---|---|
| AC-B16-1 | **`lint` 门在场且本地可跑**（§1.4-1） | `npm run lint` 退出 0 且 stdout 含 A.2.2.1 契约表的摘要行（B16 期 = `checks=6 selftest=14/14`；**B29 起 = `checks=7 selftest=20/20`**——串与契约表同源）；`package.json` scripts 的 `lint` = `node scripts/gates/run.js`（A.2.2.1 字面值表） |
| AC-B16-2 | **`test:full` = 收编后的统一入口**（§1.4-2） | `npm run test:full` 退出 0 且 TAP 摘要 `# pass 45` + `# fail 0` + `# skipped 0` |
| AC-B16-3 | **快层：慢测自动 skip**（§1.5-3） | `npm run test` 退出 0 且 `# skipped 1` + `# pass 44`（被 skip 者 = `TC-82`） |
| AC-B16-4 | **集成层三场景**（§1.4-3） | `npm run test:integration` 退出 0，stdout 含 `SCENARIO S1 PASS` / `SCENARIO S2 PASS` / `SCENARIO S3 PASS`（S3 含 a/b 两子态行） |
| AC-B16-5 | **CI 接线与本地同形**（§1.4-4 / §1.5-4） | `.github/workflows/gates.yml` 在场；三步命令合计 **3** 命中；含 `runs-on: windows-latest`；触发含 `push` / `pull_request`；档内**无**裸 `node --test` 命令（同形 = 只调 npm script）。**CI 真绿 = 实机项**（A.2.7 ③） |
| AC-B16-6 | **行宽 / 行数判据落地**（§1.4-5 ① / **T26**） | `npm run lint` 输出 `CHECK width PASS` 与 `CHECK lines PASS`；selftest 的边界 / 错误面（A.3.2 TC-B16-01…08）全绿 |
| AC-B16-7 | **结构判据 D①② 落地**（§1.4-5 ③ / **T39**） | `npm run lint` 输出 `CHECK dag PASS (cycles=0)` 与 `CHECK fanout PASS`；selftest 的注入面（TC-B16-09…14）全绿 |
| AC-B16-8 | **组装面接线点唯一**（§1.4-5 ② / **T37**） | `npm run lint` 输出 `CHECK assembly PASS (13/13)`；selftest 的「删一处 `init(` ⇒ 红」「双调用 ⇒ 红」「未解析形态 ⇒ 红」（TC-B16-11）全绿 |
| AC-B16-9 | **禁散文锚**（§1.5-5） | 新增档的断言面在 A.3.2 逐条标注（行为面 / 结构面）；**禁止形态（收窄为可判）= 新增档内「读 `docs/**` 或源码正文（`.js` / `.mjs` / `.html`）+ 子串断言」0 处** —— 判据 = 逐档核 `readFileSync` 等读取调用的目标路径，0 处指向 `docs/**` 或源码正文即过（命中即红）；**行为面断言不在禁止面内**（进程退出码 / 产品自身落盘物与诊断日志行 / fs 结果属**允许面**，承 A.2.2.3 断言面纪律） |
| AC-B16-10 | **零业务行为变更**（§1.5-1） | 运行时代码面 `git status --porcelain` 为空（白名单 = A.2.3 的修改 5 档）；既有 45 用例全绿；`SCENARIO S1` / `S2` PASS |
| AC-B16-11 | **零新增依赖**（§1.5-4） | `git diff package.json` 只含 `scripts` 块（依赖块零 diff） |
| AC-B16-12 | **本批自身形态合规**（§1.5-6） | 判据 B/C 扫本批新增 / 修改档 ⇒ **0 新增违规**（门禁扫自己）；新增 `.js` 档第 1 行 = `'use strict';` 且 JSDoc 含 `docs/design/REPO-CONVENTIONS.md §`（规范档 §一 三条判据） |

#### A.3.2 用例表（正常 / 边界 / 错误 —— 输入 / 期望输出 / 映射）

| # | 类型 | 输入 | 期望输出 | 断言面 | 映射 |
|---|---|---|---|---|---|
| TC-B16-01 | 正常 | 判据 B：恰 300 字符行（去 CR 后） | 判合规（**不**报超宽） | 结构面 | AC-B16-6 |
| TC-B16-02 | 错误 | 判据 B：301 字符行（非基线档） | 判红（点名档 + 行号） | 结构面 | AC-B16-6 |
| TC-B16-03 | 边界 | 判据 B：CRLF 档「300 字符 + `\r`」 | 判合规（去 CR 后 300） | 结构面 | AC-B16-6 |
| TC-B16-04 | 边界 | 判据 B：台账表格行 400 字符 | 判**豁免**（不计入） | 结构面 | AC-B16-6 |
| TC-B16-05 | 边界 | 判据 B：批次档 §3 段内 400 字符 vs §2 段内 400 字符 | §3 豁免；§2 计入 | 结构面 | AC-B16-6 |
| TC-B16-06 | 错误 | 判据 B：临时新增档含 2 行超宽（不在基线） | 判红（「新增即拦」） | 结构面 | AC-B16-6 |
| TC-B16-07 | 边界 | 判据 C：恰 500 行 / 501 行 | 500 合规；501 红 | 结构面 | AC-B16-6 |
| TC-B16-08 | 边界 | 判据 C：480 行 | 提示行（**不**判红） | 结构面 | AC-B16-6 |
| TC-B16-09 | 错误 | 判据 D①：夹具内 A↔B 互 require | 判红（报环路径）；真实仓库 ⇒ 0 环绿 | 结构面 | AC-B16-7 |
| TC-B16-10 | 错误 | 判据 D②：新档出度 4 | 判红；基线档出度 = 冻结值 ⇒ 绿 | 结构面 | AC-B16-7 |
| TC-B16-11 | 错误 | 判据 D③：① 删一处 `init(` ② 同档双调用 ③ `const { init } = require(…)` 形态 | 三者均判红；① 点名该档（T37 面）③ = fail-closed | 结构面 | AC-B16-8 |
| TC-B16-12 | 正常 | 判据 D③：真实 `main.js` | `13/13` 恰一处 ⇒ 绿 | 结构面 | AC-B16-8 |
| TC-B16-13 | 错误 | 基线**陈腐**：夹具中基线条目对应的违规已清零而未缩减条目 | 判红（要求缩减基线） | 结构面 | AC-B16-6 / 7 |
| TC-B16-14 | 错误 | 基线**上调**：冻结值 < 现状值 | 判红（只减不增） | 结构面 | AC-B16-6 / 7 |
| TC-B16-15 | 正常 | 慢测层：`npm run test` / `npm run test:full` | 前者 `skipped 1`、后者 45 全跑（含 `TC-82`） | 行为面 | AC-B16-3 |
| TC-B16-16 | 错误 | 硬红：某快用例注入 600 ms 等待且未标 `slow()` | 层红 + `SLOW-UNREGISTERED` 行 | 行为面 | AC-B16-3 |
| TC-B16-17 | 正常 | S1：真启动（种子 settings 如 A.2.2.4） | 日志出现 `backend web url captured port=<数字>` + 进程存活 ⇒ PASS | 行为面 | AC-B16-4 |
| TC-B16-18 | 错误 | S1：`DSH_NODE` 指向不存在的可执行 | 无 captured 行 ⇒ 超时 ⇒ FAIL（并留「失败对话框阻塞」线索） | 行为面 | AC-B16-4 |
| TC-B16-19 | 正常 | S2：建窗 + `handleDisplayChange('metrics', …)` | `geom tag=start` / `geom tag=display` 在场 + `petPos` = 窗口位置（±1 DIP）+ 中心点 ∈ `workArea` | 行为面 | AC-B16-4 |
| TC-B16-20 | 错误 | S2：注入「落盘被跳过」（夹具档隔离的写面） | 判 FAIL（落盘判据不成立） | 行为面 | AC-B16-4 |
| TC-B16-21 | 正常 | S3-a：registry `?latest=0.1.5-rc.1` | `face=app skipped=dev` + `type=harness result=up-to-date` + 无 `result=error` | 行为面 | AC-B16-4 |
| TC-B16-22 | 正常 | S3-b：registry `?latest=0.1.9` | `type=harness result=update-available latest=0.1.9` + **无** `harness install phase=` | 行为面 | AC-B16-4 |
| TC-B16-23 | 错误 | S3：桩未启动 / 端口被占 | 判 FAIL（**不得**静默跳过或回退外网） | 行为面 | AC-B16-4 / NFR-A3 |
| TC-B16-24 | 正常 | AC-B16-5 同形判据：`grep` `gates.yml` | 三步命令 3 命中 + 无裸命令 | 结构面 | AC-B16-5 |

- **N/A 声明**：本批 **UI / 交互用例 = 无**（A.2.6）；集成层无「正常/边界/错误」三分法之外的面（场景即用例）。
- **单价时长**：判据 A–D + 自证 <2 s；单元层 1.2 s；集成层 ≈3 次真启动 + 1 次进程内（本机量级分钟级）。

### 附 A-续 —— B29 面：`samples/` 解耦判据（E）与定位收口（B29 批次修订）

> 本续节 = **B29 批次**（`samples/` 解耦守卫 + 定位收口）的完整设计（需求层 / 设计层 / 测试层）。
> 回指批次档 `docs/batches/B29-samples-guard.md` §1；**B16 面 = A.1–A.3**（测试分层与门禁），其节号与指针零改动（本续节编号 A-B29.x 独立）。
> B16 面中随本批**修订**的五处（A.2.2.1 契约表 · A.2.2.2 判据表 / 扫描面行 / F1 覆盖面 · A.3.1 AC-B16-1 判据串）= 活契约修订，变更记录已注记。
> 需求来源 = 批次档 §1（**工程/流程类需求，本仓无对应需求档**——依 B11 / B16 先例）；三方同源 = §1.4「做」三项 + §1.5 硬约束。
> 现状实测（as-of 2026-09-19，逐档 grep 按 **E① 扫描面口径**——非文档档 − `scripts/gates/**` − `.gitignore` − `package.json`）：扫描面内含 `samples` 字面量的档 = **0 处**；命中仅在排除面 = `scripts/gates/lib.js:18`（跳过清单条目，守卫自身）+ `.gitignore:26`（忽略声明自身）。枚举仅为示例口径——实施首跑若出现枚举面外新档命中，以判据实际输出为准（非锚漂移）；
> `package.json` 的 `build.files`（`:45-92`）/ `extraResources`（`:93-106`，行锚 = **实测核值**，as-of 2026-09-19 读档核对一致）零登记 `samples`；`samples/` 现 1 项（`dsh-pet`），目录在跳过清单（`lib.js:18`）⇒ 扫描面永不读样本档。

#### A-B29.1 需求层

##### A-B29.1.1 总体需求

为**接手本仓的人与 AI 代理**解决一个具体问题：`samples/` = 外部项目样本区，其「完全解耦」（不引用 / 不构建 / 不入仓）目前只是口头约定 + 人眼巡查——**无任何机检句**（批次档 §1.3 缺口实测）。本批把约定**变成判据**（机检随 CI 生效），并补上可读的定位文档；**零样本写入、零业务行为变更**。

##### A-B29.1.2 功能性需求（逐条 = 批次档 §1.4 的「做」三项）

| # | 需求（回指 §1.4） | 范围边界（明确不做什么） |
|---|---|---|
| F1 | **门禁新判据 E**（§1.4-①）：引用面零命中（E①）+ 打包白名单零登记（E②）；违规 ⇒ 红 + 自检用例 | 不引入样本内容（零样本写入）；**不改 `build.files` 白名单现行内容**（只加「不得登记 `samples`」判据）；判据严格性 = **零命中**（非基线冻结） |
| F2 | **定位文档**（§1.4-②）：`samples/` 是什么 / 怎么加样本 / 移植怎么走四步流程（落点 = U-1 裁定） | 不做移植本体（R15 已收口 A 面 ✓；后续另立需求点）；文档必须在仓内（样本区不入仓 ⇒ 不可放 `samples/` 内） |
| F3 | **地图 / 台账指针同步**（§1.4-③，主 agent 面） | 本设计者只给建议行；台账 / 地图写权 = 主 agent |

##### A-B29.1.3 非功能性需求

| # | 约束 | 度量方式 |
|---|---|---|
| NFR-B29-1 | **零样本写入**（§1.5-1） | 改动面不含 `samples/**`；`samples/` 现 1 项不变；守卫与文档的对象 = 规则，不是样本 |
| NFR-B29-2 | **判据进既有骨架**（§1.5-2） | 判据 E 落在 `scripts/gates/**`（checks.js / run.js / selftest.js），随 `npm run lint` 与 CI 生效；本地与 CI 同源（承 NFR-A4） |
| NFR-B29-3 | **零业务行为变更** | 运行时代码面 `git diff` 为空；`package.json` 零 diff（E② 只读） |
| NFR-B29-4 | **规则句可机检**（承 B11 NFR-3） | 每条验收标准给出可执行命令（A-B29.3.1） |
| NFR-B29-5 | 单一权威源（D2） | 判据句权威 = `docs/CONVENTIONS.md` §四；机检实现面 = 本附节；定位文档 = `docs/SAMPLES.md`；地图只留落点行 |

##### A-B29.1.4 回指

- 验收标准 = A-B29.3.1 的 **AC-B29-1…AC-B29-7**，逐条回指批次档 §1.4（F1–F3）与 §1.5（硬约束 1–3）。
- 台账承载：**R14**（样本区落位——本批 = 其「守卫 + 定位」余项；销账条件 = §1.7）。
- 需求档：无新增（工程/流程类，§1.7）。

#### A-B29.2 设计层

##### A-B29.2.1 方案选型对比（判据来自 A-B29.1；被否决候选逐条写否决理由）

**组 1 — U-2 判据挂法（候选 3）**

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **新增第七判据 E**（`samples-guard`，独立函数 + 独立摘要行） | 覆盖面独立（全仓引用面 + 打包白名单——与 A–D 任何一条不重叠）；判据句独立（依赖方向面）；**零命中恒判**（现状零命中 ⇒ 无需基线，硬约束 §1.5-2）；自证夹具独立；对既有面的侵入 = 摘要行计数 + 契约表 1 行 | 代价：`run.js` / `selftest.js` / `checks.js` 三档改动 + 计数同步（checks 6→7 · selftest 14→20） | **选定** |
| 2 | 并入 **D③ assembly** | D③ 覆盖面 = **组合根绑定面**（`main.js` 15 条绑定）——samples 引用可出现在**任意档**，覆盖面不匹配；判据对象 = `init` 接线唯一，与「解耦引用」是两类语义；合并使 `CHECK assembly PASS (13/13)` 摘要语义混装、归因面变差 | — | **否决** |
| 3 | 并入 **D① / D②** | **功能不可行**：`samples/` 在跳过清单（`lib.js:18`）⇒ `require('./samples/x')` 解析不到扫描面内档 ⇒ 不产边 ⇒ D①（环）/ D②（扇出）**天然漏判**；且 D② 只数域模块出度，`package.json` 白名单面无处承载 | — | **否决** |

**组 2 — U-1 定位文档落点（候选 5；硬约束 = 须在 `docs/**` 内）**

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **新档 `docs/SAMPLES.md`**（docs/ 顶层定位档） | 发现路径 = 地图一行（与规范档 `docs/CONVENTIONS.md` 同族先例）；单档承载三问（是什么 / 怎么加样本 / 移植四步流程）；不侵入既有档结构契约（规范档九节前缀机检固定 / 地图索引面）；写权 = eng-designer（同族先例——写权矩阵补半行） | 代价：地图 +1 行（主 agent）、写权矩阵补半行（实施轮） | **选定** |
| 2 | 并入 `docs/design/REPO-CONVENTIONS.md` 附 B | 免新档类；但定位档是**指南**不是**设计记录**——本档已 701 行（B16 面 414 行增量先例），混入指南面层不符；发现路径弱（人不会去设计档找「怎么加样本」） | — | **否决** |
| 3 | 并入 `docs/CONVENTIONS.md` 新节 | 结构契约 = 九节标题**前缀机检固定**（§2.2.3）⇒ 加第十节破契约；且样本定位**非代码形态** | — | **否决** |
| 4 | `docs/README.md` 新节详述 | 写权 = 主 agent（本设计者不可写）；地图 = **索引面**（D2 只引用不重述）——详述放地图违反「地图只留指针」 | — | **否决** |
| 5 | `samples/README.md` / 根 `README.md` / `版本说明.txt` / `THIRD-PARTY-NOTICES.md` | 硬约束 ✗：样本区不入仓 ⇒ 文档必须在仓内（`samples/` 内不可）；根三档 = **B27 冻结面**（依据 = B27 批次档 `docs/batches/B27-pet-feel-2.md` §2.3 零改动面 15 档，含此三档） | — | **否决** |

##### A-B29.2.2 契约与结构

**判据 E（samples-guard）契约**

| 面 | 判据句（权威 = `docs/CONVENTIONS.md` §四，B29 实施轮落笔） | 机检口径（本附节 = 机检实现面） | 机检方式 |
|---|---|---|---|
| E① 引用面 | 全仓代码面不得出现指向 `samples/` 的引用 | 扫描面 = 门禁扫描面内**非文档档**（排除 `.md` / `.txt`——规则与定位的声明面）− `scripts/gates/**`（守卫自身 = 判据载体）− `.gitignore`（忽略声明自身）− **`package.json`**（归 E② 独占——该档 `samples` 字面量属打包白名单判据面，E① 再判 = 同键双报、红面计数失真）；检测三式（细则见下条） | `checkSamples(files, root)` 逐档逐行正则 |
| E② 打包白名单 | `package.json` 的 `build.files` / `extraResources` 零登记 `samples` | `JSON.parse(root/package.json)`；`build.files` 每条目与 `extraResources` 每 `from` / `to` 做子串 `samples` 判；命中 ⇒ 判据红（退出 1），点名键与条目；错误面（缺档 / 解析失败 / 非预期条目形态）⇒ fail-closed（退出 2）——细则见下条 | 同上函数 |

- **检测三式（E①）**：① **路径形态** `samples/` · `samples\`（含 `require('./samples/…')`）② **引号形态** `'samples'` / `"samples"`（紧贴包裹的裸段——`path.join(…, 'samples', …)`）③ **末段形态**：引号 / 反引号包裹且路径末段 = `samples`（收 `require('./samples')` / `'../samples'` / `./samples`）——命中即红，点名档:行，同一行多式只记一次。
- **反引号末段转义口径（代码轮 🔵）**：式②③ 反引号内容类排除反斜杠（反斜杠 = 转义起始）——含反斜杠的反引号段**不判**（式① 路径形态不受此限）；理由 = 单反斜杠形态运行时吞掉转义（`` `C:\samples` `` ⇒ 运行时 `C:samples`，不指向 `samples/`）；`\\` 转义形态（`` `C:\\samples` `` ⇒ 运行时 `C:\samples`）为残留边界——本批不收，随下次自证面扩展一并收口。
- **② ⊆ ③ 口径**：`'samples'` 即「末段 = 全串」特例；列两式仅为判据句可读性——实施可合并为一条正则（引号 / 反引号包裹 + 末段 = `samples`），合并即 ②③ 恒同判、无口径差。
- **E① 引号形态保留裁定（open ① 已闭合，评审轮 1 #1）**：引号 / 反引号形态**保留**——`path.join(…, 'samples', …)` 与 `require('./samples')` 是真实引用形态，只判路径形态 = 漏判即守卫空心。
- **E② 错误面闭环（退出码写死，评审轮 1 #3）**：`pkg-unreadable`（缺档 / `JSON.parse` 失败）与 `pkg-shape`（`build` 非对象（字符串 / 数组等）· `build.files` 对象式 FileSet / `extraResources` 纯字符串等非预期条目形态——检测器无法对其做子串判定，不得按「未命中」静默放行）⇒ **fail-closed 退出 2**（承 A.2.2.1「解析异常一律 2 / 门禁自身无法完成」）；`ref` / `pkg-build` / `pkg-extra` ⇒ 判据红退出 1。
- **严格性 = 零命中恒判**（硬约束 §1.5-2）：现状 = 零命中 ⇒ **不入 `baseline.json`、不冻结、无到期条件**——任何命中（含存量）即红。
- **判据句单一权威源（D2）**：判据句权威 = `docs/CONVENTIONS.md` §四（B29 实施轮落笔，建议句见下）；本附节只承载机检口径，不复述判据句。
- **与既有六判据的关系**：A–D 与 E 覆盖面 / 判据对象零重叠；`require('./samples/…')` 因跳过清单解析不到扫描面内档 ⇒ D①②③ 对样本引用**天然漏判**——正是 E 独立存在的原因（组 1 候选 3 的否决理由）。
- **守卫自身豁免的判据句**（E① 排除 `scripts/gates/**`）：守卫是**判据载体**——其源码必然承载 `samples` 字面量（跳过清单条目 + 判据正则 + 自证夹具构造的违规面）；豁免 = 覆盖面口径（同 D② 排除 `tests/` · `scripts/` 的域口径先例），**非**存量豁免、**非**基线冻结。
- **变量名不误报**：裸标识符 `const samples = …`（无路径分隔符、无引号包裹）**不判**——检测只认路径 / 引号 / 末段三形态（TC-B29-05 钉死该边界）。
- **摘要行（机器可 grep）**：`CHECK samples PASS refs=0 pkg=0`；红面 = `CHECK samples FAIL refs=<n> pkg=<m>` + 逐条 `VIOLATION samples <kind> <档>:<行> :: <内容>`（kind = `ref` / `pkg-build` / `pkg-extra` / `pkg-unreadable` / `pkg-shape`；前 3 判据红 = 退出 1，后 2 fail-closed = 退出 2——细则见上条）。
- **run.js 契约变更**：判据块按 A–E 顺序跑（E 在 D③ 之后）；`checkCount` 6 → **7**；摘要行分母**动态化**（`selftest=${self.passed}/${self.total}`——`runSelftest` 返回值增 `total`；判据数增长时不再同步改 run.js 两处 + 设计档判据串，DD-A18）。
- **自证面（TC-B29-01…06，结构面）**：沿用 A.2.2.2 夹具隔离面（`os.tmpdir()` 临时档树 + `try/finally` 清理；夹具根永不在扫描面内）——夹具可自由构造含 `samples` 字面量的违规档（守卫自身在 E① 扫描面外，无需字符串拼接规避）；夹具树须自带最小 `package.json`（除 TC-B29-04 故意缺档外——E② 对缺档 fail-closed）。**自证 TC 集固定 6 例**——`pkg-shape` 无自证例（TC-B29-04 只覆盖 `pkg-unreadable`），该例随下次自证面扩展补入、本批不改。
- **锚红分流（TC-B29-06 现状锚 · 代码轮撞出的契约缝）**：现状锚常驻自证 ⇒ 仓内注入先被自证层拦截；分流条件 = `liveAnchorOnly && failures.length === 1` ⇒ **仅锚红**（failures 恰 1 条）时落入 E 判据块**按判据码**报告（判据红 = 退 1 + `VIOLATION samples`；fail-closed 面仍退 2）；`SELFTEST-FAIL` 行仍打印、不静默；**混合失败**（锚红 + 其他夹具例同红）与**锚红未确认**（E 复检未见）一律退 2——偏保守：不确定即 2。

**B16 面随本批修订的五处（活契约修订）**：

1. A.2.2.1 契约表 ① 行：`checks=6 selftest=14/14` → **`checks=7 selftest=20/20`**（已改）。
2. A.2.2.2 判据表：题头六条 → **七条**，增 E 行（已改）。
3. A.2.2.2 扫描面行：「**六条**判据共用」→「**七条**判据共用」（已改——E 共用同一扫描面，仅再加两条排除面；评审轮 1 #5 补入清单）。
4. A.2.2.2 「F1 覆盖面」行：六条 → **七条**、`checks=6` → **`checks=7`**（已改）。
5. A.3.1 AC-B16-1 判据串：加「B29 起 = checks=7 selftest=20/20」注记（已改；B16 期串保留为历史面）。

**实施轮建议句（机械落笔面）**：

- `docs/CONVENTIONS.md` §四：表头注「结构判据三条」→「结构判据三条 + 样本解耦判据一条（E）」；表增一行，判据 = `E`、判据句 = 「全仓代码面不得出现指向 `samples/` 的引用（路径形态 `samples/` · `samples\`、引号形态 `'samples'` / `"samples"`、末段形态 `'…/samples'` 等三式）；`package.json` 的 `build.files` / `extraResources` 零登记 `samples`」。
- 同上行口径与免检 = 「扫描面 = 扫描面内非文档档 − `scripts/gates/**` − `.gitignore` − `package.json`；严格性 = 零命中恒判（现状零命中 ⇒ 不设基线，任何命中即红）；机检口径 → 本设计档附 A-续 §A-B29.2.2」；变更记录 +1 行。`AGENTS.md`：§三「六判据」→「七判据」；写权矩阵第一行补「定位档 `docs/SAMPLES.md`」；变更记录 +1 行。

**定位文档内容契约（`docs/SAMPLES.md`，实施轮 eng-designer 落笔；目标 ≈60–80 行）**：

- 头部：`# SAMPLES —— 外部样本区定位（Bigfish）` + 读者行（接手本仓的人与 AI 代理）+ as-of。
- **一、是什么（完全解耦三条）**：`samples/` = 外部项目样本 / 移植参考区，**非交付物**（git-ignored；第三方代码不入仓历史——许可与污染面）。三条铁律（机检承载，指针 → `docs/CONVENTIONS.md` §四 + 本附节 A-B29.2.2）：① 不被任何代码引用（判据 E①）② 不参与构建 / 不打进发行版（判据 E② + `build.files` / `extraResources` 白名单制——不登记即天然排除）③ 第三方代码不入仓历史（`.gitignore` 声明面）。
- **二、怎么加样本**：顶层 `samples/<项目名>/` 直放他人项目；许可面注意（他人代码的许可证不随本仓分发）；不修改仓内档去适配样本（完全解耦 = 双向不引用）。
- **三、移植怎么走四步流程**：与一切需求同链——登记需求点（台账）→ 立案（批次档 §1）→ 设计评审 + 用户批准 → 实施 + 测试 + §6 核销。先例：R14（样本区落位）· R15（动画链移植 A 面，B18 已收口）。
- 变更记录：一行注记。

**数据流（本批无 UI）**：判据 E 的输入 = ① 磁盘档树（扫描面）② `root/package.json`；输出 = ① `CHECK samples` 摘要行 ② 退出码（0/1/2——门禁契约不变）。消费方 = 人（本地）· CI（`gates.yml` 零改动——只调 npm script）· 批次 §6 核销。

##### A-B29.2.3 受影响文件全清单（修改 3 · 新建 1 · 既有文档修订 3 · 运行时代码改动 0）

| 文件 | 现状（行数，as-of 2026-09-19） | 本批动作 | 预计增量 | 写权（实施轮） |
|---|---|---|---|---|
| `scripts/gates/checks.js` | **261** 行 | 增 `checkSamples(files, root)`（E①/E② + fail-closed） | +≈75 → ≈336 | eng-coder |
| `scripts/gates/run.js` | **122** 行 | 增 E 判据块 + `checkCount=7` + selftest 分母动态化 | +≈14 → ≈136 | eng-coder |
| `scripts/gates/selftest.js` | **260** 行 | 增 `samplesFixture` + TC-B29-01…06 六例 | +≈85 → ≈345 | eng-coder |
| `scripts/gates/lib.js` | **177** 行 | **0**（跳过清单已含 `samples`——口径不变；检测逻辑归 checks.js） | 0 | — |
| `scripts/gates/baseline.json` | **38** 行 | **0**（E = 零命中恒判，不入基线） | 0 | — |
| `docs/SAMPLES.md` | 不存在 | 新建（U-1 选定落点；内容契约见 A-B29.2.2） | ≈70 | eng-designer |
| `docs/CONVENTIONS.md` | **191** 行 | §四 增 E 判据句行 + 表头注记 + 变更记录 1 行 | +≈6 → ≈197 | eng-designer |
| `AGENTS.md` | **67** 行 | §三「六判据」→「七判据」+ 写权矩阵补定位档 + 变更记录 1 行 | +≈4 → ≈71 | eng-designer |
| `docs/README.md` | **98** 行 | §一 落点行 + §二 当前文档行（建议行见下） | +2 → ≈100 | 主 agent |
| `docs/design/REPO-CONVENTIONS.md` | **701** 行 | 本续节 + 四处活契约修订 + 变更记录 1 行（本设计轮已落） | +191 → **892** | eng-designer（本设计轮） |
| `package.json` / 运行时代码 / `samples/**` / `.github/**` | — | **零改动**（E② 只读 `package.json`；`gates.yml` 只调 npm script，判据面变化透明生效） | 0 | — |

**主 agent 建议行（本设计者不落）**：

- 地图 §一 落点约定增：`| 定位档（外部样本区） | docs/SAMPLES.md | samples/ 是什么 · 怎么加样本 · 移植怎么走四步流程（完全解耦三条的详述处；机检判据句 → docs/CONVENTIONS.md §四） |`
- 地图 §二 当前文档增：`| docs/SAMPLES.md | 定位档 | 生效（B29 落档） | 外部样本区定位三问：是什么（完全解耦）/ 怎么加样本 / 移植四步流程 |`
- 台账 R14 行：销账 = 判据机检生效 + 定位文档落档 + 地图/台账指针（§6 核销时同步）。

**步序契约（实施轮）**：① `checks.js`（checkSamples）→ ② `selftest.js`（六例）→ ③ `run.js`（E 块 + 计数）→ ④ 本地 `npm run lint` 取证 + **红面双向实测**（AC-B29-2/3 注入与移除）→ ⑤ eng-designer 微轮落 `docs/SAMPLES.md` + `docs/CONVENTIONS.md` §四 + `AGENTS.md` 两处 → ⑥ 主 agent 落地图两行 → ⑦ 三条门全绿 + 批次 §5/§6 收口。

**贴线档拆分计划：无**——改动档均 <480 行（`checks.js` ≈336 · `selftest.js` ≈345）；本设计档为 `.md`（行数判据只适用于 `.js` / `.mjs`，判据 C 口径）。
**300 档结论（评审轮 1 #4）**：`checks.js`（261 → ≈336）与 `selftest.js`（260 → ≈345）跨 300 行但**无需拆分**——职责单一（checks = 判据实现面；selftest = 自证夹具面，无混面）+ 本批增量为**纯函数增量**（`checkSamples` / `samplesFixture`，不引入新职责面）+ 无新档面；行数唯一口径 = 判据 C（480 提示 / 500 上限，回指 `docs/CONVENTIONS.md` §五），拆分只会切碎单一职责 ⇒ 维持单档。

##### A-B29.2.4 关键决策记录

| # | 决策 | 理由 | 否决备选 |
|---|---|---|---|
| DD-A14 | 判据挂法 = **新增第七判据 E**（独立函数 / 摘要行 / 自证） | 覆盖面与语义与 A–D 全部不重叠；并入 D①/D② **功能不可行**（跳过清单使引用不产边）；并入 D③ 覆盖面 = 组合根绑定面不匹配（组 1 对比表） | 并入 D③ / 并入 D①·D② |
| DD-A15 | E = **零命中恒判**（不入基线、不冻结、无到期条件） | 硬约束 §1.5-2「零命中而非基线冻结」；现状零命中 ⇒ 无存量面 | 基线冻结 + 只拦新增 |
| DD-A16 | E① 扫描面 = 非文档档 − `scripts/gates/**` − `.gitignore` − `package.json` | 守卫自身 = 判据载体（须承载判据句与自证夹具的 `samples` 字面量）；文档面 = 声明面非引用面；`package.json` 归 E② 独占（防同键双报）；同 D② 域口径先例（覆盖面口径，非豁免面） | 扫描守卫自身 / 排除全 `scripts/` / E① 也扫 `package.json` |
| DD-A17 | E① 检测 = 路径 + 引号 + 末段三式（评审轮 1 #1 补第三式） | 覆盖 `require` / 路径拼接 / 裸段引用 + 末段形态（`require('./samples')`）；裸标识符不判（防变量名误报） | 只判路径形态（漏 `join('samples', …)` 与 `require('./samples')`）/ 全子串判（变量名误报） |
| DD-A18 | selftest 摘要分母**动态化**（`passed/total`） | 判据增长时不再同步改 run.js 两处 + 设计档判据串 | 保持硬编码（计数漂移面） |
| DD-A19 | 定位文档 = **新档 `docs/SAMPLES.md`**；写权 = eng-designer | 组 2 对比表：层契合（指南 ≠ 设计记录 / 代码形态 / 索引）+ 发现路径 + 规范档同族先例 | 附 B / 规范档新节 / 地图详述 / 根三档（冻结面 ✗） |

##### A-B29.2.5 边界（本设计不做的事）

- **不引入样本内容**（零样本写入）；不改 `build.files` / `extraResources` 白名单现行内容（只加判据）；不改 `package.json` 任何块（E② 只读）。
- **不做移植本体**（R15 已收口 A 面；后续另立需求点）；不搬任何档进 / 出 `samples/`。
- **不碰** `README.md` / `版本说明.txt` / `THIRD-PARTY-NOTICES.md`（B27 冻结面 ✗——依据 = B27 批次档 §2.3 零改动面 15 档，含此三档）；不写台账 / 地图 / `CHANGELOG.md`（主 agent 面，只给建议行）。
- **本设计轮不落** `docs/SAMPLES.md` / `docs/CONVENTIONS.md` / `AGENTS.md` 正文（批次档 §2 硬约束 = 只写本设计档 + §2；三档随实施轮落笔）。
- **不新增行宽豁免面**；判据 E 不新增基线条目；不改 `gates.yml`。

##### A-B29.2.6 UI / 交互决策

**N/A（本批无界面、无交互路径改动）**——显式声明，非遗漏：运行时代码面零改动；「交互」仅为 A-B29.2.2 的判据输入输出流，无 `open` 项。

##### A-B29.2.7 待确认 / open

| # | 待确认 | 影响面 |
|---|---|---|
| ① | ~~E① 的引号形态是否保留~~ **已裁（修正轮 1，评审轮 1 #1）**：引号 / 反引号形态**保留**——`path.join(…, 'samples', …)` / `require('./samples')` 是真实引用形态，漏判即守卫空心；并补**末段形态**（第三式）收 `require('./samples')` / `'../samples'` 类缝（见 §A-B29.2.2 检测三式） | 无（项已闭合；②③ 待 §4 / B25 面） |
| ② | 写权矩阵「定位档 = eng-designer」为**新增半行**（DD-A19） | `AGENTS.md` 写权矩阵行（实施轮落；若被否，改为「主 agent 内容权 + eng-designer 落笔」） |
| ③ | 定位文档是否需要在 `docs/design/ARCHITECTURE.md`（B25 面）留指针 | B25 在途（设计待派）——本批不碰；建议随 B25 设计面定，不在本批范围 |

#### A-B29.3 测试层

##### A-B29.3.1 验收标准（逐条回指批次档 §1）

| # | 验收标准（回指 §1） | 判据（可机检） |
|---|---|---|
| AC-B29-1 | **判据 E 落地为第七判据**（§1.4-① / §1.5-2） | `npm run lint` 退出 0 且 stdout 含 `CHECK samples PASS refs=0 pkg=0` 与 `GATE lint PASS checks=7 selftest=20/20`（串 = A.2.2.1 契约表，二者同源） |
| AC-B29-2 | **引用面零命中 + 红面实测（双向）**（§1.4-①） | 现状：E① 扫描面（非文档档 − `scripts/gates/**` − `.gitignore` − `package.json`）内命中 = **0 处**（实测 as-of 2026-09-19；锚口径见顶注）；临时在仓内代码档注入 `require('./samples/x.js')`（路径 / 引号 / 末段任一样式均可）⇒ `npm run lint` 退出 1 + `VIOLATION samples ref <档>:<行>`；移除后退出 0（注入/移除为临时操作，不落提交） |
| AC-B29-3 | **打包白名单零登记 + 红面实测**（§1.4-①） | 现状：`build.files` / `extraResources` 零登记 `samples`（实测 as-of 2026-09-19）；红面计数 = **逐 kind 列全**：注入 `build.files` 的 `"samples/x"` ⇒ 退出 1 + `VIOLATION samples pkg-build`（E② 独占该档 ⇒ 无 `ref` 双报）；同时注入 `extraResources` ⇒ 再 +1 条 `pkg-extra`；移除后退出 0 |
| AC-B29-4 | **自证常驻**（§1.5-2） | `npm run lint` 每次跑 E 面 6 例（TC-B29-01…06）全绿（`selftest=20/20`） |
| AC-B29-5 | **定位文档落档**（§1.4-②） | `test -f docs/SAMPLES.md` 且含三问标题（「是什么」「怎么加样本」「四步流程」）；地图 §一 / §二 各 +1 行（主 agent）；档内无 >300 字符单行 |
| AC-B29-6 | **判据句权威 + 计数同步**（§1.4-③ 面 / NFR-B29-5） | `docs/CONVENTIONS.md` §四 含 E 判据句行（权威句）；`AGENTS.md` §三 无「六判据」残留、写权矩阵行含「定位档 `docs/SAMPLES.md`」；设计档契约表 / 判据表 / AC-B16-1 串与 `checks=7` 同口径（本设计轮已落） |
| AC-B29-7 | **零样本写入 + 零业务改动**（§1.5-1/3） | 实施面 `git status --porcelain` = `scripts/gates/` 三档 + 文档层四档（`docs/SAMPLES.md` · `docs/CONVENTIONS.md` · `AGENTS.md` · 地图）；`package.json` / 运行时代码 / `.github/**` / `samples/**` 零 diff；`samples/` 现 1 项不变 |

##### A-B29.3.2 用例表（正常 / 边界 / 错误 —— 输入 / 期望输出 / 映射）

| # | 类型 | 输入 | 期望输出 | 断言面 | 映射 |
|---|---|---|---|---|---|
| TC-B29-01 | 错误 | 夹具 `a.js` 含 `const x = require('./samples/x.js');`（路径形态）+ `const y = require('./samples');`（末段形态） | 判红（`ref`，逐行各一条——共 2 条） | 结构面 | AC-B29-1 / 4 |
| TC-B29-02 | 错误 | 夹具 `b.js` 含 `path.join(base, 'samples', name)`（引号形态）+ `` `./samples` ``（反引号末段形态） | 判红（`ref`，逐行各一条——共 2 条） | 结构面 | AC-B29-1 / 4 |
| TC-B29-03 | 错误 | 夹具 `package.json` 的 `build.files` 含 `"samples/dsh-pet"` 且 `extraResources.from` 含 `"samples"` | 判红（`pkg-build` 1 条 + `pkg-extra` 1 条，共 2 条；**无 `ref`**——E① 排除 `package.json`） | 结构面 | AC-B29-1 / 3 / 4 |
| TC-B29-04 | 错误 | 夹具根**无** `package.json` | 判红（`pkg-unreadable`，fail-closed——**退出 2**，非判据红 1） | 结构面 | AC-B29-1 / 4 |
| TC-B29-05 | 边界 | 夹具 `c.js` 含 `const samples = 1;`（裸标识符）+ `const p = 'samples-x';`（末段 ≠ `samples` 的近似串）+ `d.md` 含 `samples/` 字面量 | **不**判红（变量名不误报；末段近似串不误报；文档面不属引用面） | 结构面 | AC-B29-1 / 4 |
| TC-B29-06 | 正常 | 真实仓库面 `checkSamples(扫描面, REPO_ROOT)`（现状锚，`liveAnchorOnly`） | 0 违规 ⇒ 恒绿；仅锚红（仓内注入，failures 恰 1 条）⇒ 分流入 E 判据块按判据码退 1 + `VIOLATION samples`；混合失败与锚红未确认一律退 2（口径 = A-B29.2.2 锚红分流） | 结构面 | AC-B29-2 / 3 |
| TC-B29-07 | 错误 | 仓内代码档临时注入 `require('./samples/x.js')` 后跑 `npm run lint` | 退出 1 + `VIOLATION samples ref` 点名；移除后退出 0 | 行为面 | AC-B29-2 |
| TC-B29-08 | 错误 | `package.json` `build.files` 临时注入 `"samples/x"` 后跑 `npm run lint` | 退出 1 + `VIOLATION samples pkg-build`；移除后退出 0 | 行为面 | AC-B29-3 |

- **N/A 声明**：本批 UI / 交互用例 = 无（A-B29.2.6）。
- **单价时长**：判据 E + 自证 <1 s（并入 `npm run lint`，总量级不变）。

---

## 四、变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-17 | 建档（B11）：需求层 F1–F5 + NFR-1–NFR-6；设计层 = 四处选型对比（规范档落点 / EOL 策略 / lint 取舍 / CHANGELOG 形态）+ 契约与指针图 + 受影响文件与出批项 + DD-1…DD-9 + 边界 + 待确认项；测试层 = AC1–AC6 逐条回指 + TC-1…TC-9；实测基线见 §2.1.2（93 文本档索引全 LF / 工作区 51 LF + 42 CRLF / 42 个 js|mjs 共 6,679 行）。 |
| 2026-09-17 | **修正轮 1**（评审轮次 1 pass 后，13 条 Dispatched）：AC5 回指 §1.6 原句 + 补父侧面判据；标题契约改「**前缀**逐字 + 允许（…）后缀」；规范档补 `AUTO-UPDATE.md` §2.2.8 指针；§一 三档计数按实况重算逐名（23/2/17 → **22/3/17**）；§二 命名口径重算；AC6 允许集与扫描集写全；AC2 反向机检扩变体 + 半自动判据；TC-3 / TC-8 同步；§八 重复句改指针；落点明细与实测见批次档 §2.10。 |
| 2026-09-17 | **修正轮 2**：§2.2.3 文件头三条判据的 ① 补**扩展名口径**（`.js` 适用 / `.mjs` 免——ESM 隐式严格；`tests/update-stub.mjs` 据此计合规面）；§3.1 AC2 增「命名现状口径（例外清单 + 计数）」与「判据 ① 扩展名口径」两条机检细则；`docs/CONVENTIONS.md` 行号 as-of 刷新（`:109` / `:122` / `:150` 等）。 |
| 2026-09-17 | **修正轮 3**：§2.2.3 文件头标准形改标**推荐形（写作面）**、判据 ② 收为**宽口径**（同源于 `docs/CONVENTIONS.md` §一）；§3.1 AC2 增「判据 ② 的口径」机检细则（含 4 处合规面形态差异须逐名登记、三分 22 / 3 / 17 = 42 不变）。 |
| 2026-09-17 | **修正轮 4**（独立复核轮次 2 的清理）：§2.2.3 后缀 5 处行号更正为实测值（`:10` / `:29` / `:117` / `:130` / `:158`）并注「行号只作 as-of 参考」（D4）· 目标行数标「**起草期目标**」（现值见批次档 §2.13 实测）；§3.1 半自动候选同步为 6 行；AC2 判据列取值串补齐第三条（口径条数 3 不变）。 |
| 2026-09-18 | **B16 面设计落档（附 A）**：三层契约（`lint` / `test:full` / `test:integration` + 退出码 + 摘要行）· **六条**机检判据（语法 / 行宽 / 行数 / 依赖无环 / 域模块 fan-out / 组装面接线点唯一）· 冻结基线 + 到期条件 · 慢测层 `slow()` 与 >500 ms 硬红 · 集成三场景 · DD-A1…13 · AC-B16-1…12 + TC-B16-01…24 · 出批项 O-A1…6；顶注补附 A 一行、§2.3 出批项 O3 标「已落设计」。 |
| 2026-09-18 | **B16 修正轮 1**（评审轮 1 pass 后）：②门命令契约统一（四条 script 字面值 + 层由运行器注入）· AC-B16-1 串对齐契约表 · D③ 覆盖面 = **组合根绑定面**（免检 2 档闭合）· 集成三场景判据补 file:line 证据行 · AC-B16-9 禁用面收窄为可判形态 · D①②③ 判据句权威 = 规范档 §四 · 自证夹具隔离面（`os.tmpdir()`）· 计数订正（`build.yml` 74 行 · 六条判据）· 豁免面 43 行（D1）· A.2.7 ① 已闭合。 |
| 2026-09-19 | **B29 面落档（附 A-续）**：判据 **E（样本区零引用）**——E① 引用面 + E② 打包白名单（fail-closed）；零命中恒判 + 自证 6 例（TC-B29-01…06）；契约表 / 判据表 / AC-B16-1 串随修订（checks 6→7 · selftest 14→20）；U-2 候选 3 / U-1 候选 5 裁定 → `docs/SAMPLES.md`；DD-A14…A19；AC-B29-1…7 + TC-B29-01…08；回指 `docs/batches/B29-samples-guard.md` §1。 |
| 2026-09-19 | **B29 修正轮 1**（评审轮 1 pass 后，🔴0 / 🟡6 / 🔵3 逐条收敛）：E① 补第三式（末段形态）并合并 open ① 裁定（引号形态保留）；E① 排除 `package.json`；`pkg-unreadable` / `pkg-shape` fail-closed 退出码写死 = 2；300 档结论补句；扫描面行计入修订清单第五处；现状锚改按 E① 扫描面口径；`package.json` 行锚实测注；B27 冻结面依据指针。依据 = 批次档 §2 修正轮 1 记录与 §3 轮次 1。 |
| 2026-09-19 | **B29 设计微修（代码轮裁决后文档面收口）**：§A-B29.2.2 补锚红分流规则（仅锚红按判据码报告 / 混合失败与锚红未确认退 2 / `SELFTEST-FAIL` 行不静默）+ `build` 非对象归 `pkg-shape` fail-closed（退 2）+ 反引号末段转义不判口径（`\\` 转义残留边界随下次扩展收口）+ 自证 TC 集固定 6 例（`pkg-shape` 例随扩展补）；TC-B29-06 期望行同步。依据 = 批次档 §5 代码轮报告（🟡#1 + 🔵#3/#4/#6）。 |
| 2026-09-19 | **B31 收口轮（文档层折账；源 = `docs/batches/B31-affinity-balance.md` §5.2）**：附 A §A.2.2.2 D③ 覆盖面「`main.js:32-46` 共 15 条」→ **`:32-47` 共 16 条**；`assemblyExempt` **2 档 → 3 档**（枚举同步 + `affinity-core.js`，D3）；各判据现状 D③ 行同改（as-of 2026-09-19）。**判据句与机检口径零动。** |
| 2026-09-20 | **B23 实施后文档同步轮（附 A §A.2.2.2 D③ 折账；源 = `docs/batches/B23-pet-action-unlock.md` §5.6 / §5.7）**：覆盖面「`main.js:32-47` 共 16 条」→ **`:32-48` 共 17 条**；`assemblyExempt` **3 档 → 4 档**（枚举同步 + `pet-unlock-core.js`，D3）；各判据现状 D③ 行同改（免检 3 → 4，as-of 2026-09-20）。**判据句与机检口径零动。** |
