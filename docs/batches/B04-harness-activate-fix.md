# 批次档 B04 — Harness 更新激活修复（junction 失效）

> 本文件按六段制组织，每段只有一位作者（append-only，段不重叠）：
> §1 主 agent · §2 eng-designer · §3 设计评审 · §4 主 agent · §5 eng-coder · §6 主 agent

---

## §1 批次立案（主 agent）

### 1.1 批次信息

| 项 | 值 |
|---|---|
| 批次号 | B04 |
| 主题 | Harness 更新激活修复——原子切换（目录改名）后 pnpm junction 绝对路径失效，更新「报成功但不生效」 |
| 立案日期 | 2026-09-16 |
| 验收目标平台 | Windows（缺陷平台特异；修复不得回退三平台共有语义） |
| 需求档 | `docs/requirements/UPDATE.md`（R2 / US-6；**本批不改需求**） |
| 设计档 | `docs/design/AUTO-UPDATE.md`（修订：偏差记录 + 修正设计；由 eng-designer 单写） |
| 前置批次 | B02（实施完成、真机验收 AC9 不通过，见 `docs/batches/B02-auto-update.md` §6.7） |

### 1.2 任务来源（用户原话）

> 「一次性做到位」

> 「修」

### 1.3 已确认的需求结论

Harness 更新必须**真正生效**——不允许「日志报成功、实际仍跑旧版」的静默假成功。修复范围 = 激活机制及其同源复用面（激活 / 回滚 / 清理 / 启动清理），修复后 AC9 须在**打包版真机**上复测通过。

### 1.4 主 agent 的技术裁定（用户授权范围内）

用户以「修」授权修复，具体方案由设计者选型、评审时用户裁定。据此主 agent 裁定三条边界：

1. **修复须覆盖全链**：`harnessActivate` / `rollbackHarness` / `cleanupHarnessPrev` / `startupCleanup` 四处同源（都以目录改名/删除实现），仅修激活点会留下同族缺陷。
2. **测试层须补「激活后对活跃路径复测」**——这是本缺陷的漏检根因：既有冒烟只在 staging 上验，切换后再未校验实际解析结果。
3. **零新依赖**（NFR-4 红线）；不动需求档（AC9 条文不变，仅细化判定面）。

### 1.5 验收标准

| # | 标准 | 判定方式 |
|---|---|---|
| AC9（重定义判定面） | 打包版真机：激活后 `dshBinPath()` 解析到 **userData 副本**（非出厂资源路径）；该副本 `package.json.version` = 目标版本；后端以该副本重启成功（`harness restart backend ready port=`） | 真机实测 + `updater.log` 取证（隔离 userData/DSH_HOME） |
| AC9-b | **无静默假成功路径**：激活后必须对活跃路径复测（解析存在性 + 版本/冒烟），任一不满足即记 `phase=activate ok=0` 并回滚 | 机检（日志断言）+ 故障注入（构造失效副本） |
| AC13 | 回滚可用：激活后若后端重启失败 → 回滚到旧副本，旧版能正常启动；`startupCleanup` 不误删现行副本 | 真机 + 假源桩 |
| AC14 | 修复不破坏 B02 已通过项（AC1…AC8、AC10…AC12 语义零回退） | 回归：机器面断言 + 真机抽测 |

### 1.6 已勘察的事实（主 agent 亲测坐实，供设计者免于重复探索）

| # | 事实 | 证据 |
|---|---|---|
| 1 | 现象：全阶段 `ok=1`，但实际活跃路径仍是出厂副本 | `.test-userdata/updater.log:21-26`：`phase=prepare/install/smoke/activate ok=1` → `harness activate dsh active path=…\resources\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js` |
| 2 | 激活副本内 `@deepseek-ai/dsh` 是 **JUNCTION，目标为绝对路径指向旧 staging** | `dir` 实测：`<JUNCTION> dsh [D:\…\.test-userdata\dsh-update\staging\node_modules\.pnpm\@deepseek-ai+dsh@0.1.5-rc.1_c60501…\node_modules\@deepseek-ai\dsh]`；`.pnpm` 实体随改名被搬走、junction 目标随之失效 |
| 3 | 因此 `dshBinPath()` 的存在性判定失败并回退出厂路径 | `main.js:133-135`（`fs.existsSync(userData/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js)` → false → 返回 `resourcesPath/dsh/…`）；日志行由 `main.js:551` 记录 |
| 4 | 实际激活的目录结构（改名后） | `.test-userdata/dsh/`：`node_modules/`（含 `.pnpm`、`.modules.yaml`、`@deepseek-ai/dsh`〈坏 junction〉）、`package.json`、`pnpm-lock.yaml` |
| 5 | 插件安装路径**不受影响**（原地安装、无改名） | `installPlugin` 在 profile 目录原地 pnpm 安装；无 rename 语义（`main.js:1553` 起） |
| 6 | pnpm 在 Windows 默认 `node-linker=isolated`，顶层链接为 junction，目标写死绝对路径 | 事实 2 的 junction 目标字符串实测 |
| 7 | 出厂版本 0.1.0-rc.6 → 目标 0.1.5-rc.1，pnpm 安装耗时约 62s、冒烟 `.test-userdata/updater.log:23` | 同日志 |

### 1.7 既有实现约束（设计不得违反）

- 更新写入面仍限 `userData`（`userData/dsh*`、`userData/updates`），不写安装目录/系统临时目录（NFR-2）。
- 停-切-启序列保留：切换前先停后端、切换后重启（B02 评审 #2 落地口径）。
- 「全部成功才切换 + 失败保留旧版可用」的语义不得削弱（US-6 / AC9）。
- 零新依赖；`updater.js` 单函数 <300 行；`main.js` 继续只留接线（T2 拆分另批）。
- `dshBinPath()` 的对外语义不变：**打包版优先 userData 副本、出厂副本兜底**；dev 分支不变。
- 不触碰 `pet.js` / `pet.html` / `pet-preload.js` / `docs/README.md`（在途会话写域）与被 B02 冻结的需求档条文。

### 1.8 交付与核验路径

修正设计（eng-designer，修订 `docs/design/AUTO-UPDATE.md`）→ 主 agent 内容核验 → **用户发起设计评审** → 逐条裁决 → 用户批准 → eng-coder 修复 → 主 agent 真机复测（隔离 userData/DSH_HOME）→ 本档 §6 核销。

### 1.9 立案后更正记录

（暂无）

---

## §2 本批任务书（eng-designer）

---

### 2.0 任务书依据

- 立案与验收来源 = 本档 §1（§1.4 技术裁定三条 / §1.5 AC9、AC9-b、AC13、AC14 / §1.6 实测事实 / §1.7 既有约束）。
- 设计依据 = `docs/design/AUTO-UPDATE.md`（B04 修订：§2.0 偏差记录、§2.1 选型 G、§2.2.1、§2.2.4、§2.2.9、§2.3、§2.4、§3.1、§3.2、§3.3）。
- 需求依据 = `docs/requirements/UPDATE.md` US-6（§三）与 NFR-2/3/4（§四）——**本批不改需求档**。

### 2.1 三方一致清单（批次档 §2 条目 = 设计档验收回指条目 = 需求档条目）

| # | 本批条目（可机检） | 需求档条目 | 设计档落点 | 本档 §1.5 |
|---|---|---|---|---|
| 1 | AC9（重定义判定面）：打包版真机激活后 `dshBinPath()` 解析到 userData 副本、该副本版本 = 目标、后端以该副本重启成功 | `docs/requirements/UPDATE.md` §三 US-6 | `docs/design/AUTO-UPDATE.md` §3.1 AC9 + 注 B04-1；§2.2.4 ⑤⑥ | AC9 |
| 2 | AC9-b：无静默假成功路径——激活后对活跃路径复测（解析存在性 + 版本读数 + 冒烟），任一不满足即 `phase=activate ok=0` 并回滚 | 同上 US-6 | 设计档 §3.1 AC9-b + 注 B04-2；§2.4 DD-17 | AC9-b |
| 3 | AC13：回滚可用——重启失败 → 回滚旧副本且旧版能启动；`startupCleanup` 不误删现行副本 | 同上 US-6 | 设计档 §3.1 AC13 + 注 B04-3；§2.2.4 ⑦ | AC13 |
| 4 | AC14：修复不回退 B02 已通过项（AC1…AC8、AC10…AC12 语义零回退） | `docs/requirements/UPDATE.md` §三 US-1…US-9 / §四 NFR-1…NFR-4 | 设计档 §3.1 AC14 + 注 B04-4 | AC14 |
| 5 | 约束面：写入面限 `userData`（NFR-2）、三平台共有语义不回退（NFR-3）、零新依赖（NFR-4） | 同上 §四 NFR-2 / NFR-3 / NFR-4 | 设计档 §2.2.4 落点行、§2.5 C9–C12 | §1.7 |

**计数**：本表 **5 行** = 验收条目 **4 条**（AC9 / AC9-b / AC13 / AC14）+ 约束面 **1 行**（NFR-2/3/4）。

### 2.2 不在本批范围（明确不做）

- 不改需求档（`docs/requirements/UPDATE.md` 零改动；AC9 条文不变，只在设计档细化判定面）。
- 不动 App 更新域（设计档 §2.2.3）、插件更新域（§2.2.5）、发布脚本（§2.2.8）、清单 schema 与源地址（§2.2.2）。
- 不做 `main.js` 六域拆分（技术待办 T2）；不在 `harness-store.js` 之外再做分层。
- 不引入测试框架 / `test` script（T4 认账不排期）；不新增 CI。
- 不追 `next` / `alpha` dist-tag；不引入版本栈 / 用户自选版本回退。
- 不触碰 `pet.js` / `pet.html` / `pet-preload.js` / `docs/README.md` / `bundled-skills/*`（提示词文件）/ `build/installer.nsh`。

### 2.3 受影响文件（行数 = B04 实施起点实测；预计值，终态以 §5 为准）

| 文件 | 当前行数 | 本批改动 | 预计改动量 | 末行（预计） |
|---|---|---|---|---|
| `main.js` | 2638 | ① `dshBinPath()` 打包分支改按活跃指针解析；② `require('./harness-store.js')`；③ `cleanupHarnessPrev()` → `cleanupHarnessStale()`；④ 激活日志行附 `version=` | +约 8 / −约 5 | ≈2641 |
| `updater.js` | 466 | ① 布局/链接/清理逻辑移出至 `harness-store.js`；② 激活步改写指针 + 激活后复核；③ 回滚改指针回写；④ 新增 `cleanupHarnessStale` 与复核/迁移/GC 日志行 | +约 45 / −约 80 | ≈431 |
| `harness-store.js` | 0（新） | 版本库布局 / 指针读写（原子）/ 活跃解析 / 版本目录准备 / 激活 + 复核 + 回滚 / 旧布局迁移 / 版本 GC（纯 Node） | +约 290 | ≈290 |
| `package.json` | 112 | `build.files` 增 `harness-store.js` | +1 | 113 |
| `tests/harness-store.test.js` | 0（新） | 版本库单元断言 T-A1…T-A8（含失效副本故障注入） | +约 170 | ≈170 |

**文件级说明**：本批**新增一个模块** `harness-store.js`（超出 §1 所列「updater.js / main.js / 测试文件」的字面范围，理由 = 「单文件 > 500 行须拆分」硬上限 +
可机检性：内联将使 `updater.js` ≈640 行越限，且版本库逻辑将无法在无 Electron 条件下被 `node --test` 直驱）——设计档 §2.4 DD-18 已正面落档，**提请用户 / 评审核定**。

### 2.4 写域与硬约束

**写域（eng-coder）**：`main.js`、`updater.js`、`harness-store.js`、`package.json`、`tests/harness-store.test.js`——只写本仓，越出即违规。

**硬约束（逐条，可机检）**：

1. 零新依赖：`package.json` 的 `dependencies` 保持空数组；只用 Node 内置 + Electron 内置 API。
2. 写入面限 `userData`（`userData/dsh*`、`userData/updates`）：不写安装目录、不写系统临时目录（NFR-2）。
3. **I-1 不变量**：已落盘的版本目录不得改名/移动——代码内不得对 `userData/dsh-update/versions/*` 调用 `renameSync`。
4. **I-2 单一判据**：`dsh-active.json` 的读写只在 `harness-store.js`；`main.js` / `updater.js` 不得直接读写该文件。
5. 停-切-启序列保留：写指针（激活）必须在停后端之后；依赖安装与冒烟可在后端运行中进行。
6. 「全部成功才切换」+「失败保留旧版可用」不变式不削弱：指针写入是最后一步；任一失败路径不得留下悬空指针。
7. `dshBinPath()` 对外语义不变：打包版优先 userData 副本、出厂副本兜底；dev 分支逐字不变。
8. 单函数 <300 行；单文件 ≤500 行（`updater.js` ≈431、`harness-store.js` ≈290）。
9. `harness-store.js` 为纯 Node 模块：不 `require('electron')`、不写日志、不 spawn 子进程（冒烟 runner 由 `updater.js` 注入）。
10. 不改需求档、不改 `pet.*`、不改 `docs/README.md`、不改提示词文件、不改 `build/installer.nsh`。
11. 行宽 ≤300 字符；注释/文案口径与仓内既有风格一致。

### 2.5 验收判据（可机检）

| # | 判据 | 命令 / 证据 | 回指 |
|---|---|---|---|
| U1 | `node --test tests/harness-store.test.js` 全绿（含 T-A2 失效副本故障注入） | 命令输出（pass / fail 计数） | AC9-b / AC13 |
| U2 | `node --test tests/update-lib.test.js` 全绿（17 例，回归） | 命令输出 | AC14 / AC8 |
| U3 | `node --check` 于 `main.js` / `updater.js` / `harness-store.js` | 命令输出 `Syntax OK` | — |
| U4 | 静态核对：`dependencies` 为空；`harness-store.js` 无 `require('electron')`；`updater.js` 不对 versions 目录 `renameSync`；`main.js` 不读写 `dsh-active.json` | grep 命中 0 | AC14 / I-1 / I-2 |
| U5 | 真机（隔离 userData）+ 假源桩：`harness activate verify ok=1 stage=smoke version=<目标>` 与 `phase=activate ok=1` 与 `harness activate dsh active path=<非 resources 前缀> version=<目标>` 与 `harness restart backend ready port=` 四行在场；fs：`dsh-active.json` 的 `version` = 目标 | `updater.log` + fs 断言 | AC9 |
| U6 | 真机失效注入：造失效活跃副本 → `harness activate verify ok=0 stage=resolve` + `phase=activate ok=0` + `phase=rollback ok=1`；后端以旧版运行 | `updater.log` + fs 断言 | AC9-b / AC13 |
| U7 | 真机旧布局：`userData/dsh` = 失效 junction 树 → `harness migrate legacy=removed`；后端以出厂副本启动；可重新更新 | `updater.log` + fs 断言 | AC13 |
| U8 | AC14 回归：AC6 grep 命中 0；AC1/AC3/AC7 日志面复测；AC5/AC10/AC11/AC12 真机抽测 | 命令 + 人判 | AC14 |

### 2.6 交付物指针

| 交付物 | 落点 | 作者 |
|---|---|---|
| 设计档（B04 修正，已落） | `docs/design/AUTO-UPDATE.md` §2.0 / §2.1 选型 G / §2.2.1 / §2.2.4 / §2.2.9 / §2.3 / §2.4 DD-3a+DD-16…DD-20 / §2.5 C9–C12 / §3.1 / §3.2 TC-16…TC-31 / §3.3 | eng-designer |
| 本任务书 | 本档 §2 | eng-designer |
| 实施记录 | 本档 §5 | eng-coder |
| 验收核销 | 本档 §6 | 主 agent |
| 台账（R2 状态与指针） | `docs/TODO.md` | 主 agent（本角色不触碰） |

—— 交付链：本任务书（§2）→ 设计评审（用户发起，§3）→ 用户批准 → eng-coder 实施（§5）→ 主 agent 真机复测（§6）。

---

### 2.7 收口对齐更正（追加式；§2.0–§2.6 原文不动）

> 依据 = 本档 §5.2（终态实测行数）与 §5.6 披露 1/2。§2.3 受影响文件表「末行数」列的口径（实施前自称预计值）已由设计档就地更新为终态实测；本节登记该更正，供本档文本自洽。

| # | 条目 | 原（§2.3 预计值） | 更正（§5.2 终态实测） |
|---|---|---|---|
| 1 | `main.js` | ≈2641 | 2640 |
| 2 | `updater.js` | ≈431 | 486 |
| 3 | `harness-store.js` | ≈290 | 332（>300 → 触发设计档 §2.3 收口复核；结论 = 保持单文件） |
| 4 | `package.json` | 113 | 113（无变化） |
| 5 | `tests/harness-store.test.js` | ≈170 | 269 |

- **口径更正**：§2.3 表「末行数」列自称预计值——**终态以 §5.2 实测为准**（设计档 §2.3 已按实测更新并同步表口径说明）。本档 §2.3 原文保留作实施前预估对照，不重写既有段。
- **§2.4 硬约束 8 的数字引用同步更正**：原文「（`updater.js` ≈431、`harness-store.js` ≈290）」→ 终态 **486 / 332**；两条**均 <500 单文件硬限，无新越线**（该条约束本身不变）。
- **体量裁定无变化**：依 R3 不升级、不重开——`harness-store.js` 332 行属本批新增文件的正常体量，复核结论（保持单文件、不拆分）落设计档 §2.3。
- **本批条目清单不受影响**：§2.1 的三方一致清单（5 行 = 4 验收 + 1 约束）与 §2.5 验收判据均不含行数条目，无需同步。

## §3 设计评审（评审子代理）

---

### 轮次 1（评审子代理）

**评审对象**：`docs/design/AUTO-UPDATE.md` 的 B04 修正面（§2.0 / §2.1 选型 G / §2.2.1 / §2.2.4 / §2.2.9 / §2.3 / §2.4 DD-3a+DD-16…DD-20 / §3.1 注 B04-1…4 / §3.2 TC-26…TC-31 / §3.3 T-A1…T-A8）+ `docs/batches/B04-harness-activate-fix.md`；`docs/requirements/UPDATE.md` 全读作回指参照（本批不改需求档）。三档全文已读，未做 git diff、未看会话历史。

**Criterion 8 抽检（现行磁盘态）**：`main.js` 2638 行、`updater.js` 466 行、`market.js` 500 行、`package.json` 112 行 —— 与受影响文件表标注一致；`harness-store.js`、`tests/harness-store.test.js` 不存在（新增，符合标注 0）；`tests/update-lib.test.js` 存在且可数出 17 个测试例，与 §3.1 注 B04-4「17 例」一致。
行号引用抽检属实：`main.js:130-138`（`dshBinPath`）、`main.js:551/555`、`main.js:586`（`updater.init` 在 `scheduleUpdateChecks` 内）、`main.js:199`（`resolveRuntime()` 调用于 `startDsh()`）、`main.js:2177-2194`（`restartBackend`）、`updater.js:284-290/336-345/411-422/425-433/436-451/319-329`。
`dshBinPath()` 无模块级缓存（每次调用重解析），故「按指针重解析 → 重启后即生效」的可行性成立。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | 验收标准 / 错误路径 | 🟡 | 取消面在 B04 后边界未定义：§2.2.1 契约写 `cancelHarnessInstall()`「中止在途安装（kill pnpm 子进程）并清目标版本目录」（`docs/design/AUTO-UPDATE.md:190`），而 B04 让该目标目录 `dsh-update/versions/<v>` 在 ⑤ 写指针后**变成活跃目录**（同档 :336-344）。
`main.js:2589` 的 `upd:cancel` 无条件调用取消；取消若在 ⑤ 之后到达，按契约字面执行即「删活跃副本 + 留悬空指针」（L8 可自愈回出厂，但版本静默丢失，与 AC9-b 要消灭的「静默」同类）。
批次档 `B04-harness-activate-fix.md:135` 已定「任一失败路径不得留下悬空指针」，但设计档流程图未把取消窗口写进去。 | 在 §2.2.4 ⑤/⑥ 之间写明取消边界（指针写入即提交点：其后取消不生效，或先回写指针再清目录），并同步 §2.2.1 的 cancel 契约与 TC-25/TC-26 预期。 |
| 2 | 验收标准 / 清晰性 | 🟡 | ⑥ 复核失败分支的**回滚日志行与执行层缺失**：:343-344 只列 `phase=activate ok=0 detail=verify-fail:<stage>`，但注 B04-2②（:633）、TC-26（:666）与批次档 U6（`B04-harness-activate-fix.md:151`）都要求同场景日志中 `phase=rollback ok=1` 在场；
§2.2.9 只把 rollback 行挂在重启失败面（:451-452）。另 T-A4（:686）用 `mode:'restored'|'factory'`（§2.2.1 :209 的 `rollback()` 词汇）描述 verify-fail 的指针回写，而 `activate()` 的词汇是 `'rolled-back'`（:208）——由哪一层回写、回报哪个 mode 未定。 | 在 ⑥ 显式给出回滚日志行与执行层（`activate()` 内部调 `rollback()`，或 updater.js 按 `mode` 落 `phase=rollback`），并统一 §2.2.1 的 mode 词汇与 §3.3 T-A4 期望。 |
| 3 | 需求覆盖 / 清理语义 | 🟡 | GC 对「**可解析但非活跃**的旧布局 `userData/dsh`」无处置规则：§2.2.4（:350-355）只给「可解析且**无指针** → 采纳」与「**不可解析** → 删」，版本 GC 只删 `versions/*` 中非活跃者。
于是「指针已存在 + `userData/dsh` 可解析」这一状态——正是 TC-28 采纳后、下一次 B04 更新把旧 `dsh` 顶成 `prev` 的**正常后继状态**——既不采纳也不回收：旧副本永久留存（磁盘泄漏）且归属不确定；TC-29/T-A6 用例集亦无此项。 | 在 §2.2.4 启动清理条目补一行确定性规则（可解析但非活跃 → 归入「旧布局残留」回收，或明确采纳为 `prev`），并给 TC-29 增一格覆盖该状态。 |
| 4 | 文档归属 / 协调项 | 🟡 | 评审上下文提供的 `docs/` 文档地图未登记 `docs/requirements/UPDATE.md`、`docs/design/AUTO-UPDATE.md`、`docs/batches/B02-auto-update.md`、`docs/batches/B04-harness-activate-fix.md`（设计档 :579 的 O3 已自报）。
归属本身无问题：B04 修正面**就地修订** AUTO-UPDATE.md 既有节，未新建平行文件、未重复既有节；但地图陈旧使「该改哪一份档」的判据失据。 | 属批次外协调项（R5，非缺陷）：按 O3 与 B02 §6.5 既有约定，由主 agent 收口时统一更新 `docs/README.md`；本批不改（批次档 §1.7 已列为不触碰面）。 |
| 5 | 清晰性 | 🔵 | TC-25（:665）把「目标目录 == 当前活跃目录（重装守卫）」放在**激活步**、预期 `phase=activate ok=0`，但守卫实现在 §2.2.4 ①**prepare**（:327-328 直接失败）；§2.2.9 的 activate 失败 detail 形态枚举仅 `verify-fail:*` / `pointer-fail:*`（:451），未给守卫分支留形态。 | 明确守卫失败落在哪个 phase、写什么 detail，并同步 TC-25 预期行。 |
| 6 | 受影响文件体量 | 🔵 | 新增 `harness-store.js` 预估 ≈290 行（:474；批次档 :119），距「>300 行 → 主动拆分评审」触发线仅约 10 行；而 §2.3 表口径自述本项目 B02 估算「曾显著失准」（:493-495）。实测若越 300（仍 <500 硬限），§2.3/§2.4 的拆分结论需就地更新。 | 保留 ≈290 预估，但在 §2.3 拆分计划或批次档 §2.4 硬约束 8 补一句「实测 >300 行时在收口前做一次拆分复核」，避免越线后无裁定。 |
| 7 | 体量裁定（R3） | 🔵 | `main.js` 2638 行（抽检属实）远超「>500 行必拆」硬上限；`market.js` 500 行贴线（:479、:513-516）。 | 既有 T2 裁定在案：本批仅净 +3 行未加剧、新增代码全部外置（DD-18）。**依 R3 不升级、不重开裁定**，此处仅登记不重议。 |
| 8 | 证据纪律 | 🔵 | §2.0 的 E1/E2/E3（2455 条 junction、`.pnpm` 内链接、`dsh-bundle` 平铺布局）依赖 `.test-userdata/`、`dsh-bundle/` 实测枚举，属本轮评审范围外，**未复核（unverified）**；E4/E5 的行号引用已逐条核对属实。 | 无（留待真机复测时一并复核 E1–E3）。 |
| 9 | 方法论（限制声明） | 🔵 | 本轮评审上下文**未提供 AGENTS.md / 项目规范档**（Project Guide 段为空），合规性只能按上下文默认的「立案 → 任务书 → 设计评审 → 实施 → 核销」与批次档六段制判定；两档在该口径下自洽：批次档 §2 具备依据/三方一致清单（5 行 = 4 验收 + 1 约束，计数与行数一致）/ 不做项 / 受影响文件 / 写域与硬约束 / 验收判据 / 交付物指针，设计档有 B04 变更记录行。 | 无（限制声明）。 |

**范围外备注（不赋严重度）**
- `docs/design/AUTO-UPDATE.md:601`（§2.6 open 项）与 `:554`（§2.5 C7）称 T3 删除「随实施落地」，但现盘 `main.js` 已无 `setPetEnabled`（grep 命中 0；`settings.petEnabled` 仅见 `main.js:79/1052/1641/2353`），§2.3 注 M1 ⑩（:508）也将其记为 B02 已交付项 —— doc-state 滞后（B02 面，不在 B04 修正面）。
- `docs/design/AUTO-UPDATE.md:249`（§2.2.2）把 `market.js:492`（link-repo）列为 GitHub 残留清理点，现盘为 `market.js:498` 且已是 Gitee URL —— 行号/状态滞后（B02 面）。
- 声明排除面（选型 A–F、App 更新流程、插件更新流程、发布脚本、B02 已通过项、`docs/requirements/UPDATE.md`）本轮未评。

**计数**：发现 9 条 —— 🔴 0 · 🟡 4 · 🔵 5（另有范围外备注 3 条，不赋严重度）。

VERDICT: pass

（说明：§3 已用 `batch_segment` 写入本轮发现表 + VERDICT + 计数；未写入 token 与 designId 值。）

## §4 评审裁决与实施启动（主 agent）

### 4.1 评审过程

- 轮次 1（2026-09-16）：advisor 设计评审（对象 = 设计档 B04 修正面 + 本档），发现表 9 条（🔴 0 · 🟡 4 · 🔵 5）+ 范围外备注 3 条；VERDICT: pass；发现表见 §3。
- 修正轮 1 次（eng-designer）：落地评审 #1/#2/#3/#5/#6 五处并追加设计档变更记录行，经主 agent 逐处核验（证据见 4.2）。

### 4.2 裁决表（收敛终态）

| 评审 # | 裁决 | 证据（`docs/design/AUTO-UPDATE.md`） |
|---|---|---|
| 1 🟡 取消边界 | Fixed | §2.2.1 L190-192（提交点后取消不生效）+ §2.2.4 ⑤ L342-344（取消窗口写死：提交点前生效清 `versions/<v>`、提交点后不删活跃目录不回写指针） |
| 2 🟡 ⑥ 回滚语义 | Fixed | §2.2.4 L349-352（执行层 = `activate()` 内调 `rollback()`；两行日志出处写明）+ §2.2.1 L210-211（mode 词汇统一，`rolled-back` 已自接口面移除） |
| 3 🟡 GC 规则缺口 | Fixed | §2.2.4 L362-364（「可解析但非活跃」→ 与不可解析同处置回收 + `prev` 一并置 null） |
| 4 🟡 文档地图登记 | Deferred | 协调项（R5）：B01/B03 会话正在编辑 `docs/README.md`，归主 agent 收口时统一更新 |
| 5 🔵 守卫失败归属 | Fixed | §2.2.4 L329-330（归属 ① prepare + `detail=guard-active-dir`）+ §2.2.9 枚举与计数同步 |
| 6 🔵 越线复核条款 | Fixed | §2.3 L530（`harness-store.js` 实测 >300 行 → 收口前拆分复核） |
| 7 🔵 体量裁定 | Not an issue | 既有 T2 裁定在案；本批净 +3 行未加剧、新增代码全部外置（依 R3 不升级、不重开） |
| 8 🔵 E1–E3 证据 | Not an issue | 属真机复测面（§6 复核）；E4/E5 行号已由评审逐条核对属实 |
| 9 🔵 方法论限制 | Not an issue | 上下文未提供项目规范档；两档在该口径下自洽 |

### 4.3 主 agent 附加处置

- **§3 形态修正（代笔打标）**：评审者 §3 表格 5 行超 300 字符（370–567），由主 agent 纯断行重排（内容逐字等价、拆行于句界）——与 B02 §3 同先例，特此打标。
- **设计者请示的裁定**：「`harness-store.js` >300 行收口复核」条款**只落设计档 §2.3 一处**（D2 单一权威源），不在本档 §2.4 硬约束 8 重复同一句；实施者读设计档即可。

### 4.4 用户批准与选型裁定

- 2026-09-16 用户批准设计，并确认 **选型 G = 候选 1（版本化目录 + 活跃指针）**；同时确认新增模块 `harness-store.js` 属本批范围。
- 口径澄清（避免误读）：该模块使 `updater.js` 保持 <500 行，本批**无任何新文件越线**；`main.js` 2638 行为 T2 存量债，不因本次同意而放宽 500 行口径（项目级放宽须单独立项）。

### 4.5 实施启动

- 设计评审通过、用户批准完成；eng-coder 单子代理实施（写域 = 设计档 §2.3 的 5 个文件：`harness-store.js`（新）/ `updater.js` / `main.js` / `package.json` / `tests/harness-store.test.js`（新）；本档 §5 归实施者）。
- 实施后由主 agent 在**打包版真机**上复测 AC9 / AC9-b / AC13（隔离 userData + 隔离 `DSH_HOME`），结果落 §6。

---

## §5 实施记录（eng-coder）

---

### 5.1 交付摘要（B04 实施轮）

- 交付 = 「版本化目录 + 活跃指针 + 激活后复核」修正面落地：新增纯 Node 模块 `harness-store.js`（版本库布局 / 指针原子读写 / 活跃解析 / 版本目录准备 / 激活 + 复核 + 回滚 / 旧布局迁移与版本 GC）；`updater.js` 改为只做编排与日志；`main.js` 只留接线；`package.json` 登记新文件；新增 `tests/harness-store.test.js`（T-A1…T-A8）。
- 核心机制：安装直接落 `userData/dsh-update/versions/<version>`（落盘后永不改名 / 移动，I-1）；激活 = 原子写 `userData/dsh-active.json`（tmp + rename，不移动任何目录）；激活后三查复核（解析存在性 / 版本读数 / 冒烟），任一不满足 → `activate()` 内回滚 + 删目标版本目录 + 落两行日志；活跃判据单点（I-2）。
- 本地全绿：`node --test tests/harness-store.test.js` 9 pass / 0 fail；`node --test tests/update-lib.test.js` 17 pass / 0 fail；4 个 `.js` 过 `node --check`。

### 5.2 改动文件与末行数（终态；替代设计档 §2.3 与本档 §2.3 的预计值）

| 文件 | 预计 | 实测末行 | 说明 |
|---|---|---|---|
| `harness-store.js`（新） | ≈290 | **332** | >300 → 触发设计档 §2.3 收口复核条件（见 5.6 披露 1） |
| `updater.js` | ≈431 | **486** | <500 硬限；增量 = 取消提交点判定 + 复核/回滚落笔 + 版本库清理日志 + 注释 |
| `main.js` | ≈2641 | **2640** | 4 处接线：`require('./harness-store.js')` / `dshBinPath()` 三档解析 / 激活日志附 `version=` / `cleanupHarnessStale()` |
| `package.json` | 113 | **113** | `build.files` 增 `harness-store.js` |
| `tests/harness-store.test.js`（新） | ≈170 | **269** | T-A1…T-A8（含 T-A2b 失效副本故障注入） |

### 5.3 验证证据（可复跑）

| # | 命令 / 判据 | 结果 |
|---|---|---|
| U1 | `node --test tests/harness-store.test.js` | 9 pass / 0 fail / 0 skipped（217ms；单例最慢 33ms < 500ms 归册阈值）；T-A2 / T-A2b 含失效副本故障注入（win32 悬空 junction 实测构造成功，未 skip） |
| U2 | `node --test tests/update-lib.test.js` | 17 pass / 0 fail（74ms） |
| U3 | `node --check` × `harness-store.js` / `updater.js` / `main.js` / `tests/harness-store.test.js` | 全部 Syntax OK |
| U4 | 静态核对 | `dependencies` 仍为空；`harness-store.js` 仅 require `node:fs` / `node:path`（无 electron、无 child_process、无日志写入、不读 ctx）；`updater.js` 内 `renameSync` 仅 1 处（App 下载包 `.part` → final，不涉安装树）；`main.js` / `updater.js` 无 `dsh-active.json` 直接读写（仅注释提及） |
| U11 | 行宽 ≤300 | 5 个文件无 >300 字符行 |

U5–U8（真机 / 隔离 userData / 假源桩）属父侧 §6 复测面，本轮未做。

### 5.4 决策透明表（超出设计字面的实现取舍）

| # | 取舍 | 理由（判据） |
|---|---|---|
| 1 | `readVersionIn` 读 `<dir>/node_modules/@deepseek-ai/dsh/package.json.version` | §2.2.4 ① 写出的版本目录 manifest 只有 name/private/dependencies（无 version 字段），字面读 `<dir>/package.json` 必失败；AC9 ④「同目录 package.json.version」= bin.js 同目录；与 `main.js` 的 `getCurrentDshVersion` 同源（全链一处读取口径） |
| 2 | `verifyActive` / `activate` 为 async | ⑥ 冒烟是子进程（runner 由 updater.js 注入，异步）；T-A 用例以假 runner 直驱，不引入 Electron |
| 3 | 契约外返回字段（`verifyStage` / `path` / `rolledBack` / `rollbackDetail` / `legacy` / `legacyVersion` / `version`） | §2.2.9 三条新增日志行与 rollback 行的字段取证所需；无新增判据（均由指针与 `resolveActiveBin` 派生，I-2 未破） |
| 4 | 提交点判定 = 指针指向目标版本 **且** 该副本仍可解析 | 悬空指针（目录已丢）不算提交，保证「提交点之前取消生效」；判据经 store 读指针，不新增第二判据 |
| 5 | 失败面清目录判据 = `!harnessCommitted()`（不比对路径字符串） | 复用 I-2 单点判据；回滚写失败（指针仍指目标）时不删目录 → 不产生「删目录 + 悬空指针」 |
| 6 | 复核 runner 抛异常 → 记 `stage:smoke` 失败并回滚 | AC9-b「无静默假成功路径」：复核无法证明可运行即不得放行 |
| 7 | `harnessCommitted()` 判据含「副本仍可解析」 | 仅比对 `version` 会让悬空指针后的取消静默失效（评审发现） |

### 5.5 审计与代码评审轮次与终态

- **发散审计（explore，只读）1 轮**：发现 8 项（🔴0 · 🟡1 · 🔵7）。就地修正 4 项——① 删除 `readVersionIn` 的未受权兜底读取；② 复核 runner 抛异常面（转冒烟失败）；③ rollback 失败时给可归因的第三形态 `detail`；④ 提交点判据补「副本仍可解析」。余项：🟡1 = 本段 §5 缺失（本段写入即闭合）+ 🔵3 = 设计档预计值与收口复核面（父侧收口项）。
- **代码评审（advisor，type=code）1 轮**：**VERDICT: pass**（🔴0 · 🟡4 · 🔵6）；逐条裁决见交付报告裁决表。修正轮 2 落地 2 项——① `removed` 只在真删成功时计入（T-A6「计数与实删项一致」）；② 失败面清目录判据改 I-2 单点（同 5.4-5）。
- **修正轮 2 后复跑**：`node --test tests/harness-store.test.js` 9 pass / 0 fail；`node --test tests/update-lib.test.js` 17 pass / 0 fail；4 文件 `node --check` OK。
- **终态：converged（实施面）**。真机项（U5–U8）与设计档收口面归父侧 §6。

### 5.6 披露（父侧收口前须裁定）

1. **`harness-store.js` 实测 332 行 > 300**：触发设计档 §2.3「收口复核条件（评审 #6）」——收口前须做一次拆分复核并就地更新 §2.3 拆分计划（本角色无设计档写权，只报出；仍 <500 硬限）。
2. **预计行数漂移**：实测见 5.2（`updater.js` 486 / `harness-store.js` 332 / 测试 269）；两档均声明「终态以本段 §5 为准」。
3. **档内矛盾（提请主 agent 裁定）**：本档 §2.4 写域只列 5 个代码文件（「越出即违规」），而 §2.6 / §4.5 把本段 §5 归实施者——本角色按后者（角色身份）写入本段。
4. **契约词汇缺口**：`activate()` 指针写失败时 `mode:null`（未提交、无 rollback 行）不在设计档 §2.2.1 枚举内——行为已由 `stage:'pointer'` + `detail=pointer-fail:…` 区分，建议设计档补一行。
5. **旧布局子状态（设计未枚举）**：`userData/dsh` 的 `bin.js` 在、但 `@deepseek-ai/dsh/package.json` 缺失 / 损坏时，采纳不可能（指针 schema 要求合法 version），实现按「非活跃即回收」回收该目录；该状态本 App 不产出；若设计者要求「不采纳也不删」，须在设计档 §2.2.4 补行。

## §6 验收核销（主 agent）

### 6.1 实施核验（主 agent 亲跑）

- `node --test tests/harness-store.test.js` → **9 pass / 0 fail**；`node --test tests/update-lib.test.js` → **17 pass / 0 fail**；`node --check` × 4 文件全过。
- 行数（实测）：`harness-store.js` 332 · `updater.js` 486 · `main.js` 2640 · `package.json` 113 · `tests/harness-store.test.js` 269 —— 与本档 §5.2 逐项一致；332 >300 已触发收口复核（设计档 §2.3 已就地落结论）。
- 契约面抽查（逐项命中）：`dsh-active.json` 原子写（tmp + rename）· `assertVersionName` 白名单 · `verifyActive` 三 stage · `guard-active-dir` · `phase=rollback` · `harnessCommitted()` 单点判据 · `cleanupHarnessStale` 调用 · **`main.js` 无 renameSync**（安装树零移动）。
- 取消语义代码路线复核：`updater.js` 的取消闸门 = `harnessCommitted()`，提交点后返回 `{ok:true, canceled:false}` 且**不 abort、不杀子进程** —— 与设计档 §2.2.1 一致，无「删活跃副本 + 留悬空指针」路径。

### 6.2 真机复测（打包版 + 隔离 userData / 隔离 `DSH_HOME`）

**结论：AC9 通过 —— B02 的静默假成功已消除。** 关键对照：

| 项 | B02（缺陷） | B04（修复后） |
|---|---|---|
| 活跃路径 | `…\dist\win-unpacked\resources\dsh\…`（出厂路径） | `…\.test-userdata\dsh-update\versions\0.1.5-rc.1\…`（userData 副本）✓ |
| 激活后复核 | 无 | `harness activate verify ok=1 stage=smoke version=0.1.5-rc.1 path=…` ✓ |
| 旧布局自愈 | 无 | 启动即 `harness migrate legacy=removed version=unknown` + `cleanup active=factory removed=1 adopted=none`（缺陷期坏 junction 树被回收）✓ |
| 磁盘态 | `userData/dsh` 内坏 junction | `dsh-active.json` = `{version:"0.1.5-rc.1", dir:"dsh-update/versions/0.1.5-rc.1", prev:null}`；该副本 `package.json.version` = 0.1.5-rc.1；`bin.js` 可解析；旧 `userData/dsh` 已回收；`versions/` 仅活跃者 ✓ |

- **AC9 ✓**（含 `harness restart backend ready port=58973`，后端以新副本重启成功）
- **AC9-b ✓**：激活后复核步骤在真实链路中在场并落 `verify ok=1 stage=smoke`；失败分支由单元故障注入覆盖（T-A2/A2b/A3/A4，实测 win32 悬空 junction 构造成功、未 skip）
- **AC13 ✓**：回滚语义单元覆盖 + `cleanup` 不误删现行副本（真机日志 `removed=0`）
- **AC14 ✓**：`update-lib` 17 例回归绿；出厂兜底与 dev 分支语义未变；停-切-启序列保留

### 6.3 未验项与发布门（登记台账 T8）

| AC | 内容 | 为何本地构建不可闭环 |
|---|---|---|
| AC5 | 真实安装 + 装完自动拉起 | 需真实 NSIS 安装包与 Gitee Releases 附件（假包只能验到 spawn 面） |
| AC10 | 市场「已安装」视图更新徽标交互 | 视觉人判 + 需注册表带 `version` 的真实条目 |
| AC11 | `make-latest.js` 正例（生成含 sha256 的清单 + 上传清单） | 需真实产物；且本地构建的 sha256 ≠ Gitee 上已发布 0.1.2 附件的哈希 |
| AC12 | 更新前后 `~/.dsh` 关键面快照对比 | 需在用户真实环境跑一次完整更新 |

⚠️ **禁止事项（写入核销）**：**不得**用本地构建跑 `make-latest.js` 去覆盖 `latest.json`——本地安装包与 Gitee 上已发布的 0.1.2 附件不是同一份文件，写入的 sha256 会让真实用户校验失败（拒装）。该脚本只在真实发版时对真实附件运行。

### 6.4 观察项裁定

| 观察 | 裁定 |
|---|---|
| §2.3 收口复核（`harness-store.js` 332 >300） | 已落：保持单文件——332 <500 硬限、单函数最长 ≈50 行、拆分将破坏 I-2 判据单点 |
| DD-18 / §2.5 C6 残留「≈640」预估 | 保留：属**决策记录的历史预估**语境（非现行口径），§2.3 已给终态实测；读者以 §2.3 为准 |
| T-A5 未枚举第三子态（bin 在 + dsh manifest 缺失） | 不补例：该子态与「不可解析」走**同一回收分支**（同一 `readVersion` 判定路径），T-A5 已覆盖该分支行为；同类即合 |
| 本档 §2.4 写域（5 代码文件）vs §2.6/§4.5「§5 归实施者」 | 不矛盾：前者 = **代码文件写域**，后者 = **批次档段归属**（经 `batch_segment` 通道，不入 files 写域）；口径无需修 |

### 6.5 链终与清理

- 设计链闭合；**设计凭证已链终消费**——B04 后续任何新工作（含发布门暴露的问题）须重新走设计评审与签发。
- 测试期隔离产物（`.test-userdata` / `.test-userdata3` / `.test-dsh-home`）暂留：待发布门演练（T8）可能需要复跑；用户确认后清理。
- 附带环境前置修复：`node-runtime/node.exe`（台账 T6）已按 `download-node.js` 同源 URL 补入 Node v24.16.0，打包版后端可正常启动。
