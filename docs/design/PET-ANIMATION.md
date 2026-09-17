# 设计档 PET-ANIMATION — 桌宠动画链引擎（B18）

> 回指需求档：`docs/requirements/PET.md`（US-15…US-19、NFR-9…NFR-13）
> 关联批次：`docs/batches/B18-pet-animation-chain.md`（§1 立案 / §2 本批任务书 / §5 实施记录）
> 上游设计档（**只引用不重述**）：`docs/design/PET-MULTIMONITOR.md`（多屏几何 / 尺寸锚点 / 拖动与散步写入纪律）·`docs/design/PET-DRAG.md`（拖拽跟手 / 点击阈值 / 穿透策略）
> 只读参考（样本区，**不得被 require / import**）：`samples/dsh-pet/`（PC2005-cloud，v0.2.11；样本与移植纪律见 `docs/README.md` §一）
> 变更记录见 §四。

---

## 一、需求层（回指）

### 1.1 验收条目回指表

| 需求条目 | 本档节 | 一句话实现面 |
|---|---|---|
| US-15 动画池与权重链 | §2.2.2 / §2.2.3 / §2.2.4 | 池 = 数据文件（动作 → 片段数组）；权重掷骰（idle / turn / move / 分类）在渲染层纯函数里跑；段播完即按权重续选 |
| US-16 切换无空白帧 | §2.2.5 | 两个 `<video>` 渲染位交替 + 等「新段就绪（`readyState ≥ 2`）」才换前台 + 短促交叉淡入 |
| US-17 事件档位动画 | §2.2.2 / §2.2.4 | `events.<档位>` = 候选数组；触发时档内随机并避开上一段 |
| US-18 视频素材接入（保留 PNG 通道） | §2.2.7 / §2.2.8 | 主进程装载并校验池 → IPC 下发；渲染层按下发的名 → URL 映射（`pool.src`）播放；池缺 / 校验失败 / 播放失败三级回落既有 PNG 通道 |
| US-19 减少动态效果 | §2.2.9 | `matchMedia('(prefers-reduced-motion: reduce)')` ⇒ 停交叉淡入 + 停既有 CSS 动效（浮动 / 气泡弹出 / 进度条过渡） |
| NFR-9 播放及时性 | §2.2.11 / §3.1 AC11 | 链日志三时刻（`t0` / `ready` / `shown`）机检 |
| NFR-10 内存与解码上界 | §2.2.5 / §2.2.11 / §3.1 AC12 | `<video>` 元素恒 2 个；按需设 `src`；`app.getAppMetrics()` 取渲染进程工作集 |
| NFR-11 包体积（**无硬上界**，已裁定 2026-09-17） | §2.1.2 / §2.3 / §3.1 AC13 | 素材量 = 递归实测**登记项**（不判阈值）；机制与素材解耦（池可空） |
| NFR-12 许可与署名 | §2.2.10 / §3.1 AC14 | 三处署名落点 + 商用化消解路径 |
| NFR-13 不回退与仓库规范 | §2.5 / §3.1 AC9 / AC15 | 几何档零 diff、既有语义零回退、零新依赖、行宽行数机检 |

### 1.2 本批不做（边界，逐条）

1. **物理手感**（阻尼弹簧拖拽 / 甩抛 / 反弹 / 落地摩擦 / Q 弹挤压）= B 面另批；本批**不实现任何挤压动效**（见 §2.5 观察项 O8）；
2. **会话事件联动**（工作状态六档 / 余额档位与气泡 / 碎碎念 / 对话）= D1 / D2 面；本批只落「档位 → 候选数组」机制与**既有触发点**（点击 / 喂食 / 入睡 / 随机小动作）的接入；
3. **多实例 / pet pack** = E 面；**素材生成链（转码 / 降码率）= C 面**（含 §1.6 的第 ③ 案）；
4. **不改几何层**：`shell-pet-geometry.js` 逐字不动；窗口逻辑尺寸恒 250×270 DIP；本批不新增任何窗口位置 / 尺寸写入；
5. **不引入** TS / React / 新构建链 / lint 大改 / 新依赖（`dependencies` / `devDependencies` 零 diff）；
6. **不实现拖拽悬空段动画**（样本 `被鼠标拖拽悬空反馈`）——触发点在拖拽链内（高敏感路径），见 §2.5 出批项 O1；
7. **不做用户自定义素材池 / 用户可调权重**（配置面取舍见 §2.1.4），见 §2.5 出批项 O3。

### 1.3 勘察结论（实测证据，as-of 2026-09-17）

#### 1.3.1 既有桌宠渲染与播放调用面（本仓）

| 面 | 实测 | 证据 |
|---|---|---|
| 渲染层 | 单档脚本 `pet.js`（**189 行**，换行符口径）：`FRAMES` 表（11 个动作）+ `img.src` 逐帧 + `FRAME_MS` 定时器；`setState(s)` 是唯一播放入口 | `pet.js:9-48` |
| 渲染层命中与穿透 | 命中判定 = `img.getBoundingClientRect()`（`isInteractivePoint`）；仅 win32 生效；拖动起点另有伪取消自愈 | `pet.js:156-164` / `:167-187` / `:114` |
| 页面结构 | `#pet-wrap` 250×270；`#pet` `bottom:26px` `height:200px`（待机旧帧由 JS 置 140px）；`bob` 3.2s 浮动动画；气泡 `pop` .18s | `pet.html:13-16` / `:33-39` / `:70-77` |
| 主进程播放调用面 | `setPetState(state)` 经 `pet-state` 通道下发；语义档位词表 = **11 档**（与 `pet.js` 的 `FRAMES` 键集一一对应） | `shell-pet.js:185-190`；触发点清单见下方「注 E1」 |
| IPC 面 | `pet-preload.js`（**15 行**）：`dragStart/dragHeartbeat/dragEnd/clicked/rightClicked/setIgnoreMouse` + `onSay/onState/onAffinity/onDragCancel` | `pet-preload.js:4-15` |
| 建窗面 | `BrowserWindow{ transparent, frame:false, alwaysOnTop, skipTaskbar, resizable:false, sandbox:true }` + `loadFile(pet.html)` + `setIgnoreMouseEvents(true,{forward:true})`（win32） | `shell-pet.js:97-121`；窗口尺寸 = `geometry.PET_SIZE_DIP`（`shell-pet-geometry.js:29`） |
| 素材现状 | `assets/pet-new/` **51 档 / 2.52 MB**（11 个动作目录 + 1 张预览图）；`assets/pet/` 1 档（旧待机帧） | 递归实测（本批勘察） |
| 打包面 | `build.files` = **显式白名单**，含 `assets/**/*` 与 `THIRD-PARTY-NOTICES.md`；`extraResources` 另列 | `package.json:39-80`（`assets/**/*` = `:74`；`THIRD-PARTY-NOTICES.md` = `:78`） |
| 配置面 | 用户配置 = 扁平 `settings.json`（9 个顶层键，无嵌套机制）；`shell-settings.js` 载入 / 保存 + 损坏区分 | `shell-settings.js:15-24` / `:34-51` |
| 日志面 | 既有模式 = env 开关 `BIGFISH_PET_DEBUG=1` + 主进程追加写 `userData/pet-geometry.log` | `shell-pet-geometry.js:34` / `:51-53` |

> **注 E1 —— 语义档位的既有触发点（11 档全覆盖；本批均不改）**
> - `idle` = 默认态（建窗后渲染层自置）；`sleep` = 空闲 2 min（`shell-pet.js:195`）；`walk-left`·`walk-right`·`run-left`·`run-right` = 散步 / 跑步（`shell-pet.js:256`）；
> - `happy` = 原地点击（`shell-pet.js:316`）；`read`·`starry`·`scared` = 随机小动作四选一（`shell-pet.js:63-71`）；`eat` = 喂食（`shell-affinity.js:285`）；
> - 拖动中 `walk-*` / `run-*` 被复位为 `idle`（`shell-pet-drag.js:150`）。

#### 1.3.2 既有设计档口径（本批**不得相抵**）

1. **尺寸锚点与写入纪律**：尺寸写入一律「尺寸专用形态」`setBounds({width,height})`（不传位置）+ 锚点 ± 容差 8 DIP；拖动期尺寸写入 ≤1 次 / 跨屏事件、同屏零写入；散步段起点兜底校准（≥30 s）；**部位与判据** ≈ `docs/design/PET-MULTIMONITOR.md` §2.3.3 / §2.3.5（**唯一详述处，本档不重述**）。
   → 本批**不新增任何位置 / 尺寸写入**：视频通道只改窗口**内容**的绘制，不改窗口本身（见 §2.2.6）。
2. **命中与穿透**：命中区 `pointer-events:none` 的图片矩形 + 命中点判定 + 「拖动期间不切换穿透」的渲染层守卫（`docs/design/PET-DRAG.md` §2.2.7、§2.2.4.1；实现 `pet.js:156-187`）。
   → 本批**改命中区的来源**（视频通道 = 身体盒，PNG 通道 = 既有 img 矩形），**不改**阈值、不改穿透守卫（见 §2.2.6）。
3. **点击语义**：位移 > 5px 判为拖动；原地点击 = 打开主窗口 + happy 动画（US-5；`docs/requirements/PET.md` §三）。
   → 本批不改判定阈值与点击链（`pet.js:110` / `:116-124` 保持原样）。
4. **许可与消解路径**：素材「开源可用 / 禁商用」+ 二创须附原作者 GitHub 地址 + 到期条件（转商用）见 `docs/batches/B18-pet-animation-chain.md` §1.5。
   → 本批的署名落点见 §2.2.10。

#### 1.3.3 测试面现状

- 本仓**无测试基建**：`package.json` 无 `test` script（`package.json:13-24`）；`tests/` 3 档为**开发期工具**（`tests/harness-store.test.js` 269 行 / `tests/update-lib.test.js` 84 行 / `tests/update-stub.mjs` 91 行），不构成仓门禁（`AGENTS.md` §三）。
- 既有**桩测先例**：`.thincoder/b03-pet-calibrate-stub.mjs`（1205 行，B03 实施桩测，跑法 `node .thincoder/b03-pet-calibrate-stub.mjs`，末行打印 `pass/total PASS`）。
  **⚠ 前置缺陷 D1**：该工具**当前不可运行**——抽取源硬绑 `main.js`（`.thincoder/b03-pet-calibrate-stub.mjs:84`），而几何 / 拖拽 / 散步实现已由 B06 F6 拆分迁出（`main.js:35-37` 只余 `require`）；实测运行即抛 `Error: marker not found: const PET_SIZE_DIP = {`（`sliceBetween`，`:96`），**0 条断言执行**。批次档 §1.4-2 的「189/189 保持全绿」在当前树不可复现 ⇒ 见 §2.5 前置缺陷 D1 的处置请求。

#### 1.3.4 样本机制（**只读参考**；每条附证据行，本批不 require 样本）

| 机制 | 样本实现要点 | 证据 |
|---|---|---|
| 双缓冲交叉淡入 | 两个 `<video>` 常驻（`videoA` / `videoB`），前台由 class `is-front` 切换；CSS `opacity` + `transition .18s` | `src/client/pet.ts:88-89` / `:1408-1409` |
| 切换序列（无空白帧） | 写 back 位 `src` → `loop=!once` → `load()` → 等 `loadeddata` → 加 `is-front` + 摘旧段 `is-front` + 旧段 `onended=null` 且 `pause()` → 交换前台索引 → `play()` | `src/client/pet.ts:256-293` |
| 竞态防护 | 自增 `gen`，`loadeddata` 回调内校验 `pending.gen !== gen` 即丢弃 | `src/client/pet.ts:237` / `:270` |
| 权重链（纯函数） | `rollKind(roll, weights)`：`idle` / `turn` / `move` / 其余归 `action`；`pick(池, exclude)`；`pickWeightedCategory(categories, facing)` 过滤 `noMirror` | `src/shared/pickers.ts:78-84` / `:5-10` / `:57-69` |
| 事件档位与轮换 | 档位 = 字符串（固定播）或数组（档内随机、避开当前段）；多候选档位播完由 `ended` 轮换到下一候选 | `src/shared/pickers.ts:17-22` / `:42-48`；`src/client/pet.ts:470-479` / `:673-675` |
| 段结束续播 | `ended` → `handleEnded`：事件动画回 idle 池、`turn` 段播完翻转朝向、其余走随机链 | `src/client/pet.ts:680-760` |
| 池配置形态 | `animations{ idle / turn / drag / clicks / moves{default,actions} / categories / events }` + `animationWeights{idle,turn,move}` + 分类权重合计与余量之和 = 100 | `assets/config.jsonc:140-254` |
| 画布与命中常量 | 画布 640×360；`FEET_Y = 330`；命中盒 `HIT_BOX = {x0:200,y0:50,x1:440,y1:335}`（⇒ 身体盒 240×285）；移动距离基准宽 462 | `src/shared/constants.ts:4-13` |
| 播放在透明窗内成立 | 桌面 helper 用同一批 webm 在**透明无边框 Electron 窗**里播放（`transparent:true` / `frame:false` / `resizable:false`） | `runtime/electron-helper/main.js:350-363`；`runtime/electron-helper/sprite.js:133-142`（同款双 video） |
| 无障碍 | `@media (prefers-reduced-motion: reduce){ .dsh-pet-video{transition:none} }`；挤压动效入口先 `matchMedia` 判定 | `src/client/pet.ts:92` / `:1054` |
| 素材实测（本批独立复核） | 106 段 webm / **51.86 MB**；单文件 = EBML/Matroska、`CodecID = V_VP9`、`AlphaMode = 1`、`PixelWidth = 640`、`PixelHeight = 360` | 递归实测 + 字节扫描（样本 `assets/webm/待机呼吸休闲.webm`：`V_VP9` @305、`PixelWidth 640` @323、`PixelHeight 360` @327、`AlphaMode=1` @334） |

> **样本区纪律**（`docs/README.md` §一）：`samples/**` 不被任何代码引用、不参与构建、不打进发行版。本档引用样本仅供机制借鉴，**实现不得 `require` / `import` 样本**（机检判据见 §3.1 AC15）。

---

## 二、设计层

### 2.1 方案选型对比

#### 2.1.1 播放器形态（候选 3）

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价 / 权衡） | 结论 |
|---|---|---|---|---|
| 1 | **双 `<video>` 渲染位交替 + CSS 交叉淡入** | ① VP9-alpha 直出透明（Chromium 原生）；② 无逐帧 JS 循环（CPU 空闲）；③ 无空白帧由「等就绪再换前台」结构性保证；④ 零依赖 | 代价：常驻 2 个解码器（≤2 路的显存 / 解码开销，见 NFR-10）；切换有一路 `load()` 延迟（NFR-9 给上界） | **选定**（样本同源且已在其桌面透明窗形态下实证） |
| 2 | canvas 逐帧取帧（`drawImage` / `ImageBitmap` 缓存） | ① 可控性强；② 需 rAF 循环常驻（空闲也烧 CPU）；③ 需自行管理帧缓存（池大时内存不可控）；④ 与「点击穿透按矩形命中」的既有实现耦合更重 | 代价：实现面更大、内存上界更难论证 | 否决（US-15/16 的收益不需要它以复杂度换） |
| 3 | 单 `<video>` 直接换 `src` | ① 实现最简；② 换 `src` 后旧帧立失 ⇒ **必然出现空白帧**（直接违反 US-16） | — | 否决（与 US-16 硬冲突） |

#### 2.1.2 素材池规模与码率（§1.6 的 ①②③④ 四案——**设计对四案同形**）

| 案 | 增量（实测 / 声明） | 本设计如何承载 | 归属 |
|---|---|---|---|
| ① 全量 106 段 | **+51.86 MB**（实测；安装包 ≈157 → ≈205 MB） | 池数据 `pool.json` 全量登记；播放器只认「片段数组」，与段数无关 | 本批（**已裁定（2026-09-17）：素材无预算**） |
| ② 子集 20–30 段 | **+10 ~ 15 MB** | 同上；**子集选段规则**（本档给规则，逐名清单 = 池数据）：每档位保底覆盖——`idle ≥ 2` / `turn ≥ 1` / `moves.walk ≥ 3` / `moves.run ≥ 1` / 每个 `categories` 分类 ≥ 2 / 每个 `events.*` 档 ≥ 2 | 本批（**已裁定（2026-09-17）：可全量；选段 = 池数据**） |
| ③ 全量 + 重编码降码率 / 降分辨率 | 待测（候选 ≈ −40%） | 本设计**只接产物**：转码后的文件放进同一目录、`pool.json` 同一形态即可；转码链本身不在本批 | **C 面另批**（§2.5 出批项 O4） |
| ④ 不采用样本素材（池为空） | 0 | 池为空 ⇒ 校验判据「idle 段数 ≥ 1」不满足 ⇒ **整体回落 PNG 通道**（US-18 的回落路径即为验收形态） | 本批（机制照落，观感与现状相同） |

> **同形声明**：四案对播放器 / 链 / 事件档位 / 无障碍**完全同形**，差异只落在两处数据：`assets/pet-anim/pool.json` 的内容与 `assets/pet-anim/webm/**` 的字节量。**体积已裁定为「无硬上界」**（用户 2026-09-17）⇒ 设计不锁定素材量（NFR-11）。

#### 2.1.3 双缓冲实现（候选 3）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **两个 `<video>` 渲染位交替（back 位预加载 → 就绪后换前台）** | ① 无空白帧；② 解码器上界恒定（=2）；③ 竞态由 `gen` 失效兜住 | 代价：切换需一次 `load()`（本地文件，见 NFR-9 阈值） | **选定** |
| 2 | 双 video **全部预载**（两路同时持有下一段） | 会同时存在 3+ 路解码（当前段 + 两个预载）⇒ 与 NFR-10 的「恒 2」判据相抵；预载错段即浪费 | — | 否决 |
| 3 | `ImageBitmap` 帧缓存 | 需逐帧解码入内存；106 段池 × 帧级缓存无法给出可论证的内存上界 | — | 否决 |

#### 2.1.4 配置面（候选 3）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **窄化：池 = 随包数据文件（`assets/pet-anim/pool.json`），用户面不加任何配置项** | ① 本仓用户配置面是扁平 `settings.json`（`shell-settings.js:15-24`），无嵌套机制；② 本批**没有**「用户改权重 / 改池」的需求条文（US-15/17 只说机制）；③ 机制参数随包 = 随版本演化，无需迁移面 | 代价：高级用户不能换池（出批项 O3 承接） | **选定** |
| 2 | 沿用样本 `config.jsonc`（JSONC + 注释 + 逐字段校验） | 需引入注释剥离 / 严格校验器（新代码面）与一种新配置方言；本仓无 JSONC 解析器 | 代价：新增格式债 + 校验面，收益（注释）本批无消费者 | 否决 |
| 3 | 混合（池数据 + `settings.json` 覆盖） | 需为扁平 settings 引入嵌套覆盖语义 + 校验 + 迁移；无需求支撑 | — | 否决 |

### 2.2 架构与契约

#### 2.2.1 分层与职责边界

```
主进程（shell-pet.js）                          渲染进程（pet.html 内的三档脚本）
┌───────────────────────────────────────┐   ┌──────────────────────────────────────────┐
│ ① 池装载 + 校验（fs，零依赖）          │   │ ③ pet-chain-core.js：链决策纯函数 +      │
│ ② 建窗后下发 `pet-chain-config` ───────┼──▶│    媒体盒几何计算（零 DOM、可被桩测装载）│
│ ④ 收 `pet-chain-move` → 既有 doWander()│◀──┼── ④ pet-chain.js：双缓冲播放器 + 语义档   │
│ ⑤ 语义档位仍由既有 setPetState 下发 ───┼──▶│    位映射 + 链运转 + 日志                │
│ ⑥ debug 开关下捕获渲染层日志并落盘      │   │ ⑤ pet.js：既有 PNG 通道 + 命中区来源切换 │
└───────────────────────────────────────┘   └──────────────────────────────────────────┘
```

- **主进程 = 情境权威**：语义档位（11 档）与窗口位移（散步 / 跑步 = 既有 `doWander`）仍归主进程；本批**不新增**任何位置 / 尺寸写入；
- **渲染进程 = 表现权威**：池内选段、双缓冲、切换时点、淡入与回落；
- **两新档互不越界**：`pet-chain-core.js` 零 DOM / 零 IPC（可被 node 直接装载）；`pet-chain.js` 零 fs（沙箱渲染进程不可用）——池数据只能来自主进程下发。

#### 2.2.2 动作池数据契约（`assets/pet-anim/pool.json`，严格 JSON）

| 键 | 形态 | 语义 | 校验（主进程，V 规则） |
|---|---|---|---|
| `version` | number | 池格式版本（本批 = 1） | V1：存在且为正整数 |
| `canvas` | `{w,h}` | 素材画布（实测 640×360） | V1：两值为正数 |
| `body` | `{x0,y0,x1,y1}` | **身体盒**（画布坐标；命中区与媒体盒对齐的共同基准） | V1：`0 ≤ x0 < x1 ≤ w`、`0 ≤ y0 < y1 ≤ h` |
| `dir` | string | 素材目录（相对 `pet.html`；本批 = `assets/pet-anim/webm`） | V6：不含 `..` / 绝对路径 / 路径分隔符 |
| `ext` | string | 扩展名（本批 = `.webm`） | V1 |
| `weights` | `{idle,turn,move}` | 权重链顶层权重（≥0；与分类权重合计 ≤100，**仅防笔误**——余量归 `action` 分支，见 §2.2.4「权重余量的归属」段） | V4 |
| `idle` | `string[]` | 待机片段池（**≥1**） | V2 / V5 |
| `turn` | `string[]` | 转向片段池（**≥1**；条目须为「播完会翻转朝向」的动作） | V2 / V5 |
| `moves` | `{walk:string[], run:string[]}` | 移动片段池（按语义档位分键；`walk` **≥1**、`run` 可空 ⇒ 回退 `walk`） | V2 / V5 |
| `categories` | `{id,weight,noMirror?,actions:string[]}[]` | 随机动作分类池（权重掷骰用；`noMirror` = 朝右时不参与抽取） | V2 / V4 |
| `events` | `{<档位>: slot}` | 事件档位（**键 = 语义档位名**，见 §2.2.3；`slot` = `string` 或 `string[]`） | V2 / V5 |

- `slot` 语义（**与样本同源**）：字符串 = 固定播该段；数组 = 档内随机抽 1 并避开「当前正播段」（单候选 + 排除自己 ⇒ 退回原数组，宁可重复也不返回空）；
- **不设** `moves.default` 的距离 / 首尾停顿参数（样本有）：本批窗口位移由既有 `doWander` 决定，这些参数在本批**没有消费者** ⇒ 不入 schema（避免死配置）；
- 池条目 = **片段名**（不含路径与扩展名），`src` 由实现期按 `dir + '/' + encodeURIComponent(name) + ext` 生成（中文名需百分号编码，样本同法：`src/client/pet.ts:256-261`）；
- 示例（节选）：

```json
{
  "version": 1,
  "canvas": { "w": 640, "h": 360 },
  "body": { "x0": 200, "y0": 50, "x1": 440, "y1": 335 },
  "dir": "assets/pet-anim/webm",
  "ext": ".webm",
  "weights": { "idle": 10, "turn": 5, "move": 0 },
  "idle": ["待机呼吸休闲"],
  "turn": ["东张西望"],
  "moves": { "walk": ["螃蟹走路", "原地漂浮踏步"], "run": ["原地左转奔跑"] },
  "categories": [ { "id": "小动作", "weight": 20, "actions": ["超大伸懒腰", "哈欠连天"] } ],
  "events": { "happy": ["点击回应-开心跃动"], "sleep": ["原地小憩沉眠"] }
}
```

**校验规则（V1–V6，主进程，机检；任一不过 ⇒ 整体回落 + 日志 `anim pool ok=0 reason=V<n>`）**

| # | 规则 | 判据 |
|---|---|---|
| V1 | 结构完整 | 上述键齐备且类型正确 |
| V2 | 引用可解析 | 每个片段名在 `dir` 下存在 `<name><ext>` 文件（逐条 `fs.existsSync`） |
| V3 | 单段体积上界 | 每段 ≤ **1.5 MB**（NFR-10；现池最大段 = 1,330,462 B ≈ 1.27 MB） |
| V4 | 权重合法 | 各权重 ≥ 0 且 `idle + turn + move + Σcategories.weight ≤ 100`（**仅防笔误**：不要求合计 = 100；余量归 `action` 分支，见 §2.2.4「权重余量的归属」段） |
| V5 | 档位下界 | `idle ≥ 1`、`turn ≥ 1`、`moves.walk ≥ 1`、`categories ≥ 1`、`events` 每个已声明档 ≥ 1 段 |
| V6 | 路径安全 | `dir` 与片段名不含 `..` / 绝对路径 / 路径分隔符（防目录穿越） |

#### 2.2.3 语义档位 → 池键映射表（**11 档全部落位**）

| 语义档位（`pet-state` 取值） | 视频通道池键 | `loop` | 结束方式 |
|---|---|---|---|
| `idle` | **自由链**：`weights` 掷骰 → `idle` / `turn` / `categories`（`move` 见 §2.2.4 第 4 条） | 多候选 `false`；单候选 `true` | `ended` → 链选下一段 |
| `walk-left` / `walk-right` | `moves.walk`（朝向由档位命名决定；`facing=right` 时镜像） | `true` | 主进程散步段末置 `idle`（位移与收尾 = 既有 `doWander`，本批不改） |
| `run-left` / `run-right` | `moves.run`（**缺 ⇒ `moves.walk` ⇒ 整体回落**） | `true` | 同上 |
| `happy` | `events.happy` | 多候选 `false` | `ended` → 按当前档位回链（主进程 1.6 s 定时器仍在，作**兜底升级点**而非结束条件，见 §2.2.5 规则 3） |
| `eat` | `events.eat` | 多候选 `false` | 同上（主进程 2 s 定时） |
| `sleep` | `events.sleep` | `true`（**持续状态**：该档恒 `loop=true`，睡眠期不轮换、不换段） | 主进程 `wakePet()` 置 `idle` |
| `read` / `starry` / `scared` | `events.read` / `events.starry` / `events.scared` | 多候选 `false` | 同上（主进程 2.4 s 定时为兜底） |
| （链内，非 `pet-state`）`turn` | `turn` | `false` | `ended` → 翻转 `facing` → 回链 |

- **「单候选」分支的适用条件（与池数据核对，消除三方张力）**：上表「单候选 ⇒ `loop=true`」只在**池数据使某档仅 1 段**时适用；批次档 §2.5 第 7 项的交付下限要求每个 `events.*` 档 **≥ 2 段** ⇒ 本批池（`assets/pet-anim/pool.json`）各事件档均 ≥ 2 段（`sleep` = 2 段），该分支在本批**不适用**；`sleep` 的 `loop=true` 来自**持续状态**语义（上表该行），与候选数无关。
- **镜像规则**（承样本 `noMirror` 语义）：`facing = 'right'` 时视频以 `scaleX(-1)` 镜像；`categories[].noMirror = true` 的分类在 `facing = 'right'` 时**不参与抽取**（全部被滤时退回全池，宁可镜像也不空）；
- **PNG 通道的同表映射**：PNG 通道按**同一档位词表**取 `FRAMES` 表（11 档），零变更。

#### 2.2.4 链决策契约（`pet-chain-core.js` 纯函数，可被桩测直接装载）

| 函数 | 签名 | 语义（判据） |
|---|---|---|
| `rollKind(roll, weights)` | `→ 'idle' \| 'turn' \| 'move' \| 'action'` | 三段阈值 `idle/100`、`(idle+turn)/100`、`(idle+turn+move)/100`；`roll` 为 [0,1) 随机数 |
| `pick(pool, exclude?)` | `→ string` | 等概率抽 1，尽量避开 `exclude`；排除后为空 ⇒ 退回原池（**不返回 `undefined`**） |
| `pickWeightedCategory(categories, facing)` | `→ category \| null` | 按权重抽分类；`noMirror` 分类在 `facing='right'` 时被滤；全空 ⇒ `null` |
| `pickSlot(slot, exclude?)` | `→ string` | 字符串原样返回；数组 = 档内抽 1（避开 `exclude`） |
| `nextInSlot(slot, current)` | `→ string \| null` | 多候选档位播完轮换到**非当前**的候选；单候选 / 不在该档 ⇒ `null`。**契约保留（不删）**——整机形态下的可达性见本节表后注 |
| `pickChainNext({weights, roll, cur, facing, pool})` | `→ {kind, name\|null, mirror}` | 链的一步决策（`kind='move'` 时 `name=null`，由调用方发散步请求） |
| `mediaBox({canvas, body, targetH, feetY})` | `→ {scale, left, top, w, h, hit}` | 见 §2.2.6 的算式（纯计算，无 DOM） |

- **`nextInSlot` 的契约保留（可达性注）**：**整机形态下无消费路径**——主进程档位定时器（1.6 / 2 / 2.4 s，`shell-pet.js:116-118` / `:373-375`）先于段长（实测 10.04 s）把档位置回 `idle` ⇒ 段结束瞬间 `playing.slotKey !== slot`，轮换分支不触发（两轮长跑日志 `reason=slot-rotate` **零行**）。
- **不删的理由**：删它 = 丢断言面——该函数由**桩测面**覆盖（`.thincoder/b18-pet-chain-stub.mjs` 的档内轮换断言），承载「档内轮换不重复」不变式。

**链的四条规则**

1. **链只在 `idle` 档运转**（其它档位由主进程驱动）；`idle` 期间 `ended` → 掷骰 → 下一段；
2. **同档位重复到达 = 忽略**（避免重启当前段）——**事件段在播时再次触发同档 = 忽略（不重启、不换段）**；
3. **段切换的唯一两个触发**：(a) `once` 段 `ended`；(b) 语义档位**变化**且新档 ≠ 当前档。主进程的定时器到点（`idle`）**不切断**正在播的事件段——它只把「当前情境」改回 `idle`，事件段播完后按**当时的档位**决定去处（US-17 的「播完」语义，避免 1.6 s 定时把 8 s 的段切碎）；
4. **`move` 档 = 复用既有散步**：链掷出 `move` ⇒ 渲染层发 `pet-chain-move` ⇒ 主进程在既有守卫下执行一次 `doWander()`（位移纪律 100% 不变）；**默认 `weights.move = 0`**（位移仍由既有 `scheduleWander` 的 15–35 s 节奏产生，即「两个位移源」不并存）——是否让链接管位移 = 池数据一行，见 §2.5 观察项 O10；渲染层不等回复（≤1 s 未观测到 `walk-*` / `run-*` 档则继续链，日志记 `anim move-req ack=timeout`）。

**权重余量的归属（明示契约——防按样本口径加校验）**

- 余量 = `100 − idle − turn − move − Σcategories.weight`，**全部归 `action` 分支**：`rollKind` 的三段阈值只切出 `idle` / `turn` / `move`，其余一律 `action`；`categories[].weight` 只决定**该分支内的相对分布**（绝对值不产生行为差异）；
- 因此 V4 的「≤ 100」**仅为防笔误**（各权重非负 + 合计不越界）：**不要求合计 = 100**；样本口径「分类权重合计与余量之和 = 100」（§1.3.4）**不是本仓约束**，实现不得据此加校验。

#### 2.2.5 播放器契约（`pet-chain.js`）

**状态**：`mode ∈ {png, video}`（回落链，§2.2.8）· `front ∈ {0,1}`（前台渲染位）· `gen`（自增代次）· `pending {name, loop, gen}` · `slot`（当前语义档）· `cur`（当前段名）· `prev`（上一段名，用于「避开连播」）· `facing`。

**切换序列（每次换段，逐条；实现与静态核对均按此判定）**

1. `gen = ++gen`；`pending = {name, loop, gen}`；取 **back 位**元素；
2. 写 back 位：`src`（取自下发的 `pool.src` 名 → URL 映射）→ `loop` → `muted` / `playsInline` / `autoplay` → `onended = loop ? null : onEnded` → `el.load()`；
3. 等 `loadeddata`（若 `readyState ≥ 2` 则同步继续）→ **先校验 `pending.gen === gen`**（过期即丢弃）；
4. back 位 `classList.add('is-front')`；旧段 `classList.remove('is-front')` + `onended = null` + `pause()`；交换 `front`；`el.play().catch(…)`（失败 ⇒ 日志 `anim play-fail` + 计入失败计数）；
5. **禁止形态（静态核对判据）**：① 任何 `remove('is-front')` 语句**不得**出现在 `loadeddata` 回调之外（否则 = 先摘旧帧 = 空白帧）；② 无「旧段 `pause()` 早于新段 `readyState ≥ 2`」的路径；③ 不得出现第 3 个 `<video>` 元素（NFR-10）。

**淡入**：`.is-front` 的 `opacity` 由 CSS 过渡（**180 ms**，样本口径）；减少动态效果时 `transition: none`（§2.2.9）。切换期旧段停在**末帧**（`pause()` 后仍显示当前帧）⇒ 全程无「两帧皆空」的时刻。

**内存与解码纪律**：`<video>` 元素恒 2 个（随页面存在，不新增 / 不销毁）；**不整池预载**；`src` 只在切换时写入；无帧缓存、无 canvas。

#### 2.2.6 媒体盒几何与命中区（**不触几何层**）

**常量（`pet-chain-core.js`；单位 = CSS px = DIP）**

| 常量 | 值 | 来源 / 判据 |
|---|---|---|
| `PET_MEDIA_CANVAS` | `{w: 640, h: 360}` | 素材实测（§1.3.4）+ 样本 `constants.ts:4` |
| `PET_MEDIA_BODY` | `{x0: 200, y0: 50, x1: 440, y1: 335}` | 初值 = 样本 `HIT_BOX`（`constants.ts:8`）；**实现期以探针实测首帧 alpha 包围盒校准**并回写常量（校准证据落批次档 §5） |
| `PET_BODY_TARGET_H` | `200` | 对齐既有 PNG 通道的 `#pet` 高度（`pet.html:36`） |
| `PET_FEET_Y` | `244` | `270 − 26`（与 `#pet` 的 `bottom:26px` 同源，`pet.html:34`） |

**算式（纯函数 `mediaBox()`，桩测逐值断言）**

- `scale = PET_BODY_TARGET_H / (body.y1 − body.y0) = 200 / 285 ≈ 0.70175`；
- 媒体盒尺寸 = `canvas.w × scale ≈ 449.1` × `canvas.h × scale ≈ 252.6`；水平居中（身体在画布内居中：`(200+440)/2 = 320 = 640/2`）；
- 垂直：`top = PET_FEET_Y − body.y1 × scale ≈ 244 − 235.1 = 8.9`；下沿 ≈ 261.5 < 270；
- **命中矩形（视频通道）** = 身体盒映射到窗口坐标 ≈ `(40.9, 44.0, 168.4, 200)`；**命中矩形（PNG 通道）** = 既有 `img` 矩形 ≈ `(15.9, 44.0, 218.2, 200)`。

**说明与判据**

- 媒体盒**宽于窗口**（449.1 > 250）：两侧被裁的部分是素材的**透明边**（身体在画布中央 240 px 宽内）⇒ 不裁到身体；两通道的**可见身体**都落在 `y ∈ [44, 244]`，与既有 `#pet` 的竖直带一致；
- 媒体盒下沿与好感度条（`bottom:2px`，`pet.html:41-44`）在纵向上有交叠，交叠区位于**脚底以下的透明区**（脚底 = 235.1 处）⇒ 不产生视觉遮挡（验收目视确认，TC-9）；
- **命中区来源随通道切换**（`pet.js` 改造）：视频通道读身体盒矩形，PNG 通道读既有 `img` 矩形；两者都以「可见身体」为界。**阈值（5 px）与穿透守卫不改**（承 §1.3.2 第 2 条）；
- **窗口本身零改动**：不改 `PET_SIZE_DIP`、不新增 `setBounds` / `setPosition` 调用（几何层零 diff 的判据面，AC15）。

#### 2.2.7 IPC 契约（新增两条通道）

| 通道 | 方向 | 载荷 | 语义 / 判据 |
|---|---|---|---|
| `pet-chain-config` | 主 → 渲染 | `{ok: true, pool, debug} \| {ok: false, reason}` | 建窗 `did-finish-load` 后下发一次（`shell-pet.js` 既有钩子）；`ok=false` 时渲染层保持 PNG 通道；`pool` 的名 → URL 映射 `src` 为**载入期派生**（见下表后注；渲染层不拼路径） |
| `pet-chain-move` | 渲染 → 主 | 无（或 `{}`） | 请求一次既有 `doWander()`（守卫：非拖动 / `petState==='idle'` 由 `doWander` 自身判定，本批不改其守卫） |

- **`pool.src` 的形状（按实现与池实况；2026-09-17 收口轮校正字面）**：`assets/pet-anim/pool.json` 内**无 `src` 键**、条目 = **片段名**（动作名即文件名，不含路径与扩展名）。
- **`src` = 载入期派生**的名 → URL 映射：解析式 `dir + '/' + encodeURIComponent(名) + ext`（`pet-chain-core.js` 的 `segSrc`；校验期逐名填充 `src[name]`），随池一并下发；渲染层按 `pool.src[name]` 查表、**不拼路径**（`pet-chain.js`）。
- `pet-preload.js` 新增 `onChainConfig(cb)` 与 `chainMove()`（各 1 行）；**不放宽**沙箱（`sandbox: true` 保持）、不暴露 `require` / `fs`；
- **不新增日志通道**：渲染层用 `console`，主进程在 `BIGFISH_PET_DEBUG=1` 时经 `webContents.on('console-message')`（API 见 `node_modules/electron/electron.d.ts:14413`）把带 `[pet-anim]` 前缀的行追加写 `userData/pet-anim.log`。

#### 2.2.8 回落链（三级；单向回落，任一段只归属一个通道）

| 级 | 触发 | 行为 | 机检 |
|---|---|---|---|
| ① 整体回落 | 池文件缺失 / JSON 不合法 / V1–V6 任一不过 / 配置未下发 | `mode = 'png'`：既有 PNG 通道原样运行（视频元素 `display:none`） | 日志 `anim pool ok=0 reason=…` + 画面与现状一致 |
| ② 档位回落 | 某档位缺段：`moves.run` 空 / `events.<档>` 缺 / 其余池键缺 | 逐级取上一级池（`run` → `walk`）；事件档缺 ⇒ **该档整体走 PNG 通道**；其余池键缺 ⇒ 整体回落。**三种形态各自定义**：该段在任一时刻只归属一个通道（无未定义态） | 日志 `anim slot-miss slot=<键> fallback=…` |
| ③ 运行期回落 | `play()` 连续失败 ≥ 3 次或 `error` 事件 | 该段跳过并记日志；连续 ≥ 3 段失败 ⇒ 整体回落 PNG（不静默） | 日志 `anim play-fail` / `anim fallback reason=play-failed` |

#### 2.2.9 无障碍契约（US-19）

- `matchMedia('(prefers-reduced-motion: reduce)').matches === true` 时：
  1. **停交叉淡入**：`.is-front` 的 `opacity` 过渡时长 = 0（CSS `@media` 内 `transition: none`）；新旧交替瞬时完成（仍无空白帧——旧段在换前台前一直在场）；
  2. **停既有 CSS 动效**：`#pet.animate-bob`（浮动）与 `#bubble.show`（弹出）的 `animation: none`；`#affinity-fill` 的 `width` 过渡去掉；
  3. **链照常运转**（只停动效，不停动作——US-19 边界）。
- 系统偏好在运行期变化 ⇒ 以 `matchMedia(...).addEventListener('change')` 重算（无需重启）；
- **不要**把它做成用户配置项（系统偏好即权威源，避免双源）。

#### 2.2.10 许可与署名落点（NFR-12）

| 落点 | 内容 | 状态 |
|---|---|---|
| `THIRD-PARTY-NOTICES.md`（随包，`package.json:78`） | 新增「桌宠动画素材 —— dsh-pet（PC2005-cloud, v0.2.11）」节：素材许可原文（开源可用 / **禁商用**）+ 原作者 GitHub 地址 + 二创约定 + 商用化消解路径 | 待实现 |
| `README.md` §「致谢与合规」（`README.md:152-154`） | 补一行同源指针 | 待实现 |
| `版本说明.txt` §「四、说明」（`版本说明.txt:57-61`） | 补一行同源指针（固定致谢行，非版本条目；不参与「CHANGELOG → 版本说明」的摘要方向，`docs/CONVENTIONS.md` §七） | 待实现 |
| 发布页（Gitee / GitHub Releases 说明） | 二创约定要求「任何介绍 / 展示 / 分发处」附原作者地址 ⇒ 发版说明同步（人工动作） | 发版流程项 |

**消解路径（到期条件）**：本仓转向商用（或用户另有裁定）⇒ 在此之前完成「替换为自产素材」或「取得原作者授权」；消解前**每次发版复核一次**。

#### 2.2.11 仪表与日志面

- 开关：`BIGFISH_PET_DEBUG=1`（既有 env，零新开关）；文件：`userData/pet-anim.log`（追加；渲染层 console 经主进程捕获落盘，格式 `[time] anim …`）。
- 行型（供 AC 机检，字段固定，逐行一行）：

| 行型 | 字段 | 用途 |
|---|---|---|
| `anim pool` | `ok` / `slots` / `segs` / `bytes` / `max` / `reason` | AC1（池装载与校验）、AC13（体积） |
| `anim switch` | `anim` / `from` / `t0` / `ready` / `shown` / `readyState` / `loop` / `reason` | AC3（链连续）、AC4（就绪后切换）、AC11（延迟） |
| `anim ended` | `anim` / `t` / `dur` | AC3、AC11（段末到下一段 `shown` 的差值） |
| `anim chain` | `kind` / `pick` / `mirror` | AC2/AC3（链决策分布） |
| `anim slot` | `key` / `pick` / `exclude` | AC6（档内随机与避开连播） |
| `anim move-req` | `sent` / `ack`（`walk` / `run` / `timeout`） | AC3（move 档）、§2.2.4 规则 4 |
| `anim fallback` / `anim play-fail` / `anim slot-miss` | `reason` / `anim` / `err` | AC8（回落链） |

- **零开销纪律**：debug 关闭时渲染层不产生链日志、主进程不挂 `console-message` 监听。

### 2.3 受影响文件全清单

> **行数口径 = 换行符计数（`\n` 计数，不把尾换行计为一行）**（承 `docs/design/PET-DRAG.md` §2.3 口径；与 `docs/CONVENTIONS.md` §五 的实测口径一致）。
> ℹ 批次档 §1.2 的行数**已统一为换行符口径**（`pet.js` 189 / `shell-pet.js` 371 / `shell-pet-geometry.js` 437，2026-09-17；修正记录见批次档 §1.9）⇒ **与本节无口径差**；本表数值以本档口径为准（见 §2.5 观察项 O7）。

| 文件 | 当前行数 | 改动点 | 预计增量 | 末行数（预算） |
|---|---|---|---|---|
| `pet.html` | 91 | ① `#pet-stage` + 两个 `<video class="pet-media">`（含 `playsinline` / `muted` / 无控件）② 媒体盒 CSS（含 `--pet-media-*` 三常量）+ `.is-front` 过渡 + `@media (prefers-reduced-motion: reduce)` 段 ③ 既有 `bob` / `pop` / `transition` 纳入该 `@media` 块 ④ 两个 `<script>` 引入新档 | +28 ~ +40 | ≤ 131 |
| `pet.js` | 189 | ① `setState()` 拆为「PNG 通道渲染」+「语义档位上报给链」② 命中区来源切换（视频 = 身体盒 / PNG = 既有 img 矩形）③ `mode='png'` 时行为与现状逐位一致 ④ 池配置到达后启动链 | +35 ~ +50 | ≤ 239 |
| `pet-chain-core.js` | **新建** | 纯函数档：`rollKind` / `pick` / `pickWeightedCategory` / `pickSlot` / `nextInSlot` / `pickChainNext` / `mediaBox` + 常量 + 双环境导出尾巴（`typeof module !== 'undefined'`）| +170 ~ +200 | ≤ 200 |
| `pet-chain.js` | **新建** | 播放器：双缓冲状态机 / 切换序列 / `gen` 竞态 / 语义档位映射表 / 链运转 / 回落链 / 日志 | +200 ~ +240 | ≤ 240 |
| `pet-preload.js` | 15 | `onChainConfig(cb)` / `chainMove()` | +4 ~ +5 | ≤ 20 |
| `shell-pet.js` | 371 | ① 池装载 + V1–V6 校验 + `src` 生成 + `did-finish-load` 下发 ② `pet-chain-move` 处理器（调既有 `doWander()`）③ debug 下挂 `console-message` → `pet-anim.log` | +55 ~ +75 | ≤ 446 |
| `package.json` | 128 | `build.files` 增列 `pet-chain-core.js` / `pet-chain.js`（`assets/**/*` 已覆盖池与素材；`dependencies` 段零 diff） | +2 | 130 |
| `assets/pet-anim/pool.json` | **新建** | 池数据（行数随池规模；见 §2.1.2 四案） | 数据档 | — |
| `assets/pet-anim/webm/**` | **新建** | 素材（**字节量 = 递归实测登记项（无上界）**，见 §2.1.2） | 二进制 | — |
| `THIRD-PARTY-NOTICES.md` | 54 | 署名节（§2.2.10） | +10 ~ +14 | ≤ 68 |
| `README.md` | 161 | 「致谢与合规」补一行 | +1 ~ +3 | ≤ 164 |
| `版本说明.txt` | 66 | 「四、说明」补一行 | +1 ~ +3 | ≤ 69 |
| `.thincoder/b18-pet-chain-stub.mjs` | **新建** | 开发期桩测（**不入包**；`.thincoder/` 不入 `build.files`） | +350 ~ +450 | — |
| `probe-pet-media.js` | **新建** | 开发期探针（**不入包**；`docs/CONVENTIONS.md` §八）：加载 `pet.html`，读首帧 alpha 包围盒 + 双通道命中矩形 + `<video>` 元素计数 | +100 ~ +140 | — |

> **注 F1（贴线档拆分计划，预登记）**：`shell-pet.js` 预算末值 **≤ 446 行**（阈值 500；贴线档判据 ≥ 480）。若实现期超过 **480 行**，**就地拆分**：把「池装载 + V1–V6 校验 + `src` 生成」抽为 `shell-pet-anim.js`（`init(deps)` 形态，承 `docs/CONVENTIONS.md` §四），并同步 `package.json` 的 `build.files` 与 `main.js` 的接线（**新增源档须一并登记**，否则打包后缺失）。
> **单档 ≤500 行**：本批所有档的预算末值均 ≤ 500 ✓（最大 = `shell-pet.js` 446）。

### 2.4 关键决策记录

| # | 决策 | 理由 | 否决 / 备选 |
|---|---|---|---|
| DD-1 | 播放器形态 = 双 `<video>` 渲染位交替 + CSS 交叉淡入 | 无空白帧有结构性保证（等就绪再换前台）；无逐帧 JS；零依赖；样本已在透明窗形态实证 | 否决 canvas 逐帧（复杂度换不来判据）、单 video（US-16 硬冲突）——§2.1.1 |
| DD-2 | 池 = **随包数据文件** + 主进程装载校验后经 IPC 下发；渲染层零 fs / 零 fetch | 渲染进程 `sandbox: true`，不能读盘；`file://` 页面 `fetch` 不可用；校验与「缺失即回落」的判据都在主进程一次完成 | 否决「渲染层 `<script>` 数据档」（无校验面、换池要改 HTML）、否决「自定义协议 / 本地 HTTP」（代价大于收益） |
| DD-3 | 素材目录 = `assets/pet-anim/`（**随包**） | `build.files` 的 `assets/**/*` 已覆盖（`package.json:74`）；与既有 `assets/pet-new/` 同机制；不改打包白名单结构 | 否决「userData 外置池」（本批无需求；`file://` 绝对路径面 = 新风险）——出批项 O3 |
| DD-4 | 池 schema **与样本同形**（`idle` / `turn` / `moves` / `categories` / `events` / `weights`） | 机制的语义已被样本验证；评审可逐条对照；迁移 / 借鉴成本最低 | 差异两处（**有意**）：① `moves` 按 `walk` / `run` 分键（本仓语义档位需要）；② 不设 `moves.default` 的距离参数（本批无消费者） |
| DD-5 | **事件档位的键 = 本仓既有语义档位名**（`happy` / `eat` / `sleep` / `read` / `starry` / `scared`） | 主进程零语义变更（不改既有触发点与词表）；映射表可逐档机检 | 否决「另起一套事件名」（两套词表 = 双层映射 = 漂移源） |
| DD-6 | 链的 `move` 档 = **复用既有 `doWander()`**（IPC 请求），不引入动画驱动位移 | 位移纪律（`docs/design/PET-MULTIMONITOR.md` §2.3.5）零触碰；B03 桩测与实机取证面不变 | 否决「照搬样本 `startMoveDrive`（rAF 按 `el.duration` 逐帧写窗口位置）」：与「每帧零尺寸写入 / 段起点兜底」正面冲突，且属 D 面 |
| DD-7 | `weights.move` **默认 0**（机制在、默认不接管位移） | 消解「链的 move」与既有 `scheduleWander`（15–35 s）**两个位移源并存**的观感竞争；既有节奏是 B03 校准过的 | 备选（**已裁定不采用**，2026-09-17）：把 `weights.move` 设为 >0 并放大 `scheduleWander` 间隔——属节奏变更，见 §2.5 观察项 O10 |
| DD-8 | 段结束的权威 = **`ended`**（主进程定时器降级为「情境回退信号」，不切段） | 事件段时长（3–8 s）普遍长于既有定时器（1.6 / 2 / 2.4 s）；否则每段都被切碎 | 否决「按主进程定时器切段」（观感断裂）；否决「改主进程定时器时长」（改既有交互节奏 = 需求外变更） |
| DD-9 | 回落**三级**（整体 / 档位 / 运行期），全部**单向**（只向回落方向移动）且**不出现未定义状态** | US-18 的「安全回退」要求「任意一层出问题都能回到既有观感」；**未定义状态**（一段同时横跨两通道、或通道归属悬空）才是新的不一致面——**按档位走 PNG 是该档的明示定义态**（§2.2.8②） | 否决「只做整体回落」（缺段即整池弃用，浪费素材）、否决「运行期静默跳过」（US-18 要求不静默） |
| DD-10 | 命中区来源随通道切换（视频 = 池声明的身体盒 / PNG = 既有 img 矩形），**阈值与穿透守卫不改** | `#pet` 在视频通道下 `display:none` ⇒ `getBoundingClientRect()` 归零 ⇒ 若不改，命中判定全失（点击 / 拖动入口即废） | 否决「共用一个固定矩形」（两通道画幅不同，必然一侧失配）；否决「改点击阈值」（承 US-5 不得回退） |
| DD-11 | 无障碍 = **系统偏好为唯一权威源**（`matchMedia`），不做用户配置项 | 双源即冲突源；系统偏好已表达用户意图 | 否决「加 settings 开关」 |
| DD-12 | 淡入时长 = **180 ms**（样本口径） | 观感连续且短于段切换延迟量级；减少动态效果时归零 | 否决「更长 / 曲线淡入」（无判据支撑其收益） |
| DD-13 | 日志面 = 渲染层 `console` + 主进程 `console-message` 捕获落 `userData/pet-anim.log`（仅 debug） | 不新增 IPC 通道；与既有 `pet-geometry.log` 模式同源（`shell-pet-geometry.js:51-53`） | 否决「新增日志 IPC 通道」（多一条通道 = 多一条维护面） |
| DD-14 | 论证主体 = **新建 `.thincoder/b18-pet-chain-stub.mjs`**，且 `pet-chain-core.js` 带**双环境导出尾巴** | 桩测可 `require` **真实实现**（不复制源码、不写镜像断言——B03 桩测已明示「镜像断言属空断言」）；B03 桩测的锚点/正控方法论沿用 | 否决「只靠实机人眼」（无机器证据）；否决「在渲染层塞测试钩子」（污染产品代码） |
| DD-15 | 新增源档必须登记进 `build.files` | 该清单是**白名单**：未登记 ⇒ 打包后文件缺失、桌宠动画链静默失效 | 否决「靠 `assets/**/*` 类似通配覆盖根档」（根目录无通配项） |
| DD-16 | 素材落盘与机制落地**解耦**（池可空） | 体积已裁定为**无硬上界**（用户 2026-09-17，批次档 §1.6）⇒ 素材量与选段按**交付登记项**落数据（AC13）；机制可先行实施并验收「回落形态」 | 否决「等裁定再动工」（阻塞机制实施） |

### 2.5 与既有纪律 / 既有实现的冲突点核对

| # | 既有约束 / 纪律 | 设计处理 | 结论 |
|---|---|---|---|
| C1 | 几何层冻结（`shell-pet-geometry.js` 逐字不动） | 本批不触碰；窗口尺寸 / 位置零写入 | 不冲突（AC15 机检） |
| C2 | 窗口逻辑尺寸恒 250×270 DIP（US-11） | 媒体盒在窗口**内**排布（超宽部分只裁透明边）；不改 `PET_SIZE_DIP` | 不冲突 |
| C3 | 拖动期尺寸写入 ≤1 次 / 跨屏事件；同屏零写入 | 本批不新增任何尺寸写入路径 | 不冲突 |
| C4 | 散步段起点兜底校准（≥30 s）与每帧零尺寸判定 | `doWander()` 逐字不改；链只请求「跑一次」，不碰其内部 | 不冲突 |
| C5 | 点击判定阈值 5 px + 点击链语义（US-5） | 阈值与点击链不改；只改命中矩形来源（DD-10） | 不冲突（US-5 不得回退） |
| C6 | 穿透守卫（拖动期间不切换穿透） | 守卫语句原样保留；仅在通道切换时换命中矩形 | 不冲突 |
| C7 | 不新增依赖 / 原生模块（NFR-4、NFR-13） | webm 走 Chromium 原生 `<video>`；无转码、无新 npm 包 | 不冲突（依赖段零 diff） |
| C8 | `build.files` 白名单 | 新增两个渲染档须**登记**（DD-15）；池与素材已由 `assets/**/*` 覆盖 | 不冲突（须实现同步） |
| C9 | 单档 ≤500 行 / 行宽 ≤300 | 预算末值最大 446 行；两新档按 200 / 240 行预算 | 不冲突（注 F1 预登记拆分计划） |
| C10 | 样本区不可引用（`docs/README.md` §一） | 实现零 `require` / `import` 样本 | 不冲突（AC15 机检） |
| C11 | macOS / Linux 既有行为不回退（NFR-3 / NFR-7） | 机制只用三平台共有 API；macOS 的 webm-alpha 差异**不改本批路径**（见观察项 O6） | 不冲突 |

#### 前置缺陷（**打回主 agent 处置**）

- **D1（阻断批次档 §1.4-2 的回归判据）**：`.thincoder/b03-pet-calibrate-stub.mjs` **当前无法运行**——抽取源硬绑 `main.js`（`:84`），而几何 / 拖拽 / 散步实现已由 **B06 F6 拆分**迁出（`main.js:35-37` 只余 `require`）；实测 `Error: marker not found: const PET_SIZE_DIP = {`（`:96`、`:118`），**0 条断言执行**，故「189/189 保持全绿」当前不可复现。
  - **本档的处置**：**不改写批次档 §1.4-2 的判据**（判据语义 = 几何面零回退，仍然正确）；本档的 AC15 以「几何档零 diff + 既有验收清单复核」给出**现在就可用**的取证面，并把「B03 桩测全绿」标为**前置待修**的补充证据。
  - **建议处置**（供主 agent 裁）：把该工具的抽取源改绑 `shell-pet-geometry.js` / `shell-pet-drag.js` / `shell-pet.js`（纯 dev 工具改动，`.thincoder/` 不入包），或另立技术待办；**不宜**让 B18 以「189/189」作为交付门槛而不修源。

#### 观察项（需用户 / 主 agent 知悉或裁定）

- **O1 拖拽悬空段动画**（出批）：样本的 `animations.drag`（`被鼠标拖拽悬空反馈`）触发点在拖拽链内（`pet.js:98-126` 的 pointer 链），属高敏感路径 + B 面（物理手感）；本批不做。
- **O2 会话事件接入**（出批）：`events` 机制已备，缺的只是触发源（工作状态 / 余额 / 碎碎念）；接入属 D1 / D2 面。
- **O3 用户自定义池 / 权重面**（出批）：本批按 DD-2 / DD-3 窄化；若用户要「换池」，需另立批次（含外置目录、`file://` 绝对路径、菜单入口）。
- **O4 §1.6 第 ③ 案（重编码降码率）**（出批）：转码链属 C 面；本批只接产物。
- **O5 透明窗内视频合成的实机风险**（须实测取证）：`transparent: true` + VP9-alpha 在 Windows 上**有实证先例**（样本桌面 helper：`runtime/electron-helper/main.js:350-363`），但**本仓**的窗口配置不同（`sandbox: true`）。若实机出现黑底 / 残影 ⇒ 备选路径（择一，均须在修正轮内论证）：① 自定义协议供给素材（`protocol.handle`）；② 关闭 GPU 合成开关（**新开关 = 新面，须用户裁定**）。取证点 = TC-3 / TC-4。
- **O6 macOS 的 webm-alpha 差异**（如实登记，本批不改路径）：样本注明 Safari / WKWebView 不认 webm alpha，需 `HEVC-with-Alpha` 的 `.mov`（`src/shared/constants.ts:15-20`）。本仓 macOS 支撑面已由台账 R13 裁定「后置」，本批验收平台 = Windows；**不回退** macOS 既有行为（PNG 通道在 mac 上照常可用；池在 mac 上若发生 ① 整体回落即回落）。
- **O7 §1.2 行数口径差**（一致性面）→ **已消解（2026-09-17）**：批次档 §1.2 的行数**已统一为换行符口径**（`pet.js` 189 / `shell-pet.js` 371 / `shell-pet-geometry.js` 437）⇒ 与本档 §2.3 **无口径差** ✓（修正记录见批次档 §1.9）。余下实测面不变：`assets/pet-new` 的 **51 档 / 2.52 MB** 与样本 webm 的 **106 段 / 51.86 MB** 经本批独立复核**一致** ✓。本条归档。
- **O8 「挤压动效」在本仓不存在**（口径澄清，须用户 / 主 agent 知悉）：§1.3 项 5 要求「跳过淡入与**挤压**动效」，但 ① 本仓**无**挤压实现（挤压属 B 面）；② 本仓**亦无** `prefers-reduced-motion` 既有条文（全仓实测零命中，样本那份不算）。
  - **本档的读法**：US-19 的落实 = 「**本批新增的淡入**（DD-12）＋**既有 CSS 动效**（浮动 `bob` / 气泡 `pop` / 好感度条过渡，`pet.html:32/39/61`）」在 reduce 下停用；挤压面**无对象可停**，待 B 面落地时同表接入（不属本批遗漏）。
- **O9 §1.6 体积裁定未出**（阻断 NFR-11 取值）→ **已裁定（2026-09-17）· 归档**：用户裁定**素材无预算**（不设体积上界）⇒ 采用 §1.6 第 ① 案「可全量」；**素材选段 = 池数据**（可增删、不改代码）。NFR-11 / AC13 已同源改口径（AC13 改为**交付登记项**：记录递归实测值、不判阈值）；设计对四案同形（§2.1.2）与「池可空」推进（DD-16）均不变。本条归档。
- **O10 `weights.move` 默认 0**（DD-7）→ **已裁定（2026-09-17）· 归档**：① 本批**不接管位移**（`weights.move` 保持默认 **0**，链只决定「播哪段」）；② 理由 = 位移写权与 **B 面（物理手感）属同一机制**，应合并解决（单写者 + 优先级）；③ **合并落点 = 未来「位移与物理手感」批**（依据 = 批次档 §1.9，只给指针、不重述理由）。**未来接管时的附带约束**：改池数据一行 + 同步复核 `scheduleWander` 的 15–35 s 间隔（属 B03 节奏变更，须单独裁定）。本条归档。

---

## 三、测试层

### 3.1 验收标准逐条回指

| 验收 | 回指需求 | 判定方式 | 机检可能性 |
|---|---|---|---|
| AC1 | US-15 | 池装载与校验：合法池 ⇒ 日志 `anim pool ok=1 segs=<n> bytes=<n> max=<n>`；7 类非法池（V1–V6 谓词 6 类：缺键 / 引用悬空 / 超 1.5 MB / 权重非法 / 档位下界不足 / 路径穿越；+ JSON 破损 1 类）⇒ 逐类 `ok=0 reason=V<n>` **且**画面回落 PNG | 机检（日志 + 画面） |
| AC2 | US-15、US-17 | 链决策纯函数：桩测逐条断言（阈值边界 / 单元素池 + 排除自己 / 分类权重与 `noMirror` 过滤 / 档内轮换 / `mediaBox` 数值）——**断言全部跑真实实现**（`pet-chain-core.js` 经双环境导出装载） | 机检（`node .thincoder/b18-pet-chain-stub.mjs`） |
| AC3 | US-15 | 链连续运转（**行为面活性判据**——判据细目见本节表后「注 A」）：清醒窗口内链不停摆、切换条数与「窗口 ÷ 段时长」同阶、相邻 `ended → shown` ≤ **300 ms**、`kind` 覆盖 `weights > 0` 的档位（`move` 例外，见 DD-7）、`move` 档请求 ≤1 s 有回执 | 机检（日志） |
| AC4 | US-16 | 无空白帧（机制面）：每次 `anim switch` 行 `readyState ≥ 2` 且 `ready ≥ t0`；静态核对三条禁止形态（§2.2.5 第 5 条）零命中；切换期旧段 `pause()` 后仍在 DOM 且 `is-front` 已摘下 ⇒ 不存在「两帧皆空」 | 机检（日志 + 静态核对） |
| AC5 | US-16 | 无空白帧（观感面）：**人工判定**——连续观察 10 min 的段切换，无可见空白 / 闪白 / 跳帧；慢速录屏抽帧复核 3 次切换 | 人工（**如实标注：主观项**） |
| AC6 | US-17 | 事件档位（**前置：每次触发间隔 ≥ 当前段时长**）：同一档连续触发 5 次（多候选池）⇒ `anim slot` 行的 `pick` 不出现「与上一次相同」；单候选池 ⇒ 恒同段但 `loop=true`（不重载） | 机检（日志） |
| AC7 | US-18 | VP9-alpha 实机播放：探针读首帧像素——**透明区 alpha ≤ 8**（探针容差；**实测 1**——8-bit 合成量化：alpha=0 经 Chromium 合成后落到 1/255，目视不可辨；失败形态「黑底不透明」零命中）、身体区 alpha > 0（实测 255）；`PixelWidth/Height = 640×360`；`videoWidth/Height` 与池声明一致 | 机检（探针，`probe-pet-media.js`） |
| AC8 | US-18 | 回落链三级：① 移走池文件 / 破 JSON ⇒ PNG 通道（画面与现状逐位一致 + `ok=0`）；② 删空 `moves.run` ⇒ 走 `moves.walk` 且 `slot-miss` 行在场；③ 用损坏 webm 触发 `play-fail` 三次 ⇒ `fallback reason=play-failed` + PNG 通道 | 机检（日志 + 画面） |
| AC9 | US-18、NFR-13 | PNG 通道零回退：11 个语义档位逐个触发 ⇒ 动作、帧序列、定时节奏与现状一致（人眼 + 帧采样）；`assets/pet-new/**` 与 `pet.html` 的 200px / 140px 口径零改动 | 半机检（静态零 diff 机检 + 人眼观感） |
| AC10 | US-19 | reduce 模式：`matchMedia` 命中时——`.pet-media` 计算样式 `transition-duration = 0s`；`#pet.animate-bob` 与 `#bubble.show` 的 `animation-name = none`；`#affinity-fill` 无过渡；链仍运转（`anim switch` 行照常增长） | 机检（探针读计算样式 + 日志） |
| AC11 | NFR-9 | 延迟：`shown − t0 ≤ 300 ms`（池内切换，**无容差**，与 AC3 同口径）；冷启动首次播放 `≤ 800 ms` | 机检（日志） |
| AC12 | NFR-10 | `<video>` 元素数恒 = 2（运行期断言 + 探针计数）；链跑 10 min 后渲染进程 `memory.workingSetSize` 增幅 < **50 MB**（`app.getAppMetrics()`，`electron.d.ts:1079`）；池内单段 ≤ 1.5 MB（V3） | 机检（探针 + 主进程采样） |
| AC13 | NFR-11 | 体积：**记录** `assets/pet-anim/**` 递归实测字节数（**无上界**，用户裁定 2026-09-17；作为**交付登记项**、**不判阈值**，交付时记入 `docs/batches/B18-pet-animation-chain.md` §5 / §6）；且逐段 ≤ 1.5 MB（V3） | 机检（实测登记） |
| AC14 | NFR-12 | 署名：`THIRD-PARTY-NOTICES.md` / `README.md` / `版本说明.txt` 三处命中「PC2005-cloud」+ GitHub 地址 + 禁商用与消解路径；`package.json:78` 仍含 `THIRD-PARTY-NOTICES.md` | 机检（静态文本核对） |
| AC15 | NFR-13 | 不回退与规范：`shell-pet-geometry.js` 零 diff；`package.json` 依赖段零 diff；新增档行宽 ≤ 300 / 行数 ≤ 500；全仓零 `require`·`import` 指向 `samples/**`；既有验收清单（US-1…US-14 / NFR-1…NFR-8）逐条复核 | 机检（静态核对）；**补充证据（前置待修）** = B03 桩测全绿（§2.5 D1） |

**注 A —— AC3 判据细目（行为面活性；取证口径 = 保持清醒的 600 s 探针：`npx electron probe-pet-media.js --chain 600`）**

- **口径依据**：该探针路径不经 `main.js:182` 的 `pet.scheduleSleep()` ⇒ 入睡计时器不入场，链全程不停摆（与「完整应用」口径的分野见末条）；
- **① 链不停摆**：相邻两条 `anim switch` 行的 `shown` 间隔 ≤ **段时长 + 100 ms 抖动余量**（段时长 = 池内实测段长，本批恒 10.04 s ⇒ 上界 10.14 s）；
- **② 切换条数**：窗口内 `anim switch` 条数 **≥ 1**，且与「窗口 ÷ 段时长」**同阶**（同阶口径 = ≥ `0.9 × 窗口 ÷ 段时长` ⇒ 600 s 窗口下界 53.8）；
- **③** 相邻 `ended → shown` 差值 ≤ **300 ms**（与 AC11 同口径，无容差）；
- **④** `anim chain` 的 `kind` 分布覆盖所有 `weights > 0` 的档位（`move` 例外，见 DD-7）；
- **⑤** `move` 档请求后 ≤1 s 内观测到 `walk-*` / `run-*`（或 `ack=timeout`）；
- **口径注（不得误判）**：完整应用（无人干预）口径下，既有「2 min 空闲 ⇒ 入睡」规则（US-17 边界明写不改；`shell-pet.js:249-251`）把链推入 `sleep` 持续段（`loop=true` ⇒ 无 `ended`）⇒ 链在该段停换，**该口径不计入 AC3**；
- **as-of 实测（2026-09-17；源 = 批次档 §5.3 + 探针长跑日志）**：600 s 窗口 ⇒ `switch` **97** 条 · `shown` 间隔最大 **10042 ms** · `ended → shown` 最大 **24 ms**（n = 48）· `kind` = `{action:64, idle:8, turn:4}`；
- **替代关系（防两套判据）**：本注取代原「`anim switch` ≥ 60 / 10 min」字面——该字面在完整应用口径下**结构性不可达**（段长恒 10.04 s ⇒ 600 s 纯链理论上界 59.8 < 60，2 min 入睡规则进一步中断链）。

### 3.2 用例表

| 用例 | 类型 | 输入 / 前置 | 预期输出 | 映射 |
|---|---|---|---|---|
| TC-1 | 正常 | 合法全量池；冷启动应用 | `anim pool ok=1`；首个待机段 `shown − t0 ≤ 800 ms`；随后链持续换段 | US-15 / AC1、AC11 |
| TC-2 | 正常 | 清醒 600 s 探针窗口（`npx electron probe-pet-media.js --chain 600`） | 无异常日志；链不停摆（相邻 `switch` 的 `shown` 间隔 ≤ 段长 + 100 ms 抖动余量）且 `switch` 条数 ≥ 0.9 × 窗口 ÷ 段长；相邻 `ended → shown` ≤ 300 ms | US-15 / AC3 |
| TC-3 | 边界 | 透明窗内播放 VP9-alpha 段；放大观察 | 身体外区域**透明**（桌面可见）、无黑底 / 无残影（O5 的取证点） | US-18 / AC7 |
| TC-4 | 边界 | 拖动窗口跨屏、穿越缩放比不同的屏，同时段在播放 | 几何写入纪律与既有行为逐位一致（`pet-geometry.log` 无新增尺寸写入；桩测口径的判据面不变） | NFR-13 / AC15 |
| TC-5 | 边界 | 单候选待机池（`idle` 长度 1） | `loop=true`，不重载、不闪断；链不产生 `switch` 抖动 | US-15 / AC3、AC4 |
| TC-6 | 边界 | `idle` 池多候选 + 权重 `{idle:10,turn:5,move:0}`；观察 200 次链决策 | `kind` 分布与权重一致（统计容差 ±15%）；`move=0` ⇒ 零 `move-req` | US-15 / AC2、AC3 |
| TC-7 | 边界 | 事件档多候选（≥2）；点击 5 次（**每次触发间隔 ≥ 当前段时长**） | 5 次 `pick` 与「上一次」均不同；段播完才回链（不被 1.6 s 定时切碎） | US-17 / AC6 |
| TC-8 | 边界 | `sleep` 档（池 2 段；**持续状态**恒 `loop=true`，见 §2.2.3）→ 触发入睡 → 唤醒 | 入睡期间同段 `loop=true` 连续播（不轮换、不换段）；`wakePet()` 后回链 | US-17 / AC6 |
| TC-9 | 边界 | 媒体盒落位；好感度条同时在场；一次跨通道回落（级 ② / 级 ③） | 身体竖直带 = `y ∈ [44, 244]`；媒体盒与好感度条的交叠区落在脚底以下的透明区（无视觉遮挡）；回落瞬间可见身体高度按既定取舍变化（**200 ↔ 140**，Δ ≤ 60 px）且**不出现空白帧** | US-18 / AC7 |
| TC-10 | 错误 | 池文件被删除 | `anim pool ok=0 reason=V1`；PNG 通道运行，画面与现状一致 | US-18 / AC8 |
| TC-11 | 错误 | 池 JSON 语法破损 | 同上（不抛异常、不空白） | US-18 / AC8 |
| TC-12 | 错误 | 池中某片段名对应文件缺失 | `ok=0 reason=V2` + 该名在日志中列出；整体回落 PNG | US-18 / AC8 |
| TC-13 | 错误 | 池内放入一段 > 1.5 MB 的素材 | `ok=0 reason=V3`；回落 PNG | US-18 / AC8、NFR-10 |
| TC-14 | 错误 | `moves.run` 为空数组 | 走 `moves.walk`；`anim slot-miss slot=moves.run fallback=walk` | US-18 / AC8 |
| TC-15 | 错误 | 素材文件为损坏 webm（0 字节 / 截断） | `anim play-fail` 连续 3 次 ⇒ `fallback reason=play-failed` + PNG 通道；无未捕获异常 | US-18 / AC8 |
| TC-16 | 边界 | 系统开启「减少动态效果」 | 计算样式核对（AC10 四项）；链仍换段 | US-19 / AC10 |
| TC-17 | 边界 | 系统偏好在运行期切换 | ≤1 个段周期内生效；无需重启 | US-19 / AC10 |
| TC-18 | 错误 | 拖动中链掷出 `move` | `doWander()` 守卫拦下（拖动中不位移）；渲染层 ≤1 s 后 `ack=timeout` 并继续链；窗口零位移 | NFR-13 / AC3、AC15 |
| TC-19 | 正常 | 专注模式切换（销毁 / 重建桌宠窗） | 重建后池重新下发、链恢复；渲染进程无残留定时器 / 无 `play()` 泄漏（`video` 元素随窗口销毁） | NFR-10 / AC12 |
| TC-20 | 边界 | Windows + 三屏混合 DPI 实机（承 B03 环境） | 跨屏拖动 / 散步 / 找回入口行为与现状一致；段切换在跨屏瞬间不引发几何写入 | NFR-13 / AC15 |

### 3.3 验证手段、仪表与限制

**验证手段（三类，全部可用现成工具，不引入测试框架）**

1. **桩测（机器证据，主）**：`node .thincoder/b18-pet-chain-stub.mjs`——装载**真实** `pet-chain-core.js`（双环境导出，DD-14），断言：链阈值边界 / 抽取与排除 / 分类权重与 `noMirror` / 档内轮换 / `mediaBox` 逐值 / 池校验 V1–V6 谓词（合法 + 6 类非法）+ JSON 破损 1 类（**合计 7 类**，与 §3.1 AC1 同口径）/ 11 档映射表。末行打印 `pass/total PASS`，非零退出即失败。
2. **开发期探针（机器证据，辅）**：`npx electron probe-pet-media.js`——加载 `pet.html`，输出：首帧 alpha 包围盒（校准 `PET_MEDIA_BODY`）/ 双通道命中矩形 / `<video>` 元素计数 / reduce 模式下的计算样式 / 像素级 alpha 采样（黑底判据）。**不入包**（`docs/CONVENTIONS.md` §八）。
3. **日志与人工（观感证据）**：`BIGFISH_PET_DEBUG=1` ⇒ `userData/pet-anim.log` 机检（行型见 §2.2.11）；观感项（无可见空白帧 / 视觉大小不跳变 / 透明正确）**如实标注为人工判定**。

**限制（如实声明，防被误读为已覆盖）**

1. **观感无机器判据**：AC5（无可见空白帧）只能人工 + 抽帧复核；「无闪烁」的阈值（多少 ms 不可感）没有权威口径，本档不伪造阈值。
2. **样本素材的观感与角色一致性**：样本素材是**另一只角色**（画风与既有 PNG 素材不同）。本批不承诺「两通道观感一致」，只承诺「两通道各自与自身的身体对齐口径一致」（§2.2.6）——跨通道切换的观感差异属**素材差异**，须用户裁定采纳范围时一并考虑。
3. **池缩放的统计判据**：TC-6 的分布判据是**统计性**的（容差 ±15%），单次运行可能出现偏离；桩测内的抽样断言同样标注容差（不做逐次精确断言，避免 flaky）。
4. **实机面**：本仓为单实例桌宠；「多实例 × 106 段池」的解码 / 显存上界**不在本批判别面内**（E 面），NFR-10 的上界按**单实例**给出。
5. **`<video>` 在 `sandbox: true` 的 `file://` 页面加载相对路径素材**：以既有同机制（`pet.js:11-20` 的图片相对路径）为据，**实现期以探针实测取证**（TC-1 / TC-3）；若实测失败 ⇒ 走 O5 的备选路径并回到设计（不静默降级）。
6. **`shell-pet.js` 的无 `init` 拆分面**：注 F1 的拆分计划仅在触及 480 行时启用；启用即属**新增源档**，须同步 `build.files`（DD-15）。
7. **跨通道可见身体高度（视频 200 / PNG 待机帧 140）= 已接受取舍**（用户 / 主 agent 裁定 2026-09-17）：级 ② / 级 ③ 回落瞬间可见高度会有一次既定跳变（Δ ≈ 60 px）；本批**不改媒体盒**（`#pet` 的 200px 属 US-18 边界明写的既有 CSS 尺寸口径）。可核对判据 = TC-9。
8. **NFR-9 / NFR-10 的数值无既有实测依据**（300 / 800 ms、50 MB 均系设计期给定值）：**首轮实测后可回调**——回调属需求层判定（本档不单方面放宽数值判据，AC11 与 AC3 同口径）。

---

## 四、变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-17 | 建档（B18）：需求层回指（US-15…US-19 / NFR-9…NFR-13）；设计层四处方案选型（播放器形态 / 素材池四案同形 / 双缓冲 / 配置面）、池数据契约与 V1–V6 校验、11 档映射表、链决策契约、播放器契约与三条禁止形态、媒体盒几何与命中区、两条 IPC、三级回落链、无障碍契约、署名落点与日志面；DD-1…DD-16；前置缺陷 D1（B03 桩测不可运行）+ 观察项 O1–O10；AC1–AC15 + TC-1…TC-20。 |
| 2026-09-17 | 修正轮 1（预评审清理）：§2.3 顶部注记与 §2.5 观察项 O7（as-of `:337` / `:410`）的「批次档 §1.2 口径差」表述同步为**已统一**（口径 = 换行符计数，修正记录见批次档 §1.9）；条目 / AC / TC / DD / 数值零改动。 |
| 2026-09-17 | 修正轮 2（用户裁定同步 · 单主题）：§3.1 AC13 由「按体积上界判阈值的形态」改为「**记录** `assets/pet-anim/**` 递归实测字节数（**无上界**，交付登记项、不判阈值）」；§2.5 观察项 O9（as-of `:413`）标**已裁定（2026-09-17）· 归档**并注明「素材选段 = 池数据（可增删、不改代码）」；回指 `docs/requirements/PET.md` §四 NFR-11 同源改口径。AC / TC / DD / 选型结论零改动，**AC 计数不变（15）**。 |
| 2026-09-17 | 修正轮 3（评审第 1 轮 · 10 组）：NFR-11 / AC13 全档对齐（§1.1 / §2.1.2 / §2.3 / DD-16）；DD-9 / §2.2.8 改述为「不出现未定义状态」；可见高度差 = 明示取舍（§3.3 限制 7 + TC-9）；同档事件段再触发 = 忽略（§2.2.4 规则 2 + AC6 / TC-7）；AC11 去 P95（同 AC3 口径）；余量归 `action`（§2.2.2 / §2.2.4）；非法池口径统一 7 类；数值登记可回调（§3.3 限制 8）。AC 15 · TC 20 · 条目 10 不变。 |
| 2026-09-17 | 修正轮 5（裁定状态回填 · 单主题）：§2.5 观察项 O10（as-of `:419`）标**已裁定（2026-09-17）· 归档**（本批不接管位移；合并落点 = 未来「位移与物理手感」批，依据 = `docs/batches/B18-pet-animation-chain.md` §1.9），并把「B03 节奏变更须单独裁定」改述为**未来接管时的附带约束**；DD-7 备选列由「用户可裁」改为「**已裁定不采用**，2026-09-17」。AC 15 · TC 20 · DD 决策与取舍理由 · 选型结论 · 受影响文件表零改动。 |
| 2026-09-17 | 修正轮 6（**实施后收口**；源 = 实施报告 AC3 判据缺陷 + 4 条 Deferred，主 agent 逐条裁定）：AC3 改行为面活性判据（细目 = §3.1 注 A · TC-2 同源）· AC7 透明区改「alpha ≤ 8」· §2.2.3 `sleep` 行去「单候选」+ TC-8 同源 · §1.1 / §2.2.5 / §2.2.7 载荷形状统一 · §2.2.4 `nextInSlot` 保留。编号与 AC / TC / 条目计数不变；代码零改动。 |
