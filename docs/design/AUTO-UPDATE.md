# 设计档 AUTO-UPDATE — 自动更新（App 本体 / Harness / 插件 / 发布侧）

> 归属板块：自动更新
> 落点：`docs/design/AUTO-UPDATE.md`
> 关联需求档：`docs/requirements/UPDATE.md`（US-1…US-10、NFR-1…NFR-4）
> 关联批次：`docs/batches/B02-auto-update.md`（§1.4 技术裁定、§1.5 验收 AC1…AC12、§1.6 事实、§1.7 既有约束）
> 　　＋`docs/batches/B04-harness-activate-fix.md`（§1.4 技术裁定三条、§1.5 验收 AC9 / AC9-b / AC13 / AC14、§1.6 实测事实、§1.7 既有约束；B04 修订面 = §2.0 偏差记录 / §2.1 选型 G / §2.2.1 / §2.2.4 / §2.2.9 / §2.3 / §2.4 / §3.1 / §3.2）
> 　　＋`docs/batches/B05-installer-cleanup.md`（§1.3 需求结论、§1.4 技术裁定、§1.5 验收 AC15 / AC15-b、§1.6 事实、§1.7 既有约束；B05 修订面 = §一 需求回指 / §2.2.3 / §2.2.4 / §2.2.9 / §2.3 / §2.4 / §2.5 / §3.1 / §3.2 / §3.3）
> 　　＋`docs/batches/B06-shell-ux.md`（§1.3 需求结论 C5、§1.4 技术裁定 R4；B06 修订面 = dev 更新门禁口径同步——注记落 §一 / §2.2.1 / §2.2.7 / §2.2.9 / §2.3 / §2.5 / §2.6 共七处）

---

## 一、需求层

本层只做回指与实现约束补充——需求条文的权威源在 `docs/requirements/UPDATE.md`，此处不重述。

| 需求条目 | 一句话 | 本设计中的承载节 |
|---|---|---|
| US-1 App 更新发现与提示 | 启动检查 + 6h 轮询 + 托盘手动；弹窗 / 气泡双形态 | §2.2.3、§2.2.7、§2.6 |
| US-2 App 下载与完整性校验 | 后台下载进度 + sha256 fail-closed | §2.2.3、§2.2.9 |
| US-3 App 安装与拉起 | 确认安装 → 安装器 + 退出；装完自动拉起 | §2.2.3、§2.6 |
| US-4 更新源统一 Gitee | 清单唯一源 Gitee raw；GitHub 残留全清 | §2.2.2 |
| US-5 检查纪律与开关 | 自动静默 / 手动可重试 / 开关零网络 / dev 不检查 | §2.2.3、§2.2.7 |
| US-6 Harness 更新 | latest dist-tag、-rc.N 比较、userData 安装、重启、回退 | §2.2.4、§2.2.6 |
| US-7 已装插件更新 | 版本对比徽标、单个/全部走 pnpm 通道、github: 原 spec 重装 | §2.2.5 |
| US-8 发布侧辅助脚本 | make-latest 一条命令 | §2.2.8 |
| US-9 更新全程数据安全 | 不破坏 ~/.dsh 配置/会话/插件 | §2.2.3、§2.2.4、§2.5 |
| US-10 App 更新安装包清理 | 下次启动回收 `userData/updates/` 全部条目；best-effort 不阻断启动 | §2.2.3、§2.2.9 |
| NFR-1 网络与开销 | https + 10s 无数据超时、轻量轮询、流式下载、并发守卫 | §2.2.3、§2.2.7 |
| NFR-2 安全 | sha256 fail-closed、pnpm integrity、冒烟测试 | §2.2.3、§2.2.4 |
| NFR-3 兼容 | 三平台共有 API、Windows 验收、dev 短路、旧清单容错 | §2.2 全节、§2.5 |
| NFR-4 可维护性 | 纯函数单点、更新域外置新模块、零新依赖 | §2.2.1、§2.3、§2.4 |

**设计必须正面处理的既有约束**（来自批次档 §1.7 与 B04 §1.4 / §1.7，已逐条对代码核实，证据为设计者亲读的现行行号）：

| # | 既有约束 | 证据（设计者亲核，现行行号） |
|---|---|---|
| C1 | 插件更新复用现有 pnpm 安装通道与其「停 dsh → 装 → 清理非法 bundle → 启 dsh」序列，不另造安装路径 | `main.js:1552-1590`（installPlugin）、`main.js:1611-1629`（restartBackend） |
| C2 | profile manifest 是对象 `{ dsh: { profile: { bundles: [...] } } }`，非数组；读不到不得拿空表覆盖 | `main.js:1367-1387` |
| C3 | `isPlainPackageName()` 拒绝 `github:`/`git+`/`link:` 原始标识写入 bundles——插件更新的版本对比须按 `resolveInstalledName()` 口径解析真实包名 | `main.js:1394-1419` |
| C4 | 下载/检查一律 https + 10s 超时（既有约定） | `main.js:336`、`main.js:347` |
| C5 | dev 模式不检查（`!app.isPackaged` 返回，现状保留） | `main.js:333` |
| C6 | `main.js` 已超 500 行拆分阈值（T2）——不顺手做大拆分；净增量显著时设计档须给出是否借机拆分的评估 | `main.js` 全文件 2638 行（B04 实施起点实测）；预估与实测的漂移见 `docs/batches/B02-auto-update.md` §6.4 |
| C7 | T3（`setPetEnabled()` 不可达）触发条件成立：设计档给出处置选项，供评审时用户裁定 | `main.js:1250-1255`（批次档 §1.6 事实 11 与 TODO.md T3 引用的 `1149-1154` 已因 B01 落地漂移——见 §2.5 观察项 O1） |
| C8 | `pet.js` / `pet.html` / `pet-preload.js` 为 B01 活跃文件，本批不触碰（托盘菜单在 `main.js` 侧） | 批次档 §1.7 |
| C9 | **B04：修复须覆盖全链**——激活 / 回滚 / 清理 / 启动清理四处同源机制（都以目录改名或删除实现）一并修正，仅修激活点会留下同族缺陷 | `updater.js:336-345`（激活）、`updater.js:411-422`（回滚）、`updater.js:425-433`（清理）、`updater.js:436-451`（启动清理）——设计者亲读 |
| C10 | **B04：测试层须补「激活后对活跃路径复测」**——本缺陷的漏检根因 = 既有冒烟只在安装面（`staging`）验，切换后再未校验实际解析结果 | `updater.js:318-329`（`harnessSmoke` 只跑 `paths.staging`）；`docs/batches/B04-harness-activate-fix.md` §1.4 裁定 2 |
| C11 | **B04：零新依赖**（`dependencies` 保持空数组）；**不改需求档**（AC9 条文不变，只细化判定面） | `package.json:23`（`"dependencies": {}`）；`docs/batches/B04-harness-activate-fix.md` §1.4 裁定 3 / §1.1 |
| C12 | **B04：`dshBinPath()` 对外语义不变**——打包版优先 userData 副本、出厂副本兜底；dev 分支不变 | `main.js:130-138`（现行实现）；设计处理见 §2.2.1「Harness 版本读数」（副本落点变化属实现形态，语义不变） |
| C13 | **B05：写入 / 删除面仍限 `userData`**（NFR-2）——回收只作用于 `userData/updates/`，不触碰安装目录、`~/.dsh`、系统临时目录 | `docs/batches/B05-installer-cleanup.md` §1.7；下载唯一落点 = `updater.js:118-120`（全仓 grep 字面量 `'updates'` 仅 `updater.js:118`（下载落点）与 `updater.js:462`（清理面）两处——设计者亲 grep） |
| C14 | **B05：`updater.js` 单函数 <300 行、文件 <500 行**（B04 终态 486 行——本批只能小幅增量） | `updater.js` 实测 486 行（`find /c /v ""` 口径；B05 实施起点）；`startupCleanup` 现状 15 行 |

> **B06 口径修订（2026-09-16；类别 = 语义变更，源 = `docs/batches/B06-shell-ux.md` §1.3 C5 / §1.4 R4）**：本表 **C5**（「dev 模式不检查…现状保留」）与 **C12**（「dev 分支不变」）的旧口径已被 B06 修订——dev 不再整体短路：**App 面**仅安装版（不执行 / 无 UI，记 `face=app skipped=dev`）；**Harness 面**检查 + 更新放行，`dshBinPath()` dev 分支改读活跃指针（兜底 `dsh-bundle/` 不变）。权威口径 = `docs/requirements/SHELL.md` §三 US-6 + `docs/design/SHELL-UX.md` §2.2.5。

---

## 二、设计层

### 2.0 偏差记录（B04 — Harness 更新激活失效）

> 本节记录 B02 交付后真机验收暴露的偏差（`docs/batches/B02-auto-update.md` §6.7），及其对原设计的否定面。
> **偏差记录只登记缺陷与否定假设**；修正后的机制正文以 §2.1 选型 G / §2.2.1 / §2.2.4 / §2.2.9 为准。

**现象**：Harness 更新全阶段 `ok=1`（prepare → install → smoke → activate → 后端重启成功），但激活后实际运行仍是**出厂内置副本**——
更新「报成功但不生效」（静默假成功）。用户看不出失败，也不会有任何提示。

**根因（单链，设计者实测坐实）**：

1. pnpm 在 Windows 的默认布局（`node-linker=isolated`）把依赖链接建成 **JUNCTION**；Windows junction **只能存绝对路径**（链接类型的真实限制，非 pnpm 的选择）。
2. 原子切换靠「目录改名」（`updater.js:339-340`：`userData/dsh → dsh-prev`、`staging → userData/dsh`）。改名后 staging 内的链接目标路径整体消失。
3. 因此 `userData/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js` 的存在性判定失败（`main.js:133-134`）→ 回退出厂副本（`main.js:135`）→ 旧版继续运行。

**证据（设计者亲测，非引用批次档）**：

| # | 证据 | 命令 / 指针 |
|---|---|---|
| E1 | 已激活副本内 **2455 条** junction，目标全部为绝对路径、且指向已消失的旧 staging | 命令 = `dir /AL /S .test-userdata\dsh` 的输出经 `find /c` 计数 → `2455`；单条目标串形如 `…\.test-userdata\dsh-update\staging\node_modules\.pnpm\@deepseek-ai+dsh@0.1.5-rc.1_…\node_modules\@deepseek-ai\dsh` |
| E2 | 失效面不止顶层依赖——`.pnpm` 内每一条依赖链接同为绝对路径 junction | 同命令输出（例：`.pnpm\@aws-crypto+sha256-browser@5.2.0\node_modules\tslib` → `…dsh-update\staging…`） |
| E3 | 出厂冻结树无此问题：`dsh-bundle/node_modules` 是 npm 平铺**实文件**布局，junction 数 = 0 | 命令 = `dir /AL /S dsh-bundle\node_modules` 输出经 `find /c` 计数 → `0`；`dsh-bundle/` 目录清单 = `node_modules`、`package-lock.json`、`package.json` |
| E4 | 四处同源机制全部以「改名 / 删除」实现 | `updater.js:336-345`、`updater.js:411-422`、`updater.js:425-433`、`updater.js:436-451`；布局常量 `updater.js:283-290` |
| E5 | 解析面只有存在性判定，无「活跃路径复核」；冒烟只跑安装面 | `main.js:130-138`；`updater.js:318-329` |
| E6 | 真机验收结论（缺陷平台 = Windows） | `docs/batches/B02-auto-update.md` §6.7「AC9 不通过」；`docs/batches/B04-harness-activate-fix.md` §1.6 事实 1–7 |

**否定的原假设**：

> **DD-3 的「目录改名 = 原子切换的安全原语」**——它隐含「已安装的运行时树是路径无关（self-contained）的」。
> Windows 上 pnpm 隔离布局**不满足**该前提：安装树内嵌绝对路径链接，**任何改名或移动都会使整棵树自失效**（E1/E2）。
> 修正后的不变量 = **I-1 版本目录落盘后永不改名/移动**（§2.2.4），实现 = DD-16。

**影响面（B04 修复覆盖，逐面 → 归属）**：

| 面 | 原实现 | 修正归属 |
|---|---|---|
| 激活 | `harnessActivate` 双 rename（`updater.js:336-345`） | §2.2.4 ⑤（活跃指针原子写） |
| 回滚 | `rollbackHarness` 删 + rename（`updater.js:411-422`） | §2.2.4 ⑦（指针回写） |
| 清理 | `cleanupHarnessPrev` 删 prev 目录（`updater.js:425-433`） | §2.2.4 ⑦（`cleanupHarnessStale`：回收非活跃版本目录） |
| 启动清理 | `startupCleanup` 删 prev / staging（`updater.js:436-451`） | §2.2.4 startupCleanup（+ 旧布局迁移/回收） |
| 活跃解析 | `dshBinPath` 直判 `userData/dsh`（`main.js:130-138`） | §2.2.1「Harness 版本读数」（指针解析；对外语义不变） |
| 激活后校验 | 无（只在安装面冒烟） | §2.2.4 ⑥（活跃路径复核 = DD-17 / AC9-b） |
| 测试面 | 冒烟只覆盖安装面 | §3.2 TC-26 / §3.3 故障注入用例 |

### 2.1 方案选型对比

判据取自需求层与批次档 §1.4 的技术裁定。

#### 选型 A —— App 更新通道：自研下载通道 vs electron-updater

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | 自研下载通道（扩展既有 `checkForUpdates` 模式：拉清单 → 下载 → sha256 → 安装器） | 零新依赖（NFR-4）；清单源自由指定 Gitee raw（US-4）；既有超时/静默降级先例可复用（`main.js:332-375`）；sha256 校验自持 | 需自写下载进度、校验、安装器拉起（本批新增 updater.js 约 350-400 行） | **选定** |
| 2 | electron-updater（generic provider 指向 Gitee） | 省下载/校验代码；但 generic provider 需自建静态托管（Gitee raw 非其标准协议）、需引入第三方依赖（NFR-4 违反）、GitHub provider 国内访问不稳（批次档 §1.4 事实） | 引入依赖 + 托管布局迁移，换取已在本仓验证过的能力 | 否决（批次档 §1.4 裁定留档） |

#### 选型 B —— Harness 更新方式：staged pnpm 全装 vs 单 tarball 就地覆盖

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | userData 独立目录 staged 安装：写带精确版本依赖的 package.json → 内置 pnpm install → 冒烟测试 → 原子切换激活 → 重启后端 | 依赖树完整（dsh 依赖 ~62 个 `@deepseek-ai/*` 包，批次档 §1.6 事实 5）；失败旧版零影响（激活前不改动现行副本）；可回滚（prev 副本） | pnpm 安装耗时数分钟（15 分钟超时，沿用 `installPlugin` 先例） | **选定** |
| 2 | 只下载 dsh 主包 tarball 就地覆盖 | 极快；但 dsh 的依赖版本随版本升级而演进，只换主包会留下不匹配的旧依赖树（出厂冻结树是 `0.1.0-rc.6` 配套，`dsh-bundle/node_modules/@deepseek-ai/dsh/package.json:22-83`） | 省时间，换来运行时崩溃风险 | 否决 |
| 3 | 写入安装目录（resourcesPath） | 安装目录可能是 Program Files（NSIS 允许自定义路径），普通权限写不进去 | — | 否决（批次档 §1.4 裁定留档） |

#### 选型 C —— 检查时机：启动 + 6h 轮询 vs 纯启动检查

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | 启动检查一次 + 运行中每 6 小时轻量轮询 + 托盘手动 | 用户已拍板 A 档（批次档 §1.3）；轮询发现新版走托盘气泡、不弹模态窗（AC2）；轮询只拉清单 JSON（NFR-1） | 长开应用每天 4 次轻量请求（<1KB 清单 + 数百 KB 元数据） | **选定**（用户裁决留档） |
| 2 | 纯启动检查 + 托盘手动 | 零轮询开销；但用户不重启就永远不知道有新版 | 省开销，损失「运行中发现新版」能力（与用户原话「如果我这边有提交，能不能直接告知用户」冲突） | 否决 |

#### 选型 D —— T3 处置（`setPetEnabled()` 不可达）：接入托盘开关 vs 删除死代码

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | 接入托盘开关（新增「显示桌宠」checkbox → `setPetEnabled()`） | `setMode()` 已把 `petEnabled` 绑定为 `mode === 'whale'`（`main.js:1141-1142`），独立开关制造三态不一致；`activate` 还无条件 `ensurePet()`（`main.js:1795`）——接线需重定义 petEnabled 与 mode 状态机 | 新增需裁决的产品开关 + 状态机改造，超出更新域 | 否决（用户裁定，2026-09-16） |
| 2 | 删除死代码（删 `setPetEnabled()` 函数本身，`settings.petEnabled` 键保留——`setMode()` 与启动路径仍读写它） | 零行为变化（全仓无调用者，已核实）；消除误导性死代码（残留即示范） | 无 | **选定**（用户裁定 A，2026-09-16） |

> **裁定（2026-09-16 用户批准，批次档 §4.3）**：T3 = **A 删除死代码**——删除 `setPetEnabled()`（`main.js:1250-1255`），`settings.petEnabled` 键与 `DEFAULT_SETTINGS` 保留；托盘菜单不新增桌宠开关（`setMode()` 为唯一模式入口，避免三态不一致）。

#### 选型 E —— 进度 UI 形态：专用更新窗口 vs 复用主窗口 vs 纯托盘

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | 专用小窗 `update.html`（440×260，不可缩放），App / Harness 两模式复用同一窗口 | 主窗口是 dsh web 应用（local URL），注入进度侵入性强且渲染层不受控；专用窗与既有 welcome/market/exchange 窗口先例同构（`main.js:1636-1667`）；进度/错误/按钮全落一处（AC3/AC4） | 新增 3 个前端文件 + build.files 登记 | **选定** |
| 2 | 复用主窗口注入 | 零新窗口；但 dsh 页面随时可能被用户导航/刷新，进度 UI 会被吞 | 省文件，换来 UI 丢失风险 | 否决 |
| 3 | 纯托盘（气泡 + 菜单文案展示进度） | 零窗口；但进度/重试/安装按钮无承载面，AC3「展示进度」与 AC4「可重试」不达标 | — | 否决 |

#### 选型 F —— Harness 依赖安装：pnpm 全装（npmmirror 优先）vs 复用 profile 工作区

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | 独立 staging 工作区（`userData/dsh-update/staging`）+ 内置 pnpm install（npmmirror，失败改 npmjs 重试一次） | 与 profile 工作区零耦合（不污染 `~/.dsh/profiles/web`）；共享 store（`dshHome()/pnpm-store`）省磁盘；npmjs 兜底对应 US-6 的「npmmirror 优先、npmjs 兜底」 | 首次安装拉全量依赖（分钟级，15 分钟超时） | **选定** |
| 2 | 在 profile 工作区 `pnpm add @deepseek-ai/dsh` | 复用既有 pnpm 通道；但会改写 profile manifest 的 dependencies——profile 是插件安装面（C2 防呆约束），Harness 不该混入 | 省代码，换来两个关注点耦合 + C2 风险 | 否决 |

> **选型 F 的 B04 修正**：候选 1 的「独立工作区」口径不变，**落点**由 `userData/dsh-update/staging` 改为 `userData/dsh-update/versions/<version>`（DD-16）——
> 理由见选型 G：安装树不再改名，故它必须一次性落到最终路径。其余判据（零耦合 / 共享 store / npmjs 兜底）不受影响。

#### 选型 G —— Harness 激活机制（B04 修正）

判据（取自 B04 §1.5 的 AC 与 §1.7 的约束）：**P1** Windows 真机激活生效 · **P2** 三平台共有语义不回退（NFR-3）·
**P3** 零新依赖（NFR-4）· **P4** 写入面限 `userData`（NFR-2）· **P5** 停-切-启序列保留 + 「全部成功才切换」不变式（US-6）·
**P6** 失败保留旧版可用且可回滚（AC13）· **P7** 结构面（单文件 ≤500 行 / 单函数 <300 行 / 可机检）·
**P8** 对 pnpm 链接语义的依赖强度（越低越好——本缺陷正是这类隐式假设造成的）。

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **版本化目录 + 活跃指针**：安装直接落 `userData/dsh-update/versions/<v>`（此后永不改名）；激活 = 原子写 `userData/dsh-active.json`；`dshBinPath` 按指针解析 | P1✓（目录不移动，链接目标恒有效）P2✓ P3✓ P4✓ P5✓（写指针比双 rename 更原子）P6✓ P7✓（逻辑外置、可 `node --test` 直驱）P8✓（与 pnpm 布局解耦） | 新增持久状态（指针）→ 需形态校验；需旧布局迁移；多版本占盘 → GC 兜底 | **选定** |
| 2 | pnpm `node-linker=hoisted`（平铺实文件 / 硬链接）+ 保留改名 | P1✓（hoisted 不建 junction，硬链接与路径无关；E3 的出厂树即此布局且打包后可用）P2✓ P3✓ P4✓ P5✓ P6✓ P7 中（改动最小） **P8✗**（仍以「pnpm 布局保证」为前提） | 一行配置换修复；但把「安装树可改名」的错误假设留在原地，且换上 B02 已验收形态之外的依赖解析布局（~62 包未测面） | 否决（治标 + 夹带行为变更） |
| 3 | 改名后重建链接：切换完成后重跑一次 pnpm 修链 | P1 存疑（`pnpm install` 在依赖已满足时是否重建 2455 条链接**未经实测**，不可断言）；**P6 ✗**（重建发生在切换**之后**——重建失败则活跃副本不可用，而 prev 已被消费，「失败保留旧版可用」不变式破裂）；P5 ✗（停机窗口 += 一次分钟级 pnpm 运行）；P8 ✗ | — | 否决（「不动现行副本」的不变式保不住） |
| 4 | 活跃指针做成**目录联接 / 符号链接**（`userData/dsh` → 版本目录），`dshBinPath` 不变 | P1✓ P3✓ P4✓ **P2✗**（win32 须 `'junction'`、POSIX 须目录符号链接——新增平台分支）**P5✗**（替换链接 = 删 + 建，非原子）P7✗（链接对权限 / 杀软更敏感） | — | 否决（形态仍是绝对路径链接，且切换非原子） |

> **选型结论（设计者推荐；评审提请 + 用户裁定）**：选型 G = **候选 1（版本化目录 + 活跃指针）**——
> 否决项驳回理由已逐项落表（候选 2/3/4），评审可据此复核；用户批准后本行改为「已裁定」。

#### 选型 H —— App 安装包回收的时机与范围（B05）

判据（取自 `docs/batches/B05-installer-cleanup.md` §1.3 / §1.4 / §1.5）：**Q1** 回收必须成功且不危及安装（AC15）·
**Q2** 不得改动下载 / 校验 / 重试语义（AC15-b）· **Q3** 写入删除面限 `userData`（NFR-2 / C13）·
**Q4** 零新依赖、零新增文件、`updater.js` < 500 行（C14）· **Q5** 可机检（fs 断言 + 日志）。

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **启动清理回收整目录**：范围 = `userData/updates/` 全部条目；时机 = 下次启动；失败面 = best-effort（占用跳过、下次再试） | Q1✓（居于安装器结束之后）Q2✓ Q3✓ Q4✓（就地改造 ≈5 行）Q5✓（取证行 + fs 断言） | 更新后**首次**启动可能因占用残留一份（下次启动清空，L9） | **选定**（DD-21 / DD-22；实现见 §2.2.3） |
| 2 | 即时删（`installApp()` 拉起后立刻删 / 安装器退出时删） | Q1✗（安装器运行期其自身 exe 被 Windows 锁定——删除必失败或危及安装）Q2✗（需引入安装器完成反馈，改动既有语义）Q5✗（无从机器取证「安装器何时结束」） | — | 否决（`docs/batches/B05-installer-cleanup.md` §1.4 裁定 1） |
| 3 | 维持现状（只删 `*.part`） | Q1✗——正是本缺陷：成品长期累积（`docs/batches/B05-installer-cleanup.md` §1.6 事实 1/3） | — | 否决（用户原话即「要清理安装包」，§1.2） |
| 4 | 下载落点移出 `userData/updates/`（如落 OS 临时目录由系统回收） | Q2✗（换落点 = 改既有语义）Q3✗（NFR-2 明文「临时文件只落 `userData/updates`」） | — | 否决（违 NFR-2 / `docs/batches/B05-installer-cleanup.md` §1.7） |
| 5 | 回收面扩到 `userData/` 其它暂存物（`updater.log` 等） | Q2✗（超出 US-10「安装包回收」范围） | — | 否决（范围外） |

> **选型结论（B05）**：选型 H = **候选 1（启动清理回收整目录）**；否决项驳回理由已逐项落表（候选 2–5）。实现面细则（产物形态 / 时机理由 / 失败面 / 取证行）落 §2.2.3「App 安装包回收（B05）」。

### 2.2 架构与契约

#### 2.2.1 模块边界与职责

| 模块 | 类型 | 负责 | 不负责 |
|---|---|---|---|
| `update-lib.js`（新） | 纯函数模块（无 Electron 依赖，可被 `node --test` 直接加载） | `compareVersions(a,b)`；`parseRegistryMetadata(json)` → `{ latest, tarball, integrity }`；`decideUpdate(latest, current)` | 不做任何 IO |
| `updater.js` | 主进程模块（可 require electron） | App 检查/下载/校验/安装器；Harness 检查与安装编排（prepare/install/smoke/激活/回滚/清理）；取消中止；写 `updater.log`（updater 域阶段行） | 不弹对话框/管托盘窗口（回调上报）；不管插件更新；不管后端停/启；**不做版本库布局与链接细节（B04 起归 harness-store.js）** |
| `harness-store.js`（新，B04） | 纯 Node 模块（无 Electron 依赖，可被 `node --test` 直接加载） | Harness 运行时版本库：目录布局常量；活跃指针读写（原子）；活跃副本解析（`resolveActiveBin`）；版本目录准备；**激活后复核**（存在性 / 版本读数 / 冒烟——冒烟 runner 注入）；指针回滚；旧布局迁移与版本 GC | 不做网络/子进程/超时（runner 由 updater.js 注入）；不写日志（返回结果，由 updater.js 落行）；不碰 App 更新与插件域 |
| `main.js`（改） | 主进程编排 | 托盘菜单（检查更新/自动检查开关）、对话框与气泡、更新窗口生命周期（含取消转发）、6h 轮询调度、`dshBinPath` 按活跃指针解析（副本 → 出厂兜底）、插件更新的版本对比与 IPC、Harness 停-切-启编排（`stopDsh()` + `restartBackend()`）、编排域 updater.log 行（dsh active / backend ready）、设置持久化 | 下载/校验/安装的底层逻辑（全在 updater.js）；版本库布局与指针细节（在 harness-store.js） |
| `update.html` / `update.js` / `update-preload.js`（新） | 渲染层 | 渲染状态与进度（`upd:status` 推送）、按钮事件回发 | 不决策（纯展示） |
| `market.js` / `market.html` / `market-preload.js`（改） | 市场前端 | 更新徽标、单个/全部更新按钮、结果 toast | 版本对比（主进程算好下发） |
| `make-latest.js`（新） | 发布侧脚本 | 算 sha256、生成 latest.json、打印上传清单 | 不上传 |

**`updater.js` 接口契约**（main.js 是唯一调用方；回调均为主进程函数）：

```
init(ctx)：注入 { manifestUrl, registryUrls, dirs:{userData, dshHome},
              runtime:{nodeExe, pnpm}, log, getCurrentVersion, getCurrentDshVersion }
checkAppUpdate({reason})     → { status:'update-available'|'up-to-date'|'error', info?:{version,note,url,sha256} }
downloadApp(info, onProgress) → { ok, file } | { ok:false, error }   // 流式下载 + sha256 校验一体
installApp(file)              → 拉起安装器（win32 spawn；darwin/linux shell.openPath）
cancelAppDownload()          → 中止在途 App 下载并清 .part 临时文件 → 上报 canceled（可重试）
checkHarnessUpdate({reason})  → { status, latest?, current?, tarball?, integrity? }
installHarness(latest, onPhase) → { ok, activated } | { ok:false, error }   // 不含后端停/启（停-切-启由 main.js 编排）
cancelHarnessInstall()       → 中止在途 Harness 安装（kill pnpm 子进程）并清**非活跃**目标版本目录 → 上报 canceled（可重试）
                                 提交点（⑤ 指针写入）之后取消**不生效**：回 { ok:true, canceled:false }，不删活跃目录、
                                 不回写指针（已提交的激活由 ⑥ 复核失败 / ⑦ 重启失败给终态）——杜绝「删活跃副本 + 留悬空指针」
rollbackHarness()             → 激活后复核失败或重启失败时，把活跃指针回写上一版本（无上一版本 → 清指针 = 回出厂）
cleanupHarnessStale()         → 成功重启后回收非活跃版本目录与旧布局残留（原名 cleanupHarnessPrev）
startupCleanup()              → 启动时清残留（App `.part` + 版本库迁移与 GC）
```

**`harness-store.js` 接口契约**（B04 新增；纯 Node，调用方 = updater.js 与 main.js）：

```
layout(userData)               → { root, versionsDir, pointerPath, legacyActive, legacyPrev, legacyStaging }
assertVersionName(version)    → 仅合法版本名可用于目录名（白名单正则，防路径穿越）；非法 → throw
binPathIn(dir)                 → <dir>/node_modules/@deepseek-ai/dsh/lib/bin.js
readPointer(userData)          → 指针对象 | null（形态校验：`version` 合法、`dir` 为 userData 相对路径且不含 `..`；`prev` 同校验）
writePointer(userData, entry)  → 原子写：写 `dsh-active.json.tmp` 后 `renameSync` 覆盖（同卷原子replace）
readVersionIn(dir)             → 读副本 `package.json.version` | null
resolveActiveBin(userData)     → 活跃 bin.js 绝对路径 | null（指针副本 → 旧布局 `userData/dsh` 可解析副本 → null）
prepareVersionDir(userData, version) → 建 `versions/<version>/` + 精确版本依赖 package.json，返回 dir
verifyActive(userData, version, runVersion) → { ok, stage:'resolve'|'version'|'smoke', detail }   // runVersion(bin) → { code, output }
activate(userData, version, runVersion)     → { ok, mode:'activated'|'restored'|'factory'|null, stage?, detail? }   // 复核失败时 mode = 其内部 rollback() 的返回
                                              指针写入失败（提交点前）→ { ok:false, mode:null, stage:'pointer', detail:'pointer-fail:…', rolledBack:false }
                                              （指针未变、不回滚、不落 phase=rollback 行；已提交的失败面见 §2.2.4 ⑥）
rollback(userData)                          → { ok, mode:'restored'|'factory' }   // restored = 指针回写 prev；factory = 清指针 = 回出厂
cleanup(userData)                           → { active, removed:[…], adopted }
```

> **日志归属**：`harness-store.js` 不写日志、不读 `ctx`——它只返回结果；日志行由 `updater.js` 按返回值落笔（§2.2.9）。
> 这样版本库逻辑（含故障注入面）可在不起 Electron、不 spawn 子进程的条件下被 `node --test` 直驱（§3.3）。

> 取消实现（评审 #3）：AbortController 由 updater.js 内部按操作持有——每轮下载/安装各建一个 signal，不跨操作复用、不经 init(ctx) 注入；取消与失败同面：清临时文件、释放并发守卫（§2.2.7）、回到可重试态。

**Harness 版本读数与活跃路径解析**（B04 修正）：

- `getCurrentDshVersion()` 口径不变——读 `dshBinPath()` 解析结果的 `package.json.version`（`main.js:353-360`）。
- `dshBinPath()`（`main.js:130-138`）打包分支改为三档解析：① `harness-store.resolveActiveBin(userData)`（活跃指针副本；无指针时兼容旧布局 `userData/dsh` 的可解析副本）→ 命中即返回；② 出厂 `resourcesPath/dsh/...` 兜底。dev 分支逐字不变。
- **B06 口径修订（2026-09-16；类别 = 语义变更，源 = `docs/batches/B06-shell-ux.md` §1.3 C5 / §1.4 R4）**：上一条的「dev 分支逐字不变」已被修订——dev 分支改读活跃指针（与打包分支同口径；兜底仍为 `dsh-bundle/`）。权威口径 = `docs/requirements/SHELL.md` §三 US-6 + `docs/design/SHELL-UX.md` §2.2.5。
- **对外语义保持**（C12）：打包版优先 userData 副本、出厂副本兜底；仅副本落点由 `userData/dsh` 变为 `userData/dsh-update/versions/<version>`（属实现形态变化）。
- **解析不依赖 `updater.init(ctx)`**：`dshBinPath()` 在 boot 早期即被 `resolveRuntime()` 调用（`main.js:199`，位于 `startDsh()` `main.js:193`；boot 路径 `main.js:2277`），而 `updater.init()` 在 `scheduleUpdateChecks()` 内（`main.js:586`）。故 `resolveActiveBin(userData)` 以 userData 路径为**显式入参**，不读模块级 `ctx`。

#### 2.2.2 清单 schema 与源地址

**App 清单（latest.json，新 schema）**：

```json
{
  "version": "0.0.1",
  "note": "更新说明（弹窗 detail 全文展示）",
  "urls": {
    "win32": "https://github.com/ludonghuai/big-fish/releases/download/v0.0.1/Bigfish.Setup.0.0.1.exe",
    "darwin": "https://github.com/ludonghuai/big-fish/releases/download/v0.0.1/Bigfish-0.0.1-arm64.dmg",
    "linux": "https://github.com/ludonghuai/big-fish/releases/download/v0.0.1/Bigfish-0.0.1.AppImage"
  },
  "sha256": {
    "win32": "<64 位 hex>",
    "darwin": "<64 位 hex>",
    "linux": "<64 位 hex>"
  }
}
```

> **注（2026-09-16 托管定案）**：安装包二进制托管在 GitHub `ludonghuai/big-fish` Releases——Gitee 发行版附件单文件上限 100MB，装不下约 276MB 的安装包；清单唯一源不变（Gitee raw），`urls` 仅指向 GitHub 附件。项目由新维护者接手、版本自 0.0.1 重新计数；旧仓 `turtle2209/Bigfish` 的 0.1.x 用户不维护、不做过渡。

- 清单唯一源：`https://gitee.com/ludonghuai/big-fish/raw/main/latest.json`（替换 `main.js:50-53` 的 jsdelivr/raw.githubusercontent 双源）。
- 向后兼容：旧客户端只读 version/note/urls，多出的 sha256 段无害；新客户端遇缺 sha256 段 → 按 NFR-2 拒装并明确报错（fail-closed，不崩溃）。
- 插件注册表兜底源：`main.js:1319` 的 jsdelivr → `https://gitee.com/ludonghuai/big-fish/raw/main/plugins.json`；主站 `awesome-dsh-plugin.com` 不变；`main.js:1670` 注释与 `market.js:473` 的「精选镜像目录（GitHub）」标签同步改「Gitee」。
- GitHub 残留清理清单（AC6 机检面）：`main.js:50-53`（清单源）、`main.js:1319`（注册表兜底）、`latest.json:5-7`（安装包 URL）、`market.js:492`（link-repo）、`package.json:11`（homepage）。**允许保留**（非更新源）：`github:` 安装标识与插件来源文案（`market.js:97-105`、`main.js:1565/1586`）、`plugins.json` 内插件主页 URL（插件数据）。

**测试钩子（env 覆盖，供 AC1-AC4 假清单桩与 AC2 短轮询）**：

| env | 作用 | 默认 |
|---|---|---|
| `BIGFISH_UPDATE_URL` | App 清单 URL 覆盖 | Gitee raw URL |
| `BIGFISH_UPDATE_INTERVAL_MS` | 轮询间隔覆盖 | `21600000`（6h） |
| `BIGFISH_DSH_REGISTRY_URL` | Harness 元数据 URL 覆盖（npmmirror 位） | 未设 |
| `BIGFISH_DSH_REGISTRY_FALLBACK_URL` | Harness 兜底元数据 URL 覆盖（npmjs 位；供源回退断言，TC-24） | 未设 |

> **https 豁免声明（评审 #1）**：https + 10s 超时约束（C4 / NFR-1）适用于出厂默认源；上表 env 覆盖为开发/验收钩子——仅此面允许 `http://127.0.0.1`（本地桩），出厂源的 https 约定不变。两个 registry env 分别映射 `init(ctx).registryUrls` 的 npmmirror 位与 npmjs 位；未设时保持出厂对（npmmirror → npmjs）。

#### 2.2.3 App 更新流程

```
触发：启动后 5s（沿用 main.js:1780 时点）/ 每 6h 轮询 / 托盘「检查更新」
门禁：app.isPackaged && （reason=manual || settings.autoCheckUpdates）
      && 无在途检查 && 无在途下载

checkAppUpdate:
  fetch(manifestUrl, AbortController 10s 无数据中止)
  → 解析 version/note/urls[platform]/sha256[platform]
  → compareVersions(latest, app.getVersion()) > 0 → update-available

发现后的呈现（reason 分支）：
  startup → 模态弹窗：『发现新版本 v{latest}』+ note + 当前版本 → [立即更新|稍后再说]
  poll    → 托盘气泡『发现新版本 v{latest}，点击查看』（点击气泡 → 同一弹窗）；不弹模态
  manual  → 同一弹窗（无更新则气泡『已是最新版本』；出错则错误弹窗[重试|取消]）

downloadApp（用户点「立即更新」后，main.js 打开更新窗口并调用）:
  流式 fetch → userData/updates/Bigfish-Setup-{v}.exe.part
  → 完成改名 .exe → crypto sha256 流式校验 vs manifest sha256[platform]
  → ok：窗口状态 ready（显示『安装并重启』按钮 + UAC/安装选项提示）
  → fail/缺 sha256：删文件 → 窗口错误态（错误信息 + [重试|关闭]）

installApp（用户点「安装并重启」）:
  win32：spawn(安装器, [], {detached:true, stdio:'ignore'}) → quitting=true → 800ms 后 app.quit()
  （先例：uninstall() main.js:302-315；NSIS runAfterFinish=true 已配置，package.json:85，装完自动拉起新版）
  darwin/linux：shell.openPath(安装包)（打开 dmg/AppImage，不自动退出；不承诺专项验证，NFR-3）

up-to-date（manual）：气泡『已是最新版本』
error（auto）：仅写日志（静默）；error（manual）：错误弹窗 + 重试循环
（与下载/安装并行的启动回收面：main.js:600 → startupCleanup 回收 userData/updates/ 的全部条目——见下「App 安装包回收（B05）」）
```

**downloadApp 的进度与超时**：用 `fetch`（Electron 主进程内置，先例 `main.js:1679`）+ `response.body` 异步迭代计数；`Content-Length` 取总量算百分比；每收到一个 chunk 重置 10s 无数据定时器（总时长不限）。下载目标平台 URL 取自 `urls[process.platform]`，缺该平台 URL → 明确报错「该平台暂无安装包」。

**App 安装包回收（B05 — 启动清理；DD-21 / DD-22；详解落此处，§2.2.4 只回指）**

- **落点与产物**：App 下载唯一落点 = `userData/updates/`（`updater.js:118-120`）——流式写 `path.basename(url) + '.part'`（`fileBase` = `updater.js:117`，**不保证有扩展名**：假源桩 URL `/installer` 即产出无扩展名的成品 `updates/installer`，实证 `.test-userdata/updater.log:4`）→ 校验前改名去 `.part`（`updater.js:159`）。
- **回收范围 = 该目录全部条目**（文件与子目录一律递归删；目录本身保留）：既有实现只删 `*.part`（`updater.js:465`）——已完成的安装包因此长期留在磁盘（`docs/batches/B05-installer-cleanup.md` §1.6 事实 1/3；设计者亲验实证 = `.test-userdata/updates/installer`，4125 字节，立于 2026-09-16 13:17、历三次启动（`updater.log:7/19/29`）未被回收）。
- **时机 = 下次启动**（为什么不是即时删）：安装器由 `installApp()` 以 `spawn(…, {detached:true})` 拉起后应用随即退出（`updater.js:191-206`／`upd:install-now` 处理器 `main.js:2781-2787`），此刻安装器仍在运行、其**自身可执行文件被 Windows 锁定**——即时删会失败或危及安装；启动清理天然居于「安装器已结束」之后（裁定依据 = `docs/batches/B05-installer-cleanup.md` §1.4）。
- **失败面 = best-effort**：单条删除失败（占用 / 权限）不抛、不阻断启动，本次跳过、**下次启动再试**（与 Harness 版本 GC 同口径，L7）。占用是**正常路径下的常见情形**——安装器 `runAfterFinish` 拉起新版时其 exe 可能仍被自身进程锁定，故「首次启动残留 → 下次启动清空」是设计内行为，不是缺陷。
- **无状态损失**：`pendingAppFile` 为进程内变量（`main.js:343` 声明、`main.js:468` 赋值），跨启动不可达——被回收的「已下载未安装包」在重启后本就不存在可用引用，用户重走「检查更新 → 下载」即既有「可重试」语义（US-2 / US-5）。
- **不引入 in-flight 守卫**：唯一调用点 = boot（`main.js:600`，在 `scheduleUpdateChecks()` 内 `init(ctx)` 之后），此刻无在途 App 下载（下载只在用户确认后触发）；与 Harness 面「`harnessInstallInFlight` → 跳过本轮」（`updater.js:469`）不同，那一处因 `runStoreCleanup()` 会在成功重启后再被调用、可与安装在途重叠。
- **取证行**：`update cleanup type=app removed=<n> failed=<m>`（§2.2.9）；恒在场——无条目 / 目录不存在时 `removed=0 failed=0`（可区分「清理跑了且本空」与「清理没跑」）；**枚举失败**（目录存在但不可读 / 非目录——`readdirSync` 抛非 `ENOENT` 错）时 `removed=0 failed=0 detail=read-fail`（评审 #1：与「本空」在行上可分辨）；唯一触发，故不设 `reason=`。
- **实现形态（供 coder）**：`startupCleanup` 内 App 面改为「逐条 `rmSync(recursive/force)` + 成功 / 失败各计数」；枚举结果按**两类分别落账**（评审 #1）——
  ① **目录不存在**（`readdirSync` 抛 `ENOENT`）→ 归入「无条目可回收」（`removed=0 failed=0`），**仍落取证行**；
  ② **枚举失败**（`EACCES` / `EPERM` / `ENOTDIR` 等非 `ENOENT` 错误）→ `removed=0 failed=0 detail=read-fail`，**不并入 `failed`**（`failed` 只计**条目级**删除失败，与 `removed` 同口径、二者之和 ≤ 枚举到的条目数）。
  两类均 best-effort：不抛、不阻断启动（AC15）。`updater.js:458-460` 的 `rm` 辅助函数只被该循环使用（全文件唯一调用点 = `updater.js:465`），随之退场。
- **既有语义零改动**：下载路径 / `.part` → 成品改名 / sha256 fail-closed / 取消清 `.part` / 重试 = 重新下载，逐条不变（AC15-b）。

#### 2.2.4 Harness 更新流程

**版本库布局（B04 修正，DD-16）**——原「staging → 改名激活」布局作废：

```text
userData/
  dsh-active.json              活跃指针：{ version, dir, prev:{version,dir}|null, activatedAt }
  dsh-update/
    versions/<version>/        运行时树（pnpm 安装直接落此；落盘后永不改名、永不移动）
    staging/                   旧布局遗留；不再创建，启动清理回收
  dsh / dsh-prev               旧布局遗留；不再创建，启动清理按规则采纳或回收
```

- **I-1（不变量）**：任何已落盘的版本目录**不得改名 / 移动**——Windows junction 只能存绝对路径，改名即整树失效（§2.0 E1/E2）。
- **I-2（单一判据）**：活跃副本的判定**只有一处**——`dsh-active.json`；解析、日志、清理共用 `harness-store` 同一判据。
- 指针 `dir` 一律为 **userData 相对路径**（不存绝对路径——userData 迁移后指针仍有效）；`prev` 只记一层（回滚仅一级）。

```
checkHarnessUpdate（与 App 检查同触发、同门禁；auto 静默 / manual 明确）:
  fetch(npmmirror 元数据) → 失败 → fetch(npmjs 元数据)
  → parseRegistryMetadata: dist-tags.latest + versions[latest].dist.{tarball, integrity}
  → current = getCurrentDshVersion()（出厂 0.1.0-rc.6 / 已更新副本的版本）
  → compareVersions(latest, current) > 0 → update-available

发现后的呈现：manual → 弹窗『发现 Harness 新版本 v{latest}（当前 v{current}），更新需数分钟』
  → [立即更新|稍后再说]；auto → 气泡（点击 → 同一弹窗）

installHarness（用户确认后，main.js 打开更新窗口 harness 模式并调用；停-切-启由 main.js 编排）:
  ① 准备：prepareVersionDir(version) → userData/dsh-update/versions/<latest>/
     先清同名目录（重试 / 半成品场景）→ 写 { name:'dsh-runtime-update', private:true,
     dependencies:{ '@deepseek-ai/dsh': '<latest 精确版本>' } }
     守卫：目标目录 == 当前活跃目录 → 直接失败（绝不在活跃目录原地重装；归属 = ① prepare 步，
     日志 phase=prepare ok=0 detail=guard-active-dir，形态见 §2.2.9）
  ② runCmd(runtimeNodeExe, [bundledPnpmPath,'install','--dir',<版本目录>,
     '--config.registry=npmmirror','--store-dir',dshHome()/pnpm-store])，15 分钟超时（先例 installPlugin）
     → 非零退出 → 改用 npmjs registry 重试一次 → 仍失败 → 清版本目录 → 失败（旧版零影响，可重试）
  ③ 冒烟（安装面）：runCmd(runtimeNodeExe, [<版本目录>/…/dsh/lib/bin.js, '--version']) → exit 0 且含 latest
     （dsh 支持 -V/--version：dsh-bundle/node_modules/@deepseek-ai/dsh/lib/bin.js:77）
  ④ 停后端（main.js 编排，先于激活；口径不变——对齐 C1「停 dsh → 装 → 启 dsh」的停止-切换次序，
     停-切-启序列保留）：调 `stopDsh()` + 1.5s 落定——即 `restartBackend()`（`main.js:2177-2194`）的停止面。
     依赖安装与冒烟不触碰现行副本，可在后端运行中进行（停机窗口最小化）
  ⑤ 激活 = **写活跃指针**（不移动任何目录）：读旧指针 → 原子写
     { version:<latest>, dir:'dsh-update/versions/<latest>', prev:<旧指针身份|null>, activatedAt }
     写失败（磁盘 / 权限）：指针保持原样 → phase=activate ok=0 → 旧版照常（TC-25）
     ★ 取消窗口（评审 #1）：指针写入 = **提交点**——提交点之前（prepare / install / smoke / stop-backend）取消生效
     （kill pnpm 子进程 + 清 versions/<latest> + 后端已停则 main.js 重启后端）；提交点之后取消**不生效**
     （不删活跃目录、不回写指针——已提交的激活由 ⑥ 复核失败 / ⑦ 重启失败两条路径给终态，不留悬空指针）
  ⑥ **激活后复核**（DD-17 / AC9-b）——verifyActive(userData, latest, runVersion)：
     ⓐ 解析存在性：resolveActiveBin(userData) 命中，且等于目标版本目录的 bin.js（非出厂路径、非其它版本）
     ⓑ 版本读数：该副本 package.json.version == latest
     ⓒ 冒烟：node <活跃 bin.js> --version → exit 0 且输出含 latest（证明副本内依赖链可解析）
     任一不满足 → **由 activate() 内部调 rollback()**（执行层 = harness-store 同层）：指针回写 prev
     （无 prev → 清指针 = 回出厂）+ 删该版本目录；updater.js 按返回值落**两行**（落笔层 = updater.js）：
       phase=activate ok=0 detail=verify-fail:<stage>   ·   phase=rollback ok=1 detail=restored:<prev 版本>|factory
     （rollback 行只在已提交〈指针已写〉的失败面出现；⑤ 写失败时指针未变 → 只有 phase=activate ok=0 detail=pointer-fail:…）
     → 返回错误（旧版照常、可重试）
  ⑦ 成功返回 { ok:true, activated:true } → main.js 记 `harness activate dsh active path=<P> version=<V>` →
     调 `restartBackend()`（`main.js:2177-2194`；dshProcess 已置空、其停止面为无操作，实际 = startDsh + 主窗口 reload）
     → 记 `harness restart backend ready port=<n>`
     重启成功 → cleanupHarnessStale()（回收非活跃版本目录 + 旧布局残留）
     重启失败 → rollbackHarness()（指针回写 prev / 清指针）→ 再 restartBackend() → 窗口错误态
startupCleanup：应用启动时 ① 回收 App 面 `userData/updates/` 的**全部条目**（best-effort，取证行 `update cleanup type=app removed=<n> failed=<m>`——机制详见 §2.2.3「App 安装包回收（B05）」）；② `harness-store.cleanup(userData)`：
  旧布局采纳（`userData/dsh` 可解析且无指针 → 写指针采纳，日志 `harness migrate legacy=adopted version=…`）
  旧布局回收（`userData/dsh` 不可解析〈本缺陷产物〉→ 删，日志 `legacy=removed`；
            `userData/dsh` **可解析但非活跃**（指针存在且 dir 不指向它，评审 #3）→ 与不可解析同处置：归入旧布局残留回收，
            日志 `legacy=removed`——「非活跃即回收」是同一判据（I-2），不保留第二份未被指针引用的副本（磁盘泄漏 + 归属不确定）；
            `userData/dsh` **可解析但版本读数不可得**（`bin.js` 在、而 `@deepseek-ai/dsh/package.json` 缺失 / 损坏）→ 按**回收**处置
            （采纳需可读版本号写入指针 schema，版本不可读则采纳不可能——与「非活跃即回收」同一判据；日志 `legacy=removed version=unknown`；
            该状态本 App 不产出，属防御面）；
            若指针 prev 仍引用它，回收同时把 prev 置 null（不留悬空 prev——批次档 §2.4 硬约束 6）；
            `dsh-prev`、`dsh-update/staging` 一律删）
  版本 GC（删 versions/* 中非活跃者；指针不可解析 → 先清指针，再按非活跃处理）
  **不误删现行副本**：活跃判据 = 指针（I-2）；安装在途（harnessInstallInFlight）→ 跳过本轮清理
```

- 目录落点全部在 `userData`（`userData/dsh*`、`userData/updates`；Harness 运行时树 = `userData/dsh-update/versions/*`），不写安装目录、不写系统临时目录（NFR-2）。
- 依赖安装经 pnpm 自带注册表 integrity 校验（pnpm 安装时校验 dist.integrity）。
- `DSH_BUNDLED_SKILL_DIR`（`main.js:141-143`）指向 App 自带 bundled-skills，与 Harness 版本无关——新副本启动后照常注入。
- **磁盘回收**：非活跃版本目录在下次启动或下次成功重启后回收（`cleanupHarnessStale` / `startupCleanup`），不保留版本栈（US-6 无「自选版本回退」需求）。
- **两处冒烟的分工**（DD-17，二者不可互相替代）：③ 的冒烟跑**安装面**（版本目录自身，此时后端仍在运行）——尽早判掉坏包与依赖不齐；
  ⑥ 的冒烟跑**活跃解析路径**（切换之后）——证明 `dshBinPath()` 将来的取值确实可运行。本缺陷的漏检根因正是只有 ③（C10）。

#### 2.2.5 插件更新流程

```
market:list（main.js:1903-1912 扩展）→ 响应新增 updates: [{ id, name, updateSpec, latestVersion, installedVersion }]
  计算（主进程，全部本地+已拉取的注册表数据）：
    for 注册表原始条目 p（有 version 字段且 >''）：
      spec = p.npm || install 字段匹配出的 github:/link: 标识（与 market.js:94-128 同口径）
      spec 为 builtin: / link: / 空 → 跳过
      realName = resolveInstalledName(spec)（main.js:1405-1419，C3 口径）
      installedVersion = 读 profileDir()/node_modules/{realName}/package.json.version（读不到 → 跳过并记日志）
      compareVersions(p.version, installedVersion) > 0 → 加入 updates
      id = (p.name || p.npm || spec || '').replace(/\s+/g,'-').toLowerCase()
        （与 market.js normalizePlugin 的 id 口径一致，供前端按 id 匹配卡片）
      updateSpec = spec 为 github: → spec 原样（按原 installSpec 重装）
                 = npm 名 → `{realName}@{p.version}`（精确装到注册表宣告的版本）

market:update (updateSpec)  → installPlugin(updateSpec)（main.js:1552-1590，复用 pnpm 通道）
  → restartBackend() → 返回结果
market:update-all → 重新 fetchPluginRegistry() 重算 updates → 逐个 installPlugin
  → 全部完成（含部分失败）后一次 restartBackend() → 返回逐项结果数组
```

- 版本对比与更新规格全部在主进程计算，前端只按 `id` 匹配渲染（避免 normalize 逻辑双份漂移）。
- 内置插件（builtin:）随 App 包更新，不参与（US-7 边界）。
- `installPlugin` 内部已有 realName 解析与 bundles 防呆（C2/C3），更新路径零新增 manifest 写入点。

#### 2.2.6 版本比较语义（-rc.N）

`compareVersions(a, b)`（唯一实现，`update-lib.js`；替换 `main.js:320-330` 的纯数字点分——其遇 `0.1.5-rc.1` 会 NaN 化而误判）：

- 拆分：`0.1.5-rc.1` → 数字段 `[0,1,5]` + 预发布段 `[rc,1]`；无 `-` 则预发布段为空。
- 数字段逐位比较（与现逻辑同）；位数不足补 0。
- 数字段相等时：预发布段空的一方更大（正式版 > 预发布）；双方都非空 → 逐标识符比较——纯数字标识符按数值比、数字标识符 < 非数字标识符、非数字按字典序、前缀相等时短者小（semver 口径）。
- 数字段某位非数字（畸形输入）→ 该位按 0 处理（沿用现状 `pa[i] || 0` 的宽松口径，不抛异常）。

**断言表（AC8 单元断言的固定用例）**：

| a | b | 期望 |
|---|---|---|
| `0.1.5-rc.1` | `0.1.0-rc.6` | > 0（AC8 出厂比对） |
| `0.1.5-rc.2` | `0.1.5-rc.1` | > 0 |
| `0.1.5` | `0.1.5-rc.1` | > 0（正式版 > 预发布） |
| `0.1.5-rc.1` | `0.1.5` | < 0 |
| `0.1.5-alpha.1` | `0.1.5-rc.1` | < 0 |
| `0.1.5-rc.10` | `0.1.5-rc.9` | > 0（数值非字典序） |
| `0.1.3` | `0.1.2` | > 0（App 版本形态） |
| `0.1.10` | `0.1.9` | > 0 |
| `1.2` | `1.2.0` | = 0 |
| `0.1.5-rc.1` | `0.1.5-rc.1` | = 0 |

#### 2.2.7 调度、开关与并发守卫

- **设置**：`DEFAULT_SETTINGS`（`main.js:75-83`）新增 `autoCheckUpdates: true`；托盘新增 checkbox「自动检查更新」（`rebuildTrayMenu`，`main.js:1201-1236`）→ `settings.autoCheckUpdates = item.checked; saveSettings(); rebuildTrayMenu()`。持久化复用既有 `settings.json` 封装（`main.js:86-103`）。
- **调度**：`UPDATE_POLL_MS = 21600000`（6h，`BIGFISH_UPDATE_INTERVAL_MS` 可覆盖）；启动 5s 检查（沿用 `main.js:1780` 时点，改调新实现）后 `setInterval(轮询, UPDATE_POLL_MS)`；轮询 = App 检查 + Harness 检查（各自静默）。
- **门禁**：`!app.isPackaged` → 全部不检查（dev 模式；托盘手动点击时弹提示「更新检查只在安装版可用」，先例 `uninstall()` 的 dev 提示，`main.js:303-306`）；`autoCheckUpdates === false` → 启动检查与轮询均跳过（AC7 零网络）；manual 检查不受开关约束。
- **B06 口径修订（2026-09-16；类别 = 语义变更，源 = `docs/batches/B06-shell-ux.md` §1.3 C5 / §1.4 R4）**：本条「dev → 全部不检查 + 手动点击弹提示」已被修订——dev 不再整体短路：App 面不执行 / 无提示（记 `face=app skipped=dev`）、Harness 面两态同路径；「更新检查只在安装版可用」提示退役。权威口径 = `docs/requirements/SHELL.md` §三 US-6 + `docs/design/SHELL-UX.md` §2.2.5。
- **并发守卫**：模块级 `checkInFlight` / `downloadInFlight` / `harnessInFlight` 标志；轮询期间任一在途 → 跳过本轮（记日志）；手动触发时已有在途 → 气泡提示「检查/更新正在进行」；取消（U-13）中止在途操作并释放对应标志（回到可重试态，不残留半成品）。
- **零网络证据**：开关关闭时 updater.log 不产生 `check` 行；市场窗口的 `fetchPluginRegistry`（`main.js:1671-1693`）独立于更新域、只在市场页打开时触发（AC7 括注的市场页除外）。

#### 2.2.8 发布脚本契约（make-latest.js）

```
node make-latest.js [--version <v>] [--note <文本>]
  version 缺省读 package.json.version
  产物扫描 dist/：Bigfish.Setup.{v}.exe / Bigfish-{v}-arm64.dmg / Bigfish-{v}.AppImage
  对存在的文件算 sha256 → 组装 latest.json（version/note/urls[Gitee Releases]/sha256）写仓库根
  缺失的平台跳过（urls 与 sha256 均不含该平台）
  打印上传清单：
    · Gitee 建 tag v{v} 并上传附件：dist/... 每件一行
    · 提交仓库文件：latest.json（raw 路径 https://gitee.com/ludonghuai/big-fish/raw/main/latest.json）
  退出码：0 成功 / 1 参数或产物缺失错误
```

- `make-latest.js` 为发布侧工具，**不进** `build.files`（不随包分发）；`package.json` scripts 新增 `"make-latest": "node make-latest.js"`。

#### 2.2.9 诊断日志契约（updater.log）

常开写 `userData/updater.log`（`appendFileSync` + try/catch，先例 `main.js:346-351`（`updaterLog`）；更新域排查频率高于桌宠拖动，不做 env 门控——与 B01 `pet-drag.log` 的 env 门控是不同域的独立决策）。行格式（机器取证面）：

```
[ISO] update check reason=startup|poll|manual type=app|harness result=update-available|up-to-date|error latest=… current=…
[ISO] update download type=app start url=… size=…
[ISO] update download type=app percent=NN
[ISO] update download type=app done file=… bytes=…
[ISO] update verify ok|fail type=app expected=… actual=…
[ISO] update install type=app spawn=… （win32；darwin/linux 记 open-path）
[ISO] update cleanup type=app removed=<n> failed=<m> （B05 新增：启动回收 userData/updates/ 的取证行——n = 本次实删条目数，m = 删除失败（占用 / 权限）的条目数；无条目 / 目录不存在时 n=m=0；唯一触发 = 启动，不设 reason=）
        detail 形态：read-fail（目录存在但枚举抛非 ENOENT 错——EACCES / EPERM / ENOTDIR；removed=0 failed=0，条目仍在） （B05，评审 #1）
[ISO] harness install phase=prepare|install|smoke|activate|rollback ok=0|1 detail=… （updater.js 写）
        prepare 失败 detail 形态：guard-active-dir（目标版本目录 == 当前活跃目录，拒绝原地重装） （B04）
        activate 失败 detail 形态：verify-fail:resolve|version|smoke / pointer-fail:… （B04）
        rollback detail 形态：restored:<version>（回写上一版本）/ factory（清指针 = 回出厂） （B04）
[ISO] harness activate verify ok=0|1 stage=resolve|version|smoke version=… path=… （B04 新增：激活后活跃路径复核——AC9-b 机检面）
[ISO] harness migrate legacy=adopted|removed|none version=… （B04 新增：旧布局采纳 / 回收——既有坏状态取证）
[ISO] harness cleanup active=<version|factory> removed=<n> adopted=<version|none> （B04 新增：版本 GC 取证）
[ISO] harness activate dsh active path=… version=… （main.js 写：重启前按 dshBinPath() 实际解析结果记——AC9 机器证据；B04 起附版本读数）
[ISO] harness restart backend ready port=… （main.js 写：重启成功后记；「backend ready」沿用既有 console 行口径 `main.js:2278`）
[ISO] plugin update spec=… result=ok|fail detail=…
[ISO] update gate reason=… face=app skipped=dev （B06 修订：dev 下 App 面跳过；旧「skipped=dev 整面跳过」形态退役，skipped=toggle-off|in-flight 不变）
```

**行数口径（逐批累加；D3：计数与枚举同改）**：

- B02 初版 **11 行**（本节主表 `update` 6 + `harness` 3 + `plugin update` 1 + `update gate` 1）。
- B04 **新增 3 行**（`harness activate verify`、`harness migrate`、`harness cleanup`）、**就地修改 2 行**（`harness install phase=… detail` 口径化；`harness activate dsh active …` 附 `version=`）。
- B05 **新增 1 行**（`update cleanup type=app removed=<n> failed=<m>`）——**终态 = 15 行**（14 + 1）。
- **计数口径（D3，评审 #2）**：本节「行数」只计**主格式行**（主表 `[ISO] …` 起各行及其 `detail` / 取值子行，逐行点算 = 15；`detail` / 取值子行**随所属主行计价、不另计**——机检 = `[ISO]` 前缀行数 = 15）；本节「失败 / 取消变体」段的 **6** 处变体另行计价、**不并入**本数——故本节机检计数唯一为 **15**（不因变体另得第二值）。
- B06（2026-09-16）**就地修订 1 行**（`update gate`：旧「整面跳过」形态退役 → `face=app skipped=dev` 形态——本节主表该行同步）；**计数不变（终态仍 15 行）**（权威口径 = `docs/requirements/SHELL.md` §三 US-6 + `docs/design/SHELL-UX.md` §2.2.5）。

**失败 / 取消变体（通用口径——B05 补齐漏登记，一致性修正，非新增语义）**：本节主表各行在同一 `[ISO] …` 前缀下另有**实现已产出、而本节枚举此前漏列**的变体——
`update download type=app fail detail=…`（`updater.js:182`）、`update download type=app canceled`（`updater.js:179`）、
`update install type=app fail detail=…`（`updater.js:203`）、`update install type=app open-path fail detail=…`（`updater.js:198`）、
`plugin update spec=… result=skip detail=no-installed-version`（`main.js:2149`）、`harness cleanup active=n/a removed=0 adopted=none detail=…`（`updater.js:442`，异常面）。
取证时按「阶段 + 字段前缀」匹配；新增任何 `result=` / `ok=` 取值或新阶段行须同步本表。

写入口：updater.js（update / harness 域阶段行 + 上述三条新增行）+ main.js（编排域两行 `dsh active` / `backend ready`）。
`harness-store.js` 不写日志、不读 `ctx`（§2.2.1）——日志行由 updater.js 按返回值落笔。

### 2.3 受影响文件全清单

| 文件 | 当前行数（实测） | 改动点（B05；现状行号） | 预计改动量 | 末行数（预估 / 实测） |
|---|---|---|---|---|
| `updater.js` | 486 | ① `startupCleanup` 的 App 面由「只删 `*.part`」扩为「回收 `userData/updates/` 全部条目」（`L457-471`；缺陷点 = `L465`），逐条 best-effort（占用/权限失败跳过）；② 该面落 `update cleanup` 取证行（§2.2.9）；③ `rm` 辅助函数（`L458-460`）随唯一调用点退场 | +约 5 / −约 2 | 预估 ≈489（**须 < 500**；实测回填于批次档 §5） |
| `docs/requirements/UPDATE.md` | 134 | 新增 US-10（§三）+ §二 范围段 / §三 验收编号来源 / 头部关联批次 同步 + 变更记录一行 | **+12** | **146**（实测；本批已落地） |
| `docs/design/AUTO-UPDATE.md`（本档） | 748 | B05 修订面（§一 / §2.1 / §2.2.3 / §2.2.4 / §2.2.9 / §2.3 / §2.4–§2.6 / §3.1–§3.3 / §四）+ 评审修正轮 **5 处**（轮次 1：#1/#2/#3；轮次 2：#1/#4） | +约 90 | **839**（实测内容行口径，含两轮修正） |
| `main.js` | **2827**（2026-09-16 重测更正；原记 2640 为 B04 收口值） | **不改**——调用点 `L600`（在 `init(ctx)` 之后）与日志落点 `updaterLog`（`L347-353`）均不变；`pendingAppFile`（`L343` / `L468`）语义不变 | 0 | **2827** |
| `harness-store.js` | 332 | **不改**——Harness 版本库面；本批不动 Harness 回收语义（B04 已定） | 0 | 332 |
| `update-lib.js` | 90 | **不改**——纯函数面（AC8 回归面） | 0 | 90 |
| `update.html` / `update.js` / `update-preload.js` | 92 / 104 / 10 | **不改**——回收面零 UI（不弹窗、不气泡、不开窗） | 0 | 不变 |
| `market.js` / `market.html` / `market-preload.js` / `market-update.js` | 500 / 208 / 15 / 51 | **不改**——插件域 | 0 | 不变 |
| `latest.json` | 14 | **不改**——清单 schema 与源不变 | 0 | 14 |
| `package.json` | 113 | **不改**——本批零新增文件，`build.files`（`L37-66`）无需登记 | 0 | 113 |
| `make-latest.js` | 90 | **不改**——发布侧脚本 | 0 | 90 |
| `tests/update-lib.test.js` / `tests/update-stub.mjs` / `tests/harness-store.test.js` | 84 / 91 / 269 | **不改**——本批**不新增测试文件**（判据三条见 §3.3「B05：不新增 `tests/` 文件」） | 0 | 不变 |
| `build/installer.nsh` | 6 | **不改** | 0 | 6 |
| `pet.js` / `pet.html` / `pet-preload.js` | 185 / 91 / 15 | **不改**——B01 活跃文件（C8） | 0 | 不变 |
| `docs/README.md` | 37 | **不改**——主 agent 收口时自更新（本批特别纪律；陈旧面见 O3） | 0 | 不变 |

> **表口径**：行数 = **B05 实施起点实测**（`find /c /v ""` 口径；B02 §2.3 的预估与实测漂移已在 `docs/batches/B02-auto-update.md` §6.4 披露）；
> 「改动点」列 = **本批（B05）**改动——B02 / B04 已交付文件在本批标「不改」（历史改动点见注 M1（B02）/ 注 M2（B04））；
> 「末行数」列：**文档行**（本批已落地，即 `docs/requirements/UPDATE.md` 与本档自身行）按**实测**；**代码文件行**为**实施前预估**（实施后由批次档 §5 回填实测）；「不改」文件行数不随批变动；
> 「预计改动量」列 = 实施前预估（估算方法沿用 B02，曾显著失准）——保留作预估与实测的对照。
> **B06 as-of 注（2026-09-16）**：B06 立案实测 `main.js` = **2831** / `package.json` = **116**（本表所记 2827 / 113 为 B05 起点 / B04 收口时点值——**历史值不改写**）；差异源 = 测量时点不同 + B03 会话在途未提交改动（`docs/batches/B06-shell-ux.md` §1.7）；B06 设计口径 = `docs/design/SHELL-UX.md` §2.3 表注。

> **注 M1 —— B02 交付时 `main.js` 改动点明细（①–⑩；历史记录，B04 改动点见表内本行）**
>
> - ① 清单源常量改 Gitee 单一 URL（`L50-53`）
> - ② `compareVersions`/`checkForUpdates` 段（`L317-375`）替换为 updater 接线
> - ③ `dshBinPath` 优先 userData（`L121-127`）
> - ④ `notify` 加可选 onClick（`L236-243`）
> - ⑤ 托盘菜单加「检查更新」「自动检查更新」（`L1201-1236`）
> - ⑥ `DEFAULT_SETTINGS` 加 `autoCheckUpdates`（`L75-83`）
> - ⑦ 启动/轮询接线（`L1780`）
> - ⑧ 插件更新计算与 IPC（`L1903-1955`）
> - ⑨ 注册表兜底源常量（`L1319`）
> - ⑩ 删除死代码 `setPetEnabled()`（`L1250-1255`，−5 行，T3 裁定 A）

> **注 M2 —— B04 交付时改动点明细（历史记录，B05 改动点见表内本行）**
>
> - `main.js`（2638 → 2640）：① `dshBinPath()` 打包分支改按活跃指针解析（`L130-138`）；② `require('./harness-store.js')`；③ `cleanupHarnessPrev()` → `cleanupHarnessStale()`（`L555`）；④ 激活日志行附 `version=`（`L551`）
> - `updater.js`（466 → 486）：① 布局/链接/清理逻辑移出至 `harness-store.js`（`harnessStagePaths` `L283-290`、`harnessActivate` `L336-345`、`cleanupHarnessPrev` `L425-433`、`startupCleanup` `L436-451`）；② 激活步改指针 + 复核（`L347-400`）；③ 回滚改指针回写（`L411-422`）；④ 增 `cleanupHarnessStale`
> - `harness-store.js`（0 → 332，新）：版本库布局 / 指针读写（原子）/ 活跃解析（`resolveActiveBin`）/ 版本目录准备 / 激活 + 复核 + 回滚 / 旧布局迁移 / 版本 GC
> - `package.json`（112 → 113）：`build.files` 增 `harness-store.js`（清单在 `L37-65`）
> - `tests/harness-store.test.js`（0 → 269，新）：版本库单元断言 T-A1…T-A8（§3.3）——激活/复核/回滚/旧布局迁移/GC/指针防御 + 失效副本故障注入（AC9-b 机检面）


**超层文件拆分计划（C6 评估，不含实施；B05 口径刷新）**：

- `main.js` B04 起点 **2638 行已超**「单文件 > 500 行须拆分」口径（技术待办 T2）——B04 只动接线（终态 **2640** 行，净 +2 行），不进一步加剧单文件债。
- `updater.js` B04 起点 466 行、终态 **486 行**——**不越 500 线**：把版本库逻辑外置 `harness-store.js`（终态 **332 行**）正是为守此线（实施前估 ≈431 / ≈290）；若内联，`updater.js` 将远超 500 硬限（DD-18）。
- `market.js` 现状 500 行（已贴线）——本批不动；拆分裁决仍归 T2 评估。
- **本批结论：不做存量拆分**（不动 main.js 六域），仅要求新增 B04 代码一律外置（`harness-store.js`）。
- **收口复核结论（评审 #6 触发条件成立 → 已执行；2026-09-16）**：`harness-store.js` 终态实测 **332 行 > 300**（仍 <500 硬限）——复核结论 = **保持单文件、不拆分**：
  ① 结构面：332 行低于 500 单文件硬限，模块内单函数 <300 行（最长者 `cleanup` ≈50 行）；
  ② 语义面：模块职责单一内聚（版本库布局 / 指针 / 解析 / 准备 / 激活复核 / 回滚 / 迁移 GC），拆两文件会把同一判据（I-2 指针）切成两处；
  ③ 依 R3 不升级体量裁定：本批新增代码全部外置，332 行属新增文件的正常体量，不触发新的拆分裁定。
  （触发条件原文 = 「实测 >300 行时收口前做一次拆分复核」；≤300 行的「本计划不动」分支未发生。）
- **B05 口径**：本批改动文件仅 `updater.js`（486 → 预估 ≈489，仍 **< 500**；`startupCleanup` ≈15 行 < 300）；零新增文件，不触发新的拆分裁定。

### 2.4 关键决策记录

| # | 决策 | 理由 | 否决的备选 |
|---|---|---|---|
| DD-1 | App 更新 = 自研下载通道 | 零新依赖（NFR-4）；清单源自由指定 Gitee raw（US-4）；sha256 校验自持可控 | electron-updater（选型 A：generic provider 需自建托管、GitHub provider 国内不稳、增第三方依赖） |
| DD-2 | 清单唯一源 = Gitee raw，GitHub 不双端维护；插件注册表兜底源 jsdelivr → Gitee raw | 用户明确「GitHub 已经不会继续维护了」；双端维护 = 双重漂移源 | 保留 GitHub 兜底（与 US-4 冲突） |
| DD-3 | Harness 更新装 userData 独立目录 + 原子切换 + prev 回滚；切换前先停后端（C1 序列对齐） | 安装目录可能 Program Files 只读（批次档 §1.4）；激活前不动现行副本 → 失败旧版零影响 | 写安装目录（权限失败）；就地覆盖（无回滚）；后端运行中 rename（Windows EPERM 风险） |
| DD-3a（B04 修正） | **DD-3 的「目录改名 = 原子切换」实现面作废**（§2.0：被「安装树路径无关」错误假设否定）；其余三语义——userData 独立目录 / 「全部成功才切换」/ prev 回滚与停-切-启序列——全部保留 | Windows junction 只能存绝对路径，改名即整树失效（§2.0 E1/E2）；修正 = DD-16 | 保留 rename 切换（缺陷复现）；只修激活点而不管其余三处（C9 违反） |
| DD-4 | Harness 用 staged pnpm 全装（精确版本依赖 + npmmirror 优先 npmjs 兜底） | dsh 依赖树 ~62 包随版本演进，必须全量重装（批次档 §1.6 事实 5）；staging 与 profile 工作区零耦合（C2） | 单 tarball 就地覆盖（依赖不匹配）；在 profile 工作区 add（污染插件安装面） |
| DD-5 | Harness 只追 `latest` dist-tag | 实测 dist-tags：latest `0.1.5-rc.1` / next `0.1.5-rc.2` / alpha `0.1.6-alpha.1`；追预发布频道风险与收益不匹配（批次档 §1.4 裁定） | 追 next/alpha（预发布不稳定性引入用户端） |
| DD-6 | `compareVersions` 升级为 semver-lite（预发布段按 semver 标识符规则），App 与 Harness 共用 | 现有纯数字点分遇 `-rc.N` 会 NaN 化（`main.js:320-330`）；App（`0.1.2`）与 Harness（`0.1.0-rc.6`）两种形态必须同一语义 | 保留纯数字（AC8 必败）；引 semver 依赖（NFR-4 违反） |
| DD-7 | 更新域代码外置新模块（updater.js + update-lib.js），main.js 只留接线；本批不做六域拆分 | main.js 已 1986 行（C6）；新增域再入 main.js 会加剧体量债；纯函数模块使 AC8 可被 `node --test` 直接断言 | 全塞 main.js（体量债加剧）；本批拆分六域（范围外重构） |
| DD-8 | 检查时机 = 启动 + 6h 轮询 + 托盘手动；轮询发现走气泡 | 用户拍板 A 档（批次档 §1.3）；符合「有提交能否直接告知用户」的原话诉求 | 纯启动检查（用户长时间不重启就不知道） |
| DD-9 | 进度 UI = 专用 update 窗口，App/Harness 两模式复用 | 主窗口是 dsh 页面、渲染层不受控（选型 E）；专用窗与 welcome/market/exchange 先例同构 | 主窗口注入；纯托盘展示 |
| DD-10 | 插件更新规格：npm 条目按 `{realName}@{registryVersion}`、github: 条目按原 installSpec 重装 | 裸 `pnpm add name` 不保证装到注册表宣告的版本；github: 无版本语义只能原 spec 重拉 | 一律裸 spec（更新可能无效果）；对 github: 编造版本（无依据） |
| DD-11 | 开关 `autoCheckUpdates` 默认开；手动检查不受开关约束 | 用户原话要「自动」能力，默认开；AC7 的零网络指自动检查——手动是用户显式动作 | 默认关（与需求意图相悖）；开关连手动一起关（手动检查永远可用是 US-5 条文） |
| DD-12 | 测试钩子 env 覆盖（BIGFISH_UPDATE_URL / _INTERVAL_MS / _DSH_REGISTRY_URL） | 打包版无法靠改代码做假清单桩，env 覆盖使 AC1-AC4 可假桩机检（判定方式即批次档 §1.5 的「假清单桩」） | 无钩子纯人判（证据不可留存） |
| DD-13 | 更新诊断日志 updater.log 常开（不做 env 门控） | 更新域排查（检查/下载/校验/安装各阶段）频率高于桌宠拖动；体量小（每轮检查几行） | env 门控（B01 pet-drag.log 口径——不同域不同决策） |
| DD-14 | 安装器拉起沿用 uninstall() 先例：spawn detached + 800ms 退出；装完自动拉起靠既有 `runAfterFinish: true` | `package.json:85` 已配置；NSIS 侧零改动（批次档 §1.4 裁定 6 的勘察结论：NSIS 侧可行，无需退回引导手动启动） | 在 NSIS 侧重写 runAfterFinish（无需）；安装器内引导手动启动（无需） |
| DD-15 | updater.js 单函数 <300 行：installHarness 多阶段流（prepare/install/smoke/activate + 失败分支）拆阶段函数 | 函数级分层同样适用 500 线口径（评审 #11）；多阶段流压单函数难定位、难机检 | 单函数整体实现（超 300 行风险） |
| DD-16（B04） | **Harness 运行时 = 版本化目录 + 活跃指针**：安装直接落 `userData/dsh-update/versions/<version>`（**落盘后永不改名/移动**，I-1）；激活 = 原子写 `userData/dsh-active.json`（`prev` 记上一版本）；解析/日志/清理共用同一指针判据（I-2） | 目录不移动 → 绝对路径链接目标恒有效（§2.0 E1）；写指针比双 rename 更原子；与 pnpm 布局解耦；保留 DD-3 三语义 | 选型 G 候选 2/3/4——否决理由见 §2.1 |
| DD-17（B04） | **激活后对活跃路径复核（存在性 + 版本读数 + 冒烟）才算激活成功**；复核失败 = 激活失败（`phase=activate ok=0`，日志 `harness activate verify ok=0 stage=…`）+ 指针回滚 + 删该版本目录 | 本缺陷漏检根因 = 旧冒烟只在安装面（`staging`）验（C10）；复核跑的是**切换后的活跃路径**，与后端将来实际启动的同一目标 → 假成功无处可藏（AC9-b） | 只加日志不断言（无法机检）；只检存在性（漏「树内链接失效」——冒烟才是能证明依赖链可解析的检查） |
| DD-18（B04） | **版本库逻辑外置 `harness-store.js`**（纯 Node / 无 Electron / runner 注入）；updater.js 只留编排与日志 | ① 500 行硬上限：内联使 `updater.js` ≈640 行越限（§2.3）；② 可测性：故障注入可 `node --test` 直驱，不引入 Electron | 全部内联（越 500 硬限）；放进 `update-lib.js`（宪章为「不做任何 IO」）；凭 `require('electron')` 在纯 node 下的偶然可解析性测 `updater.js` |
| DD-19（B04） | **旧布局迁移：可解析则采纳（advice）、不可解析则回收**——绝不改名/移动旧副本；已中过本缺陷的用户（`userData/dsh` = 失效 junction 树）→ 回收 + 解析回退出厂副本 + 可重新更新 | 「改名迁移」会在 Windows 上重现同一缺陷；旧副本是否可解析是**可检验的事实**，无需假设 POSIX 符号链接是否相对（未验证项不引入） | 直接删所有旧布局（POSIX 上已更新用户会白白重装 62 包）；一律采纳（Windows 上把失效副本当活跃 → 后端起不来） |
| DD-20（B04） | 指针 schema：`dir` 一律为 **userData 相对路径**；`prev` 只记一层（不叠栈）；写入 = tmp + rename 原子替换 | 相对路径使指针在 userData 整目录迁移后仍有效；`prev` 只服务「本次激活回滚」，不引入版本栈（US-6 无自选版本回退需求） | 存绝对路径（userData 迁移即失效）；多层 prev 栈（无需求，且清理语义复杂化） |
| DD-21（B05） | **App 安装包回收 = 启动清理 + 全目录条目回收**：范围 = `userData/updates/` 全部条目（不按扩展名过滤、子目录递归）；时机 = 下次启动；失败面 = best-effort | 安装器运行期其 exe 被 Windows 锁定——即时删会失败或危及安装（批次档 §1.4）；该目录唯一用途 = 下载暂存（`updater.js:118-120`） | ① 即时删（运行期必失败）；② 保持 `*.part` 过滤（正是本缺陷）；③ 下载落点挪出 userData（改既有语义）；④ 装完后强制删（无完成反馈面） |
| DD-22（B05） | **新增取证行 `update cleanup type=app removed=<n> failed=<m>`**（恒在场；不设 `reason=`） | AC15 的判定面明列「fs 断言 + 日志」（`docs/batches/B05-installer-cleanup.md` §1.5）：fs 断言分不清「清理跑了且目录本空」与「清理没跑」；`failed` 计数使「占用 → 下次再试」可机检 | 沿用静默 best-effort（AC15 的日志取证面缺一半） |

### 2.5 与既有纪律 / 既有实现的冲突点核对

| # | 既有约束 / 纪律 | 设计处理 | 结论 |
|---|---|---|---|
| C1 | 插件更新复用现有 pnpm 通道 | `market:update/update-all` 走 `installPlugin` + `restartBackend`，不另造安装路径 | 不冲突 |
| C2 | profile manifest 对象防呆 | 更新路径零新增 manifest 写入点（installPlugin 内部防呆沿用） | 不冲突 |
| C3 | 真实包名口径 | 版本对比用 `resolveInstalledName()`；更新规格用其产出拼 `@version` | 不冲突 |
| C4 | https + 10s 超时 | 全链 https；10s 无数据中止（下载流按 chunk 重置） | 不冲突 |
| C5 | dev 模式不检查 | 门禁保留 `!app.isPackaged`；手动点击给 dev 提示 | 不冲突 |
| C6 | main.js 拆分 | 不拆分存量；新增代码外置（§2.3 拆分计划）；B04 再增 `harness-store.js`——内联将使 `updater.js` ≈640 行越 500 硬上限 | 有意变更（评估落档） |
| C7 | T3 处置 | §2.1 选型 D 给两选项，评审裁定后实施 | 已裁定（A 删除，2026-09-16，批次档 §4.3） |
| C8 | pet 三文件不触碰 | 托盘改动全在 main.js 侧；B04 不动 pet 域 | 不冲突 |
| C9（B04） | 修复须覆盖全链四处 | 四处全部改为指针/版本目录语义：`harnessActivate`→`activate()`（写指针）、`rollbackHarness`→`rollback()`（回写指针）、`cleanupHarnessPrev`→`cleanupHarnessStale`（版本 GC）、`startupCleanup`（迁移 + GC） | 不冲突（设计面已覆盖，实施核验见 §3.2 TC-25/TC-26/TC-29） |
| C10（B04） | 测试层须补「激活后对活跃路径复测」 | DD-17 + §3.2 TC-26 + §3.3 故障注入用例（T-A2） | 不冲突 |
| C11（B04） | 零新依赖；不改需求档 | `package.json` 的 `dependencies` 保持空数组（本批只改 `build.files`）；需求档零改动（本档不改 AC9 条文，只细化判定面，§3.1） | 不冲突 |
| C12（B04） | `dshBinPath()` 对外语义不变 | 三档解析（指针副本 → 旧布局可解析副本 → 出厂）；dev 分支不变；副本落点变化属实现形态（§2.2.1） | 不冲突（**提请评审核验**此口径解读） |
| C13（B05） | 写入 / 删除面仍限 `userData`（NFR-2） | 回收只作用于 `userData/updates/`（`updater.js:462`）；下载落点（`updater.js:118`）与安装目录 / `~/.dsh` / 系统临时目录均不触碰；全仓字面量 `'updates'` 仅此两处 | 不冲突 |
| C14（B05） | `updater.js` 单函数 <300 行、文件 <500 行 | 终态预估 ≈489 行（<500，余量 ≥11）；`startupCleanup` ≈15 行（<300）；实现形态 = 就地改造，不新增阶段函数 | 不冲突 |
| — | NFR-4 不新增依赖 | `dependencies` 保持空数组；只加 Node 内置 + Electron 内置 | 不冲突 |
| — | 平台范围 = 核心机制平台无关 | 机制三平台共有；安装包按 `urls[platform]` 取（清单语义非代码分支）；darwin/linux 打开安装包不自动退出（不承诺验证） | 不冲突 |
| — | 提示词文件属产品代码 | 本批不触碰任何提示词文件 | 不冲突 |

> **B06 口径修订（2026-09-16；类别 = 语义变更，源 = `docs/batches/B06-shell-ux.md` §1.3 C5 / §1.4 R4）**：本表 **C5** 行（「dev 模式不检查 → 手动点击给 dev 提示」）与 **C12（B04）** 行（「dev 分支不变」）的旧口径随 B06 修订——dev 仅 App 面无检查 / 无提示，Harness 面放行、dev 读活跃指针。权威口径 = `docs/requirements/SHELL.md` §三 US-6 + `docs/design/SHELL-UX.md` §2.2.5。

**已知限制（明确不修，随本批留档）**

- **L1**：插件更新徽标的覆盖取决于注册表条目的 `version` 字段——内置本地目录实测仅 3/35 条带 version（`plugins.json` 实测）；远程全量目录由 awesome-dsh-plugin.com 维护，本批不迁移主站。无 version 的条目无徽标（US-7 边界已声明）。
- **L2**：应用休眠/关机期间 6h 轮询自然暂停，无 missed-check 补偿——启动时总是检查一次，等价兜底。
- **L3**：App 更新确认后应用即退出，若用户在安装器中取消安装，需手动重启应用。
- **L4**：NSIS 安装需 UAC 授权（系统标准行为，无法绕开）——更新窗口 ready 态文案明示。
- **L5（B06 修订，2026-09-16；类别 = 语义变更，源 = `docs/batches/B06-shell-ux.md` §1.3 C5 / §1.4 R4）**：原「Harness 更新不可用于 dev 模式」已修订——dev 的 Harness 检查与更新放行且真生效（dev 读活跃指针，兜底 `dsh-bundle/`）；权威口径 = `docs/requirements/SHELL.md` §三 US-6 + `docs/design/SHELL-UX.md` §2.2.5。
- **L6（B04）**：启动时的活跃副本校验只有**存在性**（`resolveActiveBin` 查 `bin.js`），不做冒烟——启动路径上跑 62 包冒烟会阻塞启动；深度复核（存在性 + 版本 + 冒烟）只在**激活时**做（DD-17）。若活跃副本在激活后、启动前被外力破坏（杀软 / 手工删文件），后果 = 后端启动失败走既有重试/重置对话（`main.js:2282-2336`），用户可重新更新恢复。
- **L7（B04）**：版本 GC 是**尽力而为**（best-effort）：单个旧版本目录删除失败（Windows 文件占用）时不阻断启动，下次启动重试。
- **L8（B04）**：指针（`userData/dsh-active.json`）不可解析时（损坏 / 副本被删），启动清理会**清指针 + 回收该版本目录**——活跃副本随之丢失并回退出厂副本（功能不丢，版本回退；重新更新即可）。设计取舍：宁可状态诚实（不静默挂着悬空指针），不为此引入额外的二次校验状态机。
- **L9（B05）**：启动回收是 **best-effort**（与 L7 同口径）——安装器 `runAfterFinish` 拉起新版时其 exe 可能仍被自身进程锁定，故「更新后首次启动仍见残留、下次启动清空」是设计内行为；只有持续占用（非常态）才会长期残留。
- **L10（B05）**：回收不保留「已下载未安装」的安装包——`pendingAppFile` 为进程内状态（`main.js:343`），重启后本就不可达；用户重走「检查更新 → 下载」即既有「可重试」语义（US-2 / US-5）。

**观察项（既有语义缺口 / 批次外协调项，需用户裁决是否另批处理）**

- **O1（行号漂移，一致性面）**：批次档 §1.6 事实 11 与 TODO.md T3 引用 `setPetEnabled()` 于 `main.js:1149-1154`，现行文件实为 `main.js:1250-1255`（B01 落地后漂移 +101 行）。本设计档全部使用现行行号；台账/批次档行号校正由主 agent 收口时处理（写权不在本角色）。
- **O2（发现即报告，一致性面）**：`market.js:473` 的镜像来源标签「精选镜像目录（GitHub）」不在批次档 AC6 五处清单内，但与本批兜底源迁移同一语义面——本设计将其并入清理（标签随源迁移）；`main.js:1670` 注释同批同步。
- **O3（发现即报告，文档地图陈旧）**：`docs/README.md` §二的当前文档表未登记 `docs/requirements/UPDATE.md`、`docs/design/AUTO-UPDATE.md`、`docs/batches/B02-auto-update.md`、`docs/batches/B04-harness-activate-fix.md`（该表只列 PET / B01 / B03 系）——B02 §6.5 已声明「待各会话收口后由主 agent 统一更新」。本设计不改（批次档 B04 §1.7 列 `docs/README.md` 为不触碰面），仅报告。
- **O4（发现即报告，贴线文件）**：`market.js` 实测 500 行，已贴「单文件 > 500 行须拆分」硬上限（B02 评审 #5 定的守住线）。本批不动该文件；拆分裁决仍归 T2 评估。
- **O5（发现即报告 + 一致性修正，一致性面）**：§2.2.9 的行枚举此前漏登记 6 处**实现已产出**的失败 / 取消变体（`updater.js:179/182/198/203/442`、`result=skip` 取证行 `main.js:2149`）——本批补齐为「失败 / 取消变体（通用口径）」段（非新增语义；属 B02 交付即存在的文档与代码不一致）。已修，随本批落档。
- **O6（发现即报告，台账指针已可收回）**：`docs/TODO.md` R3 已登记本需求（挂 `docs/requirements/UPDATE.md` §三 US-10（待建）与 `docs/batches/B05-installer-cleanup.md` §2（待建），status=待设计）——本次两处「（待建）」均已落地（US-10 已写入需求档；§2 由本角色落笔）；台账的「（待建）」字样与 status 推进（待设计 → 在途）归主 agent（台账写权不在本角色）。
- **O7（发现即报告，台账证据陈旧）**：`docs/TODO.md` T4 的证据行「全仓无测试文件」与现状不符——本仓现有 3 个测试文件（`tests/update-lib.test.js`、`tests/update-stub.mjs`、`tests/harness-store.test.js`，B02/B04 交付）；其 `package.json:13-21` 行号亦已漂移。台账写权在主 agent，本角色仅报告。

### 2.6 UI / 交互决策

| # | 决策点 | 决策 |
|---|---|---|
| U-1 | 启动检查发现新版 | 模态弹窗：标题「发现新版本 v{latest}」、正文 = 清单 note + 「当前版本：v{current}」、按钮 [立即更新] [稍后再说] |
| U-2 | 轮询发现新版 | 托盘气泡「发现新版本 v{latest}，点击查看」（不弹模态）；点击气泡 → U-1 弹窗 |
| U-3 | 手动检查结果 | 有更新 → U-1 弹窗；无更新 → 气泡「已是最新版本」；出错 → 错误弹窗 [重试] [取消]（重试循环直至成功或取消） |
| U-4 | 更新窗口（App 模式） | 标题「更新 Bigfish」；阶段：下载中 {percent}% → 校验中 → 就绪（显示 sha256 校验通过 +「安装并重启」按钮 + UAC/安装选项提示）→ 错误（错误信息 + [重试] [关闭]） |
| U-5 | 更新窗口（Harness 模式） | 标题「更新 Harness」；阶段：安装依赖中（不确定进度，显示已用时）→ 验证中 → 切换并重启 → 完成（3s 自动关闭）→ 错误（[重试] [关闭]） |
| U-6 | Harness 确认弹窗 | 「发现 Harness 新版本 v{latest}（当前 v{current}）」，正文注明「更新需数分钟，期间后端会重启」、按钮 [立即更新] [稍后再说] |
| U-7 | 托盘菜单 | 新分组（首条分隔线后）：「检查更新」+「自动检查更新」checkbox（默认勾选）；位置在「更换背景」组之前 |
| U-8 | 更新徽标 | 市场卡片 meta 区新增「可更新」badge（accent 色）；已安装视图卡片新增「更新」按钮（与「禁用」「卸载」同排） |
| U-9 | 全部更新 | 「已安装」tab 激活时，status-line 右侧显示「全部更新 (N)」按钮；点击 → 逐项执行 → 汇总 toast → 一次重启 |
| U-10 | 更新结果反馈 | 单个更新：toast「✅ 已更新 {name}」+ [立即重启] [稍后重启]（沿用现有 doRestart 模式，`market.js:395-412`）；全部更新：汇总 toast（成功 N 项 / 失败 M 项） |
| U-11 | 下载中重复触发 | 托盘再次检查 → 气泡「检查/更新正在进行」；更新窗口已开 → 聚焦 |
| U-12 | dev 模式手动检查 | 提示「更新检查只在安装版可用」（先例 `main.js:303-306`） |
| U-13 | 更新窗口生命周期 | 常驻复用（同 marketWindow 模式）；「关闭」按钮只关窗不取消后台操作；取消按钮 → `cancelAppDownload()` / `cancelHarnessInstall()`（中止在途下载/安装 + 清临时文件，回到可重试态）；Harness 提交点（指针写入）之后取消不生效 |
| U-14（B04） | 激活后复核失败时的窗口文案 | 沿用失败文案「更新失败，旧版不受影响，可重试」（`update.js` 不改）——复核失败与安装失败对用户是同一种结果（本次更新未生效、旧版照常、可重试），不暴露内部 stage（stage 落 `updater.log` 供排查） |
| U-15（B05） | 安装包回收是否向用户提示 | **不提示**（无弹窗、无气泡、无窗口文案）——回收是静默内务（best-effort）：成功无需告知，占用跳过也不打扰；取证只在 `updater.log`（§2.2.9）。托盘菜单与更新窗口零新增项（`update.html` / `update.js` 不改） |

> **B06 口径修订（2026-09-16；类别 = 语义变更，源 = `docs/batches/B06-shell-ux.md` §1.3 C5 / §1.4 R4）**：**U-12**（「dev 模式手动检查 → 提示『更新检查只在安装版可用』」）已被修订——dev 手动检查不再弹该提示（App 面无 UI、Harness 检查照常；该措辞从代码中消失，grep 判据 = `docs/design/SHELL-UX.md` §3.1 AC5）。权威口径 = `docs/requirements/SHELL.md` §三 US-6 + `docs/design/SHELL-UX.md` §2.2.5。

**open 项**：T3 已裁定（A 删除，2026-09-16，批次档 §4.3），随实施落地——除此之外无未决 UI 决策。

---

## 三、测试层

本仓**当前无任何自动化测试基础设施**（技术待办 T4 认账不排期；`package.json` 无 test script——已核实；仅存 B02 交付的两个开发期 `node --test` 文件：`tests/update-lib.test.js`、`tests/update-stub.mjs`）。因此本批的验证 = **开发期 `node --test` 断言（纯函数面 + B04 版本库面）+ 假源桩 + updater.log 日志取证 + 手工验证清单**。开发期测试的退役/转正处置在批次档 §6 逐条判定（默认退役）。

### 3.1 验收标准逐条回指

| 验收 | 回指需求 | 判定方式（细化） | 机检可能性 |
|---|---|---|---|
| AC1 | US-1 | 打包版 + `BIGFISH_UPDATE_URL` 指向假清单桩（version 0.9.9 + note + sha256）→ 启动 5s 后弹窗显示 v0.9.9 与 note；托盘「检查更新」同样触发。日志取证：`update check reason=startup type=app result=update-available latest=0.9.9` | 半机检（日志 + 假桩；弹窗内容人判） |
| AC2 | US-1 | `BIGFISH_UPDATE_INTERVAL_MS=60000` + 假清单 → 1 分钟内托盘气泡出现且无模态窗。日志：`update check reason=poll ... result=update-available` 行按 60s 间隔出现 | 半机检（日志；气泡人判） |
| AC3 | US-2、NFR-2 | 假清单指向本地桩（tests/update-stub.mjs 提供安装包字节流 + 正确 sha256）→ 更新窗口进度推进至 100%、日志 `update verify ok type=app`、窗口进入 ready 态 | 机检（日志 + 假桩；进度条形态人判） |
| AC4 | US-2、NFR-2 | 篡改桩（sha256 不匹配）→ 日志 `update verify fail expected=… actual=…`；`userData/updates/` 下无残留文件（fs 断言）；窗口错误态含错误信息 + 重试 | 机检（日志 + 目录断言） |
| AC5 | US-3 | 真实安装演练：确认安装 → 安装器启动 + 应用退出 → 装完自动拉起新版（`runAfterFinish` 已配置，package.json:85）。日志：`update install type=app spawn=…` | 人判（真实安装） |
| AC6 | US-4 | `grep -n "github\.com\|jsdelivr\|raw\.githubusercontent" main.js market.js market.html latest.json package.json` → 结果为空（`github:` 安装标识与插件来源文案除外）；且清单源常量唯一 = Gitee raw URL | 机检（grep） |
| AC7 | US-5 | 断网自动检查 → 无弹窗无气泡、日志 `result=error`（静默）；手动失败 → 错误弹窗 + 重试可用；开关关闭 → 日志无 `check` 行（启动与轮询均跳过）；市场页打开时 `fetchPluginRegistry` 照常（括注例外）；dev 模式 → 无任何检查行 | 半机检（日志；弹窗人判） |
| AC8 | US-6 | `node --test tests/update-lib.test.js` 全绿——§2.2.6 断言表 10 例（含 `0.1.5-rc.1` > `0.1.0-rc.6`）+ `parseRegistryMetadata` 假源 fixture（dist-tags.latest=0.1.5-rc.1）+ `decideUpdate` 判定有更新；注册表源回退（npmmirror 失败 → npmjs 兜底）以 update-stub 组合路由断言（TC-24） | 半机检（node --test + 假源桩组合） |
| AC9（B04 重定义判定面） | US-6 | 打包版真机：激活后 `dshBinPath()` 解析到 **userData 副本**（非出厂路径）、该副本 `package.json.version` = 目标、后端以该副本重启成功 | 半机检（日志 + fs 断言；真实更新人判）——逐条判定面见下表后「注 B04-1」 |
| AC9-b（B04） | US-6 | **无静默假成功路径**：激活后对活跃路径复测（解析存在性 + 版本读数 + 冒烟），任一不满足即记 `phase=activate ok=0` 并回滚 | **机检（单元故障注入 + 日志断言 + fs 断言）**——注 B04-2 |
| AC10 | US-7 | 假注册表条目 version 高于已装 → 市场「已安装」视图出现「可更新」徽标；单个更新 → `plugin update spec=… result=ok` + 后端重启；全部更新 → 逐项日志 + 一次重启；github: 条目按原 installSpec 重装（日志 spec 前缀 `github:`） | 半机检（日志；徽标/按钮人判） |
| AC11 | US-8 | 发版演练：`node make-latest.js --note "…"` → latest.json 生成（三平台 URL + sha256 与文件实测一致）→ 打印上传清单；`node make-latest.js`（无产物）→ 退出码 1 + 明确错误 | 人判（发版演练）+ 机检（sha256 与 `certutil`/`sha256sum` 对照） |
| AC12 | US-9 | 更新演练前后对 `~/.dsh` **关键面**做快照对比（profiles/web、sessions/、已装插件目录）→ 无差异；`~/.dsh/pnpm-store` 写入新依赖树为 Harness 更新的**预期增量**（共享 store 的正常写入面），不计破坏性差异（评审 #9） | 人判（快照对比） |
| AC13（B04） | US-6 | 回滚可用：激活后若后端重启失败 → 回滚到旧副本，旧版能正常启动；`startupCleanup` 不误删现行副本 | 机检（单元 + 日志 + fs 断言）——注 B04-3 |
| AC14（B04） | US-1…US-9、NFR-1…NFR-4 | 修复不破坏 B02 已通过项（AC1…AC8、AC10…AC12 语义零回退） | 半机检（AC6/AC8 全机检；其余真机抽测）——注 B04-4 |
| AC15（B05） | US-10 | 打包版（隔离 userData）启动后 `userData/updates/` 无残留条目（含已完成的安装包与 `.part`）：日志 `update cleanup type=app removed=<n> failed=0`（n = 启动前条目数）+ fs 断言目录为空；被占用条目删不掉时 `failed=<m>`（m>0）且**不阻断启动**，下次启动 `removed=<m> failed=0` | **机检（真机 fs 断言 + updater.log 行）**——注 B05-1 |
| AC15-b（B05） | US-10、NFR-2 | 既有语义零回退：`userData/updates/` 仍为唯一下载落点；下载→校验→安装→重试链路不回退（AC3 假桩下载 `verify ok`、AC4 篡改包 `verify fail` + 可重试）；回收不触碰安装目录 / `~/.dsh` / 系统临时目录 | 半机检（AC6/AC8 全机检 + AC3/AC4 真机假桩复测）——注 B05-2 |

**B04 判定面细化（AC9 / AC9-b / AC13 / AC14；逐条可机检）**

- **注 B04-1（AC9）**：① 日志 `phase=activate ok=1`；② `harness activate verify ok=1 stage=smoke version=<目标> path=<P>`；③ `harness activate dsh active path=<P> version=<目标>`——**P 不以 resourcesPath 为前缀**；④ fs：P 实际存在且同目录 `package.json.version` = 目标；⑤ `harness restart backend ready port=<n>`。
- **注 B04-1b（AC9 失败演练）**：断网 / 坏包 / 复核失败（TC-17/25/26）→ 现行副本未动 + 旧版照常 + 目标版本目录已清。
- **注 B04-2（AC9-b）**：① 单元故障注入——构造失效活跃副本（`bin.js` 缺失 / 悬空链接）→ `verifyActive` 返回 `ok:0` 且 `stage` 指向失败面 → 指针回滚（T-A2/T-A3/T-A4）；② 真机注入——隔离 userData 造失效副本 + 指针 → `harness activate verify ok=0 stage=…` + `phase=activate ok=0` + `phase=rollback ok=1` 在场，后端以旧版正常运行。
- **注 B04-3（AC13）**：① 单元——`rollback()` 使指针回 `prev`（`mode=restored`）或清指针（`mode=factory`），旧版本目录仍在；② 真机——`phase=rollback ok=1 detail=restored:<旧版本>` + 旧版重启成功；③ 清理不误删——`cleanup()` 只删非活跃版本目录与旧布局残留（T-A6；`harness cleanup active=<v> removed=<n>`）。
- **注 B04-4（AC14）**：AC6 = grep 五文件命中 0；AC8 = `node --test tests/update-lib.test.js` 全绿（17 例）；AC1/AC3/AC7 = 假源桩 + 日志面复测；AC5/AC10/AC11/AC12 = 真机抽测（安装器 / 徽标与插件更新 / 发版演练 / `~/.dsh` 快照）。

**B05 判定面细化（AC15 / AC15-b；逐条可机检）**

- **注 B05-1（AC15）**：三态逐条判定
  ① **正常路径**：隔离 userData（`--user-data-dir`，B02 §6.7 手法）预置 `updates/` 四类条目（无扩展名成品 `installer` / `Bigfish-Setup-<v>.exe` / 半成品 `x.part` / 子目录各一）→ 启动 → `update cleanup type=app removed=4 failed=0` 在场 + fs 断言 `updates/` 下无条目（目录本身保留）。
  ② **占用路径**：预置一条被独占句柄 / 安装器运行期锁定的条目 → 启动不阻断（进程存活、后端 ready 或窗口正常）+ `failed=1`（>0）且该条目仍在；解除占用后再启动 → `removed=1 failed=0` + 目录空。
  ③ **空目录 / 目录不存在**：启动照常无报错 + `removed=0 failed=0` 在场（取证行恒在场——唯一调用点 = 启动）。
  ③b **枚举失败**（目录存在但枚举抛非 `ENOENT` 错：`EACCES` / `EPERM` / `ENOTDIR`；评审 #1 补）：**期望行** = `update cleanup type=app removed=0 failed=0 detail=read-fail`，启动照常；该形态**本轮不入机检集与用例表**（纳入须同步批次档 §2.5 判据与 §3.2 用例，属范围变动），列此供真机排查按行匹配。
- **注 B05-2（AC15-b）**：
  ① 静态——`startupCleanup` 是 `userData/updates/` 的**唯一**删除点（`grep -n "'updates'" *.js` → `updater.js:118` 下载落点 + `:462` 回收面）；`updater.js` 内无 `.endsWith('.part')` 残留。
  ② 回归——AC3/AC4 真机假桩复测（正常包 → `verify ok` → 下次启动回收；篡改包 → `verify fail` + 可重试，立即拒装面不变）。
  ③ AC6 grep 五文件零命中；AC8 `node --test tests/update-lib.test.js` 全绿（本批不改该面）。

### 3.2 用例表

| 用例 | 类型 | 输入 / 前置 | 预期输出 | 映射 |
|---|---|---|---|---|
| TC-1 | 正常 | 打包版 + 假清单桩（version 0.9.9）启动 | 5s 内弹窗显示 v0.9.9 + note + 当前版本 | US-1 / AC1 |
| TC-2 | 正常 | 托盘「检查更新」，清单 version ≤ 当前 | 气泡「已是最新版本」 | US-1 / AC1 |
| TC-3 | 正常 | `BIGFISH_UPDATE_INTERVAL_MS=60000` + 假清单（有更新） | 1 分钟内托盘气泡、无模态窗；点击气泡出确认弹窗 | US-1 / AC2 |
| TC-4 | 边界 | 清单缺 `urls[当前平台]` | 弹窗可出但下载阶段明确报错「该平台暂无安装包」 | US-2 / NFR-3 |
| TC-5 | 正常 | 正确 sha256 的安装包桩下载 | 进度推进 100% → `verify ok` → ready 态 | US-2 / AC3 |
| TC-6 | 错误 | 篡改包（sha256 不匹配） | 拒装、清临时文件、窗口错误态 + 重试 | US-2 / AC4 |
| TC-7 | 边界 | 清单无 sha256 段（旧格式） | 不崩溃；下载完成后拒装并明确报错（fail-closed） | US-2 / NFR-2、NFR-3 |
| TC-8 | 错误 | 下载中断网（10s 无数据） | 中止下载、清 .part、错误态可重试 | US-2 / NFR-1 |
| TC-9 | 正常 | 真实安装演练（Windows） | 安装器启动、应用退出、装完自动拉起新版 | US-3 / AC5 |
| TC-10 | 正常 | grep AC6 命令 | 5 处 GitHub 残留全清，清单源唯一 Gitee raw | US-4 / AC6 |
| TC-11 | 错误 | 断网启动（自动检查） | 无弹窗无气泡，日志 `result=error` | US-5 / AC7 |
| TC-12 | 错误 | 断网手动检查 | 错误弹窗 + [重试] 可用，恢复网络后重试成功 | US-5 / AC7 |
| TC-13 | 边界 | 开关关闭 + 重启 + 运行 > 一个轮询周期 | 日志零 `check` 行（市场页打开除外） | US-5 / AC7 |
| TC-14 | 边界 | dev 模式运行 | 零检查行为；手动点击提示「只在安装版可用」 | US-5 / AC7 |
| TC-15 | 正常 | `node --test tests/update-lib.test.js` | 全绿（断言表 + 假源 fixture） | US-6 / AC8 |
| TC-16（B04 改写） | 正常 | 假源 Harness 更新（出厂 0.1.0-rc.6 vs latest 0.1.5-rc.1） | 安装落 `userData/dsh-update/versions/0.1.5-rc.1`（**不改名**）→ 停后端 → 写活跃指针 → 复核通过 → 重启成功；日志 `harness activate verify ok=1` + `phase=activate ok=1` + `active path=<版本目录>/… version=0.1.5-rc.1` + `backend ready`；旧版本目录已回收 | US-6 / AC9 |
| TC-17（B04 口径） | 错误 | Harness 安装中断网 / 坏包（prepare/install 阶段失败） | 目标版本目录清理、旧版照常运行、错误态可重试（运行中旧版未被动过） | US-6 / AC9 |
| TC-18 | 正常 | 假注册表条目 version > 已装 → 市场已安装视图 | 「可更新」徽标 + 更新按钮；更新后日志 `plugin update … ok` + 后端重启 | US-7 / AC10 |
| TC-19 | 正常 | 多个可更新插件 → 「全部更新 (N)」 | 逐项执行、汇总 toast、一次重启 | US-7 / AC10 |
| TC-20 | 边界 | github: 源插件更新 | 按原 installSpec 重装（日志 spec 前缀 github:） | US-7 / AC10 |
| TC-21 | 正常 | `node make-latest.js --note "…"`（产物齐全） | latest.json 含三平台 sha256 + 上传清单打印 | US-8 / AC11 |
| TC-22 | 边界 | `node make-latest.js`（产物缺失） | 缺失平台跳过；全缺 → 退出码 1 + 错误 | US-8 / AC11 |
| TC-23 | 正常 | App + Harness 更新演练后快照对比 `~/.dsh` | 配置/会话/插件文件无差异（pnpm-store 新依赖树为预期增量，不计） | US-9 / AC12 |
| TC-24 | 错误 | update-stub 组合路由：npmmirror 元数据路由 404 + 兜底（npmjs）路由正常 | Harness 元数据获取按设计回退：npmmirror 失败 → npmjs 兜底成功 → 判定有更新 | US-6 / AC8 |
| TC-25（B04 改写） | 错误 | 激活失败：① 指针写入失败；② 目标目录不可解析；③ 目标目录 == 活跃目录（重装守卫，落 prepare）；④ 提交点（写指针）后的取消 | ① `phase=activate ok=0 detail=pointer-fail:…`（无 rollback 行）；② `verify-fail:resolve` + `rollback ok=1`；③ `prepare ok=0 detail=guard-active-dir`；④ 取消不生效（不删活跃目录、不回写指针）。共同：现行副本未动、旧版照常、可重试 | US-6 / AC9 |
| TC-26（B04 新增） | 错误 | **失效副本故障注入**：`bin.js` 缺失 / 链接悬空（单元 temp；真机隔离 userData） | `verify ok=0 stage=resolve` + `phase=activate ok=0` + `phase=rollback ok=1 detail=restored:<prev>|factory`（执行层 = `activate()` 内调 `rollback()`；落笔 updater.js）；指针回 `prev`/清指针；解析回退出厂；后端跑旧版；**无假成功行** | US-6 / **AC9-b** |
| TC-27（B04 新增） | 边界 | **既有坏状态**（已中过本缺陷的 userData）：旧布局 `userData/dsh` = 失效 junction 树（2455 条绝对目标）+ 无指针 | 启动清理：`harness migrate legacy=removed version=unknown`；旧副本被回收（尽力而为）；解析回退出厂副本；后端正常启动；用户重跑更新 → TC-16 结果 | US-6 / AC9、AC13 |
| TC-28（B04 新增） | 边界 | 旧布局 `userData/dsh` **可解析**（`bin.js` 在）+ 无指针（典型：POSIX 上已更新过的用户） | 启动清理采纳：`harness migrate legacy=adopted version=<该副本读数>`；指针写出（`dir='dsh'`）；**不重装、不删除该副本**；GC 跳过它（`harness cleanup active=<v>`） | US-6 / AC9、AC13 |
| TC-29（B04 新增） | 边界 | 版本 GC：指针指向 `versions/A`；另存 `versions/B`（已装完但未激活）、旧布局 `userData/dsh`（**可解析但非活跃**——非指针目标）与 `dsh-prev`、`dsh-update/staging` | 清理删 B 与三项旧布局残留（含可解析非活跃 `userData/dsh`）：`harness cleanup active=A removed=4`；**A 保留**（AC13「不误删现行副本」）；`userData/dsh` 已回收；重新解析仍命中 A | US-6 / **AC13** |
| TC-30（B04 新增） | 错误 | 指针防御：`dsh-active.json` 吸形——非法 JSON / `dir='../../x'` / `dir` 为绝对路径 / `version` 含路径分隔符 / `prev` 形态非法 | `readPointer` 返回 null（不越出 userData）；解析回退出厂副本；不抛异常、不写坏状态；合法写入后无 `.tmp` 残留 | US-6 / NFR-2 |
| TC-31（B04 新增） | 正常 | 激活完成后 `getCurrentDshVersion()` 读数面 | 等于目标版本；紧随其后的 `check` 行 `type=harness result=up-to-date latest=<v> current=<v>`（不重复提示同一版本） | US-6 / AC9 |
| TC-32（B05 新增） | 正常 | 隔离 userData 预置 `updates/` 四类条目（无扩展名成品 / `.exe` 成品 / `.part` 半成品 / 子目录）→ 打包版启动 | `update cleanup type=app removed=4 failed=0`；fs：`updates/` 无条目（目录在）；启动 / 后端不受影响 | US-10 / AC15 |
| TC-33（B05 新增） | 错误 | 占用路径：预置一条被锁定条目（真机模拟：安装器运行期其 exe 被锁 / 独占句柄） | 本次启动：`failed=1`、条目仍在、**不阻断启动**（后端 ready、窗口正常）；解除占用后再启动：`removed=1 failed=0`、`updates/` 空 | US-10 / AC15 |
| TC-34（B05 新增） | 边界 | 空 `updates/` 目录 / 目录不存在 | 启动照常、无报错；`update cleanup type=app removed=0 failed=0` 在场 | US-10 / AC15 |

### 3.3 验证手段、仪表与限制

**验证手段**

1. **开发期单元断言（纯函数面）**：`node --test tests/update-lib.test.js`（无需 Electron——`update-lib.js` 无 electron 依赖）。覆盖 §2.2.6 断言表与假源 fixture。退役/转正处置落批次档 §6（默认退役）。
2. **开发期单元断言（版本库面，B04 新增）**：`node --test tests/harness-store.test.js`——直驱 `harness-store.js`（纯 Node、无 Electron、不 spawn 真 pnpm：冒烟 runner 以假实现注入）。
   用例表（T-A1…T-A8，与 §3.2 的映射见括注）：

   | 用例 | 类型 | 输入 / 前置 | 预期 | 映射 |
   |---|---|---|---|---|
   | T-A1 | 正常 | temp 下造 `versions/<v>` 完整副本（`bin.js` + `package.json.version=v`） | `activate` 写指针 → `resolveActiveBin` 命中该副本；`verifyActive` `ok:1 stage:smoke` | TC-16 |
   | T-A2 | 错误 | **失效副本故障注入**：副本内 `bin.js` 缺失（等价 junction 悬空；win32 可 `symlinkSync(target,'junction')` 指向不存在路径，不可构造则 skip） | `verifyActive` `ok:0 stage:resolve`；`activate` → `mode:'restored'`（有 prev）/ `'factory'`（无 prev）；指针回 `prev` / 清指针；`resolveActiveBin` 回退出厂 | TC-26 |
   | T-A3 | 错误 | 副本 `bin.js` 在、但 `package.json.version` ≠ 目标 | `verifyActive` `ok:0 stage:version` → 回滚 | TC-26 |
   | T-A4 | 错误 | 注入 runner 返回非零 / 输出不含版本 | `verifyActive` `ok:0 stage:smoke` → `activate` 回滚并返回指针回 `prev` 的 `mode:'restored'` 或清指针的 `mode:'factory'`（与 `rollback()` 同一词汇） | TC-26 / AC13 |
   | T-A5 | 边界 | 无指针 + 旧布局 `dsh` 可解析 / 不可解析两态 | 前者 `cleanup` 采纳并写指针；后者回收且不写指针 | TC-27 / TC-28 |
   | T-A6 | 边界 | 指针指 `versions/A`，另有 `versions/B` + 旧布局残留（`dsh` 可解析但非活跃 / `dsh-prev` / `dsh-update/staging`） | `cleanup` 只删非活跃者（含可解析非活跃 `dsh`），A 保留；`removed` 计数与实删项一致；指针 `prev` 若引用被回收目录则一并置 null | TC-29 / AC13 |
   | T-A7 | 错误 | 指针吸形（`..` / 绝对路径 / 非法版本名 / 非法 JSON） | `readPointer` → null；不越出 userData；不抛异常 | TC-30 |
   | T-A8 | 正常 | 指针写入后回读 | `dsh-active.json` 为完整 JSON（`rename` 原子面）；无 `.tmp` 残留 | TC-30 |

   本节用例不 spawn 子进程、不触网、目录树浅且固定在 `os.tmpdir()` 下——单例预期远低于慢测归册阈值（500ms/例），不触归册。
3. **假源桩**：`tests/update-stub.mjs`——本地 http 服务（`http://127.0.0.1`，属 §2.2.2 env 覆盖钩子的 https 豁免面），路由：`/latest.json`（可配 version/sha256 参数）、`/installer`（可配字节流与篡改模式）、`/registry/npmmirror`（元数据，可配 404）与 `/registry/npmjs`（兜底元数据，正常）——后者组合供 TC-24 源回退断言。
   打包版手测时以 `BIGFISH_UPDATE_URL` / `BIGFISH_DSH_REGISTRY_URL` / `BIGFISH_DSH_REGISTRY_FALLBACK_URL` 指向之。
4. **诊断日志取证**：`userData/updater.log`，行格式见 §2.2.9——AC1/AC2/AC3/AC4/AC7/AC9/**AC9-b/AC13**/AC10 的机器证据面。
5. **静态核对**：`node --check` 于全部改动/新增 js（含 `harness-store.js`）；AC6 grep；「compareVersions 定义唯一」「`dependencies` 保持空数组」「临时路径常量」grep 项；
   **B04 附加项**：`updater.js` 内不残留 `renameSync` 于安装树（版本目录改名是 I-1 违纪）；`main.js`/`updater.js` 不直接读写 `dsh-active.json`（指针单点归 `harness-store.js`）。
   **B05 附加项**：`updater.js` 内无 `.endsWith('.part')` 残留；`userData/updates/` 唯一删除点 = `startupCleanup`（`grep -n "'updates'" *.js` 仅两处）；`node --check updater.js`；行宽 ≤300 字符。
6. **手工验证清单**：按 §3.2 逐条执行并记录（真实安装、气泡观感、徽标、发版演练、数据快照对比；**B04 加：真机失效副本注入 TC-26 与旧布局坏状态 TC-27**；**B05 加：隔离 userData 的回收三态 TC-32/TC-33/TC-34**）。
7. **真机 fs 断言（B05 新增）**：隔离 userData（`--user-data-dir`）+ 隔离 `DSH_HOME` 启动打包版（B02 §6.7 的成熟手法），按注 B05-1 三态预置 / 复核 `userData/updates/` 条目与 `updater.log` 行——AC15 / AC15-b 的机器证据面（与 AC4「fs 断言」同口径）。
8. **B05：不新增 `tests/` 文件（判据三条）**：
   ① 落点在 `updater.js`（`require('electron')`，`L19`）——按 DD-18 口径不把「electron 在纯 node 下的偶然可解析」当测试面，故无 `node --test` 直驱面；
   ② 要获得直驱面须把该循环抽成新纯模块，而新文件必须同步 `package.json` 的 `build.files`（`L37-66`）——与零新依赖 / 零文件增长约束（`docs/batches/B05-installer-cleanup.md` §1.7）相冲，且 8 行 fs 循环独立成模块语义收益为零；
   ③ AC15 的机检面本就是真机 fs 断言 + 日志（手段 7），与 AC4 同口径。

**只能人工验证的条目（如实标注）**

- AC1/AC2 的弹窗与气泡观感、AC5 真实安装、AC9 真实更新、AC10 徽标/按钮交互、AC11 发版演练、AC12 数据快照——均涉 UI 观感或真实安装环境，主进程侧无自动化断言面，只能人工执行；其机器证据（日志行）如 §3.1 所列。
- **B04 的 AC9-b / AC13**：主要面向机检（单元故障注入 + 日志 + fs 断言）；真机失效注入（TC-26）需人工准备隔离 userData 后观察日志与后端行为。
- **B05 的 AC15**：正常路径（TC-32）与空目录路径（TC-34）可完全机检（fs + 日志）；占用路径（TC-33）需人工制造占用并观察两次启动——占用解除的时序由人工控制，无法自动化。

**本批不引入的内容（明确边界）**

- 不引入测试框架 / `test` script（T4 认账不排期）——`node --test` 直跑文件，不登记 package.json；
- 不做 CI / 自动上传（发布脚本只生成产物与清单）；
- 不做 main.js 六域拆分（C6 评估，§2.3）；
- **B04**：复核冒烟不 spawn 真 pnpm（runner 以假实现注入）；不引入版本栈 / 自选版本回退（US-6 无此需求，DD-20）。
- **B05**：不新增测试文件（判据见手段 8）；不引入常驻清理服务 / 定时扫盘（唯一触发 = 启动，US-10 边界 ①）；不改下载落点与 `.part` 中间态命名（AC15-b）。

---

## 四、变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-16 | 初版：B02 批次自动更新设计——需求层回指（US-1…US-9、NFR-1…NFR-4）、方案选型对比（A–F 六组）、架构契约（模块边界 / 清单 schema / App / Harness / 插件三条流程 / 版本比较 / 调度开关 / 发布脚本 / 日志）、受影响文件全清单与拆分评估、关键决策 DD-1…DD-14、冲突核对与观察项（O1/O2）、UI 决策 U-1…U-13、测试层（AC1…AC12 判定细化 + 用例 TC-1…TC-23）。 |
| 2026-09-16 | 评审修正轮（评审 #1/#2/#3/#4/#5/#7/#9/#11 落地）：§2.2.2 测试钩子补 https 豁免声明 + 注册表兜底 env 覆盖；§2.2.4 Harness 激活改「停后端 → rename 切换 → 重启后端」+ rename 失败分支；§2.2.1 契约补 cancelAppDownload / cancelHarnessInstall；§2.2.9 补 dsh active / backend ready 两行； |
|  | §2.3 market.js 增量压 ≤±5 守 500 线；§2.4 增 DD-15（单函数 <300 行）、DD-3 补停后端先决；§3 增 TC-24 源回退 / TC-25 rename 失败、AC8/AC9/AC12 判定行细化；§2.6 U-13 取消语义。 |
| 2026-09-16 | T3 裁定落档（用户批准，批次档 §4.3）：§2.1 选型 D 补裁定结论（A 删除死代码——删 `setPetEnabled()`，`settings.petEnabled` 键与 `DEFAULT_SETTINGS` 保留，托盘不新增桌宠开关）；§2.3 main.js 改动点 ①–⑨ → ①–⑩（增「删除 setPetEnabled，−5 行」）、净增量 −约 70 → −约 75（末行数 ≈2050 → ≈2040 随净增量相应并入）。 |
| 2026-09-16 | T3 裁定残留句清理（docs-first 修正轮收尾）：§2.6 open 项 →「T3 已裁定（A 删除，批次档 §4.3），随实施落地」；§2.5 C7 结论 →「已裁定（A 删除，2026-09-16，批次档 §4.3）」；§2.3 拆分计划「main.js 只留接线（净增约 60 行）」→「净增约 55 行」（与 ①–⑩ / −约 75 算术一致）。 |
| 2026-09-16 | **B04 修正设计**（Harness 更新激活失效，批次档 B04 §1）：新增 §2.0 偏差记录与 §2.1 选型 G（四候选 → 选定「版本化目录 + 活跃指针」）；§2.2.1/§2.2.4/§2.2.9 改写为「版本库指针 + 激活后复核 + 旧布局迁移/GC」；§2.4 增 DD-3a 与 DD-16…DD-20；§2.5 增 C9–C12 及 O3/O4、L6–L8；§3.1 细化 AC9 并增 AC9-b/AC13/AC14；§3.2 改 TC-16/17/25、增 TC-26…TC-31 与 T-A1…T-A8。**不改需求档。** |
| 2026-09-16 | **B04 评审修正轮**（评审 #1/#2/#3/#5/#6 落地）：§2.2.4 ⑤ 增取消提交点边界、⑥ 增回滚执行层与 `phase=rollback` 日志行、① 守卫补 phase/detail 形态、startupCleanup 增「可解析但非活跃旧布局 → 回收」；§2.2.1 统一 mode 词汇（取消 `'rolled-back'`）与 cancel 契约；§2.2.9 增 prepare 失败 detail 形态；§2.3 增 >300 行收口复核条件；§3.2/§3.3 用例与 §2.6 U-13 同步。 |
| 2026-09-16 | **B04 实施收口修正轮**（批次档 §5.2 / §5.6 披露 1/2/4/5 落地）：§2.3 表 5 个改动文件「末行数」改按终态实测（2640 / 486 / 332 / 113 / 269）+ 口径说明同步；§2.3 拆分计划就地落「>300 行收口复核结论 = 保持单文件」（依 R3 不升级体量裁定）；§2.2.1 `activate()` 补指针写入失败面；§2.2.4 startupCleanup 补「版本读数不可得 → 回收」子状态。**不改需求档。** |
| 2026-09-16 | **B05 评审修正轮**（评审 #1/#2/#3 落地）：§2.2.3「实现形态」「取证行」拆两类（① 目录不存在 `ENOENT` → `removed=0 failed=0` 仍落取证行；② 枚举失败 `EACCES`/`EPERM`/`ENOTDIR` → `… detail=read-fail`，不并入 `failed`）； |
|  | §2.2.9 主行补 `detail=read-fail` 子形态 + 行数口径注明「15 = 主格式行 / 6 处变体不并入」（两处「上表」相对指针改「本节主表」）；§2.3 按实测对账（需求档 134 → 146 / +12）+ 补本档自身行（748 → **838**）+ 表口径注明「文档行按实测 / 代码行按预估」；§3.1 注 B05-1 ③ 补枚举失败期望行（不入本轮机检集）。 |
| 2026-09-16 | **B05 评审修正轮 2**（评审 #1/#4 落地）：§2.3 `main.js` 行重测更正（2640 → **2827**，末行数同步）；§2.2.3 / §2.5 O5 / §2.2.9 变体段的 `main.js` 行号指针改符号锚定（现行为准：`upd:install-now` 处理器 `main.js:2781-2787`、`result=skip` 取证行 `main.js:2149`）；§2.2.9 口径行补「`detail` / 取值子行随所属主行计价、不另计」半句；本档行数 838 → **839**。**不改需求档。** |
| 2026-09-16 | **B06 口径修订注记**（类别 = 语义变更，源 = `docs/batches/B06-shell-ux.md` §1.3 C5 / §1.4 R4；权威口径 = `docs/requirements/SHELL.md` §三 US-6 + `docs/design/SHELL-UX.md` §2.2.5）：dev 更新门禁旧口径九处加注修订——需求层 C5 / C12 · §2.2.1（`dshBinPath`）· §2.2.7（门禁条）· §2.2.9（gate 行）· §2.5（C5 / C12 / L5）· §2.6（U-12）； |
|  | §2.2.9 gate 行就地换新形态（计数不变 = 15）；§2.3 补 as-of 行数注（2831 / 116——历史值不改写）。 |
