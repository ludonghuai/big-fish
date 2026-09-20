# 桌宠（鲸鱼娘）设计档 — PET-GALLERY（右键弹窗重做与动作图鉴卡片化）

> 归属板块：桌宠（桌面挂件）· 承批次档 `docs/batches/B35-pet-gallery-ui.md` §1（R24，本仓原创需求）
> 回指需求：`docs/requirements/PET.md` §三 US-44…US-50 · §四 NFR-30…NFR-33
> 上游契约：`docs/design/PET-UNLOCK.md` §2.5（三把锁合取语义 / 两层口径 / 触发面 / `pick=` 机检锚）· §3.2（`unlock:view` 图鉴数据流）· `docs/design/PET-ANIMATION.md` §2.2.4（链决策）· §2.14（B27 静默）
> 状态：**设计稿待评审**（未批准实施——评审发起权在用户）

---

## 1. 需求层

### 1.1 总体需求（一段话定位）

把右键弹窗从「320×500 固定小窗 + 纯文字清单」重做为一扇**可调整大小、精心设计**的桌宠面板：喂养面重排为「头部卡 + 食品卡片」，图鉴面升级为**视频卡片墙**（每个动作一张卡、直接播放对应 webm、可见即播 / 离屏即停 / 懒加载、顶部收集进度）；
用户在图鉴里**喜欢**动作（星标 + 类内选段加权 ×3 + 置顶成组 + 「只看喜欢」开关——D-2）与**屏蔽**动作（随机轮换池与事件触发全排除，独占事件唯一段保护——D-3）；**Lv.10 特权**解除时节窗口 / 饭点窗口 / 一天一次三类时间限制（D-4），**Lv.1–Lv.9 语义与 B23 交付态逐位一致**；喜欢 / 屏蔽集合与窗口尺寸落盘保留。判定与链**同源单点**（`pet-unlock-core.js`），素材本体与池档零改动。

### 1.2 功能性需求（逐条可交付；回指 US，条文不重述）

| # | 一句话定位 | 范围边界指针 |
|---|---|---|
| US-44 | 弹窗 `resizable` 放开 + 默认 720×560 / 最小 480×420 + 尺寸持久化 + 贴宠弹出位置随实际尺寸自适应（多屏 workArea 钳制） | `docs/requirements/PET.md` §三 US-44 边界 |
| US-45 | 喂养面布局重做：头部卡（好感 / 余额 / 可兑换量）+ 食品卡片网格，与图鉴同一套视觉语言 | 同档 US-45 边界（观感面 = 人工目视） |
| US-46 | 图鉴 = 视频卡片墙：卡 = webm 直放 + 名称 + 条件 + 徽标；主面 categories 80 段，常驻 / 事件 16 段签展示；收集进度分母不变 | 同档 US-46 边界 |
| US-47 | 喜欢体系：星标 + 类内选段加权 ×3 + 收藏组置顶 + 「只看喜欢」合取开关（默认关） | 同档 US-47 边界 |
| US-48 | 屏蔽体系：轮换池与事件触发全排除（硬排除）、独占段保护、事件空集显式回落、温和切换 | 同档 US-48 边界 |
| US-49 | Lv.10 特权：level ≥ 10 ∧ 开关开 ⇒ 时节窗口 / 饭点窗口 / 一天一次三者解除（默认开可关） | 同档 US-49 边界 |
| US-50 | 偏好与尺寸持久化：`userData/pet-prefs.json` + `settings.json` 三新键；事件驱动写盘 | 同档 US-50 边界 |

### 1.3 非功能性需求（硬指标 + 度量方式；回指 NFR）

| # | 指标 | 度量方式 |
|---|---|---|
| NFR-30 | 同时播放 ≤8 段（`GALLERY_MAX_PLAYING`）；懒加载（未入视不赋 src，`preload="none"`）；离屏即停；10 min 工作集增幅 < 100 MB；主进程零解码增量 | playbackPlan 桩测 + DOM 断言 + `app.getAppMetrics()` |
| NFR-31 | 加权 / 屏蔽 / 特权 / 卡墙组装 / 并发计划 = 纯函数（`pet-unlock-core.js` 双环境导出；链加权入口 = `pet-chain-core.js` 加性可选参）；屏蔽机检 = `pick=` 零出现；Lv.1–9 = B23 用例全量复跑绿 | `.thincoder/b35-gallery-stub.mjs` 末行 `pass/total PASS` |
| NFR-32 | 冻结清单零 diff（几何 / 拖拽 / pet.html·pet.js·pet-preload / webm / pool.json / unlock-rules.json / affinity-core / shell-ipc / gates / tests / updater·market·backend 面）；零新依赖、零新源档；45 单元 + 3 集成零回退；结构判据零新增 | `git diff --stat` + 三道门 |
| NFR-33 | prefs 损坏按首次使用重置；校验谓词（池外剔除 / 喜欢∩屏蔽=∅ / 独占段拒屏蔽）；settings 三新键默认值；行宽 ≤300 / 单档 ≤500 / 注释中文 | 桩测 + 静态核对 |

---

## 2. 设计层

### 2.1 问题陈述

B23 交付的图鉴是**纯文字行**（名 + 条件 + 灰化），窗口 320×500 且 `resizable:false`——用户原话「弹窗大小调整不了，布局没有精心设计」。
本批在同一扇窗内做四件事的叠加：① 窗口形态（可调整 + 记住尺寸）；② 喂养面重排；③ 图鉴改视频卡片墙（96 张卡、并发受限的懒加载播放）；④ 在既有三把锁（B23 `eligible` 单点）上叠加三个新谓词——喜欢加权 / 屏蔽硬排除 / Lv.10 特权。约束网：B18 池校验与掷骰次序不回退、B23 门控语义对 Lv.1–9 逐位一致、`shell-pet.js` 行数余量仅 2 行（门禁口径 498/500）、零新依赖、渲染层判定须可桩测。

### 2.2 方案选型对比

#### 2.2.1 卡片媒体装载与并发方案（判据源：US-46 / NFR-30 / 硬约束 6·8；裁定 D-1）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **webm 直放 + IntersectionObserver + 并发上限 8**：卡 = `<video muted loop playsinline preload="none">`，未入视不赋 src；入视赋 src 起载、上限内 `play()`；离视 `pause()` | 零新素材 ✓ 零新依赖 ✓ 离线 ✓；并发上限把解码面钉死在 ≤8 路 640×360 VP9 ✓；懒加载 ⇒ 打开图鉴不整墙解码 ✓；媒体面 = 用户要的「最好看的画面在动」 | 代价 = 无封面帧的卡在首次入视前有短暂空框（卡片底色 + 名称兜底，观感可接受） | **选定**（D-1 + U-3） |
| 2 | 静态抽帧封面（ffmpeg 预抽 poster，视频 hover 才播） | 首屏安静 ✓；但 ffmpeg = 新依赖（硬约束 8 违反）+ 抽帧产物 = 新素材面（D-1 已否） | 换来的是构建链耦合 | **否决**（D-1） |
| 3 | 全部卡片 `preload="metadata"` 常驻 src、无并发上限 | 实现最简；96 卡同页 ⇒ 元数据 96 连接 + 可见区外仍在解码面边上，桌面常驻应用不可接受 | 换来的是实现省事 | **否决**（NFR-30） |

> **CSP 结论（勘察实证，批次档 §1.3）**：`exchange.html:5` CSP = `default-src 'self' data:`（未声明 `media-src`）⇒ media 回落 default-src，`file://` 同源 webm 可达——**CSP 预计零改动**；若实施期实证不成立 ⇒ 允许面 = CSP meta 行增 `media-src 'self'` 一枚（单行显式登记于此，硬约束 9）。
> 卡墙脚本面：`exchange.html` 增 `<script src="pet-unlock-core.js">` 一行（`script-src` 回落 default-src `'self'` 合法，先例 = `pet.html` 挂 `pet-chain-core.js`）——`exchange.js` 经 `window.PetUnlockCore` 消费 `playbackPlan` / 常量（桩测与渲染同源）。

#### 2.2.2 喜欢权重机制（判据源：US-47 / NFR-31 / 硬约束 2；待决 U-1）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **类内选段加权 ×3（段级倍率）**：`pet-chain-core.js` 的 `pick` 增**加性可选参** `weightOf(name) → 倍率`（缺席 = 既有均匀语义逐字不变），`pet-chain.js` 由 payload 的 `likeSet` 构造 `weightOf = liked ? 3 : 1` | 落点 = 类内均匀随机处（勘察指名）✓；分类间权重分布不变 ✓；`pool.json` 零 diff（硬约束 2 ✓）；纯函数可桩测（分布断言）✓；既有 45 用例不受影响（可选参缺席路径逐字）✓ | 代价 = `pet-chain-core.js` 加性扩签名（B18 掷骰**次序**不变——只改类内均匀步的抽样密度） | **选定**（U-1 ①） |
| 2 | 分类权重加成（喜欢段所在分类 weight +n） | 喜欢集中在同分类时分布失真（整类变胖）；改的是类间分布而非「喜欢的更常出现」 | 换来的是语义错位 | **否决** |
| 3 | `pool.json` 增段级权重字段 | 触 B18 V 系校验契约 + 池档冻结（硬约束 2） | — | **否决** |

> 倍率值 = 单一常量 `PET_FAV_WEIGHT = 3`（`pet-chain-core.js` 常量表，承 `PET_OVERLAP_MS` 先例；一处定义、`pet-chain.js` 一处消费）。事件档内轮换（`nextInSlot`）**不加权**（轮换 = 确定性均等，加权会把「不连播同一段」语义复杂化——登记 §2.9 DD-B35-3）。

#### 2.2.3 屏蔽在 eligible / 事件面的落点（判据源：US-48 / NFR-31 / 硬约束 3·4；裁定 D-3）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **双点同名单**：链面 = `eligible` 增 `prefs.blocked` 输入（`allowSet` 直接不含被屏蔽段——承 B23 单点）；事件面 = payload 增 `blockSet`，渲染层在池重建单点（`applyAllowSet` 扩展）对 `pool.events[*]` 过滤 | `pick=` 机检锚零迁移 ✓（两面的段名都不入抽）；链面判定单点同源 ✓；事件档不入门控（B23 口径 B/C）⇒ 事件过滤只能在渲染层名单面 ✓ | 代价 = 过滤点两处（链面 eligible + 渲染层 events）——同一名单 `blockSet` 下发，无双源 | **选定**（D-3） |
| 2 | 主进程拦事件触发（`setPetState` 前查屏蔽表） | 状态机语义与动画表现分叉（状态变了、动画没演）；B21 交互优先级面被改写 | 换来的是单点幻觉 | **否决** |
| 3 | 权重调零（被屏蔽段 weight=0） | 批次档硬约束 3 逐字禁止（调零仍可被抽中）；且事件档本无权重 | — | **否决**（硬约束 3） |

> **事件空集回落（硬约束 4 的显式定义）**：某事件候选被全屏蔽 ⇒ 该次触发在动画面**忽略**（不切段、保持当前段）+ debug 日志一行 `anim event-empty slot=<key>`；**独占单段事件（drag / escape / quiet）结构保护**——其三段不可屏蔽（`validatePrefs` 拒绝 + UI 无屏蔽钮），故三事件永不空。`events.eat` 四段全在「吃什么」类（勘察实测）⇒ 可被全屏蔽，回落同上（喂食的好感 / 台词面不受影响——动画让位 ≠ 功能让位）。

#### 2.2.4 Lv.10 特权谓词落点（判据源：US-49 / NFR-31 / 硬约束 5；裁定 D-4）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **`eligible` 内两域分支**：`lv10Free = level ≥ 10 ∧ switches.lv10 !== false`；时节域 `!seasonOn \|\| lv10Free \|\| isSeasonOpen(...)`；饭点域跳过「当日已演」与时刻窗两判（`!mealOn \|\| lv10Free \|\| ...`）；等级域零改动（Lv.10 在 B23 本就全量收口） | 谓词单点（与三锁同函数）✓；Lv.1–9 与开关关两路 `lv10Free` 恒假 ⇒ 既有路径逐字命中（可桩测回归）✓；规则档零改动 ✓ | 代价 = `eligible` 增两条分支（断言面 = TC-B35-1…6 全覆盖） | **选定**（D-4 + U-5 ②） |
| 2 | 第四把锁（独立的「特权门」并入合取） | 特权不是「锁」是「放行」——并入合取会把关门语义（关 = 不过滤）搅浑 | 换来的是模型虚设 | **否决** |
| 3 | 规则档复制一份 Lv.10 专用表 | 数据双源必漂移；规则档冻结面 | — | **否决** |

> 特权与屏蔽的优先级：**屏蔽优先**（用户屏蔽的段即便特权放行也不入选——`eligible` 内 blocked 判定先于域分支）；特权不解除规则档坏档回落（`quiet` 路径逐字不动）。

#### 2.2.5 持久化落点（判据源：US-50 / NFR-33；待决 U-4）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **独立 `userData/pet-prefs.json`**（喜欢 / 屏蔽集合）+ settings 只放三键（`petUnlockFavOnly` / `petUnlockLv10` / `petExchangeSize`） | 先例 = `unlock-state.json`（B23 同形态：独立档 + 损坏重置 + 事件驱动写盘）✓；集合数据与开关分面（settings 损坏不牵连集合）✓；settings 面与 `petUnlock*` 三锁同面 ✓ | 代价 = 多一个持久化档（属主 = `shell-affinity.js`，经注入访问器供 `shell-pet.js` 读——B23 `affinityLevelProvider` 先例） | **选定**（U-4 ②） |
| 2 | 全部进 settings.json 新键 | 集合（可 80 名）与布尔开关混面；`DEFAULT_SETTINGS` 默认表膨胀 | — | **否决** |
| 3 | 并入 `unlock-state.json` | 该档属主 = `shell-pet.js`（行数余量 2 行，写权面易爆）；语义上「门控状态」与「用户偏好」是两件事 | — | **否决** |

#### 2.2.6 窗口尺寸与位置策略（判据源：US-44 / NFR-33；待决 U-2）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **默认 720×560 / 最小 480×420 / 尺寸持久化 / 位置每次现算**（贴宠右侧、放不下改左侧、按宠所在屏 workArea 钳制） | 720 宽 ⇒ 卡墙 ≥3 列 ✓；480×420 保底喂养面可用 ✓；尺寸记住 = 用户原话「调整不了」的直接回应 ✓；位置现算（宠会动，记位置无义）✓ 多屏钳制（`screen.getDisplayNearestPoint`）✓ | 代价 = 打开位置不固定（贴宠是既有语义，用户已熟悉） | **选定**（U-2） |
| 2 | 尺寸 + 位置都持久化 | 宠移动后旧位置即失效，记住的是锚点而非屏幕坐标 | — | **否决** |
| 3 | 固定大窗不可调 | 与用户原话正面冲突 | — | **否决** |

#### 2.2.7 「只看喜欢」与三锁的合取关系（判据源：US-47 / 硬约束 3；待决 U-7）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **合取双面**：链面 `favOnly ⇒ allowSet = 喜欢 ∩ eligible 已解锁 − 屏蔽`（不越锁——锁着的喜欢段仍不入选）；卡墙面同开关 = 只显示喜欢卡（空态给提示行） | 与硬排除口径零冲突 ✓；一个开关一个语义（「我的桌面只剩我的喜欢」）✓；合取可桩测 ✓ | 代价 = 卡墙过滤态下看不到未收藏卡（关掉即回全墙；空态提示行兜底） | **选定**（U-7 ①——双面语义**待用户批准时确认**） |
| 2 | 喜欢即放行（越锁） | 与硬排除口径相冲（喜欢 = 变相解锁，三锁虚设） | — | **否决** |
| 3 | 仅卡墙显示过滤（链面不受影响） | 「只看喜欢」名实不符（她还在演不喜欢的） | — | **否决** |

#### 2.2.8 新纯函数的归宿（判据源：NFR-31 / NFR-32 / 结构判据 D②③ + 单档 ≤500；**二选一**）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **并入 `pet-unlock-core.js`**（门禁口径实测 345 行，+约 125 ⇒ 约 470 ≤ 500） | 注入面已在场（`unlockCore` 经 `main.js` 绑定 + 双档 `init(deps)` 注入 `shell-pet.js` / `shell-affinity.js`）⇒ **零新绑定、零新 `assemblyExempt`、零新静态边、`build.files` 零改动** ✓；喜欢 / 屏蔽 / 特权 = 同一 `eligible` 家族的语义延伸，分档即判定面分叉 ✓；卡墙组装与链判定同源单点 ✓ | 代价 = 单档逼近 480 提示线（越线出提示行不拦；预算与预案见 §2.7） | **选定** |
| 2 | 新建 `pet-gallery-core.js`（`init(deps)` 注入 + `assemblyExempt` 先例） | 隔离干净；但 `main.js` 增绑定一行 + 免检清单 +1 + `build.files` +1 + 两处 init 增传——四面各 +1 的纯账面成本；且特权 / 屏蔽判定仍须调 `eligible` ⇒ 跨档耦合照旧 | 换来的是账面复杂度 | **否决**（成本四维 +1，收益只是名义隔离） |

> **超限预案**：实施期 `pet-unlock-core.js` 实测 > 500 ⇒ **停下上报**（不改道自拆），拆分 = `pet-gallery-core.js`（卡墙组装 + prefs 校验迁出，门控面留在原档），回填本表与 NFR-32 允许面并重走评审确认（承 B23 §2.8 `shell-pet.js` 拆分预案先例）。

#### 2.2.9 图鉴视图 payload 形态（判据源：US-46 / NFR-31）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **`unlock:view` 通道原地演进**：`unlockView` 输出由「文字行」扩为「卡片视图」（分组结构化 + 徽标 + src + 喜欢 / 屏蔽态） | 通道与桥键零新增 ✓；唯一消费者 = `exchange.js`（本批同体重写）⇒ 无跨面漂移 ✓；B23 桩测档（gitignore 开发期工具）由 eng-coder 同批更新断言 | 代价 = payload 形状变更（单消费者，账面安全） | **选定** |
| 2 | 新增 `gallery:view` 通道并存 | 双通道双形状 ⇒ 旧面成僵尸 | — | **否决** |

### 2.3 卡片墙形态与覆盖口径（U-6 = ①）

- **覆盖（as-of 2026-09-20 实测）**：卡墙主面 = `categories` **80 段**（小动作 18 / 玩耍 27 / 吃什么 12 / 时节 21 / 文字 2——收集进度分母不变，承 B23 §2.2.3 口径 ②）；
  「常驻 / 事件」区 = 基础档 **8 段**（idle 3 + turn 1 + moves 4）+ 事件独占 **8 段**（点击回应 5 + 工作状态 3），带签展示、**不计分母、不可喜欢不可屏蔽**；
  磁盘未引用 **12 段**（`余额-*` 6 / `碎碎念-*` 3 / `工作状态-垂头丧气冒汗` / `工作状态-雀跃庆祝` / `被鼠标拖拽悬空反馈`）**不入墙**（链不可达 ⇒ 展示即误导；素材本体不动——O-B35-5）。
- **卡片构成**：视频位（§2.2.1）+ 动作名 + 解锁条件串（承 B23 `unlockCondition` 单点）+ 徽标行（`已解锁` / `未解锁` 灰化 / `♥ 喜欢` / `已屏蔽` / `常驻` / `事件` / `特权`）+ 操作钮（☆ 喜欢 / ⊘ 屏蔽——按 `likeable` / `blockable` 显隐；独占段标「事件独占·不可屏蔽」）。
- **分组与排序**：`♥ 喜欢` 组**置顶**（D-2；仅收藏段、不重出于分类组）；分类组承 B23（组内排序键不变）；「常驻 / 事件」区沉底；**只看喜欢开 ⇒ 全墙只显喜欢组**（§2.2.7 双面语义）。
- **总览头部**：收集进度（分母 80）+ 喜欢数 + 屏蔽数 +「只看喜欢」开关（勾选态与 settings 同源）。
- **喂养面（US-45）**：头部卡（好感等级 · MAX 态 / 💴 余额 / 可兑换量 / 汇率）+ 食品卡片网格（图标 / 名 / 加成 / 价格 / 持有 / 买钮）；数据通道零改动；观感验收 = 人工目视（AC-B35-12 如实标注）。

### 2.4 数据面契约

#### 2.4.1 `userData/pet-prefs.json`（新增运行期档；属主 = `shell-affinity.js`）

```json
{ "version": 1, "liked": ["照镜子"], "blocked": ["吃西瓜"] }
```

- `liked` / `blocked` = 池段名数组（均 ⊆ categories 80 段——基础档 / 事件独占段不入两集合）；**互斥**（`liked ∩ blocked = ∅`，校验归一化：交集按**屏蔽**生效并从 `liked` 剔除）；**独占三段禁入 blocked**（`被吓一跳` / `原地左转奔跑` / `待机呼吸休闲`——结构保护，US-48）。
- 容错：解析失败 / 形态非法 ⇒ 按「首次使用」重置（同 `unlock-state.json` 形态）；写入 = 事件驱动（toggle 时），原子性 = 整档 `writeFileSync`（承先例）。
- 读面：`shell-affinity.js` 进程内缓存 + 导出访问器 `petPrefs()`（供 `main.js` 装配注入 `shell-pet.js`——B23 `affinityLevelProvider` 先例）；写后即刻广播重算（§2.5.4 触发面 ⑥）。

#### 2.4.2 `settings.json` 三新键（默认表 `shell-settings.js`）

| 键 | 默认 | 语义 |
|---|---|---|
| `petUnlockFavOnly` | **false** | 只看喜欢（双面：链面合取过滤 + 卡墙显示过滤；§2.2.7） |
| `petUnlockLv10` | **true** | Lv.10 特权（D-4 + U-5 ②：默认生效 + 可关；关 ⇒ Lv.10 回到 B23 语义） |
| `petExchangeSize` | **null** | 弹窗尺寸 `{w, h}`（null = 未调过 ⇒ 默认 720×560；读取走 `clampWindowSize` 钳制） |

#### 2.4.3 IPC 与 payload（新增键逐一枚举；硬约束 9）

- 新增 handle（均在 `shell-affinity.js` 内自注册，承 `unlock:view` 先例；`shell-ipc.js` 零 diff）：
  **`prefs:like`**（invoke `{name, on}` ⇒ `{ok, view?}`）· **`prefs:block`**（invoke `{name, on}` ⇒ `{ok, message?, view?}`；`blockable=false` ⇒ `ok:false`）· **`unlock:fav-only`**（invoke `{on}` ⇒ `{ok}`）。
- `exchange-preload.js` 新增桥键 **3 枚**（逐名）：`prefsLike(name, on)` · `prefsBlock(name, on)` · `setFavOnly(on)`。
- `pet-chain-config` payload 扩两字段：**`blockSet`**（段名数组——渲染层 events 过滤的唯一输入）· **`likeSet`**（段名数组——`weightOf` 构造输入）；`allowSet` 已由主进程完成「门控 ∧ 非屏蔽 ∧（favOnly ⇒ 喜欢）」合取（渲染层零判定，承 B23 DD-B23-8）。
- `unlock:view` payload 演进（§2.2.9）：`{ favorites: [card], sections: [{id, unlocked, total, cards:[card]}], resident: [card], totals: {unlocked, total}, favOnly, level }`；
  `card = { name, src, cond, unlocked, liked, blocked, likeable, blockable, badges: [] }`（`src` = `dir + '/' + encodeURIComponent(name) + ext`，主进程按池数据生成——渲染层零拼接）。

### 2.5 行为契约

#### 2.5.1 `eligible` 扩展（`pet-unlock-core.js`；向后兼容——新入参缺席 = B23 语义逐字）

```
eligible(input)   input 增：prefs = { liked, blocked }（缺席 = 空集）；switches 增：favOnly（缺席 = false）· lv10（缺席 = true）
  lv10Free = switches.lv10 !== false ∧ level ≥ 10
  段入选 ⇔ 未被屏蔽 ∧ 域门放行 ∧（¬favOnly ∨ 喜欢）
    屏蔽：prefs.blocked 命中 ⇒ 锁（一切域——屏蔽优先于特权，§2.2.4）
    时节域：!seasonOn ∨ lv10Free ∨ isSeasonOpen(...)        // D-4：特权解除日期窗
    饭点域：(lv10Free ∨ 当日未演) ∧ (!mealOn ∨ lv10Free ∨ isMealOpen(...))   // D-4：特权解除时刻窗 ∧ 一天一次
    等级门域：照旧（Lv.10 本就全量收口——B23 §2.6）
    favOnly：∧ 段 ∈ prefs.liked（合取不越锁——域门判定在先，§2.2.7）
```

- `gateStep` 输入增 `prefs`（缺席 = 空集）；输出增 `blockSet` / `likeSet`（校验归一化后的集合——payload 直用）；`lockHint` 形态不变。
- `validatePrefs(prefs, poolNames, protectedNames) → { liked, blocked }`：池外名剔除 · 去重 · 独占段移出 blocked · 交集按屏蔽归一（NFR-33 校验谓词单点）。
- `togglePref(prefs, name, kind, on, ctx) → newPrefs | null`：互斥翻转的原子纯函数（like 置位即清 block，反之亦然；`blockable=false` 段 ⇒ null）——IPC 处理器的唯一 mutation 入口。
- **Lv.1–9 逐位一致的结构性保证**：`lv10Free` 恒假（level < 10）与 `prefs` 空集两路 ⇒ 三个域分支退化回 B23 原式（桩测 = B23 用例组全量复跑，AC-B35-9）。

#### 2.5.2 链面接驳（`pet-chain.js` / `pet-chain-core.js`）

- `pet-chain-core.js`（**加性可选参**，B18 次序不变）：`pick(pool, exclude, weightOf)`——`weightOf` 缺席 = 既有均匀逐字；`pickChainNext` / `decideNext` 透传 `weightOf`；常量 `PET_FAV_WEIGHT = 3` 入常量表（一处定义）。`pickSlot` / `nextInSlot`（事件档）**不动**（不加权，§2.2.2）。
- `pet-chain.js`：`onConfig` 收 `blockSet` / `likeSet`；池重建单点（原 `applyAllowSet` 扩展为 prefs 版）——categories 按 `allowSet` 过滤（照旧）+ **events 按 `blockSet` 过滤**（独占三段结构上不可能在 blockSet 内 ⇒ drag / escape / quiet 永不空）+ 构造 `weightOf`（`likeSet` 命中 ⇒ `PET_FAV_WEIGHT`）传入 `chainStep` / `triggerChainDecision`。
- **温和切换（U-8 ②）**：prefs / 开关变化 ⇒ 主进程重下发（池指纹不变 ⇒ 承 B23 支路「只换名单不重置播放态」）；在播段**不切断**——仅撤下一次入选资格；**在播段为 loop 段且已被排除** ⇒ 把前台元素 `loop` 置 `false`（本遍收尾后走 `ended` 回链），下一个决策点起被屏蔽段 `pick=` 零出现（机检锚不变）。
- **事件空集回落**：`startSlot` 取档后候选数组长度 0 ⇒ 不切段（保持当前段）+ 日志 `anim event-empty slot=<key>`（debug 面）；喂食 / 点击的状态机与台词面逐字不动。

#### 2.5.3 卡墙播放调度（`exchange.js` + `playbackPlan` 纯函数）

- `playbackPlan(cards, cap) → { play: [], pause: [] }`（`pet-unlock-core.js` 导出，`exchange.js` 经 `window.PetUnlockCore` 消费）：输入 = 卡名 → `{visible, playing}` 映射；规则 = 可见 ∧ 未播 ∧ 播数 < cap ⇒ play；不可见 ∧ 在播 ⇒ pause；可见但超 cap ⇒ 待命（有卡离屏后按入视先后补播）。
- 常量：`GALLERY_MAX_PLAYING = 8`（`pet-unlock-core.js` 导出，单点）；IntersectionObserver 阈值 0.25 + 根容器 = 卡墙滚动框（`exchange.js` 局部常量，接线面）。
- **刷新共存**：既有 5 s + focus 刷新节拍照旧；`exchange.js` 对 `unlock:view` 视图算指纹（关键字段 JSON），**指纹不变 ⇒ 不重建卡墙 DOM**（防 5 s 节拍把在播视频全打断）；指纹变 ⇒ 重建并由 IO 重新武装（在播集合随 DOM 重建重置，观感 = 一次重排）。

#### 2.5.4 触发面（承 B23 §2.5.4 五触发点，本批增 ⑥⑦）

- ⑥ **prefs 变更**（`prefs:like` / `prefs:block` 落盘后）：`pet.recalcAndBroadcast()` 重算重下发（链面立即按新集合执行，在播段温和收尾——§2.5.2）。
- ⑦ **两开关翻转**：托盘 checkbox ×2（承 `setUnlock` 先例）与图鉴内「只看喜欢」（`unlock:fav-only` 处理器同一语义：写 settings + 重算 + 托盘菜单重建）——两面写同一键，无双源（settings 单点）。
- 既有五触发点（首算 / 等级推送 / 饭点演过 / 三锁翻转 / 提示探测）逐字不变；B23 O-B23-8 已知限界（窗口关闭沿 → 下一重算点）**不随本批变化**（登记不改判）。

#### 2.5.5 窗口几何（`shell-affinity.js` `openExchangeWindow` 重写）

- 常量（单点）：`EXCHANGE_DEFAULT_SIZE = { w: 720, h: 560 }` · `EXCHANGE_MIN_SIZE = { w: 480, h: 420 }`。
- 建窗：`resizable: true` + `minWidth` / `minHeight`；尺寸 = `clampWindowSize(settings.petExchangeSize, 宠所在屏 workArea)`（非法 / null ⇒ 默认；钳入 `[min, workArea]`——`clampWindowSize` 为 `pet-unlock-core.js` 导出的纯函数，桩测可达）。
- 位置：贴宠右侧（`px + pw + 6`），右溢出改左侧，再按**宠所在屏** `workArea` 钳 x/y（`screen.getDisplayNearestPoint(宠中心)`——现行主屏 `workAreaSize` 口径升级为所在屏，多屏修正）。
- 持久化：`resize` 事件防抖（≈500 ms 停手）+ `closed` 兜底 ⇒ 写 `petExchangeSize`（事件驱动，NFR-33）；`maximizable` / `fullscreenable` 照旧 `false`。

#### 2.5.6 U 表裁定汇总（待决项落档；批准时确认点见 §7）

| # | 裁定 | 落点 |
|---|---|---|
| U-1 | **类内选段加权 ×3**（`PET_FAV_WEIGHT` 单点，不落池档） | §2.2.2 / §2.5.2 |
| U-2 | **默认 720×560 / 最小 480×420 / 尺寸持久化 / 位置随尺寸自适应（所在屏 workArea 钳制）** | §2.2.6 / §2.5.5 |
| U-3 | **并发 ≤8 + IntersectionObserver + `preload="none"`（未入视不赋 src）** | §2.2.1 / §2.5.3 |
| U-4 | **独立 `userData/pet-prefs.json`**；settings 只放两开关 + 窗口尺寸 | §2.2.5 / §2.4 |
| U-5 | **默认生效 + 设置可关**（`petUnlockLv10` 默认 true，托盘 checkbox） | §2.2.4 / §2.4.2 |
| U-6 | **categories 80 段为卡墙主面**；基础 / 事件独占 16 段签展示；未引用 12 段不入墙 | §2.3 |
| U-7 | **合取**（喜欢 ∧ 已解锁，不越锁）；同一开关双面生效 | §2.2.7 / §2.5.1 |
| U-8 | **温和切换**（在播段演完本段 / 本遍后不再出现） | §2.5.2 |

### 2.6 受影响文件全清单（门禁口径行数 + 预计增量）

> 行数口径 = **门禁判据 C（`\n` 计数，as-of 2026-09-20 实测）**——行数预算与 ≤500 判定只认此口径。
> 批次档 §1.3 勘察表的计数实为**非空行**口径（如 `shell-pet.js` 466 / `exchange.html` 72），与本表差 = 空行数；**预算以本表为准**（差异登记 = 批次档 §2.7 注）。

| 文件 | 现状（\n 计数） | 预计 Δ | 变更性质 |
|---|---|---|---|
| `pet-unlock-core.js` | 345 | **+125**（≈470） | eligible / gateStep 扩 prefs·favOnly·lv10 + `validatePrefs` / `togglePref` / `playbackPlan` / `clampWindowSize` + `unlockView` 卡墙化 + `GALLERY_MAX_PLAYING`（§2.2.8 归宿；>500 ⇒ 停下上报） |
| `pet-chain-core.js` | 227 | **+14**（≈241） | `pick` 加性可选参 `weightOf` + 两函数透传 + `PET_FAV_WEIGHT`（B18 次序逐字不变） |
| `pet-chain.js` | 333 | **+25**（≈358） | onConfig 收 `blockSet`/`likeSet` + 池重建单点扩展（events 过滤 + weightOf 构造）+ 温和切换（loop 收尾）+ `event-empty` 回落 |
| `exchange.html` | 79 | **+130**（≈210，重写） | 双标签卡保留；喂养面头部卡 + 食品网格；图鉴面板 = 进度头 + 卡墙网格 + 常驻/事件区；`<script src="pet-unlock-core.js">` 一行；**CSP 预计零改动**（§2.2.1，若不成立 ⇒ meta 行增 `media-src 'self'` 一枚——允许面显式登记） |
| `exchange.js` | 173 | **+170**（≈345，重写） | 喂养面渲染重排 + 卡墙渲染（分组 / 徽标 / 置顶 / favOnly 过滤）+ IO 懒加载与并发调度 + 喜欢 / 屏蔽 / favOnly 交互 + 指纹跳过重渲染 |
| `exchange-preload.js` | 9 | **+3**（=12） | 桥键三枚：`prefsLike` / `prefsBlock` / `setFavOnly`（§2.4.3 逐名） |
| `shell-affinity.js` | 372 | **+70**（≈442） | `openExchangeWindow` 重写（尺寸 / 位置 / 持久化）+ pet-prefs.json 属主（装载 / 保存 / `petPrefs()` 访问器）+ 三 handle 自注册 + `unlock:view` 组装传 prefs·favOnly·lv10 + init 增传 `rebuildTrayMenu` |
| `shell-pet.js` | 498 | **+1**（=499，**余量 1 行**） | `gateStep` 输入增 `prefs` 一行 + 注入键 `petPrefsProvider`（**既有行就地扩展，Δ 计入上值**；switches 增 favOnly·lv10 为既有行加宽）；**越 500 ⇒ 停下上报**（拆分预案承 B23 §2.8：门控面迁 `shell-pet-unlock.js`，须回填并重走评审） |
| `shell-settings.js` | 65 | **+3**（=68） | 默认表三键（§2.4.2；逐行中文注释承 `petUnlock*` 行形） |
| `shell-tray.js` | 209 | **+4**（≈213） | 设置子菜单两 checkbox（`petUnlockFavOnly` / `petUnlockLv10`，承 `setUnlock` 复用；专注模式置灰同口径） |
| `main.js` | 263 | **0** | 两处既有行就地改写：`pet.init` 增传 `petPrefsProvider: () => affinity.petPrefs()`；`affinity.init` 增传 `rebuildTrayMenu: tray.rebuildTrayMenu`（承 B23/B31 装配面先例；无新绑定） |
| `package.json` | 143 | **0** | deps / build.files 零 diff（**本批零新源档**——NFR-8 carve-out 不触发） |
| 冻结面（NFR-32 清单） | — | 0 | 几何 / 拖拽 / `pet.html` / `pet.js` / `pet-preload.js` / webm / `pool.json` / `unlock-rules.json` / `affinity-core.js` / `shell-ipc.js` / `scripts/gates/**`（基线零改动）/ `tests/**` / updater·market·backend 面 |
| 桩测 `.thincoder/b35-gallery-stub.mjs` | — | +260 | 桩测（gitignore 惯例，同 B23/B31 先例）；B23 桩测档断言同批更新（§2.2.9 代价面） |

### 2.7 关键决策记录（DD-N）

- **DD-B35-1 卡片媒体面 = webm 直放**（D-1）：零新素材零新依赖；CSP 预计零改动（勘察实证，`media-src` 回落 default-src）。否决：ffmpeg 抽帧封面（新依赖 + 新素材面）；`preload="metadata"` 全量常驻（解码面失控）。
- **DD-B35-2 新纯函数并入 `pet-unlock-core.js`**（二选一，§2.2.8）：注入面已在场 ⇒ 结构四维零增量；判定同源单点。否决：新建 `pet-gallery-core.js`（绑定 / 免检 / build.files / init 传参四面各 +1）。**超限预案 = 停下上报**（>500）。
- **DD-B35-3 喜欢权重 = 类内段级 ×3**（U-1 ①）：`pick` 加性可选参 `weightOf`，B18 掷骰次序与签名兼容面不变；事件档轮换不加权。否决：分类权重加成（语义错位）；池档权重字段（冻结）。
- **DD-B35-4 屏蔽 = 双点同名单**（链面 eligible + 渲染层 events 过滤，同一 `blockSet`）：`pick=` 机检锚零迁移。否决：主进程拦状态机（语义 / 表现分叉）；权重调零（硬约束 3 逐字禁止）。
- **DD-B35-5 Lv.10 谓词入 `eligible` 两域分支**（`lv10Free = level≥10 ∧ 开关`）：Lv.1–9 与关开关两路恒假 ⇒ 既有路径逐字命中。否决：第四门（模型虚设）；规则档复制（双源漂移）。
- **DD-B35-6 持久化分面**：集合 = `pet-prefs.json`（先例 `unlock-state.json`），开关与尺寸 = settings（与 `petUnlock*` 同面）。否决：全进 settings（混面）；并入 unlock-state（属主行数余量 1 行 + 语义分家）。
- **DD-B35-7 窗口 = 默认 720×560 / 最小 480×420 / 尺寸持久化 / 位置现算**（U-2）：位置记屏幕坐标无义（宠会动），贴宠相对位是既有语义。否决：位置持久化；固定大窗。
- **DD-B35-8 只看喜欢 = 合取双面**（U-7 ①）：链面 `喜欢 ∩ 已解锁 − 屏蔽`，卡墙同开关过滤显示。否决：越锁放行（冲硬排除）；仅显示过滤（名实不符）。**双面语义待用户批准时确认。**
- **DD-B35-9 温和切换**（U-8 ②）：只撤下一次入选资格；在播 loop 段置 `loop=false` 收尾本遍。否决：立即切走（观感粗暴 + 打断面改写）。
- **DD-B35-10 事件空集 = 动画面忽略 + 日志行**（硬约束 4 显式定义）：独占三段结构保护 ⇒ drag / escape / quiet 永不空；喂食的好感 / 台词面不受影响。
- **DD-B35-11 卡墙覆盖 = 80 + 16 签展示，未引用 12 段不入墙**（U-6 ①）：链不可达段展示即误导；素材本体不动（残留段处置登记 O-B35-5）。否决：全 106 入墙。

### 2.8 与既有纪律的冲突点核对

| 纪律 | 核对结果 |
|---|---|
| B18 池校验 V1–V6 / 掷骰次序 | ✓ `pool.json` 零 diff；`pick` 为加性可选参（缺席路径逐字）；`rollKind` / `pickWeightedCategory` / `pickSlot` / `nextInSlot` 不动 |
| B23 三锁语义（Lv.1–9） | ✓ `lv10Free` 恒假路径 + prefs 空集路径 = 原式（§2.5.1）；桩测复跑（AC-B35-9）；`unlock-rules.json` 零 diff |
| B23 `pick=` 机检锚 | ✓ 锚零迁移；屏蔽断言面 = 同一日志行（TC-B35-20） |
| 几何 / 拖拽冻结面 | ✓ 零触碰（弹窗 ≠ 桌宠窗；`screen.getDisplayNearestPoint` 为弹窗定位读取，不写几何层） |
| 结构判据 D①②③ + E | ✓ 零新静态相对 require 边（prefs 经注入访问器；核档已在绑定面）；扇出 `shell-pet.js` 5→5 · `shell-affinity.js` 3→3；D③ 绑定 17 条不变、免检清单不变；`baseline.json` 零改动；E 零命中 |
| 零新依赖 / build.files | ✓ `package.json` 整档零 diff（零新源档） |
| IPC 通道面 | `shell-ipc.js` 零 diff；三枚新 handle 模块内自注册（承 `unlock:view` 先例，登记例外同 O-B23-9 口径） |
| CSP / 桥面最小化（硬约束 9） | CSP 预计零改动（§2.2.1 实证；备选 `media-src 'self'` 单行已显式登记）；preload 新增键 = 3 枚逐名（§2.4.3） |
| 行宽 ≤300 / 单档 ≤500 / 文件头 / 注释中文 | ✓ NFR-33；`pet-unlock-core.js` ≈470（提示线 480 下）；`shell-pet.js` 499（余量 1，越线停下上报） |
| 许可面（B18 素材禁商用 + 署名） | ✓ 素材零增删改；视频卡 = 同包同素材的展示形态，不产生新许可面 |

### 2.9 观察项（O-N）

- **O-B35-1（并发上限 8 的实机体感）**：8 路 640×360 VP9-alpha 解码在低端集显的占用待实机；常量单点（`GALLERY_MAX_PLAYING`），回调属需求层判定。
- **O-B35-2（×3 倍率体感）**：喜欢段占比 = 3·|liked| /（|cat| + 2·|liked|）；太弱 / 太强只改 `PET_FAV_WEIGHT` 一处（数据面调整零机制改动）。
- **O-B35-3（只看喜欢的空态）**：favOnly 开 + 零收藏 ⇒ 卡墙空态一行提示 + 链面 = 分类全空 ⇒ 链回 idle 基础段（`FALLBACK` 既有路径，TC-B35-12）；提示文案实现期填入。
- **O-B35-4（事件全屏蔽的用户可见性）**：当前 = 动画面忽略 + debug 日志；卡墙面对全屏蔽事件**不做**横幅（卡片徽标已可推断）；实机若确认误导感，另立需求点。
- **O-B35-5（未引用 12 段残留）**：`余额-*` / `碎碎念-*` 等为 D2 面素材残留（链不可达）；本批只不入墙、不删素材（冻结面）；处置归 D2 面批次。
- **O-B35-6（`shell-pet.js` 余量耗尽登记）**：本批后实测预计 499/500——**下一批任何改动前须先拆分**（预案 = 门控面迁 `shell-pet-unlock.js`，承 B23 §2.8）；本批越 500 即停下上报。
- **O-B35-7（图鉴视频与系统「减少动态效果」）**：卡墙视频属用户主动浏览的媒体面（非装饰动效），本批按**照常播放**处理；若用户裁定让步，出口 = `matchMedia` 判据 + 全墙 pause（另批）。

### 2.10 用例表（TC）

| # | 类型 | 输入 | 期望输出 |
|---|---|---|---|
| TC-B35-1 | 正常 | level=10 + 特权开 + now=平日（非任何窗口） | 时节段 ∈ allowSet（窗外放行） |
| TC-B35-2 | 边界 | level=10 + 特权**关** + now=平日 | 时节段 ∉（回 B23 语义） |
| TC-B35-3 | 边界 | level=9 + 特权开 + now=平日 | 时节段 ∉（特权不越级） |
| TC-B35-4 | 正常 | level=10 + 特权开 + now=15:00（饭点窗外）+ 未演 | 饭点三段 ∈ allowSet |
| TC-B35-5 | 边界 | level=10 + 特权开 + 当日已演午餐 | 「吃午餐」仍 ∈（一天一次解除） |
| TC-B35-6 | 边界 | level=9 + 特权开 + 当日已演午餐 | 「吃午餐」 ∉（状态面对 Lv.1–9 不变） |
| TC-B35-7 | 正常 | blocked=[吃西瓜] | allowSet 不含「吃西瓜」；`blockSet` 下发；events.eat 候选 4 → 3 |
| TC-B35-8 | 边界 | events.eat 四段全 blocked + 触发喂食档 | 不切段（保持当前段）+ `anim event-empty slot=eat` 一行 |
| TC-B35-9 | 错误 | togglePref 屏蔽「被吓一跳」（独占段） | 返回 null；`validatePrefs` 同拒；UI 无屏蔽钮（结构断言 blockable=false） |
| TC-B35-10 | 机检 | liked=[照镜子]（同分类 18 段），抽样 10000 次类内选段 | 「照镜子」频率比 ≈ 3×（容差带 [2.4, 3.6]）；weightOf 缺席路径与既有均匀逐位一致 |
| TC-B35-11 | 边界 | favOnly 开 + liked 含一锁定段（level 不足） | 该段仍 ∉（合取不越锁）；其余喜欢已解锁段 ∈ |
| TC-B35-12 | 边界 | favOnly 开 + liked 空（或全锁） | 分类候选全空 ⇒ 链回 idle 基础段（FALLBACK 路径），链不死、事件档照常 |
| TC-B35-13 | 正常 | gallery 视图（level=3、liked 2、blocked 1、时节窗口内） | 分组结构齐备（喜欢组置顶且不重出）；字段八项齐备；分母 80；src 编码正确；未引用 12 段缺席 |
| TC-B35-14 | 机检 | playbackPlan：可见 12 卡、cap 8 | 8 播 4 待命；一卡离屏 ⇒ pause + 按入视先后补播 1 |
| TC-B35-15 | 机检 | 卡墙初次渲染（DOM 断言 / 桩测 DOM 桩） | 未入视卡 `video` 无 `src` 属性（懒加载）；`preload="none"` 在场 |
| TC-B35-16 | 错误 | `pet-prefs.json` 写入非法 JSON | 按首次使用重置，不崩；视图 = 全中性 |
| TC-B35-17 | 边界 | prefs 含交集（同名既 liked 又 blocked）/ 池外名 / 重复名 | 校验归一：交集按屏蔽生效并移出 liked；池外剔除；去重 |
| TC-B35-18 | 边界 | `petExchangeSize` = 2000×2000（超 workArea）/ 「abc」/ null | 钳入 workArea / 回落默认 720×560 / 默认；最小钳 480×420 |
| TC-B35-19 | 边界 | 屏蔽在播段（loop=true 单候选分类段） | 本遍收尾（loop 置 false）后回链；此后 `pick=` 不含该段；非 loop 在播段 = 播完本段后不再出现 |
| TC-B35-20 | 机检 | 虚拟时钟 ×1000 链决策（blocked 3 段 + favOnly 开喜欢 5 段） | blocked 段 `pick=` 零出现；入选段 ⊆ 喜欢 ∩ 已解锁；B23 断言面（锁定段零出现）保持绿 |

---

## 3. 接口契约与数据流（架构面）

### 3.1 链面数据流（门控 + 偏好计算在主进程，承 B23 DD-B23-8）

```
userData/pet-prefs.json ── shell-affinity.js（属主：装载 / 校验 / 保存；petPrefs() 访问器导出）
settings.json（petUnlockFavOnly / petUnlockLv10）── settings.get()
                                         ▼（main.js 装配：pet.init 增传 petPrefsProvider——既有行就地改写）
        shell-pet.js unlockPayload()：gateStep({rulesText, poolNames, now, level, switches{season,meal,level,favOnly,lv10}, state, prefs})
                                         │ { allowSet（门控 ∧ 非屏蔽 ∧ favOnly 合取）· blockSet · likeSet · lockHint · fresh · state }
                                         ▼  pet-chain-config payload（既有通道，扩 blockSet / likeSet 两字段）
        pet-chain.js：池重建单点——categories 按 allowSet 过滤 · events 按 blockSet 过滤 · weightOf = likeSet 命中 ? 3 : 1
                                         ▼
        pet-chain-core.js：rollKind → pickWeightedCategory → pick(..., weightOf)（加性可选参；次序逐字不变）
                                         │ pick= 日志（屏蔽机检锚：blocked 零出现）
                                         ▼
        演出；在播段被排除 ⇒ 温和收尾（§2.5.2）；prefs 变更 ⇒ 触发面 ⑥ 重下发（池指纹不变 ⇒ 不重置播放态）
```

### 3.2 图鉴面数据流（`unlock:view` 原地演进，§2.2.9）

```
exchange.js（图鉴卡激活 / 5 s 节拍 + focus，指纹不变则跳过重建）→ unlock:view（shell-affinity.js 自注册，承 B23）
  → 组装输入：池 + 规则（惰性装载，承 B23）· 等级（affinityLevel()）· 演过快照（unlock-state.json 只读）· prefs（本档属主）· 开关（settings）
  → pet-unlock-core.unlockView → { favorites, sections, resident, totals, favOnly, level }（card 八字段 + src，§2.4.3）
  → exchange.js 渲染卡墙（分组 / 徽标 / 置顶 / favOnly 过滤）；IO 调度播放（playbackPlan，window.PetUnlockCore 同源）
交互写：☆/⊘ 钮 → prefs:like / prefs:block（togglePref 原子翻转 → 落盘 → recalcAndBroadcast → 视图重取）
        「只看喜欢」→ unlock:fav-only（写 settings + 重算 + 托盘菜单重建）——托盘两 checkbox 同键同语义（无双源）
```

### 3.3 通道与函数清单（新增面）

- IPC 新增 handle ×3（`shell-affinity.js` 自注册；`shell-ipc.js` 零 diff）：`prefs:like` · `prefs:block` · `unlock:fav-only`；payload 扩字段：`pet-chain-config` + `blockSet` / `likeSet`；`unlock:view` 形状演进（§2.4.3）。
- `exchange-preload.js` 桥键 +3（逐名）：`prefsLike(name, on)` · `prefsBlock(name, on)` · `setFavOnly(on)`。
- `pet-unlock-core.js` 导出面（13 → **19**）：新增 `validatePrefs` · `togglePref` · `playbackPlan` · `clampWindowSize` + 常量 `GALLERY_MAX_PLAYING`；`eligible` / `gateStep` / `unlockView` 签名扩展（向后兼容，缺席 = B23 语义）。
- `pet-chain-core.js` 导出面：常量 `PET_FAV_WEIGHT`；`pick` / `pickChainNext` / `decideNext` 加性可选参 `weightOf`。
- `shell-affinity.js`：导出 `petPrefs()` 访问器；init 注入键增 `rebuildTrayMenu`；常量 `EXCHANGE_DEFAULT_SIZE` / `EXCHANGE_MIN_SIZE`。
- `shell-pet.js`：init 注入键增 `petPrefsProvider`；`unlockPayload` 增 `prefs` 入参一行（Δ +1，§2.6 预算）。
- `main.js`：Δ 0（两处 init 既有行就地改写：`pet.init` 增传 `petPrefsProvider`、`affinity.init` 增传 `rebuildTrayMenu`）。

---

## 4. 验收标准（逐条回指需求；AC-B35-N）

- **AC-B35-1（US-44）**：静态断言 `openExchangeWindow` 含 `resizable:true` / `minWidth:480` / `minHeight:420` / 默认 720×560；桩测 `clampWindowSize`（TC-B35-18 三输入）+ 位置钳制（注入假 display 矩形：右侧满 ⇒ 左侧；y 钳入 workArea；所在屏口径 = `getDisplayNearestPoint`）。
- **AC-B35-2（US-44 / US-50）**：resize 停手（防抖）与 `closed` ⇒ `petExchangeSize` 落盘（写盘次数 = 事件次数）；重开读回；非法值回落默认（TC-B35-18）。
- **AC-B35-3（US-46）**：TC-B35-13 结构断言全项 + 卡墙覆盖口径（80 + 16，未引用 12 段缺席）+ 进度分母 80 不变；CSP 面 = 卡片 video 在 `file://` 下加载至 `readyState ≥ 2`（集成 / 实机项，批次档 §2 待实机；若不成立 ⇒ 走 §2.2.1 登记的 CSP 允许面）。
- **AC-B35-4（US-46 / NFR-30）**：TC-B35-14 / TC-B35-15（并发 ≤8 · 补播次序 · 懒加载 · 离屏即停）；内存面 = `app.getAppMetrics()` 实测登记（10 min 增幅 < 100 MB，人工度量项如实标注）。
- **AC-B35-5（US-47）**：TC-B35-10（×3 分布 + 缺席路径逐位一致）+ TC-B35-11（合取不越锁）+ TC-B35-13（置顶分组）+ toggle 落盘回读断言。
- **AC-B35-6（US-48 / 硬约束 3）**：TC-B35-7（双点过滤）+ TC-B35-20（`pick=` 零出现 ×1000）+ TC-B35-9（独占段结构保护）；机检由**硬排除**达成（过滤名单不含段名），无权重写入路径（代码评审断言）。
- **AC-B35-7（US-48 / 硬约束 4）**：TC-B35-8（事件全屏蔽 ⇒ 不切段 + `event-empty` 日志行）；独占三事件结构上永不空（TC-B35-9 同源）。
- **AC-B35-8（US-48 / U-8）**：TC-B35-19（在播段温和收尾：loop 段置 false 本遍回链、非 loop 段播完后不再出现；期间无硬切）。
- **AC-B35-9（US-49 / 硬约束 5）**：TC-B35-1…6（特权三组 + 开关关 + 越级不生效 + 状态面）；**Lv.1–9 逐位一致 = B23 桩测用例组（时节 / 饭点 / 等级 / 关门 / 跨日 / 提示）在新 eligible 面全量复跑绿**。
- **AC-B35-10（US-50 / NFR-33）**：TC-B35-16 / TC-B35-17（损坏重置 + 校验归一三谓词）；写盘仅事件点（桩测断言写盘调用次数 = 触发次数）。
- **AC-B35-11（NFR-32）**：`git diff --stat` 冻结清单零 diff + 允许面符合（§2.6）+ `package.json` 整档零 diff + 三道门（`lint` → `test:full` → `test:integration`）+ 既有 45 单元 + 3 集成全绿 + 结构判据零新增（`baseline.json` 零 diff）。
- **AC-B35-12（US-45）**：**人工目视项（如实标注）**——喂养面头部卡 / 食品网格 / 卡墙观感的「好看」由用户实机验收；机检面 = DOM 结构断言（双标签卡 / 头部卡 / 食品网格 / 卡墙容器 / 进度头在场）。
- **AC-B35-13（规范）**：改动档行宽 ≤300 / 单档 ≤500（`pet-unlock-core.js` ≤500——越线停下上报走 §2.2.8 预案；`shell-pet.js` ≤500——越线停下上报走 §2.6 预案）/ 注释中文 / 文件头标准形（零新档，既有档头在场）。

---

## 5. 测试层（TC 汇总与归属）

- 用例表见 §2.10（20 条：正常 5 / 边界 11 / 错误 2 / 机检 2）；每条功能性需求 ≥1 用例：US-44→TC-18 · US-46→TC-13/14/15 · US-47→TC-10/11/13 · US-48→TC-7/8/9/19/20 · US-49→TC-1…6 · US-50→TC-16/17/18。
- **测试寿命分层**（承 B23 口径）：本批桩测 = **开发期工具**（装载真实 `pet-unlock-core.js` / `pet-chain-core.js`，注入虚拟时钟 / 假池 / 假 prefs / DOM 桩；`.thincoder/b35-gallery-stub.mjs`，gitignore 惯例）；B23 桩测档同批更新断言（payload 演进面，§2.2.9）；集成资产沿用既有 3 场景，零回退由 `test:full` / `test:integration` 承载。
- **人工项**（如实标注）：AC-B35-4 内存实测 · AC-B35-12 布局观感 · AC-B35-3 的 `file://` 媒体加载实证（待实机，批次档 §2）。
- 发布门 = `lint` → `test:full` → `test:integration`（批次档 §6 取证）。

---

## 6. 边界（本设计不做）

- 不做抽卡 / 成就 / 任务系统 / 多宠物 / 云同步 / 偏好导入导出；不做用户面动作导入（B24 后置）。
- 不做静态抽帧封面（D-1）；不改 `assets/pet-anim/webm/**` 与 `pool.json` 段名 / 分类 / 事件结构；未引用 12 段不入墙不删除（O-B35-5）。
- 不改 Lv.1–Lv.9 门控语义（AC-B35-9 逐位一致断言面）；不给 Lv.10 加新动作 / 新素材 / 新数值。
- 不做事件档内轮换加权；不做多收藏夹 / 组合命名 / 喜欢度分级；不做屏蔽分组 / 定时解除。
- 不做事件全屏蔽的横幅提示（O-B35-4）；不做「只看喜欢」的第三面（如托盘一级开关）。
- 不改托盘菜单结构（仅设置子菜单 +2 checkbox）；不改主窗口 / 市场 / 更新面 UI；不新建窗口（图鉴仍在第二标签卡）。
- 不做卡墙视频的 `prefers-reduced-motion` 让步（O-B35-7——用户主动浏览的媒体面，另批裁定）。
- 不做 B23 O-B23-8 的修复（窗口关闭沿自走节拍——该限界原样承继，不改判）。

---

## 7. UI/交互决策全落档

| 决策点 | 形态 | 状态 |
|---|---|---|
| 图鉴入口 | 右键弹窗第二标签卡（照旧）；喂养面重排为第一标签卡 | 定（US-45 / US-46） |
| 卡片媒体 | webm 直放（可见即播 / 离屏即停 / 懒加载 / 并发 ≤8） | 定（D-1 / U-3） |
| 卡墙覆盖 | categories 80 主面 + 常驻 / 事件 16 签展示；未引用 12 段不入墙 | 定（U-6 ①），**批准时确认** |
| 喜欢语义 | 星标 + 类内加权 ×3 + 置顶成组 + 只看喜欢（合取双面） | 定（D-2 / U-1 / U-7）；**双面语义与 ×3 值批准时确认** |
| 屏蔽语义 | 全屏蔽（链 + 事件）；独占三段保护；事件空集 = 忽略 + 日志；温和切换 | 定（D-3 / U-8）；**事件空集回落形态批准时确认** |
| Lv.10 特权 | 三解除（时节窗 / 饭点窗 / 一天一次）；默认开 + 托盘可关 | 定（D-4 / U-5 ②），**默认值批准时确认** |
| 窗口尺寸 | 默认 720×560 / 最小 480×420 / 尺寸持久化 / 位置贴宠现算（所在屏钳制） | 定（U-2），**数值批准时确认** |
| 只看喜欢默认 | 默认关（`petUnlockFavOnly=false`） | 定，**批准时确认** |
| 持久化分面 | 集合 = pet-prefs.json；开关 / 尺寸 = settings | 定（U-4 ②） |
| CSP | 预计零改动；备选 `media-src 'self'` 单行已登记 | 定（§2.2.1），实施期实证收口 |
| 行数预案 | `pet-unlock-core.js` / `shell-pet.js` 越 500 ⇒ 停下上报（两处预案） | 定（§2.2.8 / §2.6），**预案触发口径批准时确认** |

---

## 8. 变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-20 | 建档（B35 设计稿）：需求三层回指 / 选型对比九组（媒体装载与并发 · 喜欢权重 · 屏蔽落点 · Lv.10 谓词 · 持久化 · 窗口几何 · 只看喜欢合取 · 纯函数归宿二选一 · payload 演进）/ 数据面契约（pet-prefs.json + settings 三键 + IPC 三键 + payload 四字段）/ 行为契约（eligible 扩展 · 链面接驳 · 播放调度 · 触发面 ⑥⑦ · 窗口几何）/ U-1…U-8 裁定落档 / 受影响文件清单（门禁口径行数）/ DD-B35-1…11 / O-B35-1…7 / TC 20 条 / AC-B35-1…13 / 边界 / UI 决策表。依据 = 批次档 §1（用户 2026-09-20 原话 + D-1…D-4 裁定）+ 代码现状亲读。 |
