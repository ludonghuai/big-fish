# B08 —— 内置 Harness bundle 版本收口

> 六段制批次档（每段一位作者、append-only）：§1 主 agent · §2 eng-designer · §3 评审子代理 · §4 主 agent · §5 eng-coder · §6 主 agent。

## §1 批次立案（主 agent）

### 1.1 立案背景

本仓打包版首次启动时走**内置 bundle** `dsh-bundle/`，其钉版为 `@deepseek-ai/dsh@0.1.0-rc.6`（`dsh-bundle/package.json:7`，2026-09-10 起），而注册表最新为 **`0.1.5-rc.1`**——**落后 5 个 rc**。后果面：

- 打包版首启（尚无活跃指针时）跑的是 5 个 rc 之前的后端；
- 该版本**无会话鉴权**（不打印 `?token=`），与 B07 建立的「主窗口加载后端打印地址」契约存在**版本差**——B07 的降级判据（诊断行 `token=no`）覆盖了它，但这条路径此前从未被显式验收；
- 0.1.5 的插件/市场面差异未被本仓固定。

### 1.2 任务来源

- 台账技术待办 **T10**（`docs/TODO.md` 技术组）：原条目后半段「dev 的 `dshBinPath()` 固定走 bundle ⇒ harness 自更新在 dev 不生效」**已被 B06 F5 覆盖并实测生效**，本批只承载**前半段 = bundle 钉版落后**。
- 用户 2026-09-17 授权：「**你安排，把我们的工作全部继续推进起来**」——由主 agent 排期立批。

### 1.3 前置核查（主 agent 2026-09-17 实测，供设计直接引用）

| # | 核查点 | 结论 | 证据 |
|---|---|---|---|
| ① | `--no-open` 在钉版 `0.1.0-rc.6` 是否支持 | **支持** ⇒ B07 收编 `--no-open` 对打包版**无回归** | `dsh-bundle/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-app/lib/{startup.js,index.js}` 各命中 1 处 |
| ② | 钉版是否打印 `?token=` | **不打印**（bundle 全树 `token=` 命中 **0**）⇒ 该版本无会话鉴权 | 同上全树扫描（1121 个 js 文件） |
| ③ | 壳侧对「无 token 后端」的处置 | 捕获链按原文采用该地址，诊断行报 `token=no`，窗口仍可加载 ⇒ **降级路径成立**（设计需把该判据写成可机检项） | `shell-backend.js:153-155`（回环 + 端口校验 ⇒ 采用）+ `:155`（`token=yes|no` 诊断） |
| ④ | 活跃指针是否让 dev 与打包同口径 | **是**（B06 F5 后）⇒ 升级 bundle 后打包版同样吃活跃指针 | `shell-backend.js:52`（活跃指针优先）+ `updater.log` 2026-09-17（dev 侧 0.1.0-rc.6 → 0.1.5-rc.1 激活 ok=1） |

### 1.4 范围（含边界）

**做**：

- `dsh-bundle/package.json` 的钉版升级（**保持精确钉版**——不引入 `^` / `~` / `latest`），`dsh-bundle/package-lock.json` 同步；
- 钉版的可复现性：升级动作须有可重放步骤与判据（何版本、依据何来源）；
- 「无 token 后端（`0.1.0-rc.6` 场景）」与「有 token 后端（`0.1.5-rc.1`）」**双态**的验收判据；
- dev / 打包 **双态冒烟**口径（哪一步可本地闭环、哪一步只可真机，写清）。

**不做（出批或明确排除）**：

- 不引入「随更新自动升级 bundle」之类新机制；
- 不动插件市场 / 更新编排逻辑（除钉版与锁文件所必需）；
- 不把 `node-runtime/` 平台二进制入库（既有口径）。

### 1.5 待决与风险（交给设计与用户的点）

- **锁文件体量**：bundle 的 `package-lock.json` 是否随仓（现状）；升级后其体量与 diff 规模需在设计里给出，避免「看不见的巨大改动」。
- **降级判据的归属**：`token=no` 路径属 B07 建立的机制，本批只做**验收固定**还是需一并加文档注（设计的判断）。
- **真机面**：打包产物冒烟（`npm run dist:win` 成本高）是否本批必需——若不可闭环，如实列入出批项，不得伪报。

### 1.6 验收标准（初拟，供设计细化并回指需求条目）

| # | 验收标准（可机检） |
|---|---|
| AC1 | `dsh-bundle/package.json` 钉版 = 目标版本且为**精确钉版**；锁文件与之自洽（`npm ci` 或等价校验通过） |
| AC2 | 打包版（bundled）首启后端正常启动、`--no-open` 生效（日志无 `opening the default browser`） |
| AC3 | dev 与打包**同口径**（活跃指针优先；bundle 回落路径不被破坏） |
| AC4 | 「无 token 后端」场景的壳侧降级路径有可机检判据（诊断行 `token=no` + 窗口可加载） |
| AC5 | 零新依赖 / 零新构建步骤 / `node --check` 全绿 |

### 1.7 关联

- 需求档：`docs/requirements/UPDATE.md`（由 eng-designer 判定是否需要新增/修订条目）
- 设计档：`docs/design/AUTO-UPDATE.md` §2.2.1（路径口径）等
- 台账：T10（本批承载）；T11（发版剩手动步，与本批无文件依赖但发布顺序相关）

### 1.8 用户澄清（2026-09-17，需求口径——优先级高于 1.1 的措辞）

> 用户原话：「他那个版本你知道是怎么个情况吗？我的本意是**离线版是第一次下载的**，我们就设计成**当前最新版本**，后续用户下载了之后**如果有更新就可以继续更新**，我也可**更新离线版**」

据此确定本批的**需求口径**（三条，缺一不可）：

1. **离线版（内置 bundle）= 构建/发版时刻的当前最新** —— 它服务于「首次下载、尚未更新过」的用户，因此不得是一个长期落后的钉版；
2. **用户侧更新**走**既有通道**（harness npm latest → 活跃指针 → 重启生效），本批不改该通道；
3. **维护者可刷新离线版** —— 必须存在一条**可重复的刷新路径**（脚本或明确的发布步骤 + 判定），且刷新后**钉版仍为精确钉版**（1.4 的纪律不变）。

**对本批范围的影响（覆盖 1.4 / 1.5 的判定）**：

- 本批**不止于一次性手改钉版**——「刷新路径」属本批范围（形态由设计定：可执行脚本 / 发布步骤 + 检查）；
- 设计须回答：**如何防止再次腐烂**（例：刷新步骤可复现、有判定可查、或在发版清单里挂钩）；
- 若「刷新路径」的实现超出本批可闭环范围（如需要网络/发布流程配合），设计须**明确标出批项**，不得以「文档写一段」充数。

---

## §2 本批任务书（eng-designer）

### 2.0 任务书依据

- **立案依据**：本批次档 §1（背景 §1.1 / 范围 §1.4 / 待决 §1.5 / 初拟验收 §1.6 / 用户口径 §1.8）。
- **设计依据**：`docs/design/AUTO-UPDATE.md` §2.1（选型 I）· §2.2.1（模块行）· **§2.2.10（B08 契约：钉版形态 / 刷新路径 / 防复发 / 有序要求）** · §2.3（B08 文件子表 + 锁文件 diff 量级块）· §2.4（DD-23 / DD-24 / DD-25）· §2.5（C15–C17 · L11 · L12）· §2.6（U-16）· §3.1（AC16–AC21 + 注 B08-1…B08-5）· §3.2（TC-35–TC-43）· §3.3（手段 9 / 10 + 「本批不闭环项」块）。
- **需求依据**：`docs/requirements/UPDATE.md` US-11（`:111`）· US-12（`:120`）· NFR-5（`:165`）。
- **本批条目（唯一来源）** = **AC16 / AC17 / AC18 / AC19 / AC20 / AC21**（清单 = §2.2 表，与需求档、设计档逐行对齐）。
- **编号对照**：§1.6 初拟 AC1…AC5 依次对应 §3.1 的 AC16…AC20；AC21（刷新路径三面）为 US-12 落档后新增，§1.6 无对应初拟项。

### 2.1 口径（实施者照此执行，不得改写）

1. **钉版口径**：离线版钉版 = 刷新时刻注册表 `latest` dist-tag（不追 `next` / `alpha`；与 US-6 / DD-5 同口径）。写入 `dsh-bundle/package.json` 的 `dependencies['@deepseek-ai/dsh']`，形态必须为**精确版本串**——禁 `^` / `~` / `*` / `latest`。
2. **锁文件口径**：`dsh-bundle/package-lock.json` 继续随仓（DD-25），由刷新第 ④ 步的 `npm install --omit=dev --save-exact --no-audit --no-fund` 同步重写；验收按结构性判据（钉版自洽 + 形态检查 + 等价校验），**不逐行读 diff**。
3. **刷新路径口径**：新增 `scripts/refresh-dsh-bundle.js`（维护侧，纯 Node 无 Electron，不进 `build.files`），入口 = 根 `package.json` 的 `scripts` 两行：`bundle:refresh`（默认刷新）/ `bundle:check`（只读判定）。
4. **退出码语义**：`0` = 已最新；`1` = 落后；`2` = 取版本失败或刷新失败。摘要行恒在场：`bundle refresh pin=<old> -> <new> tag=<tag> registry=<source> lock=<bytes>`。
5. **用户侧通道不动**：本批不改 Harness 自更新链（`latest` 检查 → 装 userData → 活跃指针 → 重启生效；设计 §2.2.4 全文不变）。

### 2.2 三方条目一致表（§2 本批条目 = 需求档条目 = 设计档验收回指；advisor #1 / #6 依此判）

| §2 本批条目 | 需求档条目 | 设计档验收回指（§3.1） | 设计档用例（§3.2） | 判定强度 |
|---|---|---|---|---|
| AC16 | US-11 · US-12 · NFR-5 | AC16 + 注 B08-1 | TC-36 · TC-42 | 机检 |
| AC17 | US-11 | AC17 + 注 B08-2 | TC-41（打包面 TC-43 = 出批） | 半机检（日志机检 + 窗口目视） |
| AC18 | US-11 · NFR-5 | AC18 + 注 B08-3 | 静态 diff + 隔离 userData 实跑（并入 TC-41） | 机检 |
| AC19 | US-11（触发场景；判据权威源 = `docs/requirements/SHELL.md` §三 US-9） | AC19 + 注 B08-4 | TC-40 | 机检（日志行） |
| AC20 | NFR-5 · US-12 | AC20 | 静态核对 + `node --check` | 机检 |
| AC21 | US-12 | AC21 + 注 B08-5 | TC-35 · TC-37 · TC-38 · TC-39 | 机检 |

### 2.3 范围

**做**（与设计 §2.2.10 / §2.3 一致）：

- 新增 `scripts/refresh-dsh-bundle.js`（刷新 + `--check` 只读判定；契约 = 设计 §2.2.10）；
- 根 `package.json` 增 `bundle:refresh` / `bundle:check` 两行 scripts；
- 执行一次刷新：钉版 → 刷新所得精确 `latest`，锁文件同步重写（diff 预估 1000–2500 行）；
- 双态验收取证：**升级前**取态 B（无 token 后端，AC19）→ **升级后**取态 A（有 token 后端，AC17 / AC19）。

**不做（明确排除）**：

- 不改任何应用运行时代码（`.js` 零改动；本批唯一新增 `.js` = 维护侧脚本，不进 `build.files`）；
- 不引入自动刷新（不挂构建钩子 / 发布脚本 / 启动路径）；
- 不新增 `tests/` 文件（判据 = 设计 §3.3 手段 9 三条）；
- 不改用户侧 Harness 更新通道（设计 §2.2.4 全文不变）。

**出批项（本批不闭环；须在实施报告与批次档 §5 如实登记，不得伪报）**：

1. 打包态（`npm run dist:win`）首启双态冒烟（TC-43 / AC17 打包面）：成本高（electron-builder + NSIS）。替代证据 = dev 同源（同一内置树 + 同一壳代码）+ 现存 `dist/win-unpacked/` 旁证；局限已写明（注 B08-2：旧壳修订，诊断行形态不同，产出不了 HEAD 判据）。
2. `cd dsh-bundle && npm ci` 全量复现（重建 node_modules，分钟级 + 下载量）：替代 = 轻量自洽校验（TC-42）；是否补跑强证据由用户收口时决定。
3. 把 `bundle:check` 挂进「App 发版流程清单」：需发版流程文档，本仓当前没有（`docs/TODO.md` 技术待办 T5 即该缺口；写权属主 agent）。

### 2.4 有序实施步骤（按序执行；每步独立可回滚；步骤 0 的时序不可调换）

| # | 步骤 | 验证命令 / 判据 | 回滚 |
|---|---|---|---|
| 0 | **前置取证（必须早于步骤 3 落笔）**：dev + 隔离 userData + 隔离 `DSH_HOME` 启动，取态 B 基线 | `npx electron . --user-data-dir=<repo>\.test-userdata-b08` → `<隔离 userData>\bigfish.log` 含 `backend web url captured port=<n> token=no`（TC-40 / AC19）；窗口非 401 文本页、非空页 | 无需（零写入） |
| 1 | 新增 `scripts/refresh-dsh-bundle.js`（契约 = 设计 §2.2.10）+ 根 `package.json` 增两行 scripts | `node --check scripts/refresh-dsh-bundle.js` 绿；`npm run bundle:check` 可执行 | `git checkout -- package.json` + 删新增文件 |
| 2 | 判定面先行：跑只读判定（升级前钉版落后） | `npm run bundle:check` → 退出码 **1** + 摘要在场（TC-39） | 无需（只读） |
| 3 | 执行刷新：钉版升级 → 锁文件同步 → 安装后冒烟 → 锁自洽断言 | `npm run bundle:refresh` → 退出码 0 + 摘要 `pin=0.1.0-rc.6 -> <target>`（TC-36） | `git checkout -- dsh-bundle/package.json dsh-bundle/package-lock.json` |
| 4 | 幂等复跑 | 再跑 `npm run bundle:refresh` → 摘要 `action=none` + 退出码 0 + 两文件零 diff（TC-35 / AC21 ①） | 无需（空操作） |
| 5 | 静态验收 | AC16 三项断言 + TC-42；AC18 的 `git diff --name-only`；AC20 的静态核对与 `node --check` | — |
| 6 | 升级后冒烟（态 A） | dev + 隔离 userData 启动 → 日志 `captured port=<n> token=yes` + 无 `opening the default browser` + 窗口为对话 UI（TC-41 / AC17 / AC19） | — |
| 7 | 失败面（构造性执行） | TC-37：`npm run bundle:refresh -- --registry http://127.0.0.1:1` → 退出码 2 + 两文件零 diff；TC-38 的回滚路径**必须实现**，若无法稳定构造该用例 → 如实披露（不伪报） | — |

### 2.5 受影响文件（现状行数实测 2026-09-17；口径 = `find /c /v ""`）

| 文件 | 当前行数 | 改动点 | 预计增量 | 末行数 |
|---|---|---|---|---|
| `scripts/refresh-dsh-bundle.js` | 0（新增） | 刷新路径 + 只读判定（契约 = 设计 §2.2.10）；纯 Node，无 Electron，不进 `build.files` | +约 110 | 约 110 |
| `dsh-bundle/package.json` | 9 | 钉版 `:7` 由 `0.1.0-rc.6` 改为刷新所得精确串 | 1 行值变更 | 9 |
| `dsh-bundle/package-lock.json` | 8064（313,029 字节） | 随刷新重写（`@deepseek-ai/dsh` 及其依赖闭包的 version / resolved / integrity 面） | diff 预估 1000–2500 行 | 预估 8000–9800（实测回填批次档 §5） |
| `package.json` | 128 | `scripts` 增 `bundle:refresh` / `bundle:check` 两行 | +2 | 130 |

> **写域声明（实施者）**：仅上表 4 个文件。文档面（`docs/requirements/UPDATE.md` 182 行 / `docs/design/AUTO-UPDATE.md` 996 行）已由 eng-designer 落档，**不在实施者写域**；批次档 §1 / §3–§6 亦不在（子代理只写自己那一段）。
> **应用运行时代码零改动（AC18 静态判据）**：`main.js` 204 · `shell-update.js` 331 · `shell-backend.js` 322 · `updater.js` 497 · `harness-store.js` 332 · `update-lib.js` 90（as-of 2026-09-17）——本批不动任一。
> **拆分裁定**：新增脚本 ≈110 行（< 500），无单函数 > 300 行；不触发新的拆分裁定（设计 §2.3 拆分计划的 B08 口径）。

### 2.6 验收标准与判据（AC16–AC21；命令 + 期望输出原文）

**AC16（钉版 + 锁文件自洽；回指 US-11 / US-12 / NFR-5）**

1. `findstr /c:"\"@deepseek-ai/dsh\": \"0.1.5-rc.1\"" dsh-bundle\package.json` → **命中 1 行**（值按刷新实测替换为 `<target>`）。
2. 形态检查：钉版串命中 `^` / `~` / `*` / `latest` = **0**。
3. 锁自洽断言：`lock.packages[""].dependencies["@deepseek-ai/dsh"]` == 钉版 **且** `lock.packages["node_modules/@deepseek-ai/dsh"].version` == 钉版（TC-42）。
4. 强证据（可选，默认不跑）：`cd dsh-bundle && npm ci` 退出码 0 且 `node_modules/@deepseek-ai/dsh/package.json.version` == 钉版——重建 node_modules（分钟级 + 下载量），由用户定（出批项 2）。

**AC17（内置树首启；回指 US-11）**：dev 态隔离 userData 实跑 → 后端正常启动；日志**无** `opening the default browser`（`--no-open` 生效）；窗口可加载（对话 UI，非 401 / 空页）。打包态复跑 = **出批项 1**（TC-43）。

**AC18（dev 与打包同口径；回指 US-11 / NFR-5）**：① `git diff --name-only` 期望 = `dsh-bundle/package.json` · `dsh-bundle/package-lock.json` · `scripts/refresh-dsh-bundle.js`（新增）· `package.json`（+ 文档）——**零 `.js` 改动**（充分静态判据：零改动 ⇒ 解析口径不可能回归）；② 隔离 userData（无指针）实跑 → 解析走内置树；③ 有指针面以静态判据替代行为取证（判据强度差异，注 B08-3）。

**AC19（无 token 后端降级路径；回指 US-11 触发场景）**：`findstr /c:"token=no" <隔离 userData>\bigfish.log` → **命中 ≥1**，形态 = `[bigfish] backend web url captured port=<n> token=no`；窗口加载裸地址且可用（非 401 文本页 / 空白页，真机目视）。**取证必须在刷新落笔之前**（刷新后仓内不再有 `0.1.0-rc.6` 树；设计 §2.2.10 有序要求）。

**AC20（零新依赖 / 零新构建步骤；回指 NFR-5 / US-12）**：根 `dependencies` 保持空数组；刷新脚本只用 Node 内置 + npm CLI（无第三方 require）；`build.files` 零改动；改动 / 新增 js 全部 `node --check` 绿。

**AC21（刷新路径三面；回指 US-12）**：

- ① **幂等**——重复执行 `npm run bundle:refresh` → 摘要含 `action=none`、退出码 0、两文件零 diff（TC-35）；
- ② **判定可查**——`npm run bundle:check` 退出码 `0` = 已最新 / `1` = 落后 / `2` = 取版本失败，摘要在场（TC-39）；
- ③ **失败不留半成品**——TC-37（注册表不可达 → 退出码 2 + 两文件零 diff）· TC-38（安装失败 → 钉版回滚为原值 + 退出码 2）。
- 摘要在场 = 每次运行都打印（含幂等与失败面，注 B08-5）。

### 2.7 边界与纪律

1. **不动应用运行时代码**：`.js` 零改动（AC18 判据）；唯一新增 `.js` = `scripts/refresh-dsh-bundle.js`（维护侧，不进 `build.files`）。
2. **不改 SHELL 系档**：`docs/design/SHELL-UX.md` / `docs/requirements/SHELL.md` 零改动——AC19 的判据权威源在 `SHELL.md` §三 US-9，本批**只引用不重述**。
3. **保持精确钉版**：任何 `^` / `~` / `*` / `latest` 形态即失败态（可机检）。
4. **失败不留半成品**：取版本失败 / 安装失败 → 零改动或钉版回滚 + 退出码 2；锁文件不得处于半态。
5. **只写本仓文件**：实施者只写 §2.5 表内 4 个文件；写不进去 → 报告明说，不代笔、不跨仓。
6. **行宽 ≤ 300 字符**（不含行尾 CR）；文档正常换行，不压超长单行。

### 2.8 §1.8 用户口径 → 本批落点（调整说明）

| §1.8 口径 | 本批落点 |
|---|---|
| ① 离线版 = 构建/发版时刻的当前最新 | 钉版口径 = 刷新时刻 `latest`（DD-23）；本批把钉版由 `0.1.0-rc.6` 升到刷新所得精确串（as-of 2026-09-17 = `0.1.5-rc.1`） |
| ② 用户侧更新走既有通道 | 不动 Harness 自更新链（设计 §2.2.4 全文不变；本批零 `.js` 改动） |
| ③ 维护者可刷新离线版 | **刷新路径入范围**（选型 I 候选 1：显式维护脚本 + 只读判定）；防复发三条 = 幂等 / 判定可查 / 失败不留半成品；「挂进发版清单」超出可闭环面 → 出批项 3（无发版流程文档，T5） |

> **范围收口说明（对 §1.4 / §1.5 的覆盖）**：§1.5 待决三项的结论 = ① 锁文件体量与 diff 量级（设计 §2.3 已给实测基准与预期区间）· ② 降级判据归属（本批只做验收固定 + 引用权威源，不重述机制）· ③ 真机面（打包态冒烟 = 出批项 1，已如实登记）。

### 2.9 修正轮 1 落档说明（eng-designer；评审 #1–#10，append-only——本节为 §2 上文的唯一修订面）

> 说明：§2 为 append-only，上文（§2.1–§2.8）**不改写**；凡本节与上文冲突处（退出码语义 / 摘要行字段 / AC17 / AC20 / AC21 判据形态 / 出批项计数），**以本节为准**。
> 修正轮边界：只落评审 #1–#10 直接导出的修正，**不改设计契约范围**、不夹带新语义；全部为文档层修订，**零 `.js` 改动**。

#### 2.9.1 十条逐一落点（file:line = as-of 2026-09-17 落笔后行号）

| # | 发现 | 落点 | 改前 → 改后要点 |
|---|---|---|---|
| 1 | 🟡 幂等早退封死自修复 | `docs/design/AUTO-UPDATE.md` §2.2.10（`:562` 起）契约块 + 已知面（`:622`）+ §2.4 DD-26（`:746`） | ②b/②c 两步：已最新**且自洽** → `action=none`；已最新**但自洽不过** → **修复面**（重跑 ④ + 复跑 ⑤⑥，`action=repair` / `repair-fail`）⇒ ⑤⑥ 对「已最新」态可达；`--check` 退出码 0 含锁自洽、2 含自洽不过；③④ 断电窗口登记为**设计内已知面**（含处置三条） |
| 2 | 🟡 AC21③/TC-38「锁不半态」无机制无判据 | 设计档 §2.2.10「锁文件处置与失败判据」段 + §3.1 新增**注 B08-6**（`:905`） | 失败面统一为**二元组写回**（钉版 → pin0 + 锁 → 内存快照 lock0）；判据 = AC16③ 断言施加于回滚后的对（钉版 == pin0 ⇒ 锁根依赖串 == pin0）+ `git diff` 零 diff；写回自身失败 → `lock=restore-fail` + 退出码 2（兜底 = `git checkout --`，DD-25） |
| 3 | 🟡「等价校验」等价未定义 + O9 | 设计档 §2.2.10「等价校验的定义」段 + §2.5 **L13**（`:790`）；需求档 `docs/requirements/UPDATE.md` NFR-5 | 写死 = 锁**根面**两字段断言（校验什么）+ **不证明**传递闭包 / `integrity` 完整 / `npm ci` 可跑通（限制行）；O9 只作限制依据、不据此设判据 |
| 4 | 🟡「构建/发版时刻的 latest」时点落差 | 设计档 §2.2.10 口径 1（操作性定义）+ §2.4 DD-23（`:743`）+ §2.5 **L11 重写**（`:787`）；需求档 US-11 | 口径 = **最近一次刷新所得** `latest`；**刷新须在发版前执行**；残余差（刷新后延后发版）显式登记、不设判据 |
| 5 | 🟡 产物链未写全 + `ensure-deps.js` 第二写入点 | 设计档 §2.2.10「产物链」段 + §2.5 **L14**；需求档不涉 | 链路写全（`.gitignore:1` 忽略 → 构建机 `scripts/ensure-deps.js:72-73` 的 `npm install`（仅树缺失）→ `package.json:91-93` extraResources 复制）；分工与「不得同时执行」写死；未证明面 = L14（本批不设「刷新验过的树 == 打包进的树」判据） |
| 6 | 🟡 AC20「空数组」不符实 | 设计档 §3.1 AC20 行（`:864`）+ §2.5 C11 / C17 / `—` 行 + §3.3 手段 5（`:980`）+ §一 C11（`:52`）；需求档 NFR-4（`:162`） | 「空数组」→「空**对象** `{}`（键集合为空）」，并给实形指针 `package.json:25` |
| 7 | 🔵 `--registry` / `registry=` 作用面 | 设计档 §2.2.10 契约块（`--registry` 行 + 摘要取值定义）+ §2.5 **L15** | `--registry <url>` 同时约束 ①（取 dist-tags）与 ④（`npm install`）；未传时二者可能不同源（`.npmrc:3` 只设 `replace-registry-host=always`）→ L15；`registry=` 取值 = ① 取版本成功所用源 |
| 8 | 🔵 AC16② 无命令形态 | 设计档 §3.1 注 B08-1 ②（`:891`）+ §2.3 钉版形态句 + §3.3 手段 9（`:990`） | 给可执行命令（node 精确版本正则 + 范围符 / 标签零命中），**本轮对现状钉版实跑通过**（`pin-form=ok`，退出码 0） |
| 9 | 🔵 AC17 负向断言强度 | 设计档 §3.1 AC17 行（`:861`）判据分工 + 注 B08-2（`:897`）+ §3.2 TC-41；需求档不涉 | **主判据 = 静态正向**（`shell-backend.js:205` 无条件传 `--no-open`；机检 = `findstr /n` 命中 `:205`，实测同串另命中 `:204` 注释）；**辅证 = 日志负向行**（本轮实测其印出点：内置树 `…/dsh-web-app/lib/index.js:201`，仅未传 `--no-open` 时打印 ⇒ 有据，非死锚） |
| 10 | 🔵 行数口径不统一 + 表格多余单元格 | 设计档 §2.3 **行数口径注**（`:670`）+ B08 子表两行（`:665`/`:666`）；需求档变更记录（`:184`） | 口径统一为**换行符计数**（两档实测与 `find /c /v ""` 一致；read 工具 = 表值 +1）；需求档 `:182` 行尾多余空单元格（`| |`）已清除 |

#### 2.9.2 与上文冲突处的**本节口径**（以本节为准）

1. **退出码语义（覆盖 §2.1 口径 4 / §2.6 AC21②）**：`--check` 退出码 = `0` 已最新**且锁自洽** / `1` 落后 / `2` 取版本失败**或锁自洽不过**（判定次序：落后优先）。
2. **摘要行形态（覆盖 §2.1 口径 4 / §2.6 AC21 摘要句）**：`bundle refresh action=<refresh|none|repair|repair-fail> pin=<pin0> -> <new> tag=<tag> registry=<source> lock=<bytes>`（`action=` 为新增首字段；恒在场含幂等 / 修复 / 失败面）。
3. **修复面（新增机制面，由 #1 直接导出）**：已最新但 ⑤⑥ 不过 ⇒ 重跑 ④ + 复跑 ⑤⑥；通过 = `action=repair`（退出码 0）、仍不过 = `action=repair-fail`（退出码 2）。
4. **AC17 判据分工**：主判据 = 静态正向（`shell-backend.js:205`）；日志负向行降为**辅证**（其中「窗口可加载」面仍为真机目视）。
5. **AC20 形态**：根 `"dependencies"` = 空**对象** `{}`（键集合为空；`package.json:25`）。
6. **出批项计数订正**：§2.3「出批项」三条（原文未计数，无冲突）；设计档 §2.5 L12 计数 `2 → 3`（补 `npm ci` 全量复现）。
7. **新增项登记**：设计档新增 **DD-26**（`:746`）· **L13 / L14 / L15**（`:790` / `:791` / `:792`）· **注 B08-6**（`:905`）· **TC-44**（`:954`）· §2.1 选型 I 的 **R2 判据补「含锁自洽」** · §2.3 **行数口径注**。
8. **三方条目一致（更新后）**：§2.2 表 AC16–AC21 条目不变（清单仍 = AC16/17/18/19/20/21），仅 **AC21 的设计档用例列表** 由 `TC-35 / TC-37 / TC-38 / TC-39` 扩为 **`+ TC-44`**（AC21 由「三面」→「四面」）；需求档条目（US-11 / US-12 / NFR-5）不变。

#### 2.9.3 实测（落笔后，口径 = 换行符计数）

- `docs/design/AUTO-UPDATE.md`：**1041 行**（B08 落档前 855；其中修正轮 1 = +45）· `>300` 字符行 = **3**（`:57` 366 / `:829` 309 / `:1034` 321——**均为 B06 时期既有行宽债**，评审已声明出本批范围；本轮新增 / 改动行 **0 行超宽**）。
- `docs/requirements/UPDATE.md`：**186 行**（B08 落档前 153；修正轮 1 = +4）· `>300` 字符行 = **0**。
- 自指行同步：设计档 §2.3 B08 子表两行已回填 `186` / `1041`（修正轮 1 的值）。
- 工具口径核对：`find /c /v ""` 输出 = 1041 / 186，与换行符计数**一致**。

#### 2.9.4 本轮不落笔的新发现（单列，交主 agent / 用户裁决）

1. **§3 评审段的 4 行超宽**（批次档 `docs/batches/B08-dsh-bundle-version.md` `:212` 337 / `:214` 329 / `:216` 365 / `:223` 781）——评审者段（§3）在本轮冻结（禁碰），形态问题归主 agent / 评审者处理。
2. **评审 #9 的前提已被本轮实测修正**：该发现称「`opening the default browser` 属后端树，unverified」——本轮亲测该串**确在内置树**（`dsh-bundle/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-app/lib/index.js:201`，分支 `:194`/`:200`），故辅证**有据**；主判据仍按裁决改为静态正向（不构成对裁决的偏离）。
3. **B08 批次档 §2.5 表的两处行数**（`182` / `996`）为落档时点值，修正轮 1 后终值为 `186` / `1041`（本节为准；§2.5 上文按 append-only 不改写）。

### 2.11 收口轮（实施后文档事实同步 + 实测回填；源 = §5 交付报告的「评审 `Deferred` 四条 + 残余 3/4」）

> **口径**：本节为 **append-only** 追加段，上文（§2.1–§2.9）不改写。本轮 = **纯文档层修订**（零 `.js` 改动、零 `package.json` 改动——实施早于本轮收口）。
> 四条均由主 agent 裁定 **`Dispatched`**；落点全部在本角色写域内（`AGENTS.md` / `docs/CONVENTIONS.md` / `docs/design/AUTO-UPDATE.md` / `docs/requirements/UPDATE.md` + 本段）。
> **不夹带新语义 / 新判据**：AC16–AC21 判据结论、契约语义、条目清单（AC16–AC21 · US-11 / US-12 / NFR-5）一律不变；属**一致性面**（行锚 / 计数 / 留白补写）。

#### 2.11.1 四条逐一落点（`file:line` = 本轮落笔后实测；「改前 → 改后」为逐处原文）

**D1 行锚漂移（实施副作用 +「逐处以当次实测为准」——含 3 处更早批次陈旧值）**

| # | 落点 | 改前 → 改后 |
|---|---|---|
| 1 | `AGENTS.md:38`（§三 ① 门禁现状 = 计数面 D3） | `package.json:13-24` 的 scripts（10 项列举）→ **`:13-26`**（**12 项**：补 `bundle:refresh` / `bundle:check`）；「无 `test`」结论与现状 0/3 **不变** |
| 2 | `docs/design/AUTO-UPDATE.md:52`（§一 C11） | `package.json:23` → **`:27`**（`"dependencies": {}`） |
| 3 | `docs/design/AUTO-UPDATE.md:875`（§3.1 AC20） | `package.json:25` → **`:27`** |
| 4 | `docs/design/AUTO-UPDATE.md:991`（§3.3 手段 5） | `package.json:25` → **`:27`** |
| 5 | `docs/design/AUTO-UPDATE.md:564`（§2.2.10 对象行） | `package.json:81-94`（`extraResources`）→ **`:83-96`** |
| 6 | `docs/design/AUTO-UPDATE.md:567`（§2.2.10 关系行） | `package.json:91-93`（复制块）→ **`:93-94`**（= 复制块 from/to 两行） |
| 7 | `docs/design/AUTO-UPDATE.md:621`（§2.2.10 产物链行） | `package.json:91-93` → **`:93-94`** |
| 8 | `docs/design/AUTO-UPDATE.md:337` / `:744` / `:858`（§2.2.4 先例行 / §2.4 DD-14 / §3.1 AC5——3 处） | `package.json:85`（`runAfterFinish`）→ **`:110`**（该值系**更早批次**陈旧，非本批 +2 所致：HEAD 基线即 `:108`） |
| 9 | `docs/design/AUTO-UPDATE.md:812`（§2.5 O7） | 所引 T4 行锚 `:13-21` **补现行值** `:13-26`（T4 原文按台账写权在主 agent，未动） |
| 10 | `docs/requirements/UPDATE.md:162` / `:186`（NFR-4 / 修正轮 1 行） | `package.json:25` → **`:27`**（2 处） |
| 11 | `docs/CONVENTIONS.md:160`（§八） | `package.json:39-80`（`build.files`）→ **`:41-82`** |

> **计数与枚举同步（D3）**：① 4 档共 **9 处**行锚按实测更正（其中 design 档 8 处 = `:52` / `:337` / `:564` / `:567` / `:621` / `:744` / `:858` / `:875` / `:991`——共 9 处，其中 `runAfterFinish` 占 3 处）+ O7 补现行值 1 处（不属「更正」）；
> ② 每一处均随改注「**行号只作 as-of 参考**」（D4）；③ `AGENTS.md` 的 scripts 行锚与**列举同改**（12 项 = 逐字列名）。

**D2 设计档实测回填（只回填实测与成因，不改判据 / 不改契约语义）**

| # | 落点 | 改前 → 改后 |
|---|---|---|
| 1 | `docs/design/AUTO-UPDATE.md:666`（§2.3 B08 子表 · 脚本行） | 末行数 `约 110` → **`290`（实测）**；「预计改动量」列照表口径保留预估值（对照） |
| 2 | `docs/design/AUTO-UPDATE.md:665`（锁文件行） | 末行数 `预估 8000–9800` → **`8573`（实测）**；改动量列补「实测 8463 变更行 = +4486 / −3977」 |
| 3 | `docs/design/AUTO-UPDATE.md:671-672`（表下新增块） | 新增「B08 实测回填」：4 档实测值（9 行 / 8573 行 348,259 字节 / 290 行 / 130 行 + 三联值） |
| 4 | `docs/design/AUTO-UPDATE.md:678-682`（锁文件 diff 量级 · 基准） | `packages` **1106 → 554**、缺 `integrity` **767 → 215**（两数系同一计数口径偏差；复算依据 = 旧锁（HEAD）实测 554 / 339） |
| 5 | `docs/design/AUTO-UPDATE.md:683`（补齐面预估） | `≈1500 行（2 × 767）` → **`≈430 行（2 × 215）`**（同一偏差的导出值） |
| 6 | `docs/design/AUTO-UPDATE.md:685-687`（新增 · 实测回填） | 新增：diff **8463 变更行**（占 98.7%，**超**预估区间 1000–2500）+ 终值 8573 行（**在** 8000–9800 内）+ 成因三条（基准数偏差 / `replace-registry-host=always` 改写 `resolved`（339 → 584）/ 树 re-flatten（嵌套 184 → 32）） |
| 7 | `docs/design/AUTO-UPDATE.md:798`（§2.5 L13） | 依据 O9 的 `1106 条目` → **`554 条目`**（L13 的「只作限制依据、不据此设判据」不变） |
| 8 | `docs/design/AUTO-UPDATE.md:816-817`（§2.5 O9） | 计数更正 + **收口轮回填**：刷新后 **584 / 585** 条带 `integrity`（唯一缺者 = 根条目 `""`）——该现象**未复现**（成因仍未验证） |
| 9 | `docs/design/AUTO-UPDATE.md:668` / `:669`（自指两行） | 末行数同步实测：需求档 `186 → 187`、本档 `1041 → 1056`（修正轮 1 +45 · 收口轮 +15） |

**D3 契约留白（评审 #3）——`--check` 面的 `action=` 取值写进契约 ⑦**

- 落点 = `docs/design/AUTO-UPDATE.md:600-601`（§2.2.10 契约块 ⑦ 摘要行之下，新增 2 行）。
- 写入口径（**实测**，源 = `scripts/refresh-dsh-bundle.js:213-226`）：`none` = 已最新**且锁自洽** / `refresh` = 落后 / `repair` = **锁自洽不过**；失败面（取版本失败 / 参数错等）= **退出码 2 + `detail=<原因>`**；`repair-fail` 属刷新面、`--check` 面不产出。
- **不新增第五值**（`action=` 仍为本契约已定义的四值域，`--check` 面取其子集）。

**D4 冒烟判据的窄面风险（评审 #5）——保持逐字忠于契约 + 加已知窄面注**

- 判决：**保持逐字忠于契约**（`输出含 target` = 子串匹配；收紧 = 语义变更，不夹带）。
- 落点 = `docs/design/AUTO-UPDATE.md:596`（§2.2.10 契约块 ⑤ 之下，新增 1 行）：登记唯一窄面 = 「⑥ 锁自洽通过、而树实为**含该串的异版本**」（例：target `0.1.5-rc.1`、实装 `0.1.5-rc.10`）⇒ 标注「**已知取舍，非漏洞**」。

#### 2.11.2 实测（本轮落笔后；口径 = 换行符计数 = `find /c /v ""`）

| 档 | 行数（实测） | >300 字符行 | 说明 |
|---|---|---|---|
| `docs/design/AUTO-UPDATE.md` | **1056**（收口轮前 1041；+15） | **3**（`:57` 366 / `:840` 309 / `:1045` 321） | 3 行 = **B06 时期既有行宽债**（本轮新增行 0 行超宽；本轮首稿 2 行超宽已就地重排） |
| `docs/requirements/UPDATE.md` | **187**（+1） | **0** | — |
| `docs/CONVENTIONS.md` | **175**（+1） | **0** | 该档工作区含并发会话在途改动（B11 修正轮），本轮只加 1 行锚更正 + 1 变更记录行 |
| `AGENTS.md` | **64**（+1） | **0** | — |
| 本批次档 | 396（未改） | 4（§3 豁免面） | §3 的 4 行超宽 = 豁免面（§2.9.4 已登记） |

- 独立复算（实施方证据，非引用）：`dsh-bundle/package.json` 钉版 = `0.1.5-rc.1`；锁根依赖串与锁内 dsh 条目版本同值；`git diff --numstat -- dsh-bundle/package-lock.json` = **+4486 / −3977**；旧锁（`git show HEAD:dsh-bundle/package-lock.json`）实测 = 8064 行 / `packages` **554** / 带 `integrity` **339**；新锁 = 8573 行 / 348,259 字节 / **585** 条目 / 带 `integrity` **584**。

#### 2.11.3 自查（D1 全档 grep 逐处表；`package.json:1[0-9-]` / `13-24` / `10 项` / `1106` / `767 个`）

| 命中 | 是否活计数 / 活指针 | 处置 |
|---|---|---|
| `AGENTS.md:38`（`:13-26`） | 活（已更正） | 已修 ✓ |
| `AGENTS.md:64` / `docs/CONVENTIONS.md:175` / `docs/requirements/UPDATE.md:187` / `docs/design/AUTO-UPDATE.md:1052-1056` | 否（**变更记录行**：记「改前值 → 改后值」） | 保留（历史留痕，D7） |
| `docs/design/AUTO-UPDATE.md` 的 9 处行锚（`:52` / `:337` / `:564` / `:567` / `:621` / `:744` / `:858` / `:875` / `:991`） | 活（已更正 + as-of 注） | 已修 ✓ |
| `docs/design/AUTO-UPDATE.md:812`（`:13-21` + 现行 `:13-26`） | 半活（所引 T4 行锚本身仍是 `:13-21`——台账写权在主 agent） | 补现行值 ✓；T4 本体**不改**（写域外） |
| `docs/design/AUTO-UPDATE.md:681` / `:687` / `:1055`（1106 / 554 对照） | 否（**偏差登记行**：原文值 vs 复算值） | 保留（偏差可见） |
| `docs/design/AUTO-UPDATE.md:816`（`767 / 1106` 对照） | 否（同上，O9 偏差登记） | 保留 ✓ |
| `docs/design/AUTO-UPDATE.md:122`（`dsh-bundle/.../package.json:22-83`） | 指针失准 + 语义过期（**非本批 +2 面**） | **不改**（语义面 → 单列报告，见 §2.11.4-1） |
| `docs/design/AUTO-UPDATE.md:299`（`package.json:11` homepage） | 活且**正确**（`:11` 未随 +2 漂移） | 不动 ✓ |
| `docs/design/AUTO-UPDATE.md:622`（`package.json:14` / `:15`） | 活且**正确**（scripts 前两项不受尾插影响） | 不动 ✓ |
| `docs/requirements/UPDATE.md:64`（`package.json:11`） | 活且正确 | 不动 ✓ |
| 写域外：`docs/TODO.md:29`（T4 = `:13-21`）/ `:34`（T10 = `dsh-bundle/package.json:7` 钉 `0.1.0-rc.6`） | 活 + 陈旧（主 agent 写域） | **报告**（T10 待勾销；其证据行钉版串亦已过期） |
| 写域外：`docs/design/PET-ANIMATION.md:51` / `:73` / `:315` / `:370` / `:442` · `PET-MULTIMONITOR.md:668` / `:964` · `SHELL-UX.md:56` / `:162` / `:402` · `docs/requirements/PET.md:259` · `docs/batches/B02-auto-update.md:190` / `:295` · `B03-pet-multimonitor.md:340` · `B18-pet-animation-chain.md:169` / `:190` | 活 + 陈旧（他批文档） | **报告**（不跨批落笔；见 §2.11.4-2） |

#### 2.11.4 本轮不落笔的新发现（单列，交主 agent / 用户裁决）

1. **`docs/design/AUTO-UPDATE.md:122` 的行锚 + 语义双陈旧**：选型 B 候选 2（否决项）的括注「出厂冻结树是 `0.1.0-rc.6` 配套，`dsh-bundle/node_modules/@deepseek-ai/dsh/package.json:22-83`」——B08 刷新后该树实测 = `dsh` **`0.1.5-rc.1`**、其 `dependencies` 段 = **`:30-103`**。
   属**语义面**（改版本陈述 = 改「说的是什么」）⇒ 本角色**不改**（§2.9 修正轮边界 + 本轮「不夹带新语义」硬约束）。建议：由主 agent 裁定是否按「历史时点值」加 as-of 注或改写该短语。
2. **他批文档同源行锚漂移（写域外，一律只报告）**：`PET-ANIMATION.md`（`:13-24` → `:13-26`；`:39-80` → `:41-82`；`:74` → `:76`；`:78` → `:80`）· `PET-MULTIMONITOR.md`（`:36-58` → `:38-60`；`:13-21` → `:13-26`）· `SHELL-UX.md`（`:25-29` / `:25` / `:41-43` 三处）· `requirements/PET.md:259`（`:78` → `:80`）· 批次档 `B02:190` / `:295`（`:85` → `:110`）· `B03:340` · `B18:169` / `:190`。
3. **`AGENTS.md:39` 的门禁现状 ② 行**：`.github/workflows/build.yml`（**75 行**）——本角色实测 `find /c /v ""` = **74**（差 1 = 末行空行口径；与 §2.3 行数口径注同源）。属**计数口径面**（非行锚面），本轮**未改**（不在四条范围内，避免夹带）；建议随 B16 门禁落档时统一口径。
4. **§2.1 选型 I 取舍列的「≈110 行」**：为实施前预估（实测 290 行，已回填 §2.3）。按 §2.3「预计改动量列保留预估值作对照」同口径**未改**；如需全档统一「预估 → 实测」回填，请裁定（属范围增减）。

## §3 设计评审（评审子代理）

### 轮次 1（评审子代理）

**评审轮次 1 —— 发现表（设计评审：B08 批次档 §1/§2 + `docs/requirements/UPDATE.md` US-11/US-12/NFR-5 + `docs/design/AUTO-UPDATE.md` §2.2.10 / 选型 I / DD-23 / DD-25 / §3.1 AC16–AC21 + 注 B08-1…B08-5 / §3.2 TC-35–TC-43 / §2.3 B08 子表与锁文件 diff 量级）**

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | Requirements | 🟡 | 幂等早退封死自修复：设计 §2.2.10 ②「target == 当前 → 幂等空操作」+ `--check` 只判钉版（0=已最新）⇒「钉版 == latest、而锁文件 / node_modules 不自洽」这一状态（③ 写钉版与 ④ 安装之间进程被杀 / 断电的窗口）既落不进 ①④⑥ 的任何失败分支，也永不被刷新修复，判定面反而报「已最新」——正是本批要消灭的「看不见的落后」类 | 建议把 ⑤ 冒烟 + ⑥ 自洽断言做成无论钉版是否已最新的**可达面**（已最新但自洽不过 → 走修复 / 报错，而非 `action=none`），或把锁自洽纳入 `--check` 退出码语义；并把该窗口登记为设计内已知面 |
| 2 | Acceptance | 🟡 | AC21③ / TC-38 的「锁文件不处于半态」既无机制也无判据：§2.2.10 ④ 失败处置只写「钉版回滚为原值」，锁文件不在回滚面；⑥ 的锁自洽断言只挂在刷新**成功**路径 ⇒ 该断言在文档里不可验证 | 建议写明失败后锁的期望形态与判据（例：把 AC16③ 断言施加于回滚后的对——钉版 = 旧值 ⇒ 锁根依赖串 = 旧值），或补「`npm install` 失败不改写锁」的证据行 |
| 3 | Requirements | 🟡 | NFR-5 的度量方式 =「`npm ci`（或等价校验）退出码」，而 AC16④ 把 `npm ci` 降为可选强证据、③ 改用「根依赖串 + node_modules 条目版本」两字段 JSON 断言替代——「等价」的判据未定义（不覆盖 resolved / integrity / 传递闭包，不构成「同一份锁复现同一棵树」）；叠加 O9（本档 :773 实测 1106 条中仅 339 条带 integrity、767 条缺字段，成因未验证）⇒ 可复现锚自身未经证实可用 | 建议把「等价」写死（并加限制行说明它不证明可复现），或要求刷新过程留下一次 `npm ci` 结果作为证据（不必每次跑） |
| 4 | Requirements | 🟡 | 口径落差未收口：「离线版 = **构建 / 发版时刻**的注册表 latest」（DD-23 / §2.2.10 口径 1 / US-11）与可达语义「**刷新时刻**的 latest」不是同一时点——刷新后延后发版即得「发布时已非最新」的离线版；L11 仍沿用「发布时刻的快照」措辞（R7d 语义悬空） | 建议写死操作性定义（刷新须在发版前执行 / 离线版版本 = 最近一次刷新的 latest + 残余差登记），或加一条限制行 |
| 5 | Scope | 🟡 | 离线版实际产物链未写全：仓内 `dsh-bundle/node_modules` 被 `.gitignore:1`（`node_modules/`）忽略 ⇒ 装入安装包的树由**构建机** `npm install`（先例 `scripts/ensure-deps.js:73`，是 install 不是 ci）生成，与刷新时被 ⑤ 冒烟 / ⑥ 断言验过的那棵树之间没有一致性判据；且新脚本第 ④ 步与 `scripts/ensure-deps.js` 是对同一目录的第二写入点，二者分工（谁在什么条件下写 package-lock / node_modules）在 §2.2.10 未写 | 建议补链路说明 + 二者分工（或登记为限制），不让「刷新验过的树 = 打包进的树」被默认成立 |
| 6 | Clarity | 🟡 | AC20 的机检判据形态不符实：条文写「根 `dependencies` 保持**空数组**」，实际是空**对象** `{}`（`package.json:25`，本轮亲读）——按字面断言为数组即误判 | 建议改写为「`"dependencies"` 为空对象 `{}`（键集合为空）」 |
| 7 | Clarity | 🔵 | `--registry <url>` 与摘要字段 `registry=<source>` 的作用面未定：①（取 dist-tags）与 ④（`npm install` 亦取包）都涉注册表，未说 `--registry` 是否同时约束 ④、摘要报哪一源；`dsh-bundle/.npmrc`（240 字节，内容未读）与 npm 默认源的交互未提 | 建议写明 `--registry` 的约束面与 `registry=` 的取值定义（取版本所用源 / 安装所用源） |
| 8 | Clarity | 🔵 | AC16 ②「形态检查」未给命令或判据形态（①③④ 均给了命令 / 断言），判定列却标机检 | 建议补一行可执行形态（对钉版串做范围符 / 标签正则断言） |
| 9 | Acceptance | 🔵 | AC17 的判据「日志无 `opening the default browser`」是**负向**断言，强度取决于后端真会在该路径打这一串（`shell-backend.js` grep 0 命中，该串属后端树，unverified）；同面存在更强的确定性正向判据：`--no-open` 无条件传入（`shell-backend.js:205`） | 建议以静态正向判据为主（args 含 `--no-open`），负向日志行作辅证 |
| 10 | Doc hygiene | 🔵 | 数字 / 表格形态：`docs/design/AUTO-UPDATE.md` 经 read 工具报 997 行，而 §2.3 B08 子表记「996（实测）」——口径差疑为末行空行（未独立复算，unverified）；`docs/requirements/UPDATE.md:182` 变更记录行尾多一个空单元格（`| |`） | 建议 §5 回填时统一行数口径；顺手清掉多余单元格 |

**本轮 spot-check（亲读 / 亲测，非引用）**：`dsh-bundle/package.json` = 9 行、钉版在 `:7` = `0.1.0-rc.6` ✓；根 `package.json` = 128 行、`scripts` 在 `L13-24`（+2 → 130 算术自洽）✓；`dsh-bundle/package-lock.json` = 313,029 字节（`ls`）/ 末行号 8064 ✓；`dsh-bundle/node_modules/@deepseek-ai/dsh/package.json:4` = `0.1.0-rc.6` ✓（AC19 的 `token=no` 基线可行）；`shell-backend.js:155` 诊断行形态 = `[bigfish] backend web url captured port=<n> token=yes|no` ✓（AC17 / AC19 判据形态成立）、`:89` `dshBinPath()` ✓、`:205` 无条件传 `--no-open` ✓、`:44` / `:61` / `:215` 诊断行与后端 stdout 均落 `bigfish.log` ✓；`scripts/ensure-deps.js` 存在（`scripts/` 目录先例成立）✓。**行宽**：`docs/requirements/UPDATE.md` 与批次档 §1 / §2 均 **0 行** >300 字符 ✓；`AUTO-UPDATE.md` 仅 `:57` / `:796` / `:993` 三行超宽（= 已声明行宽债，出本批范围）✓。**三方条目一致**（批次 §2.2 表 ↔ 需求档 US-11 / US-12 / NFR-5 ↔ 设计 §3.1）逐行核对无错配 ✓。

**方法学合规（局限声明）**：本次无项目标准档声明，评审按 `AGENTS.md`（写权矩阵 / 四步流程 / 门禁）+ 文档地图 + 档内引用判定：§1 = 主 agent、§2 = eng-designer、需求档与设计档均落「一主题一档」且靠回指不重述 ✓；批次档 §3 为评审者专段 ✓。

**计数**：🔴 0 / 🟡 6 / 🔵 4。

VERDICT: pass

## §4 评审裁决与实施启动（主 agent）

## §5 实施记录（eng-coder）

### 5.1 交付摘要

**结论**：B08 实施完成，AC16–AC21 机检面全绿；`dsh-bundle` 钉版由 `0.1.0-rc.6` 刷新至 `0.1.5-rc.1`（精确串），锁文件同步重写，新增维护侧刷新脚本与两条 npm script 入口。

| 文件 | 改动 | 末行数（换行符计数） | 证据 |
|---|---|---|---|
| `scripts/refresh-dsh-bundle.js` | 新增：刷新路径 + 只读判定（契约 = 设计 §2.2.10） | **290**（设计预估「约 110」——见 §5.3） | sha256 `b169f8c102653e85a5b0054f`；`node --check` 绿；行宽 >300 = 0 |
| `dsh-bundle/package.json` | `:7` 钉版值变更 1 行（`0.1.0-rc.6` → `0.1.5-rc.1`） | 9（不变） | `git diff` = 1 行值变更（逐字节可见） |
| `dsh-bundle/package-lock.json` | 随刷新重写（dsh 及其依赖闭包） | **8573**（原 8064） | 字节 313,029 → **348,259**；sha256 `e1507d5aac3b9d734ce04bae` |
| `package.json` | `scripts` 增 `bundle:refresh`（`:24`）/ `bundle:check`（`:25`）两行 | 130（原 128） | `"dependencies": {}` 由 `:25` 移至 `:27`（**带动文档行锚漂移，见 §5.5 评审 #1/#2**） |

**交付态三联值（回读核实，D6）**：钉版 = `0.1.5-rc.1` · 锁根依赖串 = `0.1.5-rc.1` · 锁内 `node_modules/@deepseek-ai/dsh` 条目版本 = `0.1.5-rc.1`；树实装版本 = `0.1.5-rc.1`。

### 5.2 有序步骤执行与实测证据（§2.4 步骤 0–7）

| # | 步骤 | 实际命令 | 实际输出（原文摘要） |
|---|---|---|---|
| 0 | 前置取证（刷新前，态 B） | dev + 隔离 userData + 隔离 DSH_HOME 启动 | `[bigfish] backend web url captured port=55648 token=no`；`dsh web: http://127.0.0.1:55648`（**无 token**）；探针 = HTTP 200 / 14,516 字节 HTML |
| 1 | 新增脚本 + 两行 scripts | `node --check scripts/refresh-dsh-bundle.js` | `Syntax OK`；`npm run bundle:check` 可执行 |
| 2 | 判定面先行 | `npm run bundle:check` | 退出码 **1**；`bundle refresh action=refresh pin=0.1.0-rc.6 -> 0.1.5-rc.1 tag=latest registry=npmmirror lock=313029 detail=behind` |
| 3 | 执行刷新 | `npm run bundle:refresh` | 退出码 **0**（49 s）；`added 218 packages, removed 189 packages, and changed 277 packages`；冒烟输出 `0.1.5-rc.1`；`action=refresh pin=0.1.0-rc.6 -> 0.1.5-rc.1 … lock=348259` |
| 4 | 幂等复跑 | 再跑 `npm run bundle:refresh` | 退出码 **0**（847 ms）；`action=none`；两文件 **sha256 不变**（零 diff） |
| 5 | 静态验收 | AC16①②③ + AC18 + AC20 | ① `findstr /c:"\"@deepseek-ai/dsh\": \"0.1.5-rc.1\"" dsh-bundle\package.json` 命中 1 行；② 设计注 B08-1 ② 命令 → `pin-form=ok` 退出码 0；③ 锁两字段 == 钉版；AC20 根 `dependencies` = `{}`（键集合为空）/ `build.files` 40 条目零改动 / `node --check` 绿；AC18 本批零 `.js` 改动（见 §5.4） |
| 6 | 升级后冒烟（态 A） | dev + 隔离 userData 启动 | `[bigfish] backend web url captured port=55836 token=yes`；`dsh web: …?token=…`（值不落档）；`opening the default browser` **零命中** |
| 7 | 失败面（构造性执行） | TC-37 / TC-38 / TC-44 | TC-37 = 退出码 **2** + 两文件零 diff + `detail=fetch-fail: … ECONNREFUSED`；TC-38（本地桩注册表：① 成功、④ 装包失败）= 退出码 **2** + 钉版回写 `0.1.5-rc.1` + 锁零 diff + `detail=install-fail`；TC-44 = `check` 退出码 **2** / `refresh` → `action=repair` 退出码 **0**（修复后锁自洽复绿） |

**态 A 的加载链实证（补强 AC17/AC19 的「窗口可加载」面）**：以同一内置树直起后端（同参数 `--profile web --host --port --no-open`）实测——
裸地址 `GET /`（无 Cookie）= **401**（68 B）；带 token 地址 = **303 + `Set-Cookie: <会话 Cookie>` + `Location: /`**；
携该 Cookie 再取 `GET /` = **HTTP 200 / 27,660 字节 / HTML**。
⇒ 壳加载的正是这条可换 Cookie 的地址（`shell-backend.js:146-163` 捕获 + `browserUrl()`），非 401 文本页 / 空页。
**「主窗口真机目视」仍属人判面**（主窗口 `show:false`，启动不自动显示——B06「启动安静」口径）。

### 5.3 实测回填（设计 §2.3「B08 锁文件 diff 量级」块要求 §5 回填）

| 量 | 刷新前（实测） | 刷新后（实测） | 设计预估 | 判定 |
|---|---|---|---|---|
| 锁文件行数 / 字节 | 8064 / 313,029 | **8573 / 348,259** | 8000–9800 行 | ✅ 落在区间内 |
| `packages` 条目 | **554** | **585** | 设计记「1106」 | ⚠️ 设计基准数不符实（见下） |
| `@deepseek-ai/*` 条目 | 258 | 246 | ≥258 行变更面 | ✅ |
| 带 `integrity` 条目 | 339 / 554 | **584 / 585**（唯一缺者 = 根条目 `""`，其本不带该字段） | O9 记「767 条缺字段，成因未定」 | ✅ 未复现；O9 现象未在本次刷新重现 |
| 嵌套条目（`node_modules/x/node_modules/y`） | 184 | 32 | 未预估 | 树被 re-flatten |
| `git diff --numstat` | — | **+4486 / −3977（= 8463 变更行）** | **diff 1000–2500 行** | ❌ **超出预估区间**（见下） |

**两处须回填/复核的偏差（如实登记，不伪报）**：

1. **diff 量级超预估**：实测 8463 变更行（占全档 98.7%），设计预估 1000–2500 行。成因可解释——
   设计基准数 `packages` = 1106 与实况 554 不符（本次亲测：旧锁顶层键 = `name/version/lockfileVersion/requires/packages`，`packages` 条目实测 **554**；
   `1106 − 339 = 767` 与设计的「缺字段 767 条」自洽，疑为设计基准计数口径有两倍偏差）。
   加上 `replace-registry-host=always` 使全部 `resolved` 主机被改写（339 → 584 条补写）+ 树 re-flatten（嵌套 184 → 32）⇒ 大范围行改写。
   **验收口径仍按设计要求的结构性判据**（钉版自洽 + 形态 + 等价校验 + 刷新后冒烟），不逐行读 diff。
2. **新脚本行数 290 > 预估约 110**：设计 §2.3 表该列本就是「实施前预估，实施后由批次档 §5 回填」，故按口径回填实测值；结构面仍守规（< 500 硬限、无单函数 >300 行、行宽 >300 = 0）。

### 5.4 决策透明表（契约留白处 · 实施者自决 · 逐条披露）

| # | 决策点 | 契约状态 | 处置 | 理由 / 影响面 |
|---|---|---|---|---|
| 1 | 摘要行附 `detail=<原因>` | 契约 §2.2.10 ⑦ 字段枚举无 `detail` | **附加该字段**（不删改既有五字段，位置追加末位） | TC-37 明文要求「摘要含错误原因」——不附则用例不可满足。属**契约要求的补全**，非自由发挥 |
| 2 | `--check` 面的 `action=` 取值 | 契约四值域 `refresh|none|repair|repair-fail` 只定义刷新面；check 面留白 | 复用四值域：已最新且自洽 → `none`；落后 → `refresh`；锁自洽不过 → `repair`（读作「若执行刷新将会做的事」） | **不自造第五个值**（自造 = 新契约偏离）；已在 §5.5 评审 #3 登记为文档待收口语义 |
| 3 | ① 取版本失败时的摘要取值 | 契约步序 ② 在 ① 之后 ⇒ 此时无 pin0 | 打印 `pin=(未知) -> (未知) registry=unknown`（字段恒在场） | 忠于契约步序（不在失败面偷读本地状态）；TC-37 只要求「摘要在场 + 含错误原因」 |
| 4 | 「冒烟输出含 target」的匹配宽度 | 契约原文 = 「输出**含** target」 | 逐字实现为子串匹配（**未**加版本边界） | 忠于契约字面；收紧 = 改写判据（属设计层裁定），已在评审 #5 登记 |
| 5 | 失败面回滚范围 | DD-26 明文 = 二元组（钉版 + 锁） | 只回写两文件；`node_modules` 树不参与回滚（体积原因） | 忠于 DD-26；已在评审 #6 登记「条文读者易误读」 |
| 6 | 开发期夹具（隔离 DSH_HOME 预置 `settings.json`） | 契约未涉 | 冒烟夹具预置 `modeChosen: true` / `lastModeVersion: "0.0.1"`，规避首次运行的模式选择**模态框**（阻塞主进程、需人工点击） | 夹具只影响 UI 弹窗，不影响后端启动链与判据；已如实披露 |
| 7 | 开发期工具落点 | 写域 = §2.5 表 4 档 | 冒烟/探针/故障注入 3 个 `.mjs` + 基线快照落 **`.thincoder/`**（`.gitignore:17` 忽略，零仓内足迹） | 先例 = B03 `.thincoder/b03-pet-calibrate-stub.mjs`；不在 `tests/`（契约 §2.3「不新增 tests/ 文件」不触） |

### 5.5 审计与代码评审轮次与终态

**轮次 1 · 内部发散审计（explore 子代理，read-only）**：结论 **DEVIATIONS**，🔴 0 / 🟡 1 / 🔵 6。核验通过面（审计自述「已核对无问题」）= ①–⑦ 步序逐步实现 · ②b/②c 幂等与修复面（含 TC-44 语义）· `--check` 三态 + 落后优先 + 只读承诺 · 失败面二元组写回与 `restore-fail` · AC16①②③ · AC20 · §一/§五 形态判据。

**fix round 1（由审计 🟡#1 + 🔵#2/#3 直接导出，3 项落地）**：

| 来源 | 问题 | 修复 |
|---|---|---|
| 审计 🟡#1 | catch-all（未预期异常）路径**不写回二元组** ⇒ ③ 之后抛异常会留半成品，与 DD-26 失败面统一形态相抵 | 新增模块级 `snapshot` + `pairTouched` 标记（③ 与修复面 ④ 前落标记）；catch-all 按标记补写回，写回失败落 `lock=restore-fail`（`scripts/refresh-dsh-bundle.js:283-290`） |
| 审计 🔵#2 | 冒烟只断言**首行**含 target（窄于契约「输出含」） | 改为对**全输出**断言（`out` 仍取首行供打印）（`:150-155`） |
| 审计 🔵#3 | 参数错路径无摘要行（「摘要行恒在场」破例） | 该路径补打摘要（`detail=bad-args: …`）（`:186-190`） |

**轮次 1 · 内部代码评审（advisor，同步）**：VERDICT **pass**，🔴 0 / 🟡 2 / 🔵 7；主机引文核验 1/1（`AGENTS.md:38` 行文与实测一致——该行 `package.json:13-24` 的 scripts 列举已随本次 +2 行漂移）。

**fix round 2（由评审 #4/#8 直接导出，2 项落地）**：

| 来源 | 问题 | 修复 |
|---|---|---|
| 评审 #4 | catch-all 摘要硬编码 `tag=latest registry=unknown`，忽略实传 `--tag`/`--registry` | 新增模块级 `ctx`（parseArgs / fetchTag 逐段落笔），catch-all 改报真实值（`:40-41` / `:191` / `:195` / `:201` / `:289`） |
| 评审 #8① | `--registry` / `--tag` 无条件吞下后继 token（`--registry --check` 会把 `--check` 当 URL，静默丢只读语义） | 取值以 `--` 开头即判漏值报错；顺带补齐 `--key=value` 形态（`:61-80`） |

**裁决落点（评审 #1–#9）**：`Fixed` = #4 · #8①（实现面）；
`Deferred`（承认，未修，已上报——写权不在实施者）= #1 #2（文档/台账行锚漂移，属 eng-designer / 主 agent 写域）· #3（`--check` 面 `action` 语义需契约侧收口）· #5（冒烟匹配宽度需设计层裁定）· #6（条文可读性）；
`Not an issue`（附证据答辩）= #7（「不得同时执行」设计只写纪律、脚本头部已声明）· #8②（`shell: true` 拼接为仓内先例 `scripts/ensure-deps.js:57` 形态，输入为维护者本机值）· #9（混合版本树与 NFR-5「精确钉版只钉主包」一致；§5.6 已登记证据口径）。
**无任一 🔴 处于未处置态。**

**终态 = `clean`**（实现面零未处置 🔴；2 🟡 文档面 + 2 🟡 台账/契约面均为 `Deferred` 并**已上报父侧**，非静默丢弃）。

### 5.6 残余风险 / 未覆盖项 / 范围外注记

**本批未闭环（如实登记，与设计 §2.5 L12 三条出批项一致）**：① 打包态（`npm run dist:win`）首启双态冒烟 —— 未执行（成本）；② `cd dsh-bundle && npm ci` 全量复现 —— **未执行**（分钟级 + 下载量；按任务书硬约束 4 默认不跑，是否补跑由用户定）；③ 把 `bundle:check` 挂进「App 发版流程清单」—— 无发版流程文档（`docs/TODO.md` T5），写权属主 agent。

**判据强度限制**：AC17 / AC19 的「主窗口为对话 UI（非 401 / 空页）」= **真机目视面**，本会话以「后端级 401 → 303+Cookie → 200 HTML 链路」+ 日志行替代，**未做人眼目视**；`--tag` 非 latest 频道（如 next）未做刷新面实测（只验证了 check 面：`--tag next` → 退出码 1）。

**范围外注记（发现即报告，未处置）**：

1. **AC18 的「零 `.js` 改动」在工作区不可直接评估**：实施期间有**并发会话**改动 `main.js` / `market.js` / `shell-market.js` / `shell-notify.js` / `shell-plugins.js` 并新增 `tests/b12-plugin-guards.test.js`（实施起点基线只含 `shell-affinity.js` / `shell-backend.js`）。⇒ 核 AC18 请按**本批 4 档归因**（`:5.1` 表 + 逐档 diff），勿按工作区快照。
2. `docs/requirements/SHELL.md:197` 的「当前内置 Harness = `0.1.0-rc.6`」前提已被本批改变（现树 = `0.1.5-rc.1`）；该档 B08 明令零改动（§2.7.2），故只报告。
3. `docs/design/AUTO-UPDATE.md:52/:564/:567/:618/:864/:980` · `docs/requirements/UPDATE.md:162/:186` · `docs/CONVENTIONS.md:160` · `AGENTS.md:38` · `docs/TODO.md:29`（T4）的 `package.json:NN` 行锚因本次 `scripts` +2 行整体漂移
   （现值：`"dependencies": {}` = `:27`；`build.files` = `:41-82`；`extraResources` = `:83-96`；dsh-bundle 复制块 = `:93-94`）；`docs/TODO.md` T10（本批承载项）待主 agent 勾销。
   他批文档（`docs/design/PET-ANIMATION.md` / `docs/batches/B18-*`）同源漂移一并登记。
4. `.test-dsh-home/.credentials.yaml`（`.gitignore` 内、非本批产物）含一条**明文 API Key**（值不落档）—— 属存量开发期目录，建议父侧择机提醒用户清理。
5. `scripts/ensure-deps.js` 的陈旧进程清理用 PowerShell 通配 `*dsh/lib/bin.js*`（正斜杠），对 Windows 反斜杠命令行路径**不匹配**（实测：用户正在运行的 `…\dsh\lib\bin.js` 未被清）；本批未触碰该档，仅报告。

### 5.7 段内形态规整（作者自注，非新增语义）

§5 追加落档后自检发现 4 行超宽（原 L305 / L320 / L356 / L370，401 / 402 / 364 / 431 字符）——违反 `docs/CONVENTIONS.md` §五「单行 ≤300 字符」（`§5` 不在豁免面：豁免仅台账 / 地图表格行 + 批次档 §3）。

- **处置**：由**本段作者**（eng-coder，同一会话）就地按句读断行重排这 4 行——**只动本段、未触碰 §1–§4 / §6**，字符内容零删减、语义未变（先例 = B01 §5.1 的同款形态规整）。
- **规整后实测**：§5 = 110 行 / >300 字符行 = **0**；全文 >300 字符行 = **4**（全在 §3 评审段 = 豁免面）。
- 另一处自检修正：摘要行示例中的会话 Cookie 前缀串已改写为占位 `<会话 Cookie>`（凭证值不落档，设计 §2.7 / 锚#6）。

## §6 验收核销（主 agent）

