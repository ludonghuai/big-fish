# B31 —— 好感度数值重平衡（等级阈值 · 喂食汇率 · 满级分支）

## §1 立案（主 agent）

### 1.1 目标（一句话）

让**等级与喂食在数值上真正有意义**：修掉「一个任务直接满级、满级后点数无上限溢出、零食给的量小到无感」三处体感缺陷——**等级仍 10 级**，但阈值绝对值大幅调高；喂食重定效率使其成为**有意义的加速路径**；满级分支定义清楚（不溢出显示）。

### 1.2 任务来源

台账技术待办 **T48**（满级溢出，用户 2026-09-19 实机报告）+ **T49**（喂食/汇率体感，同日用户提问）；两项同域（`shell-affinity.js` 数值面）⇒ 合批。用户 2026-09-19 原话：①「等级的范围需要调整一下，数值得高很多，否则一个问题就升到 10 级了，一共 10 级别」②「token 和零食提高经验值的汇率对吗？怎么感觉零食给的少，token 加的多呢」。

### 1.3 现状实测（证据，as-of 2026-09-19；主 agent 亲读）

- **等级**：`shell-affinity.js:34` `LEVEL_THRESHOLDS = [0, 20, 50, 100, 180, 300, 450, 650, 900, 1200]`（**10 档**、1200 点封顶 Lv.10）✗ 绝对值太小——长任务一次可产数千点 ⇒ 直接满级。
- **点数**：`:138` `points = Math.floor(affinity.usage / AFFINITY_RATE) + affinity.bonus` —— **不封顶** ✗；`:139-142` 等级循环；`:143` `progress`（满级恒 1）；`:147` `pointsToNext`（满级回退为 `points` ⇒ 无意义值）✗。
- **显示**：`exchange.js:22` `Lv.${view.level} · ${view.points} 点` ⇒ 满级后数字一路涨 ✗；`shell-affinity.js:188` 满级仍持续播报「好感 +1，现在是 Lv.10 啦~」✗。
- **汇率**（三条路径，逐条算成「每 1000 token 得几点」）：

| 路径 | 常量 / 数值（file:line） | 每 1000 token 得点 |
|---|---|---|
| 被动（真实消耗） | `AFFINITY_RATE = 500`（`:32`） | **2 点** |
| 兑换 | `EXCHANGE_RATE = 1000`（`:33`） | —（1000 token → 1💴） |
| 喂食 | `:36-38` 小鱼干 1💴/`bonusTokens 2000` → +4 点 · 小蛋糕 2💴/4000 → +8 · 奶茶 3💴/6000 → +12（`bonusPoints = round(bonusTokens / AFFINITY_RATE)`，`:154`/`:331`） | **4 点**（= 被动 2 倍 ✓） |

- **结论**：**汇率本身正确**（喂食 = 被动的 2 倍 ✓），**但绝对量级失衡** ✗——一次长任务（百万级 token ⇒ 数千点）碾压一次零食（+4～12 点）⇒ 喂食在体感上无意义 ✗（用户报告与代码一致 ✓）。

### 1.4 范围（做 / 不做）

**做**：① **阈值表重定**（**10 级不变**，绝对值大幅调高——目标 = 「一次任务不直接满级」，具体表由设计轮给出并经用户审）② **喂食效率重定**（使喂食成为有意义的加速路径；目标倍率与数值由设计轮给候选）③ **满级分支定义**（点数不溢出显示 · `pointsToNext` 有意义或显式 `MAX` · 播报收敛）。

**不做**：① 不改等级数（10 级 ✓）② 不加新食品 / 新货币 / 新机制 ✗ ③ 不改兑换屋窗口结构（`openExchangeWindow` 面 ✗）④ 不动「点数只增不减 / 兑换不影响好感」的既有语义 ✗ ⑤ 不动 R16 的「10 级对 10 档」动作解锁映射（阈值数值变化不改映射 ✓）。

### 1.5 硬约束

1. **数值表 = 设计档必给并给对照**：旧值 → 新值逐行对照表（**供用户审** ✓）；倍率给理由（对齐「一次任务 ≈ 多少级」的体感目标）。
2. 语义面零回退：点数只增不减 · 兑换走 `wallet` 不动 `usage`（`:317`）· 喂食 `bonus` 累加 · 历史数据（`affinity.json` 已有 `usage`/`bonus`）**迁移口径须写明**（改阈值 ⇒ 老用户等级会跃变 ✗ ⇒ 设计轮给出处置：接受跃变 / 或只影响新积累 ✗ 二选一写死）。
3. 三道门 + lint；单档 ≤500 行 / 行宽 ≤300。
4. 行为修正须留取证行（t32 家族教训 ✓）。

### 1.6 待决项（须裁定后才能定稿设计）

- **U-1**：**新阈值表**（10 档绝对值）——设计轮出**完整表**供用户审。
- **U-2**：**喂食效率目标**——设计轮给 ≥2 候选（如「喂食 = 被动 5×／10×」）+ 每档零食点数建议。
- **U-3**：**老数据迁移口径**——阈值调高后已有 `usage`（可能已数千点）对应等级会**跃变**（可能直接 Lv.10 ✗）：接受（不迁移）vs 只对新积累生效 ✗——须写死其一。

### 1.7 关联台账与需求档

台账 **T48 / T49** → 本批（销账条件 = 数值表落地 + 用户实机目视等级/喂食体感 + 机检）；需求档：`docs/requirements/PET.md`（好感度条目——新增/修订由设计轮落）；同域参考：**R16**（等级门动作解锁，本批**不动其映射** ✗）。

### 1.8 交付物与排期

交付物 = 数值重平衡（阈值 + 喂食 + 满级分支）+ 对照表 + 本档六段。**零在途冲突**（`shell-affinity.js` / `exchange.js` 无在飞写者 ✓——与 B27/B28/B29/B30 写域不重叠 ✓）⇒ 可立即派设计。

### 1.9 变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-19 | 建档（B31 立案）：T48 + T49 合批；U-1…U-3 待设计轮给候选 |


---

## §2 任务书（eng-designer）

### 2.1 任务目标与范围

让等级与喂食在数值上真正有意义：修掉「一个任务直接满级、满级后点数无上限溢出、零食给的量小到无感」三处体感缺陷（§1.1 原文）——**等级仍 10 级**，阈值绝对值大幅调高；喂食重定效率使其成为有意义的加速路径；满级分支定义清楚（不溢出显示）。

- 来源：台账 **T48**（满级溢出，2026-09-19 实机报告）+ **T49**（喂食/汇率体感）——同域（`shell-affinity.js` 数值面）合批（§1.2）。
- 设计落点：`docs/design/PET-AFFINITY.md`（新建——B31 起立档，好感度数值体系唯一权威源；U-1…U-3 候选与推荐（**待用户追认 / 批准时确认**）见设计档 §2.2 / §2.3 / §2.5）。
- 需求落点：`docs/requirements/PET.md` §三 US-35…US-37 / §四 NFR-26（设计轮已落）。
- 范围（做）：① 阈值表重定（10 级不变）② 喂食效率重定 ③ 满级分支定义（不溢出显示 · `pointsToNext` 显式 `MAX` · 播报收敛）。
- 受影响文件（设计档 §2.7 全清单）：`affinity-core.js`（新 +≈110）· `shell-affinity.js`（356，≈−26 ⇒ ≈330）· `main.js`（261，+≤2 = 恰 1 处 core 注入装配）·
  `exchange.js`（105，+1）· `pet.js`（240，+2）· `package.json`（140，+1 = `build.files` 增列）· `scripts/gates/baseline.json`（38，+1 条 = `assemblyExempt`）· 桩测 `.thincoder/b31-affinity-stub.mjs`（新 +≈120，gitignored 非交付物）。

### 2.2 本批条目（I1–I4；三方条目一致基准）

| # | 条目 | 回指（需求档） | 验收（设计档） |
|---|---|---|---|
| I1 | 阈值表重定：`LEVEL_THRESHOLDS` = `[0, 120, 350, 900, 2600, 5000, 9000, 16000, 30000, 63000]`（10 档、严格递增）；定标锚命中（长任务 2,541 → Lv.4 · 存量 3,545 → Lv.5 · 满级 63,000）；老数据接受重映射 | US-35 | AC-B31-1 · AC-B31-2 · AC-B31-7 |
| I2 | 喂食效率重定：食品 10/20/30💴 → +400/+800/+1,200；`EXCHANGE_RATE` = 10,000；保持「喂食 = 被动 2 倍」汇率 | US-36 | AC-B31-4 |
| I3 | 满级分支：`maxed` 布尔 + `pointsToNext = 'MAX'` + `progress = 1`；显示 `Lv.10 · MAX` / `Lv.10 好感 MAX`；升级播报（等级严格上升播一次，满级自然零播报） | US-37 | AC-B31-3 · AC-B31-5 · AC-B31-8 |
| I4 | 数值面抽取 `affinity-core.js`（纯函数核心、双环境导出、经 `main.js` `init(deps)` 注入壳体）+ 语义零回退（三池分离 / 只增不减 / 兑换不动 usage）+ 门禁全绿与冻结面零 diff（`main.js` 允许面 = 恰 1 处注入装配） | NFR-26 | AC-B31-6 · AC-B31-9 · AC-B31-10 |

**三方同源**：本档 I1–I4 = 设计档 §3.2 AC-B31-1…10（逐条回指如上）= 需求档 US-35…US-37 / NFR-26——同一来源；AC 覆盖 10/10 无遗漏（1,2,7 / 4 / 3,5,8 / 6,9,10）。

### 2.3 实现规则要点（数值逐字；实施按此执行——细节以设计档 §2 为准）

- **阈值表（设计档 §2.2，逐字）**：`LEVEL_THRESHOLDS = [0, 120, 350, 900, 2600, 5000, 9000, 16000, 30000, 63000]`（10 档、严格递增）；`AFFINITY_RATE = 500` **不变**（只动阈值与喂食面，最少移动件）。
  - 定标（用户实机数据）：长任务 1,270,505 token = 2,541 点 → 新 Lv.4；中任务 983 点 → Lv.4；小任务 21 点 → Lv.1；存量 3,545 点 → 新 Lv.5；满级 63,000 点 ≈ 3,150 万 token ≈ 25 次长任务。
- **喂食与汇率（设计档 §2.3，逐字）**：`EXCHANGE_RATE` = **10,000**（1,000 → 10,000）；公式 `bonusPoints = round(bonusTokens / AFFINITY_RATE)` **不变**；效率 = 每💴 40 点 = 被动（每💴 20 点）**2 倍** ✓。
  - 食品表：小鱼干 **10**💴/bonusTokens 200,000/+**400** · 小蛋糕 **20**💴/400,000/+**800** · 珍珠奶茶 **30**💴/600,000/+**1,200**。
- **满级分支（设计档 §2.4）**：`maxed`（新布尔）= `level === LEVEL_THRESHOLDS.length`（10）；满级 `pointsToNext = 'MAX'`（字符串；现行为回退 `points` 无意义值 ✗）；`progress` 满级恒 1；**点数内部仍真实累积**（只增不减不变）——收敛的是显示面与播报面，不是数据面。
  - 显示：`exchange.js:22` 满级 `Lv.10 · MAX`；`pet.js:184` 满级 `Lv.10 好感 MAX`（非满级现状不变）。
  - 播报：升级播报——watcher 每 tick 与 `handleAffinityBuy` 均改为等级**严格上升**才播一次「好感满满，升到 Lv.x 啦~」（谓词 = core 导出 `shouldAnnounceLevelUp`）；满级后等级不可能再升 ⇒ 自然零播报。
- **老数据迁移（U-3 推荐 ① 接受重映射，待用户追认 / 批准时确认；设计档 §2.5）**：不迁移、零转换写入——老数据等级按新表直接重映射（存量 3,545 点 → Lv.5；wallet 折 177💴，购买力按新价同价重定）；候选 ② 只对新积累生效（双标尺永久混存）与 ③ 冻结补偿（补点保级）**均否决**。
- **核心抽取（设计档 §2.6）**：新增 `affinity-core.js`（数值面纯函数核心，零 `require('electron')` / 零 fs / 零定时器；双环境导出 `AFFINITY_RATE` / `EXCHANGE_RATE` / `LEVEL_THRESHOLDS` / `MAX_LEVEL` / `FOODS` / `levelForPoints` / `affinityPoints` / `buildAffinityView` / `shouldAnnounceLevelUp` / `applyFoodPurchase`）。
  - `shell-affinity.js` 消费面：常量迁出 · **经 `init(deps)` 收 `affinityCore`**（不新增 require 直入——D② fanout 保持 3）·
    `affinityView` 收缩为 `affinityCore.buildAffinityView(affinity)` · watcher 播报改升级播报（调 `affinityCore.shouldAnnounceLevelUp`）·
    `handleAffinityBuy` 购买校验改调 `affinityCore.applyFoodPurchase` + 升级追加播报；兑换 handler / 窗口 / 重置函数零改动；数据流不变（不新增定时器 / IPC / 数据文件）。
  - `main.js` 装配面：新增恰 1 处注入装配（`require('./affinity-core.js')` 绑定 + `affinity.init` deps 增 `affinityCore` 键）。

### 2.4 明确出批（不做）

- 不改等级数（**10 级不变**）；不加新食品 / 新货币 / 新机制；不改兑换屋窗口结构（`openExchangeWindow` 面）；
- 不动「点数只增不减 / 兑换不影响好感（兑换走 `wallet` 不动 `usage`，`:317` 语义逐字保留）/ 三池分离（印钞机防护）」既有语义；
- 不动 **R16**「10 级对 10 档」动作解锁映射（B23 在批——按等级 1–10 键控、不按点数 ⇒ 阈值数值变化零影响）；
- 不新增依赖 / 定时器 / IPC 通道 / 数据文件；冻结面零 diff（几何 / 拖拽 / 链 / 素材 / `shell-ipc.js`；`main.js` 例外面 = 恰 1 处 core 注入装配——设计档 §2.7 清单 + 修订注记）；
- 不夹带其它批（B22 事件桥 / B26 / B30 等事项不在本批）。

### 2.5 修正轮 1 修正记录（评审轮次 2 · 八条全修）

八条逐条状态与落点（设计档 = `docs/design/PET-AFFINITY.md`；全部回读核对通过）：

1. 🔴#1 播报谓词未进 core 导出契约（NFR-26 第三项）→ ✅ 已修（路径 ①）：设计档 §2.6 导出面增
   `shouldAnnounceLevelUp(before, after)`（`after > before`；满级恒 false ⇒ 零播报）；watcher /
   `handleAffinityBuy` 消费面改调之（§2.6 消费面 · §2.4 播报收敛 · DD-5）；TC-15/16 改写为谓词
   本体断言 + 新增 **TC-18 喂食路径**（bonus=2,599 买鱼 +400 ⇒ Lv.5，`shouldAnnounceLevelUp(4,5)`=true）；
   AC-B31-5 验证面改「桩测断言（TC-15/16/18）」。需求档 NFR-26 原文**未动**（本就要求纯化 ✓）。
2. 🟡#2 TC-6 期望值与同表口径矛盾 → ✅ 已修：期望值 25,000 → **42,000**（择一 = 更正期望值、
   保留 41,999 输入——覆盖「恰满级前一点」上界，与 TC-5 同口径 = pointsToNext 取下一档阈值）。
3. 🟡#3 候选乙后果两处同源误算 → ✅ 已修：§2.1 乙行 / §2.3 乙行同源同改——3,545 + 15,000 =
   18,545 ∈ [15,500, 25,000) ⇒ **Lv.5 → Lv.8（跳 3 级）**（甲 Lv.7 / 丙 Lv.9 同算法复核无误，未动）。
4. 🟡#4 `shell-affinity.js` ≈311 行无主动拆分复核 → ✅ 已修：§2.7 行数按实际代码逐段重算
   （356 −27 ⇒ **≈329**；原估算 −45 偏乐观）+ 尾注改**主动拆分复核**——纯化面已迁净，两条拆分
   路径逐条否决（兑换屋 + 重置面 = 触碰 B06 F6 既有拆分结构 + `main.js:40/80/103` 注入面 ∈ 冻结面；
   token 读面 = 与 watcher 高内聚且自带消解期），结论 = 本批不拆，**消解条件** = 逼近 500 行或
   需动兑换屋结构时拆出 `shell-exchange.js`。
5. 🟡#5 U-3 状态措辞「裁定」不一致 → ✅ 已修：本档 §2.1 / §2.3 两处「裁定」→「**推荐（待用户
   追认 / 批准时确认）**」——与设计 §2.5 / 需求 US-35 同口径（U-3 尚未经用户拍板）。
6. 🟡#6 TC-10/12/13/14 验证载体未定义 → ✅ 已修：购买校验纯化入 core——§2.6 导出面增
   `applyFoodPurchase(state, foodId)`（`{ok:true, state} | {ok:false, message}`，失败数值零变动）；
   TC-10/12/13 改断言该真实导出（桩测可断）；TC-14 载体 = 静态核对（`:314-322` 兑换 handler
   零改动）+ 实机目视；AC-B31-6 验证面同源更正（去「桩测断言（TC-14）」）；§3.1 表下加
   **验证载体注记**逐条写明验证路径。
7. 🔵#7 §2.2 句尾指针（NFR-9 / NFR-19）与先例不符 → ✅ 已修：指针拆分校正——「设计期给定值」
   措辞承 **NFR-9 / NFR-14** 口径；「单一可调数据」承 **NFR-23 / NFR-24** 口径（NFR-26 自身即
   如此回指）。
8. 🟡#8 「前期 2–3× 旧表」与两表数值不符 → ✅ 已修：§2.2 策略对比甲行口径核正——前期
   **6/7/9×** 旧表（Lv.2–4）、后期拉开到 35×（Lv.10），同口径 vs 旧表；结论句「分段加速曲线」
   不变（vs 旧表倍率 6 → 35 单调拉开 ✓）。

**连带同步（八条直接导出，不夹带新语义）**：本档 §2.1 受影响文件行 / §2.3 导出契约与消费面行随
设计档同步（core 导出清单 + `applyFoodPurchase` / `shouldAnnounceLevelUp`）；设计档 §2.7 三档行数
（core +≈110 · shell −27 ⇒ ≈329 · 桩测 +≈120）、DD-5 / DD-7、§2.4 播报收敛句、§3.1 用例表与载体
注记、§3.2 AC-B31-5 / AC-B31-6、变更记录 +1 行。数值方向不变：10 级 / 42,000 封顶 / 喂食甲案
（被动 2 倍）/ 迁移 ① 均未动 ✓。

未落 / 存疑项：无。

### 2.6 顶档重定修订记录（用户裁定 A · 2026-09-19）

**来源**：用户 2026-09-19 裁定选 A（原话「听你的 a」；取值区间 = 42,000/16.5 次 与 99e/78 次 之间）——顶档 42,000 → **63,000** 点 = 3,150 万 token ≈ 25 次长任务（保「认真用 1–2 个月能满级」的盼头）。本条为数值修订记录；修正轮 1（§2.5）内容不重叠、未改动。

**重算口径（同一分段加速曲线形态）**：前期锚点与中段保持——Lv.2–Lv.4 = 120/350/900 不动；中段 Lv.5–Lv.7 = 2,600/5,000/9,000 不动（两锚点钉住：长任务 2,541 → Lv.4 · 存量 3,545 → Lv.5）；新增高度由后段加速吸收：Lv.8 15,500 → **16,000** · Lv.9 25,000 → **30,000** · Lv.10 42,000 → **63,000**；档内跨度 1,700 → 2,400 → 4,000 → 7,000 → 14,000 → 33,000（逐档放大）。

**新表（10 档逐字）**：`LEVEL_THRESHOLDS = [0, 120, 350, 900, 2600, 5000, 9000, 16000, 30000, 63000]`

| 等级 | 新阈值（点） | token 折算（rate 500） | 档内跨度（点） |
|---|---|---|---|
| Lv.1 | 0 | 0 | — |
| Lv.2 | 120 | 60,000 | 120 |
| Lv.3 | 350 | 175,000 | 230 |
| Lv.4 | 900 | 450,000 | 550 |
| Lv.5 | 2,600 | 1,300,000 | 1,700 |
| Lv.6 | 5,000 | 2,500,000 | 2,400 |
| Lv.7 | 9,000 | 4,500,000 | 4,000 |
| Lv.8 | 16,000 | 8,000,000 | 7,000 |
| Lv.9 | 30,000 | 15,000,000 | 14,000 |
| Lv.10 | 63,000 | 31,500,000 | 33,000 |

**三锚点复算（同源）**：长任务 2,541 → **Lv.4**（900 ≤ 2,541 < 2,600 ✓）· 存量 3,545 → **Lv.5**（2,600 ≤ 3,545 < 5,000 ✓，保持）· 满级 63,000 ≈ **25 次长任务**（63,000 ÷ 2,541 ≈ 24.8）= 存量 3,545 点的 **≈ 17.8 倍**（63,000 ÷ 3,545 ≈ 17.8）。

**喂食面复算（零变动）**：甲 +6,800 ⇒ 10,345 ∈ [9,000, 16,000) = Lv.7 · 乙 +15,000 ⇒ 18,545 ∈ [16,000, 30,000) = Lv.8 · 丙 +30,000 ⇒ 33,545 ∈ [30,000, 63,000) = Lv.9——与现文逐条一致；16.7% 体感锚（400 ÷ 2,400）与「喂食 = 被动 2 倍」均不变 ⇒ §2.1 / §2.3 喂食行未动；TC-1…5 / TC-18 引值复算后不变。

**同步落点（已落 + 回读核对通过）**：
- 设计档 `docs/design/PET-AFFINITY.md`：§2.2 对照表（Lv.8/9/10 行 + 顶档重定口径句）· 标定锚句（16.5 → 25 次 · 11.8 → 17.8 倍 · 上界 35× → 52.5× · 跨度 17,000 → 33,000）· 否决策略行 1（×35 → ×52.5 对齐新顶档）与行 3（16 → 25 次）·
  §2.5 冻结补偿补点（38,500 → 59,500）· §2.6 契约常量 · DD-1 · §3.1 TC-6/7/8 引值（41,999 / 42,000 → 62,999 / 63,000）· §3.2 AC-B31-1 / AC-B31-2 引值 · 变更记录 +1 行；§1.1 / §1.2 逐句核过（无引用顶档值的句子 ⇒ 未动）。
- 需求档 `docs/requirements/PET.md`：US-35 口径数字（满级 42,000 → 63,000 点 ≈ 25 次长任务）+ 变更记录 +1 行。
- 本档 §2：§2.2 I1 行 · §2.3 阈值表与定标行（就地同步）；本记录。

**未动（按裁定）**：喂食甲案（= 被动 2 倍）· 迁移 ①（接受重映射）· 满级分支语义（`MAX` / `progress = 1` / 点数内部累积）· AC 编号与回指结构 · 10 级结构。

**未落 / 存疑**：① `docs/README.md` 地图行「10 级 / 42,000 封顶」待主 agent 侧同步（地图非本角色写域——建议行随报告）；② §2.2 否决策略行 2「末档 ≈ 3.8 万点」未动——系该候选自身参数（每级 ×2.5）的产物、非顶档派生；③ 本档 §2.5 / §3 与设计档变更记录（修正轮 1 行）中的历史数值保留原样（日志语义 = 当时状态）——现行值以本记录与设计档 §2.2 为准。

### 2.7 注入形态修订记录（实施轮 1 打回后 · 父侧裁决路径① · 2026-09-19）

**来源**：实施轮 1 停报（本档 §5.1）——设计档 §2.6 原定 `shell-affinity.js` 增 `require('./affinity-core.js')`；
门禁判据 **D②**（`docs/CONVENTIONS.md` §四：域模块静态相对 require 出度 ≤3）下 `shell-affinity.js` 现有 3 条（`:9-11`）⇒ 加 core = **4** ⇒ `npm run lint` 必红（与 AC-B31-9 相抵）；
基线冻结不适用（`docs/design/REPO-CONVENTIONS.md` §A.2.2.6 规则 1 + `expires.hardRule`：不得冻结**新增**违规）。
**父侧裁决 = 路径①（本仓 sanctioned 形态）**：`affinity-core.js` 经 `main.js` 的 `init(deps)` 注入 `shell-affinity.js`（fanout 保持 3；判据句先例 = `docs/TODO.md` T45「超出者走 `init(deps)` 注入而非 `require`」）。

**修订面（6 项，逐条落点 = 设计档 `docs/design/PET-AFFINITY.md`）**：

1. 设计档 §2.6 消费面：`shell-affinity.js` 改经 `init(deps)` 收 `affinityCore`（与既有注入键同形）；`main.js` 侧 require + 注入 = **唯一新增装配点（1 处）**；消费面调用改 `affinityCore.` 前缀。
2. 设计档 §2.7 冻结面：`main.js` **移出**冻结清单——允许面 = 恰 1 处 core 注入装配、其余行仍冻结；冻结面修订注记行（含依据与先例）。
3. 设计档 §2.9 冲突核对清单：补 **D② 行**（本次打回直接成因、原清单漏列）+ **D③ 行**（`assemblyExempt` 免检机制：结构性免检、非违规冻结）。
4. AC-B31-10（设计档 §3.2）：`main.js` 口径「零 diff」→「恰 1 处 core 注入装配」；并登记 `scripts/gates/baseline.json` 变更面 = `assemblyExempt` 恰 +1 条。
5. 设计档 §2.7 受影响文件表：+ `main.js`（261，+≤2）· + `scripts/gates/baseline.json`（38，+1 条）；`shell-affinity.js` 估算随注入形态 ≈329 → **≈330**（−27 → −26）。
6. 设计档变更记录 +1 行；连带微修：§2.6 行锚 `:32-38` → **`:32-39`**、§2.7 拆分复核 ≈330、拆分路径① `main.js` 句（「∈ 冻结面」→「超出本批允许面」）。

**连带同步（本档 §2 就地）**：§2.1 受影响文件行 · §2.2 I4 行 · §2.3 核心抽取消费面行 · §2.4 冻结面句。

**零变动面（不夹带）**：阈值表 / 喂食效率 / `MAX` / 重映射 / 满级语义 / 文案 / TC 与 AC 编号（AC-B31-10 仅口径描述更新）/ 需求档（US-35…37 / NFR-26 未动）。

**未落 / 存疑**：无。

### 2.8 收口轮记录（文档层折账 · eng-designer · 2026-09-19）

**来源**：本档 §5.2「未落 / 存疑」项 2（文档层三项）/ 3（清单外 2 档）/ 4 后段（现状数待同步）+ advisor 🟡#1–#3；按派单落五件（只此五件，不夹带）：

1. `docs/requirements/PET.md` NFR-26（`:602`/`:603`）：「`main.js` 零 diff」→「`main.js` 允许面 = **恰 1 处 `affinity-core.js` 注入装配**、其余行零 diff（承设计档 §2.7 修订注记）」——原 246 字符单行拆为 219 + 122 两行（行宽合规）；变更记录 +1 行（`:649`）。
2. `docs/design/PET-AFFINITY.md`：① `:204` / `:287`（原 `:282`）/ `:298`（原 `:293`）三处「兑换 handler 零改动」→「除 `EXCHANGE_RATE` 改指 `affinityCore.EXCHANGE_RATE` 外逐字不变」（常量迁出实况；语义逐字保留）；
   ② §2.7 清单补登记清单外 2 档（`:220`/`:221`）+ 补登记说明（`:224`）；③ AC-B31-10（`:302`）变更面补 `scripts/gates/` 2 档；④ 变更记录 +1 行（`:314`）。
3. `docs/CONVENTIONS.md` §四：`:119`「15 条 require」→ **16**；现状行（`:122`/`:123`）「免检 **2 档**」→ **3 档**（枚举同步 + `affinity-core.js`——结构性免检；as-of 括注 = 「D③ 数随 B31 同步 as-of 2026-09-19」）；变更记录 +1 行（`:195`）。
4. `docs/design/REPO-CONVENTIONS.md` 附 A §A.2.2.2：`:425`「`main.js:32-46` 共 15 条」→ **`:32-47` 共 16 条**；`:427` `assemblyExempt` 2 → **3 档**（+ `affinity-core.js` 指名）；`:439` 枚举同改；变更记录 +1 行（`:902`）。
5. 批次档 = 本段（§2.8）。

**核验（D6 回读核对逐处通过）**：四档 EOL 纯 CRLF 无混行、0 行 >300；`npm run lint` = **PASS**（原样行：`GATE lint PASS checks=7 selftest=20/20`；assembly 13/13 + exempt=3）——§5.2 项 1（lint FAIL 面）本次实测已不成立。
**未落 / 存疑**：① §5.2 项 4 前段「静态占位面」（`exchange.html:45` / `pet.html:117`）不在五件内——待父侧裁定；② 观察项（未动、供父侧处置）：`docs/design/ARCHITECTURE.md:50`/`:113` 与 `docs/batches/B25-architecture-docs.md:164` 的「15 档 / `main.js:32-46`」口径（B25 在飞面）；
   `docs/design/REPO-CONVENTIONS.md:738` 否决理由行「`main.js` 15 条绑定」（决策记录语义）；`scripts/gates/baseline.json` 的 `asOf` 字段仍为 2026-09-18（代码档、非本角色写域）；③ §5.2 项 5–7（行数估算偏差 / 实机目视未执行 / 根目录垃圾档）原样保留。

**补记（同轮 · 现时点实测）**：主 agent 侧 §6 收口写入落地后，`npm run lint` 现为 **FAIL（violations=2）**——`docs/batches/B31-affinity-balance.md` §6 `:454`（477 字符 · 非豁免面）与 `docs/batches/B30-notify-followup.md` 1 行（别批在飞面）；
   二者均非本角色写域、不代修（B31 §6 行建议按 §4 :355 先例拆行）；本四档（`PET.md` / `PET-AFFINITY.md` / `CONVENTIONS.md` / `REPO-CONVENTIONS.md`）与本段全绿。

**补记消解（同轮 · 复跑实测）**：上述 2 违例已就地拆行消解 ⇒ 复跑 `npm run lint` = **PASS**（`GATE lint PASS checks=7 selftest=20/20`）——本批收口时点门禁全绿（上条 FAIL 为瞬时快照，as-of 语义）。

## §3 设计评审（评审子代理）

<!-- 由评审子代理填 -->

---

### 轮次 1（评审子代理）

评审范围：`docs/design/PET-AFFINITY.md` 全档 · `docs/requirements/PET.md`（US-35…37 / NFR-26 及既有条目交叉核）· `docs/batches/B31-affinity-balance.md` §1+§2。代码面（行数 / 行锚）与 `docs/CONVENTIONS.md` 不在本轮范围——相关数字为设计档自述（unverified）。已核通过项（无发现）：US-35…37 / NFR-26 回指链与 AC 覆盖 10/10 一致；U-1…U-3 的候选 / 推荐 / 否决理由均已在设计档 §2.2 / §2.3 / §2.5 备齐；§2.7 冻结面清单为 NFR-26 零回退面的超集。

| # | Category | Severity | Issue | Suggestion |
|---|---|---|---|---|
| 1 | Requirements | 🔴 | NFR-26（`docs/requirements/PET.md:600`）要求「等级判定 / 视图组装 / 播报谓词」均为可被 node 直接装载档内的纯函数（双环境导出）；设计 §2.6 核心导出契约（`docs/design/PET-AFFINITY.md:171-179`）无播报谓词——§2.6 消费面写法（`:189-195`）把谓词内联在 `shell-affinity.js`。同一机制（播报谓词的实现 / 可测性）在需求档与设计档两处描述互斥 ⇒ 按设计实施不满足 NFR-26 字面；且 AC-B31-5（`:268`）声称「桩测断言（TC-15/16）」，而桩测载体（`:260`）只装载 `affinity-core.js` ⇒ 对谓词本体无断言对象（只能断言等级输出）。 | 二选一路径落地后重发设计：① 把播报谓词收敛为 `affinity-core.js` 的导出纯函数（形态与命名由设计者定）并补 TC（含喂食路径 `handleAffinityBuy` 的升级播报用例）；② 走需求层修订 NFR-26 / AC-B31-5 的机检口径，并同步 §2.6 导出契约。 |
| 2 | Acceptance criteria | 🟡 | TC-6（`docs/design/PET-AFFINITY.md:247`）期望值与同表口径自相矛盾：按 TC-5（`:246`）与 §2.6 语义（pointsToNext = 下一档阈值），41,999 点（Lv.9）的 pointsToNext 应为 42,000 而非 25,000（25,000 = Lv.9 自身阈值）。逐字实施桩测将必得一条失败用例。 | 更正期望值为 42,000；或改输入为 24,999（level=8 · pointsToNext=25,000）——与 TC-5 保持同一口径。 |
| 3 | Clarity | 🟡 | 候选乙的存量 wallet 效果两处同源误算：§2.1 行 2（`docs/design/PET-AFFINITY.md:71`）与 §2.3 乙行（`:116`）写「5 鱼 = +15,000 ⇒ Lv.5 → Lv.9（跳 4 级）」；按本设计新表 3,545 + 15,000 = 18,545 ∈ [15,500, 25,000) ⇒ **Lv.8（跳 3 级）**。该表为 U-2「供用户审」的候选对比物，误值误导用户评估（结论方向不变——乙 / 丙仍属否决）。 | 按新表复算更正（§2.1 / §2.3 两处同源数值），与甲 / 丙行同一算法口径。 |
| 4 | Affected-file size annotations | 🟡 | §2.7 自述 `shell-affinity.js` 356 行 → ≈−45 ⇒ 改后 ≈311 行，仍 >300；尾注（`:212`）「无超档文件（单档 ≤500 行约束内，无拆分计划）」只核 500 上限，未按 >300 档给出主动拆分复核（本轮评审档位：>300 = 主动拆分复核；>500 = 必须拆分）。行数为设计档自述（unverified）。 | 对 `shell-affinity.js`（≈311 行）补主动拆分复核（拆 / 不拆的判据与理由，或本批额外迁出一段使其 ≤300），供用户审。 |
| 5 | Methodology compliance | 🟡 | 状态措辞不一致：批次档 §2.1（`docs/batches/B31-affinity-balance.md:71`）与 §2.3（`:96`）把 U-3 写作「裁定 = ① 接受重映射」，而设计 §2.5（`docs/design/PET-AFFINITY.md:156`）与需求档 US-35（`docs/requirements/PET.md:365`）均为「推荐 ① · 待用户批准时确认」；与本轮评审对象声明「U-1…U-3 = 待用户追认项」不一致——实现方可能把待追认读成已决。 | 批次档 §2 两处统一为「推荐（待用户追认 / 批准时确认）」措辞，与设计档 / 需求档同一状态口径。 |
| 6 | Acceptance criteria | 🟡 | TC-10 / TC-12 / TC-13（buy 行为）与 TC-14（兑换语义，`:251-255`）的验证载体未定义：相关行为按 §2.6（`:196-197`）保留在 `shell-affinity.js`（兑换 handler 明示零改动），机检载体（`:260`）只装载 `affinity-core.js` ⇒ 桩测不可断言；AC-B31-6（`:269`）仍把 TC-14 标为「桩测断言」。 | 逐条明确验证路径（可测的推导不变式归桩测，其余归静态核对 / 实机目视）；或按 NFR-26 精神把可纯化部分（如购买校验）并入核心导出后回标载体。 |
| 7 | Clarity | 🔵 | §2.2「标定状态」句尾（`docs/design/PET-AFFINITY.md:99`）「（承 NFR-9 / NFR-19 口径）」与所引机制不符：「单一可调常量」先例口径 = NFR-23 / NFR-24（NFR-26 自身即写「承 NFR-23 / NFR-24 口径」）；「设计期给定值」措辞先例 = NFR-9 / NFR-14。 | 校正指针，避免跨批口径漂移。 |

计数：🔴 1 · 🟡 5 · 🔵 1（共 7 条）
VERDICT: changes-required

### 轮次 2（评审子代理）

（本条 = 首轮设计评审的重跑复核：上一跑超时、未签发凭证，**无修复声明**——对轮次 1 七条按当前文件态逐条复核 + 新发现 1 条。）

评审范围：`docs/design/PET-AFFINITY.md` 全档 · `docs/requirements/PET.md`（US-35…37 / NFR-26 及既有条目交叉核）· `docs/batches/B31-affinity-balance.md` §1+§2。代码面（行数 / 行锚）与 `docs/CONVENTIONS.md` 不在范围——相关数字为设计档自述（unverified）。已复核通过（本轮无变化）：阈值表 10 档逐格复算（token 折算 ×500 / 档内跨度 / 严格递增）无误；US-35…37 / NFR-26 回指链与 AC 覆盖 10/10 一致；U-1…U-3 候选 / 推荐 / 否决理由齐备；§2.7 冻结面清单为 NFR-26 零回退面超集。

| # | Orig# | File | Severity | Status | Notes |
|---|---|---|---|---|---|
| 1 | 1 | docs/design/PET-AFFINITY.md · docs/requirements/PET.md | 🔴 | Unfixed | NFR-26 三项纯函数要求的第三项「播报谓词」未进 §2.6 导出契约（171–179 行导出面仅 8 项，无谓词）；谓词内联于 `shell-affinity.js`（194 行）；AC-B31-5 的「桩测断言（TC-15/16）」无载体（载体只装载 `affinity-core.js`）。引文 ①。 |
| 2 | 2 | docs/design/PET-AFFINITY.md | 🟡 | Unfixed | TC-6 期望值自相矛盾：41,999 点（Lv.9）的 `pointsToNext` 按本档语义应为 42,000，非 25,000（25,000 = Lv.9 自身阈值）；与 TC-5 口径（120）不同源。引文 ②。 |
| 3 | 3 | docs/design/PET-AFFINITY.md | 🟡 | Unfixed | 候选乙后果两处同源误算：3,545 + 15,000 = 18,545 ∈ [15,500, 25,000) ⇒ **Lv.8（跳 3 级）**，非「Lv.5 → Lv.9（跳 4 级）」。引文 ③。 |
| 4 | 4 | docs/design/PET-AFFINITY.md | 🟡 | Unfixed | 设计档自述 `shell-affinity.js` 356 → ≈311 行 ⇒ 仍 >300（本轮档位口径：>300 = 主动拆分复核；>500 = 必须拆分）；尾注只核 ≤500 且称「无拆分计划」。行数为设计档自述（unverified）。引文 ④。 |
| 5 | 5 | docs/batches/B31-affinity-balance.md | 🟡 | Unfixed | U-3 状态措辞不一致：批次档 §2.1/§2.3 写「裁定 = ①」，设计 §2.5 与需求 US-35 为「推荐 ① · 待用户批准时确认」（评审对象声明亦为「待用户追认项」）。引文 ⑤。 |
| 6 | 6 | docs/design/PET-AFFINITY.md | 🟡 | Unfixed | TC-10/12/13/14 验证载体未定义：buy / 兑换行为留在 `shell-affinity.js`（兑换 handler 明示零改动），机检载体只装载 `affinity-core.js` ⇒ 桩测不可断言；AC-B31-6 仍标「桩测断言（TC-14）」。引文 ⑥。 |
| 7 | 7 | docs/design/PET-AFFINITY.md | 🔵 | Unfixed | §2.2 句尾「承 NFR-9 / NFR-19 口径」与「单一可调数据」口径的先例（NFR-23 / NFR-24——NFR-26 自身即如此回指）不对齐；「设计期给定值」链 = NFR-9 / NFR-14 / NFR-19。可核对后校正指针。引文 ⑦。 |
| 8 | (new) | docs/design/PET-AFFINITY.md | 🟡 | New | §2.2 策略对比第 3 行「前期 2–3× 旧表」与两表数值不兼容：按「vs 旧表」读前期实为 6× / 7× / 9×（120/20、350/50、900/100）；按「相邻档倍率」读则「后期 35×」不同口径——需核正口径或数字。引文 ⑧。 |

本轮 read 逐字引文（file:line: 内容）：
① `docs/requirements/PET.md:600: - **可机检**：等级判定 / 视图组装 / 播报谓词必须是**纯函数**并集中在可被 node 直接装载的档内（双环境导出，口径同 NFR-17 / NFR-20）；开发期桩测**装载真实实现**逐条断言（不写镜像断言），末行 `pass/total PASS`。` / `docs/design/PET-AFFINITY.md:171: // 导出面（CJS）`（导出面 171–179 = AFFINITY_RATE / EXCHANGE_RATE / LEVEL_THRESHOLDS / MAX_LEVEL / FOODS / levelForPoints / affinityPoints / buildAffinityView） / `docs/design/PET-AFFINITY.md:194:   if (v.level > before) pet.petSay(`好感满满，升到 Lv.${v.level} 啦~`);   // 满级恒 false ⇒ 停播` / `docs/design/PET-AFFINITY.md:268: | AC-B31-5 | US-37 | 播报谓词 = level 严格上升；满级恒 false ⇒ 零播报 | 桩测断言（TC-15/16）+ 实机目视 |`
② `docs/design/PET-AFFINITY.md:247: | TC-6 | US-35 | 边界 | points = 41,999 | level=9 · pointsToNext=25,000 · progress<1 |` / `docs/design/PET-AFFINITY.md:246: | TC-5 | US-35 | 边界 | `buildAffinityView({usage:0, bonus:0, …})` | level=1 · progress=0 · pointsToNext=120 |`
③ `docs/design/PET-AFFINITY.md:71: | 2 | 乙：喂食 5× 激进 | 存量 wallet（177💴）一次买 5 鱼 = +15,000 点 ⇒ 等级 **Lv.5 → Lv.9** 一次性跳 4 级 | 跳级感接近本批要修的症状本身；且与「汇率本就正确（2×）」的实测结论相左 | **否决** |` / `docs/design/PET-AFFINITY.md:116: | 2 | 乙：喂食 = 被动 5× | 10,000 | 鱼 30💴/+3,000 · 蛋糕 60💴/+6,000 · 奶茶 90💴/+9,000 | 100 点/💴 = 5 倍 | 5 鱼 = +15,000 ⇒ Lv.5 → **Lv.9**（跳 4 级） | 否决——跳级观感接近本批要修的症状 |`
④ `docs/design/PET-AFFINITY.md:206: | `shell-affinity.js` | 356 | **≈ −45** | 修改 | 常量迁出 · `affinityView` 收缩 · 播报改升级播报（watcher + buy） |` / `docs/design/PET-AFFINITY.md:212: 无超档文件（单档 ≤500 行约束内，无拆分计划）。`（句首）
⑤ `docs/batches/B31-affinity-balance.md:96: - **老数据迁移（U-3 裁定 = ① 接受重映射；设计档 §2.5）**：不迁移、零转换写入——老数据等级按新表直接重映射（存量 3,545 点 → Lv.5；wallet 折 177💴，购买力按新价同价重定）；候选 ② 只对新积累生效（双标尺永久混存）与 ③ 冻结补偿（补点保级）**均否决**。` / `docs/design/PET-AFFINITY.md:156: **结论（推荐 ①，待用户批准时确认）**：**接受跃变（不迁移）**——老数据不转换、不写入补偿，等级按新表直接重映射。` / `docs/requirements/PET.md:365: - 口径（**迁移**，U-3 推荐 ① 接受重映射，待用户批准时确认）：老数据不迁移、按新表直接重算等级（用户存量 Lv.10 → Lv.5）；「只对新积累生效 / 冻结补偿」两变体否决（理由见设计档 §2.5）。`
⑥ `docs/design/PET-AFFINITY.md:255: | TC-14 | 语义（NFR-26） | 正常 | exchange 全额（wallet ≥ 1💴） | wallet 减 · **usage 不变** · currency 增 |` / `docs/design/PET-AFFINITY.md:269: | AC-B31-6 | NFR-26 | 语义零回退：兑换只减 wallet 不动 usage；bonus / usage / 点数只增不减 | 桩测断言（TC-14）+ 静态核对（`:317` 语义行零改动） |` / `docs/design/PET-AFFINITY.md:197: - `:314-322` 兑换 handler 与窗口 / 重置函数**零改动**。` / `docs/design/PET-AFFINITY.md:260: ### 3.2 验收标准（逐条回指；机检载体 = `.thincoder/b31-affinity-stub.mjs` 装载真实 `affinity-core.js`，末行 `pass/total PASS`）`
⑦ `docs/design/PET-AFFINITY.md:99: - **标定状态**：本表 = 设计期给定值（按用户实机数据定标）；**单一可调数据**（一行 10 个数字），用户审后如再调只改 `affinity-core.js` 一处（承 NFR-9 / NFR-19 口径）。` / `docs/requirements/PET.md:599: - **数值单点**：阈值表 / 汇率 / 食品表 = 单一常量表（`affinity-core.js`）——一处定义、一处消费；改值只改数据、不牵动机制（承 NFR-23 / NFR-24 口径）。`
⑧ `docs/design/PET-AFFINITY.md:107: | 3 | **甲：分段加速曲线（选定）** | 前期 2–3× 旧表、后期拉开到 35×；三锚点全部命中（长任务 → Lv.4 / 存量 → Lv.5 / 满级 ≈ 16 次长任务） | 选定——前期可感 + 后期有分量，锚点实测校验 |` / `docs/design/PET-AFFINITY.md:83: | Lv.2 | 20 | **120** | 60,000 | 120 |` / `docs/design/PET-AFFINITY.md:84: | Lv.3 | 50 | **350** | 175,000 | 230 |` / `docs/design/PET-AFFINITY.md:85: | Lv.4 | 100 | **900** | 450,000 | 550 |`

计数：🔴 1 · 🟡 6 · 🔵 1（共 8 条）
VERDICT: changes-required

### 轮次 3（评审子代理）

（复核轮 3 = 收敛验证：对对象声明九处速核逐条按当前文件态复核——①–⑧ = 修正轮 1 八条的落点复核，⑨ = 用户裁定 A 顶档重定（新内容）的自洽复核。范围 = 三份在scope 文档；代码面行数 / 行锚不在范围——相关数字为设计档自述（unverified）。上轮宿主引文核验失配 = 修正落盘后的行号位移，本轮已按现行行号全部重核。）

**结论：九处速核全部通过（9/9）；剩余问题 0 条（🔴 0 · 🟡 0 · 🔵 0）；A 案顶档重定跨三档自洽。**

| # | Orig# | File | Severity | Status | Notes |
|---|---|---|---|---|---|
| 1 | 1 | docs/design/PET-AFFINITY.md | 🔴（已消解） | Fixed | 播报谓词入 core 导出：`shouldAnnounceLevelUp(before, after)`（after > before；满级恒 false）· watcher（:201）与 buy（:203）两路径消费 · TC-18（:272）锁喂食路径 · AC-B31-5（:284）= TC-15/16/18；NFR-26 第三项满足（需求原文未动） |
| 2 | 2 | docs/design/PET-AFFINITY.md | 🟡（已消解） | Fixed | TC-6（:260）62,999 ⇒ level=9 · pointsToNext=63,000 · progress<1——与 A 案新表同口径、与 TC-5 同语义（下一档阈值） |
| 3 | 3 | docs/design/PET-AFFINITY.md | 🟡（已消解） | Fixed | 乙行两处（:71 / :119）：18,545 ∈ [16,000, 30,000) ⇒ Lv.5 → Lv.8（跳 3 级）；甲 Lv.7 / 丙 Lv.9 复核无误 |
| 4 | 4 | docs/design/PET-AFFINITY.md | 🟡（已消解） | Fixed | §2.7（:213）356 −27 ⇒ ≈329 内部自洽；:219-223 = >300 主动拆分复核（本批不拆 + 两条路径逐条否决 + 消解条件） |
| 5 | 5 | docs/batches/B31-affinity-balance.md | 🟡（已消解） | Fixed | :71 / :96 改「推荐（待用户追认 / 批准时确认）」，与设计 :159 / 需求 :365 同口径 |
| 6 | 6 | docs/design/PET-AFFINITY.md | 🟡（已消解） | Fixed | `applyFoodPurchase` 入 core（:184）；TC-10/12/13 桩测真实导出、TC-14 → 静态 + 实机（载体注记 :274）；AC-B31-6（:285）同源更正 |
| 7 | 7 | docs/design/PET-AFFINITY.md | 🔵（已消解） | Fixed | :102 指针拆分校正：「设计期给定值」= NFR-9 / NFR-14；「单一可调数据」= NFR-23 / NFR-24 |
| 8 | 8 | docs/design/PET-AFFINITY.md | 🟡（已消解） | Fixed | :110 口径核正（随 A 案同步）：前期 6/7/9×（120/20、350/50、900/100）+ 后期 52.5×（63,000/1,200） |
| 9 | (新 · A案) | 设计 :86-91 / :93-94 / :99 / :101 · 需求 :364 · 批档 :89-90 / :154-171 | — | Verified | 顶档 63,000 = 3,150 万 token ≈ 25 次长任务（24.8）≈ 存量 17.8 倍；Lv.8 / Lv.9 = 16,000 / 30,000；跨度 7,000 / 14,000 / 33,000；三锚点 + 喂食甲/乙/丙 + 补点 59,500 复算全对；历史值（42,000 / 35× / 16.5 次 / 38,500）仅存于日志行（批档 §2.6 ③ 已登记口径，合规） |

本轮 read 逐字引文（file:line: 内容）：
① `docs/design/PET-AFFINITY.md:183: shouldAnnounceLevelUp(before, after) // 播报谓词（NFR-26 第三项）：after > before；满级恒 false ⇒ 零播报` / `docs/design/PET-AFFINITY.md:201:   if (shouldAnnounceLevelUp(before, v.level)) pet.petSay(`好感满满，升到 Lv.${v.level} 啦~`);   // 满级恒 false ⇒ 停播` / `docs/design/PET-AFFINITY.md:272: | TC-18 | US-37 | 正常 | 喂食跨档：bonus=2,599 买鱼（+400 ⇒ 2,999 ⇒ Lv.5） | `shouldAnnounceLevelUp(4,5)`=true（喂食路径升级播报一次；顺序 = `food.msg` 先行） |` / `docs/design/PET-AFFINITY.md:284: | AC-B31-5 | US-37 | 播报谓词 = core 导出纯函数 `shouldAnnounceLevelUp`（level 严格上升）；满级恒 false ⇒ 零播报 | 桩测断言（TC-15/16/18）+ 实机目视 |`
② `docs/design/PET-AFFINITY.md:260: | TC-6 | US-35 | 边界 | points = 62,999 | level=9 · pointsToNext=63,000 · progress<1 |`
③ `docs/design/PET-AFFINITY.md:71: | 2 | 乙：喂食 5× 激进 | 存量 wallet（177💴）一次买 5 鱼 = +15,000 点 ⇒ 等级 **Lv.5 → Lv.8** 一次性跳 3 级 | 跳级感接近本批要修的症状本身；且与「汇率本就正确（2×）」的实测结论相左 | **否决** |` / `docs/design/PET-AFFINITY.md:119: | 2 | 乙：喂食 = 被动 5× | 10,000 | 鱼 30💴/+3,000 · 蛋糕 60💴/+6,000 · 奶茶 90💴/+9,000 | 100 点/💴 = 5 倍 | 5 鱼 = +15,000 ⇒ Lv.5 → **Lv.8**（跳 3 级） | 否决——跳级观感接近本批要修的症状 |`
④ `docs/design/PET-AFFINITY.md:213: | `shell-affinity.js` | 356 | **≈ −27 ⇒ ≈329** | 修改 | 常量迁出 · `affinityView` 收缩 · 播报改升级播报（watcher + buy，调 core 谓词）· 购买校验迁 core（`applyFoodPurchase`） |` / `docs/design/PET-AFFINITY.md:219: **拆分复核（>300 档主动复核；结论 = 本批不拆）**：`shell-affinity.js` 改后 ≈329 行（356 −27；原估算 −45 偏乐观，本轮按实际代码逐段重算）——纯化面已迁净（常量 / 视图 / 谓词 / 购买校验），残面全部绑定 electron（窗口 / dialog）、fs（数据读写 / token 读面）与定时器（watcher），不可再纯化。`
⑤ `docs/batches/B31-affinity-balance.md:71: - 设计落点：`docs/design/PET-AFFINITY.md`（新建——B31 起立档，好感度数值体系唯一权威源；U-1…U-3 候选与推荐（**待用户追认 / 批准时确认**）见设计档 §2.2 / §2.3 / §2.5）。` / `docs/batches/B31-affinity-balance.md:96: - **老数据迁移（U-3 推荐 ① 接受重映射，待用户追认 / 批准时确认；设计档 §2.5）**：不迁移、零转换写入——老数据等级按新表直接重映射（存量 3,545 点 → Lv.5；wallet 折 177💴，购买力按新价同价重定）；候选 ② 只对新积累生效（双标尺永久混存）与 ③ 冻结补偿（补点保级）**均否决**。`
⑥ `docs/design/PET-AFFINITY.md:184: applyFoodPurchase(state, foodId)     // 购买校验与状态转移（现 :325-331 纯化）` / `docs/design/PET-AFFINITY.md:285: | AC-B31-6 | NFR-26 | 语义零回退：兑换只减 wallet 不动 usage；bonus / usage / 点数只增不减 | 桩测断言（TC-10/12/13——购买校验纯化面）+ 静态核对（`:314-322` 兑换 handler 零改动）+ 实机目视（TC-14） |`
⑦ `docs/design/PET-AFFINITY.md:102: - **标定状态**：本表 = 设计期给定值（按用户实机数据定标）；**单一可调数据**（一行 10 个数字），用户审后如再调只改 `affinity-core.js` 一处。「设计期给定值」措辞承 NFR-9 / NFR-14 口径；「单一可调数据」承 NFR-23 / NFR-24 口径。`
⑧ `docs/design/PET-AFFINITY.md:110: | 3 | **甲：分段加速曲线（选定）** | 前期 6/7/9× 旧表（Lv.2–4）、后期拉开到 52.5×（Lv.10）——同口径 vs 旧表；三锚点全部命中（长任务 → Lv.4 / 存量 → Lv.5 / 满级 ≈ 25 次长任务） | 选定——前期可感 + 后期有分量，锚点实测校验 |`
⑨ `docs/design/PET-AFFINITY.md:91: | Lv.10 | 1,200 | **63,000** | 31,500,000 | 33,000 |` / `docs/design/PET-AFFINITY.md:99: - **满级 = 长期深度使用顶点**：封顶 63,000 点 = 3,150 万 token ≈ **25 次长任务** ≈ 用户当前总量（177 万）的 **17.8 倍**。` / `docs/requirements/PET.md:364: - 口径：阈值表 = 10 档**单一可调常量表**（`affinity-core.js`；完整对照与总量级理由见设计档 §2.2）——定标依据 = 用户实机数据（一次长任务 ≈127 万 token ⇒ 新 Lv.4；存量 3,545 点 ⇒ 新 Lv.5；满级 63,000 点 ≈ 25 次长任务）。` / `docs/batches/B31-affinity-balance.md:169: **三锚点复算（同源）**：长任务 2,541 → **Lv.4**（900 ≤ 2,541 < 2,600 ✓）· 存量 3,545 → **Lv.5**（2,600 ≤ 3,545 < 5,000 ✓，保持）· 满级 63,000 ≈ **25 次长任务**（63,000 ÷ 2,541 ≈ 24.8）= 存量 3,545 点的 **≈ 17.8 倍**（63,000 ÷ 3,545 ≈ 17.8）。`

范围外注记（无 severity）：批档 §2.6「未落 / 存疑 ①」（`docs/batches/B31-affinity-balance.md:181`）——`docs/README.md` 地图行「10 级 / 42,000 封顶」待主 agent 侧同步（非本轮在scope 文档；父侧待办，建议随批准一并处理）。

计数：🔴 0 · 🟡 0 · 🔵 0（剩余 0 条；九处速核 9/9 通过）
VERDICT: pass

### 轮次 4（评审子代理）

（**复核轮重跑补记**：本跑对对象声明九处速核按当前文件态逐条复核——①–⑧ = 修正轮 1 八条落点 · ⑨ = 用户裁定 A 顶档重定自洽。范围 = 三份在scope 文档；代码面行数 / 行锚不在范围（设计档自述，unverified）。前一跑超时未签发凭证、其记录见上条；本跑对其全部引文逐字重核，结论一致。）

**结论：九处速核全部通过（9/9）；剩余问题 0 条（🔴 0 · 🟡 0 · 🔵 0）。**

| # | Orig# | File | Severity | Status | Notes |
|---|---|---|---|---|---|
| 1 | 1 | docs/design/PET-AFFINITY.md | 🔴（已消解） | Fixed | 播报谓词入 core 导出（:183）· watcher 消费（:201）· TC-18（:272）· AC-B31-5（:284）= TC-15/16/18 桩测；NFR-26 第三项满足（需求原文未动） |
| 2 | 2 | docs/design/PET-AFFINITY.md | 🟡（已消解） | Fixed | TC-6（:260）62,999 ⇒ level=9 · pointsToNext=63,000 · progress<1（A 案新表同口径） |
| 3 | 3 | docs/design/PET-AFFINITY.md | 🟡（已消解） | Fixed | 乙行两处（:71 / :119）= Lv.5 → Lv.8（跳 3 级）：18,545 ∈ [16,000, 30,000)；甲 Lv.7 / 丙 Lv.9 复算无误 |
| 4 | 4 | docs/design/PET-AFFINITY.md | 🟡（已消解） | Fixed | §2.7（:213）356 −27 ⇒ ≈329 自洽；:219-223 = >300 主动拆分复核（本批不拆 + 两条路径逐条否决 + 消解条件） |
| 5 | 5 | docs/batches/B31-affinity-balance.md | 🟡（已消解） | Fixed | :71 / :96 = 「推荐（待用户追认 / 批准时确认）」；与设计 §2.5 / 需求 US-35 同口径 |
| 6 | 6 | docs/design/PET-AFFINITY.md | 🟡（已消解） | Fixed | applyFoodPurchase 入 core（:184）；TC-10/12/13 桩测真实导出 · TC-14 → 静态核对 + 实机（载体注记 :274）；AC-B31-6（:285）同源更正 |
| 7 | 7 | docs/design/PET-AFFINITY.md | 🔵（已消解） | Fixed | :102 指针拆分校正：「设计期给定值」= NFR-9 / NFR-14；「单一可调数据」= NFR-23 / NFR-24 |
| 8 | 8 | docs/design/PET-AFFINITY.md | 🟡（已消解） | Fixed | :110 = 前期 6/7/9×、后期 52.5×（随 A 案同步；120/20、350/50、900/100、63,000/1,200 逐格一致） |
| 9 | （新 · A 案） | docs/design/PET-AFFINITY.md · docs/requirements/PET.md · docs/batches/B31-affinity-balance.md | — | Verified | 顶档 63,000 = 3,150 万 token ≈ 25 次长任务（24.8）≈ 存量 17.8 倍；Lv.8 / Lv.9 = 16,000 / 30,000；跨度 7,000 / 14,000 / 33,000；三锚点 + 喂食甲/乙/丙 + 补点 59,500 复算全对；历史值（42,000 / 35× / 16.5 次 / 38,500）仅存日志行（§2.6 :181③ 口径，合规） |

本轮 read 逐字引文（file:line: 内容）：
① `docs/design/PET-AFFINITY.md:183: shouldAnnounceLevelUp(before, after) // 播报谓词（NFR-26 第三项）：after > before；满级恒 false ⇒ 零播报` · `docs/design/PET-AFFINITY.md:201:   if (shouldAnnounceLevelUp(before, v.level)) pet.petSay(`好感满满，升到 Lv.${v.level} 啦~`);   // 满级恒 false ⇒ 停播` · `docs/design/PET-AFFINITY.md:272: | TC-18 | US-37 | 正常 | 喂食跨档：bonus=2,599 买鱼（+400 ⇒ 2,999 ⇒ Lv.5） | `shouldAnnounceLevelUp(4,5)`=true（喂食路径升级播报一次；顺序 = `food.msg` 先行） |` · `docs/design/PET-AFFINITY.md:284: | AC-B31-5 | US-37 | 播报谓词 = core 导出纯函数 `shouldAnnounceLevelUp`（level 严格上升）；满级恒 false ⇒ 零播报 | 桩测断言（TC-15/16/18）+ 实机目视 |`
② `docs/design/PET-AFFINITY.md:260: | TC-6 | US-35 | 边界 | points = 62,999 | level=9 · pointsToNext=63,000 · progress<1 |`
③ `docs/design/PET-AFFINITY.md:71: | 2 | 乙：喂食 5× 激进 | 存量 wallet（177💴）一次买 5 鱼 = +15,000 点 ⇒ 等级 **Lv.5 → Lv.8** 一次性跳 3 级 | 跳级感接近本批要修的症状本身；且与「汇率本就正确（2×）」的实测结论相左 | **否决** |` · `docs/design/PET-AFFINITY.md:119: | 2 | 乙：喂食 = 被动 5× | 10,000 | 鱼 30💴/+3,000 · 蛋糕 60💴/+6,000 · 奶茶 90💴/+9,000 | 100 点/💴 = 5 倍 | 5 鱼 = +15,000 ⇒ Lv.5 → **Lv.8**（跳 3 级） | 否决——跳级观感接近本批要修的症状 |`
④ `docs/design/PET-AFFINITY.md:213: | `shell-affinity.js` | 356 | **≈ −27 ⇒ ≈329** | 修改 | 常量迁出 · `affinityView` 收缩 · 播报改升级播报（watcher + buy，调 core 谓词）· 购买校验迁 core（`applyFoodPurchase`） |` · `docs/design/PET-AFFINITY.md:219: **拆分复核（>300 档主动复核；结论 = 本批不拆）**：`shell-affinity.js` 改后 ≈329 行（356 −27；原估算 −45 偏乐观，本轮按实际代码逐段重算）——纯化面已迁净（常量 / 视图 / 谓词 / 购买校验），残面全部绑定 electron（窗口 / dialog）、fs（数据读写 / token 读面）与定时器（watcher），不可再纯化。`
⑤ `docs/batches/B31-affinity-balance.md:71: - 设计落点：`docs/design/PET-AFFINITY.md`（新建——B31 起立档，好感度数值体系唯一权威源；U-1…U-3 候选与推荐（**待用户追认 / 批准时确认**）见设计档 §2.2 / §2.3 / §2.5）。` · `docs/batches/B31-affinity-balance.md:96: - **老数据迁移（U-3 推荐 ① 接受重映射，待用户追认 / 批准时确认；设计档 §2.5）**：不迁移、零转换写入——老数据等级按新表直接重映射（存量 3,545 点 → Lv.5；wallet 折 177💴，购买力按新价同价重定）；候选 ② 只对新积累生效（双标尺永久混存）与 ③ 冻结补偿（补点保级）**均否决**。`
⑥ `docs/design/PET-AFFINITY.md:184: applyFoodPurchase(state, foodId)     // 购买校验与状态转移（现 :325-331 纯化）` · `docs/design/PET-AFFINITY.md:285: | AC-B31-6 | NFR-26 | 语义零回退：兑换只减 wallet 不动 usage；bonus / usage / 点数只增不减 | 桩测断言（TC-10/12/13——购买校验纯化面）+ 静态核对（`:314-322` 兑换 handler 零改动）+ 实机目视（TC-14） |`
⑦ `docs/design/PET-AFFINITY.md:102: - **标定状态**：本表 = 设计期给定值（按用户实机数据定标）；**单一可调数据**（一行 10 个数字），用户审后如再调只改 `affinity-core.js` 一处。「设计期给定值」措辞承 NFR-9 / NFR-14 口径；「单一可调数据」承 NFR-23 / NFR-24 口径。`
⑧ `docs/design/PET-AFFINITY.md:110: | 3 | **甲：分段加速曲线（选定）** | 前期 6/7/9× 旧表（Lv.2–4）、后期拉开到 52.5×（Lv.10）——同口径 vs 旧表；三锚点全部命中（长任务 → Lv.4 / 存量 → Lv.5 / 满级 ≈ 25 次长任务） | 选定——前期可感 + 后期有分量，锚点实测校验 |`
⑨ `docs/design/PET-AFFINITY.md:91: | Lv.10 | 1,200 | **63,000** | 31,500,000 | 33,000 |` · `docs/design/PET-AFFINITY.md:99: - **满级 = 长期深度使用顶点**：封顶 63,000 点 = 3,150 万 token ≈ **25 次长任务** ≈ 用户当前总量（177 万）的 **17.8 倍**。` · `docs/requirements/PET.md:364: - 口径：阈值表 = 10 档**单一可调常量表**（`affinity-core.js`；完整对照与总量级理由见设计档 §2.2）——定标依据 = 用户实机数据（一次长任务 ≈127 万 token ⇒ 新 Lv.4；存量 3,545 点 ⇒ 新 Lv.5；满级 63,000 点 ≈ 25 次长任务）。` · `docs/batches/B31-affinity-balance.md:169: **三锚点复算（同源）**：长任务 2,541 → **Lv.4**（900 ≤ 2,541 < 2,600 ✓）· 存量 3,545 → **Lv.5**（2,600 ≤ 3,545 < 5,000 ✓，保持）· 满级 63,000 ≈ **25 次长任务**（63,000 ÷ 2,541 ≈ 24.8）= 存量 3,545 点的 **≈ 17.8 倍**（63,000 ÷ 3,545 ≈ 17.8）。`

范围外注记（无 severity）：① `docs/README.md` 地图行「10 级 / 42,000 封顶」待主 agent 侧同步（批档 §2.6 :181①；非本轮在scope 文档）；② 本跑消息的说明段与 Agent Response 段混入 B25 面（与 B31 裁决对象无关）——按对象声明与 Documents to Review（B31 三档）执行。

计数：🔴 0 · 🟡 0 · 🔵 0（剩余 0 条；九处速核 9/9 通过）
VERDICT: pass

### 轮次 5（评审子代理）

**复核轮 2（缩水面：九处速核；仅两档在评审面）**

九处速核全过：① :183 导出 + :201 消费 + TC-18 :272 + AC-B31-5 :284 齐；② TC-6 :260（62,999 → Lv.9 · next 63,000）与新表自洽；③ 乙 :71/:119 复算 3,545+15,000=18,545 ⇒ Lv.8（跳 3 级）✓；④ :213/:219-223 = 356−27≈329 且 >300 主动拆分复核在（两条路径逐条否决 + 消解条件）；⑤ applyFoodPurchase :184/:274/:285 齐；⑥ :102 指针（NFR-9/14 · NFR-23/24）与两档用词一致；⑦ :110 前期 6/7/9×（120/20 · 350/50 · 900/100）· 上界 52.5×（63,000/1,200）✓；⑧ A 案三锚点 :86-91/:93-94/:99/:101 = 2,541→Lv.4 · 3,545→Lv.5 · 63,000≈25 次（=3,150 万 token ≈ 17.8× 存量）与 PET.md:364 逐字一致；⑨ PET.md:360-370 / :595-605 与设计数字一致，NFR-26 三项纯函数（等级判定 / 视图组装 / 播报谓词）= levelForPoints / buildAffinityView / shouldAnnounceLevelUp 已列于 :180-183。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | 一致性（速核 ①–⑨） | 🔵 | 九处速核全部核对通过，未发现设计↔需求数字矛盾 | 无需动作 |
| 2 | 文档状态（R7a） | 🟡 | PET.md:553 NFR-21 枚举「US-1…US-23 与 NFR-1…NFR-17 保持成立」，但同条子项 :554-556 列有 US-24 / US-26（超出该范围）、US-29 / US-31，且当前计数 = US 37 / NFR 26——枚举范围与自身子项不自洽（先存滞后，非 B31 引入；B31 §2.9 只承诺「计数 13 处不动」） | 父侧文档层裁定：范围句同步或加 as-of 限定；按 R7a/R7e 报告不阻塞 |
| 3 | 清晰度 | 🔵 | PET-AFFINITY.md:196「:175-196 watcher **逐字不变**」与紧随的「:186-189 点播段改为**升级播报**」表面相抵（限定词「delta 与基线逻辑零改动」在括号内） | 建议补限定「除 :186-189 播报段外」——实现者口径更稳 |
| 4 | 行数标注（速核 ④ 的值） | 🔵 | §2.7 代码面行数 / 行锚（shell-affinity.js 356 · exchange.js 105 · pet.js 240 · package.json 140）按本评审宣告标 **unverified**（评审面限两档，不读代码；表内算术 356−27=329 自洽、>300 拆分复核在） | 父侧收口轮可随手核对 |

**计数：🔴 0 / 🟡 1 / 🔵 3**

VERDICT: pass

## §4 评审裁决与实施启动（主 agent）

**评审轮次与裁决（1–5 轮）**：轮 1 = changes-required（🔴1 / 🟡5 / 🔵3 ⇒ **八条全修**）→ 轮 2 / 轮 3 = 复核（逐条收敛）→ **用户裁定 A（顶档重定）**：10 级不变 + 阈值表重定（顶档 = **63,000**，需覆盖「一次长任务不直接满级」✗）→ 轮 4 / 轮 5（复核）= **pass**（🔴0 / 🟡1 已挂 B14 / 🔵3 非阻断）。

**用户批准（2026-09-19，原话「可以办了；都批准」）** ⇒ 实施启动（凭证 = 轮 5 pass 签发 ✓；派轮 = eng-coder ✓）。

**实施打回与裁决（2026-09-19 · 实现期同源设计缺陷）**：实施轮 1 = **停报（blocked，未落任何文件）**——勘察实测：设计 §2.6 要求 `shell-affinity.js` 新 `require('./affinity-core.js')` ⇒ 静态出度 3 → **4**，与门禁判据 **D②（域模块 ≤3）** 相抵 ⇒ 与 **AC-B31-9（lint 全绿）** 不可能同时成立（证据链见 §5.1 ✓）。

**裁决 = 路径①（本仓 sanctioned 形态）**：`affinity-core.js` 经 **`main.js` 的 `init(deps)` 注入**（fanout 保 3 ✓；判据句先例 = 台账 T45「超出者走 `init(deps)` 注入而非 `require`」）；
连带面 = 设计 §2.6 / §2.7（`main.js` 移出冻结面 ⇒ 允许**恰 1 处**注入装配）/ §2.9（补 D② 行）/ AC-B31-10 / §2.8 文件表（+ `main.js` + `baseline.json` 的 `assemblyExempt` +1 ✓）——**设计修订轮在跑**（eng-designer）。

**性质** = 实现期发现的**同源设计缺陷修正**（评审 / 裁决直接导出 ⇒ 不夹带新语义：数值 / 行为 / 文案零变）⇒ 按锚#3「修正轮 docs FIRST」复用**同一凭证**（链未终态），**不重开用户批准**。

**重派序**：修订落档并经父侧核验 ⇒ 重派实施；`files` 含 `main.js` ⇒ 由调度器排在 B30 轮之后（域冲突自动排队，不手工串行）。

---

## §5 实施记录（eng-coder）

<!-- 由 eng-coder 填 -->

---

### 5.1 实施轮 1（2026-09-19 · eng-coder）——停报（blocked）：未落任何文件

**终态**：勘察阶段实测发现**设计档 ↔ 门禁判据 D② 冲突**（设计档 §2.9 冲突核对清单未覆盖本项）⇒ 按任务书「实现与设计不符 ⇒ 停下报告」打回；本批**零代码 / 交付档写入**（仅本 §5 记录经 `batch_segment` 落档；`git status` 可核）。

**冲突（实测证据）**：

- 设计侧：`docs/design/PET-AFFINITY.md:194`（§2.6 消费面）= `shell-affinity.js` 增 `require('./affinity-core.js')`。
- 判据侧：`docs/CONVENTIONS.md:118` D② = 域模块静态相对 require 出度 **≤3**；`shell-affinity.js:9-11` 现有 3 条（backend · notify · assets）⇒ 加 core 后 = **4**。
- 复算（直调 `scripts/gates/lib.js#requireTargets` + `checks.js#compareBaseline`）：4 档全列，判 `{kind:'new'}` ⇒ `npm run lint` 必红（预期行 `VIOLATION fanout new shell-affinity.js :: current=4`）⇒ 与 **AC-B31-9（lint 全绿）**相抵。
- 就地解不可行：基线契约（`docs/design/REPO-CONVENTIONS.md` §A.2.2.6）规则 1 + `expires.hardRule` = 「不得用于冻结任何**新增**违规」⇒ 给 `shell-affinity.js` 加基线条目被禁。
- 本仓 sanctioned 形态 = `init(deps)` 注入（`docs/TODO.md:62` T45 判据），但注入面 = `main.js` ∈ 设计 §2.7 冻结面（`PET-AFFINITY.md:225`）+ AC-B31-10 ⇒ 两条路均须**设计层裁定**。

**独立事实（非本批成因，影响 AC-B31-9 取证）**：`npm run lint` 现树已红——`docs/batches/B27-pet-feel-2.md`（1 行 >300）· `docs/batches/B28-plugin-fixes.md`（5 行 >300）为基线未登记的新增超宽 ⇒ 本树「lint 全绿」不可达；处置面不属本批 file 域。

**建议（待主 agent 裁定）**：

- ①（推荐 · sanctioned 形态）：`affinity-core.js` 经 `main.js` 的 `init(deps)` **注入** `shell-affinity.js`（fanout 保 3）；连带 = 设计 §2.6 / §2.7 / §2.9 / AC-B31-10 修订 + `main.js` 解冻 + `baseline.json` 的 `assemblyExempt` +1 条（D③ 免检机制：无 `init` 导出档，非违规冻结）。
- ② 用户裁定修订基线契约以允许冻结本条新增违规——今日被 `hardRule` 明确禁止，不推荐。

**未落 / 存疑**：设计档 §2.9 缺 D② 行（本次打回的直接成因）；`docs/README.md` 地图行「10 级 / 42,000 封顶」待父侧同步（设计档 §2.6 :181 ① 已登记）。重派后另起 5.2。

### 5.2 实施轮 2（2026-09-19 · eng-coder）——全落（父侧裁决路径①形态）

**交付摘要**：I1–I4 全落（阈值表 63,000 / 喂食 2× + EXCHANGE_RATE 10,000 / 满级分支 + 播报收敛 / core 抽取 + init(deps) 注入形态）。
改动面 = 设计 §2.7 六档 + 清单外 2 档 + 载具（gitignored）：`affinity-core.js`（新，109 行）· `shell-affinity.js` 356 → **334**（+24 / −46）· `main.js` 262（净 +1；**恰 1 处注入装配** = `:41` require 绑定 + `:116` deps 增 `affinityCore` 键）·
`exchange.js:22`（+1/−1）· `pet.js:184`（+1/−1）· `package.json` `build.files` +1（`:58`）· `scripts/gates/baseline.json` `assemblyExempt` +1（`:32`）· *清单外*：`scripts/gates/selftest.js`（TC-12 计数 15→16 + 断言锐化）· `scripts/gates/run.js:112`（注释计数同步）；
开发期载具 `.thincoder/b31-affinity-stub.mjs`（桩测）+ `.thincoder/b31-verify.mjs`（静态核验，非交付物）。

**决策透明表（实施期）**

| # | 决策 | 理由 | 备选与否决 |
|---|---|---|---|
| 1 | `handleAffinityExchange` 三处常量引用 → `affinityCore.EXCHANGE_RATE`（`shell-affinity.js:292-294`） | 常量已核心化（设计 §2.6），壳档本地无 `EXCHANGE_RATE`；形态权威 = 本档 §2.7 `:196`「消费面调用改 `affinityCore.` 前缀」；语义逐字保留（wallet 减 · usage 不动 · 消息模板同形） | init 期把 core 常量拷入壳档本地绑定（保字面「零改动」）——双源镜像、违 NFR-26「一处定义」，否决 |
| 2 | `handleAffinityBuy` 返回 `view: v`（`:317`）复用播报判据同一次 `affinityView()` | 同一快照、契约形状 `{ok,message,view}` 逐字不变 | 返回处重调 `affinityView()`（字面更贴原行；值相同、多一次构造）——不采纳 |
| 3 | 门禁计数同步 2 档（selftest.js TC-12 / run.js 注释） | `assemblyExempt` +1（设计 §2.9 已登记）⇒ 绑定面 15→16、免检 2→3；TC-12 为现状锚，不同步 ⇒ `selftest-failed` 退 2 ⇒ AC-B31-9 不可达（必要机械连带，审计独立复核 = 必要且最小） | 不同步（lint 必红）/ 绕门禁（偏离 sanctioned 形态）——均否决 |
| 4 | `affinity-core.js:53` progress 加下界钳制 `Math.max(0, …)` | advisor 🔵#5 加固：`pet.js:180` 宣称 progress(0~1)；负 points 仅可来自损坏 affinity.json（`shell-affinity.js:50` 不拦负数）；不可达路径、零可达语义变化 | 维持迁移原式——契约不闭合，不采纳 |

**审计与代码评审轮次与终态**

- **内嵌发散审计（read-only explore，1 轮）**：PARTIAL 0 · SILENT-SIMPLIFICATION 0 · OUT-OF-LIST 3（selftest.js / run.js = 独立核算「必要且最小」；b31-verify.mjs = 开发期载具登记）· DOC-DRIFT 5（1 🟡 = PET.md:602 NFR-26 滞后；余 🔵）⇒ 终态 = deviations（无 🔴）。
- **advisor 代码评审（1 轮）**：**VERDICT: pass**（🔴 0 / 🟡 3 / 🔵 2）。🟡 = 文档层三项：① PET.md:602 NFR-26 仍列 `main.js` 零 diff（vs 设计 §2.7 修订注记 :230）；② 设计档 :204/:282/:293「兑换 handler 零改动」与常量迁出字面互斥（应改「除 `EXCHANGE_RATE` 改指 `affinityCore.` 外逐字不变」）；③ §2.7 清单 + AC-B31-10 未登记清单外 2 档。🔵 = TC-12 聚合断言灵敏度 / progress 下界。
- **fix round（1 轮）**：🔵×2 已落——`selftest.js:270` 断言锐化（`res.ok === 13 && ok === 16`）；`affinity-core.js:53` 钳制。🟡×3 = 文档层、不在 eng-coder 写域 ⇒ 父侧 / eng-designer 收口。**终态 = clean**（代码面发现零未修；残余 = 文档层报告项 + 别批在飞面）。

**六项自证（原始结果行）**

1. **静态判据**：`shell-affinity.js` 静态相对 require 出度 = **3**（backend / notify / assets；core 经注入 ✓ D②）；D③ = **13/13** + 免检 **3**（settings / ipc / affinityCore，零违规、无 stale）；DAG = 0 环；本批档 0 行 >300；行数全 ≤500（基线直调 `scripts/gates/{lib,checks}.js`，`node .thincoder/b31-verify.mjs` 亲跑）。
2. **桩测**：`node .thincoder/b31-affinity-stub.mjs` → 末行 `61/61 PASS`（TC-1…13 / TC-15…18 装载真实 `affinity-core.js`；含 AC-B31-1/2/3/4/5/7 机检面；TC-14 = 静态核对 + 实机目视，不在载具面）。
3. **门禁三连**（原始行）：`GATE test:full PASS pass=51 fail=0 skipped=0 ms=1104` · `GATE test:integration PASS scenarios=3 pass=3 fail=0`；
   `npm run lint` = **FAIL**（唯一违规 = `docs/batches/B30-notify-followup.md` §4 :170 —— 别批在飞，见「未落 / 存疑 ①」；
   本批面全 PASS：syntax 64 / lines PASS / dag PASS / fanout PASS / assembly 13/13 + exempt 3 / samples PASS / selftest 20/20）。
   **09:10（B30 收口轮写入前）曾全绿：`GATE lint PASS checks=7 selftest=20/20`**。
4. **零回退面**：冻结面 10 档未触碰（mtime ≤ 07:13 < 本轮写入窗 09:04–09:12；`git status` 面他档脏面为别批既往）；`main.js` 允许面 = 恰 1 处注入装配 ✓。
5. **行数与形态实测**：core 109 · shell-affinity 334 · main 262 · exchange 105 · pet 240 · package.json 141 · baseline 39；全档 CRLF 无混行、0 行 >300。
6. **设计符合性核对**：阈值 / 食品 / 汇率逐值（core `:15/:19-23/:13`）· `maxed`/`pointsToNext='MAX'`/`progress=1`（`:50-57`）· 谓词两消费路径（`shell-affinity.js:160/165-166`、`:302/314-315`）· 首用回填与 delta 基线逻辑逐字保留（`:146-152`/`:155-169`）· 吃播状态机逐字（`:309-312`）· core 导出 10 项 + 双环境尾巴。

**未落 / 存疑（如实登记）**

1. **lint 收口时点 = FAIL（别批在飞面）**：唯一违规 = `docs/batches/B30-notify-followup.md` §4 :170（321 字符，mtime 09:11 与本轮重叠，父侧 B30 收口轮写入）——非本轮 file 域、不越域代修；建议父侧拆行（同 B31 §4 :355 早先处置）。本批写域面全绿（含 selftest 20/20）。
2. **文档层三项（advisor 🟡×3，待父侧 / eng-designer）**：① `PET.md:602` NFR-26「`main.js` 零 diff」句待补 carve-out / 修订注记（或裁定 NFR-21 计数同步）；② 设计档 `:204`/`:282`/`:293`「兑换 handler 零改动」措辞待改「除 `EXCHANGE_RATE` 改指 `affinityCore.` 外逐字不变」；③ 设计 §2.7 清单 + AC-B31-10 补登记清单外 2 档。
3. **清单外改动 2 档（已登记）**：`scripts/gates/selftest.js` / `scripts/gates/run.js`（计数同步，必要且最小，见决策表 #3）。
4. **静态占位面（供父侧裁定）**：`exchange.html:45`「1000 token = 1💴」与 `pet.html:117`「Lv.1 好感 0」——JS 渲染覆盖、刷新失败时可见旧值；不在设计 §2.7 改动面。`docs/CONVENTIONS.md:119/:122` 与 `docs/design/REPO-CONVENTIONS.md:427/:439` 的现状数（15 条 / 免检 2 档）随本轮 +1 后待同步（判据句本体未动）。
5. **行数估算偏差（如实）**：shell-affinity 实测 334（设计估算 ≈330）· exchange.js 105→105（估算 +1）· pet.js 240→240（估算 +2）；均 ≤500、拆分复核结论不受影响。
6. **真机目视项未执行**：AC-B31-7/8 实机面与 TC-14 实机目视（兑换屋兑换一次 + 满级显示 + 升级播报）归用户 / 父侧实机轮；`docs/README.md` 地图行已实测为「10 级 / 63,000 封顶」（§2.6 ① 挂账项已消解）。
7. **仓库根 0 字节垃圾档 `'`**（untracked，早于本轮写入窗）——别项，供父侧随手清理。

**形态补正（实施轮 2 · 实时）**：本节 2 行（交付摘要行 631 字符 · 门禁三连项行 414 字符）初稿超 300 字符，已就地拆分（逐字保留、仅换行）；依据 = `docs/CONVENTIONS.md` §五 行宽判据（批次档豁免面仅限 §3）。

## §6 验收核销（主 agent）

**核销（2026-09-19）**——B31 全链 = 设计（评审 1 changes-required → 修正 → 复核轮 2 pass → **用户裁定 A 顶档重定** → 用户批准）→ 实施轮 1 = **停报**（D② fanout 冲突，证据链见 §5.1）
→ **父侧裁决路径①**（`init(deps)` 注入）→ **设计修订轮**（六项全落 ✓）→ 实施轮 2（I1–I4 全落：`affinity-core.js` 新 **109** 行 · `shell-affinity.js` 356 → **334** · `main.js` 262（净 +1，恰 1 处装配）
· `exchange.js` / `pet.js` 满级 `MAX` · `package.json` +1 · `baseline.json` 免检 +1）→ **用户实机验收**（2026-09-19：重启后 **Lv.5**（旧 10 级按新标尺重映射 ✓）· **喂食数值 = 设计一致** ✓ · 喂后**升到 Lv.6** ✓）→ 本节核销。

**验收证据链**：

| 面 | 证据（可复核） |
|---|---|
| 阈值表 | `[0,120,350,900,2600,5000,9000,16000,30000,63000]`（core `:15` ✓）；三锚点（2,541 → Lv.4 / 3,545 → Lv.5 / 63,000 → Lv.10）+ 存量零迁移 ✓（桩测 TC-1…4 / 7 ✓） |
| 喂食 2× | 10/20/30💴 → +400/+800/+1,200 ✓（TC-10…13 ✓）；**用户实机喂养数值一致** ✓ |
| 满级分支 | `pointsToNext='MAX'` / `maxed` / 播报恒 false ✓（TC-8/9/15/16/18 ✓）；两显示面（`exchange.js:22` / `pet.js:184`）✓ |
| 核心抽取 | D② 出度 = **3** ✓（注入形态）；D③ 13/13 + 免检 3 ✓；`main.js` 恰 1 处装配 ✓；冻结面零 diff ✓ |
| 门禁 | `lint PASS` ✓ · `test:full` 51 ✓ · `test:integration` 3 ✓；桩测 **61/61** ✓ |
| 用户实机 | **Lv.5 → 喂食 → Lv.6** ✓（升级播报面 ✓） |

**测试面处置（① 寿命判）**：`.thincoder/b31-affinity-stub.mjs`（61/61）+ `.thincoder/b31-verify.mjs` = **退役**（开发期工具、不入仓 ✓）。

**收口轮（文档折账）**：五件（`PET.md` NFR-26 口径 / 设计三处「零改动」措辞 / §2.7 + AC-B31-10 清单外 2 档登记 / `CONVENTIONS` + `REPO-CONVENTIONS` 现状数 16 · 3 / 变更记录）= **微轮 #6 已落地并经父侧核验** ✓（2026-09-19；关键落点逐条核验：`docs/requirements/PET.md:602-603` · `docs/design/PET-AFFINITY.md:204/:287/:298` · `docs/CONVENTIONS.md:119/:122-123` · `docs/design/REPO-CONVENTIONS.md:425/:427/:439`）；其披露的 3 处残留已转 **T55** ✓。

**台账**：**T48 / T49 → 已核销**（逐条移入 `docs/TODO-archive.md`）✓；地图 B31 行 / `docs/design/PET-AFFINITY.md` 行 → 「已收口 + 核销 / 生效」✓。