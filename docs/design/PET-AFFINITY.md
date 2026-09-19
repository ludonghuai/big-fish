# PET-AFFINITY —— 好感度数值重平衡设计（等级阈值 · 喂食汇率 · 满级分支；B31）

> 归属板块：桌宠（好感度 / 兑换屋数值面）
> 落点：`docs/design/PET-AFFINITY.md`（本档 = 好感度数值体系唯一权威源；新建——原机制「只存在于代码中」无设计档，B31 起立档）
> 回指需求：`docs/requirements/PET.md` §三 US-35…US-37、§四 NFR-26
> 回指批次：`docs/batches/B31-affinity-balance.md` §1（立案）/ §2（设计任务书段）
> 关联：**R16**（等级门动作解锁 = `docs/batches/B23-pet-action-unlock.md`，在批未实施——按等级 1–10 键控，本批只改阈值**数值**不改等级数 ⇒ 零影响；本批不动其映射）

---

## 一、需求层

### 1.1 总体需求（B31 目标）

让等级与喂食在数值上真正有意义：修掉「一个任务直接满级、满级后点数无上限溢出、零食给的量小到无感」三处体感缺陷——**等级仍 10 级**，但阈值绝对值大幅调高；喂食重定效率使其成为有意义的加速路径（保持「喂食 = 被动 2 倍」的正确汇率）；满级分支定义清楚（不溢出显示）。

### 1.2 现状实测与真实数据定标（as-of 2026-09-19；设计者亲读）

**存量数据**（`%APPDATA%\Bigfish\affinity.json`，设计者亲读）：

```json
{ "usage": 1772967, "wallet": 1772967, "bonus": 0, "currency": 0, "food": {} }
```

**真实消耗分布**（`<DSH_HOME>\storages\session_projcache\sessions\*.json` 实测 3 条，合计与 `usage` 精确相等 ✓）：

| 会话 | token（计费口径 B 四桶和） | 旧表对应点（rate 500） |
|---|---|---|
| `session-b0c9…`（长任务） | **1,270,505** | 2,541 |
| `session-c09c…`（中任务） | **491,707** | 983 |
| `session-d0ea…`（小任务） | **10,755** | 21 |

**现状代码证据**（`shell-affinity.js`，as-of 2026-09-19）：

- `:32` `AFFINITY_RATE = 500`（每 500 token = 1 点）
- `:33` `EXCHANGE_RATE = 1000`（1000 token = 1💴）
- `:34` `LEVEL_THRESHOLDS = [0, 20, 50, 100, 180, 300, 450, 650, 900, 1200]`——**一次长任务（2541 点）远超 1200 封顶 ⇒ 直接满级 ✗**
- `:138` `points = Math.floor(usage / AFFINITY_RATE) + bonus`——**不封顶**（满级后继续涨 ✗）
- `:143` `progress = nextThr === undefined ? 1 : …`（满级恒 1 ✓）；`:147` `pointsToNext = nextThr === undefined ? points : nextThr`——满级回退为 `points`（**无意义值 ✗**）
- `:36-38` FOODS：小鱼干 1💴/bonusTokens 2000 → **+4 点** · 小蛋糕 2💴/4000 → +8 · 奶茶 3💴/6000 → +12——`bonusPoints = round(bonusTokens / AFFINITY_RATE)`（`:154`/`:331`）
- `:186-189` watcher 点播「好感 +1，现在是 Lv.x 啦~」——**满级仍持续播报 ✗**
- 显示面：`exchange.js:22` `Lv.${level} · ${points} 点`（满级数字一路涨 ✗）；`pet.js:184` `'Lv.' + level + ' 好感 ' + points + '/' + pointsToNext`（满级 `好感 3545/3545` 无意义 ✗）

**结论**：汇率本身正确（喂食 = 被动 2 倍 ✓），**绝对量级失衡**（批次档 §1.3 同判）——修复面 = 阈值表 × 喂食数值 × 满级分支三处，量级对齐到真实任务尺寸。

### 1.3 功能性需求（回指 `docs/requirements/PET.md` §三）

- **US-35 等级曲线重定**：10 级不变；一次长任务不直接满级；满级 = 长期深度使用顶点。**迁移口径**（U-3）写死其一——本设计推荐「接受重映射」（§2.5）。
- **US-36 喂食 = 有意义的加速路径**：点数与价格量级对齐新曲线，效率保持「喂食 = 被动 2 倍」；`EXCHANGE_RATE` 同调（§2.3）。
- **US-37 满级分支**：点数显示 MAX 不溢出 · `pointsToNext` 显式 MAX · 播报收敛（§2.4）。

### 1.4 非功能需求（回指 `docs/requirements/PET.md` §四 NFR-26）

数值单点可机检（纯函数核心 + 桩测装载真实实现）· 语义零回退（三池分离 / 只增不减 / 兑换不动 usage）· 零回退面与仓库规范（冻结档零 diff、`build.files` 仅 +1）。

### 1.5 范围（做 / 不做——批次档 §1.4 原文承接）

**做**：① 阈值表重定（10 级不变）② 喂食效率重定 ③ 满级分支定义。

**不做**：① 不改等级数（10 级 ✓）② 不加新食品 / 新货币 / 新机制 ③ 不改兑换屋窗口结构（`openExchangeWindow` 面）④ 不动「点数只增不减 / 兑换不影响好感」⑤ 不动 R16 等级门映射。

---

## 二、设计层

### 2.1 方案选型对比总表

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论（选定/否决理由） |
|---|---|---|---|---|
| 1 | **甲（推荐）：阈值曲线加速 + 喂食 2× + EXCHANGE 同调** | 见 §2.2 / §2.3 / §2.5 逐项 | 喂食仍弱于一次任务本身（+400 vs 长任务 2541）——但这是「零食不该超过一整场工作」的固有取舍，进度条可见性达标 | **选定** |
| 2 | 乙：喂食 5× 激进 | 存量 wallet（177💴）一次买 5 鱼 = +15,000 点 ⇒ 等级 **Lv.5 → Lv.8** 一次性跳 3 级 | 跳级感接近本批要修的症状本身；且与「汇率本就正确（2×）」的实测结论相左 | **否决** |
| 3 | 丙：喂食 10× | 存量 wallet 3 鱼 = +30,000 点 ⇒ Lv.5 → Lv.9，每鱼 +10,000 点对价格体系失真 | 同上更甚；零食单点数值 > 前期整档阈值（120/350/900），等级曲线形同虚设 | **否决** |

### 2.2 U-1 新阈值表（完整对照表——供用户审的核心物）

**AFFINITY_RATE 保持 500 不变**（只动阈值与喂食面，最少移动件）。

**新表（10 档）**：

| 等级 | 旧阈值（点） | **新阈值（点）** | 新阈值对应 token（rate 500） | 新档内跨度（点） |
|---|---|---|---|---|
| Lv.1 | 0 | **0** | 0 | — |
| Lv.2 | 20 | **120** | 60,000 | 120 |
| Lv.3 | 50 | **350** | 175,000 | 230 |
| Lv.4 | 100 | **900** | 450,000 | 550 |
| Lv.5 | 180 | **2,600** | 1,300,000 | 1,700 |
| Lv.6 | 300 | **5,000** | 2,500,000 | 2,400 |
| Lv.7 | 450 | **9,000** | 4,500,000 | 4,000 |
| Lv.8 | 650 | **16,000** | 8,000,000 | 7,000 |
| Lv.9 | 900 | **30,000** | 15,000,000 | 14,000 |
| Lv.10 | 1,200 | **63,000** | 31,500,000 | 33,000 |

**顶档重定（用户裁定 A，2026-09-19；顶档 42,000 → 63,000）**：重算口径 = 按同一分段加速曲线形态重排——前期锚点段（Lv.2–Lv.4 = 120/350/900）与中段（Lv.5–Lv.7 = 2,600/5,000/9,000）保持不动（前者由「长任务 2,541 → Lv.4」「存量 3,545 → Lv.5」两锚点钉住；后者为形态基准）；
新增高度全部由后段加速吸收（Lv.8 15,500 → 16,000 · Lv.9 25,000 → 30,000 · Lv.10 42,000 → 63,000）；档内跨度 1,700 → 2,400 → 4,000 → 7,000 → 14,000 → 33,000（逐档放大、后段加速拉开）。

**总量级理由（按用户实机数据定标，§1.2）**：

- **一次长任务不直接满级**：长任务 1,270,505 token = 2,541 点 → **新 Lv.4**（旧表 = Lv.10 满级）；中任务 983 点 → Lv.4；小任务 21 点 → Lv.1（休闲用户前期也有可见成长）。
- **满级 = 长期深度使用顶点**：封顶 63,000 点 = 3,150 万 token ≈ **25 次长任务** ≈ 用户当前总量（177 万）的 **17.8 倍**。
- **老用户体面落点**：用户存量 3,545 点 → **新 Lv.5**（旧 Lv.10）——重映射后落在中档，不跌至 Lv.1（迁移口径见 §2.5）。
- **曲线形态**：前期平缓（120 → 350 → 900）保证休闲用户有感知，中后期加速拉开（1,700 → 33,000），满级有「长期陪伴」的分量。上界 52.5× 旧表（1,200 → 63,000），符合用户「数值得高很多」的要求。
- **标定状态**：本表 = 设计期给定值（按用户实机数据定标）；**单一可调数据**（一行 10 个数字），用户审后如再调只改 `affinity-core.js` 一处。「设计期给定值」措辞承 NFR-9 / NFR-14 口径；「单一可调数据」承 NFR-23 / NFR-24 口径。

**被否决的阈值策略**：

| # | 候选方案 | 判据逐项评估 | 结论（否决理由） |
|---|---|---|---|
| 1 | 旧表整体线性 ×52.5（对齐顶档 63,000） | [0, 1050, 2625, 5250, …]——前期档 1,050 点起跳，休闲用户（小任务 21 点/次）需要 50 次任务才 Lv.2 | 前期无感，与「等级有意义」的体感目标相悖 |
| 2 | 严格指数（每级 ×2.5） | 末档 ≈ 3.8 万点合理，但首档 30 → 75 → 188 与旧表同量级 | 前期仍太快，未回答用户「一个问题就升到 10 级」的抱怨 |
| 3 | **甲：分段加速曲线（选定）** | 前期 6/7/9× 旧表（Lv.2–4）、后期拉开到 52.5×（Lv.10）——同口径 vs 旧表；三锚点全部命中（长任务 → Lv.4 / 存量 → Lv.5 / 满级 ≈ 25 次长任务） | 选定——前期可感 + 后期有分量，锚点实测校验 |

### 2.3 U-2 喂食效率与汇率（候选对比 + 推荐）

**核心口径**：喂食效率 = `bonusPoints / (price × EXCHANGE_RATE / AFFINITY_RATE)`（每 token 得点与被动 500 token/点的比值）。「喂食 = 被动 2 倍」这一**比值本身正确**（批次档 §1.3 实测结论）——修的是**量级**（+4～12 点相对旧尺子太小）与**价格面**（点数调大后必须同步调价 / 汇率，否则存量 wallet 会印出满级）。

| # | 候选 | EXCHANGE_RATE | 食品（价/点） | 每💴 得点 vs 被动 | 存量 wallet（177💴）全喂鱼的效果 | 结论 |
|---|---|---|---|---|---|---|
| 1 | **甲（推荐）：喂食 = 被动 2×** | **10,000** | 鱼 10💴/+400 · 蛋糕 20💴/+800 · 奶茶 30💴/+1,200 | 40 点/💴 = 被动（20 点/💴）**2 倍** | 17 鱼 = +6,800 点 ⇒ Lv.5 → **Lv.7**（一次性、花存量、有界） | **选定** |
| 2 | 乙：喂食 = 被动 5× | 10,000 | 鱼 30💴/+3,000 · 蛋糕 60💴/+6,000 · 奶茶 90💴/+9,000 | 100 点/💴 = 5 倍 | 5 鱼 = +15,000 ⇒ Lv.5 → **Lv.8**（跳 3 级） | 否决——跳级观感接近本批要修的症状 |
| 3 | 丙：喂食 = 被动 10× | 10,000 | 鱼 50💴/+10,000 · 蛋糕 100💴/+20,000 · 奶茶 150💴/+30,000 | 200 点/💴 = 10 倍 | 3 鱼 = +30,000 ⇒ Lv.5 → **Lv.9** | 否决——单点数值 > 前期整档阈值，等级曲线形同虚设 |

**甲的实现数据面**（`shell-affinity.js:35-38` FOODS 改三行 + `:33` EXCHANGE_RATE 改一行；公式 `bonusPoints = round(bonusTokens / AFFINITY_RATE)` **不变**）：

| 食品 | 价格（旧→新） | bonusTokens（旧→新） | bonusPoints（旧→新） | msg（更新） |
|---|---|---|---|---|
| 小鱼干 | 1 → **10**💴 | 2,000 → **200,000** | +4 → **+400** | 小鱼干真香~ 好感+400 |
| 小蛋糕 | 2 → **20**💴 | 4,000 → **400,000** | +8 → **+800** | 蛋糕好好吃~ 好感+800 |
| 珍珠奶茶 | 3 → **30**💴 | 6,000 → **600,000** | +12 → **+1,200** | 奶茶赛高~ 好感+1200 |

**EXCHANGE_RATE 同调理由**：点数 ×100 后若汇率 / 价格不动，存量 wallet（用户 177.3 万 token = 1,772💴）买 1💴 鱼即可刷出满级（1,772 × 400 = 70.9 万点 ✗）。
汇率 ×10（1,000 → 10,000）+ 价格 ×10（1/2/3 → 10/20/30）后：存量 wallet 折 177💴、最多 17 鱼、+6,800 点有界（Lv.5 → Lv.7，一次性、花存量、用户主动选择）。
被否决的替代调法 = 汇率不动 + 价格 ×100（100/200/300💴）：经济完全等价，但「食品通胀 100 倍」的观感劣于「💴 更值钱」，且价格数字大。
**体感锚点（甲）**：一次鱼干 +400 点 = Lv.5 档内进度条的 **16.7%**（档跨度 2,400）——喂食从「数值上无感的安慰动作」变为「进度条上看得见的一大块」；喂食在**任何等级**都是「全程 2 倍速」（把 token 换成鱼 = 收益翻倍），直接回答用户「怎么感觉零食给的少」的提问（回答：汇率没坏，坏在旧尺子——量级已对齐新曲线）。
**存量 💴 购买力注记**：汇率 ×10 后**存量 currency（💴）的购买力按食品新价同价重定**（100💴 由 100 鱼变 10 鱼）——用户当前 `currency = 0` 无实际影响；未来若有存量💴 用户，属 U-3 迁移口径覆盖（§2.5）。

### 2.4 满级分支（T48）

**定义**（`affinityView` 面，全部落在 `affinity-core.js` 的 `buildAffinityView`）：

- `maxed`：新增布尔字段 = `level === LEVEL_THRESHOLDS.length`（10）——显示面的唯一分支依据；
- `pointsToNext`：满级 = 显式 **`'MAX'`**（字符串；现行为回退为 `points` 的无意义值 ✗）；
- `progress`：满级恒 **1**（进度条满——现行为已如此，本批显式固化）；
- 点数内部仍真实累积（`points` 只增不减语义不变）——收敛的是**显示面**与**播报面**，不是数据面。

**播报收敛**（`shell-affinity.js:186-189` 点播段重写）：

- 现行为：每攒够 1 点播一次「好感 +1，现在是 Lv.x 啦~」——长任务 2,541 点 = 数千次播报；满级后仍持续 ✗。
- 新口径：**升级播报**——watcher 每 tick 与喂食（`handleAffinityBuy`）都改为「等级**严格上升**才播一次」：`好感满满，升到 Lv.${level} 啦~`（判据 = core 导出纯函数 `shouldAnnounceLevelUp`——NFR-26 第三项 ✓）。满级后等级不可能再升 ⇒ **自然零播报**（收敛 ✓）。
- 被否决的替代 = 「保留点播、仅满级静音」：非满级时重负载下仍是刷屏（长任务 2,541 点 = 每秒多点），未达「播报收敛」目标。

**显示面**（两处，各 1–2 行）：

- `exchange.js:22`：满级 `Lv.10 · MAX`；非满级 `Lv.${level} · ${points} 点`（现状不变）。
- `pet.js:184`：满级 `Lv.10 好感 MAX`；非满级 `Lv.${level} 好感 ${points}/${pointsToNext}`（现状不变）。
- 进度条（`pet.js:183` `affinityFill.style.width`）满级恒 100%（`progress = 1` 既有行为，零改动）。

### 2.5 U-3 老数据迁移口径

**结论（推荐 ①，待用户批准时确认）**：**接受跃变（不迁移）**——老数据不转换、不写入补偿，等级按新表直接重映射。

| # | 候选 | 效果（用户存量 3,545 点 / 1,772,967 token） | 结论（选定/否决理由） |
|---|---|---|---|
| 1 | **接受重映射（选定）** | Lv.10 → **Lv.5**（3545 ∈ [2,600, 5,000)）；wallet 折 177💴（购买力按新价重定，见 §2.3 注记） | **选定**——一次性、透明、可解释（「数值体系整体重定」）；落点 Lv.5 中档体面；无需任何迁移代码（零写入） |
| 2 | 只对新积累生效（双标尺） | 老点按旧尺、新点按新尺，两条曲线永久并存 | 否决——两套标尺永久混存，等级含义随时间漂移，不可维护 |
| 3 | 冻结补偿（保级） | 给存量用户一次性补点保住 Lv.10（≈ 补 59,500 点） | 否决——等效于对新表「免修」，且补点数字凭空、无解释面 |

**存量 wallet 的连带**：接受重映射后，用户可**主动选择**花存量 💴 买鱼（最多 +6,800 点 ⇒ Lv.7）——这是花自己赚的存量、一次性、有界，**不是**迁移缺陷，登记为迁移口径的自然结果。

### 2.6 架构 / 接口 / 数据流契约

**新增 `affinity-core.js`（数值面纯函数核心，零 `require('electron')`、零 fs、零定时器；双环境导出——经 `init(deps)` 注入 `shell-affinity.js` 消费、开发期桩测直接装载；同 `pet-work-core.js` / `pet-physics-core.js` 先例）**：

```js
// 导出面（CJS）
AFFINITY_RATE        // 500（不变）
EXCHANGE_RATE        // 10000（1,000 → 10,000）
LEVEL_THRESHOLDS     // [0, 120, 350, 900, 2600, 5000, 9000, 16000, 30000, 63000]
MAX_LEVEL            // 10
FOODS                // 3 项：price 10/20/30、bonusTokens 200000/400000/600000、msg 更新
levelForPoints(points)               // 等级循环（现 :139-142 迁出）：返回 1..10
affinityPoints(usage, bonus)         // = Math.floor(usage / AFFINITY_RATE) + bonus（现 :138）
buildAffinityView(state)             // 现 :136-158 迁出并扩展 maxed 字段
shouldAnnounceLevelUp(before, after) // 播报谓词（NFR-26 第三项）：after > before；满级恒 false ⇒ 零播报
applyFoodPurchase(state, foodId)     // 购买校验与状态转移（现 :325-331 纯化）
//   state = { usage, wallet, bonus, currency, food }
//   buildAffinityView 返回 = { level, points, pointsToNext(number|'MAX'), progress, maxed,
//            tokens, usage, bonus, currency, food, foods, exchangeRate, affinityRate }
//   applyFoodPurchase 返回 = { ok:true, state }（currency − price · bonus + bonusPoints · food[id] +1，
//            usage / wallet 原样带回）| { ok:false, message }（id 不存在 / currency 不足——数值零变动）
```

**`shell-affinity.js` 消费面**（改动清单）：

- `:32-39` 常量与 FOODS 表迁出（核心化）——**经 `init(deps)` 收 `affinityCore`**（与既有注入键同形：`let affinityCore = null;` + `init` 内赋值）；**不新增 `require('./affinity-core.js')`**（fanout 保持 3——判据 D②，见 §2.9）；
- `:136-158` `affinityView()` 收缩为 `return affinityCore.buildAffinityView(affinity);`；
- `:169-172` 首用回填与 `:175-196` watcher **逐字不变**（delta 与基线逻辑零改动）；`:186-189` 点播段改为**升级播报**（谓词 = core 导出 `shouldAnnounceLevelUp`）：
  ```js
  const before = affinityView().level;      // delta 计入前取值
  affinity.usage += delta; affinity.wallet += delta;
  const v = affinityView();
  if (affinityCore.shouldAnnounceLevelUp(before, v.level)) pet.petSay(`好感满满，升到 Lv.${v.level} 啦~`);   // 满级恒 false ⇒ 停播
  ```
- `:324-340` `handleAffinityBuy`：购买校验与状态转移改调 `affinityCore.applyFoodPurchase`（`{ok:false, message}` 原样返回；成功路径 `Object.assign(affinity, r.state)`）；此后 `bonus` 计入前后各取一次 level，`affinityCore.shouldAnnounceLevelUp` 为真则追加一条升级播报（先 `food.msg` 后升级播报）；吃播状态机与返回契约（`{ok:true, message, view}`）逐字不变；
- `:314-322` 兑换 handler **除 `EXCHANGE_RATE` 改指 `affinityCore.EXCHANGE_RATE` 外逐字不变**（常量迁出的必然连带；语义逐字保留）；窗口 / 重置函数零改动。
- **装配面（`main.js` · 唯一新增装配点，1 处）**：增 `const affinityCore = require('./affinity-core.js');`（锚 = `:40` `shell-affinity.js` 绑定旁）+ `affinity.init({ … , affinityCore })`（deps 增键）——注入 `shell-affinity.js`；其余行零 diff（冻结面修订注记见 §2.7）。

**数据流（不变）**：watcher（10 s）→ `sumSessionTokens` → delta → `usage/wallet +=` → `saveAffinity` →（升级播报）→ `broadcastAffinity`（10 s 节拍 + 桌宠窗口重建兜底）→ `pet.js` 进度条/标签 + `exchange.js`（IPC `affinity:view` + 5 s 刷新）。本批**不新增**任何定时器 / IPC 通道 / 数据文件。

### 2.7 受影响文件清单（全清单，行数为实测 as-of 2026-09-19）

| 文件 | 现状行数 | 预计增量 | 性质 | 变更点 |
|---|---|---|---|---|
| `affinity-core.js` | 0（新） | **+≈110** | 新增 | 数值面纯函数核心（§2.6 契约：常量 / 判定 / 视图 / 播报谓词 / 购买校验）；文件头标准形 |
| `shell-affinity.js` | 356 | **≈ −26 ⇒ ≈330** | 修改 | 常量迁出 · 经 `init(deps)` 收 `affinityCore`（替代原 require 直入，+1 行）· `affinityView` 收缩 · 播报改升级播报（watcher + buy）· 购买校验迁 core（`applyFoodPurchase`） |
| `main.js` | 261 | **+≤2（净 +1）** | 修改 | 组合根新增**恰 1 处 core 注入装配**：require 区增 `const affinityCore = require('./affinity-core.js');`（1 行）+ `:115` `affinity.init({…})` deps 增 `affinityCore` 键（同行）；其余行零 diff（冻结面修订注记见下） |
| `exchange.js` | 105 | **+1** | 修改 | `:22` 满级 MAX 显示 |
| `pet.js` | 240 | **+2** | 修改 | `:184` 满级 MAX 标签 |
| `package.json` | 140 | **+1** | 修改 | `build.files` 增列 `"affinity-core.js"`（NFR-8 carve-out 通用形态，+1 行） |
| `scripts/gates/baseline.json` | 38 | **+1 条** | 修改 | `assemblyExempt` 增 `affinity-core.js` 一条（含理由）——D③ 结构性免检（面内无 `init` 导出档）、**非违规冻结**；消解 = 规则 2 陈腐即红（获 `init` / 离绑定面即删条） |
| `scripts/gates/selftest.js` | 355 | **±0（实况）** | 修改 | *清单外补登记*：TC-12 夹具计数 15→16 + 断言锐化（`res.ok === 13 && ok === 16`） |
| `scripts/gates/run.js` | 155 | **±0（实况）** | 修改 | *清单外补登记*：`:112` 注释计数同步（16 绑定 − 3 免检） |
| `.thincoder/b31-affinity-stub.mjs` | 0（新） | **+≈120** | 新增 | 开发期桩测（gitignored 非交付物；装载真实 `affinity-core.js`——含谓词 / 购买校验断言） |

**清单外补登记说明（B31 收口轮）**：两档为 `assemblyExempt` +1 ⇒ 绑定面 15→16 / 免检 2→3 的机械连带（不同步则 `selftest-failed` 退 2、AC-B31-9 不可达）——实施审计独立复核结论 = 必要且最小；登记依据 = `docs/batches/B31-affinity-balance.md` §5.2 决策 #3。

**拆分复核（>300 档主动复核；结论 = 本批不拆）**：`shell-affinity.js` 改后 ≈330 行（356 −26；修正轮 1 重算 −27，注入绑定 2 行替代原 require 直入 1 行 ⇒ +1）——纯化面已迁净（常量 / 视图 / 谓词 / 购买校验），残面全部绑定 electron（窗口 / dialog）、fs（数据读写 / token 读面）与定时器（watcher），不可再纯化。

两条拆分路径逐条否决：① 兑换屋 + 重置面（≈110 行）拆出——触碰 B06 F6 既有拆分结构（`docs/design/SHELL-UX.md` §2.2.6）、`main.js` 注入面必动（`main.js:40/80/103` 接线——超出本批允许面（恰 1 处 core 注入装配，§2.7 注记）✗）、兑换屋结构本批出批——零功能收益、正风险；② token 读面（≈75 行）拆出——新增一档维护面，读面与 watcher 高内聚（`legacySessionTokens` 本有消解期，消解后读面自缩）——为凑行数拆档不划算。

**消解条件**：后续批新增好感度功能使本档逼近 500 行、或需动兑换屋结构时 → 拆出 `shell-exchange.js`（兑换屋 + 重置面，注入面一并重构）。单档 ≤500 约束内 ✓。

冻结面（零 diff）：`shell-pet-geometry.js` / `shell-pet-drag.js` / `pet-chain.js` / `pet-chain-core.js` / `pet-physics-core.js` / `shell-pet-physics.js` / `pet-work-core.js` / `shell-pet-work.js` / `assets/**` / `shell-ipc.js`。

**冻结面修订注记（2026-09-19 · 实施轮 1 打回后 · 父侧裁决路径①）**：`main.js` **移出**冻结清单——本批允许面 = **恰 1 处 core 注入装配**（§2.6 装配面）；其余行仍冻结（零 diff）。
依据 = 批次档 `docs/batches/B31-affinity-balance.md` §5.1（D② 冲突实测：require 直入 ⇒ `shell-affinity.js` 出度 4 ⇒ `npm run lint` 必红）+ 裁决路径①（`init(deps)` 注入 = 本仓 sanctioned 形态；判据句先例 = `docs/TODO.md` T45）。

### 2.8 关键决策记录（DD）

| # | 决策 | 内容 | 否决备选 |
|---|---|---|---|
| DD-1 | 阈值表 | `[0, 120, 350, 900, 2600, 5000, 9000, 16000, 30000, 63000]`——分段加速曲线，三锚点实测命中 | 线性 ×52.5（前期无感）；严格指数（前期太快）——见 §2.2 |
| DD-2 | AFFINITY_RATE | **保持 500 不变**——最少移动件；点数量级只由阈值面吸收 | 调 rate（点数整体缩放，牵动 watcher 回填 / 播报判据，收益为零） |
| DD-3 | 喂食与汇率 | 甲：2× 被动；EXCHANGE_RATE 10,000；价格 10/20/30💴；+400/+800/+1,200 | 5×（乙）/ 10×（丙）——存量 wallet 跳级过猛；汇率不动价格 ×100——观感差 |
| DD-4 | 满级分支 | `maxed` 布尔 + `pointsToNext='MAX'` + `progress=1`；显示 `Lv.10 · MAX` / `Lv.10 好感 MAX` | 只改 pointsToNext 不设 maxed（渲染面需重复判等）；封顶钳制 points（破坏「只增不减」） |
| DD-5 | 播报收敛 | 升级播报（等级严格上升播一次）；谓词 = core 导出纯函数 `shouldAnnounceLevelUp`（NFR-26 第三项）；满级自然零播报 | 保留点播仅满级静音——非满级重负载仍刷屏 |
| DD-6 | 迁移口径 | 接受重映射（不迁移）；存量 3,545 点 → Lv.5 | 双标尺 / 冻结补偿——见 §2.5 |
| DD-7 | 核心抽取 | `affinity-core.js` 双环境导出（可机检的数值面：常量 / 判定 / 视图 / 播报谓词 / 购买校验） | 保持单档——`shell-affinity.js` 顶层 require electron，桩测不可装载，验收无法机检 |

### 2.9 与既有纪律冲突点核对

- **NFR-8 carve-out**（`docs/requirements/PET.md` §四 NFR-8 注记）：本批 `build.files` 增列 `affinity-core.js`（+1 行）——按通用形态登记（需求档 NFR-8 注记列表追加 B31 行，D3 计数同步）。
- **R16 等级门**（B23 在批）：映射按**等级 1–10** 键控、不按点数 ⇒ 阈值数值变化**零影响**；本批不改等级数（10 ✓）⇒ 映射零回退。
- **NFR-21 修订/限定注记计数**：本批只**新增**条目（US-35…37 / NFR-26）、不给既有条目加修订注记 ⇒ 计数 13 处不动。
- **计数**：需求档 US 34 → 37、NFR 25 → 26（§一/§二/§五 同步）。
- **冻结面**：几何 / 拖拽 / 链 / 素材零触碰（§2.7 清单）。
- **D② 域模块扇出**（`docs/CONVENTIONS.md` §四）：`shell-affinity.js` 现有静态相对 require **3** 条（backend / notify / assets，`:9-11`）——原设计 require 直入 ⇒ 出度 **4** ⇒ `npm run lint` 必红（与 AC-B31-9 相抵；**本次打回直接成因、原清单漏列**；实测见批次档 §5.1）。**本修订 = 走 sanctioned 注入形态**（§2.6 装配面）⇒ 扇出保持 **3** ✓ 与 D② 相容。
- **D③ 接线点唯一 + 基线契约**（`docs/CONVENTIONS.md` §四 D③ · `docs/design/REPO-CONVENTIONS.md` §A.2.2.6）：组合根新增绑定 `affinityCore` 无 `init` 导出 ⇒ 按 D③ 免检机制入 `assemblyExempt` 免检清单（**结构性免检、非违规冻结**——不触发「不得冻结新增违规」hardRule；消解 = 规则 2 陈腐即红：获 `init` / 离绑定面即删条）。

---

## 三、测试层

### 3.1 用例表（正常 / 边界 / 错误）

| # | 需求 | 类别 | 输入 | 预期输出 |
|---|---|---|---|---|
| TC-1 | US-35 | 正常 | `levelForPoints(2541)`（长任务锚） | **4** |
| TC-2 | US-35 | 正常 | `levelForPoints(983)`（中任务锚） | **4** |
| TC-3 | US-35 | 正常 | `levelForPoints(21)`（小任务锚） | **1** |
| TC-4 | US-35 | 正常 | `levelForPoints(3545)`（用户存量锚） | **5** |
| TC-5 | US-35 | 边界 | `buildAffinityView({usage:0, bonus:0, …})` | level=1 · progress=0 · pointsToNext=120 |
| TC-6 | US-35 | 边界 | points = 62,999 | level=9 · pointsToNext=63,000 · progress<1 |
| TC-7 | US-35 | 边界 | points = 63,000（恰满级） | level=10 |
| TC-8 | US-37 | 边界 | points = 63,000 | maxed=true · pointsToNext='MAX' · progress=1 |
| TC-9 | US-37 | 边界 | points = 10^7（超满级） | level=10 · maxed=true（显示面不溢出） |
| TC-10 | US-36 | 正常 | `applyFoodPurchase({…currency:30}, 'fish')` | ok:true · bonus +400 · currency −10 · food.fish +1 |
| TC-11 | US-36 | 正常 | 效率比 = 400 / (10×10,000/500) | **= 2**（喂食 = 被动 2 倍） |
| TC-12 | US-36 | 错误 | `applyFoodPurchase({…currency:5}, 'fish')` | ok:false · 数值零变动 |
| TC-13 | US-36 | 错误 | `applyFoodPurchase({…}, 'unknown-id')` | ok:false · 数值零变动 |
| TC-14 | 语义（NFR-26） | 正常 | exchange 全额（wallet ≥ 1💴） | wallet 减 · **usage 不变** · currency 增 |
| TC-15 | US-37 | 边界 | `shouldAnnounceLevelUp(10, 10)` | false（满级恒 false ⇒ **零播报**） |
| TC-16 | US-37 | 正常 | `shouldAnnounceLevelUp(4, 5)`（watcher delta 跨档） | true（播报一次，文案 `好感满满，升到 Lv.x 啦~`） |
| TC-17 | US-35 | 形状 | `LEVEL_THRESHOLDS` | 长度 10 · 首项 0 · 严格递增 |
| TC-18 | US-37 | 正常 | 喂食跨档：bonus=2,599 买鱼（+400 ⇒ 2,999 ⇒ Lv.5） | `shouldAnnounceLevelUp(4,5)`=true（喂食路径升级播报一次；顺序 = `food.msg` 先行） |

**验证载体注记（逐条）**：TC-1…TC-13、TC-15…TC-18 = **桩测断言**（装载真实 `affinity-core.js`——`applyFoodPurchase` / `shouldAnnounceLevelUp` 均为真实导出实现，非镜像断言）；
**TC-14 = 静态核对**（`shell-affinity.js:314-322` 兑换 handler 除 `EXCHANGE_RATE` 改指 `affinityCore.EXCHANGE_RATE` 外逐字不变 + `:317` 语义行）+ **实机目视**（兑换屋兑换一次：wallet 减 · usage 不变 · currency 增）；TC-16/18 的实机面 = 长任务 / 喂食触发升级后目视播报一次。

### 3.2 验收标准（逐条回指；机检载体 = `.thincoder/b31-affinity-stub.mjs` 装载真实 `affinity-core.js`，末行 `pass/total PASS`）

| # | 回指 | 判据 | 验证方式 |
|---|---|---|---|
| AC-B31-1 | US-35 | `LEVEL_THRESHOLDS` = `[0, 120, 350, 900, 2600, 5000, 9000, 16000, 30000, 63000]`（10 档、严格递增） | 桩测断言 + 静态核对 |
| AC-B31-2 | US-35 | 定标锚：`levelForPoints(2541)=4` ∧ `(3545)=5` ∧ `(63000)=10` | 桩测断言（TC-1/4/7） |
| AC-B31-3 | US-37 | 满级：`maxed=true` ∧ `pointsToNext='MAX'` ∧ `progress=1` | 桩测断言（TC-8/9） |
| AC-B31-4 | US-36 | 食品 bonusPoints = 400/800/1,200；每💴 40 点 = 被动 2 倍（TC-11） | 桩测断言 |
| AC-B31-5 | US-37 | 播报谓词 = core 导出纯函数 `shouldAnnounceLevelUp`（level 严格上升）；满级恒 false ⇒ 零播报 | 桩测断言（TC-15/16/18）+ 实机目视 |
| AC-B31-6 | NFR-26 | 语义零回退：兑换只减 wallet 不动 usage；bonus / usage / 点数只增不减 | 桩测断言（TC-10/12/13——购买校验纯化面）+ 静态核对（`:314-322` 兑换 handler 除 `EXCHANGE_RATE` 改指 `affinityCore.EXCHANGE_RATE` 外逐字不变）+ 实机目视（TC-14） |
| AC-B31-7 | US-35（迁移口径） | 老数据直接重映射、零转换写入；3,545 点 → Lv.5 | 桩测断言（TC-4）+ 实机目视（`affinity.json` 加载后等级） |
| AC-B31-8 | US-37 | 满级显示：exchange `Lv.10 · MAX`、pet `Lv.10 好感 MAX` | 静态核对 + 实机目视 |
| AC-B31-9 | NFR-26 | `npm run lint` / `test:full` / `test:integration` 全绿；行宽 ≤300、单档 ≤500 | 门禁命令 + 静态核对 |
| AC-B31-10 | NFR-26 | 冻结面零 diff（§2.7 清单 / 注记：`main.js` 允许面 = **恰 1 处 core 注入装配**）；`scripts/gates/` 变更面 = `baseline.json`（`assemblyExempt` +1 = `affinity-core.js`）+ `selftest.js` / `run.js`（计数同步；清单外补登记）；`dependencies`/`devDependencies` 零 diff；`build.files` 仅 +1 | `git diff --stat` + 静态核对 |

---

## 四、变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-19 | 建档（B31 设计轮）：定标（用户实机 3 会话 177 万 token）· U-1 阈值表（10 档对照）· U-2 喂食 2× 候选对比 · U-3 迁移口径（接受重映射）· 满级分支与播报收敛 · `affinity-core.js` 契约 · DD-1…DD-7 · AC-B31-1…10 回指 US-35…37 / NFR-26 |
| 2026-09-19 | **B31 修正轮 1（评审轮次 2 · 八条全修）**：🔴#1 播报谓词纯化入 core（`shouldAnnounceLevelUp`）+ TC-18 喂食路径用例 · 🟡#2 TC-6 期望值 → 42,000 · 🟡#3 候选乙后果复算 Lv.8 · 🟡#4 行数重算 + 主动拆分复核（不拆 + 消解条件）· 🟡#6 购买校验纯化（`applyFoodPurchase`）回标 TC-10/12/13、TC-14 归静态 + 实机 · 🔵#7 指针校正（NFR-23/24 · NFR-9/14）· 🟡#8 「前期 6/7/9×」口径核正。 |
| 2026-09-19 | **顶档重定（用户裁定 A）**：Lv.10 42,000 → **63,000** 点（≈ 3,150 万 token ≈ 25 次长任务 ≈ 存量 17.8 倍）；后段重算 Lv.8 15,500 → 16,000 · Lv.9 25,000 → 30,000，前期锚点与中段（2,600/5,000/9,000）保持；同步面 = §2.2 表 / 标定锚 / 否决行 / §2.5 补点 / §2.6 契约 / DD-1 / §3 引值；喂食甲案 · 迁移 ① · 满级语义未动。 |
| 2026-09-19 | **注入形态修订（实施轮 1 打回后 · 裁决路径①）**：`affinity-core.js` 改经 `main.js` `init(deps)` 注入（原 §2.6 require 直入 ⇒ D② 出度 4、lint 必红——批次档 §5.1）；落点 = §2.6 / §2.7（冻结面 + 受影响文件）· §2.9（D②/D③ 行）· AC-B31-10 · 拆分复核（≈330）；数值 / 行为 / 文案零变。 |
| 2026-09-19 | **B31 收口轮（文档层折账；源 = `docs/batches/B31-affinity-balance.md` §5.2）**：① §2.6 / §3.1 / §3.2（AC-B31-6）「兑换 handler 零改动」→「除 `EXCHANGE_RATE` 改指 `affinityCore.EXCHANGE_RATE` 外逐字不变」（常量迁出实况）；② §2.7 清单 + AC-B31-10 补登记清单外 2 档（`scripts/gates/selftest.js` / `run.js`——计数同步，机械连带、必要且最小）。数值 / 行为零变。 |
