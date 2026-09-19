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

### 2.9 修正轮 1 记录（eng-designer，2026-09-19；append-only）

- **源**：评审轮 1（§3 轮次 1：🔴3 / 🟡3 / 🔵5，共 11 条）+ 父侧裁决口径——①–⑩ 逐条收敛；#11（评审范围限制）父侧处置，本设计轮不动。
- **🔴#1（零回退清单两歧）**：`docs/design/PET-MOVEMENT.md` AC24① 与 `docs/requirements/PET.md` NFR-25 的零 diff 清单对齐 **15 档口径**（= 本档 §2.3 零改动面行 / `docs/design/PET-ANIMATION.md` §3.9 AC35①），不含 `pet-chain*.js` 与 `assets/pet-anim/pool.json`（本批改动面）。AC24① 因表行宽约束以**指针对齐**（逐档枚举将超 300）；NFR-25 逐档枚举（两行）。
- **🔴#2（escape `loop` 旧句）**：`docs/design/PET-ANIMATION.md` §2.2.3 与 §2.13.8 各补 B27 修订注（escape 例外：`loop=false` 单遍；drag 仍 `loop=true`）；顺查全档 `loop=true` 命中——§2.13.5 / §2.13.6 / O22 等均已带 B27 注或与 escape 无关，无需改。
- **🔴#3（静默区间定义与状态机顺序相抵）**：区间锚改**静默标记行**（`anim quiet enter` → 其后第一条 `anim quiet end`，`reason ∈ {timer, slot}` 均收）；不变式重述（两行之间零其它 `anim switch` 行、零 `reason=quiet` 系以外的换段行）；计时退出 `anim chain` 决策行显式豁免（在 `anim quiet end` 之后）。落点六处：§2.14.3 判据行 / §2.14.9 不变量句 / 注 A′ ① / AC33② 行 / 注 H② / TC-50。
- **🟡#4（`turn` 翻转标记去向）**：§2.14.9 与注 H① 写明——翻转与计划类型解耦，`plan='quiet'` 保留 `turn` 段翻转标记（翻转照执行）；桩测矩阵加断言（`turn` 段末 ⇒ `plan='quiet'` ∧ 翻转已执行）。
- **🟡#5（注 E′ ② 归因）**：订正——入静默（`reason=quiet`）走既有两触发（预触发 ⇒ `overlap ≈ PET_OVERLAP_MS`；`ended` 兜底 ⇒ 0）；「或 0」的必要性主要来自 `quiet-end`（静默段 `loop=true` 无自然结束 ⇒ 无预触发窗口）与 ended 兜底。
- **🟡#6（AC34② / TC-55 容差与措辞）**：存活口径改「段长 − `PET_OVERLAP_MS` ± 250 ms」（≈ 8.84 s；依据 = `loop=false` ⇒ 段末前 1200 ms 预触发换段，预载 ≤300 ms 计入容差）；TC-55 措辞去自相抵（播至段末前 `PET_OVERLAP_MS` 经 `reason=pre-end` 换段，段尾由叠化退场）。
- **🔵#7（注 B′ 措辞）**：`docs/design/PET-MOVEMENT.md` 注 B′ 改「等式按 AC23① 字面用 `PetChainCore` 常量求值；`pet.html` 的 250×270 作三方交叉核对（弱镜像面收窄）」。
- **🔵#8（AC25 / TC-37 池计数）**：各补 B27 修订标注——B27 起引用 94 / 未引用 12（细目同 AC34④）。
- **🔵#9（`pet-chain.js` 跨 300 行档复核；§2.3 立场句补记）**：复核结论——`pet-chain.js`（281 → ≤317，本批跨 300）：职责仍单一（渲染链调度一处）、只增静默状态机与 escape 单遍机制、未跨 500 ⇒ 不启动拆分（承 B20 / B26 同款立场）。按本档 append-only 纪律记于本段。
- **🔵#10（NFR-19 重跑括注）**：`docs/design/PET-MOVEMENT.md` §2.2.14.4 括注改「档界值（800 px/s）不变；例的档属按重跑重分类」（顶边抬高 ⇒ 撞顶例落地冲击速度随天花板高度增大，可能跨档）。
- **计数（D3；与 §2.1 一致，无变化）**：条目 3 · AC 6（AC32–35 + AC23–24）· TC 13（TC-50–58 + TC-41–44）· DD 7（DD-38–43 + DD-18）· C 6（C57–C62）· O 5（O28–O30 + O-16–O-17）。
- **门禁**：`npm run lint` = **GATE lint PASS**（本段写入之后实跑；全档行宽 ≤300）。

### 2.10 修正轮 2 记录（eng-designer，2026-09-19；append-only）

- **源 = 父侧裁决（设计者自报存疑项 #2；TC-40 尾句与 TC-55 同属一类自相抵——`pre-end` 发生在播完之前）**；落点 = `docs/design/PET-ANIMATION.md:1497`：尾句改「escape 段播至段末前 `PET_OVERLAP_MS` 经 `reason=pre-end` 换段（段尾由叠化退场；存活 ≈ 段长 − `PET_OVERLAP_MS` ± 250 ms）」，其余字面不动（行宽 250 ≤ 300）；lint = GATE lint PASS（本段写入之后实跑）。

## §3 设计评审（评审子代理）

<!-- 由评审子代理填 -->

---

### 轮次 1（评审子代理）

**评审对象**：B27「桌宠观感 II」设计面（R21 抛掷边界三面 / R22 逃跑表达力 / R23 动作节奏）——需求档 B27 条目（US-32…US-34 / NFR-24–25 + 四处修订注记）· `docs/design/PET-ANIMATION.md` §2.14 + §3.9 AC32–AC35 + §3.10 TC-50–58 · `docs/design/PET-MOVEMENT.md` §2.2.14 + §3.1 AC23–AC24 + §3.2 TC-41–44 · 批次档 §1–§2 任务书。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | Acceptance criteria · Consistency | 🔴 | **B27 的「零回退 / 冻结面」清单两歧且含本批自身要改的档**：需求档 NFR-25（`docs/requirements/PET.md:564`）与位移档 AC24①（`docs/design/PET-MOVEMENT.md:736`）把 `pet-chain*.js` / `assets/**` 列为「零 diff 冻结面」，而本批自身要改 `pet-chain-core.js` / `pet-chain.js`（批次档 `docs/batches/B27-pet-feel-2.md:92-93`）与 `assets/pet-anim/pool.json`（`:97`）⇒ AC24① 的「逐档 `git diff --stat` 空」机检**不可满足**；同批另一侧（AC35① `docs/design/PET-ANIMATION.md:1516-1517`、NFR-24 `docs/requirements/PET.md:554-555`、批次档 `:100-101` 的 15 档清单）均不含此二者 ⇒ 同一机制（本批冻结面）两处描述相抵。 | 把 AC24① 与 NFR-25 的零回退清单对齐既有 15 档口径（批次档 `:100-101` / AC35①）；若本意是「R21 面不得触碰链与池」，请改写为面内约束并改用面内取证，勿用全仓 `git diff --stat` 判据。 |
| 2 | Consistency（机制口径） | 🔴 | **escape 档 `loop` 语义两处旧句未随 B27 修订**：`docs/design/PET-ANIMATION.md:274`（「B21 起该分支重启：`drag` / `escape` …… ⇒ `loop=true`」）与 `:1054`（「单候选（`drag` / `escape` 均单段）⇒ `loop=true` 持续档」）仍写 escape ⇒ `loop=true`，与本批 B27 面（`:1033` §2.13.6、`:1220` §2.14.9「由 `true` 改 `false`（仅 escape；drag 仍 `true`）」、AC34② `loop=0` `:1529`）相抵——按旧句实施将直接违反 US-33 / AC34②。 | 对 `:274` 与 `:1054` 各补一条 B27 修订注（「B27 起 escape 例外：`loop=false` 单遍；drag 仍 `true`」），形态同 TC-40 / §2.13.6 的既有注记。 |
| 3 | Acceptance criteria | 🔴 | **静默区间的机检定义与静默状态机自身的落墨顺序相抵 ⇒ AC33② 在正确实现上必红**：区间定义（`:1144` / `:1317` / `:1524` / `:1541`）为「`reason=quiet` 换段行 → 其后第一条 `reason=quiet-end` 换段行」，但 §2.14.9 退出①（`:1200`）的顺序是「`anim quiet end reason=timer` → `triggerChainDecision('quiet-end',0)`（**链决策行 `anim chain` 在此**）→ `reason=quiet-end` 换段行」⇒ 计时出静默的区间内恒含 1 条 `anim chain` 行；② slot 打断路径（`:1201`）只产 `anim quiet end reason=slot` + 槽驱动换段行、**不产 `quiet-end` 换段行** ⇒ 区间对打断档不闭合（会吞并其后活动）⇒「区间内零 `anim chain` / 零其它 switch 行」两支均无法通过。 | 把区间锚改到静默标记行（`anim quiet enter` → 其后第一条 `anim quiet end`，`reason ∈ {timer, slot}` 均收），或显式声明退出决策行豁免——四处同源改；TC-51 / TC-52 的期望已按 `anim quiet end` 行写，天然吻合。 |
| 4 | Clarity · Consistency | 🟡 | **`turn` 段末「翻转标记」在 `plan='quiet'` 分支的去向未落墨**：翻转标记现挂在链计划输出上（`:971`「`chain`（回链：掷骰选段；`turn` 段附翻转标记…）」；同源 `:269`），而 B27 的静默判定（`:1207-1209`）把 `kind='turn'` 段末路由到 `plan='quiet'`（注 H① `:1521` 同）——新计划类型未说明是否携带 / 执行该翻转 ⇒ 该路径可能吞掉朝向翻转（facing 状态与实际演出不一致）。 | 在 §2.14.9 / 注 H① 写明「静默计划保留 `turn` 段的翻转标记（翻转照执行）」或指明翻转与计划类型无关；桩测矩阵加一行断言。 |
| 5 | Acceptance criteria | 🟡 | **注 E′ ② 的归因与正常路径不符**（`:1465`）：「`overlap = 0` 也来自静默进出行（……静默段 `loop=true` 无自然结束 ⇒ 无预触发窗口）」——该理由只对 `quiet-end`（计时退出）成立；静默**入**行按现有链机制（`:975` 预触发武装到全部 `loop=false` 段，静默入口的旧段是动作段）通常带 `overlap ≈ PET_OVERLAP_MS`，仅 `ended` 兜底时为 0。判据本身（「带内或 0」）不因此必红，但口径不明会误导机检。 | 订正注 E′ ②：写明入静默行走既有两触发（预触发 ⇒ `overlap ≈ N`；`ended` 兜底 ⇒ 0），「或 0」的必要性主要来自 `quiet-end` 与 ended 兜底。 |
| 6 | Acceptance criteria | 🟡 | **AC34② / TC-55 的「存活 ≈ 段长（10.04 s ± 容差）」容差未给且与预触发机制有系统性偏差**（`:1529` / `:1546`）：escape 为 `loop=false` ⇒ 段末前 `PET_OVERLAP_MS`（1200 ms）即被下一段叠化接管 ⇒ 实测存活窗 ≈ 段长 − 1200 ms + 预载（≈ 8.8–9.2 s）；且 TC-55 字面「播完（≈10.04 s）后经 `reason=pre-end` 回链」自相抵（pre-end 在播完**前**）。 | 照 AC27 带写法给期望值与容差（如「段长 − `PET_OVERLAP_MS` ± 250 ms」），并把 TC-55 措辞改为「播至段末前 `PET_OVERLAP_MS` 经 `reason=pre-end` 换段（段尾由叠化退场）」。 |
| 7 | Clarity | 🔵 | **注 B′ 与被注引的两条等式对不上**（`docs/design/PET-MOVEMENT.md:746` vs `:748` / `:559` / `:749`）：注 B′ 称「上 / 侧等式的被减数 250 / 270 …从 `pet.html` 取」——顶边等式的被减数是 `PET_FEET_Y`(244)、且不含 270；侧边等式的被减数 `PetChainCore.PET_STAGE_W` 是可装载常量（B18 实现期已增，非本批新增面）。 | 改为「等式按 AC23① 字面用 `PetChainCore` 常量求值；`pet.html` 的 250×270 作三方交叉核对（弱镜像面收窄）」；若指 AC21① 的 270 等式，请分句指认。 |
| 8 | Consistency（文档状态） | 🔵 | **B21 面的池计数未随 B27 的 95 → 94 修订同步**：AC25（`docs/design/PET-ANIMATION.md:1449`「引用段 94 → 95（未引用 12 → 11）」）与 TC-37（`:1493`「引用段 95 / 未引用 11」）仍为 B21 期值；B27 只订正了 TC-38 / TC-40（B27 变更记录 `:1576`）与 AC34④（`:1513`）。 | 按 TC-38 的既有形态给 TC-37 / AC25 各补一条 B27 修订标注（新值 94 / 12）。 |
| 9 | Affected-file size annotations | 🔵 | **`pet-chain.js` 因本批跨 300 行档**（281 → ≤317；批次档 `:92` / `:103`），批次档只给「未跨 500 ⇒ 不启动拆分」的总立场句，未对该跨档档给拆分复核结论（承 B20 / B26 同款立场，非新债）。 | 在 §2.3 的 300–500 行档立场句里对 `pet-chain.js` 补一句复核结论（职责仍单一 / 只增机制）即可，无需拆分计划。 |
| 10 | Acceptance criteria | 🔵 | **「顶边 minY 下移 44 ⇒ 首触竖直速度口径不变」的括注不严格**（`docs/design/PET-MOVEMENT.md:572`）：对撞顶例，抬高天花板使反弹后落地冲击速度按 `sqrt(e²·v₀² + 2g·c(1−e²))` 随 c 增大 ⇒ 少数例可能跨 800 px/s 档界。 | 重跑登记时按例**重分类**（不只复测时长）；括注改为「档界值不变，例的档属按重跑重分类」。 |
| 11 | Review context limitation | 🔵 | 本次评审未提供 `docs/CONVENTIONS.md`（Project Standards 空缺）⇒ 文件头标准形 / 行宽行数等规范面只能按 `AGENTS.md` 指针核对，未逐条机检；§2.3 的**现状行数**（代码面）无法在本次范围内重测，仅做跨档一致性核对（`shell-pet-geometry.js` 437 / `shell-pet-drag.js` 239 在两档间一致）。 | 无（如实标注范围限制）；规范面细目建议由既有 `lint` 门（宽度 / 行数 / 装配）在实施轮承担。 |

**计数：🔴 3 · 🟡 3 · 🔵 5（共 11 条）。**

VERDICT: changes-required

## §4 评审裁决与实施启动（主 agent）

<!-- 由主 agent 填 -->

---

## §5 实施记录（eng-coder）

<!-- 由 eng-coder 填 -->

---

## §6 验收核销（主 agent）

<!-- 由主 agent 填 -->
