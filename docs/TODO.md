# Bigfish 需求池 / 技术待办（docs/TODO.md）

> 本档是本仓的**需求池**与**技术待办**台账。一条一行，不展开任务细节。
> - 需求池条目（用户需求点）挂「需求档节 + 批次档 §2」；技术待办挂「归属档节 + 最小证据行（file:line + 症状）」。
> - `status` 只取六态：**待讨论 / 待设计 / 在途 / 待核销**（活文件只留未决四态）；**已核销 / 已废弃**为归档态，勾销后逐条移入 `docs/TODO-archive.md`。
> - 技术待办每条带一种触发：`触发=归批（<批名>）` / `触发=条件（<条件句>）` / `触发=认账不排期`；无触发者进「待处置」清单，行龄超 30 天标「老化」。
> - **行宽约定（项目声明，2026-09-17 用户裁定 A）**：本档（台账）与 `docs/README.md`（文档地图）的**表格行不受「无 >300 字符单行」约束**——「一条一行、指针化、不展开细节」是本档的根本形态；该行宽约束适用于需求档 / 设计档 / 批次档等叙述性文档。

---

## 一、需求池（用户需求点）

| # | 条目 | 需求档节 | 批次档 §2 | status | 触发 |
|---|---|---|---|---|---|
| R1 | 桌宠拖拽跟手修复（Windows） | `docs/requirements/PET.md` §三 US-1…US-8 / §四 NFR-1…NFR-4 | `docs/batches/B01-pet-drag-follow.md` §2 | 在途 | 归批（B01） |
| R2 | 自动更新：App 本体（含内置技能/插件随包更新）+ Harness（npm latest）+ 已装插件（注册表版本对比）；更新源统一迁 Gitee | `docs/requirements/UPDATE.md` §一 / §三 US-1…US-9 | `docs/batches/B02-auto-update.md` §2 + `docs/batches/B04-harness-activate-fix.md` §2 | 待核销 | 归批（B02 实施 + B04 AC9 修复轮）——真机复测 AC9 通过（B04 §6.2）；剩 AC5/AC10/AC11/AC12 为发布门项（见 T8） |
| R4 | 桌宠多屏几何（多屏丢失 / 跨屏尺寸与抓取点 / 落点校正） | `docs/requirements/PET.md` §三 US-9…US-14 / §四 NFR-5…NFR-8 | `docs/batches/B03-pet-multimonitor.md` §2 | 在途 | 归批（B03 实机验收——13 轮修正均机检结，但实机面未跑，见 T9） |
| R10 | 任务完成提醒**迟滞太久**——「早就做完了结果才发消息」；机制 = 末次写入后**空闲 30 s** 才提醒（`main.js:49` `IDLE_NOTIFY_MS = 30 * 1000`）+ 判据 `now - lastBusyAt > IDLE_NOTIFY_MS`（`shell-notify.js:132`），忙信号只看 `~/.dsh` 下非 `profiles`/`node_modules` 的写入 ⇒ 提醒时刻与真实完成时刻脱钩 | `docs/requirements/SHELL.md` §三（待落——归批时由 eng-designer 落；本批 US-11 明文锁定「阈值 30 s 不改」⇒ **新需求点**） | （B09——待立批） | 待讨论 | 归批（B09——待立批；主 agent 2026-09-17 已定向 = **缩短阈值**（取值与误报边界由设计定），用户可指定快车道） |

## 二、技术待办

| # | 条目 | 归属档节 | 最小证据（file:line + 症状） | status | 触发 |
|---|---|---|---|---|---|
| T4 | 无自动化测试基建 | `docs/design/PET-DRAG.md` §3.3 | `package.json:13-21` scripts 无 `test`（= start/pack/dist/dist:win/mac/linux/icons/make-latest）；现存 `tests/` 三文件（update-lib.test.js / update-stub.mjs / harness-store.test.js）为开发期工具、非仓门禁 | 待讨论 | 认账不排期 |
| T5 | 发版流程说明缺 `make-latest` 步骤——手工改 `latest.json` 会留空 sha256，客户端 fail-closed 拒装新版本 | `docs/design/AUTO-UPDATE.md` §2.2.8 | `latest.json:11-13` —— sha256 三平台为空串；`package.json` scripts 已有 `make-latest` | 待讨论 | 条件（下次 App 发版前） |
| T7 | 打包前置 `node-runtime/` 已落档 + 本机备齐：README §打包 增补三步准备法（Node 22 zip 取 `node.exe`；`pnpm@10` 取 `dist/pnpm.cjs` + 一行 ESM 壳 `pnpm.mjs`；npmmirror 镜像环境变量）；本机 `node-runtime` = Node v22.20.0 + pnpm 10.34.5（2026-09-16），`dist:win` 产出 `Bigfish.Setup.0.0.1.exe`（157.2MB）冒烟通过（内置 node 拉起 dsh 后端、内置 pnpm 跑通 harness 自更新安装）；`node-runtime` 维持不入库（平台二进制） | `README.md` §打包 | `node-runtime/node.exe` + `node-runtime/pnpm/{pnpm.mjs,pnpm.cjs}` 实测可用；`dist/win-unpacked` 冒烟：`node-runtime\node.exe …\dsh\lib\bin.js --profile web` 存活 | 待核销 | 条件（用户复核 README 步骤 / 下次换机打包复现） |
| T8 | 首次真实发版演练清单：`make-latest.js` 正例（AC11）· 真实安装+自动拉起（AC5）· 市场更新徽标（AC10）· 更新前后 `~/.dsh` 关键面快照（AC12） | `docs/design/AUTO-UPDATE.md` §2.2.8 / §3.1 | `docs/batches/B04-harness-activate-fix.md` §6.3 —— 四项均为发布门项，本地构建不可闭环；⚠️ 禁用本地构建产物跑 `make-latest.js` 覆盖 `latest.json`（sha256 会与已发布实附件不符 → 用户拒装） | 待讨论 | 条件（首次真实发版时） |
| T9 | **跨屏瞬间「上下突跳」的实机验证**（第 13 轮已修，仅机检） | `docs/design/PET-MULTIMONITOR.md` §3.1 S8 · §3.2 TC-31 · `docs/batches/B03-pet-multimonitor.md` §6.3-1 / §6.4 | `main.js:1250` —— 尺寸写入已改 `setBounds({ width, height })`（不传位置）+ 位置校验 / 条件回写；桩测 189/189 结，但**本机无混合 DPI 三屏硬件，实机未验**；判据 = 尺寸型 `geom-fix` 行的 `\|pos-after − pos\| ≤ 1 DIP`；另 E8（partial 矩形语义）为文档明证未实机取证 | 待核销 | 条件（用户三屏实机验收时，兼 B03 的 TC-23/24/27/29/30/31） |
| T10 | harness bundle 落后 5 个 rc（`0.1.0-rc.6` vs 注册表最新 `0.1.5-rc.1`，2026-09-10 发布）。**原条目后半段「dev 的 `dshBinPath()` 固定走 bundle ⇒ harness 自更新在 dev 不生效」已被 B06 F5 覆盖**——现 `shell-backend.js` 活跃指针优先、dev 与打包同口径，且已实测生效（`updater.log` 2026-09-17：dev 侧完成 0.1.0-rc.6 → 0.1.5-rc.1 安装 + 激活 ok=1） | `docs/design/AUTO-UPDATE.md` §2.2.1（路径口径） | `dsh-bundle/package.json:7`（精确钉 `0.1.0-rc.6`）；`shell-backend.js:52`（活跃指针优先）；registry 实查 = `0.1.5-rc.1` | 待设计 | 归批（**B08**——B07 已被「Harness 鉴权兼容 + 桌面壳收尾」占用；**前置** = 依赖脚本 / 锁文件那摊收口；须冒烟 dev + 打包双态；保持精确钉版本） |
| T13 | 文档一致性收口（**④ 为唯一残余**；①②③ 已由 B07 收口）——`AUTO-UPDATE.md` 3 行 >300 字符（行宽规范，纯字符口径） | `docs/design/AUTO-UPDATE.md` 全文行宽 | 纯字符口径超 300 = `:53`（366）/`:698`（309）/`:853`（321）；`:53`/`:698` 为 HEAD 即存；**`:769` 恰 300 字符（合规；CRLF 档倒计入会被误报为 301）** | 待讨论 | 条件（用户裁定处置时机；出批项） |
| T14 | 好感度「真实消耗」读面疑长期失效——`shell-affinity.js` 读 `<DSH_HOME>/storages/session_projcache.json`，而本机该文件不存在 ⇒ `sumSessionTokens()` 恒走 catch 返回 null，基于真实 token 消耗的好感度不累积（喂食加成不受影响） | `docs/design/SHELL-UX.md`（SHELL 板块；B07 观察项 O15 提请） | `shell-affinity.js:70`（读 `storages/session_projcache.json`）；实测 `~/.dsh/storages/ = ['workspace.json']`，`session_projcache.json` **不存在**（2026-09-17） | 待讨论 | 条件（下次动 affinity 域时 / 用户报告好感度不涨时）——需先定位 0.1.5 下会话消耗的真实落点 |
| T16 | 同源面一致性（设计档 §2.2.6 注 S1 ↔ `shell-backend.js` 头注释 ↔ 实测）：① 设计档函数行号 as-of 漂移（记 `:165`/`:105`，实测 `:197`/`:97`）；② 头注释 `dshHome` 序在 `getCurrentDshVersion` 前、而实测相反（`:286` vs `:278`）；③ `getPort` / `init` 枚举口径两档不同形；④ B07 §5.2 三处行号残差（`makeTee` 记 `:237-247` 实测 `:240-248`；A2 记 `:243` 实测 `:245-246`；not captured 记 `:254` 实测 `:257`） | `docs/design/SHELL-UX.md` §2.2.6（注 S1）；`docs/batches/B07-harness-auth-compat.md` §5.2 | 上列四项均已由 B07 收尾轮实测定位（eng-coder 报告 + 主 agent 亲扫） | 待讨论 | 归批（B08——或与下次动 `shell-backend.js` / §2.2.6 的轮次同轮；四项均属「同一清单的多面同形」类，一次对齐可全清） |
| T11 | 安装包二进制托管 = GitHub `ludonghuai/big-fish` Releases（Gitee 附件 100MB 上限装不下；0.0.1 实测 157.2MB）；建仓已完成（2026-09-16 公开 + main 双仓同步推送，git 已对 github.com 配 127.0.0.1:7890 代理）；安装包已构建 + `latest.json` sha256 已填（win32 单平台）；**剩用户手动步**：GitHub 网页建 release `v0.0.1` 传 `dist/Bigfish.Setup.0.0.1.exe` → Gitee 建 tag `v0.0.1` → 推送 `latest.json` | `docs/design/AUTO-UPDATE.md` §2.2.2 / §2.2.8 | `dist/Bigfish.Setup.0.0.1.exe`（157.2MB，2026-09-16 构建）；`make-latest.js` 上传清单三步输出 | 在途 | 条件（用户完成 GitHub release 上传后收口并推送 latest.json） |

---

## 三、待处置（无触发，待人工裁决）

（当前无条目）
