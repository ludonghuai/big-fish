# 设计档 PET-ANIMATION — 桌宠动画链引擎（B18）+ 工作状态联动（B19）+ 动作选择规则（B21）+ 观感修正（B26 / B27）

> 回指需求档：`docs/requirements/PET.md`（US-15…US-19 / NFR-9…NFR-13 = B18；US-20…US-23 / NFR-14…NFR-17 = B19；US-29…US-31 / NFR-23 = B21；**US-32…US-33 / NFR-24 = B27**）
> 关联批次：`docs/batches/B18-pet-animation-chain.md`（§1 立案 / §2 本批任务书 / §5 实施记录）· `docs/batches/B19-pet-work-status.md`（外部项目移植 D1 面；§1 立案 / §2 本批任务书）· `docs/batches/B21-pet-action-selection.md`（B18 真机反馈修复批 + 交互 / 个人分类；§1 立案 / §2 本批任务书）· `docs/batches/B27-pet-feel-2.md`（观感 II：节奏 + 逃跑表达；§1 立案 / §2 本批任务书）
> 上游设计档（**只引用不重述**）：`docs/design/PET-MULTIMONITOR.md`（多屏几何 / 尺寸锚点 / 拖动与散步写入纪律）·`docs/design/PET-DRAG.md`（拖拽跟手 / 点击阈值 / 穿透策略）
> 只读参考（样本区，**不得被 require / import**）：`samples/dsh-pet/`（PC2005-cloud，v0.2.11；样本与移植纪律见 `docs/README.md` §一）
> 变更记录见 §四。

---

## 一、需求层（回指）

### 1.1 验收条目回指表

| 需求条目 | 本档节 | 一句话实现面 |
|---|---|---|
| US-15 动画池与权重链 | §2.2.2 / §2.2.3 / §2.2.4 / **§2.14** / §3.9 AC32、AC33 | 池 = 数据文件（动作 → 片段数组）；权重掷骰（idle / turn / move / 分类）在渲染层纯函数里跑；段播完即按权重续选；**B27 修订注记**：节奏面自 B27 起按 US-32 读（加权待机 + 动作类段后静默期） |
| US-16 切换无空白帧 | §2.2.5 | 两个 `<video>` 渲染位交替 + 等「新段就绪（`readyState ≥ 2`）」才换前台 + 短促交叉淡入 |
| US-17 事件档位动画 | §2.2.2 / §2.2.4 | `events.<档位>` = 候选数组；触发时档内随机并避开上一段 |
| US-18 视频素材接入（保留 PNG 通道） | §2.2.7 / §2.2.8 | 主进程装载并校验池 → IPC 下发；渲染层按下发的名 → URL 映射（`pool.src`）播放；池缺 / 校验失败 / 播放失败三级回落既有 PNG 通道 |
| US-19 减少动态效果 | §2.2.9 | `matchMedia('(prefers-reduced-motion: reduce)')` ⇒ 停交叉淡入 + 停既有 CSS 动效（浮动 / 气泡弹出 / 进度条过渡） |
| NFR-9 播放及时性 | §2.2.11 / §3.1 AC11 | 链日志三时刻（`t0` / `ready` / `shown`）机检 |
| NFR-10 内存与解码上界 | §2.2.5 / §2.2.11 / §3.1 AC12 | `<video>` 元素恒 2 个；按需设 `src`；`app.getAppMetrics()` 取渲染进程工作集 |
| NFR-11 包体积（**无硬上界**，已裁定 2026-09-17） | §2.1.2 / §2.3 / §3.1 AC13 | 素材量 = 递归实测**登记项**（不判阈值）；机制与素材解耦（池可空） |
| NFR-12 许可与署名 | §2.2.10 / §3.1 AC14 | 三处署名落点 + 商用化消解路径 |
| NFR-13 不回退与仓库规范 | §2.5 / §3.1 AC9 / AC15 | 几何档零 diff、既有语义零回退、零新依赖、行宽行数机检 |
| US-20 工作状态动画反映真实会话进程（B19） | §2.6.1 / §2.6.2 / §2.7 / §2.8.1–§2.8.3 / §3.4 AC16–AC18 | 读面 = 只读投影缓存记录 → 档位派生（生成 / 工具 / 收尾）→ 主进程 `setPetState` → 链按池键 `events["work-*"]` 播段 |
| US-21 工作状态只作「底色」（B19；**B26 追加自主触发让位**） | §2.8.4 / **§2.12** / §3.4 AC19、AC21、**AC24** | 工作档 = 背底档 + 1 s 重断言；**B26 的让位口径 = 档位保持（记录新鲜期不清档）+ 一道补漏起步门（同口径）**；既有触发点与定时器逐字不改 |
| US-22 工作状态气泡（B19；**B26 修正节流口径**） | §2.6.6 / §2.8.5 / §3.4 AC16、AC20、**AC31** | 本仓自写文案常量表 + 节流（同档一次 / **同档 ≥30 s** / **跨档 ≥10 s**）+ 走既有 `petSay` |
| US-23 开关面与默认值（B19） | §2.6.5 / §2.8.6 / §3.4 AC20 | `settings.json` 顶层键 + 托盘「设置」checkbox；默认关（**U-1 = 采用推荐值**；待用户批准时一并确认） |
| NFR-14 状态识别时延与开销（B19） | §2.8.8 / §3.4 AC18、AC20、AC23 | 切档 ≤ 6 s；mtime 未变不解析；禁同步递归遍历；开销面取证 = AC23（判据细目 = §3.4 注 B） |
| NFR-15 只读隔离与隐私（B19） | §2.8.1 / §2.8.7 / §3.4 AC19、AC20 | 只读状态字段；不 require `shell-notify.js`；**不使用 / 不落盘 / 不发送**会话内容（整档 `JSON.parse` 的读取事实如实登记，字段白名单见 §2.8.1） |
| NFR-16 零回退与规范（B19） | §2.9 / §2.11 / §3.4 AC19、AC21、AC22 | 零改动面逐档零 diff；两个新档登记 `build.files`；行宽行数机检 |
| NFR-17 可测与形态守卫（B19） | §2.8.1 / §2.8.2 / §3.4 AC16 | 纯函数集中可装载；`ver` 守卫 + 字段在场守卫；形态不符 ⇒ 停用 + 诊断行 |
| US-29 交互动作与个人动作分离（B21） | §2.13.3 / §2.13.6 / §3.7 AC25、AC26 / **§2.14.7** | 文档面三分（交互 / 个人 / 状态档）；drag / escape 两个新交互档；打断由既有规则 3b + idle 守卫承载（运行时无来源通道）；**B27 修订注记**：drag 呈现段换「被吓一跳」 |
| US-30 动作衔接丝滑（B21） | §2.13.2 / §2.13.4 / §3.7 AC27、AC28 | 段末前 `PET_OVERLAP_MS` 预触发下一段 + 双缓冲叠化；旧段退场仍晚于新段就绪（AC4 三禁止形态不变） |
| US-31 拖到屏幕边界的逃跑动作（B21） | §2.13.5 / §2.13.6 / §3.7 AC29 / **§2.14.5–§2.14.6 / §2.14.9** | 独立逃跑档 `escape-*`；同段不重播（R1）+ 镜像不重载（R2）；触发阈值与方向语义零改动；**B27 修订注记**：escape 单遍播完再回 + R1/R2 作用域扩展 + 逃跑腿专用参数 |
| NFR-23 衔接的可标定与零回退（B21） | §2.13.2 / §2.13.8 / §3.7 AC27、AC30 | 单一常量单点定义单点消费；零改动面逐档零 diff；池契约与素材零回退 |
| US-32 动作节奏「隔三岔五」（B27） | §2.14.2–§2.14.4 / §2.14.8–§2.14.9 / §3.9 AC32、AC33 | 加权待机（动作类 85% → 40%）+ 动作类段后真·静默期（30 s；`events.quiet` 待机呼吸段循环；非 idle 槽到达即打断） |
| US-33 逃跑与拖拽表达力（B27） | §2.14.5–§2.14.7 / §2.14.9 / §3.9 AC34 | 逃跑腿专用常量（更长更快）+ escape 段单遍播完再回（R1/R2 作用域扩展）+ drag 档换段「被吓一跳」 |
| NFR-24 节奏与逃跑表达的可标定与零回退（B27） | §2.14.8 / §2.14.11 / §3.9 AC35 | 节奏参数单点（池数据 + `PET_QUIET_MS` 单常量）；静默期交互即时性 ≤300 ms 照旧；零改动面逐档零 diff；行宽行数机检 |

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
| 主进程播放调用面 | `setPetState(state)` 经 `pet-state` 通道下发；语义档位词表 = **11 档**（与 `pet.js` 的 `FRAMES` 键集一一对应；**B21 起新增 `drag` / `escape-*`，见 §2.2.3 计数口径注**） | `shell-pet.js:185-190`；触发点清单见下方「注 E1」 |
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

#### 1.3.5 B19 批次勘察实测（只读数据面能力审计，as-of 2026-09-17）

> 本节是 B19 的**决定性勘察**：档位集合不是设计偏好，而是**读面能力的函数**。勘察对象 = 本仓运行时（Electron 33 / Node 20）能拿到的、与 DSH 会话状态有关的落盘物。

| 面 | 实测事实 | 证据 |
|---|---|---|
| 读面落点 | `<dshHome>/storages/session_projcache/sessions/<会话 ID>.json`（域 `session_projcache`，`layout: per-record`，域版本 7，plain JSON） | `dsh-bundle/node_modules/@deepseek-ai/dsh-session-projection-cache/lib/index.js:89-101`（域声明）；同族先例 = `docs/design/SHELL-UX.md` §2.2.13（B10） |
| 持久行形状 | 记录 = `{ identity, rows }`；行 = `{ ver, seq, val }`，**`val` = 投影单元的「内部状态」**（非 wire 视图，`z.json()` 保证 plain JSON） | 同档 `:27-31`（`checkpointRow`）· `:346-353`（`put()` 落 `rows`） |
| 可用行（本机活样本实测，**23 行**） | `turnBoundary`（`ver 2`）= 回合 / 步骤边界；`sessionStats`（`ver 1`）= 计数 + **`openStep` / `pendingCalls`**（字段全形见注 W1） | 亲读活样本（7827 B）+ 单元定义（`dsh-agent-loop/lib/index.js:1300-1347` · `dsh-session-stats/lib/index.js:66-172`） |
| `openStep` / `pendingCalls` 在**持久行内** | 二者不在 wire 视图内（`:159-171`），但持久的是**状态** ⇒ 落盘 `val` 含二者（活样本实测：`openStep: null` / `pendingCalls: {}`；置位与清空点见注 W2） | 亲读活样本同行 + `dsh-session-stats/lib/index.js:159-171`（wire 视图不含二者） |
| **可观测信号（四条）** | ① 回合在途（`openTurnStartSeq !== null`）；② 生成中（`openStep !== null`）；③ 工具执行中（`pendingCalls` 键数 > 0）；④ 回合结束（`turn/end` 是**强制落盘点**） | 同上一行；写盘点 `dsh-session-projection-cache/lib/index.js:290-317`（`:292-294` = `turn/end` 强制 flush） |
| **不可观测信号（本批的决定性事实）** | ① 等待批准与「工具在跑」**不可区分**；② 回合成败**不可得**；③ 样本 `result` 档是**亚秒窗口**，5 s 采样下基本不可观测 | 逐条证据行 = 本节表后**注 W3** |
| 写入节流（时延上界） | 强制写入点 = 会话创建 / **`turn/end`** / 会话销毁；其余按 `writeEveryEvents: 200` 或 `writeIntervalMs: 5000` 节流 ⇒ 派生状态**最多滞后 ≈5 s** | 出货组合 `dsh-bundle/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml:162-166`；写盘点 `dsh-session-projection-cache/lib/index.js:290-317` |
| 会话日志（备选读面，**本批否决**） | `<dshHome>/sessions/<项目段>/<会话段>/session.v3.jsonl.zstd`（zstd 压缩帧）；本仓运行时 = Electron 33（**Node 20.x，`node:zlib` 无 zstd**）⇒ 解析需新依赖 | 本机实测 `~/.dsh/sessions/**` 仅该一档；`package.json:29`（`electron ^33.2.0`）；同源否决先例 = B09 设计（`docs/design/SHELL-UX.md` §2.5 DD-30 的备选列） |
| 既有读面先例（**只复用口径，不 require**） | `shell-notify.js:34-43`（常量）/ `:104-158`（目录段 + 「mtime 最大记录」谓词 + `ver` 守卫 + 降级诊断行）· `shell-affinity.js:93` / `:111`（`*.json` 枚举口径；`.json.bak.<stamp>` 天然排除） | 亲读两档 |
| 状态面落点实测（**换行符口径**） | `shell-pet.js` **426** · `pet.js` **211** · `pet-chain.js` **240** · `pet-chain-core.js` **198** · `pet-preload.js` **17** · `shell-settings.js` **60** · `shell-tray.js` **175** · `pool.json` **71**（引用 **91** 段 / 未引用 **15** 段） | 本批脚本逐档实测 |
| 池机制无需改代码 | `pet-chain.js:130-134` 的 `pool.events[s]` 是**泛型映射**——新增档位只需池内多一个键，链逻辑与 V1–V6 谓词**零改动** | 亲读 `pet-chain.js:115-135` · `pet-chain-core.js:106-177` |
| PNG 通道的门 | `pet.js:32-36` 的 `setState` 以 `FRAMES[s]` 为门：未知档位**静默丢弃**，且丢弃发生在链上报（`notifySlot`）**之前** | 亲读 `pet.js:32-41` |
| 既有档位被谁改写（重断言的动机） | 走动段末 / 点击 1.6 s 定时 / 喂食 2 s 定时 / 随机小动作 2.4 s 定时均会写 `setPetState('idle')`；而**拖动起点只复位 `walk-*` / `run-*`**（不动其他档） | `shell-pet.js:240-266` · `:111-119` · `:364-376` · `shell-affinity.js:335-337` · `shell-pet-drag.js:146-150` |

**注 W1 —— 行字段全形（本机活样本实测，as-of 2026-09-17）**

- `rows.turnBoundary.val` = `{ openTurnStartSeq, lastStepStartSeq, lastStepBoundary: { kind, seq }, lastTurn }`；`openTurnStartSeq` 非 null ⇔ 回合在途。
- `rows.sessionStats.val` = `{ turns, steps, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens, lastTurn, openStep, pendingCalls }`（本批只用 `openStep` / `pendingCalls`）。
- **`lastTurn` 取 `turnBoundary.val.lastTurn`**：它与 `openTurnStartSeq` **同行 ⇒ 同一原子快照内自洽**；置位点 = `turn/start`（`dsh-agent-loop/lib/index.js:1320-1323`），`turn/end` 只清 `openTurnStartSeq`、**不动** `lastTurn`（同档 `:1325-1328`）。
  - 另注：`sessionStats.val.lastTurn` 的置位点是 `step/end`（回合**中**，`dsh-session-stats/lib/index.js:149`）⇒ 本批**不用**它（收尾判据见 §2.8.2 规则 5）。

**注 W2 —— `openStep` / `pendingCalls` 的置位与清空点（逐条，证据 = 单元实现）**

- `openStep`：`step/start` 置 `{turn, step, startTime, firstTokenTime: null}`；`assistant/message` 与 `step/end` 清为 null。
- `pendingCalls`：`tool/call` 置 `pendingCalls[callId] = event.time`；`tool/result` 抹除该键；`turn/end` 清空。

**注 W3 —— 三条不可观测信号的逐条证据行**

- ① 等待批准不可区分：`appendToolCall` 先于 `prepare`（`dsh-agent-loop/lib/index.js:584-588`），而审批在 `prepare` 内发起（`dsh-tools/lib/index.js:3314-3336`）⇒ 审批等待期 `pendingCalls` 已非空；`approval/asked` 只作为会话事件追加（`dsh-user-approval/lib/index.js:135-141`），不落任何持久投影行（本机 23 行逐行核对：无与审批相关的行）。
- ② 回合成败不可得：`turn/end` 的 `reason.kind` 不在任何行内——`turnOutline` 的 turn 条目只有 `{turn, seq, prompt, response}`（`dsh-session-turn-outline/lib/index.js:77-141`）；`llmRetry` 在 `step/start` 与 `turn/end` 被清空（`dsh-llm-retry/lib/index.js:93-95`）。
- ③ 样本 `result` 档不可采：该状态只存在于「`tool/result` 落盘 → 下一步 `step/start`」之间（毫秒级），而记录写入按 5 s 节流（`dsh-base/cordis.patch.yml:162-166`）⇒ 采样命中率近零。

> **结论（一句话）**：本仓能落地的档位 = **生成中 / 工具执行中 / 回合收尾** 三档；样本的「等待批准 / 回合成功 / 回合失败」三档**不是实现优先级问题，而是读面不存在**——除非另立事件源（见 §2.6.1 候选 2–4 与 §2.11 观察项 O11–O13）。

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

**计数口径注（B21；承 B19 §2.8.3 的「新增档位批次面独立成表」先例）**：上表 = B18 面落位时的 **11 档**（B19 的 `work-*` 与 B21 的 `drag` / `escape-*` 均按同一先例在批次面独立成表——§2.8.3 / §2.13.6）；本表与 §1.3.1 的 11 档词表计数保持 B18 期原义、不回写。

- **「单候选」分支的适用条件（与池数据核对，消除三方张力）**：上表「单候选 ⇒ `loop=true`」只在**池数据使某档仅 1 段**时适用；批次档 §2.5 第 7 项的交付下限要求每个 `events.*` 档 **≥ 2 段** ⇒ 本批池（`assets/pet-anim/pool.json`）各事件档均 ≥ 2 段（`sleep` = 2 段），该分支在本批**不适用**；`sleep` 的 `loop=true` 来自**持续状态**语义（上表该行），与候选数无关。
- **B21 起该分支重启**：`drag` / `escape` 两个新交互档各 1 段 ⇒ 单候选 ⇒ `loop=true`（§2.13.6 / §2.13.8 降级路径；与 R1 同源）——B21 档位在批次面独立成表（§2.13.6）。**B27 修订**：escape 例外——`loop=false` 单遍（§2.14.6 / §2.14.9）；`drag` 仍 `loop=true`。
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
3. **段切换的三个触发（B21 起；B18 期 = 两个）**：(a) `once` 段 `ended`；(b) 语义档位**变化**且新档 ≠ 当前档；(c) **段末前 `PET_OVERLAP_MS` 预触发**（B21 新增，仅 `loop=false` 段；与 (a) 跑同一决策函数——权威口径 = §2.13.4）。主进程的定时器到点（`idle`）**不切断**正在播的事件段——它只把「当前情境」改回 `idle`，事件段播完后按**当时的档位**决定去处（US-17 的「播完」语义，避免 1.6 s 定时把 8 s 的段切碎）；
  **旁路注（B21）**：拖动期 `dragging` 让位守卫旁路 (b)（`setSlot` 只更新 `slot`、不换段）——该旁路的权威口径 = §2.13.6。
4. **`move` 档 = 复用既有散步**：链掷出 `move` ⇒ 渲染层发 `pet-chain-move` ⇒ 主进程在既有守卫下执行一次 `doWander()`（位移纪律 100% 不变）；**默认 `weights.move = 0`**（位移仍由既有 `scheduleWander` 的 15–35 s 节奏产生，即「两个位移源」不并存）——是否让链接管位移 = 池数据一行，见 §2.5 观察项 O10；渲染层不等回复（≤1 s 未观测到 `walk-*` / `run-*` 档则继续链，日志记 `anim move-req ack=timeout`）。

**权重余量的归属（明示契约——防按样本口径加校验）**

- 余量 = `100 − idle − turn − move − Σcategories.weight`，**全部归 `action` 分支**：`rollKind` 的三段阈值只切出 `idle` / `turn` / `move`，其余一律 `action`；`categories[].weight` 只决定**该分支内的相对分布**（绝对值不产生行为差异）；
- 因此 V4 的「≤ 100」**仅为防笔误**（各权重非负 + 合计不越界）：**不要求合计 = 100**；样本口径「分类权重合计与余量之和 = 100」（§1.3.4）**不是本仓约束**，实现不得据此加校验。

#### 2.2.5 播放器契约（`pet-chain.js`）

**状态**：`mode ∈ {png, video}`（回落链，§2.2.8）· `front ∈ {0,1}`（前台渲染位）· `gen`（自增代次）· `pending {name, loop, gen}` · `slot`（当前语义档）· `cur`（当前段名）· `prev`（上一段名，用于「避开连播」）· `facing`。

**切换序列（每次换段，逐条；实现与静态核对均按此判定；B21 起旧段 `pause()` 时点见第 4 条与 §2.13.4）**

1. `gen = ++gen`；`pending = {name, loop, gen}`；取 **back 位**元素；
2. 写 back 位：`src`（取自下发的 `pool.src` 名 → URL 映射）→ `loop` → `muted` / `playsInline` / `autoplay` → `onended = loop ? null : onEnded` → `el.load()`；
3. 等 `loadeddata`（若 `readyState ≥ 2` 则同步继续）→ **先校验 `pending.gen === gen`**（过期即丢弃）；
4. back 位 `classList.add('is-front')`；旧段 `classList.remove('is-front')` + `onended = null`；交换 `front`；`el.play().catch(…)`（失败 ⇒ 日志 `anim play-fail` + 计入失败计数）；旧段 `pause()` **推迟到淡出窗末**（B21 起；淡出窗时长 = 运行期 CSS `transition-duration`，reduce ⇒ 0 ⇒ 即刻 pause——权威口径 = §2.13.4，就绪回调内**不再** `pause()`）；
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

### 2.6 B19 方案选型对比（工作状态联动）

> 候选 ≥2 逐一列表；判据来自需求层（`docs/requirements/PET.md` US-20…US-23 / NFR-14…NFR-17）。
> **裁定状态（2026-09-18 收口）**：**U-6 已裁定 = ①**——**用户 2026-09-18 裁定 = 可观测三档**（生成 / 工具 / 收尾）；
> **U-1…U-5 = 采用推荐值**（待用户批准时一并确认）——U-1 默认关 · U-2 三档 · U-3 自写文案 · U-4 拖动 > 散步 > 交互 > 工作档 · U-5 复用口径 + 独立模块（明细 = 批次档 §2.5）。
> **六档的去向（不丢）**：样本六档的补齐走**事件桥后置批 B22**（本批不做）；本批**已预留扩展面**（§2.8.3 / O11）⇒ B22 到位后**增量补齐、不返工**。

#### 2.6.1 事件源（候选 4）

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价 / 权衡） | 结论 |
|---|---|---|---|---|
| 1 | **只读投影缓存记录**（读盘 + `fs.watch` 目录 + 1 s 兜底 tick） | ① 零新依赖（`node:fs`）；② 不改 Harness（纯只读）；③ 形态可守卫（`ver` + 字段）；④ 时延上界已知（写节流 5 s）；⑤ 有 B09 / B10 先例 | 代价：档位集合受读面能力限制（等待批准 / 成败不可得，见 §1.3.5） | **选定**（**U-6 已裁定 2026-09-18 = ① 可观测三档**；U-5 = 采用推荐值，待用户批准时一并确认） |
| 2 | **Harness 侧事件桥**（随包 DSH 插件订阅 `session/event` 落盘 / 落本地端口） | ① 事件级保真（含 `approval/asked` 与 `turn/end reason.kind`）；② 与样本同架构 | 代价：新增一段**在 Harness 进程内运行的产品代码**（安装 / 版本兼容 / 卸载 / 崩溃影响面）+ 写 profile 配置 + 需重启后端；**属新面、跨批次** | 否决（本批）；**去向 = 事件桥后置批 B22**（观察项 O11） |
| 3 | 会话日志解析（`session.v3.jsonl.zstd`） | 事件级保真（全量事件） | 需 zstd 解码：本仓 Node 20 无 `node:zlib` zstd ⇒ **新依赖**（与零新依赖硬冲突）；长会话逐次解压开销不可接受 | 否决 |
| 4 | 订阅后端 HTTP / 事件流接口 | 事件级保真 | 需新协议客户端（typert / WebSocket 帧）+ 鉴权（token 轮换）+ 未审 API（随版本漂移）；与「不改 Harness / 零新依赖」双冲突 | 否决 |

#### 2.6.2 档位集合（候选 4；对应 U-2 与 U-6 —— **已裁定 2026-09-18：用户裁定 = 可观测三档（①）**）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| A | 样本六档（thinking / working / result / waiting / success / error） | 覆盖完整，与样本逐档对应 | waiting / success / error **读面不存在** ⇒ 不可实现；result 亚秒窗口不可采 | 否决（**两条理由**）：① **读面不可观测**（waiting / success / error 无对应行、result 为亚秒窗口；证据 = §1.3.5）；② **用户已裁定本批走三档 + 六档另批**（2026-09-18；六档 = 事件桥后置批 B22） |
| B | 两态（忙碌 / 空闲） | 实现最简 | 白白丢掉「生成中 vs 工具中」这一**可得**区分；已备素材沉没 | 否决 |
| C | **可观测三档：`work-thinking` / `work-working` / `work-done`** | 四条可观测信号各有所指（生成 = `openStep`、工具 = `pendingCalls`、收尾 = `turn/end` 强制落盘点） | 代价：不区分回合成败、无等待档（明示为**已知缺口**，观察项 O11–O13） | **选定**（**用户 2026-09-18 裁定 = ① 可观测三档**；U-2 随之定 = 三档） |
| D | 三档 + 试采样本 `result` 边沿（`pendingCalls` 非空 → 空） | 多一段素材被用上 | 亚秒窗口 + 5 s 节流 ⇒ 命中率极低（事实上的死档）且判据不可复现 | 否决 |

#### 2.6.3 池段形态（候选 3）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **`events` 下按语义档位名新增键**（`events["work-thinking"]` 等；值 = slot） | ① 链零改动（`pool.events[s]` 泛型映射）；② 键 = 语义档位名（承 DD-5）；③ V1–V6 与 `POOL_KEYS` 零改（`events` 本就自由键对象；V5 包住 slot 非空、V2 包住文件存在） | 代价：与样本的「索引数组」形态不同（样本可读性靠注释） | **选定** |
| 2 | 照搬样本 `events.workStatus = [ …按索引 ]` | 与样本逐字同形 | ① 与本仓 `slot` 语义**冲突**（数组 = 候选 vs 样本数组 = 档位）；② 需链侧新增「索引档位」概念 ⇒ 违反「链规则零改」 | 否决 |
| 3 | 顶层新段 `workStatus: { … }` | 段名自明 | 需扩 `POOL_KEYS`（V1 结构键）+ 新校验面 + `startSlot` 分支 ⇒ 碰 V1–V6 与链 | 否决 |

#### 2.6.4 判定门复用度（候选 3；对应 U-5）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **复用读面口径 + 独立轻量派生模块**（目录段常量同字面 / 「mtime 最大记录」谓词同口径 / `ver` 守卫同法），**不 require `shell-notify.js`** | ① 满足「只增不改」与「不改 B09 判定门」；② 依赖方向零新增（新模块零同层 require） | 代价：同族读面谓词重复（登记 O16，建议行给主 agent） | **选定** |
| 2 | 直接复用 `completionGate()` 的四态 | 一套实现 | 四态只有 `open` / `done` / `stale` / `unavailable`，**不含** `openStep` / `pendingCalls` ⇒ 派生不出「生成 vs 工具」；且会把通知域的降级语义带进显示域 | 否决 |
| 3 | 新建独立读面（另一数据源） | — | 同 §2.6.1 候选 2–4（否决理由同） | 否决 |

#### 2.6.5 开关面（候选 2）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **托盘「设置」子菜单 checkbox + `settings.json` 顶层布尔键** | 与既有 `notifyOnComplete` 同形（`shell-tray.js:76-78`）；用户可及；零新控件类型 | 代价：多一次托盘菜单重建 | **选定** |
| 2 | 只留 `settings.json` 键（无 UI） | 实现最简 | 普通用户不可及（要手改 JSON）⇒ 不满足 US-23 | 否决 |

#### 2.6.6 气泡文案面（候选 2；对应 U-3）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **本仓自写**（常量表，每档 2–3 句） | ① 与既有 `PET_QUOTES` 语气一致（`shell-pet.js:76-102`）；② 无样本文案的许可牵连（NFR-12 禁商用面不扩大） | 代价：改文案 = 改代码 + 发版（本批无「用户改文案」需求，同 B18 DD-2 的窄化口径） | **选定** |
| 2 | 照搬样本文案（`samples/dsh-pet/dsh-pet/assets/config.jsonc:71-78`） | 零写作成本 | 样本含网络梗 / 毒舌向，语气与本仓不一致；且文案源自样本 ⇒ 受禁商用约束（NFR-12 面扩大） | 否决 |

### 2.7 B19 架构与分层

```
主进程                               渲染进程（pet.html 内三档脚本）
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ shell-pet-work.js（B19 新建，I/O）│   │ pet.js：setState(s) →           │
│  ① fs.watch + 1 s tick           │   │   notifySlot(s)（链上报先行）     │
│  ② 读记录 → pet-work-core 派生   │   │   FRAMES[s] 无帧 ⇒ 渲染待机帧     │
│  ③ 档位变化 → 下发 / 重断言      │   │ pet-chain.js：（零改动）          │
│  ④ 开关 / 降级 / 日志            │   │   startSlot(s) → pool.events[s]  │
│      ↓ 注入面（组合根 main.js）  │   │   → 双缓冲切换 / 档内轮换          │
│  pet.setPetState / pet.petSay    │──▶│                                  │
│  pet.getPetState / pet.wakePet   │   │  档位经既有 `pet-state` 通道下行    │
│  pet.logAnim / pet.getPetWindow  │   │                                  │
│  drag.getPetDrag / settings.get  │   │                                  │
│  backend.dshHome                 │   │                                  │
│ pet-work-core.js（B19 新建，纯）   │   └──────────────────────────────────┘
│  记录选取 / 形态守卫 / 档位派生    │
│  / 陈旧守卫 / 气泡节流（零 I/O）  │
└──────────────────────────────────┘
```

- **主进程 = 情境权威**（承本档 §2.2.1）：工作档位仍由主进程的 `setPetState` 下发，渲染层只按档位查池段——**本批不新增 IPC 通道**（复用 `pet-state`），`pet-preload.js` 零改动；
- **`pet-work-core.js`（纯）**：零 fs / 零 IPC / 零 electron require，双环境导出尾巴（承 DD-14）⇒ 可被桩测直接装载真实实现；
- **`shell-pet-work.js`（I/O）**：只依赖 `node:fs` / `node:path` + 注入面；不 require `shell-notify.js` / `shell-affinity.js`（不变量面）；
- **依赖方向**：`shell-pet.js` **不** require `shell-pet-work.js`（反注入）——背底档经 `setBaseStateProvider(fn)` 由工作模块注入，与组合根 `init(deps)` 惯例同源（`docs/CONVENTIONS.md` §四）；
- **注入面（组合根 `main.js` 接线；修正轮 1 #5 补全，共 9 项）**：`pet.setPetState` · **`pet.getPetState`** · `pet.petSay` · `pet.wakePet` · `pet.logAnim` · `pet.getPetWindow` · `drag.getPetDrag` · `settings.get` · `backend.dshHome`（`dshHome`）。
  - `pet.getPetState` = §2.8.4 的「渲染层实际档位」读取面；它**已是既有导出**（`shell-pet.js:387` / `:404`）⇒ 本批**零新增导出**，只需在组合根接入注入面。
- **开关的传播面（修正轮 1 #6；逐条）**：
  - ① **写权** = 托盘（与 `notifyOnComplete` 同形：改 `settings.get().petWorkStatus` 再 `settings.saveSettings()`，`shell-tray.js:105-109`）；
  - ② **传播** = checkbox 的 click 调注入面 `setPetWorkStatus(checked)`——接线在组合根：`main.js:84` 的 `tray.init({ setQuitting, APP_NAME })` 增一项 `setPetWorkStatus: work.setEnabled`；
  - ③ **启动态** = `work.init(deps)` 内部按 `deps.settings.get().petWorkStatus` 决定是否启用（启动与运行期同一判据 ⇒ 无双源）；
  - ④ **单向** = 工作模块不写 settings、不回调托盘；`shell-tray.js` **不** require `shell-pet-work.js`（同既有 `init(deps)` 惯例，`main.js:73-84`）；
- **与 B09 取不同形态的理由（修正轮 1 #6）**：B09 的 watcher 与 5 s 定时器**常驻**、开关只在回调内判（`shell-notify.js:246-247` 的 `if (!settings.get().notifyOnComplete) return;` + `:262-264` 的清零分支）。
  - 本批**不沿用**：① tick = 1 s 且**每 tick 有 I/O**（目录枚举 + `stat`）⇒ 空转非零成本，与 NFR-14 的 < 1 % 判据相抵；② US-23 与 NFR-14 的字面要求是「关 ⇒ **读面不启动**（零日志、零监听）」——常驻形态不满足该字面。
  - **代价** = 需一条显式启停路径（`setEnabled`），由组合根的注入面承担（上一条 ②），依赖方向零新增；
  - **附：`pet.getPetState` 的实况（#5 核验）**：该访问器**已在** `shell-pet.js:387`（`return petState`）并已在 `:404` 导出 ⇒ 本批零新增导出，`shell-pet.js` 的改动点与行数预算**不变**（§2.9 同记）。
- **生命周期**：工作模块的 tick 自带「无桌宠窗口则空转」判据（读 `pet.getPetWindow()`），不依赖建窗 / 销毁钩子——专注模式切换（销毁 / 重建窗口）无需增接线。

### 2.8 B19 契约

#### 2.8.1 读面与记录选取

- **目录**：`<dshHome>/storages/session_projcache/sessions/`（段常量与 B09 同字面：`['storages','session_projcache','sessions']`；本模块**自带**常量）；
- **候选集**：目录内 `*.json`（不递归、无 `**`；`.json.bak.<stamp>` 天然排除）；逐档 `stat` 取 mtime；**mtime 与本模块缓存的上一值相同 ⇒ 跳过解析**（复用上次解析结果）；
- **I/O 形态（修正轮 1 #13）**：tick 内全程 **`fs.promises`**（`readdir` / `stat` / `readFile`）——**零同步 I/O**（承 B09 先例：`shell-notify.js:113` 的「全程 fs.promises（调用处无同步 I/O）」+ 其实现逐处 `await fs.promises.*`）。
  - **单次 tick 的 `stat` 次数上界 = 目录内 `*.json` 记录档数**（不递归、不遍历会话日志树）；mtime 未变者**不** `readFile`、**不** `JSON.parse`；
- **字段白名单（隐私面；修正轮 1 #9）**：消费面 = `rows.turnBoundary.val` 的 `openTurnStartSeq` / `lastTurn` · `rows.sessionStats.val` 的 `openStep` / `pendingCalls` · 记录文件名——**零字段取自内容行**（`turnOutline` 的 `prompt` / `response` 等一律不取、不落盘、不发送）。
  - **如实登记**：整档 `JSON.parse` 必然把内容字段读入进程内存（= 读取事实，非使用）；NFR-15 口径 = 「**不使用 / 不落盘 / 不发送**内容字段」，机检判据 = AC19 字段白名单核对；
- **选取排序（确定性，逐级）**：① 回合在途者优先；② `turnBoundary.val.lastTurn` 大者；③ 记录 mtime 新者；④ 文件名升序 ⇒ 取第一。全无候选 ⇒ `unavailable`；
- **形态守卫**：`rows.turnBoundary.ver === 2` ∧ `val` 为对象 ∧ `openTurnStartSeq` 为 null 或整数；`rows.sessionStats.ver === 1` ∧ `val` 为对象 ∧ `openStep` **字段在场** ∧ `pendingCalls` 为对象 ⇒ 否则 `unavailable`（降级处理见 §2.8.7）；
- **陈旧守卫**：`now − mtime(选中记录) > WORK_STALE_MS`（**60000**）∧ 回合在途 ⇒ 按「无在途回合」处理（避免后端被强杀后宠永远停在忙碌档）+ 诊断行（每记录至多一条）。

#### 2.8.2 信号 → 档位派生（纯函数 `deriveGear(signals, prev)`，逐条判据）

| 序 | 条件 | 输出档位 |
|---|---|---|
| 1 | 读面 `unavailable` / 无候选记录 | **清档**（回 idle） |
| 2 | 回合在途 ∧ `pendingCalls` 键数 > 0 | `work-working` |
| 3 | 回合在途 ∧ `pendingCalls` 空 ∧ `openStep !== null` | `work-thinking` |
| 4 | 回合在途 ∧ `pendingCalls` 空 ∧ `openStep === null` | **保持上一档**（中间态：step 边界瞬间，不抖动） |
| 5 | 无在途回合 ∧ 记录新鲜（`now − mtime ≤ WORK_STALE_MS`）∧ `turnBoundary.val.lastTurn > doneBaseline` | `work-done`（触发即置 `doneBaseline = lastTurn` ∧ `doneUntil = now + WORK_DONE_HOLD_MS`） |
| 6 | 未命中 5 ∧ `prev.gear === 'work-done'` ∧ `now < doneUntil` | `work-done`（**收尾保持期**内不落保持条 / 清档——陈旧记录的收尾档仍保 3 s） |
| **7** | **保持条（B26 / 修正轮 1 新增）**：未命中 2–6 ∧ `signals.fresh === true` | **维持上一档位**（`out.gear = prev.gear`；`prev.gear === null` ⇒ 仍为 `null`）——**「上一档位」含 `work-done`** |
| **8** | 其余（**记录陈旧**：`signals.fresh === false`） | **清档**（回 idle） |

- **次序声明**：判定自上而下短路；规则 2 先于 3——工具在跑时 `openStep` 通常已清空，但并行调用窗口内二者可同时在场 ⇒ **工具优先**（「在干活」比「在思考」更准）；
- **常量（`pet-work-core.js`，可被桩测逐值断言）**：`WORK_TICK_MS = 1000` · `WORK_STALE_MS = 60000` · `WORK_DONE_HOLD_MS = 3000` · `WORK_BUBBLE_MIN_GAP_MS = 30000`（**按档**间隔，§2.8.5）· **`WORK_BUBBLE_GLOBAL_GAP_MS = 10000`**（**跨档全局下限**，B26 / 修正轮 1 新增）——`WORK_DONE_WINDOW_MS` 随规则 5 改写**删除**（不再有消费者，死常量不留）；
- **规则 5 的信号与基线（修正轮 1 #4；持久信号取代进程内记忆）**：`lastTurn` 取 **`turnBoundary.val.lastTurn`**（与 `openTurnStartSeq` **同行 ⇒ 同一原子快照内自洽**；置位 / 清空点见 §1.3.5 注 W1）；`doneBaseline` = 工作模块内部基线（初值 `null`）：
  - **建立**：`doneBaseline === null` 时，首个「无在途回合 ∧ 记录新鲜」的观测 ⇒ `doneBaseline = lastTurn`，**不**触发收尾档（避免开机对历史回合补演一次）；
  - **更新**：每次触发收尾档即置 `doneBaseline = lastTurn`；基线只在「无在途回合」的观测上建立 / 更新（在途期不动）；
  - **重置**：选取记录切换（§2.8.1 四段排序选中另一档）或开关关闭再打开 ⇒ `doneBaseline = null`（按上一条重建）；
  - **为什么用持久信号**：写盘按 5 s / 200 事件节流（§1.3.5）⇒ **短回合**（< 5 s 且 < 200 事件）不产生任何中间落盘——旧写法（依赖进程内「上一观测为在途」）在该情形下**连收尾档都不出现**（整个回合零档位）；改用 `lastTurn` 后，回合结束的落盘点（`turn/end` 强制 flush）带来的 `lastTurn` 增量**必然可观测** ⇒ 收尾档对短回合同样生效；
  - **残余缺口（如实登记）**：短回合的**生成 / 工具**两档仍不可观测（读面无任何中间落盘）——见 §3.6 限制 1；
- **收尾保持期（3 s）与陈旧面的分工**：① 保持期 = 触发后 `WORK_DONE_HOLD_MS`（3000）内不落保持条 / 清档（规则 6）——期内回合重新在途 ⇒ 立即退出保持、转规则 2 / 3；期满 ⇒ 落规则 7（新鲜 ⇒ 保持条）或规则 8（陈旧 ⇒ 清档）；② 陈旧守卫（§2.8.1：回合在途 ∧ mtime 超 60 s ⇒ 按无在途回合处理）与规则 5 的「记录新鲜」条件合读 ⇒ **陈旧记录不进收尾档**、直接落规则 8 清档（= TC-31 的期望）；
- **保持条（B26 / 修正轮 1；界 / 语义 / 残余的权威句 = §2.12.3）**：
  - ① **界** = `signals.fresh`（选中记录存在 ∧ `now − mtime ≤ WORK_STALE_MS`）——**复用既有信号，零新增常量**；
  - ② **语义** = 「读面判定无工作档」的 tick **不落 idle**，而是维持上一档位 ⇒ 让位窗口由「档位在途」拓到「**记录新鲜期**」（含回合间隙 / 收尾清档间隙 / 回合起始 ≤5 s 延迟）；
  - ③ **残余** = 无选中记录 / 首个档位出现前（`prev.gear === null`）/ 记录陈旧（逐条见 §2.12.3）；
  - ④ **基线建分支**（首个「无在途 ∧ 新鲜」观测）建基线后同样走保持条 ⇒ 启动时 `prev.gear === null` ⇒ 与今天同形（不产生档位）；
- **收尾档的可见时长（B26 连带；观感取舍登记 = O19 改写）**：记录新鲜期内保持条继续维持 `work-done` ⇒ `WORK_DONE_HOLD_MS`（3 s）**不再是可见时长上界**（上界 = 记录陈旧 ≤60 s 或至下一档到来）；该常量的**残余作用** = 「紧接收尾档后记录立刻转陈旧」时保证 ≥3 s 可见；
- **不可区分项（明示，不隐瞒）**：「等待批准」在本读面下**就是** `work-working`（依据 §1.3.5 第 6 行）；「回合结束」不区分 completed / error / max-tokens——收尾档仅表「这一轮收摊了」，**不表成败**。

#### 2.8.3 池段与档位词表（仅新增三个档位名 + 三个池键）

| 档位（`pet-state` 取值） | 池键 | B19 首批池数据（`assets/pet-anim/pool.json`） | `loop` |
|---|---|---|---|
| `work-thinking` | `events["work-thinking"]` | `["工作状态-思考冒泡", "深度思考碎碎念"]` | 多候选 `false`（段末档内轮换）；单候选 `true`（承 B18 §2.2.3 规则） |
| `work-working` | `events["work-working"]` | `["工作状态-忙碌点按", "写代码"]` | 同上 |
| `work-done` | `events["work-done"]` | `["工作状态-清点归档"]` | 单候选 ⇒ `true`（3 s 保持期内不重载、不闪断） |

- **零改动声明（机检）**：`POOL_KEYS` 与 `validatePool` 的 V1–V6 谓词逐字不改；`pet-chain.js` 逐字不改（`startSlot` 的 `pool.events[s]` 泛型映射已覆盖新档位：`pet-chain.js:115-135`）；
- **仍不引用的素材（如实登记）**：`工作状态-雀跃庆祝` / `工作状态-垂头叹气冒汗`（属 success / error 档，本读面不可得）；`余额-*` 6 段 / `碎碎念-*` 3 段 / `被鼠标拖拽悬空反馈` 1 段 = D2 / 尾面带；本批**不动**（引用段数 91 → **94**，未引用 15 → **12**）；
- **池数据扩展性声明（本批已预留的扩展面）**：六档的补齐 = **事件桥后置批 B22**（用户 2026-09-18 裁定；见 §2.11 观察项 O11）。B22 到位后只需两处增量：
  ① **加档位名 + 加池键**（`events` 为自由键对象，可再增 3 键：示例 `work-waiting` / `work-success` / `work-error`，最终以 B22 设计为准）；
  ② **判定门扩档**（`deriveGear` 的规则表按新事件源的信号增行）。
  本档描述的机制（读面 → 派生 → 档位 → 池键）**零改动** ⇒ **增量补齐、不返工**；对应素材（`工作状态-雀跃庆祝` / `工作状态-垂头叹气冒汗`）**已在仓未引用**（O17），B22 只需加池引用。

#### 2.8.4 播放、优先级与重断言

**优先级（高 → 低）**：拖动跟手 > 散步 / 跑步（位移段）> 交互档（`happy` / `eat` / `read` / `starry` / `scared`）> **工作档（背底档）**。

| 事件 | 行为（逐条） |
|---|---|
| 进工作档（**下发条命中时**） | 先 `pet.wakePet()`（清入睡定时器并重排）→ 再 `setPetState(<档>)`；**共同门未放行（拖动 / 散步·跑步 / 交互档在途）⇒ 本 tick 两者都不执行**（让位，见下方「共同门」） |
| 出工作档（回 idle） | `setPetState('idle')` → `pet.wakePet()`（重排入睡计时；避免入睡定时器在工作档期间已耗掉） |
| 交互档覆盖 | 既有触发点与定时器**逐字不改**（点击 1.6 s / 喂食 2 s / 小动作 2.4 s 回 idle）——回到 idle 后由**重断言**（下行）在 ≤1 s 内恢复工作档 |
| 拖动 | 拖动起点只复位 `walk-*` / `run-*`（`shell-pet-drag.js:146-150`），**不动工作档**；拖动期间不启动重断言（拖动优先） |
| 散步 / 入睡的让位 | `scheduleWander` 的起步判据加一道门：`petState === 'idle' && petBaseState() === 'idle'` 才起步（`shell-pet.js:260-266`，**+1 条件**）；入睡不需要新门（既有 `if (petState === 'idle') setPetState('sleep')` 已覆盖） |
| 段切换 | 沿用 B18 §2.2.4 规则 2 / 3（**同档忽略**、事件段**播完才回链**）；「不硬切」与「收尾档保持 3 s」的分工 = 下方**注 C** |
| PNG 通道 | `pet.js` 的未知档位分支 ⇒ 渲染待机帧（§2.8.7 第 3 行）——**不改** 11 档语义与帧口径 |

**注 D —— 自主触发的让位（B26 / F1 / US-21；修正轮 1 改向）**

- 优先级表与共同门的**口径逐字不变**；B26 的机制分两层（契约与效力边界 = **§2.12**）：
  ① **档位保持（主）**——`deriveGear` 的**保持条**（§2.8.2 规则 7）：记录新鲜期内不清档 ⇒ `petState` 恒为档位 ⇒ 自主动作被**既有**「仅 `idle` 才起步」守卫挡住（`playIdleVariant` 的 `petState !== 'idle'` · `scheduleWander` 的起步门 · `scheduleSleep` 与 `schedulePetChatter` 的 idle 守卫）——**不新增门即达成目标**；
  ② **补漏起步门（1 行）**——`playIdleVariant()` 首行守卫加 `petBaseState() === 'idle'`，覆盖「档位保持仍在而 `petState` 已回 `idle`、重断言被推迟」的窗口（逐条 = §2.12.3）。
- 分工：本注（与 §2.12）管「**新的**自主动作是否起步」；共同门管「本 tick 是否下发 / 重断言」（对**已在途**的交互档让位）——两者互补、不重叠；契约与效力边界 = **§2.12**。

**重断言（背底档保持器；判据句——修正轮 1 #3 改写：术语定义 + 共同门 + 两条互斥条款）**

**术语（本档内的唯一权威定义）**：

- **记忆档位 `lastGear`** = 工作模块内部保存的「最近一次**实际下发**的档位」（值域 = 三档 + `null` = 清档；初值 `null`）——它是本模块的**下发记录**，**不是**对渲染层的观测；
- **当前派生档位 `gear`** = 本 tick `deriveGear(signals, prev)` 的输出（§2.8.2 规则表；值域同上）；
- **渲染层实际档位 `state`** = `pet.getPetState()` 的当前值。

**共同门（对「下发」生效；修正轮 1 #3 ② 的收口）**

- `drag.getPetDrag() !== null`（拖动在途）**∨** `state ∈ {walk-left, walk-right, run-left, run-right}`（散步 / 跑步在途）**∨** `state ∈ {happy, eat, read, starry, scared}`（交互档在途）⇒ 本 tick **让位**：不下发、不写日志行、**不**更新 `lastGear`（下一 tick 重评）；让位结束后的首个 tick 恢复下发。
- **排除面既对「保持」、也对「进入」生效**——两条条款共用这一道门（= 优先级表「拖动 > 散步 > 交互档 > 工作档」的直译）。

条款（每 tick 自上而下；两条互斥）：

1. **下发条**：`gear ≠ lastGear` ∧ 共同门放行 ⇒ `setPetState(gear ?? 'idle')` + 写 `work gear` 行（`from = lastGear ?? '-'`、`to = gear ?? 'idle'`）+ `lastGear = gear`；
2. **重断言条**：`gear ≠ null` ∧ `gear === lastGear` ∧ 共同门放行 ⇒ 重发一次 `setPetState(gear)` + 写 `work reassert` 行（**不**改 `lastGear`）。

**保持条与两条条款的关系（B26 / 修正轮 1）**：保持条只在**派生面**（`deriveGear`）产生「不清档」；两条条款逐字不变——保持期内 `gear === lastGear`（非 `null`）⇒ 每 tick 走**重断言条**（不写新 `work gear` 行）；保持结束（记录陈旧 ⇒ `gear = null ≠ lastGear`）⇒ 走**下发条**，写 `work gear … to=idle`；让位在途时两条都不执行（上方共同门）。

- **让位期的时延口径（如实登记）**：让位在途时下发推后至让位结束后的首个 tick（让位时长上界 = 散步单段 ≤ 段长 / 交互档 ≤ 2.4 s 定时器）⇒ §3.4 AC18 的 ≤ 6 s 时延上界**以无让位场景取证**（正常空闲下开会话）；这是「工作档 = 底色」优先级的既定代价，不是遗漏；
- 代价与理由：链的「同档忽略」规则（B18 §2.2.4 规则 2）使重发**幂等**（不重启当前段）；本机制使**不需**逐处修改既有定时器回落点（含 `shell-affinity.js` 与 B03 已校准的散步段），**也不碰冻结面**；
- **背底档提供者**：`shell-pet.js` 新增 `setBaseStateProvider(fn)` + `petBaseState()`（返回 `fn() ?? 'idle'`）；**`fn` 返回值语义（修正轮 2 点名）** = 工作模块下发的**当前档位**。
  即记忆档位 `lastGear`（最近一次**实际下发**的档位；**保持态含在内**；清档 ⇒ `null`；实现 = `shell-pet-work.js:262`）——**不是**本 tick 的派生档位（`deriveGear` 输出）；消费点 = 散步起步门（B19）+ **补漏起步门**（B26 / §2.12.2）；不改变任何既有状态语义。

**注 C —— 段切换：「不硬切」与「收尾档保持 3 s」的分工（修正轮 1 #12 消歧）**

- **多候选工作档**（`work-thinking` / `work-working`，`loop=false`）：档位回 `idle` 时**不硬切**——链的 idle 守卫（`pet-chain.js:99`）只保护**非 loop** 的事件段 ⇒ 这些档**段播完才回链**；
- **单候选收尾档**（`work-done`；单候选 ⇒ `loop=true`，`pet-chain.js:133-134`）：**不受该守卫保护**；**B26 / 修正轮 1 起**：档位由**保持条**继续维持（§2.8.2 规则 7）⇒ 3 s 到点**不切**（段按 `loop=true` 续播），直到记录陈旧（≤60 s）或下一档到来才退场；`WORK_DONE_HOLD_MS` 的残余作用 = 「紧接收尾档后记录立刻转陈旧」时保证 ≥3 s 可见；观感取舍登记 = §2.11 观察项 O19（改写）；
- **两条合读不矛盾**：「不硬切」保的是**多候选事件段的播完**，「保持 3 s」是**收尾档的档位保持时长**（档位面）——约束对象不同。

#### 2.8.5 气泡面

- **文案表**（`pet-work-core.js` 常量，本仓自写；每档 2–3 句等概率抽 1）：
  - `work-thinking`：「正在想下一步呢…」「让我整理一下思路~」
  - `work-working`：「正在处理这一步…」「手上还有活儿在跑哦~」
  - `work-done`：**不弹**（避开与既有「任务完成啦！」提醒撞车；依据 = `shell-notify.js:174-180`）
- **通道**：既有 `pet.petSay(msg)`（`shell-pet.js:104-108`）⇒ 与台词 / 完成提醒共用同一气泡元素（后到者覆盖，4 s 自动隐藏，`pet.js:145-149`）；
- **节流（判据句；B26 / 修正轮 1 修正）**：三条件**全满足**才弹——① **同档一次**：同一档位在一次连续停留内至多 1 条；② **同档间隔**：同一档位两条气泡间隔 ≥ `WORK_BUBBLE_MIN_GAP_MS`（**30000**）；③ **跨档全局下限**：任意两条工作气泡（跨档）间隔 ≥ `WORK_BUBBLE_GLOBAL_GAP_MS`（**10000**）——防三档连弹。不满足 ⇒ 本次不弹但**不影响档位切换**；
- **状态形状（契约；`shell-pet-work.js` 持有）**：`{ gear, shown, lastAtByGear: { [档位]: 时刻 }, lastAtAll: 时刻 }`——原**单值** `lastAt`（跨档全局）拆为「**按档** + **全局**」两面；`resetRuntime()` / `clearGear()` 的初值同形（全零）；
- **修正成因与量化（源 = §2.11 O21；裁定 = 2026-09-18 主 agent 代裁）**：原 `lastAt` 跨档共享 ⇒ 生成档进入必弹、短工具调用被同一窗口压掉（思考 20 s / 工具 5 s 交替 ⇒ 工具档 0 条）⇒「工具在跑」结构上不可见。改按档 + 全局下限后：**最坏 = 30 s 内 2 条**（两档各 1 条、间隔 ≥10 s）；
- **边界**：开关关闭 ⇒ 不弹；读面不可用 ⇒ 不弹；文案不含任何会话内容（NFR-15）；**闲聊台词不纳入本节的节流**（两套计数器分离，§2.11 O21 ⑦）。

#### 2.8.6 开关与默认值

- **开关**：`settings.json` 顶层布尔键 `petWorkStatus`（`shell-settings.js:15-24` 的 `DEFAULT_SETTINGS` 新增一行）+ 托盘「设置 ▸」子菜单 checkbox（与 `notifyOnComplete` 同形，`shell-tray.js:74-87`）；
- **默认值（U-1 = 采用推荐值 = `false` = 默认关；待用户批准时一并确认）**：本档按**推荐 = `false`（默认关）**成文（依据：样本 `workStatusEnabled` 注释明写默认关 + 批次档 §1.4-5「默认行为保守」）；批准时改判为「默认开」⇒ 改动面 = `DEFAULT_SETTINGS` 一行 + 本档一行；
- **开关语义（逐条）**：关 ⇒ **停读面**（不建 `fs.watch`、不跑 tick、零日志）+ 清档回 idle；开 ⇒ 立即读一次并进入 1 s tick（不需重启）；运行期切换即生效。

#### 2.8.7 失败安全与降级（逐行）

| # | 触发 | 行为 | 机检 |
|---|---|---|---|
| 1 | 读面 `unavailable`（目录不存在 / 无可解析记录 / `ver` 守卫不过 / 字段缺） | **该 tick 不产生工作档**（清档回 idle）；**逐轮可恢复**——tick 与 `fs.watch` 不停，下一 tick 重评（目录 / 记录出现后自动恢复，无需用户重开开关）；诊断行 `work diag reason=<v>`（每监视器生命周期至多一条，承 B09 封口写法） | 日志 + 画面与今天一致 |
| 2 | 选中记录陈旧（回合在途 ∧ mtime 超 60 s） | 按「无在途回合」处理（清档）+ 诊断行（每记录至多一条） | 日志 |
| 3 | PNG 通道（池不可用 / 级② / 级③ 回落） | 工作档**照发**；渲染层对未知档位渲染**待机帧**（`pet.js` 的 `setState` 空档分支）——不空白、不报错 | `anim pool ok=0` + 画面与今天一致 |
| 4 | 读面异常（单档 `stat` / `readFile` / `JSON.parse` 抛错） | `try/catch` 吞掉并跳过该档（不影响其他记录与既有功能），下一 tick 重试 | 无未捕获异常 |

> **「停用」的封存语义（修正轮 1 #8）**：`unavailable` = **逐轮可恢复**（**非锁存**）——
> ① **档位面**：每个 `unavailable` 的 tick 一律清档（不进任何工作档），下一 tick 重新求值 ⇒ 「进程先起、会话目录后出现 / 目录为空 / 单档解析失败」这类时序**自动恢复**；
> ② **诊断面**：`work diag` 每监视器生命周期至多一条——**封的是日志行，不是功能**（不重复刷行 ≠ 不再检测）；
> ③ **真正的锁存面只有一处 = 开关关闭**（US-23：关 ⇒ 停读面，须用户重开）——两者语义分列，不混用。
>
> **对 NFR-17「整体停用（等价于开关关闭）」的读法（本设计取「效果等价」）**：该条的硬要求 = **fail-closed**（形态不符 / 读面不可用 ⇒ 不误报）与**可见性**（一条诊断行），本设计逐条满足（形态守卫 ⇒ `unavailable` ⇒ **绝不映射为任意工作档**，判据 = §3.6 手段 1 的桩测 ③）。
> 「等价于开关关闭」按**用户可见效果**读（桌宠行为与开关关着时逐位一致），**不**读作「停跑 tick」——否则「目录后出现」这一常见时序会让功能永久静默直至用户手动重开。
> **口径张力已登记 = §2.11 观察项 O18**（若主 agent / 用户改取「状态等价」读法，须同源改需求档 NFR-17 并补自恢复判据；本设计不自作该语义变更）。

> **选定取舍（DD-26）**：**不**把工作档的启用耦合到「池是否可用」（被否决的备选：池 ok=0 ⇒ 整体不启工作档）——那条路要新增一条跨模块依赖（工作模块读池装载结果），而第 3 行的待机帧回退已满足「不空白 / 不报错」。

#### 2.8.8 日志与诊断行（仅 `BIGFISH_PET_DEBUG=1`）

- 文件：`userData/pet-anim.log`（与 B18 同文件；经 `shell-pet.js` 新增的 `logAnim(line)` 注入，**不新建日志文件**）；行型：

| 行型 | 字段 | 用途 |
|---|---|---|
| `work scan` | `n` / `pick` / `mtime` / `cache`（`hit`/`miss`） | NFR-14（扫描面与缓存命中）· AC20 |
| `work gear` | `t` / `from` / `to` / `rec` / `turn` / `pend` / `step` | AC18（档位派生与时延）· AC20 |
| `work reassert` | `t` / `gear` / `state` | §2.8.4 重断言（AC18 / TC-24） |
| `work bubble` | `t` / `gear` / `text` | AC20（节流与开关） |
| `work diag` | `reason` | AC20（降级封口，一条 / 生命周期） |

- **零开销纪律**：debug 关闭 ⇒ 不写任何行；开关关闭 ⇒ 读面不启动（零行、零监听，`shell-pet.js:36-45` 的既有 `animDebug()` 口径复用）。

### 2.9 B19 受影响文件全清单

> 行数口径 = **换行符计数**（承本档 §2.3 口径）。「**零改动面**」单列在表后（这些文件的零 diff 是 AC19 / AC22 的机检对象）。

| 文件 | 当前行数 | 改动点 | 预计增量 | 末行数（预算） |
|---|---|---|---|---|
| `pet-work-core.js` | **新建** | 纯函数档：常量表 + 记录选取（四段排序）+ 形态 / 陈旧守卫 + `deriveGear` + 气泡节流 + 文案表 + 双环境导出尾巴 | +110 ~ +140 | ≤ 140 |
| `shell-pet-work.js` | **新建** | I/O 档：`fs.watch` + 1 s tick + 读记录 + 下发 / 重断言 + 开关接线 + 降级 + 日志 + 注入面 | +150 ~ +200 | ≤ 200 |
| `shell-pet.js` | 426 | ① `logAnim(line)` 导出（+3）② 背底档提供者 `setBaseStateProvider` / `petBaseState`（+8）③ `scheduleWander` 起步门 +1 条件（改 1 行）④ 导出 `setBaseStateProvider`（+1） | +8 ~ +14 | ≤ 440 |
| `pet.js` | 211 | `setState(s)`：`notifySlot(s)` 先行；`FRAMES[s]` 无对应帧 ⇒ `renderPng('idle')`（工作档待机帧回退；现有 11 档逐位不变） | +4 ~ +7 | ≤ 218 |
| `shell-settings.js` | 60 | `DEFAULT_SETTINGS` 新增 `petWorkStatus`（默认值 = U-1 推荐值 `false`） | +1 | 61 |
| `shell-tray.js` | 175 | 「设置」子菜单新增 checkbox + `setPetWorkStatus`（开/关联动）函数 | +8 ~ +12 | ≤ 187 |
| `main.js` | 217 | 组合根接线：require + `init(deps)`（9 项，见 §2.7 注入面）+ 启动调用 + `tray.init` 增 `setPetWorkStatus` 一项（`main.js:84` 同行） | +6 ~ +12 | ≤ 229 |
| `package.json` | 132 | `build.files` 增列 `pet-work-core.js` / `shell-pet-work.js`（`dependencies` 段零 diff） | +2 | 134 |
| `assets/pet-anim/pool.json` | 71 | `events` 新增三键（§2.8.3）；引用段 91 → 94 | +12 ~ +18 | ≤ 89（数据档） |
| `.thincoder/b19-pet-work-stub.mjs` | **新建** | 开发期桩测（**不入包**；`.thincoder/` 不在 `build.files` 内）：装载 `pet-work-core.js` 真实实现 + 复用 `pet-chain-core.parsePool` 核池数据 | +250 ~ +350 | — |

**零改动面（代码档 7；机检 = 零 diff；AC19 / AC22 的取证对象）**：`pet-chain.js` · `pet-chain-core.js` · `pet-preload.js` · `shell-pet-geometry.js` · `shell-pet-drag.js` · `shell-notify.js` · `shell-affinity.js`。

**零改动面（资源档 4；同机检）**：`assets/pet-anim/webm/**` · `THIRD-PARTY-NOTICES.md` · `README.md` · `版本说明.txt`。

**文档档 2（不属机检面；列出仅为澄清「文档层不涉」）**：`docs/CONVENTIONS.md` · `AGENTS.md`——本批不写这两档（写权矩阵见 `AGENTS.md` §一），故**不入** AC19 / AC22 的零 diff 清单。

- **计数口径（修正轮 1 #11 统一）**：**零改动面 = 11 档**（机检面 = 代码 7 + 资源 4，与批次档 §2.3 / §2.6 同口径）；上一条的 2 档文档**不计入**（13 = 含文档面的读法，本档不再使用该口径）。
- **`pet.getPetState` 的实况（修正轮 1 #5 核验）**：该访问器**已在** `shell-pet.js:387`（`function getPetState() { return petState; }`）并已在 `:404` 导出 ⇒ 本批**零新增导出**，只需在组合根接进注入面（§2.7 与本节 `main.js` 行）；`shell-pet.js` 的改动点与行数预算**不变**。

- **贴线档拆分计划**：全部改动档预算末值 ≤ 500 ✓（最大 = `shell-pet.js` 440 · `shell-pet-work.js` 200 · `pet-work-core.js` 140）；**两个新档均为独立职责档**（I/O 与纯函数分离 = 为了桩测可装载，非为了行数）；
- **单档 ≤ 500 行**：本批无任何档触阈。
- **B26 面（F1）的受影响文件与行数预算**：见批次档 `docs/batches/B26-pet-feel.md` §2（一次性任务书；本档**不复制文件表**——设计档不承载一次性任务）。

### 2.10 B19 关键决策记录（DD-17…DD-26）

| # | 决策 | 理由 | 否决 / 备选 |
|---|---|---|---|
| DD-17 | 事件源 = **只读投影缓存记录**（读盘 + `fs.watch` + 1 s tick） | 零新依赖 / 不改 Harness / 形态可守卫 / 有 B09・B10 先例 | 否决 harness 事件桥（新面跨批）、日志解析（需 zstd）、HTTP 事件流（未审协议）——§2.6.1 |
| DD-18 | 档位集合 = **可观测三档**（生成 / 工具 / 收尾）——**按读面能力收窄** | 读面证据是硬约束（§1.3.5）；三档各有一条独立可观测信号 | 否决六档（三档读面不存在）、两态（丢可得区分）、试采 result（亚秒窗口）——§2.6.2；**已裁定（2026-09-18）= ① 可观测三档**（六档 = 事件桥后置批 B22） |
| DD-19 | 收尾档 = `work-done`，由 `turn/end` **强制落盘点**驱动，保持 3 s；**不表成败** | 回合结束可观测（强制写）；不区分成败 ⇒ 不得以成败语义命名或选材（避免「失败也庆祝」） | 否决「用 success 素材庆祝」（误报）；否决「无收尾档」（少一个完整体感且素材沉没） |
| DD-20 | 池段形态 = **`events` 下按语义档位名新增键**（值 = slot） | 链与 V1–V6 零改动；键 = 语义档位名（承 DD-5） | 否决样本索引数组（与 `slot` 语义冲突）、顶层新段（碰 V1）——§2.6.3 |
| DD-21 | 读面复用度 = **复用口径 + 独立轻量模块**；**不 require `shell-notify.js`** | 满足「不改 B09 判定门」与「零新增依赖方向」；本模块只需 `pendingCalls` / `openStep`（B09 判定门不读） | 否决直接复用 `completionGate()`（信息不足 + 语义串味）——§2.6.4（对应 U-5） |
| DD-22 | 工作档 = **背底档**，由 1 s tick 的**重断言**保持 | 免去逐处修改既有定时器回落点（含 `shell-affinity.js` 与 B03 校准过的散步段）；不碰冻结面；链的「同档忽略」使重发幂等 | 否决「逐处改回落点」（改动面大、碰冻结档）；否决「独立 IPC 通道旁路 petState」（双源 = 漂移源） |
| DD-23 | 工作档期间**不启动**散步（`scheduleWander` 加一道门）；入睡**不加门**（既有 idle 守卫已覆盖），离开工作档时 `wakePet()` 重排 | 「她正在干活」比「她溜达一步」更贴需求；改动面 = 1 行条件 | 否决「工作档让位于散步」（观感破碎 + 档位乒乓）；否决「改入睡规则」（改既有节奏，需求外） |
| DD-24 | 开关面 = 托盘 checkbox + `settings.json` 键；**默认关（U-1 = 采用推荐值，待用户批准时一并确认）** | 与既有 `notifyOnComplete` 同形；默认保守 | 否决「只有 settings 键」（用户不可及）——§2.6.5 |
| DD-25 | 文案 = **本仓自写常量表** + 节流（同档一次 / ≥30 s）；收尾档不弹 | 语气一致 + 不扩大许可面；不刷屏；不与其后紧接的完成提醒撞车 | 否决样本文案（许可面 + 语气）——§2.6.6（对应 U-3） |
| DD-26 | PNG 通道：**未知档位渲染待机帧**；**不**把工作档启用耦合到池可用性 | 一条规则走到底（工作档 = 语义档位）；不需要跨模块读池装载结果 | 否决「池 ok=0 ⇒ 整体不启工作档」（多一条跨模块依赖，收益仅为「PNG 通道下不动状态」）——§2.8.7 |

### 2.11 B19 与既有纪律 / 实现的冲突点核对

| # | 既有约束 / 纪律 | 设计处理 | 结论 |
|---|---|---|---|
| C34 | 几何层冻结（`shell-pet-geometry.js` / `shell-pet-drag.js` 零 diff） | 本批不碰；窗口尺寸 / 位置零写入（承 C1 / C3） | 不冲突（AC19 机检） |
| C35 | 素材本体只读（`assets/pet-anim/webm/**`） | 只新增**池引用**（工作状态 8 段素材中本批引用 3 段） | 不冲突（AC17） |
| C36 | 池校验 V1–V6 / `POOL_KEYS` 不得改 | 只新增 `events` 键（自由键对象）；V2 / V5 已覆盖新键 | 不冲突（AC17 机检） |
| C37 | B18 链规则（§2.2.4 规则 1–4）与 11 档映射 | 只新增档位名；`pet-chain.js` 逐字不改 | 不冲突（AC19 机检） |
| C38 | B09 完成判定门不得改 | 不 require、不修改；自带独立读面（同族谓词重复 = O16） | 不冲突 |
| C39 | 「任务完成」提醒（`petSay('任务完成啦！')`）与工作气泡共用气泡 | 收尾档不弹工作气泡；后到者覆盖（既有行为） | 不冲突 |
| C40 | 入睡 / 散步既有节奏（US-17 边界 / B03 校准） | 触发参数逐字不改；工作档期间**不启动散步** = 既有 idle 守卫加一道门（口径落档，见 DD-23） | 不冲突（AC19 现场复核） |
| C41 | 零新依赖 / 不新增原生模块（NFR-4 / NFR-16） | 只用 `node:fs` / `node:path`；两个新档登记 `build.files`（承 DD-15） | 不冲突（AC22） |
| C42 | 单档 ≤500 行 / 行宽 ≤300 | 最大预算末值 = `shell-pet.js` 440；新档 200 / 140 | 不冲突（AC22 机检） |
| C43 | 样本区不可引用（`docs/README.md` §一） | 实现零 `require` / `import` 样本；文案本仓自写 | 不冲突（AC22 机检） |
| C44 | macOS / Linux 既有行为不回退（NFR-3 / NFR-7） | 只用跨平台 API（`fs.watch` 单目录 + `stat`）；目录不存在 ⇒ 降级停用 | 不冲突 |

#### B19 观察项（发现即报告——**待主 agent / 用户知悉或裁定**）

- **O11 档位覆盖缺口（U-6 已裁定 = ①；六档去向 = 后置批 B22）**：样本六档中的「等待批准 / 回合成功 / 回合失败」在本仓只读数据面**不可观测**（证据 = §1.3.5 第 6 行）；本档按「可观测三档」成文（DD-18）。
  **用户 2026-09-18 裁定 = ①「可观测三档」**；**六档的补齐 = 事件桥后置批 B22**（§2.6.1 候选 2 = 随包 DSH 插件订阅事件并落盘）——事件桥到位前**不得**以「先上近似」名义把成败档做进去。
  - **B22 的依据（实测；主 agent 2026-09-18 提出，本档独立复核成立）**：下列事件名**存在于**本机 DSH 包（= `dsh-bundle/node_modules/@deepseek-ai/`）的类型表：
    `dsh-agent-presets/lib/typert.host.js:689` 的 `SessionEventMap` 含 `approval/asked` / `tool/call` / `turn/end{reason}`；`turn/end` 的消费点 = `dsh-agent/lib/index.js:71`。
    但它们**只写会话日志、不进任何投影行**（`dsh-user-approval/README.md:137` 明写 log-only；追加点 = `dsh-user-approval/lib/index.js:135`）⇒ 本批读面拿不到（会话日志为 zstd，见 §1.3.5）。
    **B22 的工作面** = 后端插件订阅这些事件并**落一份可读档**（或提供只读接口）。
  - **本批已预留的扩展面（B22 到位后增量补齐、不返工）**：① 池段 `events` 可再增 3 键（示例 `work-waiting` / `work-success` / `work-error`，最终以 B22 设计为准）；② 判定门 `deriveGear` 的规则表可扩档（新信号 → 新档位）；③ 素材侧 `工作状态-雀跃庆祝` / `工作状态-垂头叹气冒汗` 已在仓未引用（O17），B22 只需加池引用。
- **O12 等待批准与工具在跑不可区分（去向 = 后置批 B22）**：`tool/call` 先于审批落盘（`dsh-agent-loop/lib/index.js:584-588` + `dsh-tools/lib/index.js:3314-3336`）⇒ 即使做「等待」档，也无法用本读面区分。该档**必须换事件源** = B22 的事件桥（`approval/asked` / `approval/decided` 在其事件表内；见 O11）。
- **O13 回合成败不可得（去向 = 后置批 B22）**：`turn/end` 的 `reason.kind` 不落任何持久投影行（`dsh-session-turn-outline/lib/index.js:77-141` 无状态字段；`dsh-llm-retry/lib/index.js:93-95` 在 `turn/end` 清空）⇒ 「庆祝 / 垂头」二档**不得**以推测实现（误报比缺失更快烧掉用户信任）；该二档由 **B22 的事件桥**给出（`turn/end` 事件的 `reason` 字段，见 O11）。
- **O14 样本 `result` 档在本读面基本不可观测**：该状态是「工具返回 → 下一步开始」之间的**亚秒窗口**，而写节流 5 s（`dsh-base/cordis.patch.yml:162-166`）⇒ 除非碰巧采样命中，否则落盘里永远看不到、更无法被桩测稳定复现。本批不实现（候选 D 已否决）。
- **O15 行数口径差（一致性面，已报告）**：批次档 §1.3 记 `pet.js` 212 / `shell-pet.js` 427，本档实测（换行符口径，不把尾换行计为一行）= **211 / 426**——每档差 **1 行**，成因 = 尾换行是否计一行。本档数值为本档口径（与 §2.3 同），**不自行改写 §1.3**（主 agent 段）。
- **O16 同族读面重复（建议行，供主 agent 登记台账）**：B09 判定门（`shell-notify.js:104-158`）与本批读面**同读一族落盘物**（`session_projcache/sessions/*.json`），谓词口径重复（目录段 / mtime 最大记录 / `ver` 守卫）。本批按 DD-21 **解耦不合并**（合并会碰 B09 判定门）；未来若要收敛，建议新立技术待办（抽取共享只读模块，两处同时改）。
- **O17 仍未引用的素材（不阻断，仅登记）**：`余额-*` 6 段 / `碎碎念-*` 3 段 / `被鼠标拖拽悬空反馈` 1 段 = **D2 面与 B 面**的素材，本批不动（引用 91 → 94 / 未引用 15 → 12）；`工作状态-雀跃庆祝` / `工作状态-垂头叹气冒汗` 两段**保留待 B22**（O11；本批已在仓未引用 ⇒ 素材侧不返工）。
- **O18 NFR-17「整体停用（等价于开关关闭）」的读法张力（修正轮 1 #8 发现；须主 agent / 用户知悉）**：本设计把 `unavailable` 定为**逐轮可恢复**（§2.8.7），并把「等价于开关关闭」按**用户可见效果**读（桌宠行为与开关关着时逐位一致）。
  - 需求档 NFR-17 的括注若按「**状态等价**」读（= 锁存、停跑读面），则须同步改该行字面并补「目录 / 记录出现后自恢复」判据；本设计**不取**该读法（理由：`unavailable` 含「目录尚未出现 / 目录为空」这类**开机常见时序**，锁存会让功能永久静默直至用户手动重开）。
  - **待主 agent / 用户裁口径**（属需求层判定，本档不自作语义变更）。
- **O19 收尾档的可见时长（修正轮 1 改写；观感取舍，建议批准时复核）**：**B26 起**收尾档的可见时长 = 「记录陈旧（≤60 s）或至下一档到来」（由保持条维持，§2.8.2 规则 7），**不再是 3 s 保持期**。
  - `WORK_DONE_HOLD_MS`（3 s）的**残余作用** = 「紧接收尾档后记录立刻转陈旧」时的**下界**。
  - 两处可调：① 提高该常量（加长最短可见时长）；② 把该档改为多候选（`loop=false` ⇒ 转为「播完才回链」）。
  - **新的观感注意点**：单候选 `loop=true` ⇒ 收尾档期内在同一段上**循环续播**（不再有 3 s 处的「中途切断」，但可能连播较久）——取值与观感复核归用户批准面（批次档 `docs/batches/B26-pet-feel.md` §2.10.6）。

**B26 面新增（F1 / F3 相关；发现即报告）**

- **O20 F1 的让位边界（修正轮 1 改向后重写；取代原 O20）**：让位窗口 = **选中记录新鲜期**（`now − mtime ≤ WORK_STALE_MS`）——由 `deriveGear` 的**保持条**（§2.8.2 规则 7）承担；**起步门的增量效力 = ≤1 s（交互档 / 走动档收尾间隙）＋ 拖动在途子情形（顺延至拖动结束后首个 tick）**（补漏，逐条 = §2.12.3 ②）。
  **残余（射程外，登记）**：① 首个工作档出现前（无「上一档位」可保持）；② 读面 `unavailable`（无选中记录 ⇒ 无新鲜度信号 ⇒ 不可保持）；③ 记录陈旧（> 60 s）——三段与今天同形（清档）。
  **语义代价（须用户知悉）**：「会话开着但模型空闲」的时段也计让位期（`WORK_STALE_MS` 口径的固有含义）；更严的信号（回合在途 / 工具在跑）需 Harness 侧事件桥（B22）。
- **O21 F3（「工具在跑」档补气泡）——已裁定（2026-09-18 主 agent 代裁）= 纳入本批，节流改「按档 + 全局下限」**：
  ① **文案已在位**——`WORK_QUOTES` 已含 `work-working` 两条（`pet-work-core.js:23-26`）；② **状态机已共用**——`pickBubble()` 按档查键、`applyTick()` 每 tick 调同一 `bubbleState`（无第二套）；③ **真因 = 节流口径**——原 `lastAt` 为**跨档全局**计数器（`shell-pet-work.js:35`）⇒ 生成档进入时必弹 ⇒ 工具档在 < 30 s 内进入时被同一窗口压掉；
  ④ **量化（对真实 `pickBubble` 跑合成时间线）**：思考 20 s / 工具 5 s 交替 ⇒ 30 min 内气泡**全为生成档**（工具档 0 条）；思考 45 s / 工具 30 s ⇒ 两档各 2 条 ⇒ 短工具调用（< 30 s）**结构上不可见**；⑤ **次要面（维持现状，登记）**：让位 / 无窗口时 `pickBubble` **也推进 `lastAt`**（`applyTick` 的调用次序在让位 return 之前）⇒ 被吞掉的那次同样占掉窗口——本批**不改调用次序**（改序 = 新语义），保留登记；
  ⑥ **处置** = §2.8.5 修正（同档 ≥30 s ∧ 跨档 ≥10 s）+ **AC31** + **TC-49**；**两读法的处置**：读法 A（按档）**采纳**并加**全局下限 10 s**（防三档连弹），读法 B（全局）**作废** ⇒ 需求档 US-22 的口径行同步修订（`docs/requirements/PET.md` §三 US-22）；
  ⑦ **尾注（闲聊气泡与工作气泡共用同一元素）同轮处置**：**闲聊不纳入工作气泡节流**（两套计数器分离：闲聊无节流、走既有 4 s 显示）；让位期内闲聊**不弹**（既有 `petState === 'idle'` 守卫的自然结果，§2.12.2 连带）——两项均在 §2.8.5 / §2.12.2 落档。
- **O27 编号跳号与 B21 前向指针（一致性登记；修正轮 1 新增）**：本档的 **AC25–AC30 / TC-37–TC-47 / DD-28–DD-36 / O22–O26 = B21 面预定号**（`docs/batches/B21-pet-action-selection.md` §2.1；该面**尚未落盘**）⇒ 本轮 B26 新增一律取**其后首个空号**（**AC31 / TC-48–TC-49 / DD-37 / O27**），保证同一档内不出现两处同号（计数以**条目数**为准，编号非连号）。
  另：`docs/requirements/PET.md` 对 §2.13 / §3.7 的引用为**前向指针**（B21 面未落盘）——归 B21 面落笔时处理，本档不改（**发现即报告**）。
  - **核销（B21 面落笔轮，2026-09-18）**：B21 面已落盘（§2.13 / §3.7 / §3.8）——本行的 AC25–AC30 / TC-37–TC-47 / DD-28–DD-36 / O22–O26 自此为**实号**（与批次档 §2.1 预定号逐条一致，回读核对通过）。
    前向指针处置：`docs/requirements/PET.md` 对 §2.13 / §3.7 的引用经本轮逐条核对**不含「待落盘」类注记**（US-29…US-31 / NFR-23 / US-7 修订注记的引用形态即最终形态）⇒ 需求档**无需改动**；本行原「归 B21 面落笔时处理」就此处理完毕。

---

### 2.12 B26 面：自主触发让位（F1，US-21）

> 面 = 「工作档在途期间，**自主触发**的表演性动作**不启动**」；承 US-21 的既有口径（「工作档在途期间不启动散步」+ §2.8.4 优先级表）与台账 R19 / 批次档 `docs/batches/B26-pet-feel.md` §1.4 F1。
> **修正轮 1（评审轮 1 🔴 #1 + 主 agent 裁决）：机制改向**——原「只加一道起步门」的方案**效力不落在症状窗口**（档位在途时 `petState` **已**是档位 ⇒ 既有守卫先挡、该门零增量；而症状窗口内 `petBaseState()` 恰是 `idle` ⇒ 该门**恰好放行**）⇒ 改为 **「档位保持」（主）+ 起步门（补漏）**。优先级表 / 共同门 / 既有触发点与定时器**逐字不变**（与 §2.8.4 **注 D** 同源）。

#### 2.12.1 方案选型对比（机制；对应批次档 §1.7 U-1）

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价 / 权衡） | 结论 |
|---|---|---|---|---|
| 1 | **档位保持（主）+ 补漏起步门**：`deriveGear` 保持条（新鲜期不清档，规则 7）+ `playIdleVariant()` 守卫加 `petBaseState() === 'idle'` | 窗口与症状**同界**（记录新鲜期）✅ 复用既有 idle 守卫与 `fresh`（零新常量）✅ 有界（陈旧 ⇒ 清档）✅ 优先级表 / 共同门 / `main.js` 零改 ✅ 补漏门 1 行同散步门 ✅ | 代价：会话空闲也算让位期；收尾档可见 3 s → ≤60 s（批次档 §2.10.6） | **选定**（DD-27 改写；评审 #1 + 裁决） |
| 2 | **只加起步门**（原 §2.12 方案） | ① 档位在途时 `petState` **已**是档位 ⇒ 既有守卫先挡 ⇒ 该门**零增量**（除 ≤1 s（交互档 / 走动档收尾间隙）＋ 拖动在途子情形）❌；② 症状窗口（读面清档间隙）内 `petBaseState()` = `idle` ⇒ 该门**恰好放行** ❌ ⇒ 效力与目标（R19「看得出在干活」）不相干 | — | **否决**（评审 🔴 #1；主 agent 裁决：改向而非补丁） |
| 3 | **共同门侧排除自主触发**：在 `gateBlocked()` 里区分「自主 / 用户触发」 | 需给档位附加「触发来源」= 新跨模块状态 ❌ · 不阻止自主动作起步（仅取消让位）⇒ 档位乒乓 ❌ · 与 `getPetState()` 的只读面不兼容 ❌ | — | **否决**（承原候选 2） |
| 4 | **摘除自主小动作**（从 `schedulePetChatter` 移除 `playIdleVariant()` 调用） | 删除既有可见行为（US-21 边界「既有交互与观感照旧」）❌ · 超出本面范围 ❌ | — | **否决**（承原候选 3） |

#### 2.12.2 契约（判据句）

- **保持条（主机制；权威规则表 = §2.8.2 规则 7）**：`signals.fresh === true`（选中记录存在 ∧ `now − mtime ≤ WORK_STALE_MS`）⇒ 该 tick 的「其余 ⇒ 清档」输出改为**维持上一档位**（`prev.gear`；含 `work-done`；`prev.gear === null` ⇒ 仍为 `null`）；`signals.fresh === false`（陈旧）或无选中记录（`available === false`）⇒ **清档照旧**。
  - 落点 = `pet-work-core.js` 的 `deriveGear`（+2 行量级）；**不动** `shell-pet-work.js` 的下发 / 重断言两条（条款逐字不变，§2.8.4）。
- **起步门（补漏 1 行）**：`playIdleVariant()` 首行守卫 = `petWindow 在场 ∧ petState === 'idle'` **∧** `petBaseState() === 'idle'`；任一不满足 ⇒ 直接返回（不 `setPetState`、不排队、不重试、零新定时器）。
- **同口径声明**：该条件与散步起步门（`scheduleWander`：`petState === 'idle' && petBaseState() === 'idle'`）**同一判据形态 + 同一常量来源**（`petBaseState()` = 工作档提供者；无工作档 ⇒ `null` ⇒ 兑 `'idle'`）。本面**不新增第二套门**。
- **保留面（逐字不改）**：点击（`handlePetClicked` → `happy` + 台词）· 喂食（`shell-affinity.handleAffinityBuy` → `eat`）· 拖动（`shell-pet-drag.js`）· 小动作时长（2.4 s）与档位名（11 档词表）· 共同门名单与优先级表 · `schedulePetChatter` 的**节拍参数**（90 s / 40%）· `main.js` 注入面。
- **连带（如实登记）**：让位期内**闲聊台词也不弹**——`schedulePetChatter` 回调自带的 `petState === 'idle'` 守卫的自然结果（**非新增门**）；其**节拍参数**（90 s / 40%）逐字未改 ⇒ 让位结束后按原节拍继续。**若用户要「让位期仍保留闲聊」** ⇒ 须改该回调的 idle 守卫（属**语义面**，本批不做；列 U 项供批准时确认）。
- **与共同门的关系（D2）**：共同门（§2.8.4）**不改**——它判的是「本 tick 是否下发 / 重断言」（对**已在途**的交互档让位）；本面判的是「**新的**自主动作是否起步」。两者互补、不重叠（注 D）。
- **边界（不做）**：不新增日志行型 / 开关 / IPC / 档位名；不动 `main.js` 注入面（零新增依赖边）；**不做**「夺回已在途的自主动作的动画档」；**不改优先级表与共同门名单**。

#### 2.12.3 效力边界与残余（修正轮 1 重写；修正轮 2 订正 ② 与不可达面；取代原 §2.12.3）

- **生效面（两层）**：
  - ① **档位保持**覆盖「**选中记录新鲜**」的全部区间 ⇒ 自主动作在**回合间隙 / 收尾档保持期满后的清档间隙 / 回合起始 ≤5 s 延迟**内均不起步（= 症状窗口，评审 #1 指出的原方案射程外那段）；
  - ② **补漏起步门**覆盖「档位保持仍在（`lastGear ≠ null`）**而** `petState` 已回 `idle`、重断言被推迟」的窗口；逐条来源【修正轮 2 订正——按 §2.8.4 点名的 `lastGear` 语义重判可达性】：
    - **(a) 常态（≤1 s）**：**交互档**（含自主小动作档）定时器到点、或**走动档（`walk-*` / `run-*`）收尾**把档位置回 `idle` → 下一 tick 重断言之前（≤ `WORK_TICK_MS` = 1 s）；
    - **(b) 拖动在途子情形（顺延至拖动结束后首个 tick；上界 = 拖动全程 + 1 tick）**：① （a）的窗口与拖动在途**重叠**（定时器在拖动中到点、或 ≤1 s 间隙内起拖）；② **拖动起点复位在途走动档**（`shell-pet-drag.js:146-150`，只复位走动档、不动工作档）之后，可达面 = **挣脱逃跑（`run-*`）在途时被再次抓起**（其起步不经散步起步门：`shell-pet-drag.js:204-210` 直调 `doWander`）。
- **不可达面（修正轮 2 订正）**：**原「拖动起点复位散步走动档」分支不可达**——档位保持在途时散步起步门（`petBaseState() === 'idle'`，`shell-pet.js:287`）先挡，且散步在途期间共同门持续推迟下发 ⇒ 散步在途 ⇒ `lastGear` 恒为 `null` ⇒ 复位后该门恒过、**无对象**（=「由散步起步门先挡、补漏门无对象」；具名订正 = 批次档 §2.10.8）。
- **零增量面（承评审 #2 核对；修正轮 2 保留）**：`petState ≠ 'idle'` 时既有守卫先挡（门无对象）；`lastGear === null`（清档 / 陈旧 / 开关关）时该门恒过。
- **覆盖不到的窗口（残余，如实登记）**：① **首个工作档出现前**（`prev.gear === null` ⇒ 无「上一档位」可保持）⇒ 与今天同形；② **无选中记录**（`available === false`：目录缺失 / 无候选 / 形态守卫不过 / 单档解析失败）⇒ 无 `mtime` ⇒ 无新鲜度信号 ⇒ **不可保持**、清档照旧；③ **记录陈旧**（`now − mtime > WORK_STALE_MS`）⇒ 清档（= 让位期的**有界端**，不得取消）。
- **语义代价（如实写清；列 U 项）**：**「会话开着但模型空闲」的时段也算让位期**——`WORK_STALE_MS`（60 s）口径的固有含义（记录静默 ≤ 60 s 内的「无在途回合」按保持处理）。**若用户要更严**（只在「回合在途 / 工具在跑」时让位）⇒ 需要**回合级信号**，而本读面（投影缓存 5 s 节流 + 四段选取）给不出 ⇒ 必须先有 **Harness 侧事件桥**（= B22 面，§2.11 O11）；本批不自作。
- **术语**：本面的「让位」= 自主动作不**起步**；**不含**「夺回已在途的自主动作的动画档」（共同门语义，逐字不变）。

#### 2.12.4 关键决策（B26 面）

| # | 决策 | 理由 | 否决 / 备选 |
|---|---|---|---|
| **DD-27**（修正轮 1 **改写**） | 机制 = **档位保持（主）+ 起步门（补漏）**，而非「只加一道门」 | ① 让位窗口必须与症状窗口**同界**（= 记录新鲜期）——只加门在症状窗口里恰好放行（§2.12.1 候选 2）；② 保持条复用既有 `fresh`（零新常量）；③ 补漏门 1 行、与散步起步门同形同源 | 只加起步门（原设计；评审 🔴 #1 否决）· 共同门侧排除（候选 3）· 摘除小动作（候选 4） |
| **DD-37** | 保持的**条件** = 「选中记录新鲜」（`WORK_STALE_MS` = 60 s），且**保持含 `work-done`** | ① 「新鲜」是本读面能给出的**最宽且可判定**的信号（`mtime` 已有、零新增）；② 有界端明确（陈旧 ⇒ 清档）⇒ 不会永久停在忙碌档；③ 含 `work-done` 是「维持上一档位」的字面含义，且正是它填掉「收尾档后 → 下一回合起始」的空窗 | 「保持到有信号为止」（无上界 ⇒ 永久忙碌，相抵 TC-31）·「按回合在途 / 工具在跑」（读面不可得 ⇒ 需 B22）·「进程内计时器」（非持久信号，重启即失忆） |

---

### 2.13 B21 面：动作选择规则（交互 / 个人动作分离 + 丝滑衔接 + 逃跑槽修复）

> 面 = **B18（动画链，A 面）真机反馈的修复批** + 用户新提的「交互 / 个人动作分离」分类需求；回指 `docs/requirements/PET.md`（US-29…US-31 / NFR-23 与 US-7 的 B21 修订注记）。
> 任务书与 U 项立案 = `docs/batches/B21-pet-action-selection.md` §1 / §2；受影响文件全清单（file 级权威表 + 行数预算）= 同档 §2.3（D2：只引用不重述；本档 §2.13.8 只列零改动面与冲突核对）。
> **体例注（F-5）**：受影响文件全清单以**批次档 §2.3 为 file 级权威表**是本批的既有裁定形态——与 **B26**（批次档 §2 落表、设计档只给指针）同形；B19 走另一形态（设计档 §2.9 落全清单）——两形态均为先例，本批承 B26 形态 ⇒「设计档内无全清单」非裸缺口（判据面 = 批次档 §2.3 + 本档 §2.13.8）。
> 三方同源清单 = 批次档 §2.1（条目 4 · AC 6 · TC 11 · DD 9 · C 12 · O 5）——本档 §3.7 / §3.8 的编号与之逐条对应。

#### 2.13.1 落点判定与选型（一主题一档 + 四组对比）

- **落点判定 = 续写本档（一主题一档）**：本批 = 链与动作选择主题的修复与增量（选段修正、衔接机制与 B18 §2.2 的映射表 / 链规则同族同档维护）。候选对比：

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **续写本档**（§2.13 新面） | ① 与 11 档映射表 / 链规则同档维护（改动即对照）；② 验收回指与链日志面同源；③ B26 面（§2.12）已有同款先例 | 代价：本档体积增长（行数门限只限代码档，不受影响） | **选定** |
| 2 | 新立独立档 | ① 选段修正 R1/R2 与既有链规则的权威分裂（两档对同一函数入口各自成文）；② 11 档映射表两处维护；③ 验收回指跨档 | — | 否决 |

- **选型 ① 衔接方式**（对应批次档 §1.5 U-4；需求层 = US-30）：

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价 / 权衡） | 结论 |
|---|---|---|---|---|
| 1 | **段间重叠交叉淡入**（段末前 `PET_OVERLAP_MS` 起下一段，双缓冲已具备） | ① 消除「先停住再从头起」（上一段收尾与下一段起势交叠）；② 零新渲染位（复用双缓冲）；③ 提前量 = 单一可标定常量（NFR-23） | 代价：旧段尾部 ≈ 提前量被牺牲；链换段整体提前（观感须实机标定，§2.13.2） | **选定**（U-4 = ①） |
| 2 | 加长淡入（180 ms → 更大） | ① 实现最简；② **不消除起收间隔**——淡入期间两段同时半透明，拉长只会让画面更久「发虚」，下一段起势仍从第一帧开始 | — | 否决（US-30 边界明写「不用拉长淡入」） |
| 3 | 段尾对齐（逐段标注起势 / 收势挑匹配段） | ① 只挑段、不动时机 ⇒ 不解决「先停住再起」；② 需逐段标注表 = 新数据面与新维护面 | — | 否决（US-30 边界明写「不做对齐表」） |

- **选型 ② 单段槽处置**（`moves.run` 仅 1 段 ⇒ 高频同段连切；对应 U-5；实测 = 批次档 §1.3 问题②）：

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **R1 同段不重播 + R2 仅镜像变化只改 transform**（`switchTo` 入口唯一前置判定） | ① 根治「重载」本身（继续播当前段、不回到第一帧）；② 零新数据面（不改池、不加参数）；③ 一次性反馈档不受影响（只对 `loop=true` 持续档） | 代价：持续档的重复到达不再「重启」——这是该档的持续语义本身 | **选定**（U-5 根治；§2.13.5） |
| 2 | `exclude` 失效时改用基槽（run → walk） | ① 只改选段结果、不改「同段重载」症状（walk 单段时同样连切）；② 跑步语义退化为步行（观感错误） | — | 否决 |
| 3 | 扩该槽段数 | ① 属数据面 + 素材面——本批无跑步类素材可用（出批项 3 / B24）；② 扩段数不根治「重入重载」（多段仍会重载同段） | — | 否决 |
| 4 | 该槽加冷却（最小驻留时长） | ① 掩盖症状（推迟重入）；② 给合法重触发加延迟 = 与 U-2「一触即演」相抵；③ 与 U-6「不做最小驻留」（需求层已否决）同源相抵 | — | 否决 |

- **选型 ③ 拖动档落点**（drag 档 = 用户手势 → 交互动作）：

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **渲染层手势面**：`pet.js` 的 `beginDrag` / `clearDragState` 对称上报 → 链 `setDragging` + 让位守卫 | ① 手势起止的事实源在渲染层（`pointerdown` 即起）；② 主进程拖动面 = 冻结档（`shell-pet-drag.js` 零 diff 硬约束）；③ 对称上报天然覆盖 pointerup / cancel / lostcapture / stale 全路径（NFR-2「所有路径清空」同款） | 代价：链内多一个 `dragging` 标志 + `setSlot` 让位分支 | **选定** |
| 2 | 主进程拖动事件面（`handlePetDragStart/End` → `setPetState`） | ① 碰冻结档（硬约束 1 直接否决）；② 主进程 start/end 与渲染层手势存在 stale / 看门狗时序差 | — | 否决（硬约束 1） |

- **选型 ④ 逃跑档落点**（escape 档；US-7 触发面不回退）：

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **`doWander` 消费既有 `petForceRun` 信号** → 档名 `escape-left` / `escape-right` | ① 零新通道（`petForceRun` 已是「脱手逃跑强制跑步」的既有信号，`shell-pet-drag.js:207`）；② 触发阈值与方向语义零改动（US-7 修订注记）；③ `doWander` 折返序列 / idle 守卫逐字不动（B03 校准面） | 代价：escape 与 run 共享素材（档位面独立、段同源——O23） | **选定** |
| 2 | 新增信号面（新 IPC / 新状态标志） | ① 新通道 = 新维护面；② 触发点仍在冻结档内 ⇒ 新信号无处落地（`shell-pet-drag.js` 零 diff） | — | 否决（硬约束 1 + 零新通道） |

#### 2.13.2 常量表（NFR-23：单一常量、单点定义单点消费）

| 常量 | 初值 | 定义点 | 消费点 | 标定路径 | 到期条件 |
|---|---|---|---|---|---|
| `PET_OVERLAP_MS` | **1200**（**临时值**；依据 = `docs/README.md` 文档地图 B21 行「段间重叠 ~1–2 s」+ 素材段长实测 10.04 s） | `pet-chain-core.js` 常量表（**单点定义**） | `pet-chain.js` 预触发定时器（**单点消费**） | 探针 `overlap=` 读数 + 用户实机目视 | 本批 §6 验收时以实机目视定值；**未定值前 1200 ms = 临时值** |

- **单点纪律**：改值只改这一处数值，不牵动机制（NFR-23「衔接参数单点」；承 B20 `restitution` 的既有先例）。
- **无其他新常量**：drag / escape 复用既有 facing 与映射机制；淡出窗时长读运行期 CSS `transition-duration`（单一权威源 = CSS，§2.13.4）；R1 / R2 判定无新常量。

#### 2.13.3 分类契约（交互 / 个人 / 状态档三分；文档面、不加池键、运行时无来源通道）

| 类 | 档位 / 池键 | 运行时判据（触发面） | 归属规则（US-29 口径） |
|---|---|---|---|
| **交互动作** | `happy`（点击）· `eat`（喂食）· `drag`（拖动中，**本批新增**）· `escape-*`（拖到边界松手逃跑，**本批新增**） | 由**用户手势**触发（点击 / 喂食 / 拖动 / 拖到边界松手） | 一触即演；**可打断**个人动作；**不被**个人动作打断 |
| **个人动作** | 自由链（待机 / 转向 / 分类）+ 随机小动作四选一（`read` / `starry` / `scared` / `happy` 的自主触发面） | 无用户手势、她自己演（1.5 min 节拍 / 40% 概率 / 2.4 s 时长照旧） | 只在 idle 起步（既有守卫）；**不打断**交互动作 |
| **状态档（不在二元内）** | `sleep` · `work-*` · `walk-*` · `run-*` | 持续状态与位移档 | 规则照旧，本批不改 |

- **已知重叠（明示）**：`read` / `starry` / `scared` / `happy` 池键**两侧复用**（自主触发面 = 个人动作、点击触发面 = 交互动作）——分类按**触发面**读，同一池键在两侧均合法（US-29 口径；触发源本批不改）。
- **「交互档」一词的跨节口径桥接（F-4；两处所指集合不同、两套机制均不变）**：§2.8.4 / §2.12.2 共同门的让位名单（`happy` / `eat` / `read` / `starry` / `scared`）是**档位集合**（这些档在途 ⇒ 工作档让位；与触发面无关——**自主触发的 `read` 在途仍让位工作档**，共同门照旧）；本表的分类是**按触发面**的分类（同一池键自主面 = 个人动作、点击面 = 交互动作）。两套口径互不引用、互不改写。
- **文档面分类、不加池键**：分类**不参与任何运行时选择**——链按档位名查池键、按触发面切档；分类是契约面的解释，不是选择参数 ⇒ 池键加分类字段 = 没有消费者的参数 ⇒ 死配置不入 schema（本档 §2.2.2 既有原则：不设 `moves.default` 的距离参数同理）。
- **运行时不引入来源通道（论证写透）**——打断规则的两条均由既有机制承载，新通道零增量：
  - 「交互**可打断**个人」由既有链规则 3b 承载：交互档到达 = 语义档位变化 ⇒ 立即换段（点即有反应、≤ 300 ms = NFR-9）；
  - 「个人**不打断**交互」由既有 idle 守卫承载：个人动作只有 `petState === 'idle'` 才起步（`playIdleVariant` 与 `schedulePetChatter` 回调的守卫、`scheduleWander` 起步门、B26 补漏门同源），交互档在途时 `petState ≠ idle` ⇒ 个人动作**结构上无法起步**；
  - 引入「来源通道」（给换段附加触发源参数）的**唯一消费者** = 上述两条打断规则，而它们已由「档位变化 + idle 守卫」完整承载 ⇒ 新通道零增量、只增漂移面（两套口径并存的代价）；B26 的候选 3（共同门侧区分自主 / 用户触发）已因同理由被否决（§2.12.1）——本批不重开。
- **优先级与打断的权威口径** = 需求档 US-29（交互 > 个人；交互可打断个人（立即切换）；个人不打断交互）；交互响应延迟上界 = NFR-9（≤ 300 ms，无容差）。
- **「在途不换段」的口径（F-1 澄清；与 §2.13.4 的链自主换段集合自洽）**：US-29 的「交互动作在途期间不换段」= **不被个人动作 / 链的中途顶掉**——**不含**段末的**衔接退场**（段末前 `PET_OVERLAP_MS` 内的 `reason=pre-end` 预触发换段，与 `ended` / `event-end` / `slot-rotate` 同属链自主换段的段末决策面，是正常退场、非打断）；交互动作的**起演**仍恒立即（NFR-9 ≤ 300 ms 不变）。判据面 = AC26 ①。

#### 2.13.4 衔接机制（决策函数 + 双触发点 + 旧段退场次序）

- **段末决策抽为一个决策函数 `decideNext`**（`pet-chain-core.js` 纯函数；承 DD-14 双环境导出、桩测装载真实实现）：
  - 输入 `{ pool, weights, roll, slot, playing, cur, facing }`（`roll` 注入 ⇒ 确定性、可桩测）；
  - 输出三类计划：`rotate`（事件档仍在其档 ∧ 多候选 ⇒ 档内轮换，复用 `nextInSlot`）/ `chain`（回链：掷骰选段；`turn` 段附翻转标记、`move` 附请求标记）/ `none`（无下一段）；
  - 输出**不含副作用**——`requestMove` 与 `facing` 翻转由 `pet-chain.js` 执行。
- **两个触发点（同一决策函数 ⇒ 决策同源，防两处漂移）**：
  - ① `ended`（既有兜底；`overlap=0`）；
  - ② **段末前 `PET_OVERLAP_MS` 的预触发定时器**（仅 `loop=false` 段；armed 于 play 成功后；回调校验 `gen` 与 `playing.name`；被换段 / 回落 / 结束时清除）——`overlap > 0`。**事件段不豁免（F-1 口径）**：预触发武装到**全部 `loop=false` 段**——含 `happy` / `eat` 等事件段；其段末衔接退场（`reason=pre-end` / `ended` / `event-end`）**不构成**对 US-29「在途不换段」的违反（口径 = §2.13.3）。
- **链自主换段的定义（AC27 判据面）**：`reason ∈ {pre-end, ended, event-end, slot-rotate}`——段末决策面；档位驱动的换段（`slot-*`）与用户触发的换段不在其内。**B27 起**扩为 `{pre-end, ended, event-end, slot-rotate, quiet, quiet-end}`（静默进出，§2.14.9 / §3.7 注 E′）。
- **旧段退场次序（AC4 三禁止形态不变 + 判据②仍真）**——文本时序图（旧段段长 D、`loop=false`、预载耗时 L、淡出窗 F）：

```
旧段 play（t=0；armed 预触发定时器；挂 onended）
  │
t = D − PET_OVERLAP_MS      预触发：decideNext → switchTo（back 位 load；gen++；旧段继续播）
  │
t = D − PET_OVERLAP_MS + L  新段就绪（readyState ≥ 2；L ≤ 300 ms = NFR-9）：
  │                         新段加 is-front（开始播）· 旧段摘 is-front（淡出窗起点）
  │                         · 交换 front · 旧段 onended=null · 旧段 pause() **推迟到淡出窗末**
  │                         ——叠化窗内两路 paused=false（两段交叠在播）
  │
t = 淡出窗末（+F）          旧段 pause()（F = 运行期读 .pet-media 的 transition-duration；
  │                         reduce ⇒ 0 ⇒ 即刻 pause）——此后恒 1 路在播
  │
t = D（不再到达）           旧段自然结束不产生二次决策（onended 已在就绪回调摘除；
  │                         且 pause 在 D 之前冻结）
```

  - **判据②仍真的论证**：旧段 `pause()` 的唯一发生点 = 淡出窗末回调；淡出窗起点 = 新段就绪（`readyState ≥ 2`）**之后**（F ≥ 0）⇒ pause 恒不早于新段就绪 ⇒ AC4 禁止形态②零命中；禁止形态① 不动（摘 `is-front` 仍在就绪回调内）；禁止形态③ 不动（恒 2 个 `<video>`）。
  - **淡出窗不变量**：F（180 ms）恒小于「预触发剩余量 − 预载耗时」的下界（1200 − 300 = 900 ms）⇒ 淡出窗内旧段恒未自然结束 ⇒ 叠化窗两路 `paused=false` 的探针判据（AC27 ④）稳定可复现。
- **竞态与兜底（逐条）**：
  - 预触发定时器未命中（`duration` 不可得 / 估计偏差）⇒ `ended` 照旧决策（`overlap=0`）——链行为同改前；
  - 旧段在换前台前的自然结束 ⇒ `ended` 的 `gen` 校验丢弃（预触发已 gen++，无二次决策）；
  - **用户触发换段在预载期到达 ⇒ 恒立即执行**（`gen` 竞态丢弃在途预载）——**交互不受衔接牵连**（不得为衔接增加交互响应延迟；NFR-9 ≤ 300 ms 不变）；
  - 入场首换段（PNG → 视频）无旧视频段 ⇒ 不适用预触发与叠化。
  - **淡出窗末 `pause()` 回调的失效守卫（F-3）**：窗内发生新换段（快速连点 / 起拖）且复用同一 back 元素时，回调执行前须校验 `gen` 与「该元素仍承载旧段名」（或换段时**取消挂起的 pause 回调**）——防「暂停了新前台 ⇒ 画面冻结」；判据面 = AC28 ④（pause 唯一调用点 = 淡出窗末回调）+ AC27 ④ 的叠化窗探针不变。
- **无障碍（US-30 口径）**：reduce ⇒ CSS 过渡归零 ⇒ F=0 ⇒ 旧段即刻 pause（瞬时切换、仍无空白帧）；预触发仍在（只改换段时机、不改换段次序——US-16 边界）。

#### 2.13.5 选段修正（R1 / R2：`switchTo` 入口的唯一前置判定）

- **唯一前置判定**：`judgeSwitch({ playing, name, mirror })`（`pet-chain-core.js` 纯函数；桩测装载真实实现）——`switchTo` 入口第一段调用；输出三类：`reload` / `hold-same` / `hold-mirror`。
- **R1 同段不重播**：`playing.loop === true ∧ name === playing.name ∧ mirror === playing.mirror` ⇒ `hold-same`——不 load、不重载、继续播当前段。
  作用域 = `loop=true` 持续档：`moves.*` / `sleep` / `drag` / `escape`（批次档 §2.2 所列四类）；链单候选段（恒 `loop=true`）被同一判据机械覆盖（与 TC-5「不重载、不闪断」同精神）。
- **R1 / R2 作用域扩展（B27；§2.14.9）**：前提由「`playing.loop === true`」扩为「`playing.loop === true ∨ String(playing.slotKey).startsWith('escape-')`」——escape 档自 B27 起为 `loop=false` 单遍段（§2.14.6），折返 / 同段重入仍不重启段、不回到第一帧（US-31 修订注记 ②）；其余语义逐字不变。
- **R2 仅镜像变化**：`playing.loop === true ∧ name === playing.name ∧ mirror !== playing.mirror` ⇒ `hold-mirror`——只改当前元素 `transform`（`scaleX(-1)` 或还原），不 load。
  作用域 = 朝向驱动的持续档（`walk-*` / `run-*` / `escape-*`）。
- **hold 路径的收尾（防在途预载换前台）**：使 `pending` 失效（`pending = null` 或 gen++）⇒ 此前任何在途预载（如折返瞬态 idle 的预载）不换前台；并更新 `playing.slotKey = slot` 与 `playing.mirror`（R2）——`playing` 与当前档位保持一致。
- **一次性反馈档不受牵连**：`happy` / `eat` / `read` / `starry` / `scared`（`loop=false`）被 `loop=true` 前提排除在外 ⇒ **每次触发都重播 = 反馈语义保留**。
- **取证行（仅 debug）**：
  - `anim hold reason=same same=1 name=<段> key=<槽键>`（R1；`same=1` = 同段重复到达被吸收的取证标记，AC29 判据面）；
  - `anim hold reason=mirror name=<段> key=<槽键>`（R2）。

#### 2.13.6 两个交互档（drag / escape）

**drag（拖动中——用户手势 → 交互动作；不碰 `shell-pet-drag.js` / `shell-pet-geometry.js`）**

- `pet.js` 的 `beginDrag` / `clearDragState` **对称上报** → 链 `setDragging(true / false)`；
- `setDragging(true)` ⇒ `switchTo(pickFor('events.drag', …), true, 'slot-drag', false, 'event')`（`loop=true` 持续档）；
- **让位守卫**：`dragging` 期间 `setSlot(s)` 只更新 `slot` 变量、**不** `startSlot`——拖动期主进程档位变化（`handlePetDragStart` 的复位、1.6 s 定时器、入睡定时等）被吸收，防「起拖瞬间被 `setPetState('idle')` 顶掉」；
- `setDragging(false)` ⇒ 重断言当前 `slot`（拖动期间后续 `pet-state` 已更新 `slot` 变量）——回链或进入逃生档均由此路径接续；
- PNG 通道：`drag` 无 PNG 帧 ⇒ 渲染待机帧（`pet.js` 既有未知档位分支，与 `work-*` 同款回落）。

**escape（拖到屏幕边界松手逃跑——US-31；US-7 触发面不回退）**

- `shell-pet.js` 的 `doWander`：`petForceRun` 为真时该段档名 = `escape-<petWanderDir>`（替换 `run-<dir>`；**一行改动量级**；`petForceRun` 的消费、折返序列、idle 守卫、位移纪律逐字不动——B03 校准面）；
- `pet-chain.js`：`escape-left` / `escape-right` → 池键 `events.escape`；`facing` 推导同 walk / run（`escape-left` ⇒ `facing='left'` 无镜像；`escape-right` ⇒ 镜像）；`loop=false`（**B27 修订**：单遍播完再回链，§2.14.6 / §2.14.9；原 B21 口径 = `loop=true` 单候选持续档）；`kind='event'`；`reason=slot-escape`；
- **触发阈值与方向语义零改动**（US-7 修订注记）：触发面（距桌面外缘 4px、外缘判定）与方向语义（往反方向跑）逐字不动——本批只改动作的**呈现**（选段 / 衔接 / 一次逃跑内不重播）；
- **逃生触发的 idle 不产生可见换段**：`shell-pet-drag.js:209` 的 `setPetState('idle')` 与 `doWander` 的 `escape-*` 在**同一同步栈**先后下发 ⇒ 渲染层先处理完两档位再有任何加载回调；idle 触发的预载被随后 escape 换段的 `gen` 竞态丢弃（从未换前台）——`gen` 守卫为硬兜底；
- **逃跑段的退场** = 下一档位到达——逃跑位移结束（`doWander` 段末置 idle）即逃跑的自然结束（该 idle 换段是正常退场，非「逃跑途中」）。**B27 修订**：退场 = **段末收尾**——腿末 idle 由既有规则 3 推迟（事件段播完才回链），escape 段自然结束后经 `ended` / 预触发回链（§2.14.9；该 idle 换段仍不产生可见换段行）。

#### 2.13.7 池数据面（素材本体零增删改；池契约零改动）

- `events.drag` = `["被鼠标拖拽悬空反馈"]`——引用池内**未引用**段（B18 §2.5 O1 的出批面本批回收；素材已在仓、本体零改动）；**B27 修订**：改引用 `["被吓一跳"]`（§2.14.7；原引用「被鼠标拖拽悬空反馈」转未引用——池契约与谓词零改动不变）；
- `events.escape` = `["原地左转奔跑"]`——引用既有跑步段（**档位面独立、段同源**；素材面无专门逃跑段，见 O23）；
- 引用段 **94 → 95**（未引用 **12 → 11**；登记项，AC25 机检）；素材本体零增删改（硬约束 2）。
- **`POOL_KEYS` 与 V1–V6 谓词零改动论证**：`POOL_KEYS` = 顶层结构键、`events` 已在 ⇒ 零改动；V1（`events` 为对象且逐值 `slotOk`）· V2（`allNames` 逐 `events` 键核对文件存在）· V5（`events` 每个已声明档 ≥ 1 段）均为**结构级谓词**、按 `Object.keys(events)` 迭代 ⇒ 新键**自动纳入**，谓词逐字不改。新键各 1 段 ⇒ V5 的「≥ 1」满足；引用名已在 `assets/pet-anim/webm/`（实测在场）⇒ V2 满足。
- 落地后必须 `parsePool` `ok=1`（V1–V6 全过）——AC25 机检。

#### 2.13.8 零改动面 / 降级面 / 冲突核对（C45–C56）

**零改动面（机检 = `git diff --stat` 空；AC30）**：`shell-pet-geometry.js` · `shell-pet-drag.js` · `pet-preload.js` · `pet.html` · `shell-pet-physics.js` · `pet-physics-core.js` · `shell-pet-work.js` · `pet-work-core.js`。
**零改动面（续）**：`THIRD-PARTY-NOTICES.md` · `README.md` · `版本说明.txt` · `assets/pet-anim/webm/**` · `assets/pet-new/**`；`package.json` 的 `dependencies` / `devDependencies` / `build.files` 均零 diff（本批零新源档）。

**降级路径（逐条）**

- 池缺 `events.drag` / `events.escape` 键 ⇒ 级② 该档走 PNG（未知档位渲染待机帧，`pet.js` 既有分支）——不空白、不报错；其余档照常；
- 单候选（`drag` / `escape` 均单段）⇒ `loop=true` 持续档（§2.2.3 分支；与 R1 同源）——**B27 修订**：escape 例外，`loop=false` 单遍（§2.14.6 / §2.14.9）；`drag` 仍 `loop=true`；
- reduce ⇒ 叠化归零（F=0 ⇒ 旧段即刻 pause）；预触发与无空白帧不变；
- `duration` 不可得 ⇒ 预触发不武装、`ended` 兜底（`overlap=0`）——链行为同改前。

**冲突核对（12 条）**

| # | 既有约束 / 纪律 | 设计处理 | 结论 |
|---|---|---|---|
| C45 | B18 AC4 零空白帧（三禁止形态 + `readyState ≥ 2`） | 衔接仍走同一切换序列（**§2.2.5 第 4 条已按 B21 同步**：旧段 `pause()` 推迟到淡出窗末；判据②仍真，§2.13.4） | 不冲突（AC28 机检） |
| C46 | B18 事件档避重（`nextInSlot` 契约保留） | `decideNext` 复用 `nextInSlot`（不改其实现）；档内轮换语义不变 | 不冲突（桩测） |
| C47 | B18 链规则 1–4 与 11 档映射 | R1 / R2 只在 `switchTo` 入口前置判定；规则表主体不改（**规则 3 的第三触发与拖动窗旁路注 = B21 同步项**，§2.2.4）；映射表主体不改（**新增档位在批次面独立成表**，§2.13.6） | 不冲突 |
| C48 | B03 几何层冻结（`shell-pet-geometry.js` / `shell-pet-drag.js` 零 diff） | drag 档走渲染层手势面；escape 走既有 `petForceRun` | 不冲突（AC30 机检） |
| C49 | B03 散步折返校准面（`doWander` 折返序列 / idle 守卫） | `doWander` 仅档名一行改动；折返 / 守卫 / 位移纪律逐字不动 | 不冲突 |
| C50 | B20 位移写权（拖拽 > 物理 > 散步）与位移纪律 | 本批零位置 / 尺寸写入；drag / escape 是动作档、不是位移源 | 不冲突（出批项 4） |
| C51 | B19 工作档共同门与优先级表 | 本批不碰；状态档（`work-*`）不在分类二元内；共同门让位名单与 §2.13.3 触发面分类的集合差异 = §2.13.3 口径桥接行 | 不冲突 |
| C52 | B26 F1 让位（档位保持 + 补漏起步门）与 F3 节流 | 分类按触发面读、不改触发源与节拍；自主小动作起步门不改 | 不冲突（出批项 2） |
| C53 | 池校验 V1–V6 / `POOL_KEYS`（NFR-23 池契约） | 新键走 `events` 自由键扩展面（§2.13.7 论证）；谓词零改动 | 不冲突（AC25 机检） |
| C54 | 素材本体只读 + 样本区不可引用 | 只加池引用；实现零 `require` / `import` 样本 | 不冲突（AC30 机检） |
| C55 | 零新依赖 / 零新源档 / 行宽行数 | 本批零新源档（`build.files` 零 diff）；改动档预算末值 ≤ 500（批次档 §2.3） | 不冲突（AC30 机检） |
| C56 | NFR-9 及时性与无障碍（reduce） | 用户触发换段恒立即（无衔接延迟）；reduce ⇒ 叠化归零 | 不冲突 |

#### 2.13.9 观察项（O22–O26；发现即报告——待主 agent / 用户知悉或裁定）

- **O22 素材段长与位移段长的固有张力（出批项 1；不解决）**：素材段长 ≈ 10.04 s 长于位移段长（0.25–2.9 s）⇒ `loop=true` 的走动 / 逃跑段在位移段末被 idle 顶掉（播约 0.6–1.5 s 即切）。调整散步 / 位移节奏或折返序列以匹配素材 = 散步状态机面，另批（US-31 边界 / 批次档 §2.5 出批项 1）。**B27 部分处置**：escape 面改 `loop=false` 播完整段（张力不再作用于逃跑——O30）；walk / run 面照旧（仍登记）。
- **O23 escape 素材面复用跑步段（观感项）**：`events.escape` 引用既有 `原地左转奔跑`（档位面独立、段同源）——「原地左转」与「逃跑」存在语义张力；逃跑观感待用户实机目视（批次档 §2.6 标定项 3）；专用逃跑素材归素材面（C 面）。
- **O24 drag 悬空反馈段观感（观感项）**：拖动中悬空反馈段（10.04 s，`loop=true` 持续播）是否贴合待用户实机目视（批次档 §2.6 标定项 2）。**→ 已由 B27 处置（核销）**：用户实机结论 = 读作星星眼 ⇒ drag 换段「被吓一跳」（§2.14.7；续标定 = O29）。
- **O25 `moves.run` 单段的素材面消解（出批项 3）**：R1 / R2 根治「重载」本身；补跑步类段（扩段数）属素材面，归 **C 面（B24）**——本批不做。
- **O26 起拖即入 drag 档的长按点击面（观感项）**：`pointerdown` 即入 drag 档——长按（> 预载耗时）的点击会短暂现出悬空反馈段（起拖即播的固有面；快点击的预载被 gen 竞态丢弃、不闪）。若实机目视不合意 ⇒ 备选 = 起拖延迟入档门（按住超过阈值才入档；属新语义，须另评）。

#### 2.13.10 U 项决断对照表（U-1…U-6；立案 = 批次档 §1.5）

| U | 决断 | 依据（需求档 / 勘察 / 既有设计） |
|---|---|---|
| U-1 点击是否切交互动作 | **① 切**（点即有反应） | 需求档 §一 B21 目标（「一触即演」）· US-29 口径（交互档 = 点击 `happy`）· 批次档 §1.5 推荐 |
| U-2 打断规则 | **① 交互动作可打断个人动作**（≤ 300 ms 起演 = NFR-9 判据，无容差） | US-29 口径（优先级与打断：交互 > 个人、立即切换）· NFR-9 |
| U-3 拖到边框的「逃跑」档 | **① 新立交互档**：`drag`（引用池内未引用段）+ `escape`（引用既有跑步段） | US-29 口径（drag / escape = 交互档）· US-31 口径（独立逃跑档）· §2.13.1 表 3 / 表 4 |
| U-4 衔接方式 | **① 段间重叠交叉淡入**（段末前 `PET_OVERLAP_MS` 起下一段，双缓冲已具备） | US-30 口径（衔接方式）· US-30 边界（明写否决加长淡入 / 对齐表）· §2.13.1 表 1 |
| U-5 单段槽处置 | **R1 同段不重播 + R2 仅镜像变化只改 transform**（根治重载本身） | 批次档 §1.3 实测（问题②：`moves.run` 单段连切）· §2.13.1 表 2（改基槽 / 扩段数 / 冷却均否决） |
| U-6 个人动作最小驻留 | **② 不加** | US-29 边界明写：「不做『个人动作最小驻留时长』——不加『演完再切』的延迟响应（那会让点击失去即时反馈）」——需求层已否决 |

#### 2.13.11 关键决策记录（DD-28…DD-36）

| # | 决策 | 理由 | 否决 / 备选 |
|---|---|---|---|
| DD-28 | 落点 = **续写本档**（一主题一档） | 选段修正 / 衔接与既有链规则同族同档维护；评审可按既有链规则逐条对照 | 否决新立独立档（权威分裂 + 映射表两处维护）——§2.13.1 |
| DD-29 | 衔接 = **段间重叠交叉淡入**（段末前 `PET_OVERLAP_MS` 预触发） | 消除「先停住再从头起」；复用双缓冲零新渲染位；提前量单一可标定 | 否决加长淡入 / 段尾对齐表（US-30 边界明写不做）——§2.13.1 表 1 |
| DD-30 | 段末决策 = **纯函数 `decideNext`**（`pet-chain-core.js`）+ 两个触发点（`ended` / 预触发定时器） | 决策同源（两触发点跑同一函数，防两处漂移）；桩测可装载真实实现 | 否决「预触发处内联复制决策逻辑」（复制 = 漂移源）——§2.13.4 |
| DD-31 | 旧段退场 = 就绪回调内摘前台、`pause()` **推迟到淡出窗末**（读运行期 CSS `transition-duration`） | 叠化窗内两路在播（真交叠）；淡出窗时长单一权威源 = CSS（零镜像常量）；reduce ⇒ 0 ⇒ 即刻 pause | 否决「就绪即 pause」（交叠不成形）· 否决「JS 常量镜像 CSS 180 ms」（双源漂移）——§2.13.4 |
| DD-32 | 分类 = **文档面三分**（交互 / 个人 / 状态档），不加池键、运行时无来源通道 | 分类无运行时消费者（打断由规则 3b + idle 守卫承载）；死配置不入 schema | 否决「池键加分类字段」（死配置）· 否决「换段附加触发源参数」（零增量、只增漂移面）——§2.13.3 |
| DD-33 | 拖动档 = **渲染层手势面**（`beginDrag` / `clearDragState` 对称上报 → `setDragging` + 让位守卫） | 手势事实源在渲染层；主进程拖动面 = 冻结档 | 否决主进程拖动事件面（硬约束 1）——§2.13.1 表 3 |
| DD-34 | 逃跑档 = **`doWander` 消费既有 `petForceRun`** → `escape-<dir>` | 零新通道；触发阈值与方向语义零改动；折返序列 / idle 守卫不动 | 否决新增信号面（冻结档内无处落地）——§2.13.1 表 4 |
| DD-35 | 单段槽根治 = **R1（同段不重播）+ R2（仅镜像变化只改 transform）** | 根治「重载」本身；零新数据面；一次性反馈档不受牵连（`loop=false` 排除） | 否决改基槽 / 扩段数 / 加冷却（§2.13.1 表 2）——§2.13.5 |
| DD-36 | 池数据 = **`events` 两个新键**（`drag` 引用未引用段 · `escape` 引用既有跑步段） | `POOL_KEYS` 与 V1–V6 谓词零改动（`events` 自由键扩展面）；素材本体零增删改 | 否决顶层新段（碰 V1 / `POOL_KEYS`）· 否决新 `moves` 键（与「逃跑是事件档」语义不符）——§2.13.7 |

---

### 2.14 B27 面：观感 II（节奏 + 逃跑表达）

> 面 = 用户实机三条观感问题的修复批（台账 R23 节奏 / R22 逃跑表达 / R21 边界——后者落 `docs/design/PET-MOVEMENT.md` §2.2.14）；
> 回指 `docs/requirements/PET.md`（US-32 / US-33 / NFR-24 与 US-15 / US-29 / US-31 的 B27 修订注记）。
> 任务书与 U 项立案 = `docs/batches/B27-pet-feel-2.md` §1 / §2；受影响文件全清单（file 级权威表 + 行数预算）= 同档 §2.3
> （**体例注承 B21 F-5 / B26**：本档只给零改动面与冲突核对，不复制文件表）。
> 三方同源清单 = 批次档 §2.1（条目 3 · AC 4（AC32–AC35）· TC 9（TC-50–TC-58）· DD 6（DD-38–DD-43）· C 6（C57–C62）· O 3（O28–O30））——
> 本档 §2.14 / §3.9 / §3.10 的编号与之逐条对应。

#### 2.14.1 落点判定

| # | 候选 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **节奏与逃跑落本档（§2.14）、边界落 `PET-MOVEMENT.md`（§2.2.14）** | 节奏 / 逃跑 = 链决策与档位面（与 §2.2 链规则、§2.13 动作选择同族同档）；边界 = 位移写权与物理面（与 §2.2.13 同族） | 两个主题各自与既有权威同档维护 | **选定** |
| 2 | 三面全落本档 | 边界与链机制异族——`petEdgeBounds` 的消费点是物理 / 散步，判据与 AC21（地面等式）同源 ⇒ 跨档对照成本高 | — | 否决 |

#### 2.14.2 节奏机制选型（批次档 §1.5 U-1；需求层 = US-32）

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价 / 权衡） | 结论 |
|---|---|---|---|---|
| 1 | **加权待机**（调池权重：动作类 85% → ≈40%） | 零代码、只改池数据；动作出现频率直接降 | 单独用仍「10 s 一换段」（待机段也连播） | 选定为组合的一半（用户已裁） |
| 2 | **真·静默期**（动作后进入不换段的安静期） | 直接把「忙着切换」的观感消除；时长单一常量可标定 | 新机制（链内静默状态机）；待定静默形态与时长 | 选定为组合的另一半（用户已裁） |
| 3 | 热闹度档位（安静 / 正常 / 活泼，settings + IPC） | 用户可调 | 设置面 + IPC + 迁移，需求未提 ⇒ 出批 | 否决（本批）；可选后置 |

> 用户 2026-09-19 已裁 = **①+② 组合**（「我也感觉 1+2 一起做好很多，很自然」）——本表为裁定的选型留痕。

#### 2.14.3 静默形态选型（批次档 §1.5 U-2）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **静默段循环播放**（池键 `events.quiet`，默认「待机呼吸休闲」） | 呼吸动画 = 活着；零通道切换；数据驱动可换段 | 仍有轻微动画（呼吸） | **选定** |
| 2 | PNG 静态待机帧（切回 PNG 通道） | 完全静止 | 200↔140 可见高度跳变（TC-9 登记为**仅回落**可接受的取舍）+ 观感「死鱼」+ 每次静默一次通道切换 | 否决 |

- **静默期「禁止换段」的判据口径**：静默期内链**不掷骰、不换段**（静默段 `loop=true` 循环）；档位变化（任何非 idle 槽到达）⇒ 打断静默（立即换段）；
  静默计时到点 ⇒ 回链重掷。判据 = 日志面（静默区间 = `anim quiet enter` 行 → 其后第一条 `anim quiet end` 行（`reason ∈ {timer, slot}` 均收）；区间内零其它 `anim switch` 行、零 `reason=quiet` 系以外的换段行；计时退出路径的回链换段行（`reason=quiet-end`）在 `anim quiet end` 之后（区间外，显式豁免））。

#### 2.14.4 静默触发面选型（动作后 vs 每个链段后）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **动作类段（`action` / `turn`）之后进入静默** | 与用户裁定字面「动作后进入一段安静期」逐字吻合；idle 段连续播放保留「活着」的活性（US-15 残余精神） | 待机段之间仍 10 s 一换（但都是安静类段） | **选定** |
| 2 | 每个链段（含 idle）之后都静默 | 节奏最稀疏（约 40 s 一次可见变化） | 待机段也被拉开 ⇒ 与「活着」的目标更远；改动面相同 | 否决（观感过于冷清） |

#### 2.14.5 逃跑表达选型（批次档 §1.5 U-3；需求层 = US-33）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **逃跑腿参数专用**（更长更快，专用常量） | 位移明显（300–600 DIP 级）；单点可标定 | 只解决「跑得短」 | 选定（组合件一） |
| 2 | **逃生档播完整段再回**（loop=false 单遍 ≈10 s） | 逃跑姿态完整；复用既有规则 3（事件段播完才回链）零新机制 | 段长 ≈10 s 的观感待实机标定（O30） | 选定（组合件二） |
| 3 | **拖到墙角期间即有表达**（drag 档换段） | 消除「一直星星眼」；池引用一行 | 无专用「挣扎 / 被拎住」素材 ⇒ 只能换用既有段（§2.14.7） | 选定（组合件三） |
| 4 | 认账保持现状 | 零成本 | 用户已明说「没看出是逃跑」⇒ 不满足需求 | 否决 |

#### 2.14.6 播完整段的实现面选型

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **escape 档 `loop=false` + R1/R2 作用域扩展**（`judgeSwitch` 对 `slotKey=escape-*` 恒 hold） | 段末由既有 `ended` / 预触发收尾（与链同机制）；腿末 idle 由既有规则 3 推迟；折返不重启段 | 需把 R1/R2 的作用域条件从「`loop=true`」扩为「`loop=true ∨ escape`」 | **选定** |
| 2 | 主进程侧延迟置 idle（腿末起计时到段长再回 idle） | 主进程不知道段长（时长知识在渲染层）⇒ 需新 IPC / 硬编码时长 | — | 否决（新通道 + 双源时长） |
| 3 | 链内为 escape 加「最小驻留」计时器 | 与候选 1 等价但引入第二套结束机制（与 `ended`/预触发并存 ⇒ 漂移源） | — | 否决 |

#### 2.14.7 拖拽表达素材选型（drag 档换段）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **「被吓一跳」**（既有素材，已被 `events.scared` / 小动作引用） | 「被抓」的惊吓语义贴合；零素材成本；跨键复用有先例（`写代码` / `吃西瓜` 等） | 长拖时 10 s 循环惊态观感待实机标定（O29） | **选定（推荐）** |
| 2 | 保持「被鼠标拖拽悬空反馈」 | 语义 = 被拎住（本意贴合） | 用户实机读作「星星眼」⇒ 不满足 | 否决 |
| 3 | 「偷吃零食被抓住」 | 「被抓住」语义 | 情节性过强（偷吃语境），通用拖拽下违和 | 备选（实机标定候选） |
| 4 | 新制「挣扎 / 被拎住」素材 | 语义最准 | 素材本体零增删改（硬约束 3）⇒ 出批（C 面 / B24） | 否决（本批） |

#### 2.14.8 常量表（NFR-24：单一常量 / 数据单点）

| 常量 / 数据 | 初值 | 定义点 | 消费点 | 标定路径 | 到期条件 |
|---|---|---|---|---|---|
| `PET_QUIET_MS` | **30000**（候选 20000 / 45000） | `pet-chain-core.js` 常量表（单点） | `pet-chain.js` 静默计时器（单点） | `anim quiet enter/end` 行间隔 + 用户实机目视 | 用户实机感受一次后的裁定轮（U-1） |
| `ESCAPE_LEG_MIN_DIP` / `ESCAPE_LEG_RANGE_DIP` / `ESCAPE_LEG_SPEED` | **300 / 300 / 0.45**（px·ms 口径） | `shell-pet.js` 常量区（单点） | `doWander` 逃跑分支（单点） | `pet-anim.log` 的 slot-escape 存活 + 实机目视 | 同上（U-3） |
| 池权重 `weights` / `categories` | idle **55** / turn **5** / move **0**；categories **10/10/8/7/5**（合计 40） | `assets/pet-anim/pool.json` | 链 `rollKind` 既有消费 | 动作占比实机目视（≈40%） | 同上（U-1） |

- **V4 论证（改 `weights` 不影响 V4 判据）**：V4 = 各权重 ≥ 0 ∧ `idle+turn+move+Σcategories ≤ 100`（**仅防笔误**、不要求合计 = 100，§2.2.4「权重余量的归属」）。
  新值合计 = 55 + 5 + 0 + 40 = **100 ≤ 100** ⇒ V4 通过；动作类概率 = 100 − 55 − 5 = **40%**（余量归 action 的既有契约不变）。
- **权重候选（U-1）**：40%（idle 55，推荐）· 45%（idle 50 + categories 45）· 50%（idle 45 + categories 50）——推荐 40% 的理由 = 最接近「隔三岔五」的稀疏感，
  且与静默期（30 s）叠加后预期「一个动作 ≈ 每 1–2 分钟」。
- **静默时长候选（U-1）**：20 s / **30 s（推荐）** / 45 s——推荐 30 s 的理由 = 台账 R23 给的 20–60 s 区间中位，叠加段长 ≈ 10 s 后一个完整周期 ≈ 40 s。

#### 2.14.9 契约（静默状态机 + decideNext 扩展 + judgeSwitch 作用域 + escape 单遍）

**静默状态机（`pet-chain.js` 运行期状态）**

- 状态：`quietActive`（布尔）+ `quietTimer`（定时器）。
- **进入**：段末决策（`triggerChainDecision`）收到 `plan === 'quiet'` ⇒ `switchTo(<静默段>, true, reason, false, 'quiet', overlap)` + `quietActive = true` +
  武装 `quietTimer = PET_QUIET_MS` + 日志 `anim quiet enter name=<段> dur=<ms>`。
- **退出（两条路）**：① 计时到点 ⇒ `quietActive = false` + 日志 `anim quiet end reason=timer` + `triggerChainDecision('quiet-end', 0)` 回链重掷；
  ② 任何非 idle 槽到达（`startSlot` 首行 `clearQuiet()`）⇒ 清计时器 + 日志 `anim quiet end reason=slot` + 照常换段。
- **清除面（`clearQuiet()`）**：非 idle 槽进入（`startSlot` 首行）/ 通道回落（`setChannel` 下行）/ 池重配（`onConfig`）/ 播中出错（`onPlayFail` 入口）四处调用；幂等（非静默时零行）。
- **第 4 清除点（播中出错）理由**：静默段 `loop=true` 仍武装 `onerror`——播中出错路径（`onerror` ⇒ `onPlayFail` ⇒ `chainStep('play-fail')`）会在静默区间内产链决策行（违 AC33②）且残留 `quietActive`/计时器 ⇒ `onPlayFail` 入口即 `clearQuiet()`：错误路径短路、防残留（`anim quiet end reason=slot` 先行落账、区间先闭，打断口径同退出路 ②）。
- **不变量**：静默只在 idle 槽内存在（进入条件 = `slot === 'idle'`）；静默期内无链决策（零 `anim chain` 行；计时退出的回链换段行 `reason=quiet-end` 在 `anim quiet end` 之后、区间外）；静默段 `loop=true` ⇒ 不武装预触发（§2.13.4 既有规则）。

**`decideNext` 扩展（`pet-chain-core.js` 纯函数，注入 roll 保确定性）**

- 输入新增 `quiet`（布尔 = 当前是否静默）；输出新增第四类计划 `quiet`。
- 判定次序：① rotate（事件段多候选轮换，逐字不变）→ ② **静默判定**：`slot === 'idle' ∧ !input.quiet ∧ playing.kind ∈ {action, turn}`
  ⇒ `{ plan: 'quiet', name: <pickSlot(pool.events.quiet, cur) 或回退 pool.idle[0]>, mirror: false }` → ③ 链掷骰（逐字不变）。
- 静默段取值：`pool.events.quiet` 在场 ⇒ `pickSlot(..., cur)`（避开连播）；**缺失 ⇒ 回退 `pool.idle[0]`**（降级面，链不崩；TC-54）。
- **翻转标记（`turn` 段）与计划类型解耦（B27）**：`turn` 段末进入静默时，静默计划**保留** `turn` 段的翻转标记（翻转照执行——翻转与「回链 / 入静默」解耦，不因下一计划为 `quiet` 被吞）；桩测断言 = `turn` 段末 ⇒ `plan='quiet'` ∧ 翻转已执行。

**`judgeSwitch` 作用域扩展（R1 / R2；`pet-chain-core.js` 纯函数）**

- 判定条件由「`playing.loop === true`」扩为「`playing.loop === true ∨ String(playing.slotKey).startsWith('escape-')`」——escape 档自 B27 起为 `loop=false` 单遍段，
  折返 / 同段重入仍不重启段（US-31 修订注记 ②；AC34③）。
- 其余语义（hold-same 使 pending 失效 / hold-mirror 只改 transform / 一次性反馈档不受牵连）逐字不变。

**escape 档单遍（`pet-chain.js` 的 startSlot escape 分支）**

- `switchTo(...)` 的 `loop` 实参由 `true` 改 `false`（仅 escape；drag 仍 `true`）。
- 腿末 idle 的退场 = 既有规则 3（`playing.kind === 'event' ∧ !playing.loop` ⇒ 推迟切档）⇒ escape 段播到自然结束；
  段末收尾 = 既有 `ended` / 预触发（`reason ∈ {pre-end, ended}`）⇒ 回链（§2.13.4 机制复用，零新收尾面）。
- 折返 / 重入 = R1/R2 扩展吸收（`anim hold reason=same|mirror`）。

**日志行型（新增两型；其余行型逐字不变）**

| 行型 | 字段 | 用途 |
|---|---|---|
| `anim quiet enter` | `name` / `dur` | AC33③（静默时长 = enter → end 间隔） |
| `anim quiet end` | `reason`（`timer` / `slot`） | AC33②④（打断与到点取证） |

- 换段行新增 reason 值：`quiet`（入静默）/ `quiet-end`（计时出静默）——AC27 的口径修订见 §3.7 注 E′。

#### 2.14.10 池数据面（素材本体零增删改；池契约零改动）

- `weights` = `{ idle: 55, turn: 5, move: 0 }`；`categories` 各权重 ×0.5 = `10 / 10 / 8 / 7 / 5`（相对比例逐字保留）。
- `events.quiet` = `["待机呼吸休闲"]`（**新键**；引用既有段 ⇒ 引用段数不变）。
- `events.drag` 值 `["被鼠标拖拽悬空反馈"]` → `["被吓一跳"]`（**改引用**；被吓一跳已由 `events.scared` 与「小动作」引用 ⇒ 引用段 95 → **94**、未引用 11 → **12**——登记项，AC34④）。
- **`POOL_KEYS` 与 V1–V6 谓词零改动论证**：`events.quiet` 走 `events` 自由键扩展面（承 B19 §2.8.3 / B21 §2.13.7 论证，谓词按 `Object.keys(events)` 迭代 ⇒ 新键自动纳入）；
  V4 论证 = §2.14.8；V2 / V5 对既有引用名逐条照旧成立。
- 落地后必须 `parsePool` `ok=1`（V1–V6 全过）——AC32② 机检。

#### 2.14.11 冲突核对（C57–C62）

| # | 既有约束 / 纪律 | 设计处理 | 结论 |
|---|---|---|---|
| C57 | NFR-9 交互即时性（≤300 ms，无容差） | 静默只约束**自主**换段；任何用户触发（点击 / 喂食 / 拖动 / 逃跑）走 `clearQuiet` + 立即换段（机制同 §2.13.4 竞态清单） | 不冲突（AC35 日志判据） |
| C58 | B26 F1 让位（档位保持 + 补漏起步门，§2.12） | 静默只在 idle 槽；档位保持期 `slot ≠ idle` ⇒ 静默不起步；补漏门 / 散步门逐字不改 | 不冲突 |
| C59 | B21 R1 / R2 与 AC29（§2.13.5 / 注 F） | 作用域扩展为**加宽**（escape 从 hold 的例外变成 hold 的对象）；AC29② 判据仍真（hold 行在场） | 不冲突（AC34③） |
| C60 | B18 AC3 活性判据（§3.1 注 A） | 静默期 = **设计内停摆** ⇒ AC3①/② 字面在静默期必红 ⇒ B27 修订注记（注 A′） | 以修订口径读 |
| C61 | B21 AC27 衔接判据（§3.7 注 E） | `quiet` / `quiet-end` 行属链自主换段 ⇒ AC27②「或 0」与 ③ 占比分母须扩展 ⇒ B27 修订注记（注 E′） | 以修订口径读 |
| C62 | 睡眠（2 min）/ 散步（15–35 s）节奏（US-17 边界 / B03 校准） | 两者参数逐字不改；槽位变化打断静默 = 既有换段机制的自然结果 | 不冲突 |

#### 2.14.12 观察项（O28–O30；发现即报告）

- **O28 节奏观感（实机标定项）**：40% 动作权重 + 30 s 静默的节奏是否合意待用户实机目视；回调面 = `pool.json` 一行 + `PET_QUIET_MS` 一处常量（U-1）。
- **O29 drag 换段观感（实机标定项）**：「被吓一跳」在长拖（≥10 s）下循环的观感待实机目视；备选 = 「偷吃零食被抓住」（§2.14.7 候选 3）；
  回正 = 池一行改回「被鼠标拖拽悬空反馈」。B21 的 O24（拖动中悬空反馈段观感）随之**核销**（用户实机已给出「读作星星眼」的结论，本批换段即其处置）。
- **O30 逃跑时长观感（实机标定项）**：腿（≈0.7–1.3 s）+ 播完整段（≈10 s 原地奔跑）的总时长观感待实机目视；若过长 ⇒ 备选 = escape 段改为多候选 / 收尾提前（属新语义，另评）；
  若仍不够 ⇒ 腿参数回调（U-3）。

#### 2.14.13 U 项决断对照表（U-1…U-3；立案 = 批次档 §1.5）

| U | 决断 | 依据（需求档 / 勘察 / 既有设计） |
|---|---|---|
| U-1 节奏默认值 | **动作 40% + 静默 30 s**（候选与理由 = §2.14.8） | US-32 口径 · 台账 R23（20–60 s 区间）· 实机标定路径在档 |
| U-2 静默形态 | **① 待机呼吸段循环**（pool 键 `events.quiet`） | US-32 口径 · §2.14.3（PNG 静态帧 = 高度跳变 + 观感死） |
| U-3 逃跑表达 | **①+②+③ 三件套**（腿参数 / 播完整段 / drag 换段被吓一跳） | US-33 口径 · §2.14.5 / §2.14.6 / §2.14.7 |

#### 2.14.14 关键决策记录（DD-38…DD-43）

| # | 决策 | 理由 | 否决 / 备选 |
|---|---|---|---|
| DD-38 | 节奏 = 加权待机 + 真·静默期（动作类段后） | 用户已裁 ①+②；静默直接消除「忙着切换」观感 | 热闹度档位（设置面，出批）· 每链段后静默（过冷清）——§2.14.2 / §2.14.4 |
| DD-39 | 静默形态 = 待机呼吸段循环（`events.quiet` 池键，数据驱动） | 活着 + 零通道切换 + 可换段 | PNG 静态帧（高度跳变 + 观感死）——§2.14.3 |
| DD-40 | 播完整段 = escape `loop=false` + R1/R2 作用域扩展 | 复用既有规则 3 与 ended / 预触发收尾（零新机制）；折返不重启段 | 主进程延迟置 idle（需时长知识 + 新 IPC）· 链内最小驻留计时器（第二套结束机制）——§2.14.6 |
| DD-41 | 逃跑腿 = 专用常量（300 / 300 / 0.45） | 位移明显、单点可标定（NFR-24）；不改普通跑步分支 | 复用 run 参数（改动面 = 通用跑动观感） |
| DD-42 | drag 换段 = 「被吓一跳」（池引用一行） | 被抓的惊吓语义 + 零素材成本 + 跨键复用有先例 | 悬空反馈（用户已否）· 偷吃零食被抓住（情节性过强，备选）· 新制素材（硬约束出批）——§2.14.7 |
| DD-43 | 静默决策入 `decideNext`（纯函数，注入 roll） | 判定矩阵可被桩测装载真实实现（NFR-17 同源纪律）；两触发点决策同源 | 链内联判定（不可桩测） |

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
- **注 A′（AC3 判据的 B27 修订注记；源 = §2.14.11 C60）**：原 ①「相邻 switch 的 shown 间隔 ≤ 段时长 + 100 ms」与 ②「switch 条数 ≥ 0.9 × 窗口 ÷ 段长」按**无静默期**的链写 ⇒ 自 B27 起改按**非静默期口径**读：
  - ① 非静默期内的相邻 switch 间隔 ≤ 段长 + 100 ms；静默期（`anim quiet enter` 行到其后第一条 `anim quiet end` 行的区间，`reason ∈ {timer, slot}` 均收；计时退出的回链换段行 `reason=quiet-end` 在 `anim quiet end` 之后、区间外）为**设计内停摆**，时长 == `PET_QUIET_MS`（+500 ms 容差，定时器只晚不早）；
  - ② switch 条数与非静默时长 ÷ 段长**同阶**（同阶口径 = ≥ 0.9 ×，承原判据）且 ≥ 1；
  - ③④⑤ 逐字不变；TC-2 的期望输出同口径订正（静默期为预期停摆）。

### 3.2 用例表

| 用例 | 类型 | 输入 / 前置 | 预期输出 | 映射 |
|---|---|---|---|---|
| TC-1 | 正常 | 合法全量池；冷启动应用 | `anim pool ok=1`；首个待机段 `shown − t0 ≤ 800 ms`；随后链持续换段 | US-15 / AC1、AC11 |
| TC-2 | 正常 | 清醒 600 s 探针窗口（`npx electron probe-pet-media.js --chain 600`） | 无异常日志；链不停摆（相邻 `switch` 的 `shown` 间隔 ≤ 段长 + 100 ms 抖动余量）且 `switch` 条数 ≥ 0.9 × 窗口 ÷ 段长；相邻 `ended → shown` ≤ 300 ms（**B27 修订**：静默期为预期停摆，细目 = 注 A′） | US-15 / AC3 |
| TC-3 | 边界 | 透明窗内播放 VP9-alpha 段；放大观察 | 身体外区域**透明**（桌面可见）、无黑底 / 无残影（O5 的取证点） | US-18 / AC7 |
| TC-4 | 边界 | 拖动窗口跨屏、穿越缩放比不同的屏，同时段在播放 | 几何写入纪律与既有行为逐位一致（`pet-geometry.log` 无新增尺寸写入；桩测口径的判据面不变） | NFR-13 / AC15 |
| TC-5 | 边界 | 单候选待机池（`idle` 长度 1） | `loop=true`，不重载、不闪断；链不产生 `switch` 抖动 | US-15 / AC3、AC4 |
| TC-6 | 边界 | `idle` 池多候选 + 当批池权重（**B27 同步**：`{idle:55,turn:5,move:0}`）；观察 200 次链决策 | `kind` 分布与权重一致（统计容差 ±15%）；`move=0` ⇒ 零 `move-req` | US-15 / AC2、AC3 |
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

### 3.4 B19 验收标准逐条回指

| 验收 | 回指需求 | 判定方式 | 机检可能性 |
|---|---|---|---|
| AC16 | US-20 / US-22 / NFR-17 | **派生纯函数桩测**（`node .thincoder/b19-pet-work-stub.mjs`，装载真实实现）；断言面细目 = §3.6 手段 1；末行 `pass/total PASS` | 机检 |
| AC17 | US-20 / NFR-16 | **池数据核**：`pool.json` 新增三键后 `parsePool`（真实实现 + fs 探针）仍 `ok=1`（V1–V6 全过）；三键引用名逐条存在于 `assets/pet-anim/webm/`；引用段数 **91 → 94** / 未引用 **15 → 12**（登记项，逐段核对） | 机检（`parsePool` + 名录比对） |
| AC18 | US-20 / NFR-14 | **端到端联调（真机 + 日志）**：开一轮真实会话（含 ≥1 次工具调用）⇒ `work gear` 行按「`work-thinking` → `work-working` → `work-done`」出现（各 ≥1）；对应 `anim switch` 行在场（值为池内工作段名）；时延 = 记录 mtime → `work gear` 的 `t` ≤ **6 s**（口径 = 无让位场景，见 §2.8.4）；`work reassert` 行在场（若有被覆盖则必有） | 机检（日志对齐；取 3 轮会话） |
| AC19 | US-21 / NFR-15 / NFR-16 | **零回退 + 隐私白名单（#9 / #11）**：`git diff --stat` 对**零改动面 11 档**（代码 7 + 资源 4；2 档文档不入机检面，见 §2.9）逐档零 diff；`package.json` 依赖段零 diff；静态核对零 require 指向 `shell-notify.js` / `samples/**`；**读面字段白名单核对 = 零字段取自内容行**；实机现场复核（拖动 / 点击 / 喂食 / 散步 / 入睡） | 机检（静态）+ 人工 |
| AC20 | US-22 / US-23 / NFR-14 | **开关、气泡与降级（日志面）**：① 默认关 ⇒ 零 `work scan` / `work gear` 行（读面不启动）；② 托盘打开 ⇒ 行出现且档位生效；③ 关闭 ⇒ 立即清档回 idle；④ 节流：同一档位连续停留 + 两条气泡间隔 < 30 s ⇒ 只 1 条 `work bubble`；⑤ 读面不可用（目录改名 / 坏 JSON / `ver` 换代）⇒ `work diag` **恰一条** + 无异常堆栈 | 机检（日志） |
| AC21 | US-21 | **PNG 通道零回退**：移走 / 坏池 ⇒ `anim pool ok=0`，画面与今天一致（PNG 通道逐位一致）；在 PNG 通道下工作档生效时渲染**待机帧**且**不出现空白帧**（探针抽帧 + 目视） | 半机检（`probe-pet-media.js` 探针）+ **人工判定**（观感项） |
| AC22 | NFR-16 | **规范机检**：两个新档行宽 ≤300 / 行数 ≤500；**两个新档含文件头标准形**（`docs/CONVENTIONS.md` §一：第 1 行逐字 `'use strict';` + 紧随 JSDoc 块 + 块内**含路径**的设计档指针）；`shell-pet.js` 末值 ≤ 500；`package.json` 的 `build.files` 含两个新档名（打包后在场）；三处署名（NFR-12）零改动；`POOL_KEYS` / V1–V6 谓词 / `pet-chain.js` 逐字零 diff | 机检（静态） |
| AC23 | NFR-14 | **开销面取证（修正轮 1 #1；承需求档 NFR-14 的开销判据）**：`work scan` 的 `cache=miss` 条数与 mtime 变化次数同阶 + `process.getCPUUsage()` 前后各 10 s 均值增量 < **1 %**；判据细目 = 本节表后**注 B** | 机检（日志 + 静态核对 + CPU 采样） |
| **AC24** | US-21（B26） | **自主触发让位（档位保持 + 补漏门）**：① 桩测（可区分改前/改后，假时钟）——保持期输出 == 前一档位且 ≠ `null`；推过 `WORK_STALE_MS` ⇒ `null`；② 符号级——保持条在场且在清档支之前 ∧ `playIdleVariant` 体内 `petBaseState()` 在 `setPetState` 之前；③ 运行时——让位窗口内无自主小动作行（窗口口径 = 注 C）；④ 90 s / 40% 与 2.4 s 逐字未改；⑤ 保留面 = TC-35 | 桩测（假时钟）+ 静态机检 + 日志面 |
| **AC31** | US-22（B26 / F3） | **工作气泡节流 = 按档 + 全局下限**：① 桩测（**可区分改前 / 改后**，假时钟）——工具档 t=12 s **必弹**（改前被跨档 30 s 压掉）∧ t=5 s 0 条（全局下限）；② 符号级——`WORK_BUBBLE_GLOBAL_GAP_MS === 10000` 定义恰 1 处；③ 文案表逐字未改 ∧ 收尾档无键（判据细目 = 注 C） | 桩测（假时钟）+ 静态机检 |

**注 B —— AC23 判据细目（开销面；修正轮 1 #1 补，源 = 需求档 NFR-14 的开销判据）**

- **① 无冗余解析（日志自证，机器可判）**：`work scan` 行的 `pick`（选中记录）与 `mtime` 值相同的**连续行区间**内，`cache=miss` **恰 1 条**（该 mtime 首次出现的那条），其余全部 `cache=hit`；
- **② miss 与 mtime 变化同阶**：采样窗口（≥ **300 s**）内 `cache=miss` 条数 ≤ 「窗口内选中记录 mtime 变化次数 **+ 1**」（首轮扫描必 miss 一次）；
- **③ CPU**：`process.getCPUUsage()` 取**读面开启前后各 10 s 的均值**，增量 < **1 %**（口径同需求档 NFR-14 的「增量开销 < 1 %」）；
- **④ 零同步 I/O（符号级静态核对）**：tick 函数体内零 `readdirSync` / `statSync` / `readFileSync` 命中（同源 = §2.8.1 的 `fs.promises` 口径）；
- **口径注（不得误判）**：①② 只对**开**态成立（关 ⇒ 读面不启动、零 `work scan` 行，见 AC20 ①）；`work scan` 的既有字段（`n` / `pick` / `mtime` / `cache`）已足以机检 ①②，**无需新增日志字段**。

**注 C —— AC24 / AC31 判据细目（B26 / 修正轮 1）**

- **AC24①（桩测 · 假时钟）**：对**真实 `deriveGear`** 跑合成时间线（注入 `now`）——在途（工具）20 s → 回合结束（收尾 `work-done`）→ 记录新鲜 ∧ 无在途，时钟推进 ≥10 s ⇒ 输出**仍 == `work-done`**（≠ `null`）；随后把 `mtime` 推过 `WORK_STALE_MS` ⇒ 输出 **== `null`**。**改前树该断言必红**（改前该 tick 落清档）。
- **AC24②（符号级）**：`deriveGear` 体内含「`signals.fresh ⇒ out.gear = prev.gear`」且位于清档支**之前**；`playIdleVariant()` 体内 `petBaseState()` 命中 ≥1 且在 `setPetState` **之前**（与 `scheduleWander` 起步门同形）。
- **AC24③（运行时窗口口径，可机检）**：窗口 = 「`work gear … to=work-*` 行到其后**第一条** `work gear … to=idle` 行（或日志尾）」的连续区间；区间内**无** `anim slot key=events.read|starry|scared|happy` 行，且**新鲜期内无清档行**。
- **AC31①（桩测 · 假时钟）**：对**真实 `pickBubble`** 跑合成时间线——思考档 t=0 弹 1 条 → 工具档 t=5 s 进入 ⇒ **0 条**（全局下限 10 s）→ 工具档 t=12 s ⇒ **弹 1 条**（同档首次 ∧ 全局 ≥10 s；**改前树必红**）→ 同档 t=15 s ⇒ 0 条（同档一次）→ 思考档 t=30 s ⇒ 弹 1 条（同档 ≥30 s ∧ 全局 ≥10 s）。
- **AC31②（符号级）**：`WORK_BUBBLE_GLOBAL_GAP_MS === 10000` **定义恰 1 处** ∧ `WORK_BUBBLE_MIN_GAP_MS === 30000`；文案表逐字未改 ∧ 收尾档无键。

### 3.5 B19 用例表

| 用例 | 类型 | 输入 / 前置 | 预期输出 | 映射 |
|---|---|---|---|---|
| TC-21 | 正常 | 无会话活动（空目录 / 仅无在途回合的记录） | 无 `work gear` 行；桌宠与今天逐位一致（链照常运转） | US-20 / AC16、AC18 |
| TC-22 | 正常 | 一轮真实会话（含工具调用） | `work gear` 依次出现 generation→tool→收尾三档；`work-done` **至少 3 s**（`WORK_DONE_HOLD_MS` 的下界）且**在记录新鲜期内不回落 idle**（**B26 / 修正轮 1 起**：保持条维持）⇒ 记录陈旧后才出现 `work gear … to=idle` 清档行 | US-20 / AC18 |
| TC-23 | 正常 | 多候选档连续两次进入（如两轮会话） | 档内轮换：两次 `pick` 不同（避开上一次）——由链的 `nextInSlot` 承担，本批不新增轮换逻辑 | US-20 / AC16、AC18 |
| TC-24 | 边界 | 工作档在途时点击桌宠（`happy`，1.6 s） | 交互档覆盖 → 回到 idle 后 ≤1 s 重断言回工作档（`work reassert` 行在场）；若期间链内事件段未播完 ⇒ 不硬切（B18 §2.2.4 规则 3） | US-21 / AC18 |
| TC-25 | 边界 | 工作档在途时拖动窗口（含跨屏） | 拖动跟手 / 几何日志与现状逐位一致；拖动期间无重断言行；松手后恢复工作档 | US-21 / AC19 |
| TC-26 | 边界 | 工作档在途持续 2 min（回合不结束） | 不入睡、不散步（链照常档内轮换）；回合结束后回 idle 且入睡计时重排（后续 2 min 可正常入睡） | US-21 / AC19 |
| TC-27 | 边界 | 开关运行期开 → 关 → 再开（不重启） | 关：读面停、清档回 idle、零新日志行；开：立即读一次并生效 | US-23 / AC20 |
| TC-28 | 错误 | 读面目录不存在 / 为空 | `work diag reason=…` 恰一条；无异常堆栈；桌宠行为完全照旧 | US-23 / AC20 |
| TC-29 | 错误 | 记录 JSON 破损（单档） | 跳过该档；若无可解析记录 ⇒ 停用 + 诊断行；**不抛异常、不报错弹窗** | US-23 / AC20 |
| TC-30 | 错误 | 形态换代（`turnBoundary.ver = 3` 或 `sessionStats` 无 `pendingCalls`） | 停用 + `work diag` 一条（**不误报**为任意工作档）；行为 = 今天 | NFR-17 / AC20 |
| TC-31 | 错误 | 陈旧记录（回合在途 ∧ mtime 超 60 s，模拟后端被强杀） | 清档回 idle + 诊断行（每记录至多一条）；不永久停在忙碌档 | NFR-15 / AC20 |
| TC-32 | 边界 | 多会话共存（一条在途 + 一条已结束；再测两条均在途） | 取在途者；两条均在途 ⇒ 取 `lastTurn` 大者；结果与输入文件顺序无关（同一输入多次扫描同结果） | US-20 / AC16 |
| TC-33 | 边界 | 散步 / 跑步在途（`walk-*` / `run-*`）时工作档派生进入（回合开始或工具调用落盘） | **让位**（§2.8.4 共同门）：本 tick 不下发——散步段内无工作段名的 `anim switch` 行、无 `work reassert` 行、`work gear` 行不刷（`lastGear` 不更新）；散步段末（既有 `doWander` 置 `idle`）后的**首个 tick（≤ 1 s）**下发工作档 ⇒ 工作段名的 `anim switch` 行与 `work gear` 行在场 | US-20、US-21 / AC18 |
| **TC-34** | 正常 | 工作档在途（`work-thinking` / `work-working`）持续 ≥ 5 min（无用户输入） | 窗口（= `work gear … to=work-*` 行到其后**第一条** `work gear … to=idle` 行的连续区间）内**无** `anim slot key=events.read|starry|scared|happy` 行，且**记录新鲜期内无清档行**；工作档自身的 `anim slot` / `work reassert` 行照常 | US-21 / AC24 |
| **TC-35** | 边界 | 工作档在途时：① 点击鲸鱼娘；② 喂食一次 | 两者仍压过工作档（`anim slot key=events.happy` / `events.eat` 行在场 + `work reassert` 行在交互档结束后 **≤1.5 s** 出现 = tick 周期 1 s + 定时器抖动余量）——**让位不停用用户输入触发** | US-21 / AC24 |
| **TC-36** | 异常 | 档位干净地不在途（`lastGear === null`：记录陈旧 / 无选中记录 / 开关关）且无其它阻挡 | 自主小动作照旧可起步（`anim slot key=events.read|starry|scared|happy` 行在场）——保持条**有界**，不把功能关掉 | US-21 / AC24 |
| **TC-48** | 正常 | **保持条（桩测 · 假时钟）**：合成时间线 = ① 在途（工具）20 s → ② 回合结束 → ③ 记录新鲜 ∧ 无在途，时钟推进 10 s → ④ `mtime` 推过 `WORK_STALE_MS` | ① `work-working`；② `work-done`；③ **仍是 `work-done`**（保持条；**≠ `null`**）；④ 清档 `null`；另断言：基线建分支（记录切换）输出 = 上一档位（`prev.gear`） | AC24 |
| **TC-49** | 边界 | **节流（桩测 · 假时钟）**：思考档 t=0 → 工具档 t=5 s → 同档 t=12 s → 同档 t=15 s → 思考档 t=30 s | t=0 弹 1 条（思考）· t=5 s **0 条**（跨档全局下限 10 s 未到）· t=12 s **弹 1 条**（工具；改前树必 0 条）· t=15 s 0 条（同档一次）· t=30 s 弹 1 条（同档 ≥30 s ∧ 全局 ≥10 s）· 任意相邻两条 ≥10 s | AC31 |

### 3.6 B19 验证手段与限制

**验证手段（三类，全部用现成工具，不新引入测试框架）**

1. **桩测（机器证据，主）**：`node .thincoder/b19-pet-work-stub.mjs`——装载**真实** `pet-work-core.js`（双环境导出，承 DD-14）与 `pet-chain-core.js`（池校验）；末行 `pass/total PASS`，非零退出即失败。
  - **断言面细目（AC16 / AC17 的判据面）**：① 常量逐值（白名单式）；② 记录选取四段判据（在途优先 / `lastTurn` 大者 / mtime 新者 / 文件名升序）+ 确定性（同一输入多次同结果）；
  - ③ 形态守卫（`ver` 不符 / `openStep` 缺 / `pendingCalls` 非对象 ⇒ unavailable）；④ 陈旧守卫（在途 ∧ mtime 超 60 s ⇒ 清档）；⑤ 派生四态 + 边沿优先级（工具优先于思考）；
  - ⑥ 收尾边沿（在途 → 非在途）与 3 s 保持；⑦ 气泡节流（同档一次 / 间隔 ≥ 30 s / 收尾档不弹）；⑧ 池数据（`parsePool` 仍 `ok=1` + 三键引用名逐条存在）；
  - ⑨ **B26 / 修正轮 1 面**：`deriveGear` 的**保持条**（合成时间线 + **注入假时钟**：在途 → 收尾 → 保持期 ⇒ 档位维持；把 `mtime` 推过 `WORK_STALE_MS` ⇒ 清档）· `pickBubble` 的**按档 + 全局下限**（同一假时钟：跨档 12 s ⇒ 弹；同档 < 30 s ⇒ 不弹；任意两条 ≥10 s）——此二项**可区分改前 / 改后**（AC24① / AC31①）。
2. **日志（机器证据，辅）**：`BIGFISH_PET_DEBUG=1` ⇒ `userData/pet-anim.log`（行型见 §2.8.8），用于 AC18 / AC20 的端到端判据；
3. **探针 / 人工（观感证据）**：`probe-pet-media.js`（既有，不入包）用于 AC21 的帧 / 命中面抽证；无可见空白帧 / 档位观感**如实标注为人工判定**。

**限制（如实声明，防被误读为已覆盖）**

1. **档位覆盖不完整（已裁定收窄；补齐另批）**：等待批准 / 回合成功 / 回合失败三档**未实现**（读面不存在，§1.3.5 / O11–O13）——**用户 2026-09-18 已裁定本批 = 可观测三档**，补齐 = 后置批 B22；验收时**不得**以「三档全绿」读作「六档已覆盖」；
   - **短回合（< 5 s 且 < 200 事件）的「生成 / 工具」两档不可观测**（修正轮 1 #4 的残余缺口）：该时长内记录无任何中间落盘（写盘节流 5 s / 200 事件）⇒ 只有**收尾档**可观测（由 `turn/end` 强制 flush 的 `lastTurn` 增量驱动，§2.8.2 规则 5）。「短回合看不出思考 / 忙碌」是读面事实，非缺陷；
   - **让位在途可能吞掉收尾档**（修正轮 1 #3 的既定代价）：`work-done` 的 3 s 保持期与共同门（拖动 / 散步 / 交互档在途）重叠且让位时长 > 3 s 时，该次收尾档**不出现**（不补演）；验收时不得读作档位序列缺失（AC18 以无让位场景取证）。
2. **状态识别时延（6 s）为设计期给定值**（= 写节流 5 s + tick 1 s），无实测依据；首轮实测后可回调（回调归需求层）；
3. **只读面依赖 Harness 内部形态**：以 `ver` 守卫 + 降级封口防御（形态一变即停用，不猜测）；风险登记 O11 / O16；
4. **多会话选取为启发式**（§2.8.1 四段排序）：多条在途会话下只能保证「确定性」，不能保证「用户心里的那一条」；本机常态 = 单会话；
5. **工作档在 PNG 通道下只显示待机帧**（无 PNG 工作素材，也不新增）——该口径下「看不出在干活」是预期行为，非缺陷；
6. **收尾档（`work-done`）的素材语义借用**：`工作状态-清点归档` 在样本里属「工具完成回整理」，本批用作「回合收尾」——属**语义借用**；**U-6 已裁定 2026-09-18 = ①**（裁定对象 = 含收尾档的三档集合）⇒ 本批按此采用；若 B22 引入成败档 ⇒ 素材使用面重新评估。
7. **B26 让位面的残余（不覆盖，如实声明）**：保持条的覆盖端 = **记录新鲜期**；三段残余（首个工作档出现前 / 无选中记录 / 记录陈旧）与今天同形（§2.12.3）；**收尾档的可见时长**自 B26 起由「3 s」变为「至多 60 s 或至下一档到来」（O19 改写）——验收时不得把这些读作缺陷。

---

### 3.7 B21 验收标准逐条回指（AC25–AC30）

| 验收 | 回指需求 | 判定方式 | 机检可能性 |
|---|---|---|---|
| AC25 | US-29 | **分类契约与池数据**：① 分类表在场（§2.13.3）；② `parsePool` `ok=1` ∧ `events.drag` / `events.escape` 在场各 1 段 ∧ 引用名逐条存在于 `webm/`；引用段 94 → 95（未引用 12 → 11）（**B27 修订**：引用 94 / 未引用 12，细目同 AC34④）；③ 日志——拖动期 `anim slot key=events.drag` ∧ 逃生 `anim switch … reason=slot-escape` | 机检（桩测池数据 + 日志） |
| AC26 | US-29 | **交互档打断（在途不换段）**：① 交互档在途（`drag` / `escape` / `happy` / `eat` 段播期间）⇒ 该段区间内**无中途顶掉**换段（判据细目 = 注 G）；② 点击从个人动作切入 ⇒ `anim switch reason=slot-happy` 且 `shown − t0 ≤ 300 ms`（**无容差**，NFR-9 同口径） | 机检（日志） |
| AC27 | US-30、NFR-23 | **衔接**（细目 = 注 E）：① 换段行带 `overlap=<ms>`；② 链自主换段行 `overlap ∈ [N − 250, N + 250]` 或 0（0 = ended 兜底行）；③ 段末前触发占比 ≥ **0.9**；④ 叠化窗内两路 `paused=false`、**窗后稳态**恒 1 路（ended 兜底行豁免）；⑤ `PET_OVERLAP_MS` 定义恰 1 处 ∧ 消费恰 1 处；⑥ **人工项**——衔接观感待用户实机目视 | 机检（日志 + 探针 + 静态）；⑥ 人工 |
| AC28 | US-30 | **零空白帧不回退**：① AC4 三条禁止形态零命中（§2.2.5 第 5 条静态核对）；② **全部**换段行 `readyState ≥ 2`；③ ended 触发（`overlap=0`）的换段 `ended → shown ≤ 300 ms`；④ 无「旧段 `pause()` 早于新段 `readyState ≥ 2`」路径（`pause()` 唯一调用点 = 淡出窗末回调） | 机检（静态 + 日志） |
| AC29 | US-31 | **逃跑**（细目 = 注 F）：① 逃生档名 = `escape-left` / `escape-right`（`reason=slot-escape`）；② 一次逃跑内同段重复到达 ⇒ `anim hold reason=same same=1`；③ 折返 / 翻转 ⇒ `anim hold reason=mirror`；④ 触发窗口内无 `reason=slot-idle` 换段行；⑤ 触发面零改动（`shell-pet-drag.js` 零 diff）；⑥ **人工项**——逃跑观感待实机目视 | 机检（日志 + git + 静态）；⑥ 人工 |
| AC30 | NFR-23 | **零回退与规范**：① 零改动面 13 档逐档 `git diff --stat` 空（§2.13.8）；② `package.json` 依赖段与 `build.files` 零 diff；③ 素材零 diff ∧ `pool.json` 只增两个 `events` 键；④ 改动档行宽 ≤300 / 单档 ≤500 / 文件头标准形；⑤ `PET_OVERLAP_MS` 单点（同 AC27 ⑤） | 机检（git + 静态） |

**注 E —— AC27 判据细目（衔接）**

- **`overlap` 字段定义**：换段触发时刻距旧段**估计**自然结束的剩余毫秒数（实测；ended 兜底 ⇒ 0；用户触发 / 档位驱动换段 ⇒ 0）。
- **判据带（双向容差；单向论证不成立）**：预触发定时器标称在估计结束前 `PET_OVERLAP_MS` 触发；JS 定时器**只晚不早**（回调延迟 δ ≥ 0 ⇒ 实测 `overlap = N − δ ≤ N`）——但 `overlap` 按**估计**自然结束计时（`duration` 元数据 / 帧级结束判定与实际的偏差）⇒ 段长估计误差的另一向可致实测 `overlap > N`。因此带 = **[N − 250, N + 250]**（250 = 回调调度 + 段长估计的**双向**容差上界）。
  批次档 §2.4 的「[N, N+250]」与 §2.8 续节的「[N − 250, N]」均为**单向**口径笔误，**以本档为准**。
- **「或 0」的归属**：`overlap = 0` 只属于**链自主换段的 ended 兜底行**（`duration` 不可得 / 预触发未武装 ⇒ `ended` 照旧决策，`reason ∈ {ended, event-end, slot-rotate}` 的兜底路径）与**非链自主换段**（用户触发 / 档位驱动，不计入 ② 的带判据、也不计入 ③ 的分母与分子）；预触发行（`reason=pre-end`）的 `overlap` 恒 > 0。
- **段末前触发占比**：`overlap > 0` 的链自主换段行 / 链自主换段行总数 ≥ 0.9（取样 = `npx electron probe-pet-media.js --chain 600` 窗口）。
- **探针叠化窗采样（④）**：`--chain` 驱动期内注入两路 `paused` 状态采样（≥ 每 10 ms，与既有 `--entry` 入场采样同款注入形态）——叠化窗 = 换前台到淡出窗末的区间；判据 = 窗内两路 `paused=false`、**窗后稳态**恒 1 路 `paused=false`；**采样豁免** = ended 兜底行（旧段已自然结束 ⇒ 叠化窗不成立 ⇒ 该行窗口不采「两路」判据——其「新段就绪后恒 1 路」由 AC28 ② 的 `readyState ≥ 2` 判据面覆盖；[D, D+L] 内 0 路在播是 ended 路径的物理事实，非违例）。
- **探针与桩测增量**：`probe-pet-media.js` 的叠化窗两路播放 / `overlap=` 读数 / 拖动档 / 逃跑档取证 + 新建 `.thincoder/b21-pet-selection-stub.mjs`（`decideNext` / `judgeSwitch` 装载真实实现；末行 `pass/total PASS`）——文件与增量预算 = 批次档 §2.3 第 6 / 7 行。
- **注 E′（AC27 判据的 B27 修订注记；源 = §2.14.11 C61）**：自 B27 起：②「或 0」的归属扩展——`overlap = 0` 的必要性主要来自**静默出行**（`reason=quiet-end`：静默段 `loop=true` 无自然结束 ⇒ 无预触发窗口 ⇒ 0）与 ended 兜底；**入静默行**（`reason=quiet`）走既有两触发——预触发 ⇒ `overlap ≈ PET_OVERLAP_MS`、`ended` 兜底 ⇒ 0；
  ③ 段末前触发占比的分母与分子**排除静默行**（分母 = 链自主换段行中 `reason ∉ {quiet, quiet-end}` 者）；链自主换段定义（§2.13.4）同步扩为 `{pre-end, ended, event-end, slot-rotate, quiet, quiet-end}`。

**注 F —— AC29 判据细目（逃跑）**

- **「一次逃跑」的窗口口径**：`escape-*` 换段行（`shown`）到其后第一条非 escape 段换段行（`shown`）的区间；同段重复到达的取证标记 = `anim hold reason=same same=1`。
- **折返 / 方向翻转的取证**：`anim hold reason=mirror`（不重载）——R2 对 `walk-*` / `run-*` / `escape-*` 同判据（机制同源，§2.13.5）。
- **⑤ 的机检**：`git diff --stat` 对 `shell-pet-drag.js` 空 + 静态核对 `doWander` 函数体（除档名一行外逐字不动）。

**注 G —— AC26 ① 判据细目（交互档打断；区分「中途顶掉」与「段末衔接退场」）**

- **区间口径**：交互档换段行（`shown`）到其后第一条非交互档换段行（`shown`）的区间（与注 F「一次逃跑」的窗口口径同形）。
- **违规面（中途顶掉）**：区间内由 idle / 个人档驱动的换段行零命中——非本档的档位驱动 `slot-*`（`slot-idle` / `slot-read` / `slot-starry` / `slot-scared` / `slot-walk-*` / `slot-run-*` / `slot-work-*` 等）；交互→交互的合法切换（`slot-escape` 入逃生档、交互中再次点击 / 喂食等用户触发切换）**不在违规面**（US-30 口径「交互不受牵连」：用户触发的切换仍立即发生）；
- **合法面（段末衔接退场）**：区间内的换段只允许**链自主换段集合**（§2.13.4：`reason ∈ {pre-end, ended, event-end, slot-rotate}`）与**交互→交互的合法切换**（`slot-escape` 入逃生档、交互中再次点击 / 喂食等用户触发切换——换段行同属交互档 ⇒ **区间延续**、**不构成**违规）——`pre-end` 须落在段末前 `PET_OVERLAP_MS` 内；`anim chain` 行（链决策行）在场**不构成**违规（预触发使合规实现的交互段窗口内必然出现链决策行）；
- **可区分改前 / 改后树**：改前字面「段播期间无 `anim chain` 行」在**合规 B21 树**上必红（预触发必然产生链决策行）——本判据取代该字面：改前树无 `reason=pre-end`，改后树的合法退场恰由它承载。

**人工项（如实分列，待用户实机目视）**

- 衔接观感（AC27 ⑥）——叠化是否自然、旧段收尾被跳过是否可接受；
- 拖动档观感（AC25）——拖动中悬空反馈段是否贴合（批次档 §2.6 标定项 2）；
- 逃跑观感（AC29 ⑥）——复用跑步段的逃跑观感（批次档 §2.6 标定项 3）。

### 3.8 B21 用例表（TC-37–TC-47）

> 验证手段（三类，承 §3.3 / §3.6 形态）：① 桩测 `node .thincoder/b21-pet-selection-stub.mjs`（`decideNext` / `judgeSwitch` 装载真实实现，末行 `pass/total PASS`）；② 探针 `npx electron probe-pet-media.js --chain 600`（`overlap=` 读数 / 叠化窗两路采样 / 拖动档 / 逃跑档取证）；③ 日志与人工（`BIGFISH_PET_DEBUG=1` ⇒ `userData/pet-anim.log`；观感项如实标注）。

| 用例 | 类型（正常/边界/异常） | 输入 / 前置 | 预期输出 | 映射 |
|---|---|---|---|---|
| TC-37 | 正常 | 池含 `events.drag` / `events.escape` 两新键；`parsePool` | `ok=1`（V1–V6 全过）；引用段 95 / 未引用 11（**B27 修订**：引用 94 / 未引用 12）；零改动面逐档零 diff + 常量单点（同轮核 AC30） | US-29 / AC25、AC30 |
| TC-38 | 正常 | 按住鲸鱼娘拖动一段后松手（起拖 → 拖 → pointerup） | 拖动期 `anim slot key=events.drag pick=被吓一跳`（B27 修订；原 = 被鼠标拖拽悬空反馈）∧ switch 行 `loop=1`；松手回链（idle 换段正常） | US-29 / AC25 |
| TC-39 | 正常 | 个人动作在途时点击鲸鱼娘 | `anim switch reason=slot-happy` 且 `shown − t0 ≤ 300 ms`；happy 段窗口内**无中途顶掉换段**（由 idle / 个人档驱动的换段行零命中——交互→交互的合法切换**不在违规面**、**区间延续**、不构成违规；细目 = 注 G）；段末前 `PET_OVERLAP_MS` 内的 `reason=pre-end` 换段与 `anim chain` 行 = **段末衔接退场、不违规**；随后 1.6 s 定时回 idle（既有节奏不变） | US-29 / AC26 |
| TC-40 | 正常 | 把她拖到屏幕边缘松手（触发挣脱逃跑） | `anim switch … reason=slot-escape`（`anim` = 池内逃跑段、`loop=0`（B27 修订；细目 = TC-55）、档名 = `escape-<反方向>`）；escape 段播至段末前 `PET_OVERLAP_MS` 经 `reason=pre-end` 换段（段尾由叠化退场；存活 ≈ 段长 − `PET_OVERLAP_MS` ± 250 ms） | US-31 / AC29 |
| TC-41 | 边界 | 逃跑 / 走动在途，同段重复到达（再次触发同槽同段） | `anim hold reason=same same=1` 在场；该区间零同段名第二个 switch 行（不回到第一帧） | US-31 / AC29 |
| TC-42 | 边界 | 折返 / 方向翻转（`walk-*` / `run-*` / `escape-*` 镜像翻转） | `anim hold reason=mirror` 在场；无重载（无新 switch 行、无 load） | US-31 / AC29 |
| TC-43 | 边界 | `moves.run` 单段槽高频重入（run → idle → run 连切） | 折返瞬态 idle 预载被 gen 竞态丢弃（无 `reason=slot-idle` 换段行）；第二次 run 重入被 R1 / R2 吸收（无同段短间隔二次 switch）——不再反复从头重来 | US-31 / AC29（R1 / R2 面） |
| TC-44 | 正常 | 链长跑 600 s（探针 `--chain 600`） | 全部换段行带 `overlap=<ms>`；链自主换段 `overlap ∈ [N − 250, N + 250]` 或 0；段末前触发占比 ≥ 0.9；`ended → shown ≤ 300 ms`（ended 兜底行） | US-30 / AC27、AC28 |
| TC-45 | 边界 | 系统开启「减少动态效果」（`--reduce`） | 叠化时长归零（旧段在换前台后即刻 pause）；预触发仍在；AC4 三禁止形态零命中；链照常换段 | US-30 / AC27、AC28 |
| TC-46 | 边界 | 叠化窗探针采样（`--chain` + 两路 `paused` 注入） | 叠化窗内两路 `paused=false`；窗后稳态恒 1 路 `paused=false`（ended 兜底行豁免） | US-30 / AC27 |
| TC-47 | 异常 | ① 池缺 `events.escape` 键；② 预载 / 播放失败（`duration` 不可得 / play-fail） | ① 级② 该档走 PNG（渲染待机帧，不空白不报错）；② `ended` 兜底换段（`overlap=0`）或级③ 回落；AC4 三禁止形态零命中、无未捕获异常 | US-31 / AC25、AC28 |

---

### 3.9 B27 验收标准逐条回指（AC32–AC35）

| 验收 | 回指需求 | 判定方式 | 机检可能性 |
|---|---|---|---|
| AC32 | US-32 | **节奏机制（桩测 + 池数据 + 静态）**：① 桩测——`decideNext` 判定矩阵（slot × kind × quiet 全组合，注入 roll）+ 静默段回退（细目 = 注 H①）；② 池数据——`parsePool` `ok=1` ∧ 权重 / `events.quiet` 逐值（注 H②）；③ 静态——`PET_QUIET_MS` 定义恰 1 处 | 机检（桩测 + parsePool + 静态） |
| AC33 | US-32 | **节奏运行期（日志面）**：① 动作类段末 ⇒ `reason=quiet` + `anim quiet enter`；② 静默区间（`anim quiet enter` → `anim quiet end`，细目 = 注 H②）零 `anim chain` / 零其它 `anim switch` 行；③ 时长 == `PET_QUIET_MS`（+500 ms）；④ 打断 ⇒ `anim quiet end reason=slot` 且 `shown − t0 ≤ 300 ms`；⑤ idle 段零 quiet 行（细目 = 注 H） | 机检（日志） |
| AC34 | US-33 | **逃跑与拖拽表达**：① 桩测——`judgeSwitch` 扩展矩阵（注 H）；② 运行时——`slot-escape` 行 `loop=0` ∧ 触发窗口零 `slot-idle` 换段 ∧ 存活口径 = 注 H②；③ 折返 / 重入 ⇒ `anim hold` 行在场、零二次 switch；④ 池——`events.drag` = 被吓一跳 ∧ 引用 95 → 94（注 H）；⑤ 静态——`ESCAPE_LEG_*` 各定义恰 1 处；⑥ **人工项**——观感待实机目视 | 机检（桩测 + 日志 + 静态）；⑥ 人工 |
| AC35 | NFR-24 | **零回退与规范**：① 零改动面 15 档逐档 `git diff --stat` 空（§2.14 的零改动面清单）；② `package.json` 依赖段与 `build.files` 零 diff；③ 素材本体零 diff ∧ `pool.json` 只增 `events.quiet` 键、改 `events.drag` 引用（其余键值逐字）；④ 改动档行宽 ≤300 / 单档 ≤500 / 文件头标准形；⑤ 交互即时性——静默期内用户触发换段 `shown − t0 ≤ 300 ms`（同 AC33④） | 机检（git + 静态 + 日志） |

**零改动面（本批；AC35① 的机检对象）**：`shell-pet-geometry.js` · `shell-pet-drag.js` · `pet-preload.js` · `pet.html` · `pet.js` · `shell-pet-work.js` · `pet-work-core.js` · `main.js` · `shell-ipc.js` · `package.json` ·
  `assets/pet-anim/webm/**` · `assets/pet-new/**` · `THIRD-PARTY-NOTICES.md` · `README.md` · `版本说明.txt`。

**注 H —— AC32–AC34 判据细目（B27；表行为主干，本注为同源细目）**

- **AC32①（判定矩阵；注入 roll 保确定性）**：`slot='idle' ∧ quiet=false ∧ playing.kind∈{action,turn}` ⇒ `plan='quiet'`；`kind∈{idle,event,walk,run,quiet}` ⇒ 非 quiet；`quiet=true` ⇒ 非 quiet；`slot≠'idle'` ⇒ 非 quiet；`events.quiet` 缺失 ⇒ 静默段回退 `pool.idle[0]`；`kind='turn'` 段末 ⇒ `plan='quiet'` ∧ 翻转标记保留（翻转照执行）。
- **AC32②（池数据逐值）**：`parsePool`（真实实现）`ok=1`（V1–V6 全过）∧ `weights={idle:55,turn:5,move:0}` ∧ Σcategories == 40 ∧ `events.quiet` 在场 ≥1 段。
- **AC33①**：动作类段（`action` / `turn`）段末 ⇒ `anim switch … reason=quiet loop=1` + `anim quiet enter name=<段> dur=<ms>`。
- **AC33②**：静默区间 = `anim quiet enter` 行 → 其后第一条 `anim quiet end` 行（`reason ∈ {timer, slot}` 均收）；区间内零其它 `anim switch` 行、零 `reason=quiet` 系以外的换段行；计时退出路径的回链换段行（`reason=quiet-end`）在 `anim quiet end` 之后（区间外，显式豁免——计时退出恒回链重掷、零 `anim chain` 决策行）。
- **AC33③**：静默时长 == `PET_QUIET_MS`（`enter` → `end` 间隔，+500 ms 容差，定时器只晚不早）。
- **AC33④**：静默期内点击 / 喂食 / 拖动 / 散步 / 工作档 ⇒ `anim quiet end reason=slot` 先于对应换段行，且换段 `shown − t0 ≤ 300 ms`。
- **AC33⑤**：idle 段（kind=idle）段末 ⇒ 零 quiet 行。
- **AC34①**：`judgeSwitch` 扩展矩阵——`loop=false ∧ slotKey=escape-* ∧ 同名同镜像` ⇒ `hold-same`；同名异镜像 ⇒ `hold-mirror`；非 escape 的 `loop=false` ⇒ `reload`。
- **AC34②**：`reason=slot-escape` 行 `loop=0` ∧ 触发窗口（注 F 同口径）内零 `reason=slot-idle` 换段行 ∧ escape 存活 ≈ 段长 − `PET_OVERLAP_MS` ± 250 ms（≈ 8.84 s；依据 = `loop=false` ⇒ 段末前 1200 ms 预触发换段，预载 ≤300 ms 计入容差）。
- **AC34③**：折返 / 重入 ⇒ `anim hold reason=mirror|same` 行在场、零同段名二次 switch。
- **AC34④**：`events.drag` 引用名 == 被吓一跳 ∧ `parsePool ok=1` ∧ 引用段 95 → 94 / 未引用 11 → 12（登记项）。
- **AC34⑤**：`ESCAPE_LEG_MIN_DIP` / `ESCAPE_LEG_RANGE_DIP` / `ESCAPE_LEG_SPEED` 各定义恰 1 处。
- **AC34⑥（人工项）**：逃跑 / 拖拽观感待实机目视（批次档 §2.6 标定项 ②③）。

### 3.10 B27 用例表（TC-50–TC-58）

> 验证手段（三类，承 §3.3 / §3.6 形态）：① 桩测 `node .thincoder/b27-pet-feel-2-stub.mjs`（`decideNext` / `judgeSwitch` 扩展装载真实实现 + 池数据 `parsePool`，末行 `pass/total PASS`）；② 探针 `npx electron probe-pet-media.js --chain`（换段 / 静默行取证）；③ 日志与人工（`BIGFISH_PET_DEBUG=1` ⇒ `userData/pet-anim.log`；观感项如实标注）。

| 用例 | 类型（正常/边界/异常） | 输入 / 前置 | 预期输出 | 映射 |
|---|---|---|---|---|
| TC-50 | 正常 | 池含新权重与 `events.quiet`；链长跑（≥ 3 个周期） | 动作类段末 ⇒ `reason=quiet` + `anim quiet enter`；静默区间（`anim quiet enter` → 第一条 `anim quiet end`，`reason∈{timer,slot}` 均收）零其它 `anim switch` 行（计时退出的 `reason=quiet-end` 换段行在其后）；`quiet end` 间隔 == `PET_QUIET_MS`（+500 ms）；静默后回链重掷（= 该行） | US-32 / AC32、AC33 |
| TC-51 | 边界 | 静默期内点击鲸鱼娘 | `anim quiet end reason=slot` 先于 `reason=slot-happy` 换段行；`shown − t0 ≤ 300 ms`；happy 1.6 s 回 idle 后链重掷（不立即回静默） | US-32 / AC33④ |
| TC-52 | 边界 | 静默期内散步段到达（15–35 s 计时到点） | `anim quiet end reason=slot` + `slot-walk-*` 换段行在场；段末回 idle 链照常 | US-32 / AC33④ |
| TC-53 | 边界 | 链掷出 idle 类段（kind=idle）并播完 | 段末**零** quiet 行（idle 段不触发静默——§2.14.4 候选 1）；随后掷出 action 段 ⇒ 其段末进入静默 | US-32 / AC32、AC33⑤ |
| TC-54 | 异常 | 池缺 `events.quiet` 键 | 静默段回退 `pool.idle[0]`（桩测面）；链不崩、静默行为照常 | US-32 / AC32① |
| TC-55 | 正常 | 拖到屏幕边缘松手（触发挣脱逃跑） | `anim switch … reason=slot-escape` 且 `loop=0`；触发窗口（注 F 同口径）内零 `reason=slot-idle` 换段行；escape 段播至段末前 `PET_OVERLAP_MS` 经 `reason=pre-end` 换段（存活 ≈ 段长 − `PET_OVERLAP_MS` ± 250 ms ≈ 8.84 s；段尾由叠化退场） | US-33 / AC34② |
| TC-56 | 边界 | 逃跑在途撞墙折返（同段重入 / 镜像变化） | `anim hold reason=mirror|same` 行在场；零同段名二次 switch 行（不回到第一帧） | US-33 / AC34③ |
| TC-57 | 正常 | 按住鲸鱼娘拖动（起拖 → 拖 → 松手） | 拖动期 `anim slot key=events.drag pick=被吓一跳`；松手重断言当前槽 | US-33 / AC34④ |
| TC-58 | 正常 | 桩测判定矩阵（`decideNext` / `judgeSwitch` 全组合，注入 roll） | AC32① 与 AC34① 的矩阵逐条断言；末行 `pass/total PASS` | US-32、US-33 / AC32①、AC34① |

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
| 2026-09-17 | **B19 建档**（桌宠工作状态联动 = 外部项目移植 D1 面）：新增 §1.3.5（只读数据面能力审计）· §2.6 六处选型对比 · §2.7 分层 · §2.8 契约 · §2.9 受影响文件 · §2.10 DD-17…DD-26 · §2.11 冲突核对 C34–C44 + 观察项 O11–O17 · §3.4 AC16–AC22 · §3.5 TC-21…TC-32。待裁定 = U-1…U-6（U-6 为本批新发现）。B18 内容逐字未改。 |
| 2026-09-18 | **修正轮 1（评审轮 1 · 13 条 + 2 备注；源 = §3）**：§1.1 回指 · §1.3.5 注 W1 · §2.7 注入面 + 开关传播面 · §2.8.1 I/O 与白名单 · §2.8.2 规则 5 · §2.8.4 注 C + 重断言改写 · §2.8.7 封存语义 · §2.9 零改动面 11 口径 · §3.4 **AC23** + 注 B · §3.5 **TC-33** · §2.11 O18–O19。**计数：AC 23 · TC 33 · DD 26 · C 44 · O 19**；选型 / U-6 / 三档集合零改动。 |
| 2026-09-18 | **定稿轮（U-6 裁定回填 · 状态收口；源 = 用户 2026-09-18 裁定「U-6 = ① 可观测三档」+「六档补齐 = 事件桥批 B22」）**：§2.6 注 / §2.6.1 结论列 / §2.6.2 标题与 A+C 行（A 的否决理由 1 → **2 条**）/ §2.8.3 / DD-18 / O11–O13 · O17 / §3.6 限制 1、6 / §1.1 / §2.9 / DD-24（U-1…U-6 状态词收口）。**无新语义**：AC 22 · TC 32 · DD 26 · C 44 · O 17 计数不变。 |
| 2026-09-18 | **B26 面落档（F1 / US-21：自主触发让位）**：新增 **§2.12**（含 **DD-27**）· §2.8.4 增**注 D** · §1.1 US-21 行 · §2.9 尾补 B26 文件表指针 · §2.11 增 **O20 / O21** · §3.4 增 **AC24** · §3.5 增 **TC-34–36**。**F3 未纳入本批**（⇒ 打回：O21 / 批次档 §2）。**计数：AC 23 → 24 · TC 33 → 36 · DD 26 → 27 · C 44 · O 19 → 21**（末位编号）。 |
| 2026-09-18 | **B26 修正轮 1（评审轮 1：🔴1/🟡9/🔵2；源 = §3 + 裁决）**：① **F1 改向** = 档位保持（§2.8.2 规则 7）+ 补漏门 ⇒ §2.12 重写（DD-27/DD-37）、注 C/D、O19/O20、AC24、TC-22/34–36/48；② **F3 纳入** ⇒ §2.8.5 节流（同档 ≥30 s ∧ 跨档 ≥10 s）、AC31、TC-49、§3.6 ⑨；③ 增 O27 与注 C、§1.1 同步。**计数：AC 25 · TC 38 · DD 28 · O 22**（跳号见 O27）。 |
| 2026-09-18 | **B26 修正轮 1 续做（上轮基础设施中断后续落）**：O20 补增量效力句（🟡#2 收口）；需求档 NFR-21 计数 6 → 9；批次档 §2.10 订正块落档；B16 行宽门禁合规（本档 B26 面 3 行 >300 改写，语义零变更）。计数不变。 |
| 2026-09-18 | **B26 修正轮 2（换机复审 3 条发现；源 = §3 轮次 2 + 裁决）**：① §2.8.4 背底档提供者行点名返回值语义（= 记忆档位 `lastGear`，**非派生档**）；② §2.12.3 ② 订正（增量效力 = ≤1 s（交互档 / 走动档收尾间隙）＋ 拖动在途子情形；原「散步走动档复位」分支 = 不可达订正、挣脱逃跑变体 = 可达；O20 · §2.12.1 行 2 同步）。计数不变（AC 25 · TC 38 · DD 28 · O 22）。 |
| 2026-09-18 | **B21 面落盘（动作选择规则：交互 / 个人分离 + 丝滑衔接 + 逃跑槽修复；源 = 批次档 `docs/batches/B21-pet-action-selection.md` §1 / §2）**：新增 §2.13（选型四组 / 常量表 / 分类契约 / 衔接机制 / R1·R2 / 两个交互档 / 池数据 / C45–C56 / O22–O26 / U-1…U-6 对照 / DD-28…DD-36）· §3.7 AC25–AC30（注 E / 注 F + 人工项分列）· §3.8 TC-37–TC-47。 |
| 2026-09-18 | **B21 面落盘（续）**：§1.1 回指表增 US-29…US-31 / NFR-23 四行 · 档头标题与回指 / 关联批次行同步 · §2.11 O27 补核销行（前向指针转实指针）。**计数：AC 25 → 31 · TC 38 → 49 · DD 28 → 37 · C 44 → 56 · O 22 → 27**。 |
| 2026-09-18 | **B21 修正轮 1（评审轮 1 🔴2/🟡3/🔵4；源 = §3 轮次 1 + 主 agent 逐条裁决）**：F-1 交互段退场口径（§2.13.3 / §2.13.4 补口径句 · **AC26 ① 重写**为「无中途顶掉换段」判据 · TC-39 同源订正）；F-2 B18 面规范同步（§2.2.4 规则 3 补第三触发 + 拖动窗旁路注 · §2.2.5 步骤 4 `pause()` 推迟到淡出窗末 · C45 / C47 表述同步）；F-3 淡出窗末 pause 回调失效守卫入 §2.13.4 竞态清单。 |
| 2026-09-18 | **B21 修正轮 1（续）**：F-4 「交互档」术语桥接入 §2.13.3 + C51；F-5 §2.13 头部体例注；F-6 注 E 双向容差 + 「或 0」归属 + AC27 ④ 采样口径；F-7 基准说明（§2.3 基准 = 09-18 亲测、与现树一致）；F-8 §2.2.3 计数口径注 + 单候选分支重启注 + §1.3.1 前向注；F-9 `PET_OVERLAP_MS` 依据指针订正（→ 文档地图 B21 行）。**计数不变（AC 31 · TC 49 · DD 37 · C 56 · O 27）**。 |
| 2026-09-18 | **B21 修正轮 2（复核轮 2 条 🟡；源 = 批次档 §3 轮次 2 + 主 agent 裁决就地收敛）**：F-10 注 G 违规面收窄为「idle / 个人档驱动」+ 显式排除交互→交互合法切换；合法面「只允许」集并入交互→交互合法切换（区间延续、不构成违规）——区间口径与改前后树区分不变；F-11 TC-44 带 = `[N − 250, N + 250]`、TC-46「窗外」→「窗后稳态（ended 兜底行豁免）」——与 AC27 ②④ / 注 E 一致。计数不变（AC 31 · TC 49 · DD 37 · C 56 · O 27）。 |
| 2026-09-18 | **B21 修正轮 3（TC-39 字面与注 G 收窄对齐；源 = 批次档 §2 修正轮 3）**：TC-39 预期输出「（非本档 `slot-*` 零命中）」→「由 idle / 个人档驱动的换段行零命中——交互→交互的合法切换不在违规面、区间延续、不构成违规」（细目 = 注 G）；TC-39 其余字面（`slot-happy` ≤300 ms · `pre-end` / `anim chain` 不违规 · 1.6 s 回 idle）不变；计数不变（AC 31 · TC 49 · DD 37 · C 56 · O 27）。 |
| 2026-09-19 | **B27 面落盘（观感 II；源 = 台账 R23 / R22）**：新增 **§2.14**（选型 / 常量 / 契约 / 池数据 / C57–C62 / O28–O30 / DD-38–DD-43）· §2.13 四处注记 · 注 A′ / 注 E′ · §3.9 AC32–AC35 + 注 H · §3.10 TC-50–TC-58 · TC-2 / 6 / 38 / 40 订正 · O22 / O24 处置 · §1.1 补 B27 行。**计数：AC 35 · TC 58 · DD 43 · C 62 · O 30**。 |
| 2026-09-19 | **B27 修正轮 1（评审轮 1 🔴#1–#3 / 🟡#4–#6 / 🔵#7–#10；源 = 批次档 §3 轮次 1 + 主 agent 裁决）**：① 静默区间锚改静默标记行（`anim quiet enter` → `anim quiet end`）六处同源 + 计时退出决策行豁免；② §2.2.3 / §2.13.8 escape `loop` 旧句补 B27 修订注（`loop=false` 单遍；drag 仍 `true`）；③ `turn` 翻转标记与计划类型解耦（§2.14.9 + 注 H①）。 |
| 2026-09-19 | 承上行（④–⑥）：④ 注 E′ ② 归因订正（入静默走既有两触发；「或 0」主要来自 `quiet-end` 与 ended 兜底）；⑤ AC34② / TC-55 存活口径「段长 − `PET_OVERLAP_MS` ± 250 ms」+ TC-55 去自相抵；⑥ AC25 / TC-37 池计数 B27 修订注（94 / 12）。**计数不变（AC 35 · TC 58 · DD 43 · C 62 · O 30）**。 |
| 2026-09-19 | **B27 修正轮 4（棒 B-1 评审 Deferred 🟡×2；源 = 批次档 §5.4 存疑 1/2）**：① §2.14.9 清除面补第 4 清除点（`onPlayFail` 入口即 `clearQuiet()`，播中出错短路防残留）；② 计时退出取证五处同源——「`anim chain` 决策行」→「`reason=quiet-end` 换段行」（§2.14.3 / §2.14.9 不变量 / 注 A′ ① / AC33② / TC-50）。**计数不变（AC 35 · TC 58 · DD 43 · C 62 · O 30）**。 |
