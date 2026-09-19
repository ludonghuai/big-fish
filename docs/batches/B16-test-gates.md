# B16 批次档 —— 测试与门禁（发布门 0/3 → 3/3 + 结构判据机检）

> 六段制 · **一段一作者（append-only）**：§1 / §4 / §6 = 主 agent · §2 = eng-designer · §3 = 评审子代理 · §5 = eng-coder。
> 本档只登记**本仓**范围；需求档落点 = **无**（工程/流程类需求，依 B11 先例）；设计档落点 = `docs/design/REPO-CONVENTIONS.md`（B11 已立，本批**修订**：补「测试分层与门禁」节）+ 如需新主题由设计者判定并说明理由。

---

## §1 立案（主 agent）

### 1.1 目标（一句话）

**把本仓的验证链从「0/3」建成「3/3」，并把结构判据纳入机检 —— 让"改坏了"被机器拦住，而不是靠人眼、靠运气、靠用户实机发现。**

### 1.2 任务来源

- 用户 2026-09-18「**听你的**」⇒ 主 agent 推荐的 **B16 插队**（理由：门禁一落地，其后每一批都被判据约束）。
- 承接：**R11 ③ 代码体检与优化改进空间**的「基建」面 + **`AGENTS.md` §三 的目标声明**（现状 **0/3** 实测）。
- 触发本批的现实教训（2026-09-18）：**B20 批内 AC1–AC20 全绿，而功能全死** ✗ —— 原因是组合根漏了一行 `init()` 接线，且**没有任何机检面覆盖它**（→ **T37**）。
- 台账承载：**T4**（无自动化测试基建）· **T26**（行宽/行数门禁）· **T37**（组装面机检）· **T39**（结构判据三条）。

### 1.3 现状实测（证据，as-of 2026-09-18）

| # | 实测 | 证据 |
|---|---|---|
| 1 | `package.json` scripts **12 项**（postinstall / prestart / start / pack / dist / dist:win / dist:mac / dist:linux / icons / make-latest / bundle:refresh / bundle:check）—— **无 `test`** ✗ | `package.json:13-26`（行号只作 as-of 参考） |
| 2 | `.github/workflows/build.yml` **无 lint / test 步骤**（只有构建与产物上传） | `.github/workflows/build.yml` 全文 |
| 3 | 全仓**无 lint / format 配置**（`.eslintrc*` / `eslint.config.*` / `.prettierrc*` 零命中） | 全仓 glob 实测 |
| 4 | `tests/` = **4 档**（`harness-store.test.js` · `update-lib.test.js` · `update-stub.mjs` · `b12-plugin-guards.test.js`）⇒ 均属**开发期工具**，不构成仓门禁 | `tests/` 实测 |
| 5 | **行宽 ≤300 / 行数 ≤500** 只在规范档里写着 ⇒ **无机检** ✗（且存量已有超宽行：T13 记 65 行） | `docs/CONVENTIONS.md`；台账 **T13 / T26** |
| 6 | **组装面与结构**无任何机检 ✗：域模块 `init()` 接线漏调不可发现（T37）；域模块 fan-out 现状违规 5 处（`shell-tray.js` **10** · `shell-ipc.js` **6** · `shell-window.js` **5** · `shell-pet.js` **5** · `shell-market.js` **4**） | 台账 **T37 / T39**（主 agent 实测） |

### 1.4 范围（做 / 不做）

**做**（五件）：

1. **lint** —— 以 **B11 已裁定的 lint / format 取舍为准**（`docs/design/REPO-CONVENTIONS.md`；**本批不重开该选型** ✗）。
2. **`test:full`** —— 把散落的开发期桩测**收编**为统一入口（收编而非重写 ✓）。
3. **`test:integration`** —— 业务场景层（首发建议只做**三条主场景**：应用能起 · 桌宠主链路 · 更新门禁；**分期扩面** ✓）。
4. **CI 接线**（`.github/**`）：`lint` → `test:full` → `test:integration` 三步，与本地同形 ✓。
5. **机检门禁句**（三条，各自附判据）：
   - **行宽 / 行数**（T26，口径 = 不含行尾 CR；豁免面 = 台账 / 地图表格行 + 批次档 §3）
   - **组装面**（T37：每个被 require 的域模块在 `main.js` **各有一处且仅一处** `init(` 调用）
   - **结构判据三条**（T39：① 依赖无环 ② 装配面唯一 + 域模块 fan-out ≤ 3 ③ 接线点唯一）

**不做**：

- **不改任何业务行为**（纯基建批 ✓）；**不重构**既有模块结构（T39 的违规面 = **基线冻结 + 只拦新增**，见待决 U-4 ✓）。
- **不引入重型测试框架**（与 B11 的取舍一致 ✓；新增依赖须在设计中显式报备 ✓）。
- **不重写**既有 `tests/` 档（收编 ✓）；**不动** `build.files` 白名单面（除必要的 `test` 脚本 ✓）。
- **不做发布流程本身**（T5 / T7 / T8 是发布面 ⇒ 另行安排 ✓）。

### 1.5 硬约束（不得偏离）

1. **零业务行为变更**：判据 = 应用能起 + 既有桩测全绿 + 桌宠主链路不变。
2. **测试分层纪律**（本仓自研仓口径）：**单元测试 = 开发期工具**（可断言实现内部、批次收口时**默认退役**）· **集成测试 = 项目资产**（只断言业务可观察结果、常驻、不因单次改动增补）。
3. **重 IO 用例归册**：真 fs / 子进程 / 定时器 / 网络类用例超阈值（**>500 ms**）归慢测层（快层自动 skip、全量照跑）；**未归册而超阈 = 硬红**。
4. **门禁必须可本地跑**（不能只在 CI 里 ✓）；命令与 CI 逐字同形。
5. **禁止新写散文锚**：读非测试档断言「某句在场/缺席」的测试一律不做（只写**行为面**与**结构机检面**）。
6. **行宽 ≤300 / 单档 ≤500**（本批自身亦须遵守）；文件头标准形。
7. **排期**：设计阶段**可立即开始**（纯文档 ⇒ 零写域冲突 ✓）；**实施**须等 **B19 / B20 让出 `package.json`** ✗。

### 1.6 待决项（须裁定后才能定稿设计）

| # | 待决 | 备选 | 关键判据 |
|---|---|---|---|
| U-1 | **lint 形态** | ① 依 B11 取舍执行 ② 不引 lint，只用**自研机检规则**（行宽/行数/文件头/结构判据） | 先核 `docs/design/REPO-CONVENTIONS.md` 的裁定（**本批不重开选型** ✗）；零依赖优先 |
| U-2 | **`test:integration` 的范围与分期** | ① 首发三场景（起得来 · 桌宠主链路 · 更新门禁）② 全量铺开 | 体量与可信度权衡；**首发宜小而与真机验收对齐** ✓ |
| U-3 | **慢测层实现** | ① `slow()` 标记 + 快层 skip ② 独立目录 | 本仓自研仓规则 = **>500 ms 归 `slow()`** ✓（承既有口径） |
| U-4 | **结构判据的基线处理** ⭐ | ① **基线冻结 + 只拦新增**（推荐 ✓）② 门禁一立即全绿（需先清 5 处违规 + T13 的 65 行超宽 ✗） | 一立即全绿 = 把老账一次性逼出来 ✗ 且会挡住当前批次；冻结基线 = 增量可控 ✓ **但必须有到期条件** ✓ |
| U-5 | **CI 触发面与 runner** | ① `windows-latest` · push + PR ② 仅 push | 本仓主战场 = Windows ✓；成本与时长 |
| U-6 | **门禁与"批次收口"的接口** | ① 批次 §6 核销必跑门禁并留输出 ② 仅 CI 跑 | 与既有六段制的衔接（§6 核销证据面） |

### 1.7 关联台账与需求档

- **台账**：`docs/TODO.md` §一 **R11**（③ 代码体检的基建面）；§二 **T4 / T26 / T37 / T39**；**T13**（行宽债 65 行 —— 与 U-4 的基线处理强相关）。
- **需求档**：**无**（工程/流程类需求，依 B11 先例）。
- **规范/目标句**：`AGENTS.md` §三（门禁现状 **0/3** 与**目标 3/3** 的声明处 —— 本批即该目标的落地）；`docs/CONVENTIONS.md`（门禁句的落点）。

### 1.8 交付物与排期

- **交付物**：① 设计（门禁三层 + 机检判据 + 基线清单）② `test` 脚本族与 CI 接线 ③ 机检脚本（行宽/行数 · 组装面 · 结构判据三条）④ `AGENTS.md` §三「现状 0/3」→ **实况**的同步（主 agent 落）⑤ 台账 T4 / T26 / T37 / T39 的收口注记（主 agent）。
- **排期**：**设计可立即开始**（纯文档 ✓ 零写域冲突 ✓）；**实施排在 B19 / B20 之后**（`package.json` 争用 ✗）。

### 1.9 变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-18 | 建档（B16 立案）：目标（0/3 → 3/3 + 结构判据）/ 六条现状实测 / 五件范围与四条不做 / 七条硬约束 / 待决 U-1…U-6 / 关联台账与排期。依据 = 用户 2026-09-18「听你的」（主 agent 推荐 B16 插队）+ B20 实机教训（T37）。 |

---

## §2 本批任务书（eng-designer）

<!-- 由 eng-designer 填 -->

---

### 2.1 需求覆盖与三方一致

本批**无独立需求档**（工程/流程类需求，依 B11 先例）⇒ 需求条文由本档 §1 承载（§1.4「做」五件 + §1.5 硬约束七条）。三条链**同源**：

| # | 需求条目（§1.4） | 设计档回指 | 验收标准（附 A §A.3.1） |
|---|---|---|---|
| F1 | `lint` 门 = 自研零依赖机检（语法 / 行宽行数 / 结构三条） | 附 A §A.1.2 F1 · §A.2.1 组 1 | AC-B16-1 · AC-B16-6 / 7 / 8 |
| F2 | `test:full` = 既有开发期桩测收编 + 慢测层 | 附 A §A.1.2 F2 · §A.2.2.3 · §A.2.1 组 2 / 5 | AC-B16-2 · AC-B16-3 |
| F3 | `test:integration` = 首发三场景 | 附 A §A.1.2 F3 · §A.2.2.4 · §A.2.1 组 4 | AC-B16-4 |
| F4 | CI 接线（三步 · 与本地同形） | 附 A §A.1.2 F4 · §A.2.1 组 3 | AC-B16-5 |
| F5 | 机检门禁句三条（行宽行数 / 组装面 / 结构判据） | 附 A §A.1.2 F5 · §A.2.2.2 | AC-B16-6 / 7 / 8 · AC-B16-12 |

- **硬约束 → 验收映射**（§1.5 七条）：① → NFR-A1 / AC-B16-10 · ②③ → NFR-A7 / AC-B16-3 · ④ → NFR-A2 / A3 / A4 · ⑤ → NFR-A5 / AC-B16-9 · ⑥ → NFR-A6 / AC-B16-12 · ⑦ → §2.6 排期。
- 验收标准全表 = 附 A §A.3.1 **AC-B16-1…AC-B16-12**（逐条回指 §1.4 / §1.5）；用例表 = 附 A §A.3.2 **TC-B16-01…TC-B16-24**。
- **本表即三方一致清单**：本段条目 = 设计档验收标准回指的条目 = §1.4 五件，三者同源、不增不改。

### 2.2 本批任务（实施面）

1. **新建 13 档**（职责与预计行数见附 A §A.2.3）：
   - `scripts/gates/{lib,checks,selftest,run}.js` · `scripts/gates/baseline.json` · `scripts/{test-run,test-integration}.js`
   - `tests/layer.js` · `tests/integration/{harness,s1-app-start.scenario,s2-pet-main-path.scenario,s3-update-gate}.js`
   - `.github/workflows/gates.yml`
2. **修改 5 档**：
   - `package.json`：+4 scripts（`lint` / `test` / `test:full` / `test:integration`；依赖块不动）。
   - `tests/b12-plugin-guards.test.js`：`TC-82` 机械改标 `slow()`（不重写正文）。
   - `tests/update-stub.mjs`：+`?latest=<version>` 只读参数（缺省不变）。
   - `docs/CONVENTIONS.md`：§四 / §五 判据句 —— **本收尾轮已提前落笔**（见 §2.8）。
   - `docs/design/REPO-CONVENTIONS.md`：附 A —— **已落**。
3. **实施序**（步序契约，附 A §A.2.2.1）：① `scripts/gates/**` + `tests/layer.js` → ② 取**实施当日实测值**写 `baseline.json` → ③ `test-run.js` + `slow()` 改标 → ④ 集成三层（`harness.js` + 3 场景 + `test-integration.js` + stub 扩展）→ ⑤ `package.json` scripts → ⑥ `gates.yml` → ⑦ 本地三条门全绿取证。

### 2.3 受影响文件全清单（新建 13 · 修改 5 · 运行时代码改动 0）

新建 13 档的逐档职责与预计行数的**唯一详述处** = 附 A §A.2.3（本段不重述）。修改 5 档：

| 文件 | 现状 | 增量 |
|---|---|---|
| `package.json` | 136 行 · 12 项 scripts | +6 行（4 项 script） |
| `tests/b12-plugin-guards.test.js` | 491 行（贴线） | +2 行 → 493 |
| `tests/update-stub.mjs` | 91 行 | +8 行 → 99 |
| `docs/CONVENTIONS.md` | 175 行 | **已完成**：+14 行 → 189 |
| `docs/design/REPO-CONVENTIONS.md` | 286 行 | **已完成**：→ 662 行 |

- **运行时代码（判据面，零改动）**：`main.js` · 15 档 `shell-*.js` · `pet*` · `market*` · `updater.js` · `harness-store.js` · `update-lib.js` · 4 档 `*.html` · `package.json` 的 `build` 块 —— 逐档 `git diff` 为空。
- **贴线档必填面**：`tests/b12-plugin-guards.test.js`（491 → 493 行）**拆分计划已给**（附 A §A.2.3：按三面拆 `tests/b12/{guards,xss,scan}.test.js` + 共享 `fixtures.js`；零回退判据 = 19 用例不变 + 全绿）；**执行 = 另批**，不混进基建批。

### 2.4 验收标准（回指）

- **全表 = 附 A §A.3.1 AC-B16-1…AC-B16-12**，逐条回指 §1.4（F1–F5）与 §1.5（硬约束 1–7），每条可机器验证（命令 + 输出串）。
- **本批自身形态**（AC-B16-12）：判据 B / C 扫本批新增 / 修改档 ⇒ **0 新增违规**（门禁扫自己）；新增 `.js` 第 1 行 = `'use strict';` + JSDoc 含 `docs/design/REPO-CONVENTIONS.md §`。
- **收口取证**（U-6）：三条门各自的机器摘要行（`GATE lint PASS …` / `GATE test:full PASS …` / `GATE test:integration PASS …`）摘录进 §6 核销。
- **零业务行为变更**（§1.5-1）：既有 45 用例全绿 + `SCENARIO S1` / `S2` PASS + 运行时代码面 `git diff` 为空。

### 2.5 明确不在本批（范围外）

- **不改任何运行时行为**（§1.5-1）；**不重构既有模块结构** —— 6 档 fan-out 超限 + 92 行超宽的存量**只冻结不清偿**（U-4 ①）。
- **不引入**第三方 linter / formatter / 测试框架；**零新增依赖**（NFR-A2）。
- **不做**文件头判据机检（出批项 O-A1）· **不做**发布流程（T5 / T7 / T8）· **不动** `build.files` 白名单面。
- **不新增行宽豁免面**；**基线不是豁免面**（DD-A11）。
- **不覆盖**拖拽跟手面（附 A §A.2.5 —— 如实声明，非静默省略）。
- 集成层扩面（托盘 / 插件市场 / 好感度 / 通知 / 首启模式弹窗）= 分期（O-A2）；CI `paths` 过滤 = 用户裁定项（O-A3）。
- 本任务书**不授权**动台账 / 文档地图 / `CHANGELOG.md`（写权 = 主 agent）；子代理只写自己那一段（§2.20 一段一作者）。

### 2.6 排期与前置

1. **排期**（§1.5-7）：设计阶段可立即开始（纯文档 ✓ 零写域冲突）；实施须等 **B19 / B20 让出 `package.json`**。**主 agent 2026-09-18 裁：B19 / B20 已交付 ⇒ 实际已让出 ⇒ 可开工**（两档 §5 实施记录已落；`package.json` 现 = 136 行 / 12 项 scripts / **无 `test`** ⇒ 无在途写者）。
2. **实施前置**：**本批尚未批准** —— 实施前须走「设计评审（发起权在用户）→ 用户明确批准 → 签发设计凭证」两步（`AGENTS.md` §二）；未取得凭证不得开工。
3. **落点从属**：本设计现落 `docs/design/REPO-CONVENTIONS.md` **附 A**（照 §1 头部指令）；若日后改判为独立档 `docs/design/TEST-GATES.md`，A.1–A.3 **整体平移、零语义改动**（附 A §A.2.7 ②）。

### 2.7 实机项与停报条件（不可本地证明）

| # | 项 | 判据 / 处置 |
|---|---|---|
| R1 | **CI 真绿**：本地无法证明 `gates.yml` 在 runner 上跑绿（需一次真实 push / PR） | 实施后由主 agent 触发核销（附 A §A.2.7 ③）；= AC-B16-5 的实机段 |
| R2 | **集成层在 CI runner 上的可跑性**（Electron GUI + 真后端 + 冷 runner 时长） | 首次 CI 实测；**若 CI 跑不动 ⇒ 停下上报，不静默降为「只本地跑」**（附 A §A.2.7 ④） |
| R3 | **基线陈旧** | 实施首步取**当日实测值**写 `baseline.json`；在飞批次（B23 / B24）可能移动现状值 ⇒ **不得照抄附 A 的 as-of 数字** |
| R4 | **贴线档余量 = 0** | `market.js` 恰 500 行；本批不触碰，但任何 `+1` 行即触判据 C ⇒ 相关批次须先给拆分计划 |

- 实施中发现设计缺口 / 需求说不通 ⇒ **停下上报**（不在实施轮自选解释往下干）。

### 2.8 本收尾轮已落的文档改动 + 待同步项

- `docs/CONVENTIONS.md`：§四 增**结构判据三条**（D① 依赖无环 / D② 域模块扇出 ≤3 / D③ 接线点唯一）+ 口径与免检清单 + 现状实测（as-of 2026-09-18）+ 基线处理；§五 的「升门禁句」行改为**门禁句**；变更记录 1 行（175 → 189 行）。
- `AGENTS.md`：§三 `tests/` 计数订正 **3 档 → 4 档**（漏 `b12-plugin-guards.test.js`）+ 补「0/3 与目标段随 B16 实施后同步」注记 + 变更记录 1 行。
- **实施收口轮须同步的现状句**：`AGENTS.md` §三 的「现状 = 0/3」→ 实况；`docs/CONVENTIONS.md` §四 / §五 的「随 B16 实施落地」→ 「已落地」。
- 未处置（主 agent 面，已报）：台账 **T13** 行宽债 65 → **92 行 / 16 档** · **T39** fan-out 违规 5 → **6 处**；`docs/CONVENTIONS.md` §五 的两处既有现状句同源陈旧（见主 agent 报告「另报项」）。

### 2.9 修正轮 1 订正块（2026-09-18；承 §3 评审轮 1 = pass + §4.2 裁决）

**只落 §3 的 13 条 Dispatched —— 不新增语义 / 不扩范围 / 不改选型**（逐条 = 落地位置与实测）。

#### 🟡 八条

1. **②门命令契约统一 + 补字面值**（§3 #1）：`docs/design/REPO-CONVENTIONS.md` §A.2.2.1 新增「**四条 script 的字面值**」表 + 「**层注入口径（命令面无层 flag）**」条；
   §A.2.2.3 的「全量（`npm run test:full --slow`）」改为「全量（`npm run test:full`）…（层由运行器注入 `BIGFISH_TEST_LAYER`、命令面无层 flag）」。
   字面值 = `lint` → `node scripts/gates/run.js` · `test` → `node scripts/test-run.js` · `test:full` → `node scripts/test-run.js --full` · `test:integration` → `node scripts/test-integration.js`。
   旧 `--slow` 写法全文**仅剩 A.2.2.1 的一条「作废」注记**（标为已废弃，不作现行口径）。
2. **AC-B16-1 串有来源**（§3 #2）：二择一取「**AC 串改为契约表现有形式**」——AC-B16-1 改含 `GATE lint PASS checks=6 selftest=14/14`（= §A.2.2.1 摘要行，**二者同源**）+ 回指字面值表；`GATE lint selftest PASS` 这一无来源串**已消除**。
3. **D③ 免检口径闭合**（§3 #3）：写入「**D③ 覆盖面 = 组合根绑定面**」（附 A §A.2.2.2 新增专条 + 规范档 §四 D③ 口径栏 + D③ 判据行标 = T39 ②）。
   **自查实测（本角色亲核）**：`main.js:32-46` 共 **15** 条相对 require，**无 `shell-assets.js` / `shell-market.js` 的绑定** ⇒ 该 2 档不进绑定面、无需入免检清单。
   面内无 `init` 者 = `shell-settings.js` / `shell-ipc.js` ⇒ 免检 **2 档**，与基线 `assemblyExempt`（2 条）及现状 `13/13 恰一处` 闭合。**核实结果与判据一致，无「相反」情形** ✓。
4. **集成三场景判据串的源码证据行**（§3 #4）：附 A §A.2.2.4 新增「判据串的源码证据行」块（**9 串全部实测到源码行，无「待核」项**）：
   `BIGFISH_PET_DEBUG`（`shell-pet-geometry.js:34` · `shell-pet-drag.js:27` · `shell-pet-physics.js:52` · `shell-pet.js:46` · `pet-chain.js:17`）·
   `geom tag=…` 模板（`shell-pet-geometry.js:193-197`；`tag=start` 调用点 = `main.js:207`；`tag=display` = `:334` / `:345`）·
   `backend web url captured port=`（`shell-backend.js:155`；反例串 `:257`）·
   落盘物（`bigfish.log` = `shell-backend.js:44` / `:60-61` / `:215`；`pet-geometry.log` = `shell-pet-geometry.js:51-55`）·
   `update gate reason=startup face=app skipped=dev`（`shell-update.js:274`；启动 reason 来源 = `:293`）·
   `update check … type=harness result=…`（`updater.js:239`；`result=error` 行 = `:243`）· `harness install phase=`（`updater.js:350`）·
   `DSH_NODE`（`shell-backend.js:110` · `shell-plugins.js:48`）· S2 的 `handleDisplayChange('metrics', …)`（`shell-pet-geometry.js:323` / 导出 `:429`；生产绑定 = `main.js:202`）。
5. **AC-B16-9 机检面收窄**（§3 #5）：改为可判形态 —— 禁止面 = 「新增档内**读 `docs/**` 或源码正文（`.js` / `.mjs` / `.html`）+ 子串断言」**0 处**」，并明文**允许面** = 行为面（进程退出码 / 产品自身落盘物与诊断日志行 / fs 结果）；§A.2.2.3 断言面纪律条加同源回指。
6. **判据句单一权威源**（§3 #6）：定 **规范档 §四（D①②③）/ §五（B / C）= 判据句权威**；附 A §A.2.2.2 表列改「判据句（权威源）」= **回指**，机检口径 / 机检方式留附 A，并加专条「本表不复述判据句」。
   规范档 §四 / §五 各标「**本表 / 本档 = 判据句权威**」⇒ 双向指针、**措辞分叉已消**（原「仓库内自研档」vs「扫描面内档」等并列句已不再并存）。
7. **fan-out 5 → 6**（§3 #7）：本段**回指 §4.2 D5**（现行值 = **6 档**：`shell-tray` 10 · `shell-ipc` 6 · `shell-pet` / `shell-update` / `shell-window` 各 5 · `shell-market` 4，as-of 2026-09-18）。
   §1.3-6 的「5 处」保留为**立案时值**（§1 append-only，**未改** ✗）；设计档 §A.2.2.2 与规范档 §四 现状行本就是 6 档（未改）。
8. **自证夹具隔离面**（§3 #8）：附 A §A.2.2.2 新增专条 —— 夹具根 = `fs.mkdtempSync(path.join(os.tmpdir(), 'b16-gate-'))`；判据函数以**参数**接收 `root` 与 `baseline`；清理 = `try` / `finally` 内 `fs.rmSync(root, { recursive: true, force: true })`。
   **与跳过清单的关系** = 夹具根不在仓库根之下 ⇒ **不在扫描面内**、无需新增跳过条目；若改「仓库内临时根」（明标**不推荐**）⇒ 须同写跳过清单，否则残档会被真实判据当**新增违规** ✗。

#### 🔵 五条

9. **计数漂移统一**（§3 #9）：设计档 §A.2.3 修改表 —— `docs/CONVENTIONS.md` 行取 `≈+15 行 → **190**`（实测 190 ✓）；`docs/design/REPO-CONVENTIONS.md` 行取 `**+414** 行 → **700**`（实测 700 ✓；原记 662 = 过时值）。
   变更记录「五条机检判据」→「**六条**机检判据」（补 D①/②/③ 逐名）；`AGENTS.md:39` 的 `build.yml` **75 → 74**（实测 74 ✓，与设计档 §A.2 顶注 74 一致）。
   **⚠️ 与 §3 #9 的一处实测分歧（如实报）**：§3 #9 记「规范档实测 **190**」；本轮**改前**实测 = **189**（`\n` 计数 189 + 末行换行；与 §2.8 的「175 → 189」自洽）——本轮修正轮 1 在规范档补 1 行变更记录后 = **190**。
   ⇒ 落笔取**当前实测 190**；两值都对得上，差异 = **计量时点**（改前 / 改后），非计数错误。
10. **A.2.7 ① 标已裁**（§3 #10）：该行改「**已裁 / 已落（2026-09-18）**」（写权 = eng-designer，依 `AGENTS.md` §一）；影响面栏 → 「无（项已闭合）」。
11. **豁免面计数**（§3 #11）：附 A §A.2.2.2 现状行 `45 → **43** 行`（台账 **31** + 地图 **12**，实测 ✓，与 §4.1 **D1** 一致）；并**写死** `docs/TODO-archive.md` 处置 = **在扫描面内**、按**表格行豁免口径**处理，**计数不含归档档**（含归档 = 46，**不计**）；规范档 §五 行宽口径栏同步补归档档 + 计数口径。
12. **生成档 + 示例基线**（§3 #12）：附 A 扫描面段补「**生成档现状实测：`package-lock.json` 5,313 行 ⇒ 超宽 0 行**」+ 触发时处置口径 = **停下报用户裁定**（基线不得冻结**新增**违规；候选 ① 新增「生成档」豁免面 ② 改锁定源形态），**不静默放行**；§A.2.2.6 示例块后补「**以上为节选**」+ 重申 R3「实施首步取当日实测值、不得照抄」。
13. **T39 ②「装配面唯一」**（§3 #13）：D③ 行标「= §1.4-5 的 **T39 ②「装配面唯一」**」（规范档 §四 + 附 A 两处），附 A 另加专条「D③ 即 T39 ② 的机检落点」。
   ⇒ §1.4-5 三条门禁句**逐句有判据落点**：① 行宽/行数 → B / C · ② 组装面 → D③ · ③ 结构判据三条 → D①/②/③。

#### 本轮自查（无夹带 / 未碰禁面 / 形态）

- **未夹带**：改动 = 上述 13 条的措辞统一 / 判据闭合 / 证据补行 / 计数订正 / open 项闭合；判据条数（六条）、门数（三道）、选型（DD-A1…13）**零改动**。
- **未碰禁面**：任何 `.js` / `.github/**` / `package.json` / `tests/**` / 台账 / 地图 / 其它批次面**零写**；本档 **§1 / §3 / §4 零写**（本段 = §2 append）。
- **形态实测**：三个改动档逐行超宽 **0 行**（口径 = 去行尾 CR ≤300）；`.md` 两档 EOL **CRLF 全保持**、`AGENTS.md` LF 保持。

#### 另报（不阻断本批；未自行处置）

- **现状数字又已漂移（§3 #7/#9 同族）**：本轮实测 —— 非豁免超宽 = **93 行 / 17 档**（设计档 / 规范档记 **92 行 / 16 档**，as-of 同日），差额 = `docs/batches/B25-architecture-docs.md:26`（1 行，B25 落档晚于设计档成文）；
  批次档 §3 豁免行 = **124**（设计档记 **121**），差额 = **本档 §3 的评审发现表自身 3 行**。
  两处均属「as-of 参考值」（R3 明示实施首步取当日实测、不得照抄），**故本轮未改**（不夹带未列条目）；基线建档时按当日实测即可自洽。
- **`--slow` 注记**：A.2.2.1 保留 1 处「旧写法作废」注记（防回潮）；若评审要求「零残留」，可下次动笔时改为不引用该命令形态。

## §3 设计评审（评审子代理）

<!-- 由评审子代理填 -->

---

### 轮次 1（评审子代理）

**评审对象**：设计评审（B16 测试与门禁）· 审查面 = `docs/design/REPO-CONVENTIONS.md` 附 A（A.1/A.2/A.3）· `docs/batches/B16-test-gates.md` §1/§2/§4 · `docs/CONVENTIONS.md` §四/§五 · `AGENTS.md` §三。Object state = 待评审；触发 = 用户 2026-09-18「发起B16评审」。未声明项目标准档 ⇒ 方法论合规按 AGENTS.md 四步流程 + 文档地图判。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | Requirements / Clarity | 🟡 | 第②道门的命令契约两处不一致：`REPO-CONVENTIONS.md:385`（`npm run test:full`=全量=门）与 `:609`（AC-B16-2 要该命令 `# skipped 0`）对上 `:431`「全量（`npm run test:full --slow`）⇒ 全部执行」；四条 script 的字面值（`lint`/`test`/`test:full`/`test:integration`）全篇未给，而 F4/NFR-A4 的「单一命令源」正依赖它 | A.2.2.1 列出四条 script 字面值；统一为「层由运行器/`tests/layer.js` 注入，无 flag」并删改 `:431` 的 `--slow` 写法 |
| 2 | Acceptance criteria | 🟡 | AC-B16-1（`:608`）要求 stdout 含 `GATE lint selftest PASS`，而契约表（`:385`）声明的摘要行 `GATE lint PASS checks=6 selftest=14/14` 不含该词序 ⇒ 照契约打印即判红 | 契约表补一条 selftest 摘要行，或 AC 串改 `selftest=14/14` |
| 3 | Clarity | 🟡 | D③ 免检清单不闭合：`:409` 规则「不提供 `init` 导出的档须列入免检清单」，`docs/CONVENTIONS.md:110-112` 列**无 init 4 档**，基线 `assemblyExempt`（`:484-487`）只 2 档、现状 `13/13`（`:419`） | 写明另 2 档（shell-assets / shell-market）为何不参与 D③（未被组合根绑定）；main.js 正文不在评审范围 ⇒ 该点 unverified，实施首步核对 |
| 4 | Acceptance criteria | 🟡 | 集成三场景判据挂在既有产品事实上而全篇无证据行：`BIGFISH_PET_DEBUG` / `geom tag=start`（`:451,453`）· `backend web url captured port=`（`:449`）· `update gate reason=startup face=app skipped=dev` / `harness install phase=`（`:459-461`）· `DSH_NODE`（`:642`） | 逐串补 as-of 证据行（file:line），无证据者标待核；否则串形不符只能到实施轮发现（NFR-A1 又不许为测试改产品） |
| 5 | Acceptance criteria | 🟡 | AC-B16-9 机检面与自身定义相抵：`:435` 把「产品自身落盘物与诊断日志行」定为**行为面（允许）**，`:616` 却写「新增档内『对非测试档的读取+子串断言』0 处」——三场景与门禁自身按字面均命中 | 收窄为可判形态（例：不得读 `docs/**`/源码正文做子串断言），或降为规则句+评审人核 |
| 6 | Document ownership | 🟡 | D①②③ 判据句在 `docs/CONVENTIONS.md:115-119` 与 `REPO-CONVENTIONS.md:407-409` 近逐字并列且措辞已分叉（「仓库内自研档」vs「扫描面内档」、`.<相对路径>` vs `.<相对>`），指针仅 规范档→设计档 单向（`CONVENTIONS.md:113`） | 定一处为判据句权威、另一处为指针（或在附 A 加回指并声明同源），防分叉（NFR-4/D2） |
| 7 | Requirements | 🟡 | 同源现状数字不一致：`B16-test-gates.md:30` 记 fan-out 违规 **5 处**（列 5 档），设计 `:418` 与 `docs/CONVENTIONS.md:121` 为 **6 档**（含 `shell-update` 5）；`:182` 已自报「5→6」待同步，§4 裁决段 `:196-199` 未含该项 | §1 为 append-only 立案段 ⇒ 主 agent 在 §4/§6 合法动笔处同步（评审只报不改） |
| 8 | Clarity | 🟡 | 自证夹具隔离面未交代：TC-B16-06/09/13（`:630,633,637`）需临时档树或临时基线，`:423` 只说「内联 `--selftest` 每次 lint 跑」 | 写明夹具根（建议 `os.tmpdir()`）+ 判据函数可注入 root/baseline + 清理与跳过清单关系，防残档被真实判据当违规 |
| 9 | Doc-state | 🔵 | 计数漂移（R7c）：`:538` 自称 662 行、实测 **664**；`B16-test-gates.md:137` 记规范档 +14→**189**、设计 `:537` 记 +15→**190**、实测 **190**；`AGENTS.md:39` 记 `build.yml` **75** 行 vs `:284` **74** 行；`:664` 写「**五条**机检判据」而正文为**六条**（`:384,393`） | 下次合法动笔统一（评审只报不改） |
| 10 | Doc-state | 🔵 | `:596`（A.2.7 ①）仍列「规范档落笔归属待裁」，而 `AGENTS.md:13` 已给 eng-designer 规范档写权、批次档 `:124,137` 与 §2.8 记「已落」 | 标「已裁/已落」或并入下次动 §2 的轮次 |
| 11 | Doc-state | 🔵 | 豁免面计数：主 agent 裁决 D1（`B16-test-gates.md:196`）= **43** 行（不含归档档），设计 `:414` 仍记 **45**；且未写明 `docs/TODO-archive.md` 是否进扫描面 | 实施首步一并落：裁决口径 + 归档档进/出扫描面的明确句 |
| 12 | Doc-state | 🔵 | 基线契约两处提示不足：`:400` 生成档（`package-lock.json`）不设豁免 ⇒ 未来依赖变更若引入 >300 字符行会产出「不可拆行、豁免又须用户裁定（DD-A11）」的红；`:479-493` 示例 `width` 块只列 2 条（实际 16 档）而 `fanout` 列全 6 条，且未标「节选」 | 记一句生成档现状实测 + 触发时处置口径；示例标「节选」并重申 `:503`/R3「实施首步取当日实测值、不得照抄」 |
| 13 | Requirements | 🔵 | §1.4-5 的 T39 ② 含「装配面唯一」，本设计以 D② 的 `main.js` 免判（`:408`）+ D③ 承载，未单列判据 | 在 D③ 口径写明该意涵（或声明已并入 D②），使三条门禁句逐句有判据落点 |
| 14 | Scope | 🔵 | 附 A 落点合规（`B16-test-gates.md:4` 已指令），但该档现 **664** 行、一档承载 B11+B16 两主题；`.md` 豁免行数判据 ⇒ 非违规 | 仅记录：后续若再有「验证链」类主题，按 `:597`（A.2.7 ②）既有备选迁独立档 |

**审查面硬结论（无 🔴）**：需求覆盖 F1–F5 / 硬约束 1–7 全映射（`B16-test-gates.md:100-112`），U-1…U-6 逐条有选型落点（组 1–6）；六条判据（A·B·C·D①②③）与 §1.4-5 三条门禁句同口径；基线冻结带四条判定规则 + 逐条到期条件（`:496-501`）；受影响文件全清单齐（新建 13 / 修改 5，源码档均带现状行数 + 增量，`tests/b12-plugin-guards.test.js` 491→493 附拆分计划，`market.js` 恰 500 不触碰）；评审面 4 档以 `^.{301,}$` 实测**无超宽行**（.md 口径自查通过）。

**计数**：🔴 0 · 🟡 8 · 🔵 6 —— 无阻断项。
VERDICT: pass

## §4 评审裁决与实施启动（主 agent）

<!-- 由主 agent 填 -->

### 4.1 主 agent 裁决（2026-09-18 · 评审前）

- **D1（豁免面表格行计数口径）**：收尾轮报「附 A / T13 记 45 行，复测 = 43（台账 31 + 地图 12），含归档档则 46」⇒ **裁定 = 不含归档档（= 43 行）**：归档档 = 已定案、**不再参与门禁**，计入会造成每次归档都漂数 ✗。落笔点 = 附 A 与 T13 的下次合法动笔（**本裁定即为口径** ✓）。
- **D2（§2.8 陈旧句）**：本轮已订正 `docs/CONVENTIONS.md` 两处现状句 ✓ ⇒ §2.8 末句所述「规范档 §五 的既有现状句同源陈旧」已不成立 ⇒ **归下次动 §2 的轮次同步**（不单独占一轮 ✓）。
- **D3（评审前就绪判定）**：设计档（附 A）+ 规范档判据句 + `AGENTS.md` 订正 + §2 任务书 **四件齐备** ✓ ⇒ **可发起设计评审**（发起权在用户 ✓）。
- **D4（实机项携带）**：§2.7 的两个实机项（CI 真绿 / 集成层在 runner 可跑性）+ 「跑不动则停下上报，不静默降级 ✗」在评审与批准两面都不得省略。

### 4.2 评审轮 1 结论与裁决（2026-09-18）

- **评审轮 1 = pass**（🔴 0 / 🟡 8 / 🔵 6，发现表见 §3）。**13 条 Dispatched 到修正轮 1**；**1 条裁「Not an issue」**（🔵#14 附 A 落点 = 本档 §1.4 明文指令 ⇒ 合规，不迁；后续若有新主题按 A.2.7 ② 迁独立档）。
- **D5（评审 🟡#7 的现行值裁定）**：§1.3-6 记「fan-out 违规 **5 处**」为**立案时值**（§1 = append-only，不重写 ✓）
  ⇒ **现行值以本段为准**：域模块 fan-out 违规 = **6 档**（`shell-tray.js` **10** · `shell-ipc.js` **6** · `shell-window.js` **5** · `shell-pet.js` **5** · `shell-update.js` **5** · `shell-market.js` **4**；as-of 2026-09-18）
  ⇒ 与 `docs/CONVENTIONS.md` §四 及设计档 §A.2.2.2 实测一致；**判据面与基线以本值为准**。

---

## §5 实施记录（eng-coder）

<!-- 由 eng-coder 填 -->

---

### §5 实施记录（eng-coder，2026-09-18）

**交付形态**：新建 13 档 + 修改 4 档（计划内 3 档 + 修偏 1 档 `shell-notify.js`）+ 1 处基线外撞面（见「上报」）。实施序 = 任务书 §2.2-3 七步全走（gates/** → 当日实测 baseline → test-run + slow 改标 → 集成三层 → package.json scripts → gates.yml → 本地取证）。

**新建 13 档**（行数实测）：
- `scripts/gates/lib.js`（177 行）扫描面发现（跳过清单唯一权威处，含 `.test-dsh-home` 前缀）+ 豁免面 + require 解析 + 基线载入。
- `scripts/gates/checks.js`（240 行）六条判据实现；参数化 root/baseline（自证夹具注入临时根）。
- `scripts/gates/selftest.js`（260 行）TC-B16-01…14 结构面自证（os.tmpdir() mkdtemp 夹具 + try/finally 清理）。
- `scripts/gates/run.js`（119 行）入口：自证 → 六判据 → `GATE lint PASS checks=6 selftest=14/14`；退出码 0/1/2 fail-closed。
- `scripts/gates/baseline.json`（38 行）当日实测冻结：width 15 档/93 行（含 B20 批次档 4 行）· fanout 6 档 · cycles 0 · assemblyExempt 2 档 + expires 逐条写死。
- `scripts/test-run.js`（115 行）单元层运行器：档发现 + BIGFISH_TEST_LAYER 注入（命令面无层 flag）+ TAP duration 解析 + SLOW-UNREGISTERED 硬红。
- `scripts/test-integration.js`（78 行）集成层运行器：逐场景 spawn + --only + 摘要行（SCENARIO 行运行器统一打印，S3 子态行场景打印）。
- `tests/layer.js`（26 行）slow()/isFastLayer()。
- `tests/integration/harness.js`（170 行）隔离 userData/DSH_HOME + settings 种子 + 桩启停 + 里程碑等待 + 杀树 + `BIGFISH_TEST_NO_NOTIFY` 注入（修偏后）。
- `tests/integration/s1-app-start.scenario.js`（68 行）/ `s2-pet-main-path.scenario.js`（90 行）/ `s3-update-gate.scenario.js`（96 行）。
- `.github/workflows/gates.yml`（28 行）windows-latest + push/PR/dispatch + 三步只调 npm script（无裸命令）。

**修改 4 档**：
- `package.json` +4 scripts（lint/test/test:full/test:integration，字面值照任务书）；依赖块零 diff。
- `tests/b12-plugin-guards.test.js` +2 行（TC-82 机械改标 slow()，正文零改动；491→492 行，任务书预计 493 = 计数口径差（末行换行），实际 diff +2 行）。
- `tests/update-stub.mjs` +24 行：`?latest=<version>` 只读参数（registryMetaFor；缺省逐字返回 REGISTRY_META = 零行为变更）。
- `shell-notify.js` +3 行（**修偏轮，见下**）：BIGFISH_TEST_NO_NOTIFY 开关 + notify() 首行短路。

**修偏轮 1（实机发现 → 测试卫生，2026-09-18）**：用户桌面弹真实通知「发现 Harness 新版本 v0.1.9」——S3b 桩 latest=0.1.9 让真启动 app 走 showHarnessUpdateBubble → notifier.notify → new Notification().show()（`shell-notify.js:49-58` notify = 通知唯一出口）✗。
- **改前**：场景无通知抑制 ⇒ 真通知弹出（且真实注册表无 0.1.9，误导用户以为有真更新）。
- **改法**：`shell-notify.js` 增测试开关 `BIGFISH_TEST_NO_NOTIFY=1`（启动时读一次，notify() 首行短路；默认关 = 生产零影响）；`harness.js scenarioEnv` 注入该 env（S1/S3 真启动场景全带）。notifier 无注入面（shell-update.js:12 顶层 require）⇒ 注入须改 main.js（B20 修偏在飞，禁碰）⇒ 按主 agent 明示手段 ② 落。
- **判据（改后实测）**：① `npm run test:integration` 三场景全 PASS（S3b PASS + 断言面 = 日志行，不依赖通知 ⇒ AC-B16-4 不受影响）；
  ② 真实 `%APPDATA%\Bigfish\updater.log` mtime 停在 2026-09-18T07:40:38Z（用户自己手动检查的时点），修后整轮重跑 08 时段零新增行
  ⇒ userData 隔离成立（隔离性再核通过：改前真实 updater.log 今天 07 时段 15 行全为 reason=manual/latest=0.1.5-rc.2 = 用户手动操作，
  无任何 reason=startup/0.1.9 行）；③ 45 用例回归绿；④ `node --check shell-notify.js` 过。

**本地三条门终态（as-of 2026-09-18，含内部审计修正后）**：
- `GATE lint FAIL checks=6 selftest=14/14`——**红仅来自基线外撞面**（见上报；3 档在飞批次新档超宽，本批自身 0 新增违规）。
  六条 CHECK：syntax 62 档 0 失败 / width 红 3 档（均为在飞批次档）/ lines PASS（near=3：market.js 500 · updater.js 497 · b12 492）/
  dag 0 环 / fanout frozen=6 / **assembly PASS (13/13)** + exempt=2（审计 F2 修正：摘要串改回设计档 AC-B16-8 钉死串形，免检另计一行）。
  本批 11 个新 .js 全部首行 'use strict' + JSDoc 含设计档全路径指针 + 行宽 0 违规 + 行数全部 ≤500（门禁扫自己过）。
- `GATE test:full PASS pass=45 fail=0 skipped=0 ms=1476`；`GATE test PASS pass=44 fail=0 skipped=1 ms=651`（TC-82 skip）。
- `GATE test:integration PASS scenarios=3 pass=3 fail=0`（S1/S2/S3a/S3b 全 PASS）。

**内部审计与自修正（交付前，同日）**：内部 explore 偏离审计发现 2 项，均已当场修复：
- **F1**：本档 §5 初稿两行超宽（L323/L330，367/556 字符）——门禁扫自己撞上（审计时 lint 实为 4 档红而 §5 上报只计 3 档）⇒ 已折行，
  §5 段超宽归零（实测复扫 0 行）；「上报 3 档」现在准确。
- **F2**：run.js 摘要串 `(15/15)` ≠ 设计档 AC-B16-8 钉死的 `(13/13)`（免检计入致串形漂移，§6 核销按设计串 grep 会落空）⇒ 已改
  `(N/N)` 动态取 init 绑定数（当前实测 13）+ 免检另计一行 `CHECK assembly exempt=2 …`，与设计串同形且不陈旧。

**⚠️ 上报（基线外撞面，须主 agent 裁定）**：lint 门 width 判红 3 档 = 在飞批次在本批基线冻结后落盘的新档超宽行——
`docs/batches/B26-pet-feel.md`（13 行：L32/L193/L197-L205/L207/L208）· `docs/design/PET-ANIMATION.md`（3 行：L841/L966/L1048）·
`docs/design/PET-MOVEMENT.md`（6 行：L199/L565/L622/L623/L665/L756）。
git log 佐证 = B26 立案 52d4c46（15:10）+ B26 设计落档 bfa5bb1（15:18）+ B21 需求档 7f41764 + B20 收口 3ef561d（14:56）——
均在本批基线实测（14:42 前后）之后、非本批产出。基线 hardRule（A.2.2.6 判定规则 1：不得冻结新增违规）⇒ 不入 baseline.json；
判红是「新增即拦」的正确行为 ⇒ 遵「不静默放行」纪律上报，处置选项：① 由归属批次清偿（B26/B21 落超宽行归 T13 族）
② 主 agent 裁定重取当日实测基线（须按判定规则 3 登记）③ 其它。本批不自行选 ①②③。

**实机项状态（§2.7）**：R1 CI 真绿 = 未证（须一次真实 push/PR，主 agent 核销）；R2 集成层 CI runner 可跑性 = 未证（本地三场景全绿；CI 面首跑后判）。R3 基线 = 已按当日实测建档；基线后新落超宽见上「上报」。R4 market.js 贴线 = 未触碰 ✓。

**自证夹具（A.2.2.2）**：mkdtemp(os.tmpdir()/b16-gate-*) + 判据函数参数化 root/baseline + try/finally rmSync——夹具根不在仓库根下 ⇒ 不在扫描面；开发中曾建 `.thincoder-s2-probe.js`（仓库根探针）已删净（git status 零残留）✓。

**内部代码评审轮（交付前，advisor 同步短轮，同日）**：评审超时（600 s 预算耗尽于 11 轮工具调用）但产出已验证发现；提炼后 4 项当场修复、3 项处置如下：
- **修 ①（D③ 陈腐免检检测缺失）**：设计 A.2.2.6 判定规则 2 明文「免检档已获 init ⇒ 红」未实现——原实现里免检档获 init 后走 calls===1 ⇒ ok++ 静默放行。
  已修（checks.js checkAssembly）：免检条目两态陈腐检测（已不在绑定面 / 已获 init 调用 ⇒ `VIOLATION assembly stale-exempt`）。
- **修 ②（场景日志卫生）**：S2 从不清理（成功也不清）+ 三场景不在启动时清日志 ⇒ 失败重试可被上一轮陈旧行满足（假 PASS 面，append 日志全文 match）。
  已修：harness.scenarioEnv 启动时清空观测日志（bigfish.log / updater.log / pet-geometry.log）+ S2 成功后 cleanupScenario（对齐设计「成功后清理」）。
- **修 ③（test-run fail-open）**：TAP 摘要解析不出用例数时原实现可打出 `GATE … PASS pass=0`（报告器格式漂移 ⇒ 假绿）。已修：`tap-summary-unparseable` ⇒ 退出 2（fail-closed）。
- **修 ④（init 计数按行不按次 + 注释失实）**：同行双调用漏计（`test()` 布尔计行）；注释谎称「带 g 标志」。已修：逐行 `match(g)` 按出现次数计。
- **修 ⑤（S2 无内部上限）**：设计 A.2.2.4 S2 上限 60 s 无强制（仅运行器 90 s 外层）。已修：whenReady 内 60 s 超时定时器判红。
- **修 ⑥（S3b 负向断言 TOCTOU）**：install-phase 缺席断言紧随正向行 ⇒ 异步自动安装可逃窗。已修：负向断言前 3 s 沉降窗。
- **修 ⑦（electron require 无兜底）**：test-integration require('electron') 裸崩则无 GATE 行。已修：try/catch ⇒ `FAIL reason=electron-not-resolvable` 退出 2。
- **不修（如实报）**：a) `# SKIP` 正则——复核原实现即带空格（`/# SKIP/`），advisor 转述有误，非缺陷；
  b) killTree POSIX 面回落单杀（未 detached ⇒ 组杀恒 ESRCH）——CI=windows-latest、主战场 Windows，POSIX 面为 best-effort
  （设计明文「Windows taskkill /T /F；POSIX 进程组」实现形态一致）；c) run.js 摘要行硬编 14（selftest TC 数）——TC 数变才需同步，
  属低危常量；d) CI 冷 runner 可跑性（dsh-bundle 安装面）= §2.7 R2 实机项，首跑后判，不在本地证。
- **评审后终态复跑**：三场景全 PASS（S1/S2/S3a/S3b + GATE test:integration PASS scenarios=3 pass=3 fail=0）——S2 曾因修偏过程中的编辑失误（let→const 赋值冲突）短暂 FAIL 一次，当即修复（const firstLog / const log 两处独立声明）并复跑绿。

## §6 验收核销（主 agent）

### 6.1 验收结论（2026-09-19）

**发布门 0/3 → 3/3 全部落地并通过（本地亲跑 + **CI 真绿**）**：

| 面 | 证据 | 结论 |
|---|---|---|
| ① `lint`（六判据 + 结构三条） | 本地 `GATE lint PASS checks=6 selftest=14/14`；六 CHECK = syntax / width / lines / dag（0 环）/ fanout / **assembly（13/13 + exempt=2）** | ✓ |
| ② `test:full` | `GATE test:full PASS pass=45 fail=0 skipped=0` | ✓ |
| ③ `test:integration` | `GATE test:integration PASS scenarios=3 pass=3 fail=0`（S1 / S2 / S3a / S3b） | ✓ |
| **④ CI 真绿（实机项 R1）** | **用户 2026-09-19 09:02 截图**：GitHub Actions `gates` **×3 runs 全绿**（#3 = `4f5d425`，1m 52s；#1 / #2 = 早前两次推送） | ✓ |
| **⑤ 冷 runner 可跑性（实机项 R2）** | 同上——三次 run 均在 GitHub 托管 runner 上跑通（含 `dsh-bundle` 安装面）⇒ §2.7 R2 实证 | ✓ |
| ⑥ fail-closed 验证 | 故意破坏 ⇒ 门禁拦住 ✓（实施期实测） | ✓ |
| ⑦ 基线机制 | `scripts/gates/baseline.json`：同日实测冻结 + **`expires` 逐条写死消解路径** + `hardRule`（不得冻结新增违规） | ✓ |

### 6.2 验收边界（如实）

- **存量豁免带消解期** ✓：width 15 档/93 行（→ T13 消解路径）；fanout 6 档（→ 存量降 ≤3；**消解面转 T45**——T39 判据已落地，存量不随 T39 归档而消失）；assemblyExempt 2 档（有 `why`，属形态说明非违例）。
- **`Build` 工作流不在本批验证面**（本批 = `gates` 接线；`Build` 的触发面非本批范围）。
- **§5 的「基线外撞面」上报已消**：当事批次（B26 / B21 族）的超宽行已由归属批次清偿 ⇒ 现状 `CHECK width PASS` ✓。

### 6.3 收口处置（测试纪律）

- 本批产出 = **常驻门禁基建**（`scripts/gates/**` · `scripts/test-run.js` · `scripts/test-integration.js` · `tests/integration/**` · `.github/workflows/gates.yml`）⇒ **不退役** ✓。
- 开发期夹具（`mkdtemp` + try/finally）不落仓库；实施期临时探针已删净（§5）✓。

### 6.4 台账与地图同步（D7）

- **T4 / T26 / T37 / T39 → 已核销**（移入 `docs/TODO-archive.md`）；新增 **T45**（fanout 存量 6 档消解，归 B17）；
- 地图本行状态 → **已收口 + 核销**；
- **待同步项（已派）**：`AGENTS.md` §三 的「现状 = 0/3」与目标段（该档自注「随 B16 实施后同步」）⇒ eng-designer 微轮同步（同批登记）。
