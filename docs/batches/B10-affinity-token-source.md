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
| ④ | 字段形状（两版一致）：`tokenUsage = {ver, seq, val:{totals:{uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}, last:{turn,step,buckets}}}`；per-record 下路径 = `record.rows.tokenUsage.val.totals`，旧布局 = `tables.sessions[*].rows.tokenUsage.val.totals` | 0.1.5 token-meter `lib/index.js:415-448` · `:361-366`；bundle 同包 `:241-269` |
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

## §3 设计评审（评审子代理）

## §4 评审裁决与实施启动（主 agent）

## §5 实施记录（eng-coder）

## §6 验收核销（主 agent）
