# Bigfish 需求池 / 技术待办（docs/TODO.md）

> 本档是本仓的**需求池**与**技术待办**台账。一条一行，不展开任务细节。
> - 需求池条目（用户需求点）挂「需求档节 + 批次档 §2」；技术待办挂「归属档节 + 最小证据行（file:line + 症状）」。
> - `status` 只取六态：**待讨论 / 待设计 / 在途 / 待核销**（活文件只留未决四态）；**已核销 / 已废弃**为归档态，勾销后逐条移入 `docs/TODO-archive.md`。
> - 技术待办每条带一种触发：`触发=归批（<批名>）` / `触发=条件（<条件句>）` / `触发=认账不排期`；无触发者进「待处置」清单，行龄超 30 天标「老化」。

---

## 一、需求池（用户需求点）

| # | 条目 | 需求档节 | 批次档 §2 | status | 触发 |
|---|---|---|---|---|---|
| R1 | 桌宠拖拽跟手修复（Windows） | `docs/requirements/PET.md` §三 US-1…US-8 / §四 NFR-1…NFR-4 | `docs/batches/B01-pet-drag-follow.md` §2 | 在途 | 归批（B01） |
| R2 | 自动更新：App 本体（含内置技能/插件随包更新）+ Harness（npm latest）+ 已装插件（注册表版本对比）；更新源统一迁 Gitee | `docs/requirements/UPDATE.md` §一 / §三 US-1…US-9 | `docs/batches/B02-auto-update.md` §2 + `docs/batches/B04-harness-activate-fix.md` §2 | 待核销 | 归批（B02 实施 + B04 AC9 修复轮）——真机复测 AC9 通过（B04 §6.2）；剩 AC5/AC10/AC11/AC12 为发布门项（见 T8） |
| R3 | App 更新安装包清理——已下载完成的安装包不在磁盘累积（下次启动回收，不在安装器运行时删） | `docs/requirements/UPDATE.md` §三 US-10 | `docs/batches/B05-installer-cleanup.md` §2 | 在途 | 归批（B05） |
| R4 | 桌宠多屏几何（多屏丢失 / 跨屏尺寸与抓取点 / 落点校正） | `docs/requirements/PET.md` §三 US-9…US-14 / §四 NFR-5…NFR-8 | `docs/batches/B03-pet-multimonitor.md` §2 | 在途 | 归批（B03 实机验收——13 轮修正均机检结，但实机面未跑，见 T9） |

## 二、技术待办

| # | 条目 | 归属档节 | 最小证据（file:line + 症状） | status | 触发 |
|---|---|---|---|---|---|
| T1 | 桌宠右键语义修正——右键按下也走 `clicked()` 路径，导致右键**同时**切换主窗口并打开兑换屋 | `docs/design/PET-DRAG.md` §2.5 观察项 F2 | `pet.js:56-74` —— `mousedown` 无按键判断，右键松开时 `!moved` 成立即调 `clicked()` | 待设计 | 归批（B06） |
| T2 | `main.js` 拆分——单文件承载 6 个功能域（后端生命周期 / 桌宠 / 好感度 / 模式背景 / 插件引擎 / 应用编排） | `docs/design/PET-DRAG.md` §2.5 观察项 F4 | `main.js` 全文件 1985 行（B01 实施后；实施前 1877 行）；各功能域混居，改任一处都需通读全档 | 待设计 | 条件（B01 收口后评估） |
| T4 | 无自动化测试基建 | `docs/design/PET-DRAG.md` §3.3 | `package.json:13-21` scripts 无 `test`（= start/pack/dist/dist:win/mac/linux/icons/make-latest）；现存 `tests/` 三文件（update-lib.test.js / update-stub.mjs / harness-store.test.js）为开发期工具、非仓门禁 | 待讨论 | 认账不排期 |
| T5 | 发版流程说明缺 `make-latest` 步骤——手工改 `latest.json` 会留空 sha256，客户端 fail-closed 拒装新版本 | `docs/design/AUTO-UPDATE.md` §2.2.8 | `latest.json:11-13` —— sha256 三平台为空串；`package.json` scripts 已有 `make-latest` | 待讨论 | 条件（下次 App 发版前） |
| T7 | 打包前置未落档且未纳入版本控制：`node-runtime/` 与 `dsh-bundle/node_modules/` 均被 `.gitignore` 排除，README 只说「自带 Node（node-runtime/）」未说如何准备——全新克隆打不出可运行安装包 | `README.md` §打包 / §运行时选择 | `.gitignore:4`（`node-runtime/`）、`.gitignore:1`（`node_modules/`）；`git ls-files node-runtime` 实测为空 | 待讨论 | 条件（发版流程文档化时） |
| T8 | 首次真实发版演练清单：`make-latest.js` 正例（AC11）· 真实安装+自动拉起（AC5）· 市场更新徽标（AC10）· 更新前后 `~/.dsh` 关键面快照（AC12） | `docs/design/AUTO-UPDATE.md` §2.2.8 / §3.1 | `docs/batches/B04-harness-activate-fix.md` §6.3 —— 四项均为发布门项，本地构建不可闭环；⚠️ 禁用本地构建产物跑 `make-latest.js` 覆盖 `latest.json`（sha256 会与 Gitee 实附件不符 → 用户拒装） | 待讨论 | 条件（首次真实发版时） |
| T9 | **跨屏瞬间「上下突跳」的实机验证**（第 13 轮已修，仅机检） | `docs/design/PET-MULTIMONITOR.md` §3.1 S8 · §3.2 TC-31 · `docs/batches/B03-pet-multimonitor.md` §6.3-1 / §6.4 | `main.js:1250` —— 尺寸写入已改 `setBounds({ width, height })`（不传位置）+ 位置校验 / 条件回写；桩测 189/189 结，但**本机无混合 DPI 三屏硬件，实机未验**；判据 = 尺寸型 `geom-fix` 行的 `\|pos-after − pos\| ≤ 1 DIP`；另 E8（partial 矩形语义）为文档明证未实机取证 | 待核销 | 条件（用户三屏实机验收时，兼 B03 的 TC-23/24/27/29/30/31） |

---

## 三、待处置（无触发，待人工裁决）

（当前无条目）
