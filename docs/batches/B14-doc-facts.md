# B14 —— 文档事实收口（零代码）

## §1 立案（主 agent）

### 1.1 目标（一句话）

一次性收口全仓**文档事实漂移**（行锚 / 计数 / 注入面表述 / 同源谓词 / 过期注），让「文档写的就是代码现在的样子」——**零代码批**（只改文档，不改行为）。

### 1.2 任务来源

台账技术待办五条同族（各带实测证据行，2026-09-17～09-18 累积）：
**T21**（B12 设计期：`AUTO-UPDATE.md` §2.2.5 / §3.1 AC10 与 `UPDATE.md` US-7 缺「插件标识入参门」前置）·
**T28**（`SHELL-UX.md` §2.2.6 注入面列与实现不符）·
**T31**（跳档行锚 / 计数漂移，承 B08）·
**T33**（B09 判定门 ↔ B19 读面谓词重复的**文档面**登记；抽共享模块 = 代码面归 B17）·
**T44**（`PET-ANIMATION.md` §2.2.3「`slot-rotate` 无消费路径」注与实测相抵）。

### 1.3 现状实测（证据，as-of 2026-09-19）

- **T28**：`main.js:66` 的 `init` 实键 = `getPetWindow` / `pet` / `setQuitting` / `APP_NAME`；`shell-affinity.js:18-23` 读 `deps.pet`（**`petSay` / `setPetState` 是 `pet` 的成员，不是顶层键** ✗）· `:262` 导出 `handleAffinityView`。
- **T31**：`build.yml` 实测 **74** 行（`AGENTS.md:39` 的 75 已由 B16 修正 ✓ ⇒ 该子项可销）；`package.json` scripts 现 **16 项**（B16 +4）⇒ 漂移面比登记时更大：凡「12 项」陈述均过期 ✗。逐处清单 = 台账 T31 行（`PET-ANIMATION.md` 5 · `PET-MULTIMONITOR.md` 2 · `SHELL-UX.md` 3 · `PET.md:259` · `B02:190`/`:295` · `B03:340` · `B18:169`/`:190`）。
- **T44**：实测行样本 `[2026-09-18T14:12:07.616Z] anim switch … reason=slot-rotate`（`%APPDATA%\Bigfish\pet-anim.log`）⇒ 轮换分支**可达**（B18 期成立、B19 起不成立）。
- **T21 / T33**：见台账行（`docs/TODO.md`）。

### 1.4 范围（做 / 不做）

**做**：① 五行逐条订正（每处引**现行值** + as-of 注）；② 同族顺手面（逐条登记，不扩语义；**已登记**：`main.js:26` 头注释「分居 15 个 shell-*.js」实测 **17**（B25 §2.5 复核发现，2026-09-19；`main.js` 属 B27 实施期冻结面 ⇒ 本批实施须在 B27 收口后 ✗））；③ 订正后各档 `npm run lint` 过；④ 五行在台账挂批并给出核销证据行。

⑤ **评审派生（2026-09-19，B31 复核轮 🟡）**：`docs/requirements/PET.md:553`（NFR-21）枚举「US-1…US-23 与 NFR-1…NFR-17 保持成立」与同条子项（US-24 / US-26 / US-29 / US-31）及当前计数（US 37 / NFR 26）不自洽——范围句同步（或加 as-of 限定）；非 B31 引入、无台账条目，随本批收口。
**不做**：① 不改任何 `.js` / `package.json` / `assets/**`（**零代码** ✗）；② 不做语义改写 / 设计变更（只订正事实面；设计变更须回设计评审）；③ 不抽共享模块（T33 的代码面 = B17）；④ 不碰台账 / 地图（主 agent 面）。

### 1.5 硬约束

1. **只订正事实，不改语义**——每处改动须与代码 / 机检实测一致（引证据行）。
2. D2 单一权威源 · D4 指针形态（`文档:节`，禁「见上 / 见该节」）· D3 计数与列表同改。
3. 行宽 ≤300；改后 lint PASS；人类可读（不压行）。
4. 行锚写法统一带「行号只作 as-of 参考」。

### 1.6 待决项（须裁定后才能定稿设计）

- **U-1**：多档写权的办理方式——由一名 eng-designer 统一代办（单轮收口），还是逐档分派？（推荐：统一代办）
- **U-2**：T33 的文档面落法——两处各加互指注（推荐：两处读者都会看）vs 在 `PET-ANIMATION.md` §2.6.4 集中记一处。

### 1.7 关联台账与需求档

台账：**T21 · T28 · T31 · T33（文档面）· T44**（核销条件 = 五条全部订正 + 机检）；需求档：无新增（工程 / 流程类，依 B11 先例）。

### 1.8 交付物与排期

交付物 = 五条订正落各归属档 + 本档 §2 任务书 + 验收证据（逐处 before / after）。**零代码 ⇒ 零写域冲突 ⇒ 可立即派设计**。

### 1.9 变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-19 | 建档（B14 立案）：T21 / T28 / T31 / T33 / T44 合批；零代码批；U-1 / U-2 待决 |
| 2026-09-19 | 范围补 ⑤（B31 复核轮 🟡 派生：`docs/requirements/PET.md:553` NFR-21 枚举范围句与自身子项 / 当前计数不自洽——同步或加 as-of 限定；非 B31 引入） |

---

## §2 本批任务书（eng-designer）

<!-- 由 eng-designer 填 -->

---

### 2.1 本批任务书（eng-designer · 2026-09-20）

**批目标**（承 §1.1）：收口全仓文档事实漂移——只订正事实表述，零代码、零语义改写。

**小轮划分**（用户 2026-09-20 指令）：本批拆为两小轮——本轮 = 第一小轮，只做 **T16（①部分）· T21 · T28** 三条；
**剩余条目 T31 / T33 / T44 / T47（+ T54 主 agent 面）留下一小轮**（本档随该轮追加 §2 增段，不改本段）。

### 2.2 本小轮条目表（三条）

| # | 条目 | 改前（漂移事实） | 改后（落点） | 判定句（可机检） |
|---|---|---|---|---|
| 1 | **T16 ①**（同源面一致性·函数行号漂移） | `SHELL-UX.md` §2.3 两处「单函数体量核对」行记具体行号：`shell-backend.js:165` / `shell-notify.js:105` / `:97-139`——实测 2026-09-20 = `:197`（startDsh）/ `:278`（startCompletionWatcher），已漂移 | 两处删具体行号改指符号名，原行号降级为「as-of 记录」括注（新续行）；`shell-mode.js:39` 实测未漂移，括注如实标注 | 判定句见下注 **J1**；三个代码档零 diff |
| 2 | **T21**（跨档前置缺记） | `AUTO-UPDATE.md` §2.2.5 / §3.1 AC10 与 `UPDATE.md` US-7 均未记「B12 插件标识入参门」前置 | 三处各补**前置注记**（指针 = `docs/design/SHELL-UX.md` §2.2.14），不改任何判定语义 / 边界条文 | 判定句见下注 **J2**；`node --test tests/update-lib.test.js` 不受影响（纯文档） |
| 3 | **T28**（依赖表注入面不符） | §2.2.6 依赖表 `shell-affinity.js` 行把 `petSay` / `setPetState` 写作**顶层注入键**——与实测相抵（实测细目与五实键清单见注 J3） | 该行注入面列按实测订正：`pet`（状态访问面）+ 五实键全列，带 T28 订正注 | 判定句见下注 **J3**；`main.js` / `shell-affinity.js` 零 diff |

> **注 J1（T16 ① 判定句全文；行宽压行轮由表内移此——内容逐字）**：`grep` 两处「单函数体量核对」正文不含
> `shell-backend.js:165` / `shell-notify.js:105` / `:97-139` 行号实参形态（括注内 as-of 引用除外）。
> **注 J2（T21 判定句全文）**：三处均含「插件标识入参门」与 `SHELL-UX.md` §2.2.14 指针；US-7 边界句逐字不变。
> **注 J3（T28 判定句全文与实测细目）**：判定句 = 该行含「`pet`（状态访问面——`petSay` / `setPetState` 为 `pet` 的成员」与「T28 订正 2026-09-20」。
> 实测（`main.js:116` / `shell-affinity.js:20-26`）实键 = `getPetWindow` / `pet` / `setQuitting` / `APP_NAME` / `affinityCore`，`petSay` / `setPetState` 为 `pet` 的成员。

### 2.3 本小轮受影响文件（全清单）

| 文件 | 净增行数 | 改动点 |
|---|---|---|
| `docs/design/SHELL-UX.md` | +1 | §2.3 两处体量核对行（T16 ①，其一拆为 2 行）；§2.2.6 依赖表一行（T28） |
| `docs/design/AUTO-UPDATE.md` | +1 | §2.2.5 前置注记 1 行 + §3.1 AC10 行内补前置（T21，等行替换） |
| `docs/requirements/UPDATE.md` | +1 | US-7 边界后补「前置」注记 1 行（T21） |

**零代码 ✗**：本轮 `git diff` 不含任何 `.js` / `package.json` / `.github/**` / `assets/**`。
**禁面未碰 ✗**：台账 / 地图 / `CHANGELOG.md` / 其它设计档 / 需求档 / `market.js` / `shell-plugins.js` / `market-update.js` / `shell-plugin-fetch.js`（用户手改面）——本轮零触碰。

### 2.4 本小轮验收判据（逐条可机检）

1. `npm run lint` → **GATE lint PASS**（行宽 ≤300 不含行尾 CR；本轮实测 PASS，checks=7 / selftest=20/20）。
2. `git diff --name-only` ⊆ { `docs/design/SHELL-UX.md`, `docs/design/AUTO-UPDATE.md`, `docs/requirements/UPDATE.md`, `docs/batches/B14-doc-facts.md` }（另有用户在飞面与主 agent 台账面如实披露，不属本轮）。
3. 判定句 3 条（§2.2 表）逐条 grep 可验。
4. D4 同形：T16 ① 两处处理方式一致（删行号改符号名 + as-of 括注）。

### 2.5 状态声明（2026-09-20）

- **本批尚未批准实施**——本档 §2 = 设计稿；评审发起权在用户，未经评审通过 + 用户明确批准不得进入实施核销。
- 本轮三条为**事实面订正已先行落笔**（用户指令「先落三条修改再补 §2」）；若评审要求改判，按评审裁决回改。
- **剩余条目 T31 / T33 / T44 / T47（+ T54 主 agent 面）留下一小轮**；T31 子项清单与 T33 落法（U-2）随该轮定。
- 写权说明：本档 §1 / §4 / §6 = 主 agent；本段（§2）= eng-designer；越段不写。

### 2.10 第二小轮订正块（eng-designer · 2026-09-20）

**小轮划分**（用户 2026-09-20 指令，承 §2.1）：本轮 = 第二小轮，收口 **T31 / T33 / T44 / T47 + 机械修 + PET-AFFINITY 消歧**。
**现状事实（本轮开档核验）**：T31 / T33 / T44 / T47 的订正主体已在盘（各档带「2026-09-20 订正」注）——本轮按任务书逐条**核验 + 补残点**，不重复写已在场订正。

**本小轮条目表（七条）**

| # | 条目 | 本轮处置 | 落点 |
|---|---|---|---|
| 1 | T31（行锚 / 计数漂移） | 逐处核验已在场订正 + 补 AC14 残点 | PET-ANIMATION.md / PET-MULTIMONITOR.md / SHELL-UX.md / B02 / B03 / B18（明细见下） |
| 2 | T33（同源谓词文档面） | 两处互指注核验已在场；SHELL-UX 侧拆行 | PET-ANIMATION.md §2.6.4 · SHELL-UX.md §2.2.12 |
| 3 | T44（slot-rotate 可达性注） | 实测核（pet-chain-core.js rotate 分支在场）+ 拆行 | PET-ANIMATION.md §2.2.3 |
| 4 | T47（T9 验证句裁定失效） | 核验两处订正在场（§2.5 ⑥ · 注 TC-31） | PET-MULTIMONITOR.md |
| 5 | 机械修（批次档超宽行） | 已不存在——§2.2 表内长内容已移注 J1–J3，全档 0 行 >300（本轮实测） | docs/batches/B14-doc-facts.md |
| 6 | PET-AFFINITY:40 改前实况消歧 | 加「B31 改前实况 + 现值」注（数值语义未动） | docs/design/PET-AFFINITY.md:40 |
| 7 | 新增超宽拆行（lint 实测驱动） | PET-ANIMATION.md:293 与 SHELL-UX.md:887 各拆 1 行 | 同上两档 |

**T31 逐处核验明细**：PET-ANIMATION.md 六处（§1.2 打包面 / §1.3.3 / §2.1 会话日志行 / §2.3 落点表 / 注 F1 / DD-3）
+ 本轮补 §3.1 AC14（`package.json:78` → `build.files` 段 + as-of 注，实测 :92）；PET-MULTIMONITOR.md 两处（§2.4 注 M5 后 / §2.7 测试面）；
SHELL-UX.md 四处（§2.1 C8 / 选型 K 候选 3 / §三 测试层 / §3.3 语法门）；B02:190 / B02:295；B03:340；B18:169 / B18:190。**未碰**：`docs/requirements/PET.md:259`（B23 修正轮在飞——禁碰面，如实报告，如需订正由主 agent 归口）。
AGENTS.md 的 build.yml 75→74 子项已由 B16 修正（§1.3 已注可销）。

**受影响文件（本小轮本轮实际落笔）**

| 文件 | 改动点 |
|---|---|
| `docs/design/PET-ANIMATION.md` | AC14 行锚订正（:1311）+ T44 注拆行（:293-294） |
| `docs/design/PET-AFFINITY.md` | :40 加「B31 改前实况」消歧注（现值 = affinity-core.js:20-22） |
| `docs/design/SHELL-UX.md` | T33 互指注拆行（:887-888；该档为 B33/B34 并写档——只动 T33 注行，他批新段零触碰） |
| `docs/batches/B14-doc-facts.md` | 本段（§2.10） |

**可机检验收判据（本小轮）**

1. `npm run lint` → GATE lint PASS（本轮实测：syntax 67 / width PASS frozen=15 / lines near=4 / dag / fanout / assembly 13-13 / samples；selftest 20/20）。
2. T31 判据：grep「T31 订正 2026-09-20」命中 ≥ 16 处且 AC14 行不再含裸锚 `package.json:78`；grep `package.json:3[0-9]` 于 B02 / B03 / B18 为 0。
3. T33 判据：`docs/design/PET-ANIMATION.md` §2.6.4 与 `docs/design/SHELL-UX.md` §2.2.12 各含「T33 互指注」且互指对方节号。
4. T44 判据：PET-ANIMATION.md §2.2.3 注含「T44 订正 2026-09-20」与两段结论（B18 期 / B19 起），且 ② 段产线证据与 `pet-chain-core.js:86-88` 实测一致。
5. T47 判据：PET-MULTIMONITOR.md §2.5 ⑥ 与注 TC-31 各含「T47 订正 2026-09-20」及「Windows 系统级行为、非本产品缺陷」语义。
6. 行宽：上述四档本轮新增行均 ≤300（lint width PASS 实测）；零代码（`git diff --name-only` 不含 `.js` / `package.json` / `assets/**`）。

**B14 全部条目收口状态（2026-09-20 判定）**：
T16 ① / T21 / T28 = 已收口（第一小轮，§2.2）；T31 / T33 / T44 / T47 + 机械修 + PET-AFFINITY 消歧 = 已收口（本小轮，见上）。
**T16 ②③④ 不在本批两小轮指令内**——②（`shell-backend.js` 头注释序）/ ③（`getPort` / `init` 枚举口径两档不同形）/ ④（B07 §5.2 三处行号残差）未收口，如实报告，处置由主 agent 定。
**T54 写权 = 主 agent** ⇒ 不在本角色写域，本批两小轮均未触碰（台账 / 地图 / CHANGELOG 同步由主 agent 归口）。

**状态声明**：本批尚未批准实施——本档 §2 = 设计稿；评审发起权在用户，未经评审通过 + 用户明确批准不得进入实施核销。
写权说明：本档 §1 / §4 / §6 = 主 agent；§2 = eng-designer；越段不写。

### 2.11 追加三处（用户 2026-09-20 指令；eng-designer · 2026-09-20）

主 agent 追加授权三处（均属 T31 同类面，顺手一起收，不另立范围）：

| # | 条目 | 改前 | 改后（落点） |
|---|---|---|---|
| 8 | ARCHITECTURE.md 行数旧值（B23 修正轮发现；用户显式授权） | `shell-affinity.js` 记 357 · `shell-pet.js` 记 458 | `:139` → 334（as-of 2026-09-20 实测；原记 357 过期）· `:150` → 467（as-of 2026-09-20 实测；原记 458 过期）——只动这两行，未扩面 |
| 9 | 超宽行两处（纯行宽机械修，语义逐字不变） | PET-ANIMATION.md:293（326）· SHELL-UX.md:887（323） | 均已拆行（上轮已落：PET-ANIMATION ② 段拆为 :293-294 两行；SHELL-UX T33 互指注拆为 :887-888 两行）——本轮实测两档 0 行 >300 |
| 10 | 记账 | — | 本段（§2.11） |

**核验**：`shell-pet.js` 实测 **467**（口径 = 换行符计数、尾空段不计）——与主 agent 提供的 466 差 1：该档属另一实例写域（B33/B34 市场批在飞），实测瞬间前后可能有并发改动，以本角色实测值落档、差量如实披露。
**lint 前后对照**：改前 GATE lint FAIL（width violations=2，PET-ANIMATION + SHELL-UX）；改后 **GATE lint PASS（checks=7 / selftest=20/20）**，零违规。
**受影响文件**（追加面）：`docs/design/ARCHITECTURE.md`（两行）· `docs/design/PET-ANIMATION.md`（拆行，已落）· `docs/design/SHELL-UX.md`（拆行，已落）· 本档（§2.11）。
**零代码保持**：本轮 `git diff --name-only` 文档面 = ARCHITECTURE / PET-AFFINITY / PET-ANIMATION / SHELL-UX / 本档；无 `.js` / `package.json` / `assets/**` 改动（他批并发面如市场档不在本角色 diff 内）。

## §3 设计评审（评审子代理）

<!-- 由评审子代理填 -->

---

## §4 评审裁决与实施启动（主 agent）

<!-- 由主 agent 填 -->

---

## §5 实施记录（eng-coder）

