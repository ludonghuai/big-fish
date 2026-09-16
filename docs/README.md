# 文档地图 — docs/

本仓文档体系入口。新读者按「需求档 → 设计档 → 批次档」的顺序读。

## 一、落点约定

| 层 | 落点 | 说明 |
|---|---|---|
| 需求档 | `docs/requirements/<板块>.md` | 一板块一档；本仓板块 = 桌宠（PET）、自动更新（UPDATE）、**桌面壳（SHELL）** |
| 设计档 | `docs/design/<主题>.md` | 一主题一档，按「需求层 / 设计层 / 测试层 + 变更记录」组织 |
| 批次档 | `docs/batches/<批次号>-<主题>.md` | 按六段制组织，每段一位作者（append-only） |
| 提示词（产品代码，非文档层） | `bundled-skills/*.md`（5 个） | 随软件打包，经 `main.js` 的 `DSH_BUNDLED_SKILL_DIR` 环境变量注入后端（取值 = `bundledSkillDir()`；行号只作 as-of 参考：`main.js:149`，as-of 2026-09-16）；改动属产品代码，不走文档流程 |
| 台账（需求池 / 技术待办） | `docs/TODO.md`；归档档 `docs/TODO-archive.md`（按需生成） | 一条一行，不展开任务细节；需求池条目挂「需求档节 + 批次档 §2」、技术待办挂「归属档节 + 最小证据行」；`status` 六态（活文件只留未决四态），已决条目移入归档档 |

## 二、当前文档

| 文档 | 层 | 状态 | 内容 |
|---|---|---|---|
| `docs/requirements/PET.md` | 需求档 | 生效 | 桌宠板块需求：拖拽跟手（US-1…US-8、NFR-1…NFR-4，B01）＋ 多屏几何与可见性（US-9…US-14、NFR-5…NFR-8，B03） |
| `docs/requirements/UPDATE.md` | 需求档 | 生效 | 自动更新板块需求：App 本体 / Harness 后端 / 已装插件 / 发布侧（条目 US-1…US-10、NFR-1…NFR-4；B02 ＋ B05 修订面） |
| `docs/design/PET-DRAG.md` | 设计档 | 已批准并实现 | B01 批次拖拽跟手设计（选型对比 / 契约 / 受影响文件 / 决策 / 用例表） |
| `docs/requirements/SHELL.md` | 需求档 | 生效（B06：待用户发起评审） | 桌面壳板块需求：启动形态 / 托盘 / 窗口 / 桌宠交互入口 / 更新门禁 / `main.js` 拆分 / 无用文件清理（US-1…US-8、NFR-1…NFR-4；B06） |
| `docs/design/PET-MULTIMONITOR.md` | 设计档 | 已批准（实施中，含 E6 证伪后的设计修正轮） | B03 批次桌宠多屏几何与可见性设计（取屏策略 / DPI 口径 / 跨屏拖重锚 / 持久化与找回 / 用例表 TC-1…TC-28）；设计评审已通过、修正轮已落地并经用户批准；E6 实证收口后的设计修正轮（尺寸策略重写）已落档，实施进行中 |
| `docs/design/AUTO-UPDATE.md` | 设计档 | 已批准并实现（B05 面核销于 2026-09-16；B02 / B04 面状态见各自批次档 §6） | 自动更新设计（App 本体 / Harness / 插件 / 发布侧）；回指 `docs/requirements/UPDATE.md` 的 US-1…US-10、NFR-1…NFR-4；关联批次 B02 / B04 / B05；**B06 dev 门禁口径修订的 §2.2.7 / §2.2.9 同步待收口**（B06 设计档观察项 O1） |
| `docs/design/SHELL-UX.md` | 设计档 | 待评审（设计已落） | B06 桌面壳设计：需求层回指（US-1…US-8、NFR-1…NFR-4） / 选型 A–F（桌宠按键·托盘结构·启动形态·更新门禁·拆分方案·清理范围）/ 契约与结构（含 15 模块拆分与迁移） / 受影响文件全清单 / DD-1…DD-15 / 冲突点核对与观察项 / U-1…U-9 / AC1–AC8 + TC-1…TC-23 |
| `docs/batches/B01-pet-drag-follow.md` | 批次档 | 在途 | B01 批次六段记录（§1 立案 … §6 核销） |
| `docs/batches/B02-auto-update.md` | 批次档 | 他会话在途（状态未经本会话核实） | B02 批次六段记录（自动更新：App 本体 / Harness 后端 / 已装插件） |
| `docs/batches/B03-pet-multimonitor.md` | 批次档 | 在途（实机验收面待用户） | B03 批次六段记录（§1–§6 全落：立案 / 任务书 / 设计评审 / 评审裁决 / 实施记录 §5.1–§5.11 / 验收核销 §6.1–§6.7）；跨屏突跳（第 13 轮）与多屏实机验收待用户三屏环境（见 `docs/TODO.md` T9） |
| `docs/batches/B04-harness-activate-fix.md` | 批次档 | 他会话在途（状态未经本会话核实） | B04 批次六段记录（Harness 更新激活修复：junction 失效） |
| `docs/batches/B05-installer-cleanup.md` | 批次档 | 已核销（2026-09-16） | B05 批次六段记录（App 安装包清理：§1 立案 / §2 任务书与 §2.7·§2.8 更正 / §3 设计评审两轮 pass / §4 裁决与批准（§4.6·§4.7）/ §5 实施记录 / §6 验收核销）；代码改动 = `updater.js`（486 → 497 行）；台账 R3 已核销归档 |
| `docs/batches/B06-shell-ux.md` | 批次档 | 待评审（§1 立案 + §2 任务书已落） | B06 批次六段记录（桌面壳 UX 整合：启动形态 / 桌宠左右键语义 / 删新手向导 / 托盘重排 / 更新门禁口径 / `main.js` 拆分 / 无用文件清理（F7））；需求档 `docs/requirements/SHELL.md`、设计档 `docs/design/SHELL-UX.md` 已新建；§3 待评审写入 |
| `docs/TODO.md` | 台账 | 生效 | 需求池（R1 / R2 / R4 / R5 / R6，5 条；R3 已核销、在归档档）与技术待办（T1 / T2 / T4 / T5 / T7 / T8 / T9 / T10，8 条；T3 / T6 已核销、在归档档）：一条一行，挂需求档节 + 批次档 §2 / 归属档节 + 最小证据行；归档档 = `docs/TODO-archive.md` |

## 三、三档之间的关系

- 需求档是需求条文的**唯一权威源**；设计档**回指**需求条目，不重述需求条文。
- 批次档 §2 的本批条目 = 设计档验收标准回指的条目 = 需求档条目——三者必须同源。
- 设计档内的验收勾销状态写批次档 §6，设计档本身不记录勾销状态。

## 四、变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-16 | B06 设计落档与地图登记：新增 `docs/requirements/SHELL.md`（需求档，143 行）与 `docs/design/SHELL-UX.md`（设计档，568 行）两行 + B06 批次档行改「待评审」（§1–§2 已落，§3 待评审写入）；§一 落点约定本仓板块补「桌面壳（SHELL）」；`docs/design/AUTO-UPDATE.md` 行登记 B06 门禁口径同步待收口（O1）。 |
| 2026-09-16 | B06 立案与台账登记：新增需求池 **R5**（桌面壳 UX 整合，归批 B06）/ **R6**（`main.js` 拆分，归批 B06）；技术待办 **T1 / T2 证据行按实测对账**（`pet.js:98/117/125`、`main.js:2831` 行，T2 触发改「归批（B06）」）、新增 **T10**（harness bundle 落后 5 个 rc + dev 不读活跃指针，归批 B07 待立）；地图补 `docs/batches/B06-shell-ux.md` 行（待设计）；`docs/requirements/SHELL.md` 与 `docs/design/SHELL-UX.md` 两行待其落档后补登。 |
| 2026-09-16 | B05 核销同步（D7）：B05 批次档行改「已核销（2026-09-16）」并补六段落点；B03 批次档行「§4 与 §6 待落」更正为 §1–§6 全落（实机验收面待用户，T9）；`docs/TODO.md` 行——需求池 R1 / R2 / R4（3 条）、技术待办 7 条（补 T9）；UPDATE 档与 AUTO-UPDATE 档行去占位（生效 / 已批准并实现）。 |
| 2026-09-16 | B03 设计评审修正轮（发现 #11）：补台账层落点约定一行与 `docs/TODO.md` 登记行（状态：生效）；同步 `docs/design/PET-MULTIMONITOR.md` 登记行的用例表计数（TC-1…TC-18 → TC-1…TC-20）。 |
| 2026-09-16 | B03 状态同步：`docs/design/PET-MULTIMONITOR.md` 行状态由「待评审」改为「已评审待批准」（设计评审已通过 + 修正轮已落地，待用户批准）；`docs/batches/B03-pet-multimonitor.md` 行补记「§1–§3 已落、评审修正轮已落地」。纯状态同步，无语义改动。 |
| 2026-09-16 | B03 连带收口同步（计数 / 状态 / 指针；无语义改动）：B03 设计档行——用例表 TC-1…TC-20 → TC-1…TC-28、状态改「已批准（实施中，含 E6 证伪后的设计修正轮）」；B03 批次档行——§5 实施记录已落（§4 / §6 待落）；`docs/TODO.md` 行——需求池 → R1…R3（3 条）、技术待办 → 6 条（T3 / T6 已核销）；§一 落点约定的本仓板块补「自动更新（UPDATE）」；提示词行 `DSH_BUNDLED_SKILL_DIR` 指针 `main.js:136` → `main.js:149`。 |
| 2026-09-16 | 评审前档面对齐（主 agent 裁定；无语义改动）：① 地图补 5 行——`docs/requirements/UPDATE.md`、`docs/design/AUTO-UPDATE.md`、`docs/batches/B02-auto-update.md`、`B04-harness-activate-fix.md`、`B05-installer-cleanup.md`；状态列统标「他会话在途（状态未经本会话核实）」。② 提示词行改按符号名 `DSH_BUNDLED_SKILL_DIR` 定位（行号只作 as-of 参考，D4）。§一 板块枚举无需补。 |
