# B10 —— 好感度「真实消耗」读面修复

> 六段制批次档（每段一位作者、append-only）：§1 主 agent · §2 eng-designer · §3 评审子代理 · §4 主 agent · §5 eng-coder · §6 主 agent。

## §1 批次立案（主 agent）

### 1.1 立案背景

本仓「基于真实 token 消耗累积好感度」的功能**长期静默失效**：`shell-affinity.js:70` 读 `<DSH_HOME>/storages/session_projcache.json`，该文件在**当前活跃 harness（0.1.5-rc.1）下不存在** ⇒ `readFileSync` 抛错被 `catch { return null }` 吞掉，好感度不因真实消耗增长（喂食加成不受影响）。

### 1.2 任务来源

- 台账技术待办 **T14**（`docs/TODO.md` 技术组）。
- 只读勘察已闭环（子代理，2026-09-17 12:15–12:40；结论见 §1.3），**判定 = 路径/形状写错、数据面存在且可修**，功能无需重定义或移除。
- 用户 2026-09-17 授权：「**你安排，把我们的工作全部继续推进起来**」——由主 agent 排期立批。

### 1.3 勘察结论（证据面，供设计直接引用）

| # | 事实 | 证据 |
|---|---|---|
| ① | 写盘者 = `dsh-session-projection-cache`；`turn/end` **必写**，另有 200 事件 / 5000 ms 节流 | 0.1.5：`.pnpm\@deepseek-ai+dsh-session-pr_*\node_modules\@deepseek-ai\dsh-session-projection-cache\lib\index.js:263-268` · `:290-322` |
| ② | **0.1.5 = per-record 目录布局**：`<DSH_HOME>/storages/session_projcache/sessions/<sessionId>.json`，域版本 **7**，`layout: per-record` | 0.1.5 `…dsh-session-projection-cache\lib\index.js:89-101`（域声明）；`…dsh-storage-json\lib\index.js:575`（布局分发）· `:312-313` · `:464`（`<dir>/<table>/<key>.json`） |
| ③ | **0.1.0-rc.6 = 单文件**：`<DSH_HOME>/storages/session_projcache.json`，无 per-record 支持 | `dsh-bundle\node_modules\@deepseek-ai\dsh-storage-json\lib\index.js:262`；同包 `README.md:5` |
| ④ | 字段形状（两版一致）：`totals` 四桶 + `last.buckets`；per-record 路径 = `record.rows.tokenUsage.val.totals`，旧布局 = `tables.sessions[*].rows.tokenUsage.val.totals`（细节见 §2 / 设计档 §2.2.13） | 0.1.5 token-meter `lib/index.js:415-448` · `:361-366`；bundle 同包 `:241-269` |
| ⑤ | 本机活证据：`~/.dsh/storages/session_projcache/sessions/session-f80ce725-….json`（7827 B，`version:7`）含 `totals = {uncachedInputTokens:9666, outputTokens:2434, cacheReadTokens:37504, cacheWriteTokens:0}` | 子代理实测（2026-09-17） |
| ⑥ | `*.json.bak.<stamp>` 类文件（`invalidRecords:"backup-and-skip"` 产物）名称不以 `.json` 结尾 ⇒ 按 `*.json` 枚举天然排除 | 0.1.5 `…dsh-storage-json\lib\index.js:370-397` |
| ⑦ | **范围外注记（勘察提请）**：`shell-affinity.js:78` 只累加 `uncachedInputTokens + outputTokens`，未计 `cacheReadTokens` / `cacheWriteTokens`；harness 计费口径 = billed input = uncached + cacheRead + cacheWrite | `shell-affinity.js:78`；`dsh-bundle\node_modules\@deepseek-ai\dsh-client-ui-conversation\README.md:43` |

### 1.4 范围（含边界）

**做**：`shell-affinity.js` 的读面与解析——**双形态兼容**（0.1.5 per-record 目录优先 → 旧单文件兜底），保持既有失败语义（取不到即 null、不抛、不影响喂食路径）。

**不做（边界）**：

- **不改 harness**、不改 `~/.dsh` 任何内容（只读）；
- 不新增依赖 / 不新增文件；
- 不改喂食 / 兑换 / 好感度 UI 交互（除非计费口径裁定连带需要，见 §1.5）。

### 1.5 待决点（其一需用户裁定）

| # | 待决 | 状态 |
|---|---|---|
| ① | **计费口径**：好感度按 `uncachedInput + output`（现状）还是按 harness 计费口径 `uncached + cacheRead + cacheWrite + output`（勘察建议） | **已裁定 = B（对齐 harness 计费口径）** —— 用户 2026-09-17 12:19 裁定；依据：与 harness 同源，且本机样本 `cacheRead 37504 ≫ uncachedInput 9666` ⇒ 现口径会大幅低估 prompt 侧消耗 |
| ② | 多会话聚合口径：目录下多个会话文件如何累计（全量累加？按 workspace？仅当前会话？） | 交设计裁定，须给判据 |
| ③ | 旧布局兜底是否保留、保留到何时（消解路径） | 交设计裁定 |

### 1.6 验收标准（初拟，供设计细化并回指需求条目）

| # | 验收标准（可机检） |
|---|---|
| AC1 | 0.1.5 per-record 布局下能读出 `totals` 四桶（真实文件 / 构造夹具皆可，须给命令与期望） |
| AC2 | 旧单文件布局（0.1.0-rc.6 兜底场景）仍可读，两形态切换不抛错 |
| AC3 | 失败语义不回退：路径缺失 / JSON 损坏 / `*.bak` 文件在场 ⇒ 返回 null 且**不影响喂食路径** |
| AC4 | 计费口径按 §1.5 ① 的裁定落地，且给出可机检的累加判据 |

### 1.7 关联

- 需求档：`docs/requirements/SHELL.md`（SHELL 板块）或 `docs/requirements/PET.md`（桌宠板块）——**归属由 eng-designer 判定**（好感度域属谁，须给依据）
- 设计档：`docs/design/SHELL-UX.md`（或 PET 系设计档，同上判定）
- 台账：T14（本批承载）

---

## §2 本批任务书（eng-designer）

### 2.1 本批条目（三方一致源——硬）

| # | 本批条目 | 需求档条目 | 设计档验收 | 交付面 |
|---|---|---|---|---|
| I1 | 好感度数据面读口：读面双形态（per-record 目录优先 / 旧单文件兜底）+ 计费口径 B + 全量聚合 + 水位语义 + 失败语义不回退 | `docs/requirements/SHELL.md` **US-13** | `docs/design/SHELL-UX.md` §3.1 **AC21–AC25** | `shell-affinity.js`（读面）+ `shell-backend.js`（导出面 +1 行）+ 上述两文档 |

> **三方一致**：§2 本批条目（I1）= 设计档 AC21–AC25 回指条目 = 需求档 **US-13**。批次档 §1.6 的 AC1–AC4 → 设计 AC21–AC24（**AC1→AC21 · AC2→AC22 · AC3→AC23 · AC4→AC24**）；**AC25 = §1.5 ②（多会话聚合口径）的裁定面**（§1.6 未列，本批新增）。

### 2.2 §1.5 三项待决 —— 逐项裁定

| # | §1.5 待决 | 本批裁定 | 依据 |
|---|---|---|---|
| ① 计费口径 | **B** = `uncachedInput + cacheRead + cacheWrite + output`（**只读 `totals`，不读 `last.buckets`**；缺桶按 0） | 用户 2026-09-17 12:19 裁定 + §1.3 ⑦；设计 = §2.2.13「累加判据句」/ DD-36 | 判据句与样本算例：`9666 + 37504 + 0 + 2434 = 49604` |
| ② 多会话聚合口径 | **全量累加**（目录下全部可解析记录求和；**不按 workspace / 不按会话过滤**）；单条损坏只跳过该条 | 与旧实现同源（旧面 `tables.sessions[*]` 即全量）+ 水位单调性最好 | 选型 L-2 / DD-35 / DD-37 |
| ③ 旧布局兜底 | **带消解期的条件性保留**（至 **B08 收口点**；到期条件 = 内置 bundle ≥ 0.1.5 ∧ 活跃副本无 < 0.1.5） | 内置 Harness = `0.1.0-rc.6`（单文件布局）⇒ 兜底是**当前出厂路径的活跃形态**，非历史包袱 | DD-39 / US-13「消解期」节 |

**增量语义（`§2` 交代项）**：读面返回**幂等水位**（不写盘、不持状态）；好感度累计值由调用方按**水位差**累加并持久化（`affinity.json`）⇒ **重启不重复计入**（基线每次启动重置 + `usage` 已持久化）。水位下降（会话记录被清理）⇒ 只重置基线、**不扣**好感；读不到任何有效记录 ⇒ 返回 **`null`（不是 0）**——`0` 会把基线降到 0，使读数回升时此前已计入的消耗被**重复计入**。

### 2.3 覆盖需求（US-13 契约逐条 → 设计落点）

| US-13 契约点 | 设计落点（`docs/design/SHELL-UX.md`） |
|---|---|
| 读面双形态 + 形态判别以磁盘事实为准 | §2.2.13「读面判据」①–④ |
| 计费口径 B（四桶、只读 `totals`） | §2.2.13「累加判据句」+ 样本算例 |
| 聚合口径 = 全量累加；逐条容错（可解析记录数 ≥ 1 即可用） | §2.2.13 容错表 + §2.1 选型 L-2 |
| 水位语义（幂等 / 重启不重复计入） | §2.2.13「增量语义」 |
| 失败语义不回退（`null`、不抛、不影响喂食与兑换） | §2.2.13 容错表 + §3.1 AC23 |
| 读面开销（只读单层目录 `sessions/*.json`、不做递归） | §2.2.13「读面开销」+ L-B10-1 |
| 消解期（保留至 B08 收口点 + 到期条件） | §2.2.13 边界 + DD-39 + §2.6 B10 追认块 |

### 2.4 明确出批（本批不做）

- 不改 Harness（`~/.dsh` / `dsh-bundle/` / 更新副本**只读**）；不新增依赖 / **不新增文件**（桩测脚本待裁定，见 §2.8）；
- 不改喂食 / 兑换 / 好感度 UI 与常量（`AFFINITY_RATE` / `EXCHANGE_RATE` / `LEVEL_THRESHOLDS` / `FOODS`）；不改 10 s 周期与广播节奏；
- 不做目录递归；不按 workspace / 会话过滤；不做异步化改造（登记 L-B10-1 与再议触发）；
- 不代 B08 改 bundle 版本；**不代 B09 改判定面**（`shell-notify.js` 零改动——§2.2.12 逐字保留）。

### 2.5 受影响文件（行数 = 换行符计数；行宽判据 = 不含行尾 CR）

| 文件 | 当前行数 | 改动点 | 末行数 |
|---|---|---|---|
| `shell-affinity.js` | 305 | `sumSessionTokens()` 重写（`:68-83`）+ 头注释 / JSDoc 口径句（`:25-30` / `:67`）+ 档内常量与诊断标记 + 导出面 +1（`:292-305`） | ≈351 → **实施期实测回填** |
| `shell-backend.js` | 322 | `module.exports` 增 `writeDiag`（`:311-322`，1 行；函数体不动） | 323 |
| `docs/requirements/SHELL.md` | 217 | US-13 + §一 B10 批次目标 + §二 B10 条目与层级注 + 头部关联批次 / 条目区间 + 变更记录 2 行 | **250**（落档实测） |
| `docs/design/SHELL-UX.md` | **1282**（B10 落笔前实测；本档 = B09/B10 并行写入） | 选型 L / §2.2.13 / 注 S7 + 锚点 B10 附注 / B10 表 / DD-34…DD-40 / C32–C35 / O17–O19 / U-14 与追认块 / AC21–AC25 / TC-56–TC-67 / 手段 12 / 变更记录 | **1349**（落档实测） |

### 2.6 验收判据（可机检清单——与设计档 AC21–AC25 同源）

| 验收 | 判据（可机检） |
|---|---|
| AC21 | 夹具 1 条记录（四桶 = 9666 / 2434 / 37504 / 0）⇒ 返回值 **49604**；静态：目录段在场 + 导出在场 + `recursive` 0 处 |
| AC22 | 旧布局夹具 ⇒ 旧面值；目录空 / 全损坏 ⇒ 走旧面；两形态并存 ⇒ 只读目录（返回值 ≠ 两形态之和）；消解期登记在场 |
| AC23 | 两形态均缺 / 不可读 / 全损坏 ⇒ **`null`（非 0）**且不抛；调用面零 diff；诊断行 1 条（不可用）/ 0 条（正常） |
| AC24 | 四桶标识符逐条在场；`last.buckets` 与 `totals` 不同值夹具 ⇒ 取 `totals`；样本 9666+37504+0+2434 = **49604** |
| AC25 | 3 条记录夹具 ⇒ 三条之和（不按会话 / workspace 过滤）；幂等（连续两次相等）；空目录 ⇒ `null`；预置 `usage > 0` ⇒ 启动后 `usage` 不变（重启不重复计入） |

### 2.7 归属判定（需求档 = **SHELL**；PET 否决）—— 依据

1. **台账归属档**（主 agent 写域）已归 SHELL 板块：`docs/TODO.md:32` 的「归属档」列 = `docs/design/SHELL-UX.md`（SHELL 板块）。
2. **设计档已预先登记**本项为 SHELL 板块在途项：`docs/design/SHELL-UX.md` §2.3 B09 表注（`shell-affinity.js`「其读面失效 = 技术待办 T14，归 **B10**」）与 §2.5 C31。
3. **模块面**：`shell-affinity.js` 是 B06 F6 拆分的 15 个 `shell-*.js` 之一（桌面壳层模块）；其读面 = **壳读 Harness 落盘物**（壳↔Harness 对接面），与 SHELL 板块 §一 的 B07 延伸同层。
4. **PET 板块现有条目面** = 拖拽跟手（B01）+ 多屏几何与可见性（B03）（`docs/requirements/PET.md:24-26`）——全部是「桌宠窗口在桌面上的可用性与几何」；token 读面与几何无关。
5. 两档 §二 均持「桌宠其余机制（好感度…）的功能性需求…本档不代其立需求」（`docs/requirements/SHELL.md:45` / `docs/requirements/PET.md:33`）——本批**不为好感度机制补立功能需求**；US-13 登记的是**壳侧数据面读口**（形态兼容 + 计费口径），并在 SHELL.md §二 该句下加**层级注**（原句不改）。

⇒ 归属 = `docs/requirements/SHELL.md`；**未触发**「若判定归 PET ⇒ 停下报告」分支。

### 2.8 计数 / 口径补正与报告项

- **计数同步（D3）**：SHELL.md US **12 → 13**（NFR 计数不变 = 5）；SHELL-UX.md 回指表 +1 行；AC +5 / TC +12 / DD +7 / C +4 / O +3 / U +1；头部「关联设计档」条目区间同步为 US-1…US-13。
- **行宽实测**：两文档 **0** 行超 300（不含行尾 CR 口径；SHELL-UX.md 改后最宽 300 = B06 旧行）。
- **行数补正注（并行写入）**：SHELL-UX.md 为 B09 / B10 **两批并行写入**——本批**可分离面** = 1282 → 1349（**+67**）；总增量 1165 → 1349（+184）含 B09 同档在途改动，两批增量**不可逐行分离**（口径已落设计档 §2.3「行数口径注（B10）」）。
- **报告项 O18**：`docs/requirements/PET.md:214` 有 1 行 = 321 字符（超 300）——该档不在本角色写域，随报告提请主 agent 处置。
- **报告项 O19**：PET.md 侧是否需同款「层级注」= 主 agent 写域裁定项（本批不改）。
- **报告项（流程）**：B10 与 B09 **同档并行写入**——若 B09 设计评审在途，本批改动会使评审对象变化（**D5 冻结窗口**）；提请主 agent 协调两批入场次序。
- **待裁定**：桩测脚本（落 `.thincoder/`，gitignore；承 B03 `b03-pet-calibrate-stub.mjs` / B09 手段 11 ③ 先例）是否采用——本批边界声明「零新增文件」，采用须经主 agent 裁定（设计档 §3.3 手段 12 ③）。
- **本段写入状态**：§2 **已写入**（经 `batch_segment`，无路径参数；内容为上述 §2.1–§2.8）。

## §3 设计评审（评审子代理）

## §4 评审裁决与实施启动（主 agent）

## §5 实施记录（eng-coder）

## §6 验收核销（主 agent）
