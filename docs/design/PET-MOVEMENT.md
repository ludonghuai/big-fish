# 设计档 PET-MOVEMENT — 桌宠位移仲裁与物理手感（B20）+ 落地 / 边界口径扩展（B26 / B27）

> 主题：**窗口位移的写权（谁在何时拥有位置写权）+ 物理手感（起飞阈值「缓放即停 / 快甩抛出」/ 甩抛 / 反弹 / 摩擦 / 静止 / Q 弹形变）**
> 落点：`docs/design/PET-MOVEMENT.md`（本主题的唯一权威句；落点判定见 §零）
> 需求档：`docs/requirements/PET.md` §三 US-24…US-28 / **US-34（B27）** / §四 NFR-18…NFR-22 / **NFR-25（B27）**（回指见 §1.1）
> 批次档：`docs/batches/B20-pet-physics.md`（§1 立案 / §2 本批任务书 / §5 实施记录 / §6 验收核销）· `docs/batches/B26-pet-feel.md`（F2 面）· `docs/batches/B27-pet-feel-2.md`（R21 面；§1 立案 / §2 本批任务书）
> 回指（不重述）：`docs/design/PET-MULTIMONITOR.md`（几何 / 停泊 / 尺寸纪律，B03）· `docs/design/PET-DRAG.md`（拖拽跟手，B01）·
> `docs/design/PET-ANIMATION.md`（动画链与工作档，B18 / B19）· `docs/design/SHELL-UX.md` §2.2.6（模块拆分与依赖注入纪律，B06）
> 状态：**已批准 · 已实施**（设计评审轮 3 = pass → 用户 2026-09-18 批准；实施与验收状态记批次档 `docs/batches/B20-pet-physics.md` §5 / §6——§6.1 结论 = 通过 ✓；本档不记勾销）。**B26 面**（落地口径 = 可见脚底 · F2 / US-24）已落 §2.2.13，**已批准 · 已实施**（批次档 `docs/batches/B26-pet-feel.md` §6 核销）。**B27 面**（边界口径四面化 · R21 / US-34）已落 §2.2.14，待设计评审与用户批准后实施。

---

## 零、落点判定（一主题一档）

本批的主题 = **「窗口位移的所有权 + 物理模型」**——既不是几何、也不是动画。逐候选判定（地图约定 = `docs/README.md` §一「设计档 = `docs/design/<主题>.md`，一主题一档」）：

| # | 候选落点 | 该档主题 | 判定 |
|---|---|---|---|
| 1 | `docs/design/PET-MULTIMONITOR.md` | 几何 / 停泊 / 尺寸纪律（B03） | **否决**——本批对几何面**零改动**（冻结面）；位移仲裁不是几何判定的延伸。写进去会让「几何面零 diff」与本档主题自相矛盾 |
| 2 | `docs/design/PET-ANIMATION.md` | 动画链引擎 + 工作状态联动（B18 / B19） | **否决**——该档主题 = 「播哪一段动作」；位移写权与它**解耦**（US-26 边界）。唯一接触点 = 链的 `pet-chain-move` 请求（O10 面），在本档 §2.2.9 一处引用即可回指，不回写该档 |
| 3 | `docs/design/PET-DRAG.md` | 拖拽跟手（B01） | **否决**——拖拽只是三个写者之一，且本批对它**零改动**（冻结面）；物理手感与位移仲裁不是「拖拽跟手」的延伸 |
| 4 | **本档（新建 `docs/design/PET-MOVEMENT.md`）** | 位移写权 + 物理手感 | **选定**——主题独立、写域独立、判据独立（AC 全部落本档）；与三档关系 = 只回指、不重述（D2） |

**落点动作**：本档落点 = 新建 `docs/design/PET-MOVEMENT.md`（上表四候选逐条判定）；该判定由本设计者落笔。
**授权口径（本轮修正，#8）**：本档**不再自述「承批次档 §1.6 授权」**（§1.6 无该授权句）——越界落笔的**追认权在主 agent**（批次档 §4）；地图面（`docs/README.md` §二 的新档登记行、§三 清单、§四 变更记录）**归主 agent 维护**，本设计者只提交**建议行**、不落笔地图。

---

## 一、需求层（回指）

### 1.1 验收条目回指表

| 需求条目 | 本档验收标准 | 一句话口径 |
|---|---|---|
| US-24 甩抛与飞行 | AC1、AC2、AC3、AC15、AC16、AC17、AC18、AC19、AC20、**AC21**、**AC22** | 门量（120 ms 窗峰值速度）≥ `T` ⇒ 起飞；`v < T` 或静默放置 ⇒ 不起飞；**B26**：地面 = 可见脚底口径（§2.2.13）；**B27 修订注记**：飞行边界上 / 左 / 右三面改按可见身体（四面 insets，§2.2.14） |
| US-25 撞击形变反馈（Q 弹） | AC4 | 落地冲击 → 压扁回弹（力度随冲击速度） |
| US-26 位移单写者仲裁 | AC5、AC6、AC7、AC15 | 拖拽 > 物理 > 散步；交接与互斥逐条（交接② 以「`v ≥ T`」为条件 ⇒ 回指 AC15） |
| US-27 物理开关与默认值 | AC8 | 托盘 checkbox + `settings.json` 顶层布尔 |
| US-28 停下即停泊（含降级面） | AC9、AC10 | 停下 = 离散停泊；物理不可用 ⇒ 回退今天 |
| NFR-18 物理写入纪律与开销 | AC10 | 每 tick ≤1 次写 + 同目标去重 + tick 内零落盘零尺寸 |
| NFR-19 静止收口与有界 | AC11 | 近地软着陆档（首触竖直速度 ≤ 800 px/s）≤ 4 s + 只停一次 + 5 s 硬上界**收口在地面** |
| NFR-20 可测性 | AC12 | 纯函数 + 双环境导出 + 桩测装载真实实现 |
| NFR-21 零回退与规范 | AC13 | 几何 / 链 / 素材零 diff；行宽行数文件头 |
| NFR-22 与既有机制的交互 | AC14 | O10 不接管；B19 / B03 口径零改动 |
| US-34 抛掷 / 散步活动范围按「可见身体」口径（B27） | **AC23** | 四面 insets 单点常量（上 44 / 左 41 / 右 41 / 下 30 DIP）+ `petEdgeBounds`（飞行与散步同取）+ B03 具名例外四面（§2.2.14） |
| NFR-25 边界口径的可见性与零回退（B27） | **AC24** | 补偿后中心点可见（NFR-5 照旧）+ 冻结面零 diff + 行宽行数机检 |

### 1.2 本批不做（边界，逐条）

- **阻尼弹簧拖拽**（样本 `SPRING_K` / `SPRING_C`）：拖拽跟手保持既有 8 ms 绝对定位（U-5 ①；理由 = 冻结面，见 §2.1 B 组）。
- **跨屏飞行**：飞行边界 = 起飞时的**所在屏工作区**（O-1 登记为后续面）。
- **多宠物互相碰撞**（`physics.petCollision`）：本仓单实例、单桌宠窗口。
- **用户可调参数**：只给开关、不给调值（参数 = 代码内单一参数表）。
- **飞行中的位置钳制 / 尺寸写入**：飞行只写位置；校正与校准只在停下那一瞬。
- **点击 / 喂食等互动时刻的挤压**：本批只做**落地撞击**形变（点击已有既有开心动画，US-5 不回退）。
- **任何对** `shell-pet-geometry.js` / `shell-pet-drag.js` / `pet-chain.js` / `pet-chain-core.js` / `assets/**` **的改动**。
- **B03 / B18 / B19 各档面**的改动（本批对三者只读）。

### 1.3 勘察结论（实测证据，as-of 2026-09-18）

#### 1.3.1 既有写者（实测）

| # | 写者 | 位置（行号只作 as-of 参考） | 写入形态与频率 | 冻结 |
|---|---|---|---|---|
| W1 | 拖拽 | `shell-pet-drag.js:83-144`（`petDragTick`，8 ms 定时器 `:159`） | `setPosition(target)` + 同目标去重（`:117-121`）；抓取偏移全程恒定 | **是**（零 diff） |
| W1′ | 拖拽松手收口 | `shell-pet-drag.js:176-216`（`handlePetDragEnd`） | `petStopDrag` → `petSettlePos`/`petApplyPos`（一次）→ `petCalibrateSize` → `petSavePos` → 贴墙判定 | **是** |
| W2 | 散步 / 跑步 | `shell-pet.js:274-362`（`doWander` + 16 ms `moveTimer` `:325`） | 段起点算边界（`:281`）、段内线性插值写 `setPosition(nx, targetY)`（`:328`） | 否（本批只加 1 行守卫） |
| W3 | 物理 | **本批新增**（`shell-pet-physics.js`） | 每 16 ms 一步积分 + 同目标去重 `setPosition` | — |

既有可依赖事实：`doWander` 首行守卫已含 `drag.getPetDrag() !== null`（`shell-pet.js:276`）；拖动起点清 `moveTimer` / `wanderTimer` 并复位走动状态（`shell-pet-drag.js:149-153`）；`getPetDrag()` 是冻结面**已导出**的只读访问器（`shell-pet-drag.js:229`）；运动计时器访问器 `getMoveTimer()` 已导出（`shell-pet.js:388`）。

#### 1.3.2 几何纪律原句（冻结面，逐字）

1. `shell-pet-geometry.js:170`：「只在离散停泊事件调用（松手 / 散步段末 / 显示器事件 / 找回 / 退出前），**不得在 tick 内调用**」——**主语 = `petSavePos()`（位置落盘）**。
2. `shell-pet-geometry.js:33` + 设计档 §2.3.5-B 第 4 条 / DD-22：尺寸校准**不得逐帧**（移动中 `getSize()` 读回有 +0…+34 DIP 噪声带 ⇒ 每帧判漂移 ⇒ 每帧尺寸写入 ⇒ 与移动循环互相打断）；移动路径唯一允许的校准时点 = **段起点**（运动尚未开始、窗口静止）。
3. `shell-pet-geometry.js:26` + `:382`：尺寸**写入** = `setBounds({width,height})`（尺寸专用形态，不传位置）；`petCalibrateSize()` 是**唯一尺寸写入路径**。
4. `shell-pet-drag.js:20-21` / 设计档 §2.3.3（DD-23、R6–R8）：位置推导 = `光标 − 抓取偏移`（全程恒定、不重锚）；位置 API 的坐标空间与所在屏无关且可逆。

#### 1.3.3 样本规格与实现参考（**只读**；不 require、不入包）

样本 = `samples/dsh-pet/dsh-pet`（本地 git-ignored，R14）。许可 = 代码 MIT（署名已在位）+ 素材禁商用（用户裁定）。

**对照表（样本 → 本仓）**：

| 样本（路径：行，as-of 参考） | 本仓落点 | 差异 |
|---|---|---|
| `src/shared/physics.ts:51-58` `DEFAULT_PHYSICS` / `assets/config.jsonc:80-97` physics 段 | 参数表 §2.2.3 | 只取前五项；`petCollision` 出批 |
| `physics.ts:17-19` `SPRING_K` / `SPRING_C`（弹簧跟手） | **不落地** | 拖拽仍用 8 ms 绝对定位（U-5 ① / 冻结面） |
| `physics.ts:186-191` `trimTrail` | `pet-physics-core.js` `trimTrail` | 同语义（200 ms 窗口） |
| `physics.ts:216-266` `estimateReleaseVelocity` | 同名纯函数 | 形状与常量同；时间源 = `performance.now()`；轨迹 = 主进程自采**光标**轨迹（§2.2.5）；**差异 ① = 内嵌死区过滤（`physics.ts:264`）上移为显式起飞门**（§2.2.12）；**差异 ② = 估计量只决定飞行初速，不进起飞门判据** |
| `physics.ts:38-40` `ACCEL_REF` / `ACCEL_GAIN_MAX`（末段加速增益） | 常量表（**只作用于初速大小**） | 差异：**不进起飞门判据**（DD-16 / §2.2.12；主 agent 追加裁定 = 主判据只读速度） |
| `physics.ts:273-312` `throwStep`（**单屏 AABB**） | `throwStep`（选定形态） | 增 `landed` 标志（区分触地 / 碰壁 / 撞顶，供 Q 弹触发） |
| `physics.ts:338-404` `throwStepRegion`（逐屏 AABB + 空洞 / 面板探测） | **不落地**（O-1） | 跨屏飞行出批 |
| `physics.ts:132-183` `throwBounds` / `throwBoundsIn` / `throwSpace` / `screenOfBox` | **不落地** | 边界改由 `geometry.petWorkAreaBounds(display)` 提供（既有单一来源，NFR-8） |
| `physics.ts:86-106` `landingSquash` / `squashScale` | 同名纯函数 | 逐字同语义、常量同值 |
| `physics.ts:406-491` `collidePet` / `bodyPixelBox` / `rectsOverlap` | **不落地** | 多宠物碰撞 = E 面 |
| `src/client/pet.ts:929-1004` `startThrow`（rAF + DOM `left/top`） | `shell-pet-physics.js` 飞行循环（16 ms 定时器 + `setPosition`） | 驱动面从渲染层 DOM 改为主进程窗口位置；Q 弹经 IPC 交渲染层 |
| `pet.ts:988-993` 挤压触发（`res.bounced && grounded && !prevGrounded` + 积分前 `vy`） | `landed` + 积分前 `vy` | 同语义（`fallingVy` = 步进前 `vy`） |
| `pet.ts:900-927` `springStep` 跟手循环 / `pet.ts:1052`「reduce-motion 时跳过」挤压 | **不落地 / 采纳其让步** | 跟手不落地；挤压在 reduced-motion 下关闭（§2.2.7） |
| `src/shared/motion.ts`（移动规划 / 角落定位） | **不落地** | 散步由本仓既有 `doWander` 承担 |

#### 1.3.4 测试面现状（实测）

- `tests/` 3 档（`harness-store.test.js` / `update-lib.test.js` / `update-stub.mjs`）与本批无关；**本批不新增 `tests/` 档**（门禁 `lint` / `test:full` / `test:integration` 尚不存在，归 B16）。
- 开发期桩先例 = `.thincoder/b18-pet-chain-stub.mjs`（B18 收口亲跑 **121/121**）；`.thincoder/b03-pet-calibrate-stub.mjs` **已损坏**（T29：硬绑 `main.js`、0 断言）⇒ 本批回归面仍由**几何面零 diff**承担（承 B18 §1.4-2 / 批次档 §1.3）。
- `.thincoder/` 在 `.gitignore:17`（非交付物）⇒ 本批桩测 = **开发期工具**（批次收口按纪律判退役，处置行落批次档 §6）。

#### 1.3.5 B18 / B19 交互面（实测）

- 链的位移请求 = 渲染层 `pet-chain-move` → 主进程 `doWander()`（`shell-pet.js:26`）；当前 **`assets/pet-anim/pool.json:7` `weights.move = 0`**（链从不请求位移）⇒ O10 的「不接管」现状 = 数据面一行。
- B19 的档位优先级口径（`docs/design/PET-ANIMATION.md` §2.8.4：拖动 > 散步 / 跑步 > 交互档 > 工作档）——本批**不改**且**不引用**（两套口径解耦，§2.2.9）。
- `pet.html` 结构（实测）：`#pet-wrap`（250×270）内含 `#bubble` / `#pet-stage`（视频通道）/ `#affinity` / `#pet`（PNG 通道）——两条渲染通道互为兄弟，`pet-chain.js:12-13` 只按 id 取元素 ⇒ **可插入包裹层而不动链**（§2.2.7）。

---

## 二、设计层

### 2.1 方案选型对比

#### A 组 · 位移仲裁形态（本批核心）

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **单写者令牌状态机**（owner 由既有只读事实派生 + 写者侧自守） | 互斥可证：✅ · 冻结面改动：0 · 可机检：✅（纯函数 + 符号级顺序）· 成本：低 | 须把「谁持有写权」显式化并逐条落档（§2.2.2）；拖拽不进状态机（只读派生） | **选定** |
| 2 | 事件队列（位移请求入队、单执行器串行消费） | 互斥：✅ · 冻结面改动：**非零**（拖拽 8 ms tick 必须改造成队列消费者）· 成本：高 | — | **否决**——与批次档 §1.4-1「几何冻结」直接相抵 |
| 3 | 时间片轮转（每 tick 按优先级分配写权） | 互斥：❌（同帧可先后写）· 冻结面改动：非零 · 成本：中高 | — | **否决**——本场景要「互斥」不要「公平」，复杂度无收益 |

#### B 组 · 拖动跟手形态（对应 §1.5 U-5）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **不改**（既有 8 ms 绝对定位，`grabOffset` 恒定） | §1.4-3 手感零回退：✅ · 冻结面零 diff：✅ · 风险：0 | 不获得样本的弹簧跟手观感（登记为明确不做） | **选定** |
| 2 | 改为阻尼弹簧跟手（样本 K=200 / C=30，rAF 驱动） | 冻结面零 diff：❌（须重写 `shell-pet-drag.js` 的 tick 与定时器）· B03 结论面：重开（R6–R8 的绝对定位实证作废） | — | **否决**——相抵硬门禁 + 重开最脆面 |

#### C 组 · 物理实现路径（对应 §1.5 U-3）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **按规格重写为 CJS JS**（样本 = 语义规格，逐函数对照 §1.3.3） | 零 TS 工具链：✅ · 差异面（单屏化 / 主进程化）显式可控：✅ · 可测：✅ | 需人工保证语义等价（由桩测 + 对照表承载） | **选定** |
| 2 | 逐行适配样本 `physics.ts` | 零 TS 工具链：❌（`.ts` + `import type` 无法被本仓 node 装载）· 覆盖面：浏览器面（DOM / rAF / 多屏 `displays.ts`）必须删改 ⇒ 事实上的重写 · 维护：与样本漂移 | — | **否决**——「逐行忠实」不可维持；额外收益（署名）两路径同等 |
| 3 | 运行时直接 require 样本（`samples/**`） | 与 R14 硬约束相抵（样本区**不被任何代码引用**、不入包） | — | **否决**——相抵 R14（可机检：全仓 require 引用面零命中） |

#### D 组 · 释放初速的来源

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **主进程自采「光标」轨迹**（拖动期每 16 ms 采样，仅位置变化时记点） | 与样本同源（样本轨迹 = 指针绝对坐标）：✅ · 冻结面改动：0（`screen.getCursorScreenPoint()` 是主进程公开 API）· 成本：拖动期每 16 ms 一次调用 | 比「窗口轨迹」少一层写入滞后耦合 | **选定** |
| 2 | 主进程自采「窗口位置」轨迹（`getPosition()`） | 等价性：✅（窗口 ≡ 光标 − 常量偏移 ⇒ 速度相同）· 但读的是**被写入后**的窗口值（含写入滞后） | — | **不选**——等价但多一层耦合，无收益 |
| 3 | 渲染层上报指针轨迹（改 `pet.js` / `pet-preload.js` + 新 IPC） | 接触面：更大 · 收益：无（速度等价） | — | **否决**——接触面更宽、收益为零 |
| 4 | 复用冻结面内部字段（`getPetDrag().lastApplied`） | 可得性：字段确实可达 · **无时间戳、无历史** ⇒ 无法估速 · 耦合冻结面内部字段 | — | **否决**——能力不足 + 脆弱 |

#### E 组 · 飞行边界口径

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **当前所在屏工作区**（`petWorkAreaBounds(petCurrentDisplay())`，窗口矩形口径） | 与散步同源（US-9「不跨屏」）：✅ · 复用既有单一 helper（NFR-8）：✅ · 可见性（NFR-5）：✅（窗口矩形 ⊆ workArea ⇒ 中心点必在内）· 三屏实机依赖：无 | 抛到屏缘会在本屏边界反弹（不飞向邻屏）——登记 O-1 | **选定** |
| 2 | 逐屏 AABB + 空洞 / 邻屏探测（承样本 `throwStepRegion`） | 体验：更接近样本 · 风险：新增第二种几何写模式 + 撞 B03 冻结面 + **无三屏实机**（T9 未验） | — | **否决（本批）**——不可验证风险；登记 O-1 为后续面 |
| 3 | 桌面并集外接矩形 | 正确性：❌——不规则多屏布局下外接矩形含空洞 ⇒ 可飞进不可见区（样本注释已明证该缺陷） | — | **否决** |
| 4 | 所在屏 `bounds`（非 `workArea`） | 与散步口径不一致（会落到任务栏条带上） | — | **否决** |

#### F 组 · Q 弹形变的实现面

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **新增包裹层 `#pet-squash`**（包住 `#pet-stage` + `#pet`）+ 主→渲染一次 IPC 触发 | 覆盖两通道：✅ · 链引擎改动：0（§1.3.5）· 不涉尺寸 / 位置：✅ · reduced-motion 可关：✅ | 需改 `pet.html`（插一层）+ 新 keyframes + `pet.js` 触发点 | **选定** |
| 2 | 对既有 `#pet-wrap` 施加变换 | 覆盖：含 `#bubble` 与 `#affinity` ⇒ **好感度条与气泡一起被压扁**（可见缺陷） | — | **否决** |
| 3 | 逐通道各自变换（视频元素 `transform`） | `pet-chain.js:171` 已用 `transform` 做镜像（`scaleX(-1)`）⇒ 语义冲突；且属冻结面 | — | **否决** |
| 4 | 主进程 `setBounds` 缩放窗口做形变 | **写窗口尺寸** ⇒ 相抵 B03（`petCalibrateSize()` 唯一尺寸写入路径）+ US-11 | — | **否决** |

#### G 组 · 参数与开关落点

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **参数 = 代码内单一参数表**（`pet-physics-core.js` 的 `PHYSICS` 常量对象）+ 开关 = `settings.json` 顶层布尔 + 托盘 checkbox | 零新增文件 / 零解析失败面：✅ · 可复现（桩测断言常量）：✅ · 与 US-23 先例同形：✅ | 用户不能调值（登记为明确不做） | **选定** |
| 2 | 参数 = 随包 JSON（`assets/pet-physics.json`）+ 解析 / 校验 / 回落 | 需 `build.files` 登记 + 三件套 = 新增失败面；收益（用户可调）不在本批需求内 | — | **否决** |
| 3 | 参数 = `settings.json` 用户可调 | 污染用户档（其语义 = 用户偏好 + 桌宠位置）+ 每项需校验 | — | **否决** |

#### H 组 · 起飞阈值口径（本轮修正轮新增）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **显式起飞门 + 单一常量 `T`**（阈值比较移出估计函数、成为 armGate 的 G10） | 阈值可见可测：✅ · 「轨迹不可估」与「低于阈值」在诊断行可区分（`stale` vs `below-threshold`）：✅ · 单一常量一处定义（AC17）：✅ · 冻结面改动：0 | 估计函数不再对低速轨迹返回 `null`（AC3 的 null 分支 5 → 4） | **选定** |
| 2 | 保留估计函数内嵌死区过滤（阈值不外移，无独立门） | 阈值可见性：❌（与「轨迹不可估」共用同一条 `null` 通道）· 诊断行无法区分「缓放」与「轨迹丢失」：❌ · 与本轮裁定的口径（释放速度与阈值比较）字面为真但埋没 | — | **否决**——与本轮裁定的**口径显式性**相抵（用户要判别的正是这一支） |
| 3 | 双阈值（保留死区 500 + 另加更高起飞门 `T`） | 判据：两个阈值 ⇒ 两处定义 + 需写死两者先后与关系口径 · 收益：无（用户语义上只有一个分界） | — | **否决**——过度实现；且 AC17「单一常量一处定义」不成立 |

#### I 组 · 起飞判据量（本轮补正新增；速度 vs 加速度）

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **速度**：门量 = 松手前 120 ms 采样窗内的**峰值分段速度** `v` **+ 静默规则**（窗内位移 ≈0 ⇒ 放置） | 一阶量（= 动量 `m·v` 的度量）：✅ · 抗 8 ms 采样抖动（峰值取自多点 + `SEG_MIN_DT_MS` 合并）：✅ · 与人类「放手前先减速」的动作学相容（只用峰值、不用末瞬加速度）：✅ · 零额外数据面（复用既有拖动采样）：✅ | 门量（是否扔）与**飞行初速**（扔多远，= 样本估计量）是**两个量**，须在契约里写明顺序与关系 | **选定** |
| 2 | 速度 · **端点均值 ×0.5 + 峰值 ×0.5**（= 样本 `estimateReleaseVelocity` 的口径） | 判据可复现：✅ · 抗抖：中 · **与本轮动作相容性**：❌——「快甩后收手」被端点均值拉低 ⇒ 与静默规则**叠加**后会把甩误判为放置 | — | **否决**——放置已由静默规则单独处置，两套机制不必叠加 |
| 3 | 速度 · **末瞬单点**（最后一段速度） | 抗抖：❌——单点量化噪声直接进门 ⇒ 假阳性 / 假阴性 | — | **否决** |
| 4 | **加速度**（末瞬或峰值）作主判据 | 物理量口径：❌（甩抛本体是动量 `m·v`，加速度是二阶量）· 噪声：❌（8 ms 采样下二阶差分放大抖动 ⇒ 误判「甩」）· 动作学：❌（放手前通常先减速 ⇒ 末瞬加速度常为负 ⇒ 判反） | — | **否决**——三条独立依据（主 agent 追加裁定 2026-09-18） |

> **零额外成本口径**：8 ms 拖动 tick（`shell-pet-drag.js:23`）已在采光标轨迹 ⇒ 速度由**既有采样窗**直接估出，不新增数据面（承 D 组选定方案）。

#### J 组 · 地面口径的取量路径（**B26 面新增**；对应批次档 `docs/batches/B26-pet-feel.md` §1.7 U-2）

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价 / 权衡） | 结论 |
|---|---|---|---|---|
| 1 | **锚点常数**：`FEET_INSET_DIP = 26 + 4 = 30`（锚点 = 窗高 270 − `PET_FEET_Y` 244；余量 = 实测 alpha 残差取整）⇒ 地面 = `maxY + 30` | 与渲染层**同源**（身体盒 / 命中区 / `#pet{bottom:26px}` 同线）✅ 单一常量可机检 ✅ 踩实优先：视频与 PNG 动画帧真踩实（残留 ≤ 0.5 DIP）✅ | 代价 = 待机 PNG 越沉 ≈4 DIP（O-13）；两分量各一处常量、可逆 | **选定**（DD-17；修正轮 1 代裁） |
| 2 | **池帧内容盒实测**（`mediaBox().bodyBottom` / `pool.body`） | 与候选 1 **等值**（该函数由构造把身体盒下沿钉在 `feetY`，与池值无关）⇒ 信息量不增 ❌ · 多一条「需池装载结果」的依赖 ❌ | — | **否决**——等价但更重 |
| 3 | **起飞时一次性校准**（渲染层实测内缩量并经新 IPC 上报） | 需新增 IPC + `pet-preload.js` + 渲染层测量（触冻结面 `pet-chain.js` / `pet.js`）❌ · 可得量仍是 244（身体盒口径）——真实 alpha 需逐帧解码 ⇒ 开销不可接受 ❌ · 引入「飞行中边界可变」的耦合 ❌ | — | **否决**（增益 ≤4 DIP、成本与风险均显著更大） |
| 4 | **改 `#pet` 的 `bottom`**（让 PNG 通道的可见脚底 = 窗口下沿） | 碰渲染层 ❌ · **两通道分歧**（视频通道由链按 `PET_FEET_Y` 定位，改 CSS 只动 PNG ⇒ 两通道脚底不再同线）❌ · 待机帧（160×160 满幅）与动画帧（240×220 / 下边距 4 px）内缩量不同 ⇒ 需逐帧校准 ❌ | — | **否决**——相抵「不动渲染层」 |

### 2.2 架构与契约

#### 2.2.1 分层与职责边界

```
（主进程）main.js —— 组合根：require + physics.init(deps)（deps 保存与 IPC 监听器注册）+ 本模块的 screen.on 三条
   （**必须放在 whenReady 内、几何三条 screen.on 之前**：E7——`screen` 模块只能 ready 之后使用）+ before-quit 停点
   ├── shell-pet-physics.js  ← 本批新增（域实现）
   │     职责：拖动期光标轨迹采样 · 释放评估与起飞 · 飞行循环（16 ms）· 仲裁判定消费 ·
   │           停泊收口（调用几何既有离散序列）· 日志 · IPC 触发挤压 · 开关消费
   │     依赖方向：只读 geometry 的 helper（petWorkAreaBounds / petCurrentDisplay / petSettlePos /
   │           petApplyPos / petCalibrateSize / petSavePos / petGeomSnapshot / petPosText）
   │           + 经 init(deps) 注入的访问器（getPetWindow / getPetDrag / getMoveTimer / pet 动作面）
   │     禁：不得自造第二份几何判定（NFR-8）；不得新增尺寸写入路径
   ├── pet-physics-core.js   ← 本批新增（纯函数核心，双环境导出）
   │     职责：参数表 · trimTrail · estimateReleaseVelocity · throwStep · 静止判定 · 挤压曲线 ·
   │           decideOwnership / armGate（仲裁与起飞门判定）
   │     边界：零 electron / 零 fs / 零定时器 / 零 DOM ⇒ 可被 node 直接装载（NFR-20）
   └── shell-pet.js —— 唯一改动：doWander 守卫加 `|| physics.isFlying()`（1 处）+ init 注入点
（渲染进程）pet.html（新增包裹层 + keyframes）· pet.js（挤压触发）· pet-preload.js（暴露回调）
```

**数据流（一次甩抛）**：

```
pointerdown → pet-drag-start（渲染层）→ 冻结面起 8 ms 跟随循环；本模块起 16 ms 光标采样器
拖动中：采样器只读光标（零写入）；冻结面写位置（唯一写者 = 拖拽）
pointerup → pet-drag-end(reason) → 冻结面收口（停循环 → settle 校正 → 尺寸校准 → 落盘 → 贴边判定）
   → 【冻结面处理器返回后】本模块监听器记 pendingRelease ⇒ setImmediate 评估 armGate（§2.2.2）
      全通过 ⇒ 起飞（state = 当前位置 + 估计初速；bounds = 本屏工作区）
飞行中：每 16 ms 一步（纯函数积分）→ 同目标去重写 setPosition；落地 ⇒ 一次 IPC 触发挤压
atRest / 超时 ⇒ 停循环 → 停泊序列（settle → 校准 → 落盘 → 取证行）→ 状态清空 → 交还 null
```

#### 2.2.2 位移仲裁状态机（写权 / 优先级 / 交接 / 互斥证明）

**令牌**：`owner ∈ { null, 'drag', 'physics', 'wander' }`（`null` = 无人持有 ⇒ 只有离散停泊点可写）。

**判定函数（纯函数，落核心档）**：

```
decideOwnership({ dragActive, physicsFlying, wanderInFlight }) =
    dragActive      ? 'drag'
  : physicsFlying   ? 'physics'
  : wanderInFlight  ? 'wander'
  : null
```

**写者的持有与交接（逐条）**：

| 写者 | 持有条件（判定来源） | 交接入 | 交接出 |
|---|---|---|---|
| W1 拖拽 | `getPetDrag() !== null`（冻结面只读访问器） | pointerdown ⇒ 冻结面建 `petDrag`（本模块不介入） | 冻结面 `petStopDrag`（松手 / 看门狗 / 销毁） |
| W3 物理 | `phys.flying === true`（本模块状态） | **armGate 全通过**（松手路径，见下） | atRest / 5 s 硬上界 / 被拖拽抢先 / 显示器事件 / 开关关闭 / 销毁 / 退出（§2.2.10） |
| W2 散步 | `getMoveTimer() !== null`（`shell-pet.js:388`） | 既有 `scheduleWander` / `doWander` | 既有段末（`shell-pet.js:334-359`） |

**armGate（起飞门，**11** 条；任一不过 ⇒ 不起飞且零写入；G10 = 起飞阈值、G11 = 静默放置，均本轮新增）**：

| # | 条件 | 不过时的 `phys-stop reason` |
|---|---|---|
| G1 | 开关开启（`settings.get().petPhysicsEnabled === true`） | `toggle-off` |
| G2 | 窗口在场且未销毁 | `destroyed` |
| G3 | 会话幂等（同一 drag 会话只评估一次；`sessionSeq` 比对） | `duplicate` |
| G4 | 当前无拖动（`getPetDrag() === null`） | `drag-active` |
| G5 | 无散步段在途（`getMoveTimer() === null`，即未被「贴边挣脱」分支接管） | `wander-busy` |
| G6 | `reason` 合法（归一化后 ∈ {pointerup, pointercancel, lostcapture}） | `bad-reason` |
| G7 | 轨迹可估（`estimateReleaseVelocity(...) !== null`） | `no-trail` / `stale` / `too-short` / `jitter`（由估计函数给出细分原因；**不含低速**——低速归 G10） |
| G8 | 边界可取（`petWorkAreaBounds(petCurrentDisplay()) !== null`） | `no-bounds` |
| G9 | 当前无飞行（`phys.flying === false`） | `already-flying` |
| **G10** | **起飞阈值**：门量 `v ≥ T`（判据 / 量纲 / 标定状态见 §2.2.12；**本轮新增**） | `below-threshold` |
| **G11** | **非静默放置**：窗内端点位移 > `QUIET_SPAN_MAX_DIP`（非「挪到位 → 停一下 → 松手」；判据见 §2.2.12） | `quiet-dwell` |

**交接条件（逐条，全部可机检）**：

| # | 交接 | 触发 | 行为 | 判据 |
|---|---|---|---|---|
| ① | drag → physics | 正常松手**且 `v ≥ T`** | 冻结面收口完成**之后**评估 armGate；全通过 ⇒ 起飞；**`v < T` ⇒ 不交接**（物理不介入、零写入 = 今天的行为，§2.2.12） | 日志：`phys-arm` 行的 `pos` == 同一时刻 `geom tag=drag-end` 行的 `pos`；arm 前窗口位置未被本模块改写 |
| ② | physics → drag（抢占） | `getPetDrag()` 变非 null | 物理 tick **首行**判到即自停（**不写位置**） | 符号级：`getPetDrag()` 判定在任何 `setPosition` **之前**；运行时：`phys-stop reason=drag-preempt` 之后无 `phys-tick … wrote=1` |
| ③ | physics → null（停泊） | `atRest === true` ∨ 5 s 硬上界 | 停循环 → 停泊序列（离散一次）→ 状态清空 | 日志：`phys-rest` 之后 `pos-save` ≤1 行、尺寸型 `geom-fix` ≤1 行 |
| ④ | physics ⊣ wander | 飞行在途 | 散步不得启动：`doWander` 守卫加 `|| physics.isFlying()`（守卫失败即 `scheduleWander()` 重排 = 既有自愈） | 符号级：`shell-pet.js` 的守卫含该条件；运行时：飞行期无 `geom tag=seg-start` 行 |
| ⑤ | wander ⊣ physics（起飞门） | 松手时贴边挣脱分支已接管 | 该分支同步调 `doWander()` ⇒ G5 不过 ⇒ 物理**不介入**（US-7 彩蛋优先） | `phys-stop reason=wander-busy`（零写入）；US-7 既有判据不变 |
| ⑥ | 全部 → 停泊（显示器事件） | E5 三事件到达 | **先**由本模块停物理（零写入），**再**由几何事件路径 settle / 校准 / 落盘 | 注册顺序：本模块的 `screen.on` 监听器在 `main.js` 的 **`whenReady` 内、几何三条 `screen.on` 紧邻之前**注册（同一 ready 相位；E7：`screen` 模块仅 ready 后可用）；日志：`phys-stop reason=display-change` 早于 `geom tag=display` |
| ⑦ | 全部 → 停泊（销毁 / 退出） | 窗口销毁 / 渲染进程异常 / `before-quit` | 物理停（零写盘）；冻结面照既有处置 | `main.js` / `pet.destroyPetWindow` 各一处显式停点 + tick 首行守卫（三重覆盖） |

**互斥证明（三条，覆盖全部同时刻组合）**：

1. **W3 与 W1 互斥**：物理 tick 首行（写位置之前）判 `getPetDrag() !== null` ⇒ 立即停并返回。JS 单线程 ⇒ 一次 tick 的执行不可被 IPC 处理器插入；反向（拖拽 tick 期间物理起）不可能——`petDrag` 由冻结面在 `drag-start` 同步建立，物理只在该事件之后起采样器。⇒ **任一时刻至多一个写者持有写权。**
2. **W2 与 W3 互斥**：起飞门要求 `getMoveTimer() === null`（G5）；飞行中 `doWander` 守卫（新增条件）拒绝进入 ⇒ 两个方向都封住。
3. **W2 与 W1 互斥**：既有守卫（`shell-pet.js:276`）逐字不动。

#### 2.2.3 物理参数表（默认值 + 单位 + 来源）

**参数（`PHYSICS` 对象 = 本批唯一权威处）**：

| 参数 | 单位 | 默认值 | 来源 | 说明 |
|---|---|---|---|---|
| `gravity` | px/s² | 1400 | 样本 `config.jsonc:91` | 竖直加速度；0 合法（无重力 ⇒ 由 5 s 硬上界收口，TC-7） |
| `restitution` | —（0~1） | **0.55**（登记作 ≈ 0.55） | **本仓调（用户 2026-09-18 裁定 B）**；样本 `:92` = 0.78（差异登记 O-12） | 碰壁 / 触地恢复系数；**待实机标定**（到期条件 = 用户实机感受一次后的裁定轮）；可逆变 = 本表一处常量 |
| `groundFriction` | /s | 2.5 | 样本 `:93` | 接地水平速度衰减：`vx *= max(0, 1 − f·dt)` |
| `ceilingBounce` | 布尔 | true | 样本 `:94` | true = 撞顶反弹；false = 顶部无边界（越界后由重力拉回） |
| `throwPower` | ×（>0） | 1.0 | 样本 `:95` | 初速与软上限的**整体**增益（本批无弹簧项，故只作用于甩抛）；**不进门判据**（§2.2.12） |

**常量（出处 = 样本 `physics.ts`，逐值照搬）**：

| 常量 | 值 | 用途 |
|---|---|---|
| `MAX_THROW_SPEED` | 3600 px/s | 软上限 `cap·(1 − e^(−s/cap))`（×`throwPower`） |
| `TAKEOFF_MIN_SPEED`（= 起飞门阈值 `T`；样本名 `DEAD_ZONE_SPEED`，值逐字照搬） | 500 px/s | 释放初速 `v < T` ⇒ 不起飞（原地放下）——**本仓唯一阈值常量、仓内仅一处定义**（§2.2.12 / AC17） |
| `TRAIL_KEEP_MS` / `RELEASE_WINDOW_MS` | 200 / 150 ms | 轨迹保留 / 初速估算窗口 |
| `RELEASE_STALE_MS` | 150 ms | 末样本超过它 ⇒ 温柔放下（不抛） |
| `MIN_SPAN_MS` / `SEG_MIN_DT_MS` | 20 / 8 ms | 窗口太短不可估 / 分段最小 dt |
| `PEAK_WEIGHT` | 0.5 | 端点均值与峰值加权 |
| `ACCEL_REF` / `ACCEL_GAIN_MAX` | 8000 px/s² / 0.6 | 末段加速增益（最多 +60%）——**只作用于初速大小，不进起飞门判据**（DD-16 / §2.2.12） |
| `MAX_STEP_DT` | 0.05 s | 单步 dt 上界（防巨帧跳变） |
| `REST_VY` / `REST_VX` | 40 / 15 px/s | 静止判据 |
| `SQ_SQUASH` / `SQ_MAX_SQUASH` | 0.55 / 0.55 | 挤压下压幅度（基准值 / 落地最大下压） |
| `SQ_DURATION_MS` | 220 ms | 挤压时长 |
| `SQ_SOFT_SPEED` / `SQ_HARD_SPEED` | 300 / 1500 px/s | 冲击速度 → 下压幅度的映射区间 |

**本仓新增常量（必有；理由 = 主进程面与节拍口径）**：

| 常量 | 值 | 用途 |
|---|---|---|
| `PHYS_POLL_MS` | 16 ms | 飞行 tick 周期（= 散步 tick 同频，不引入新节拍） |
| `PHYS_TRAIL_MS` | 16 ms | 拖动期光标采样周期（仅拖动中运行） |
| `PHYS_MAX_FLIGHT_MS` | 5000 ms | 飞行硬上界（超时 ⇒ **强制落地收口**：`y = maxY` + 速度归零 → 停泊序列；**不得停在半空**；NFR-19 / §2.2.6） |
| `PHYS_RUN_SPEED` | 900 px/s | 飞行期动作档：`|vx| ≥ 该值` ⇒ `run-*`，否则 `walk-*`（不新增档位名，承 NFR-16） |
| `GATE_WINDOW_MS` | 120 ms | 起飞门窗（**峰值窗与静默窗同窗**）——取自裁定给的 80–120 ms 范围上端；可调、**待实机标定** |
| `QUIET_SPAN_MAX_DIP` | 5 px | 静默判据：窗内端点位移 ≤ 该值 = 「位移接近 0」⇒ 判放置；5 px 与既有「位移 > 5px 判为拖动」口径**同源**（`pet.js:121`） |
| `FEET_ANCHOR_INSET_DIP` | **26**（DIP） | **B26**：渲染层可见身体锚点的内缩量 = 窗高 270 − `PET_FEET_Y`(244)（`pet-chain-core.js`）+ `#pet { bottom: 26px }`（`pet.html`）——两者同源（CSS px = DIP，承 §2.2.6）；机检等式见 §3.1 AC21 |
| `FEET_ALPHA_MARGIN_DIP` | **4**（DIP；本批值 = **修正轮 1 主 agent 代裁**，原 0） | **B26**：alpha 残差补偿量（实测：视频 ≈4.2 / PNG 动画帧 ≈3.6 / 待机 PNG = 0，见 O-13）；取两通道残差的**较大者**取整 ⇒ 视频与 PNG 动画帧**踩实**（|残留| ≤0.5 DIP），代价 = 待机 PNG 越沉 ≈4 DIP。**回正路径 = 本表一处常量改 0**（结构与判据不动） |
| `FEET_INSET_DIP` | = 上两者之和 = **30**（DIP） | **B26**：地面增量的**唯一消费值**（`petEdgeBounds`（B27 起名；原 `groundBounds`）与散步 y 归位上界同取它；落地等式见 §2.2.13 / AC21③） |

**U-2 口径（本轮修正）**：**已裁定 = ② 本仓调**（用户 2026-09-18 原话「先做成 B 吧，不行再调整手感」）——`restitution` 由样本 0.78 调为 **0.55**（其余四项照搬样本）；参数集中一处 ⇒ 后续单项调值只改本表数值、结构不动（差异登记 = O-12；静止时长判据的同源重算 = 批次档 §2.12）。

#### 2.2.4 物理步进契约（含与样本的唯一差异）

```
throwStep(state, dtRaw, bounds, PHYSICS) -> { x, y, vx, vy, bounced, landed, atRest }
  dt = clamp(dtRaw, 0, MAX_STEP_DT)                    // 巨帧夹断（TC-8）
  vy += gravity·dt ; x += vx·dt ; y += vy·dt
  横向：x < minX ⇒ { x = minX; vx = |vx|·rest } ; x > maxX ⇒ { x = maxX; vx = −|vx|·rest }   // bounced
  顶部：y < minY ⇒ ceilingBounce ? { y = minY; vy = |vy|·rest; bounced } : 不夹不弹（保持越界）
  地面：y ≥ maxY ⇒ { y = maxY; vx *= max(0, 1 − groundFriction·dt);
                     |vy| < REST_VY ? vy = 0 : vy = −|vy|·rest ; bounced ; landed = true }
  atRest = (贴地 ∧ |vy| < 1 ∧ |vx| < REST_VX) ∨ (bounced ∧ |v| < REST_VY ∧ |vy| < 1)
```

- **边界** = 起飞时 `geometry.petWorkAreaBounds(geometry.petCurrentDisplay())` 的返回值经**四面补偿**（`petEdgeBounds`，§2.2.14；B26 起 = 地面补偿 `groundBounds`）后的 `{minX, minY, maxX, maxY}`——**起飞时算一次、全程恒定**（与散步段起点同源）；不可取（null）⇒ 不起飞（G8）。
  - **口径分列（B26 → B27）**：`maxY` = **可见身体底沿口径**（`+FEET_INSET_DIP`；B26 起）；**B27 起 `minX` / `maxX` / `minY` 同步按可见身体补偿**（`∓SIDE_EDGE_INSET_DIP` / `−TOP_EDGE_INSET_DIP`）——权威句 = §2.2.13 / §2.2.14。
- **与样本的唯一差异**：新增 `landed` 标志（触地专属）⇒ Q 弹只在**落地**触发（样本用 `res.y >= bounds.maxY - 1` 反推，本仓显式化）。
- **坐标语义**：`x` / `y` = 窗口左上角 DIP，与冻结面同空间（R6）。

#### 2.2.5 释放初速契约

1. **采样**：`ipcMain.on('pet-drag-start')` ⇒ 起 16 ms 采样器：读 `screen.getCursorScreenPoint()`；**仅当与上一点不同**时追加 `{ t, x, y }`（`t` = `performance.now()`）；保留窗口 200 ms（`trimTrail`）。只位置变化才记点 ⇒ 「松手前停顿」自然表现为轨迹过期（TC-12）。
2. **`pet-drag-end` 监听器**（注册在 `shell-ipc.js`，**不依赖监听顺序**）：归一化 `reason`（非法 ⇒ 清轨迹、不起飞）；合法 ⇒ 记 `pendingRelease = { now, trail, sessionSeq }`，并 `setImmediate(() => evaluateArm())`。
   `setImmediate` 保证评估发生在**同一事件的全部监听器（含冻结面收口）执行之后** ⇒ 与注册顺序无关，且 escape 分支与 settle 结果均可见（DD-4）。
3. **估计**：`estimateReleaseVelocity(trail, now, PHYSICS)` ⇒ `{vx, vy} | null`；返回非 null 时该值**已含**软上限与 `throwPower`。null 分支 = 空轨迹 / 末样本过期 / 窗口太短 / 纯抖动（**不含低速**——低速轨迹返回非 null 的小初速，由起飞门 §2.2.12 拒绝）。
4. **起飞初始状态**：`s0 = { x, y } = getPetWindow().getPosition()`（= 冻结面 settle 之后的终值）；`v = 估计值`。
5. **日志**：`phys-arm vel=(vx,vy) pos=(x,y) bounds=(…) trail=<n>`。
6. **门量与初速是两个量（本轮补正）**：门判据读 §2.2.12 的门量（窗内**峰值速度**）；门通过（`v ≥ T` ∧ 非静默 ∧ 本节第 3 条非 null）后，**飞行初速** = 本节第 3 条的估计值（含软上限与 `throwPower`）——“门量回答扔没扔，初速回答扔多远”，两者均为速度，**均不含加速度判据**。

7. **起飞归一化与 `prevGrounded` 初值（本轮修正）**：建 `s0` 后**先一次性钳入** `[minX,maxX]×[minY,maxY]`——原因 = 冻结面 settle 只保证**中心点**在某屏 `workArea` 内（US-10），而飞行边界是**窗口矩形**口径。
   贴下缘 / 任务栏边 / 骑线推离后松手（**常规路径**；US-2 允许拖出屏）时 `s0` 可合法落在区间外 ⇒ 钳入后的位移由**首个 tick 的一次 `setPosition`** 落地（该 tick 本就要写位置 ⇒ **不新增写入时点**），窗口在区间外的时长 ≤ 1 个 tick（16 ms）；该一次性位移登记为已知限制（O-10）。
   **`prevGrounded` 初值** = 钳入后 `s0.y >= maxY`（贴地 ⇒ 真）——避免「起点贴地 ⇒ 首个 tick 触地」被 §2.2.7 判成一次**伪挤压**。

#### 2.2.6 停泊收口契约（离散一次；与 B03 调用时机同源）

**触发**：`atRest === true` ∨ 5 s 硬上界（`reason=timeout`）∨ 显式停点（抢占 / 显示器事件 / 开关关闭 / 销毁 / 退出）。

**序列（严格顺序；全部在循环停止之后执行）**：

1. `clearInterval(timer)`；`flying = false`；清 `trail`——**先停循环**（此后不可能再有 tick 写入）。
2. **仅当**窗口在场且 `reason ∈ {atRest, timeout}`：
   ① `geometry.petSettlePos(getPetWindow().getPosition())` ⇒ `kind !== 'none'` 时 `geometry.petApplyPos(settled.pos, 'physics-rest')`（**至多一次**位置写入）；
   ② `geometry.petCalibrateSize()`（**唯一尺寸写入路径**；此时窗口已静止 ⇒ 不进噪声带，与「散步段起点」同前提）；
   ③ `geometry.petSavePos()`（**离散停泊**落盘，至多一次）；
   ④ `geometry.petGeomSnapshot('physics-rest')`（取证行）。
3. `pet.setPetState('idle')`（复位飞行期动作档）。
4. 日志 `phys-rest pos=(x,y) reason=<…> snap=<0|1> flight=<ms> steps=<n>`。

**`timeout` 的强制落地（本轮修正）**：`reason === 'timeout'` ⇒ 在步骤 1（停循环）之后、步骤 2（几何序列）之前**强制落地**——物理状态置 `y = bounds.maxY`、`vx = vy = 0`，并经**一次** `setPosition(x, maxY)` 落到地面（该次 = 本次收口的第一次、至多 1 次位置写入）；随后照常走步骤 2–4（步骤 2 的 settle 读到的是落地后的位置）⇒ **5 s 到点不得停在半空**；日志 `snap=1`（其余 reason 恒 `snap=0`）。
**窗口不在场的收口（本轮补）**：`reason ∈ {destroyed, quit}`（窗口已销毁 / 进程退出）⇒ 只执行步骤 1（停循环）与步骤 4（日志，最佳努力）——**跳过步骤 2**（几何写；窗口不在场）与步骤 3（动作面复位）⇒ 仍**各留 1 行** `phys-rest` 诊断（承 US-28 的「各留 1 行」）。

**不变量（可机检；本轮修正）**：
- **飞行期轨迹恒在界内，且不依赖起飞点**——由 §2.2.4 的钳入（`x` / `y` 逐帧夹回区间，含上条的强制落地）保证 ⇒ **收口点必在区间内**；区间 = `petEdgeBounds(wa)`（**B27 面**的四面口径 = `[minX−41, maxX+41] × [minY−44, maxY+30]`，§2.2.14；B26 面 = 仅地面 `+FEET_INSET_DIP`，§2.2.13）；
- 由上行 ⇒ 停泊点的 `petSettlePos` 结果恒为 `kind='none'`（**零 `geom-fix reason=physics-rest` 行**）；该行若出现即说明边界 / 几何异常——属**报告项**（不静默）；B26 面的地面位置（标称矩形越出工作区下沿 30 DIP）**不破坏本条**：`petSettlePos` 的可见性判据是**中心点**（`petIsVisible`）⇒ 地面位置照常判可见、零改写（见 §2.2.13 / O-14）；
- **起飞点本身可能落在区间外**（US-2 允许拖出屏 + B03 settle 只保**中心点**可见）⇒ 由 §2.2.5 第 7 条的起飞归一化就地钳入（首帧至多一次位移，登记为已知限制 O-10）。

**散步续接**：本模块**不调度散步**——飞行前的 `scheduleWander()` 计时器由冻结面在松手时已排（15–35 s）；若飞行中到期，`doWander` 守卫（新增条件）自行重排（既有自愈）。

#### 2.2.7 Q 弹挤压契约（渲染面，不写位置）

- **触发**：飞行中 `landed === true` ∧ **上一帧未贴地**（`!prevGrounded`，与样本 `pet.ts:990` 同语义）⇒ 一次落地至多一次；深度 = `landingSquash(fallingVy)`，`fallingVy` = **本步积分前**的 `vy`（冲击速度）。`prevGrounded` 的**初值口径** = 钳入后 `s0.y >= maxY`（§2.2.5 第 7 条）⇒ 「贴地位形起飞」不产生伪挤压（AC4⑤）。
- **通道**：`petWindow.webContents.send('pet:physics-squash', depth)`（新通道；命名口径见 O-5）。
- **渲染层**：`pet-preload.js` 暴露 `onPhysicsSquash(cb)`；`pet.js` 收值 ⇒ 在 `#pet-squash` 上按 `SQ_DURATION_MS`（220 ms）播放 keyframes，`scaleY` 由 `squashScale(u, depth)` 逐帧（`requestAnimationFrame`）驱动；结束清 `transform`。
- **曲线的跨进程单一来源（本轮补）**：`squashScale` 与 `SQ_DURATION_MS` 的**唯一处定义 = `pet-physics-core.js`（核心档）**；渲染层**不复制定义**，按既有双环境装载范式取用。
  装载 = `pet.html` 在 `pet.js` 之前以 `<script src="pet-physics-core.js"></script>` 装载（同 `pet-chain-core.js` 范式）；取值 = `pet.js` 从 `window.PetPhysicsCore` 取 `squashScale` / `SQ_DURATION_MS`。
  **证据**：`pet.html:110-112`（三条 `<script>` 装载）+ `pet-chain.js:9`（`window.PetChainCore` 取用）+ `pet-chain-core.js:196-198`（双环境导出尾巴）。**机检（AC4④）** = 全仓 `squashScale` / `SQ_DURATION_MS` 的**定义**命中数 == 1。
- **结构改动**：`pet.html` 在 `#pet-stage` 与 `#pet` 外插入 `<div id="pet-squash">`（`position:absolute; left:0; top:0; width:250px; height:270px; transform-origin:50% 100%`）——链只按 id 取元素（§1.3.5）⇒ **链零改动**；`#pet` 的 `bottom/left` 相对新包裹盒与旧盒逐位同形。
- **减少动态效果**：`@media (prefers-reduced-motion: reduce)` 下**不播放**挤压（既有 reduce 块内加一条；与样本「reduce-motion 时跳过」同取舍，U-9）。
- **不做**：不写位置、不改窗口尺寸、不动链的镜像 `transform`、不给点击 / 喂食加挤压。

#### 2.2.8 开关面与默认值

- **开关**：托盘「设置」子菜单 +1 项 checkbox（`shell-tray.js` 既有形态，`rebuildTrayMenu` 内）。
- **持久化**：`settings.json` 顶层布尔键 **`petPhysicsEnabled`**（`shell-settings.js` 的 `DEFAULT_SETTINGS` 加一行；`loadSettings` 的 `{...DEFAULTS, ...JSON.parse}` 天然兼容旧档）。
- **默认值（U-1，待裁定）**：按**推荐 = `false`（默认关）**成文——依据 = 批次档 §1.4-5「默认行为保守」（本开关改的是用户可感知的松手后行为）+ 与 US-23 先例一致；裁定「默认开」时只改 `DEFAULT_SETTINGS` 一处与本行（TC-23 分支随之翻转）。
- **关闭态语义（零开销）**：采样器不启动、飞行不起、日志零行、无新增定时器；关闭时正在飞 ⇒ 立即停泊收口（不留飞行态）。
- **入口守卫**：专注模式（无桌宠窗口）下天然无对象（tick 首行窗口守卫）；该托盘项的置灰处置见 `open-2`。

#### 2.2.9 与 B18 链 / B19 工作档 / B03 停泊纪律的交互

| 面 | 交互 | 口径 |
|---|---|---|
| B18 链的位移请求 | 渲染层 `pet-chain-move` → `doWander()`（`shell-pet.js:26`） | **零改动**；该请求属 `wander` 写者，受本批的 `physics` 互斥门约束（飞行中被推后，段末自愈） |
| **O10（链是否接管位移）** | 本批**不接管**：`pool.json` 的 `weights.move` 保持 0 | 依据 = B18 §1.9 三条理由（同一写权问题应一次做 / 接管新增写入模式撞最脆面 / 真机验收无硬件）+ 本批已新增一个写者（风险叠加）。**接管落点（将来一批即用）**：`weights.move > 0` ⇒ 链的 move 决策经既有 `pet-chain-move` 通道进入 `wander` 写者；仲裁层的「互斥 + 交接」口径**已就绪**（§2.2.2），接管 = 池数据一行、无需再动仲裁层（可逆性 = 数据面一行） |
| B19 工作档 | 切档规则 / 优先级 / 开关面**零改动**；位置写权与动画档位**解耦** | 飞行期按 `|vx|` 设 `walk-*` / `run-*`（§2.2.3），停泊置 `idle`；B19 的「重断言回工作档（≤1 s）」可能在飞行期切走动作档——**仅观感交错，不影响写权**（O-9） |
| B03 停泊 / 尺寸纪律 | 复用既有 helper 与离散序列；几何档零 diff | 本批新增的调用时点（`physics-rest` 停泊点 / 物理接管期）记在本档 §2.2.6；`docs/design/PET-MULTIMONITOR.md` §2.3.2 调用时机表**未含**这两行 ⇒ 建议行（O-3） |
| B03 日志面 | 新增 `geom-fix reason=physics-rest` 与 `phys-*` 行 | 既有 reason 词表（`drop` / `straddle` / `start` / `display` / `summon`）**未被改写**；新增词只出现在物理停泊路径（O-3 一并建议行） |

#### 2.2.10 降级面与失败安全（逐行）

| # | 情形 | 行为 | 取证 |
|---|---|---|---|
| 1 | 开关关闭（默认） | 采样器不起、无飞行、零 `phys-*` 日志、零新增定时器 | 静态 + 日志零行（TC-23） |
| 2 | 轨迹不可估（空 / 末样本过期 / 窗口太短 / 纯抖动） | **不起飞**（= 今天的行为），清轨迹 | `phys-stop reason=<no-trail\|stale\|too-short\|jitter>` |
| 3 | 显示面不可取（`petWorkAreaBounds` 为 null；实际不可达） | 不起飞 | `phys-stop reason=no-bounds` |
| 4 | 窗口不存在 / 已销毁 | 不起飞；飞行中 ⇒ 停（不落盘） | `phys-stop reason=destroyed` |
| 5 | 显示器配置变化（E5，飞行中） | 先停物理（零写入）⇒ 几何事件路径做校正 / 校准 / 落盘 | 注册顺序（`whenReady` 内本模块三条 `screen.on` 紧邻几何三条之前；§2.2.2 交接 ⑥）+ 日志先后 |
| 6 | 被拖动抢占（飞行中） | tick 首行即停（零写入） | `phys-stop reason=drag-preempt` |
| 7 | tick 抛错（`try/catch` 包住 tick 体） | 停物理 + 停泊序列 + 诊断行（**状态必须清空**，承 NFR-4） | `phys-error` + `phys-rest reason=error` |
| 8 | 飞行超过 5 s | **强制落地收口**（`y = maxY` + 速度归零 → 停泊序列 + 状态清空；§2.2.6） | `phys-rest reason=timeout snap=1` |
| 9 | 进程退出 / 窗口关闭 | `before-quit` 显式停；`pet.destroyPetWindow` / `clearPetTimers` 路径显式停；tick 首行守卫；收口形态见 §2.2.6「窗口不在场的收口」 | 静态（三处停点）+ 无飞行态残留 + **诊断行 `phys-rest reason=destroyed` / `reason=quit` 各 1 行**（窗口不在场 ⇒ 只停循环 + 日志，跳过几何写） |
| 10 | `settings.json` 损坏 | 既有 `loadSettings` 回落默认（物理 = 参数表默认，只影响开关） | 既有行为不变 |
| 11 | **缓放 / 正常放下（主流分支，非降级）**：① 门量 `v < T`；② **静默放置**（松手前 120 ms 窗内位移 ≈0——“挪到位 → 停一下 → 松手”） | **不起飞**：物理面零写入 ⇒ 窗口位置在 ≤200ms 内不再变化（**US-3 / NFR-2 原样成立**） | ① `phys-stop reason=below-threshold`；② `phys-stop reason=quiet-dwell` |

#### 2.2.11 日志与诊断行（仅 `BIGFISH_PET_DEBUG=1`）

- **新日志档**：`userData/pet-physics.log`（与 `pet-drag.log` / `pet-geometry.log` 同形，最佳努力追加）；debug 关闭时**零开销**（不拼接、不落盘）。
- **行格式**（`[ISO 时刻] <tag> …`）：

| tag | 何时 | 关键字段 |
|---|---|---|
| `phys-trail-start` | 拖拽开始（`pet-drag-start`）且开关为开、窗口在场 ⇒ 采样器启动（**在 G1 开关早退之后** ⇒ 关闭态零日志，AC8④ / TC-23 不变） | `seq=<n>`（= 拖动会话序号 `sessionSeq`，与 G3 幂等同源） |
| `phys-arm` | 起飞 | `vel=(vx,vy) pos=(x,y) bounds=(minX,minY,maxX,maxY) trail=<n>` |
| `phys-tick` | 每 16 tick 采样一行 | `n=… pos=(x,y) vel=(vx,vy) bounced=<0\|1> atRest=<0\|1> wrote=<0\|1>` |
| `phys-land` | 落地帧 | `impact=<fallingVy> depth=<landingSquash 值>` |
| `phys-stop` | 未起飞 / 提前停 | `reason=<…> pos=(x,y)` |
| `phys-rest` | 停泊收口 | `pos=(x,y) reason=<atRest\|timeout\|error\|toggle\|drag-preempt\|display-change\|destroyed\|quit> snap=<0\|1> flight=<ms> steps=<n>`（`snap=1` 仅 `timeout` 的强制落地；`reason ∈ {destroyed,quit}` 只留日志、跳过几何写，§2.2.6） |
| `phys-error` | tick 抛错 | `err=<message>` |
| `phys-squash` | 触发挤压 | `depth=<值>`（IPC 已发出） |

**`phys-stop` 的 `reason` 词表**（未起飞面，**14** 个；与 armGate G1–**G11** 对应——G7 占 4 个、G11 占 1 个）：
`toggle-off` / `destroyed` / `duplicate` / `drag-active` / `wander-busy` / `bad-reason` / `no-trail` / `stale` / `too-short` / `jitter` / **`below-threshold`** / **`quiet-dwell`** / `no-bounds` / `already-flying`。

- **`bad-reason` 的产出路径（事实补记，修偏轮 2 起）**：`handleTrailEnd` 的归一化不匹配（非字符串 / 空串 / 非 `{pointerup, pointercancel, lostcapture}`）⇒ 先产 `phys-stop reason=bad-reason pos=(x,y)`，再清轨迹、不起飞（`shell-pet-physics.js:99-109`）。**本词表条目与计数均不变（仍 14 个）**——补的是**产出路径**（此前该词在册但无产出行 = 静默清轨迹），不是新词；与 armGate G6 的对应关系不变（§2.2.2 表）。
- **与 `phys-trail-start` 的分工**：`phys-trail-start` = 采样器启动取证（`pet-drag-start` 面，**关闭态不产行**）；`phys-stop reason=bad-reason` = 松手 `reason` 非法取证（`pet-drag-end` 面）——不同事件源、不同路径，不可互推。

#### 2.2.12 起飞门判据（阈值 `T`——本轮修正轮新增；缓放即停 / 快甩抛出）

**判据（纯函数，落核心档；= armGate 的 G10（阈值）与 G11（静默放置））**：

```
canTakeOff(v)                = v >= TAKEOFF_MIN_SPEED              // v = 门量（120 ms 窗峰值速度）；闭区间：恰等于 T ⇒ 起飞
isQuietPlacement(trail, now) = 窗内端点位移 <= QUIET_SPAN_MAX_DIP   // true ⇒ 判放置（不起飞，reason=quiet-dwell）
```

- **判据量 = 速度（不是加速度）**（本轮补正；= I 组选定 / DD-16）：门量 `v` = 松手前 `GATE_WINDOW_MS`（120 ms）采样窗内的**峰值分段速度**（分段合并口径 = `SEG_MIN_DT_MS`）——三条依据：① 甩抛的本体是动量（`m·v`，一阶量）；② 8 ms 采样下二阶差分把量化抖动放大 ⇒ 误判「甩」（假阳性）；③ 放手前用户通常**先减速** ⇒ 末瞬加速度常为负，以加速度判据会**判反**。⇒ **加速度不得单独翻转门判据**（样本的 `ACCEL_GAIN_MAX` 只作用于初速大小，见 §2.2.3 / I 组候选 4）。
- **静默放置规则**（本轮补正）：若同一 120 ms 窗内的**端点位移 ≤ `QUIET_SPAN_MAX_DIP`（5 px）** ⇒ **一律判放置**（不起飞，`reason=quiet-dwell`）——“挪到位 → 停一下 → 松手”这一常见动作单看速度会被误判为甩。
- **窗内取值口径**：取**峰值**（不用末瞬单点，也不用端点均值 ×0.5 + 峰值 ×0.5 的加权）——候选 2 / 3 已在 I 组逐条否决。
- **门量的定义域**：`v` = 窗内峰值分段速度的**幅值**（标量，px/s）；**不是** `estimateReleaseVelocity` 的幅值（那是飞行初速，见下条）。
- **`T` 的量纲与默认值**：`T = TAKEOFF_MIN_SPEED = 500`（px/s）——**本仓唯一阈值常量、仓内仅一处定义**（机检判据 = AC17）；值逐字照搬样本 `DEAD_ZONE_SPEED`（`samples/dsh-pet/dsh-pet/src/shared/physics.ts:32`），承 U-2 ①「照搬样本」。
- **默认值来源与标定状态**：本仓**无实机标定数据**（三屏实机 T9 未验）⇒ 该值按「**可调单一常量 + 待实机标定**」成文；标定路径 = 拖动期光标轨迹（日志）复算 `estimateReleaseVelocity`，取「正常放下」与「甩动」两簇速度的分界；**到期条件** = 用户实机感受一次（缓放不飞 / 中速不飞 / 快甩飞）后的裁定轮（U-10）。标定只改本常量一处，结构不动。
- **与样本的差异（本仓有意偏离，登记）**：样本把该阈值**内嵌**在估计函数内（`physics.ts:264`：低速 ⇒ `return null` ⇒ 与「轨迹不可估」共用同一条 null 通道）；本仓把它**上移**为显式起飞门（G10）⇒ ① 阈值只有一处定义；② 诊断行可区分「轨迹不可估」（`stale` 等）与「低于阈值」（`below-threshold`）。副作用：估计函数对低速轨迹**不再返回 null**（改由门拒绝）⇒ AC3 的 null 分支由五类收为四类。
- **门量与飞行初速的关系**：门通过后，飞行初速 = 既有估计量（§2.2.5 第 3 条，含软上限与 `throwPower`）——门量回答「扔没扔」，初速回答「扔多远」。
- **`throwPower` 口径**（本轮补正后）：门判据在**未增益的原始速度**上比较（`p` **不进门**）⇒ `throwPower` 只放大**飞行初速**（软上限同乘），不改「扔不扔」的门槛。与样本的差异：样本把固定常量 `DEAD_ZONE_SPEED` 与**已乘 `p`** 的速度比较（`physics.ts:263-264`）⇒ 死区在原始速度上随 `p` 反比变化；其注释（`:212-213`）又称三者一体线性缩放、与实现不符——本仓按「门不乘 `p`」的**唯一口径**，差异登记为 O-11。
- **两支行为（逐字）**：
  - `v < T` ⇒ **不起飞**：走既有松手收口路径，物理面**零写入** ⇒ 窗口位置在 ≤200ms 内不再变化（**US-3 / NFR-2 逐字照旧**），诊断行 `phys-stop reason=below-threshold`；
  - `v ≥ T` ⇒ **起飞**：初速按 §2.2.5（软上限 `3600 × throwPower`），进入 §2.2.4 步进。
- **区间写死**：**闭区间**——`v = T` ⇒ 起飞；`v = T − 1 px/s` ⇒ 不起飞（AC18 / TC-33 / TC-34）。

#### 2.2.13 B26 面：落地口径（可见脚底）—— F2 / US-24

**口径（本面唯一权威句）**：物理地面 = **可见身体底沿** = 窗口矩形下沿**下** `FEET_INSET_DIP`（DIP）；原「窗口矩形下沿」口径（§2.2.4 / DD-6）自本面起只作 `maxY` 的中间量，**不再是地面**。
**B27 推广注记（§2.2.14）**：本面的纯函数 `groundBounds` 自 B27 起推广为四面补偿并**改名 `petEdgeBounds`**（底面语义 = 本面逐字不变；上 / 左 / 右三面为 B27 新增）——本档其余处 `groundBounds` 一律读作 `petEdgeBounds`（改名注记，非语义变更）。

**常量与契约**

- 常量（`pet-physics-core.js`；逐值见 §2.2.3 本仓新增表）：`FEET_ANCHOR_INSET_DIP = 26`（渲染层锚点内缩）· `FEET_ALPHA_MARGIN_DIP = 4`（实测 alpha 残差补偿，**修正轮 1 主 agent 代裁**；回正路径 = 改 0）· `FEET_INSET_DIP` = 两者之和 = **30**（地面增量的唯一消费值）；
- 纯函数：`petEdgeBounds(bounds)`（**B27 起名；B26 原名 `groundBounds`**）⇒ `{ minX: b.minX − SIDE_EDGE_INSET_DIP, maxX: b.maxX + SIDE_EDGE_INSET_DIP, minY: b.minY − TOP_EDGE_INSET_DIP, maxY: b.maxY + FEET_INSET_DIP }`（B26 面 = 只抬 `maxY`，其余逐字不变；四面推广 = §2.2.14）；
  - **空值契约（修正轮 1 #4 补）**：`petEdgeBounds(null) ⇒ null`（与 G8 `no-bounds` 同源）——`petWorkAreaBounds` 的短路口径 = 「返回 null ≠ 位置为零，调用方必须跳过写入」。
    飞行路径的 bounds 由 `win && !win.isDestroyed() ? … : null` 派生（`shell-pet-physics.js:119`）⇒ 照旧落 G8；散步侧先判空（`shell-pet.js:307`）。**桩测断言面 = AC21①**（`petEdgeBounds(null) === null`）。
- **消费点两处、同一取值**（地面单一口径）：① 飞行 bounds（`shell-pet-physics.js` 的 `evaluateArm`）；② **散步段起点**的 y 归位上界（`shell-pet.js` 的 `doWander`）——它是①的必要配套：否则落地后的 y 会被散步拉回未补偿区间（30 DIP 上跳）；
- **不变面**：`throwStep` 的边界语义（`b.maxY` 只是取值变了）· `armGate` 的 11 条（G8 照旧查 `petWorkAreaBounds !== null`）· 停泊序列（§2.2.6）· 几何层 / 渲染层 / `main.js` 零 diff（不新增注入面与依赖边）；
- **与渲染层的同源声明 + 落地等式（修正轮 1 #12 补来源与限制）**：`FEET_ANCHOR_INSET_DIP` 对齐的可见身体锚点 = `PET_FEET_Y = 270 − 26`（`pet-chain-core.js:16`；视频媒体盒与命中区都由它定位）+ `#pet { bottom: 26px }`（`pet.html:34`；PNG 通道）——三者同线。
  - **机检等式（跨档核对）**：`FEET_ANCHOR_INSET_DIP === 270 − PetChainCore.PET_FEET_Y` ∧ `FEET_INSET_DIP === FEET_ANCHOR_INSET_DIP + FEET_ALPHA_MARGIN_DIP`（AC21① / 注 A）。
  - **`270` 的来源与限制（如实登记）**：唯一权威处 = `shell-pet-geometry.js:29` 的 `PET_SIZE_DIP.h`，但该档 `require('electron')`（`:7`）⇒ **node 不可装载**（桩测不能 require 它）。
    与建窗同源的**可装载**实数源 = `pet.html:13-14` 的 `#pet-wrap { height: 270px }`（同档 `:34` 的 `#pet { bottom: 26px }`）⇒ 桩测从 HTML 取 270 / 26，与 `PetChainCore.PET_FEET_Y`（244）三方交叉核对。
    残留弱点（明示）：`PET_SIZE_DIP.h` 与 `pet.html` 同时改而 `PET_FEET_Y` 未改时等式仍可通过（弱镜像面**收窄**，非消除）。
  - **落地等式（随 `FEET_ALPHA_MARGIN_DIP` = 4 同步，修正轮 1；续做轮订正等价表述符号）**：落地后 `y + PET_FEET_Y == wa.y + wa.height + FEET_ALPHA_MARGIN_DIP`（±1 DIP；本批 = 工作区底边 **+4**）；等价表述 = 「可见脚底（`y + PET_FEET_Y −` alpha 残差）== 工作区底边」（踩实，|残留| ≤ 0.5 DIP，O-13）。

**为什么取锚点 + 残差补偿（摘要；逐条否决见 §2.1 · J 组 / DD-17）**：① 渲染层的可见身体锚点已是**同源单一值** ⇒ 物理地面必须与它对齐（否则两套口径漂移）；② 在锚点上再补实测 alpha 残差的较大者（4）⇒ 可见脚底**真踩实**（视频 / PNG 动画帧 |残留| ≤ 0.5 DIP），舍去的代价 = 待机 PNG 帧越沉 ≈4 DIP（O-13，明示）；③ 两个分量各自一处常量、可逆（余量回正 0 = 只对齐锚点）。

**明示例外（登记 O-14；修正轮 1 补 `bounds` 面）**：停在地面时**标称矩形越出工作区下沿 30 DIP**（该段是脚底以下的透明区）——`petIsVisible`（**中心点**口径）与命中区（身体盒）照常成立。
B03 `docs/design/PET-MULTIMONITOR.md` §2.3.1 / §2.3.6 的「标称矩形 ⊆ 工作区」至此有**一处具名例外**，且同一越界**也落在 `bounds` 面**（`petRectInside` 的两个消费方 = `petStraddleFix` / 拖动跨屏标记）。
条件分支见 O-14（`workArea` 底边 == `bounds` 底边 + 混合 `scaleFactor` 重叠 ⇒ 骑线推离上推窗口）；**实机复核项 = 批次档 `docs/batches/B26-pet-feel.md` §2.7-2**。

**口径生效点（四处，全取同一 `bounds` ⇒ 落地高度一致）**：反弹触地（`throwStep` 的 `y ≥ b.maxY`）· 5 s 超时强落（`stopFlight('timeout')` 的 `y = bounds.maxY`）· 静止收口（`atRest` 的贴地判据）· 起飞归一化钳入（§2.2.5 第 7 条）。

**连带：NFR-19 的扫描集与两档判据（修正轮 1 #8 补）**：地面下移 `FEET_INSET_DIP`（30 DIP）⇒ 同一起点 / 初速的**首触竖直速度上移** ≈ `sqrt(v² + 2·1400·30)`（档界 800 → ≈ **851 px/s**，≈ +6%）⇒ 少数**边界例跨档**。

- **处置**：① 档界值与 ≤4 s / ≤5 s 判据**数值不改**；② 扫描集（8 方向 × 4 速 × 4 起点 = 128 例）**必须在实施后按新地面重跑并重新登记**（登记行落批次档 §5；口径 = NFR-19 / AC11）。
- **余量核算**：档内最坏实测 3.33 s（`e = 0.55`）⇒ 距 4 s 有 **0.67 s** 余量，足以吸收本次 +6% 的冲击速度变化 ⇒ **预期无新增逾期例**（**重跑为准**，不得以预期代替重跑）。

#### 2.2.14 B27 面：边界口径四面化（可见身体贴边 · R21 / US-34）

> 面 = 台账 R21（用户实机「上左右的边界有点小了，下面的是足够的」+ 先验「宠物模型自带空白宽度」）；回指 `docs/requirements/PET.md` US-34 / NFR-25 与 US-24 的 B27 修订注记；
> 任务书与受影响文件（file 级权威表）= `docs/batches/B27-pet-feel-2.md` §2（承 B26 形态：设计档只给契约与判据，不复制文件表）。
> 三方同源份额（本档）= 批次档 §2.1（AC 2（AC23–AC24）· TC 4（TC-41–TC-44）· DD 1（DD-18）· O 2（O-16…O-17））——编号与批次档逐条对应。

##### 2.2.14.1 实测（三面差，本设计者亲算；以声明身体盒 + 同源常量为据）

- 窗口矩形 = 250×270 DIP（`shell-pet-geometry.js:29`）；身体盒（画布）= x0 200 / y0 50 / x1 440 / y1 335（`pool.json:4` / `pet-chain-core.js:12`）；scale = 200/285 ≈ 0.70175（`mediaBox`，`pet-chain-core.js:106-122`）。
- 可见身体盒（窗口坐标）：**top = PET_FEET_Y − 目标高 = 244 − 200 = 44.0**；**left = (250 − 240×0.70175)/2 ≈ 40.8**（右同——身体画布水平居中：320 = 640/2）；bottom = 244（= `PET_FEET_Y`，已由 B26 补偿 30）。
- ⇒ 三面补偿量：**上 44 / 左 ≈40.8 / 右 ≈40.8** DIP——台账「≈40 DIP 级」的未实测值就此实测化（等式见 §2.2.14.3）。

##### 2.2.14.2 方案选型对比

**A 组 · 三面补偿量的取量路径**

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **声明身体盒常数**：`TOP_EDGE_INSET_DIP = 44` · `SIDE_EDGE_INSET_DIP = 41`（单点常量 + 机检等式） | 与渲染层媒体盒 / 命中区**同源**（同一身体盒）；零新增依赖 / IPC；可机检（AC23①） | 逐段 alpha 实际内容与声明盒的残差未逐段实测（登记 O-16，实机标定） | **选定** |
| 2 | 池帧内容盒实测（逐段 alpha 包围盒） | 逐段更准 | 逐段数据缺失且方差未测；需池装载依赖 + 新数据面 | 否决 |
| 3 | 起飞时一次性校准（渲染层实测 + 新 IPC 上报） | — | 触渲染层 + 新 IPC + 「飞行中边界可变」耦合；B26 J 组候选 3 同款否决 | 否决 |

**B 组 · U-4：越界口径（对 B03「标称矩形 ⊆ 工作区」）**

| # | 候选方案 | 判据逐项评估 | 取舍 | 结论 |
|---|---|---|---|---|
| 1 | **具名例外（照 B26 O-14 先例，四面）** | 例外显式、可核销；B03 口径本体与骑线推离 / 跨屏尺寸标记机制零改动 | 例外面由下扩到四面（登记面变大） | **选定（推荐）** |
| 2 | 改 B03「标称矩形 ⊆ 工作区」口径本体 | 无例外登记 | B03 已收口；该句服务于 `petRectInside` 的骑线推离与拖动跨屏标记 ⇒ 改口径波及这些机制，回退已验收面 | 否决 |

##### 2.2.14.3 常量与契约

- 常量（`pet-physics-core.js` 本仓新增表扩展）：`TOP_EDGE_INSET_DIP = 44` · `SIDE_EDGE_INSET_DIP = 41`（DIP；底面 `FEET_INSET_DIP = 30` 逐字不变）。
- 纯函数：`groundBounds` 推广为四面补偿并**改名 `petEdgeBounds`**（B26 面 = 只抬 `maxY`；§2.2.13 已落推广注记）：
  `petEdgeBounds(b) = b == null ? null : { minX: b.minX − SIDE_EDGE_INSET_DIP, maxX: b.maxX + SIDE_EDGE_INSET_DIP, minY: b.minY − TOP_EDGE_INSET_DIP, maxY: b.maxY + FEET_INSET_DIP }`
- 消费点两处、同一取值：① 飞行 bounds（`shell-pet-physics.js` 的 `evaluateArm`）；② 散步段起点（`shell-pet.js` 的 `doWander`）——与 B26 地面同款配套（否则落地 / 抛掷后会被散步拉回未补偿区间）。
- **机检等式（AC23①；跨档核对）**：
  `TOP_EDGE_INSET_DIP === PetChainCore.PET_FEET_Y − PetChainCore.PET_BODY_TARGET_H`（244 − 200 = 44）；
  `SIDE_EDGE_INSET_DIP === Math.round((PetChainCore.PET_STAGE_W − PetChainCore.mediaBox({canvas: PET_MEDIA_CANVAS, body: PET_MEDIA_BODY, targetH: PET_BODY_TARGET_H, feetY: PET_FEET_Y}).hit.w) / 2)`（≈ (250 − 168.42)/2 = 40.79 → 41）；
  `FEET_INSET_DIP === FEET_ANCHOR_INSET_DIP + FEET_ALPHA_MARGIN_DIP`（30，逐字不变）。
  「270」的来源与限制同注 A（几何档不可装载 ⇒ 桩测从 `pet.html` 取 270 / 26，三方交叉核对）。
- **可见性论证（NFR-25）**：补偿量 ≤ 44 DIP ≪ 中心点到窗口边缘的余量（x 125 / y 135 DIP）⇒ 任何补偿后位置的中心点仍落在 workArea 内（NFR-5 照旧）；
  `petSettlePos` 对补偿后位置判 `kind='none'`（零改写）——与 B26 §2.2.6 不变量同款论证。
- **口径生效点（五处，全取同一 `petEdgeBounds`）**：反弹触墙（`throwStep` 的 x/y 夹边）· 撞顶 · 5 s 超时强落 · 静止收口 · 起飞归一化钳入——上 / 左 / 右三面的夹边值随之扩展（底面口径不变）。
- **散步配套**：`doWander` 的 y 归位区间与撞墙判定（`hitWall` 的 minX / maxX）同取 `petEdgeBounds` ⇒ 撞墙走到身体贴边处（TC-44）。

##### 2.2.14.4 冲突核对与具名例外（B03 面）

- **具名例外（四面；U-4 = ①）**：窗口标称矩形可越出工作区 / `bounds` 至多「上 44 / 左 41 / 右 41 / 下 30」DIP（均为透明留白）——B03「标称矩形 ⊆ 工作区」的具名例外由**一处（下）**扩为**四面**；
  `petIsVisible`（中心点）与命中区（身体盒）照常成立（承 B26 O-14 论证）。
- **条件分支（承 O-14）**：该屏 workArea 边 == bounds 边（任务栏置顶 / 自动隐藏）∧ 与另一块 scaleFactor 不同的屏重叠 ⇒ `petStraddleFix` 会把窗口推回 `bounds`（抵消该面补偿）——实机复核 = 批次档 §2.6。
- **NFR-19 连带（重跑登记）**：顶边 minY 下移 44 增加**向上**行程（顶边抬高 ⇒ 撞顶例落地冲击速度随天花板高度增大，可能跨档）——扫描集（128 例）按 B26 §5.0.4 同口径**重跑并登记**（登记行落批次档 §5；**档界值（800 px/s）不变，例的档属按重跑重分类**；收口 ≤5 s 硬上界不变）。

##### 2.2.14.5 观察项（O-16…O-17）+ O-8 核销

- **O-16 顶 / 左 / 右三面的 alpha 残差未逐段实测**：补偿量按**声明身体盒**取（用户先验「模型自带空白宽度」的实测化）；逐段实际内容与声明盒的残差（视频通道同 O-13 的 ≈4 DIP 级）未逐段实测 ⇒ 最坏 = 身体贴边残留少量透明缝（观感项，实机目视 = 批次档 §2.6）。
- **O-17 顶边扩展的上抛时长面**：`ceilingBounce` 在扩展顶边反弹 ⇒ 上抛例的飞行时长分布变化（≤5 s 硬上界不变）——NFR-19 重跑登记（§2.2.14.4）。
- **O-8 核销（B20 观察项）**：B20 登记的「不采用样本 sideAllow（身体贴边）语义」自 B27 起**采用**（上 / 左 / 右三面按可见身体贴边）——O-8 的「是否采用待用户裁」就此闭合（用户 R21 实机裁定即采用裁定）。

##### 2.2.14.6 关键决策（DD-18）

| # | 决策 | 理由 | 否决 / 备选 |
|---|---|---|---|
| DD-18 | 边界口径 = **四面 insets 单点常量** + `groundBounds` 推广改名 `petEdgeBounds`（飞行与散步同取） | 与渲染层同源（同一身体盒）；底面承 B26 不重做；B03 面按具名例外（U-4 = ①） | 池帧内容盒实测 / 起飞时校准（A 组否决）· 改 B03 口径本体（B 组否决） |

### 2.3 受影响文件全清单（行数 = 换行符口径，as-of 2026-09-18）

| # | 文件 | 现状行数 | 动作 | 预计增量 | 说明 |
|---|---|---|---|---|---|
| 1 | `pet-physics-core.js` | — | **新建** | +260 ± 60（< 500） | 纯函数核心（双环境导出）；零 electron / fs / 定时器；**渲染层经 `<script>` 同源装载**（§2.2.7，曲线单一来源） |
| 2 | `shell-pet-physics.js` | — | **新建** | +330 ± 70（< 500） | 域实现：采样 / 飞行 / 仲裁消费 / 停泊收口 / 日志 / IPC |
| 3 | `shell-pet.js` | 426 | 改 | +8 / −1 | `doWander` 守卫 +1 条件；init 注入点；销毁路径停物理 |
| 4 | `main.js` | 217 | 改 | +6 | require + `physics.init(...)`（模块接线区）+ 本模块三条 `screen.on`（**`whenReady` 内、几何三条之前**，E7）+ `before-quit` 停点 |
| 5 | `shell-ipc.js` | 44 | 改 | +3 | 注册本模块自有的两条监听器（`pet-drag-start` / `pet-drag-end`）——**不改既有绑定行** |
| 6 | `shell-tray.js` | 175 | 改 | +12 | 设置子菜单 +1 checkbox + setter |
| 7 | `shell-settings.js` | 60 | 改 | +1 | `DEFAULT_SETTINGS` + `petPhysicsEnabled` |
| 8 | `pet.html` | 114 | 改 | +15 | `#pet-squash` 包裹层 + keyframes + reduce-motion 分支 + `<script src="pet-physics-core.js">`（渲染层取挤压曲线，§2.2.7） |
| 9 | `pet.js` | 211 | 改 | +13 | 挤压触发（`onPhysicsSquash` → 逐帧 `scaleY`；曲线取自 `window.PetPhysicsCore`，不复制定义） |
| 10 | `pet-preload.js` | 17 | 改 | +3 | 暴露 `onPhysicsSquash` |
| 11 | `package.json` | 132 | 改 | +2 | `build.files` 增列两个新源档（**必需**：白名单制，不登记即不打进发行版） |
| 12 | `.thincoder/b20-pet-physics-stub.mjs` | — | **新建** | +180 ± 40 | 开发期桩测（gitignored 非交付物；装载真实实现） |
| 13 | `docs/requirements/PET.md` | 359 → **461** | 改（本设计者） | +102 | 本批条目 + 四条修订 / 限定注记 |
| 14 | `docs/design/PET-MOVEMENT.md` | — | **新建**（本档） | ≈600 行 | 本主题唯一权威句（设计档不受 500 行限制） |
| 15 | `docs/README.md` | 75 | 改（**主 agent**） | +1 | 地图 §二 的新档登记行（本设计者只提交建议行；§三 清单 / §四 变更记录同步亦归主 agent） |

**零 diff 面（机检）**：`shell-pet-geometry.js`（437）· `shell-pet-drag.js`（239）· `pet-chain.js`（240）· `pet-chain-core.js`（198）· `assets/**` · `package.json` 的 `dependencies` / `devDependencies` 段。
**贴线档（≥480 行）**：本批写域内**无**（最大 = `shell-pet.js` 426 → ≈434；两个新档估算 < 500）⇒ **无需拆分计划**。
**300–500 行档立场（本轮补，#14）**：`shell-pet.js` 426 → ≈434 已在「>300 行 ⇒ 主动拆分复核」档之上，但本批对它**只增 1 行守卫 + 1 处注入点 + 1 处停点**、**未跨 500 行档** ⇒ **不启动拆分**（拆分 = 结构变更，另批；存量大档的拆分复核不属本批范围）。

- **B26 面（F2）的受影响文件与行数预算**：见批次档 `docs/batches/B26-pet-feel.md` §2（一次性任务书；本档**不复制文件表**——设计档不承载一次性任务，D2 单一权威源）。
- **B27 面（R21）的受影响文件与行数预算**：见批次档 `docs/batches/B27-pet-feel-2.md` §2.3（同 B26 形态：本档不复制文件表）。

### 2.4 关键决策记录（DD-1…DD-17）

| # | 决策 | 理由 | 否决备选 |
|---|---|---|---|
| DD-1 | 落点 = 新建 `docs/design/PET-MOVEMENT.md` | 主题独立（位移写权 + 物理）；三个既有档的主题均为「本批零改动面」 | 写进任一既有档（§零 逐条否决） |
| DD-2 | 仲裁 = 单写者令牌状态机（owner 派生 + 写者侧自守） | 唯一能同时满足「冻结面零 diff」与「互斥可证」 | 事件队列 / 时间片（§2.1 A 组） |
| DD-3 | 拖拽写者**不进**状态机（只读派生 `getPetDrag() !== null`） | 冻结面不可改其内部；其优先级最高 ⇒ 无需被抢占 | 把拖拽改造成仲裁消费者（相抵冻结） |
| DD-4 | 起飞的评估点 = `setImmediate`（同一事件的全部监听器执行之后） | 与监听顺序无关 ⇒ 保证「冻结面收口已完成」后才评估（escape 分支与 settle 均可见） | 依赖监听注册顺序（脆弱）；采样 tick 轮询兜底（会把 stale / destroyed 误判为可抛） |
| DD-5 | 释放初速来源 = 主进程自采**光标**轨迹（仅拖动期） | 接触面最小（不碰渲染层 / preload）+ 与样本同源 | 窗口轨迹 / 渲染层上报 / 冻结面内部字段（§2.1 D 组） |
| DD-6 | 飞行边界 = **当前屏工作区**（复用 `petWorkAreaBounds`；**B26 补正**：其 `maxY` 经地面补偿；**B27 起** = 四面补偿 `petEdgeBounds`——见 DD-17 / DD-18 / §2.2.13 / §2.2.14） | 与散步同源（US-9 不回退）+ 复用单一 helper（NFR-8）+ 落点必可见（NFR-5） | 跨屏 AABB / 桌面并集 / `bounds`（§2.1 E 组） |
| DD-7 | 实现路径 = 按规格重写 CJS（样本仅作语义规格） | 零 TS 工具链；差异面显式可控（§1.3.3） | 逐行适配 TS / 运行时 require 样本（§2.1 C 组） |
| DD-8 | 参数 = 代码内单一参数表；开关 = `settings.json` 顶层布尔 | 零新增文件与失败面；可复现（桩测断言常量） | JSON 配置档 / 用户可调（§2.1 G 组） |
| DD-9 | 停泊收口复用几何既有离散序列（settle → calibrate → savePos → snapshot） | 与 B03 同一拓扑 ⇒ 不新增几何实现；`petCalibrateSize` 保持唯一尺寸写入路径 | 自造停泊序列 / 飞行中校准（相抵 §1.3.2-2） |
| DD-10 | Q 弹 = 新包裹层 + 新 IPC；reduce-motion 时关闭 | 覆盖两通道且链零改动；与样本同取舍 | `#pet-wrap` / 逐通道 transform / `setBounds`（§2.1 F 组） |
| DD-11 | 飞行期动作档 = 按 `|vx|` 设 `walk-*` / `run-*`，停泊置 `idle` | 复用既有 11 档语义（NFR-16 零改动），观感连贯 | 新增「飞」档位名（撞 NFR-16）；不改档（看起来在滑行） |
| DD-12 | O10 = 本批只建仲裁层、链仍不接管（`weights.move` 保持 0） | B18 §1.9 三条理由 + 本批已新增一个写者（风险叠加）+ 可逆（数据面一行） | 本批即接管（§2.2.9） |
| DD-13 | 日志 = 新档 `pet-physics.log`（debug 开时） | 与 `pet-drag.log` / `pet-geometry.log` 家族同形；关闭零开销 | 并入 `pet-geometry.log`（混淆两族判据） |
| DD-14 | 生命周期三重停点（tick 首行守卫 + `before-quit` + 销毁路径） | 承 NFR-4「异常路径也清空」；不依赖单一路径 | 只靠 tick 自守（退出时可能残留定时器） |
| DD-15 | 起飞阈值口径 = **显式起飞门（G10）+ 单一常量 `T`**（默认 500 px/s，待实机标定）；判据在**门量**上比较（**闭区间**；门量的定义见 DD-16 / §2.2.12） | 用户裁定要判别的正是「缓放 / 快甩」这一支 ⇒ 阈值必须**可见可测**（诊断行可区分）；单一常量保证机检（AC17）；值照搬样本避免凭空取值 | 内嵌死区过滤（原设计）/ 双阈值（§2.1 H 组逐条否决） |
| DD-16 | **判据量 = 速度（不是加速度）**：门量 = 松手前 `GATE_WINDOW_MS`（120 ms）窗内的**峰值分段速度** + **静默放置规则**（窗内位移 ≤ `QUIET_SPAN_MAX_DIP` ⇒ 放置）；**加速度不得单独翻转门判据** | ① 动量 `m·v` 是一阶量；② 8 ms 采样下二阶差分放大抖动 ⇒ 误判「甩」；③ 放手前常先减速 ⇒ 以加速度判据会**判反**；④ 零额外数据面 | 加速度作主判据 / 末瞬单点 / 加权均值（§2.1 I 组候选 2–4） |
| **DD-17** | **地面口径 = 可见身体底沿**（B26；`FEET_INSET_DIP = 26 + 4 = 30`，散步 y 归位同口径） | ① 与渲染层锚点**同源**（媒体盒 / 命中区 / `#pet{bottom}`）；② 补实测 alpha 残差较大者（4）⇒ 视频 / PNG 动画帧**真踩实**，代价 = 待机 PNG 越沉 ≈4 DIP（O-13）；③ 两分量各一处常量、可逆 | 逐通道 alpha 补偿（新 IPC / 渲染层测量）· 起飞时一次性校准 · 改 `#pet{bottom}`——J 组否决 |

### 2.5 与既有纪律 / 既有实现的冲突点核对

#### 2.5.1 逐条证明：不与几何纪律相抵（对应批次档 §1.4-2）

| # | 纪律句（出处） | 本设计的遵守方式 | 机检判据 |
|---|---|---|---|
| 1 | `petSavePos()` 只在离散停泊事件调用、**不得在 tick 内调用**（`shell-pet-geometry.js:170`） | 物理 tick 函数体内**零** `petSavePos`；落盘只在停泊序列（离散一次）。新增的停泊点 = 「物理静止」——与既有枚举中的「散步段末」**同类**（运动结束的停泊事件） | 符号级：tick 体内零 `petSavePos` 命中；日志面：`pos-save` 只在 `phys-rest` 之后 ≤1 行 |
| 2 | 尺寸校准不得逐帧 / 不得在移动中（`:33` + 设计档 §2.3.5-B 第 4 条 / DD-22） | 物理 tick 体内**零** `petCalibrateSize` / **零** `getSize`；校准只在停泊序列（此时窗口**已静止**——与「散步段起点」同前提） | 符号级（同上）+ 运行时：飞行期无尺寸型 `geom-fix` 行 |
| 3 | 尺寸写入 = `setBounds` 尺寸专用形态、`petCalibrateSize` 唯一（`:26` / `:382`） | 本批**不新增**任何尺寸写入路径（只调用既有 helper） | 静态：全批无新增 `setBounds` / `setSize` 调用 |
| 4 | 位置推导与坐标空间（`shell-pet-drag.js:20-21` / R6–R8） | 物理用同一 `setPosition` DIP 空间；不重锚、不换参考系 | 冻结面零 diff + 物理只用 `getPosition` / `setPosition` |
| 5 | 拖动期间位置不被第三方改写（US-2 / 设计档 §2.6 C7） | 物理 tick 首行先判 `getPetDrag()`，命中即停且**不写位置** | 符号级（顺序）+ 运行时 `phys-stop reason=drag-preempt` |
| 6 | 可见性（NFR-5：中心点须在某屏 workArea 内） | 飞行边界 = 该屏工作区 ⇒ **收口点必在区间内**（由 §2.2.4 的钳入保证，**不依赖起飞点**）；起飞点本身可能落在区间外（US-2 允许拖出屏 / B03 settle 只保**中心点**可见）⇒ 由 §2.2.5 第 7 条的起飞归一化就地钳入（首帧至多一次位移 = 已知限制 O-10）；停泊序列再核一次（幂等） | 运行时：停泊点 `geom-fix reason=physics-rest` 零行（正常路径） |
| 7 | 位置持久化只在离散点（US-13 / NFR-1 子条③） | 飞行期零落盘；停泊点至多一次 `petSavePos` | 日志面（同 #1） |
| 8 | B03 调用时机表（`docs/design/PET-MULTIMONITOR.md` §2.3.2）逐行不变 | 本批**不改**该表；新增的两行调用时点由本档 §2.2.6 承载 | 该档零 diff（建议行见 O-3） |

#### 2.5.2 待裁定项（**不得由设计者自裁**）

| # | 待决（来源） | 候选 | 推荐 + 依据 | 设计如何成文 |
|---|---|---|---|---|
| U-1 | 默认开关（§1.5） | ① 默认开 ② 默认关 | **② 默认关**——依据 = §1.4-5「默认行为保守」（本开关改的是可感知的松手后行为）+ 与 US-23 先例同形 | 按 ② 成文；裁定 ① 只改 `DEFAULT_SETTINGS` 一处 + 本档 §2.2.8 与 TC-23 分支 |
| U-2 | 参数取值（§1.5） | ① 照搬样本 ② 本仓调 | **② 本仓调（已裁定 2026-09-18）**——用户裁定取 B：`restitution` 0.78 → **0.55**（理由 = 玩偶感：可感弹跳 1–2 下、典型抛掷 3.0–3.8 s 停；重算数据 = 批次档 §2.12）；其余四项照搬样本；可逆变 = 单常量、一处 | 按 ② 成文（§2.2.3 表值 = 0.55，样本值并列登记；差异登记 O-12） |
| U-3 | 实现路径（§1.5） | ① 按规格重写 ② 逐行适配 TS | **①**——依据 = ② 在零 TS 工具链下退化为事实重写；浏览器面 / 多屏面必须删改 ⇒「逐行忠实」不可维持 | 按 ① 成文（§2.1 C 组 + §1.3.3 对照表） |
| U-4 | 散步去留（§1.5） | ① 去掉 `doWander` 位移 ② 保留 | **② 保留**——依据 = ① 移除既有可见行为（US-4 / US-9 面回退）；物理定位 =「松手后接管」，与散步**无时段重叠**（互斥由仲裁层保证） | 按 ② 成文（散步只加 1 行守卫） |
| U-5 | 拖动跟手是否改弹簧（§1.5） | ① 不改 ② 改阻尼弹簧 | **① 不改**——依据 = ② 必须改 `shell-pet-drag.js` 内部 ⇒ **相抵硬门禁（几何冻结）**，且重开 B03 的 R6–R8 结论面 | 按 ① 成文；② 属不可选（相抵硬约束） |
| U-6 | O10 是否本批接管位移（§1.5） | ① 只建仲裁层、链仍不接管 ② 本批即接管 | **①**——依据 = B18 §1.9 三条理由 + 本批已新增一个写者（风险叠加）+ 接管可逆（`weights.move` 一行） | 按 ① 成文（§2.2.9 含接管落点） |
| **U-7** | **「缓放即停 / 快甩抛出」阈值口径的追认**（**本轮重写**；依据 = 用户 2026-09-18 原话「很慢的话就急停，很快的话就扔出去」） | ① 追认（按阈值口径收窄注记）② 不追认（则恢复「物理开启即接管」的旧口径） | **① 追认**——已按「物理开启**且释放速度 ≥ T** 时由物理接管；`v < T` 时逐字照旧」收窄三处注记（US-3 / NFR-2 / US-26）；**调整幅度最小化**（「正常放下」这一主流用法语义完全不变） | 按 ① 成文；各注记标「待用户追认」 |
| **U-8** | **飞行边界口径**（本设计新增；**B26 补正**见右） | ① 当前屏工作区（不跨屏）② 逐屏 AABB + 空洞探测（承样本） | **①**——依据 = 与 US-9「散步不跨屏」同源（口径一致）+ ② 新增几何写模式撞 B03 冻结面且**无三屏实机**（不可验证风险）。**B26 补正**：① 的**地面**由「窗口矩形下沿」改为「可见身体底沿」（`+FEET_INSET_DIP`，§2.2.13 / DD-17）；「不跨屏」与 x / 顶边口径**不变** | 按 ① 成文；② 登记 O-1（后续面） |
| **U-9** | **reduced-motion 下是否关闭挤压**（本设计新增） | ① 关闭 ② 保留 | **① 关闭**——依据 = 承 US-19 让步精神 + 样本同款取舍（`pet.ts:1052` 注释「reduce-motion 时跳过」） | 按 ① 成文（CSS 一条） |
| **U-10** | **阈值 `T` 的默认取值与标定**（**本轮新增**；源 = 用户 2026-09-18 裁定） | ① 照搬样本值 500 px/s + 声明「待实机标定」+ 到期条件 ② 本仓另定值（须实机数据） | **①**——依据 = 无实机感受条件（三屏实机 T9 未验）⇒ 只给可调单一常量；标定路径与**到期条件**（用户实机感受一次后的裁定轮）成文于 §2.2.12 | 按 ① 成文；裁定只改常量一处，结构不动 |

**open（UI / 交互决策未定，落档不自裁）**：

| # | 项 | 候选 | 影响 |
|---|---|---|---|
| open-1 | 托盘 checkbox **标签文案** | ①「甩抛物理手感」②「松手后甩抛」③「物理手感（可甩抛）」 | 仅文案；推荐 ①（与既有「任务完成时通知」同形：名词短语） |
| open-2 | 专注模式下该托盘项的处置 | ① 置灰（同「找回鲸鱼娘」）② 常驻可点 | 专注模式无桌宠窗口 ⇒ 开关无对象；推荐 ① |
| open-3 | 撞墙 / 撞顶是否也做形变 | ① 不做（本批）② 做 | 本批按 ①（US-25 边界）；② 属观感扩展，另批 |

#### 2.5.3 前置缺陷与观察项（发现即报告）

| # | 类别 | 内容 | 处置建议 |
|---|---|---|---|
| O-1 | 后续面 | **跨屏飞行**（逐屏 AABB + 空洞 / 面板探测，承样本 `throwStepRegion`） | 另批（待三屏实机 T9 可用） |
| O-2 | 纪律句完备性 | `shell-pet-geometry.js:170` 的「离散停泊事件」**只列举落盘时机**、未提尺寸校准面；本设计以「tick 内零落盘 + 零尺寸写入」双向自守（比纪律句更严） | 建议行：几何档下次修订补一句枚举完备性说明 |
| O-3 | 指针缺口 | `docs/design/PET-MULTIMONITOR.md` §2.3.2 调用时机表**未含** B20 的两行（物理接管期 / 物理停泊点）；该档 §3.3 的 reason 词表未含 `physics-rest` | 建议行：主 agent 收口同步（或授权本设计者在修正轮补两行指针） |
| O-4 | 地图不同步 | `docs/README.md` §二 `docs/requirements/PET.md` 行的「内容」列自 B18 / B19 起未同步（仍只列 B01 / B03 两段）；`docs/design/PET-MOVEMENT.md` 行亦落后两轮修正（现为 AC1–AC20 / TC-1…TC-37 / DD-1…DD-16 / 选型 A–I / U-1…U-10 / O-1…O-12） | 建议行：主 agent 同步（**地图面归主 agent**；本设计者只提交建议行，不落笔地图） |
| O-5 | 命名形态张力 | `docs/CONVENTIONS.md` §二「IPC 通道 = `<域>:<动作>`」与既有 `pet-*` 破折号族（12+ 条，含 B18 新增 `pet-chain-config`）形态不一致 | 本批新通道按**规则句**取名 `pet:physics-squash`；存量迁移属另批（建议行） |
| O-6 | 流程面 | 本仓**无**「改动面反查（文档影响面）」脚本（工程纪律要求实施轮开工前跑） | 本批以人工受影响文件清单承担；建议行（归 B15 / B16 或另批） |
| O-7 | 回归面 | B03 dev 桩仍损坏（T29）⇒ 本批回归面仍靠几何零 diff | 承 B18 §1.4-2；T29 属另批 |
| O-8 | 观感差异 | 本批**不采用**样本的 `sideAllow`（身体贴边）语义 ⇒ 抛掷停止点比样本离屏缘略远（窗口矩形的透明留白） | 与散步口径同源（一致性优先）；是否采用待用户裁 → **已由 B27 采用（核销）**：R21 按「可见身体」口径扩上 / 左 / 右三面（§2.2.14）——本观察项就此闭合 |
| O-9 | 观感交错 | 飞行期可能被 B19 工作档的「重断言」切走动作档（≤1 s） | 写权不受影响；待 B19 实施后实机看 |
| O-10 | 已知限制（**常规路径**，本轮修正） | 起飞点可合法落在飞行区间外（US-2 允许拖出屏 + B03 settle 只保**中心点**可见）⇒ §2.2.5 第 7 条在建 `s0` 时钳入；窗口有 ≤ 1 tick（16 ms）在区间外，位移由该 tick 的一次 `setPosition` 落地（**不新增写入时点**） | 已落档为已知限制；**不产生伪 Q 弹**。要求「拖出屏零位移」= 边界语义变更（中心点式边界），另批裁定 |
| O-11 | 样本注释与实现不符 | 样本注释（`samples/dsh-pet/dsh-pet/src/shared/physics.ts:212-213`）称死区判定与初速 / 软上限「一体线性缩放（相对力度）」；实现（`:263-264`）却把固定常量 `DEAD_ZONE_SPEED` 与**已乘 `throwPower`** 的速度比较 ⇒ 死区在原始速度上随 p 反比变化，与注释相反 | 本仓按**实现口径**（§2.2.12）；样本为只读参考（R14）不改；将来改 `throwPower` 默认值时复核该口径 |
| O-12 | 与样本的参数差异（**裁定面**） | 本仓 `restitution` **0.55**（登记作 ≈ 0.55）vs 样本 `assets/config.jsonc:92` 的 **0.78**（其余四项照搬） | **理由** = 手感裁定 B（玩偶感：首触后可感弹跳 1–2 下——实测弹跳高度 115 / 33 / 10 / 2 px；典型抛掷 3.0–3.8 s 停）；**可逆性 = 单常量、一处**（§2.2.3）；**待实机标定**（到期条件 = 用户实机感受一次后的裁定轮）；样本为只读参考（R14）不改 |
| **O-13** | **B26 残差与通道差（观感面；修正轮 1 改写）** | 地面 = **声明身体盒**下沿 + 残差补偿（`FEET_ALPHA_MARGIN_DIP` = **4**）⇒ 视频（≈4.2）与 PNG 动画帧（≈3.6）**真踩实**（|残留| ≤ 0.5 DIP）；**唯一反向通道 = 待机 PNG（残差 0）⇒ 越沉 ≈4 DIP** | **登记 + 保留调值路径**：常量一处（**回正 0** = 只对齐锚点、全通道不越沉）；细目 = 本表后 O-13 段；是否接受 4 DIP 越沉由用户实机观感裁定（批次档 §2.10 U 项） |
| **O-14** | **B03 口径的具名例外（跨档指针；补 `bounds` 面）** | 停在地面 ⇒ 标称矩形越出工作区下沿 `FEET_INSET_DIP` = 30 DIP（透明区）⇒ 与 `PET-MULTIMONITOR.md` §2.3.1 / §2.3.6「标称矩形 ⊆ 工作区」有**一处具名例外**；同一越界也落在 `bounds` 面（细目 = 本表后 O-14 段） | **建议行**（B03 文档面归主 agent）：B03 下次修订补「`+FEET_INSET_DIP` 例外」；实机复核 = 批次档 §2.7-2 |
| **O-15** | **初始 / 找回落点与物理地面不同线**（登记 + 显式取舍） | `petDefaultPos()` = `bounds.maxY − 24`（`shell-pet-geometry.js:134`）供存档回落（`:160-164`）与找回（`shell-pet.js:146-153`）；救援钳入用未补偿上界（`:126`）⇒ 落点脚底比工作区底边高 ≈50 DIP | **本批不动**（改 = 动 B03 落点口径）；实机目视 = 批次档 §2.10.4 |

**O-13 细目（实测源、补偿量与再测路径；B26 / 修正轮 1 更新）**

- **视频通道**：B18 §5.2 探针实测首帧 alpha 包围盒 = 画布 `y[63,329]`，而声明盒 `y1 = 335` ⇒ 差 6 画布 px × `scale` 0.70175 ≈ **4.2 DIP**（参考帧 = 池首段 `待机呼吸休闲` 首帧；各段 alpha 下沿未逐段实测）⇒ 本批取补偿量 **4**（取整、略欠）⇒ 落地残留 ≈ **0.2 DIP 悬空**（踩实）。
- **PNG 通道**：动画帧（240×220）实测透明下边距 **4 px** ⇒ `height:200px` 时 ≈ **3.6 DIP** ⇒ 落地残留 ≈ **0.4 DIP 越沉**；待机帧 `assets/pet/idle.png`（160×160）= 满幅（残差 0）⇒ 落地**越沉 ≈4 DIP**（唯一反向通道，见上表 O-13）。
- **调值 / 再测路径**：`FEET_ALPHA_MARGIN_DIP` 一处（4 → **0** 为**回正** = 只对齐锚点、全通道不越沉；4 → 其他值 = 细调）；改值须同步 §2.2.3 表值、§2.2.13 常量块与 §3.1 AC21① / 注 A 的等式解释。
  再测 = `npx electron probe-pet-media.js`（打 alpha 包围盒）/ PNG alpha 解码（逐段）。

**O-14 细目（`bounds` 面与条件分支；B26 / 修正轮 1）**

- `petRectInside(pos, display.bounds)`（`shell-pet-geometry.js:250-254`）的两个消费方 = `petStraddleFix()`（`:286`）与拖动跨屏标记（`shell-pet-drag.js:133`）。
- **条件分支**：当该屏 `workArea` 底边 **==** `bounds` 底边（任务栏置顶 / 自动隐藏）且窗口又与另一块 `scaleFactor` **不同**的屏重叠时，`petStraddleFix` 会同次把窗口**上推**（`kind='straddle'` ⇒ `geom-fix`）⇒ 正好抵消 F2，且使 AC22③/④ 在该配置下不成立（实机复核 = 批次档 §2.7-2）。

---

## 三、测试层

### 3.1 验收标准逐条回指

| AC | 回指需求 | 判据（每条可机器验证） | 取证方式 |
|---|---|---|---|
| AC1 | US-24 | 给定初速与边界：① 轨迹恒在 `[minX,maxX]×[minY,maxY]`；② 首次撞墙后 `|vx'| = 0.55|vx| ± 0.02`；③ 触地后 `vx *= 1 − 2.5·dt`；④ 静止收敛按 **NFR-19 的两档口径**：近地软着陆档（首触竖直速度 `\|vy_imp\| ≤ 800 px/s`）⇒ `atRest` ≤ 4 s；其余 ⇒ ≤ 5 s 硬上界且**收口在地面**（`y == maxY`） | 桩测（纯函数逐条断言） |
| AC2 | US-24 | `ceilingBounce = true` ⇒ `y` 在 `minY` 被夹且 `vy` 转正 ×0.55；`false` ⇒ `y < minY` 时**不夹不弹**（越界保持，仅重力回落） | 桩测 |
| AC3 | US-24 | 空轨迹 / 末样本 age >150 ms / 窗口 span <20 ms / 端点位移 ≈0 ⇒ `null`（**四类**；低速不再判 null——§2.2.12）；平滑甩动 ⇒ 方向符号正确、大小落在真值 ±60% 带内；任意输入 ⇒ `|v| ≤ 3600×throwPower` | 桩测（扫描） |
| AC4 | US-25 | `landingSquash`：`\|vy\|` ≤300 ⇒ 0.8、≥1500 ⇒ 0.55、区间内单调不增；`squashScale`：u=0/u=1 ⇒ 1（±0.12 过冲上界）、u∈[0,0.45] 单调递减；渲染面 `#pet-squash` + reduce-motion 分支在场（**目视项**）；④ 曲线**定义恰 1 处**（§2.2.7）；⑤ 贴地起飞不产生伪挤压 | 桩测 + 静态核对（+ 人工目视） |
| AC5 | US-26 | ① `decideOwnership` 全 8 组合 ⇒ 恒取优先级最高者；② 物理 tick 体内 `getPetDrag()` 判定出现在任何 `setPosition` **之前**；③ 运行时：`drag-preempt` 之后无 `phys-tick … wrote=1` | 桩测 + 静态机检 + 日志面 |
| AC6 | US-26 | armGate **11** 条（G1–**G11**）逐条置假 ⇒ 逐条对应 `phys-stop reason` 且**零写入**；全通过 ⇒ `phys-arm` 行在场且 `pos` == `geom tag=drag-end` 行的 `pos` | 桩测（门函数）+ 日志面 |
| AC7 | US-26 | ① 符号级：物理 tick 体内 `petSavePos` / `petCalibrateSize` / `getSize` 零命中；② 符号级：`clearInterval` 先于停泊序列；③ 运行时：停泊点 `geom-fix reason=physics-rest` 零行、`pos-save` ≤1 行、尺寸型 `geom-fix` ≤1 行 | 静态机检 + 日志面 |
| AC8 | US-27 | ① 托盘「设置」子菜单含该 checkbox 且 `checked === settings.get().petPhysicsEnabled`；② 切换后 `settings.json` 顶层键落盘（读回核对）；③ 默认值 == U-1 裁定值；④ 关闭 ⇒ `phys-*` 零行、无飞行 | 静态核对 + 实机（读回 `settings.json`） |
| AC9 | US-28 | §2.2.10 的 **10 条降级行 + 1 条主流分支行**（共 11 行）逐行的**行为**（不起飞 / 就地停泊 / 零写入 / 强制落地）与**日志** reason 一致；关闭态与今天逐位一致（几何 + 拖动面零 diff） | 桩测（门 / 停泊路径）+ 静态 + 日志面 |
| AC10 | NFR-18 | ① 每 tick `setPosition` ≤1 次且同目标去重；② 飞行期取屏 0 次（源码核：`petCurrentDisplay` / `petDisplayOf` 仅出现在 arm 与停泊路径）；③ 关闭态零定时器 / 零日志；④ **拖动期**（16 ms 光标采样器运行中）的开销落在 NFR-1 的 <5% 预算内，且与拖动循环**同一次 10 s 采样**度量（不与拖动期分开取样） | 静态机检 + 桩测 + 日志面 + **CPU 实测（含拖动期）** |
| AC11 | NFR-19 | 扫描集 **128 例**（8 方向 × 4 速 × 4 起点）：① 轨迹恒界内、全部 ≤5 s **收口**且收口后无 `wrote=1`；② `timeout` 例收口后 `pos.y == maxY` + 速度归零（不得停在半空）；③ 首触 `\|vy_imp\| ≤ 800 px/s` 档 ⇒ ≤4 s（**e = 0.55 重算**：档内最坏 3.33 s，推导见批次档 §2.12）；④ `gravity = 0` ⇒ 收口在地面；⑤ 占比 / 最坏值记 §5（基准 ≤4 s 74 · 4–5 s 44 · 上界 10） | 桩测 + 日志面 |
| AC12 | NFR-20 | 核心档 require 面 = 零 `electron` / 零 `node:fs`；双环境导出在场；桩测末行 `pass/total PASS` 且 `total ≥ 40` | `node .thincoder/b20-pet-physics-stub.mjs`（亲跑） |
| AC13 | NFR-21 | 四档（几何 ×2 / 链 ×2）与 `assets/**` 的 `git diff --stat` 为空；`package.json` 依赖段零 diff、`build.files` 增列 2 行；新档行宽 ≤300 / 行数 <500 / 文件头标准形 | 命令 + 静态核对（命令原文入批次档 §5） |
| AC14 | NFR-22 | `pool.json` 零 diff（`weights.move = 0`）；`pet-chain*.js` 零 diff；`docs/design/PET-MULTIMONITOR.md` 零 diff；B19 相关面零 diff | 静态机检 |
| AC15 | US-24、US-26（+ US-3 / NFR-2 的修订注记） | **门量** `v`（= 120 ms 窗内峰值分段速度）< `T` ⇒ ① `phys-stop reason=below-threshold` 在场；② 其后再无 `phys-tick … wrote=1` 行（物理面零写入）；③ 拖动循环的 `tick` 行在 `drag-end` 之后绝迹；④ 位置自 `drag-end` 后至多 1 次变动（= 冻结面 settle，与今天同形）⇒ **US-3 / NFR-2 逐字照旧** | 桩测（门）+ 日志面 |
| AC16 | US-24 | `v ≥ T` ⇒ `phys-arm` 在场，随后按 §2.2.4 步进：撞墙 `\|vx'\|` = 0.55`\|vx\|` ±0.02、触地摩擦衰减、**静止收敛按 AC11 的两档口径**（近地软着陆档 = 首触 `\|vy_imp\| ≤ 800 px/s` ⇒ ≤4 s；其余 ⇒ ≤5 s 且**收口在地面**）、轨迹恒界内 | 桩测 + 日志面 |
| AC17 | US-24 | ① 阈值常量的**定义处**恰 **1** 处（其余按名引用、不重复字面值；机检 = 定义命中数 == 1）；② 其命名 / 注释标明量纲 px/s；③ 默认值 == §2.2.3 表值；④ §2.2.12 的「待实机标定 + 标定路径 + 到期条件」在场 | 静态机检 |
| AC18 | US-24 | 边界两支同时断言：门量 `v = T` ⇒ 起飞（**闭区间**）；`v = T − 1 px/s` ⇒ 不起飞（`below-threshold`） | 桩测 |
| AC19 | US-24 | **静默放置**：松手前 120 ms 窗内**端点位移 ≤ 5 px** ⇒ 不起飞（`phys-stop reason=quiet-dwell`）+ 物理面零写入 + ≤200ms 静止；与「位移 > 5 px 且 `v < T`」两支**可区分**（后者 = `below-threshold`） | 桩测（门）+ 日志面 |
| AC20 | US-24 | **判据量 = 速度（判别力断言）**：同一门量 `v`、末段加速度 **+ / −** 两例 ⇒ 门判据结果**相同**；门函数入参 = 标量速度（体内零加速度项）；`ACCEL_REF` / `ACCEL_GAIN_MAX` 的常量行标「不进判据」 | 桩测 + 静态机检 |
| **AC21** | US-24（B26） | **地面 = 可见身体底沿**：① 桩测——增量 == `FEET_INSET_DIP`（30）∧ `petEdgeBounds(null) === null` ∧ `FEET_ANCHOR_INSET_DIP === 270 − PET_FEET_Y`；② 符号级——飞行与散步 y 归位**同取** `petEdgeBounds`；③ `y + PET_FEET_Y == wa.y + wa.height + FEET_ALPHA_MARGIN_DIP`（±1）；细目 = 注 A | 桩测+静态机检+日志 |
| **AC22** | US-24（B26） | **口径不产生位置回拉 / 上跳**：① 落地后原地再起飞（**限 `vy ≥ 0`**），首帧 `phys-tick` 的 `y` **不减小**；② 落地后散步段起点 `geom tag=seg-start` 的 `y` == 落地 `y`；③ 落地后 `petSettlePos` 判 `kind='none'`（**零 `geom-fix` 行**，条件例外见 O-14）；**细目 = 注 A** | 静态机检 + 日志面 |
| **AC23** | US-34（B27） | **边界四面化（可见身体口径）**：① 桩测——`petEdgeBounds` 四边增量与常量等式逐条（细目 = 注 B′）；② 符号级——飞行与散步**同取** `petEdgeBounds`（两处命中）；③ 日志——静止于侧 / 顶边时 `x + hit.left ≈ wa.x` / `y + hit.top ≈ wa.y`（±1，与常量算术配对） | 桩测 + 静态机检 + 日志 |
| **AC24** | NFR-25（B27） | **零回退与可见性**：① 冻结面零 diff——**15 档清单**（= 批次档 §2.3 / `docs/design/PET-ANIMATION.md` §3.9 AC35①；不含本批改动面 `pet-chain*.js` / `assets/pet-anim/pool.json`）逐档 `git diff --stat` 空；② 中心点可见性——补偿后位置 `visible=1`（日志 `geom` 行）；③ 改动档行宽 ≤300 / 单档 ≤500 / 文件头标准形 | 机检（git + 静态 + 日志） |

**B26 连带（修正轮 1 #8）**：AC11 的扫描集须按新地面（`FEET_INSET_DIP` = 30 DIP）**重跑并重新登记**；影响估算与余量 = §2.2.13 末段。

**注 A —— AC21 / AC22 判据细目（B26；修正轮 1 更新）**

- **AC21①（常量等式，跨档核对）**：桩测装载**可装载**的真实实现——`FEET_INSET_DIP === FEET_ANCHOR_INSET_DIP + FEET_ALPHA_MARGIN_DIP`（本批 = 26 + 4 = **30**）∧ `FEET_ANCHOR_INSET_DIP === 270 − PetChainCore.PET_FEET_Y`（244；`pet-chain-core.js:16` / `:193`）∧ **`petEdgeBounds(null) === null`**（空值契约；B27 起名，原名 `groundBounds`）。
  - **`270` 的来源与限制（修正轮 1 #12 如实登记）**：唯一权威处 = `shell-pet-geometry.js:29` 的 `PET_SIZE_DIP.h`，但该档 `require('electron')`（`:7`）⇒ **node 不可装载** ⇒ 桩测**不得** require 它。
    可装载的同源实数源 = `pet.html:13-14`（`#pet-wrap { height: 270px }`）与 `:34`（`#pet { bottom: 26px }`）⇒ 桩测从 HTML 取这两数，与 `PetChainCore.PET_FEET_Y`（244）三方交叉核对。
    残留弱点（明示）：若 `PET_SIZE_DIP.h` 与 `pet.html` 同时改而 `PET_FEET_Y` 未改，等式仍可通过（弱镜像面**收窄**，非消除）。
- **注 B′（AC23 判据细目，B27）**：桩测装载**可装载**的真实实现（`pet-physics-core.js` + `pet-chain-core.js` 双环境导出）——等式按 AC23① 字面用 `PetChainCore` 常量求值（顶边 = `PET_FEET_Y − PET_BODY_TARGET_H`；侧边 = `round((PET_STAGE_W − hit.w)/2)`，逐条见 §2.2.14.3）；`pet.html` 的 250×270 作**三方交叉核对**（弱镜像面收窄，非消除——残留弱点同注 A）。
  - **四面增量与空值契约（AC23①）**：`petEdgeBounds` 增量 ==（minX−41, maxX+41, minY−44, maxY+30）∧ `petEdgeBounds(null) === null`——与 §2.2.14.3 机检等式同源。
  - **顶边常量等式（AC23①）**：`TOP_EDGE_INSET_DIP === PetChainCore.PET_FEET_Y − PetChainCore.PET_BODY_TARGET_H`（244 − 200 = 44）。
  - **侧边常量等式（AC23①）**：`SIDE_EDGE_INSET_DIP === Math.round((PetChainCore.PET_STAGE_W − PetChainCore.mediaBox({canvas: PET_MEDIA_CANVAS, body: PET_MEDIA_BODY, targetH: PET_BODY_TARGET_H, feetY: PET_FEET_Y}).hit.w) / 2)`（≈ (250 − 168.42)/2 = 40.79 → 41）。
  AC23③ 的日志算术：`hit.left` / `hit.top` = `PetChainCore.mediaBox(...)` 的纯函数值（40.79 / 44.0）；配对 = `geom tag=physics-rest` 行的 `pos` 与同刻 `wa`（与 AC21③ 同法）。
- **AC21③（日志面）**：`phys-rest pos=(x,y)` 与同一时刻 `geom` 行的 `wa` 配对取值 ⇒ `y + PET_FEET_Y == wa.y + wa.height + FEET_ALPHA_MARGIN_DIP`（±1 DIP；本批 = 底边 **+4**）。
- **AC22①（输入写死，修正轮 1 #5）**：用例必须写死「**平抛 / 斜下抛（`vy ≥ 0`）**」——向上抛（`vy < 0`）时首帧 `y` 合法减小（`shell-pet-physics.js:195-215` / `pet-physics-core.js:232-242`），原表述会出**假失败**；与抛向无关的等价判据 = 「首帧 `y` **不小于** `groundBounds(wa).maxY`」。
- **AC22③ 的条件例外（O-14）**：`workArea` 底边 == `bounds` 底边 ∧ 混合 `scaleFactor` 重叠的配置下，骑线推离会上推窗口（`kind='straddle'` + `geom-fix` 在场）；实机复核项 = 批次档 §2.7-2。
- **AC22④（冻结面）**：`shell-pet-geometry.js` / `shell-pet-drag.js` / `pet-chain.js` / `pet-chain-core.js` / `assets/**` 与 `main.js` / `package.json` 逐档 `git diff --stat` 为空。

### 3.2 用例表（TC-1…TC-44）

| TC | 类型 | 输入 | 期望输出 | AC |
|---|---|---|---|---|
| TC-1 | 正常 | 初速 (1200, −400)、起点 = 屏中央（窗口左上角 `(835, 385)`，单屏工作区 1920×1040） | 抛物线 ⇒ 触地 ⇒ 反弹 ⇒ 摩擦衰减 ⇒ 按 AC11 的**两档口径**收敛：该例首触竖直速度 `1078 px/s` > 档界 800 ⇒ **非档内支** ⇒ ≤5 s 且**收口在地面**（e = 0.55 实测 `rest ≈ 3.81 s`、`reason=atRest`、`snap=0`）；轨迹不出界 | AC1、AC11 |
| TC-2 | 正常 | 向右飞行撞 `maxX` | `vx` 反号，`|vx'| = 0.55|vx| ±0.02` | AC1 |
| TC-3 | 正常 | 触地且 `|vy| ≥ 40` | `vy` 反号 ×0.55；`vx *= 1 − 2.5·dt` | AC1 |
| TC-4 | 正常 | 贴地且 `|vy| < 1`、`|vx| < 15` | `atRest = true`（此后不再变化） | AC1、AC11 |
| TC-5 | 边界 | `ceilingBounce = true`、向上抛 | `y` 夹在 `minY`、`vy` 转正 ×0.55 | AC2 |
| TC-6 | 边界 | `ceilingBounce = false`、向上抛 | `y < minY` 保持越界（不夹不弹），随后重力拉回 | AC2 |
| TC-7 | 边界 | `gravity = 0`（样本声明为合法值）、水平轻抛 | 不落地的极限情形由 **5 s 硬上界**收口（`timeout` + **强制落地到 `y = maxY`**），状态清空 | AC11、AC9 |
| TC-8 | 边界 | `dt = 0.5 s`（卡顿巨帧） | `dt` 夹到 0.05 ⇒ 单步位移有界、无跳变 | AC1 |
| TC-9 | 边界 | 极端输入 100000 px/s | 软上限 ⇒ `|v| ≤ 3600 × throwPower` | AC3 |
| TC-10 | 边界 | `throwPower = 2` | 软上限 7200；**门判据不乘 p**（原始峰值速度判）⇒ 门槛不随 p 变化，`p` 只放大飞行初速 | AC3、AC17 |
| TC-11 | 异常 | 空轨迹 | `estimateReleaseVelocity = null` ⇒ 不起飞（`reason=no-trail`） | AC3、AC9 |
| TC-12 | 异常 | 末样本 age = 200 ms（松手前停顿） | `null` ⇒ 温柔放下 | AC3、AC9 |
| TC-13 | 异常 | 采样窗口 span = 10 ms | `null`（窗口太短） | AC3 |
| TC-14 | 异常 | 峰值 300 px/s（轻推） | 估计**非 null**（小初速）⇒ 起飞门拒绝（`below-threshold`） | AC3、AC15 |
| TC-15 | 异常 | 端点位移 ≈0（纯抖动） | `null` | AC3 |
| TC-16 | 正常 | 平滑甩动 1200 px/s（合成轨迹） | 估计方向正确、大小在 ±60% 带内 | AC3 |
| TC-17 | 正常 | `decideOwnership` 全 8 组合 | 恒取优先级最高者（drag ≻ physics ≻ wander） | AC5 |
| TC-18 | 边界 | 物理 tick 在 `dragActive = true` 下进入 | 立即停（不写位置），日志 `drag-preempt` | AC5 |
| TC-19 | 边界 | armGate **11** 条逐条置假 | 逐条对应 `phys-stop reason`、零写入、窗口位置不变 | AC6、AC9 |
| TC-20 | 正常 | 正常松手（无校正、无逃跑、可估初速） | `phys-arm` 行在场，`pos` == 松手收口后位置 | AC6 |
| TC-21 | 异常 | 松手命中贴边挣脱分支（`moveTimer !== null`） | 不起飞（`reason=wander-busy`）；既有挣脱行为不变 | AC6、AC9 |
| TC-22 | 正常 | 飞行至 `atRest` | 停循环 → 停泊序列各 ≤1 次；tick 内零落盘零尺寸；`reason=atRest` | AC7、AC10 |
| TC-23 | 边界 | 开关关闭（默认值） | 采样器不起、无飞行、`phys-*` 零行、无新增定时器 | AC8、AC10 |
| TC-24 | 边界 | 开关打开 → 飞行中关闭 | 立即停泊收口（`reason=toggle`）+ 落盘一次 | AC8、AC9 |
| TC-25 | 边界 | 落地帧与连续贴地帧 | 挤压只触发一次（`landed ∧ !prevGrounded`）；深度 = `landingSquash(积分前 vy)` | AC4 |
| TC-26 | 边界 | `prefers-reduced-motion: reduce` | 挤压不播放（CSS 静态核对 + 目视） | AC4 |
| TC-27 | 边界 | 飞行超过 5 s | **强制落地**（`y = maxY` + 速度归零）⇒ 停泊序列（`reason=timeout`、`snap=1`）+ 状态清空；**收口后不得停在半空** | AC11、AC9 |
| TC-28 | 异常 | 飞行中起拖 | ≤1 tick 内停物理、零写入、拖动手感不变 | AC5、AC9 |
| TC-29 | 异常 | 飞行中显示器事件 | 物理先停（零写入）；随后几何路径做 settle / 校准 / 落盘 | AC7、AC9 |
| TC-30 | 异常 | 缓放：连续慢拖后松手（估计 `v = 300 px/s`） | 不起飞（`phys-stop reason=below-threshold`）；物理面零写入；位置自 `drag-end` 后 ≤1 次变动；拖动循环行绝迹 | AC15 |
| TC-31 | 正常 | **快甩**：起点 = 屏中央（`(835, 385)`）、方向 = **水平向右**、门量 `v = 1200 px/s`（≥ `T`；窗内位移 ≫ 5 px ⇒ 非静默） | ① `phys-arm` 在场；② 首触竖直速度 `1008 px/s` > 档界 800 ⇒ **非档内支** ⇒ ≤5 s 且**收口在地面**（e = 0.55 实测 `rest ≈ 3.36 s`、`reason=atRest`）；③ 轨迹恒界内 | AC16、AC11 |
| TC-32 | 边界 | 扫描阈值常量的定义处 | 仓内**定义恰 1 处**；量纲注释在场；值 == §2.2.3 表值 | AC17 |
| TC-33 | 边界 | `v = T`（恰在阈上） | **起飞**（闭区间） | AC18 |
| TC-34 | 边界 | `v = T − 1 px/s` | **不起飞**（`below-threshold`） | AC18 |
| TC-35 | 异常 | **静默放置**：先快拖 400 px/s → 停 130 ms → 松手（末 120 ms 窗位移 ≤5 px） | 不起飞（`phys-stop reason=quiet-dwell`）；物理面零写入；位置自 `drag-end` 后 ≤1 次变动 | AC19 |
| TC-36 | 边界 | 末 120 ms 窗位移 = 6 px 且门量 `v = 300 px/s` | 不起飞（`below-threshold`）——与 TC-35 的两支**可区分** | AC19、AC15 |
| TC-37 | 边界 | 同一门量 `v = 800 px/s`；末段加速度 **+ / −** 两例（合成轨迹） | 门判据结果**相同**（= 速度口径；加速度不参与） | AC20 |
| **TC-38** | 正常 | 快甩落地（门量 `v ≥ T` ∧ 非静默；物理开启） | 收口在地面：`y + PET_FEET_Y == wa.y + wa.height + FEET_ALPHA_MARGIN_DIP`（= 可见脚底踩工作区底边；本批 +4，±1 DIP）；`phys-rest reason=atRest` · `snap=0`；轨迹恒在 `[minX,maxX] × [minY, maxY+30]` | AC16、AC21 |
| **TC-39** | 边界 | 落地（`y` = 地面）后：① 原地再起飞（**输入写死：平抛 / 斜下抛 ⇒ `vy ≥ 0`**，同门量 `v ≥ T`）；② 触发一次散步段 | ① 首帧 `phys-tick` 的 `y` 不减（钳入用同一地面，零上跳；等价判据 = `y ≥ groundBounds(wa).maxY`）；② `geom tag=seg-start` 的 `y` == 落地 `y`（段起点归位同口径，零跳变） | AC21、AC22 |
| **TC-40** | 异常 | 落地后显示器事件 / 松手校正路径（**默认配置**：`workArea` 底边 ≠ `bounds` 底边） | `petSettlePos` 判 `kind='none'` ⇒ **零 `geom-fix` 行**（位置不被拉回 30 DIP）；无异常。**条件例外（O-14）**：任务栏置顶 / 自动隐藏 ∧ 混合 `scaleFactor` 重叠 ⇒ 骑线推离可能上推窗口（该配置下预期不成立；复核 = 批次档 §2.7-2） | AC22 |
| **TC-41** | 正常 | 快甩（门量 `v ≥ T`）**水平向右**，停泊在**右缘**（默认配置单屏工作区 1920×1040） | 停泊 `pos` 满足 `x + hit.right == wa.x + wa.width`（±1；hit.right ≈ 209.2 = `mediaBox(...).hit.left + hit.w`）——身体右缘贴工作区右缘；`phys-rest reason=atRest`；轨迹恒在 `petEdgeBounds(wa)` 内 | US-34 / AC23、AC24 |
| **TC-42** | 边界 | **上抛**撞顶（`ceilingBounce=true`，门量 `v ≥ T`） | `minY` 扩展后身体顶缘可到 `wa.y`：反弹帧 `y == minY`（= `wa.y − 44`）∧ 轨迹不出 `petEdgeBounds(wa)`；收口在地面（底面口径不变） | US-34 / AC23 |
| **TC-43** | 异常 | 起飞评估时 `petWorkAreaBounds` 为 null（屏不可取） | `petEdgeBounds(null) === null` ⇒ G8 `no-bounds` 照旧（零写入、不起飞） | US-34 / AC23① |
| **TC-44** | 边界 | 抛到左 / 右缘落地后触发一次散步段（15–35 s 计时到点） | 散步撞墙判定 = 扩展边：`seg-start` 的 `y` == 落地 `y`（同口径零跳变）∧ 撞墙走到身体贴边处（窗口 x == 扩展 minX/maxX） | US-34 / AC23②、AC24 |

### 3.3 验证手段、仪表与限制

**手段**：① 桩测（`node .thincoder/b20-pet-physics-stub.mjs` ⇒ 末行 `pass/total PASS`）——装载真实核心，覆盖 AC1–AC7 / AC9–AC12 / **AC15–AC20**，并随 B26 / B27 面扩 **AC21–AC24**（B26 地面等式 / B27 `petEdgeBounds` 增量与常量等式；桩测档 = 各批次档 §2.3 所列）；
② 静态机检（四档 `git diff --stat` 零 diff · `package.json` 依赖段零 diff · 行宽行数 · 符号级顺序与零命中核对）；
③ 日志面（`BIGFISH_PET_DEBUG=1` ⇒ `userData/pet-physics.log` + `pet-geometry.log` + `pet-drag.log`；行格式见 §2.2.11）；
④ CPU 实测（`process.getCPUUsage()`，口径同 NFR-1）。

**限制（如实标注）**：
1. **观感类无机器判据**：Q 弹「好不好看」、手感「轻重」= 人工目视（本会话无三屏实机；T9 未验）——与 NFR-6 同类的「人工判定项」。
2. **渲染面取证**：挤压的 DOM 效果需开发期探针 / 目视；本批不新增 `tests/` 档（门禁未建）。
3. **回归面**：B03 dev 桩损坏（T29）⇒ 仍由「几何面零 diff」承担（承 B18 §1.4-2）。
4. **关闭态「零定时器」**：以静态符号核对承担（无运行期定时器探针）。
5. **跨屏 / 混合 DPI 的实机项**：本批飞行不跨屏，但仍要求实机跑一次「拖动跨屏 → 松手 → 飞行 → 停泊」链路（判据 = 无 `geom-fix reason=physics-rest` 行 + 停泊点可见）——该实机项待用户环境（与 T9 同类）。
6. **静止时长的实机观感（本轮按裁定参数重算）**：按现行参数（`g 1400` / `e 0.55` / `REST_VY 40`），中屏典型抛掷（首触竖直速度 ≈ 1000–1080 px/s）在 **3.0–3.8 s** 收口（水平 500 ⇒ 3.02 s；TC-1 例 ⇒ 3.81 s），5 s 硬上界只剩 45° 斜下快甩触达（AC11 扫描 128 例中 10 例）；「可感弹跳 1–2 下」的实测形态（弹跳高度 115 / 33 / 10 / 2 px）见 O-12。参数裁定依据与重算数据 = 批次档 §2.12。

---

## 四、变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-18 | 建档（B20）：落点判定（新建本档，四候选逐条否决）· 需求回指（US-24…US-28 / NFR-18…NFR-22）· 勘察实测（三写者 / 几何纪律原句 / 样本对照表 / 测试面 / B18-B19 交互面）。 |
| 2026-09-18 | 同上（续）：选型对比 A–G 七组 · 契约（仲裁状态机 + armGate / 参数表 / 步进 / 初速 / 停泊 / 挤压 / 开关 / 交互 / 降级 / 日志）· 受影响文件 15 项 · DD-1…DD-14 · 冲突点逐条证明 8 条 · U-1…U-9 与 open-1…open-3 · O-1…O-10 · AC1–AC14 · TC-1…TC-29（**本行计数 = as-of；现行见下行起**）。依据 = `docs/batches/B20-pet-physics.md` §1（立案）。 |
| 2026-09-18 | **修正轮（起飞阈值口径）**：新增 §2.2.12 起飞门判据（`v` / `T` / 闭区间 / 待实机标定）· armGate 9 → **10** 条（G10，`below-threshold`）· 阈值收敛为单一常量 `TAKEOFF_MIN_SPEED` · 新增选型 H 组 / DD-15 / U-10 / O-11；**AC 14 → 18 · TC 29 → 34**。 |
| 2026-09-18 | **修正轮补正（判据量 = 速度）**：§2.2.12 加「判据量 = 速度 + 静默规则」块 · 新增选型 **I 组**（速度 vs 加速度；峰值 vs 加权 vs 末瞬）· **DD-16** · 常量 +2（`GATE_WINDOW_MS` / `QUIET_SPAN_MAX_DIP`）· reason 词表 +`quiet-dwell`（**14** 个）· **AC 18 → 20 · TC 34 → 37**。依据 = 主 agent 追加裁定 2026-09-18（用户已委托）。 |
| 2026-09-18 | **设计评审轮 2 修正（changes-required：1🔴 / 2🟡）+ 参数裁定 B**——#16：TC-31 改可判定（起点 / 方向 / 期望走非档内支），顺查并同源改 TC-1（由「走 5 s 上界」改判收敛）；#17 / #18 属需求档面；**参数** `restitution` 0.78 → 0.55 ⇒ 档界 450 → **800 px/s** + 新增 O-12。**计数不变（AC20 / TC37 / DD16 / 9 组 / U10 / open3）**，**观察项 11 → 12**。 |
| 2026-09-18 | **设计评审轮 1 修正（changes-required；🔴2 / 🟡6 / 🔵7，共 15 条）**——逐条处置见批次档 §2.11；本档同步改：§2.2.5 第 7 条 / §2.2.6（强制落地 + `snap` + 窗口不在场收口）/ §2.2.7（曲线单一来源）/ armGate 11 条（G11）/ §1.1 / §2.1–§3.3 各判据行 / §零 授权口径。**计数不变（AC20 / TC37 / DD16 / 9 组 / U10 / open3 / O11）**。 |
| 2026-09-18 | **B20 修偏轮 2 偏差记录**：真因 = `handleTrailEnd(reasonRaw)` 单参签名 vs `ipcMain` 派发 `(event, reason)` ⇒ IpcMainEvent 绑进 reasonRaw ⇒ 归一化恒假 ⇒ **静默清轨迹（零日志零异常）**；修复 = 双参签名 + `typeof` 归一 + 两条取证行。**性质 = 实施签名缺陷，非设计缺口**（§2.2.1 数据流原样）⇒ 无设计变更，§2.2.11 补 `phys-trail-start` 行 + `bad-reason` 产出路径（计数不变）。 |
| 2026-09-18 | **B26 面落档（F2 / US-24：落地口径 = 可见脚底）**：新增 §2.2.13（口径 + 常量与契约 + 明示例外 + 生效点）· §2.1 增 **J 组** · §2.2.3 增三常量 · §2.2.4 / §2.2.6 订正 · §2.4 增 **DD-17** + DD-6 补正 · §2.5.2 U-8 补正 · §3.1 增 **AC21–22** + 注 A · §3.2 增 **TC-38–40** · §2.3 补 B26 文件表指针 · 档头状态行同步（一致性订正）。 |
| 2026-09-18 | 承上行（观察项与计数，D3）：**§2.5.3 新增 O-13 / O-14**；**计数：AC 20 → 22 · TC 37 → 40 · DD 16 → 17 · 选型 9 → 10 组 · O 12 → 14**（口径 = 末位编号）。 |
| 2026-09-18 | **B26 修正轮 1（F2 面 6 条：🟡#4–#8、🔵#12；源 = §3 轮次 1 + 代裁）**：① 余量 0 → 4 ⇒ `FEET_INSET_DIP` = 30；② `groundBounds(null) ⇒ null`（#4）；③ AC22① `vy ≥ 0` + TC-39 写死（#5）；④ O-15（#6）；⑤ O-14 补 `bounds` 面（#7）；⑥ NFR-19 重跑（#8）；⑦ 注 A 补 `270` 来源（#12）。计数：O 14 → 15（其余不变）。 |
| 2026-09-18 | B26 修正轮 2（换机复审 3 条发现；源 = §3 轮次 2）——本档经核验**无内容改动**（发现 1 / 3 = 批次档面；发现 2 = 动画档 / 需求档面）；as-of 行数 = **757** 行（换行符口径；供批次档 §2.4 行数订正引用）。 |
| 2026-09-19 | **B27 面落档（边界四面化；源 = 台账 R21 / 批次档 §1）**：新增 **§2.2.14**（实测 / 选型 A·B / `petEdgeBounds` 契约 / B03 例外四面 / O-16…O-17 / DD-18）· §2.2.13 改名注记 · §2.2.4 / §2.2.6 口径分列 · O-8 核销 · §3.1 AC23–AC24 + 注 B′ · §3.2 TC-41–TC-44 · `groundBounds` → `petEdgeBounds`。**计数：AC 24 · TC 44 · DD 18 · O 17**。 |
| 2026-09-19 | **B27 面落盘（续；三方一致收口）**：§1.1 增 US-34 / NFR-25 两行 + US-24 行补 B27 注记 · 档头标题 / 需求档与批次档指针同步 · §2.3 补 B27 文件表指针行 · §2.2.14 补三方份额行 · 观察项编号统一 `O-16 / O-17`（承 O-1…O-15 形态）· §3.2 标题计数 TC-40 → TC-44 · §3.3 手段①扩 AC21–AC24 · AC23 判据细目移注 B′（行宽合规）。**计数不变（AC 24 · TC 44 · DD 18 · O 17）**。 |
| 2026-09-19 | **B27 修正轮 1（评审轮 1 🔴#1 / 🔵#7 / 🔵#10；源 = 批次档 §3 轮次 1 + 主 agent 裁决）**：AC24① 冻结面改 15 档口径（= 批次档 §2.3 / AC35①；不含本批改动面 `pet-chain*.js` / `pool.json`）；注 B′ 等式口径订正（`PetChainCore` 常量求值 + 250×270 三方交叉核对）；NFR-19 重跑括注订正（档界值不变、档属按重跑重分类）。**计数不变（AC 24 · TC 44 · DD 18 · O 17）**。 |
