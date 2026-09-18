# 批次档 B27 —— 桌宠观感 II（动作节奏 / 逃跑表达 / 抛掷边界三面）

> 本档 = **六段一作者**（append-only）：§1 主 agent · §2 eng-designer · §3 评审子代理 · §4 主 agent · §5 eng-coder · §6 父代理。
> 关联：台账 `docs/TODO.md` §一（**R21 / R22 / R23**）· 需求档 `docs/requirements/PET.md` · 设计档 `docs/design/PET-ANIMATION.md` + `docs/design/PET-MOVEMENT.md`。

---

## §1 立案（主 agent，2026-09-19）

### 1.1 目标（一句话）

把 B26 / B21 之后用户实机发现的**三条桌宠观感问题**合并成一批、一次设计一次实施：**① 动作节奏太赶（R23）② 逃跑表达力不足（R22）③ 抛掷活动范围上 / 左 / 右三面比可见身体小一圈（R21）**。

### 1.2 任务来源（用户原话，2026-09-19）

- **R23（节奏）**：「现在的动作**非常着急紧张**…从视觉上面来说**隔三岔五一个动作更好看**，而不是一直忙着切换动作」⇒ 用户已裁：**①+② 一起做**（① 加权待机 + ② 真·静默期），「很自然」。
- **R22（逃跑）**：「**我没看出来她是逃跑的动作**」+「她被拖到墙角的时候**一直都是星星眼**，而不太像逃跑动作」。
- **R21（边界）**（2026-09-18）：「可以的，但是**上左右的边界有点小了，下面的是足够的**」+ 先验「可能是因为**宠物的模型有空白宽度**」。
- **合批决定**：用户 2026-09-19「好，**合成一批一起做**」✓。

### 1.3 现状实测（勘察，2026-09-19；主 agent 亲验，行号为 as-of）

- **R23**：池权重 `assets/pet-anim/pool.json:7`（`weights={idle:10,turn:5,move:0}`）+ 分类权重 20/20/16/14/10（合计 80；V4 余量归动作）⇒ **动作类概率 ≈85%**；换段间隔实测 ≈9–10 s（`pet-anim.log` 连续 `pre-end` 行）。
- **R22**：贴墙判定 `shell-pet-drag.js:200`（`escaped` 实测 = 1 ×6；阈值 `PET_WALL_EPS = 4`，`shell-pet-geometry.js:31`）。
- **R22 续**：松手 `setForceRun(true)` ⇒ `doWander()` 取 `escape-<dir>` ⇒ 链 `reason=slot-escape` **实测触发**（22:35 / 22:41 两轮共 6 次）但**每次只活 ≈0.7–1.3 s 即回 idle**（腿长 200–500 px ÷ 0.34 px/ms ⇒ 0.6–1.5 s；`shell-pet.js:314-321`）。
- **R22 续**：**拖动期间全程显示 `events.drag`（被鼠标拖拽悬空反馈）** ⇒ 用户读作「星星眼」。
- **R21**：物理边界 = **窗口矩形**口径（`PET_SIZE_DIP = { w: 250, h: 270 }`，`shell-pet-geometry.js:29`）；**地面**已由 B26 的 F2 补偿（`FEET_INSET_DIP = 30`）；**上 / 左 / 右三面未补偿**（上 ≈44 DIP 可算〔270 − `PET_FEET_Y`(244) − 精灵高 200〕；左右留白 = (250 − 可见宽)/2、量级 ≈40 DIP 级 —— **未实测**，由本批设计勘察实测）。

### 1.4 硬约束（不得偏离）

1. **不改已验收语义**：B26（让位 / 地面口径 / 气泡节流）与 B21（衔接 / R1·R2 / 交互档分类 / 拖动让位守卫）的已验收行为不得回退；本批只做增量与参数面。
2. **零改动面与写域**由 §2 给全清单（实施期不得扩张；`git diff --stat` 逐档机检）。
3. **素材本体零增删改**（池键可增、权重可调、常量可调）。
4. **实机观感项归用户**（人工项如实分列，不自判）。
5. **一批一设计一评审一批准一实施**（用户 2026-09-19 合批裁定）。

### 1.5 待决项（须裁定后才能定稿设计；设计者给候选 + 理由）

- **U-1 节奏默认值**：动作概率 / 静默时长上下界（给候选值与理由；实机后一处常量可调）。
- **U-2 静默期的「安静」形态**：保持「待机呼吸」段循环 vs 走静态待机帧（PNG 通道）——含"静默期是否禁止换段"的判据口径。
- **U-3 逃跑表达**：只调腿长 / 速度 vs 让逃生档**播完整段再回** vs 拖到墙角期间即有「挣扎 / 被拎住」表达——三者可组合；须同时处理「拖中一直显示悬空反馈」的观感。
- **U-4 R21 越界口径**：按可见身体盒扩三面 ⇒ 窗口透明留白越出工作区 ⇒ 照 B26 O-14 立**具名例外**，或改 B03「标称矩形 ⊆ 工作区」口径（设计者判 + 用户裁）。

### 1.6 关联台账与需求档

- **台账**：`docs/TODO.md` §一 **R21 / R22 / R23**（三者 status = 在途，本批 = 归批目标；收口时核销归档）。
- **需求档**：`docs/requirements/PET.md`（节奏 / 逃跑 = US-8 与 US-29–31 邻接面；边界 = US-24 面 —— 具体指认由 eng-designer 定稿）。
- **设计档**：`docs/design/PET-ANIMATION.md`（节奏与链决策 / 逃生档）+ `docs/design/PET-MOVEMENT.md`（边界口径与地面／三面 insets）。
- **前置批次**（本批不得回退其验收面）：B26（`docs/batches/B26-pet-feel.md` §6）· B21（`docs/batches/B21-pet-action-selection.md` §5 / §6）。

### 1.7 变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-19 | 立案（主 agent）：三条目（R21 / R22 / R23）合批；用户已裁 ①+②（节奏）与「合成一批一起做」。 |

---

## §2 批次任务书（eng-designer 写）

<!-- 由 eng-designer 填 -->

---

### 2.1 三方一致清单（条目 3 · AC 6 · TC 13 · DD 7 · C 6 · O 5）

| # | 本批条目 | 需求档条目 | 设计档验收（回指） | 状态 |
|---|---|---|---|---|
| 1 | **R23 节奏「隔三岔五」**：加权待机（动作 85% → 40%）+ 真·静默期（动作类段后 30 s 不换段） | `docs/requirements/PET.md` §三 **US-32** + US-15 的 B27 修订注记 / §四 **NFR-24** | `docs/design/PET-ANIMATION.md` §2.14 / §3.9 **AC32、AC33** / §3.10 **TC-50–TC-54** | 在批 |
| 2 | **R22 逃跑与拖拽表达力**：逃跑腿专用参数 + escape 播完整段再回（loop=false + R1/R2 作用域扩展）+ drag 换段「被吓一跳」 | `docs/requirements/PET.md` §三 **US-33** + US-31 / US-29 的 B27 修订注记 / §四 **NFR-24** | `docs/design/PET-ANIMATION.md` §2.14 / §3.9 **AC34** / §3.10 **TC-55–TC-58** | 在批 |
| 3 | **R21 边界口径（上 / 左 / 右三面按可见身体）**：四面 insets 单点常量 + `petEdgeBounds`（飞行与散步同取）+ B03 具名例外四面 | `docs/requirements/PET.md` §三 **US-34** + US-24 的 B27 修订注记 / §四 **NFR-25** | `docs/design/PET-MOVEMENT.md` §2.2.14 / §3.1 **AC23、AC24** / §3.2 **TC-41–TC-44** | 在批 |

**计数（D3；口径 = 末位编号）**：本批条目 **3**；设计档验收 **AC 6 条**（AC32–AC35 = 动画档 · AC23–AC24 = 位移档）+ **TC 13 条**（TC-50–TC-58 + TC-41–TC-44）+ **DD 7 条**（DD-38–DD-43 + DD-18）+ **C 6 条**（C57–C62）+ **O 5 条**（O28–O30 + O16–O17）；
需求档新增 **US 3 / NFR 2**（US 31 → 34 · NFR 23 → 25）+ **B27 修订注记 4 处**（US-15 / US-29 / US-31 / US-24；NFR-21 注记计数 9 → 13）。

### 2.2 实施面（改什么 / 每个面一句话 + 证据）

- **R23-①（数据面一行）**：`assets/pet-anim/pool.json` 的 `weights` 改 `{idle:55, turn:5, move:0}`、`categories` 权重 ×0.5（10/10/8/7/5，合计 40 ⇒ V4 合计 100 ≤ 100 通过；动作类概率 = 100−55−5 = 40%）。证据 = `pool.json:7` / `:14-59`；`pet-chain-core.js:26-31`（rollKind 余量归 action）。
- **R23-②（链内静默状态机）**：`pet-chain-core.js` 增常量 `PET_QUIET_MS = 30000`（单点）+ `decideNext` 增 `quiet` 入参与第四类计划（`slot='idle' ∧ !quiet ∧ playing.kind ∈ {action, turn}` ⇒ `plan='quiet'`，静默段 = `pool.events.quiet` 回退 `pool.idle[0]`）；
  `pet-chain.js` 增 `quietActive`/`quietTimer`/`clearQuiet()`（非 idle 槽 / 回落 / 池重配三处清除）+ 两型日志（`anim quiet enter|end`）与换段 reason `quiet`/`quiet-end`。证据 = `pet-chain.js:163-171`（triggerChainDecision）/ `:72-86`（setSlot / setDragging）。
- **R22-①（逃跑腿专用常量）**：`shell-pet.js` 增 `ESCAPE_LEG_MIN_DIP=300 / ESCAPE_LEG_RANGE_DIP=300 / ESCAPE_LEG_SPEED=0.45`，`doWander` 的 distance/speed 加 escape 分支（现共用 run 分支）。证据 = `shell-pet.js:322` / `:337`（现 run ? 200+rand*300 / 0.34）。
- **R22-②（escape 播完整段）**：`pet-chain.js` 的 `startSlot` escape 分支 `loop` 实参 true → false（drag 仍 true）；`pet-chain-core.js` 的 `judgeSwitch` 作用域前提扩为「`loop ∨ slotKey` 以 `escape-` 开头」（R1/R2 扩展）。证据 = `pet-chain.js:110-116` / `pet-chain-core.js:92-100`；腿末 idle 由既有规则 3 推迟（`pet-chain.js:80`）。
- **R22-③（drag 换段）**：`pool.json` 的 `events.drag` 值改 `["被吓一跳"]`（素材本体零改动；引用段 95 → 94 / 未引用 11 → 12）。证据 = `pool.json:73`。
- **R21（边界四面化）**：`pet-physics-core.js` 增常量 `TOP_EDGE_INSET_DIP=44` / `SIDE_EDGE_INSET_DIP=41`，`groundBounds` 推广为四面补偿并**改名 `petEdgeBounds`**（null 透传；+导出）；
  消费点两处：`shell-pet-physics.js` 的 `evaluateArm`（飞行 bounds）与 `shell-pet.js` 的 `doWander`（散步 y 归位 + 撞墙判定）。证据 = `pet-physics-core.js:204-208` / `shell-pet-physics.js:121-123` / `shell-pet.js:306-307`。
- **实施顺序**：① 池数据（R23-① + R22-③）→ ② 核心档（`pet-chain-core.js` / `pet-physics-core.js` 纯函数）→ ③ 域档（`pet-chain.js` / `shell-pet.js` / `shell-pet-physics.js`）→ ④ 开发期桩测 `.thincoder/b27-pet-feel-2-stub.mjs`（新建，gitignored）→ ⑤ NFR-19 扫描集重跑登记（本档 §5）。

### 2.3 受影响文件（file 级 + 行数红线；现状行数 = 换行符口径，实测 as-of 2026-09-19）

| # | 文件 | 现状行数 | 动作 | 预计增量 | 末行预算（≤500） |
|---|---|---|---|---|---|
| 1 | `pet-chain-core.js` | 217 | 改 | +14 ~ +20 | ≤ 237 |
| 2 | `pet-chain.js` | 281 | 改 | +26 ~ +36 | ≤ 317 |
| 3 | `shell-pet.js` | 457 | 改 | +7 ~ +11 | ≤ 468 |
| 4 | `pet-physics-core.js` | 347 | 改 | +7 ~ +11 | ≤ 358 |
| 5 | `shell-pet-physics.js` | 327 | 改 | +0 ~ +2 | ≤ 329 |
| 6 | `assets/pet-anim/pool.json` | 76 | 改（数据档） | — | — |
| 7 | `.thincoder/b27-pet-feel-2-stub.mjs` | — | 新建（gitignored 非交付物；收口按纪律判退役） | +180 ± 40 | — |

**零改动面（机检 = 零 diff；AC24① / AC35① 的取证对象，15 档）**：`shell-pet-geometry.js`（437）· `shell-pet-drag.js`（239）· `pet-preload.js`（18）· `pet.html`（125）· `pet.js`（240）· `shell-pet-work.js`（264）· `pet-work-core.js`（166）· `main.js`（249）· `shell-ipc.js`（50）· `package.json`（140）·
  `assets/pet-anim/webm/**` · `assets/pet-new/**` · `THIRD-PARTY-NOTICES.md` · `README.md` · `版本说明.txt`。
**贴线档（≥480 行）**：本批写域内**无**（最大 = `shell-pet.js` 457 → ≈468 < 480）⇒ 无需拆分计划。
**300–500 行档立场**：改动代码档 5 个中 4 个 >300（`shell-pet.js` 457 · `pet-physics-core.js` 347 · `shell-pet-physics.js` 327 · `pet-chain.js` 281 → ≈317 跨 300；`pet-chain-core.js` 217 → ≈237 不跨）——均只增机制、未跨 500 ⇒ 本批不启动拆分（承 B20/B26 同款立场）。

### 2.4 验收（AC → 取证）

- **AC32（US-32，节奏机制）**：桩测 `decideNext` 判定矩阵（slot × kind × quiet 全组合）+ `parsePool` `ok=1` ∧ 权重逐值 + `PET_QUIET_MS` 定义恰 1 处——取证 = `node .thincoder/b27-pet-feel-2-stub.mjs`（末行 `pass/total PASS`）。
- **AC33（US-32，节奏运行期）**：动作段末 ⇒ `reason=quiet` + `anim quiet enter`；静默区间零 `anim chain`；时长 == `PET_QUIET_MS`（+500 ms）；打断 ⇒ `anim quiet end reason=slot` + ≤300 ms；idle 段不静默——取证 = `BIGFISH_PET_DEBUG=1` 的 `pet-anim.log` + 探针 `--chain` 长跑。
- **AC34（US-33，逃跑与拖拽表达）**：桩测 `judgeSwitch` 扩展矩阵；运行时 `slot-escape` 行 `loop=0` ∧ 窗口内零 `slot-idle` ∧ 存活 ≈ 段长；折返 `anim hold` 行；池 `events.drag` = 被吓一跳 ∧ 引用 95→94；`ESCAPE_LEG_*` 定义恰 1 处；⑥ 人工项——取证 = 桩测 + 日志 + 静态 + 实机目视。
- **AC35（NFR-24，零回退与规范）**：零改动面 15 档零 diff + `package.json` 零 diff + 素材零 diff + 池只增 quiet 键 / 改 drag 引用 + 行宽行数 + 静默期内交互 ≤300 ms——取证 = `git diff --stat` + 静态 + 日志。
- **AC23（US-34，边界四面化）**：桩测 `petEdgeBounds` 四边增量与常量等式（TOP === PET_FEET_Y − PET_BODY_TARGET_H；SIDE === round((250 − hit.w)/2)）+ 两消费点符号级 + 侧 / 顶边贴边日志算术——取证 = 桩测 + 静态 + `pet-physics.log` / `pet-geometry.log`。
- **AC24（NFR-25，零回退与可见性）**：冻结面零 diff + 补偿后位置 `visible=1` + 行宽行数——取证 = `git diff --stat` + 日志 + 静态。
- **既有判据的 B27 修订注记（同源成文）**：AC3 注 A′（非静默期口径）/ AC27 注 E′（quiet 行口径）/ TC-2 / TC-38 / TC-40 期望订正（`docs/design/PET-ANIMATION.md` §3.1 / §3.7 / §3.8）。
- **NFR-19 连带**：扫描集（128 例）按新四面边界**重跑并重新登记**（登记行落本档 §5；≤5 s 硬上界不变）。

### 2.5 明确出批（本批不做，逐条）

- **热闹度档位**（安静 / 正常 / 活泼 设置面）——可选后置（§2.14.2 候选 3）。
- **新制「挣扎 / 被拎住」素材**——素材本体零增删改（硬约束 3）⇒ C 面 / B24（§2.14.7 候选 4）。
- **改 B03「标称矩形 ⊆ 工作区」口径本体**——U-4 取 ① 具名例外（§2.2.14.2 B 组）。
- **walk / run 段的「素材长于位移」张力**——O22 照旧（仅 escape 面由本批处置）。
- **睡眠 / 散步 / 工作档节奏与优先级**——逐字不改（C58 / C62）。
- **触发阈值（4px）与逃跑方向语义**——US-7 修订注记不回退。
- **台账 / 地图 / 其它批次面 / 本档 §1 · §3 · §4 段**——不碰（写权矩阵）。

### 2.6 实施前置与实机标定项

- **前置（硬）**：本段 = **设计就绪待评审**；实施权在「评审通过 + 用户批准 + designToken 签发」之后（未经评审批准不得开工）。
- **前置（U 项，批准时确认）**：U-1 节奏默认值（40% / 30 s）· U-2 静默形态（呼吸段循环）· U-3 逃跑表达三件套（含 drag 换段被吓一跳）· U-4 边界口径（具名例外四面）——候选与理由 = `docs/design/PET-ANIMATION.md` §2.14.8 / §2.14.13 · `docs/design/PET-MOVEMENT.md` §2.2.14.2。
- **实机标定项（用户目视，设计层不自裁）**：① 节奏观感（O28）；② drag 换段观感（O29）；③ 逃跑时长观感（O30）；④ 三面贴边的 alpha 残差（O16）；⑤ 混合 DPI / 任务栏置顶的骑线推离条件分支（承 O-14）——回正面 = 各一处数据 / 常量。
- **实施后强制**：NFR-19 扫描集重跑（§2.4）+ 三道门（lint / test:full / test:integration）+ 零改动面机检。

### 2.7 三方声明

- **三方同源**：本档 §2.1 的条目清单 = 设计档验收回指（`PET-ANIMATION.md` §3.9 / `PET-MOVEMENT.md` §3.1 的 AC32–AC35 / AC23–AC24）= 需求档条目（US-32…US-34 / NFR-24…NFR-25 + 四条 B27 修订注记）——同一来源，逐条对应（D2 单一权威源：契约与判据以设计档为准，需求口径以需求档为准）。
- **写域声明**：本设计轮只写需求档 / 两个设计档 / 本档 §2（本 spawn 声明域）；代码、台账、地图、提示词、批次档其余段**未触碰**；`groundBounds → petEdgeBounds` 的**代码改名**由实施轮执行（本设计轮只落文档面改名注记）。
- **需求档不经 advisor**：需求条文以用户批准时确认为定稿；设计面待评审（发起权在用户）。

### 2.8 续跑收口轮（eng-designer，2026-09-19；append-only）

- **背景**：上轮设计轮被基础设施 400 掐断后续跑；勘察发现 brief 快照低估了上轮落盘（§3.9 / §3.10 / AC23–24 / TC-41–44 / 两档变更记录**实际已在树**）——本轮未重写任何已落节，只做**三方一致缺口修补 + 行宽清理**。
- **修补清单（一致性面，逐条）**（**父侧代笔注记**：本条原为单行 587 字符、超行宽 300 ⇒ 由主 agent 折行为多条，措辞逐字未改）：
  - ① 两设计档 §1.1 补 B27 行（ANIMATION：US-32/33/NFR-24 三行 + US-15/29/31 行补修订注记；MOVEMENT：US-34/NFR-25 两行 + US-24 行补注记）；
  - ② ANIMATION §3.1 增**注 H**（AC32–AC34 判据细目，表行收窄为「细目 = 注 H」形态）；
  - ③ TC-2 补「B27 修订（静默期 = 预期停摆）」标注（注 A′ 声称的订正此前未落到行）；
  - ④ TC-6 输入池权重 `{idle:10,…}` 同步为 B27 值 `{idle:55,turn:5,move:0}`（旧值悬空）；
  - ⑤ MOVEMENT §3.2 标题计数 TC-40 → **TC-44**（D3）；
  - ⑥ MOVEMENT §3.3 手段①扩 **AC21–AC24**（B26/B27 桩测面并入取证清单）；
  - ⑦ MOVEMENT 新观察项编号 **O16/O17 → O-16/O-17**（承 O-1…O-15 形态，残留即示范）；
  - ⑧ MOVEMENT §2.3 补 B27 文件表指针行、§2.2.14 头补三方份额行、档头标题与需求档/批次档指针同步；
  - ⑨ 行宽 9 行全清（ANIMATION 6 + MOVEMENT 3；细目移注 / 变更记录行压缩，语义零变更）。
- **计数（D3；与本档 §2.1 一致，无变化）**：条目 3 · AC 6（AC32–35 + AC23–24）· TC 13（TC-50–58 + TC-41–44）· DD 7（DD-38–43 + DD-18）· C 6（C57–C62）· O 5（O28–O30 + O-16–O-17）。
- **门禁**：`npm run lint` = **GATE lint PASS**（width / lines / dag / fanout / assembly 全绿；最后一次写入之后实跑）。

## §3 设计评审（评审子代理）

<!-- 由评审子代理填 -->

---

## §4 评审裁决与实施启动（主 agent）

<!-- 由主 agent 填 -->

---

## §5 实施记录（eng-coder）

<!-- 由 eng-coder 填 -->

---

## §6 验收核销（主 agent）

<!-- 由主 agent 填 -->
