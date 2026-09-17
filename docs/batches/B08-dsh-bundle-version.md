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

## §3 设计评审（评审子代理）

## §4 评审裁决与实施启动（主 agent）

## §5 实施记录（eng-coder）

## §6 验收核销（主 agent）

