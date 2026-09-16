# 设计档 SHELL-UX — 桌面壳 UX 整合（启动 · 托盘 · 桌宠交互 · 更新门禁 · main.js 拆分）

> 归属板块：桌面壳
> 落点：`docs/design/SHELL-UX.md`
> 关联需求档：`docs/requirements/SHELL.md`（US-1…US-8、NFR-1…NFR-4）
> 关联批次：`docs/batches/B06-shell-ux.md`（§1.3 需求结论 C1–C7、§1.4 技术裁定 R1–R7、§1.5 验收 AC1–AC7、§1.6 事实、§1.7 既有约束）

---

## 一、需求层

本层只做回指与实现约束补充——需求条文的权威源在 `docs/requirements/SHELL.md`，此处不重述。

| 需求条目 | 一句话 | 本设计中的承载节 |
|---|---|---|
| US-1 桌宠左键 = 只开不隐 | 左键显示并聚焦主界面，不做 toggle | §2.1 A、§2.2.1、§2.2.2 |
| US-2 桌宠右键 = 只开兑换屋 | 右键只开兑换屋，两条链互不串 | §2.1 A、§2.2.1 |
| US-3 删除新手向导 | 三文件 + 全部触点摘除；首启无 Key 路径交代 | §2.2.4 |
| US-4 托盘菜单重排 | 一级 ≤12、模式提级、兑换屋可达、危险隔离 | §2.1 B、§2.2.3、§2.6 |
| US-5 冷启动形态 | 桌宠 + 托盘；主界面不自动显示 | §2.1 C、§2.2.2 |
| US-6 更新门禁口径 | dev：无 App 面；Harness 放行；安装版不变 | §2.1 D、§2.2.5 |
| US-7 `main.js` 拆分 | 按域拆分、每文件 <500 行、零回退 | §2.1 E、§2.2.6 |
| US-8 无用文件清理 | 删除无用脚本 / 重复图与旧贴图（保留 `idle.png`） | §2.1 F、§2.2.7、§3.1 AC8 |
| NFR-1 启动与首启可用性 | 无自动可见窗口；首启 ≤2 步到达设置 | §2.2.2、§2.2.4 |
| NFR-2 兼容性 | Windows 验收；macOS/Linux 不回归 | §2.3、§2.5 |
| NFR-3 可维护性 | 拆分口径 + 取证锚点不丢 | §2.2.6、§3.3 |
| NFR-4 双态可解释性 | dev 与安装版差异只允许两处 | §2.2.5、§2.5 |

**设计必须正面处理的既有约束**（来自批次档 §1.6 / §1.7，行号为设计者亲读的现行值，as-of 2026-09-16）：

| # | 既有约束 | 证据（现行行号） |
|---|---|---|
| C1 | 写域冲突（硬）：`main.js` 被 B03 会话持有未提交改动——B06 实施前必须错开 | `docs/batches/B06-shell-ux.md` §1.7；`git status` 实测（main.js 处于已修改未提交态） |
| C2 | 按键判断缺失：渲染层 `pointerdown` / `pointerup` 不判 `button`，右键松开同样走 `clicked()`；右键正经语义在 `contextmenu` | `pet.js:98` / `:117` / `:125` |
| C3 | 托盘菜单 = 17 顶层项 + 4 分隔线（含「模式」「Windows 右键菜单」两个子菜单） | `main.js:1889-1930` |
| C4 | 向导触点：定义 `:616`；托盘项 `:1893`；启动调用 `:2550`；IPC `:2580-2588`；默认值 `:81`；`welcomeWindow` 变量 `:63`；三文件 + `build.files` | 逐处亲读 |
| C5 | 更新门禁（dev）：手动检查弹「只在安装版可用」+ 日志；自动检查静默跳过；`dshBinPath()` dev 固定走 `dsh-bundle/` | `main.js:567-576` / `:578-584` / `:131-140` |
| C6 | `main.js` 现 2831 行（远超 500 行硬上限；T2 存量债） | 实测；技术待办 T2 |
| C7 | `createWindow()` 为「建窗即 show」形态（`show:false` + `ready-to-show` 自动显示；向导窗同刻被拉起） | `main.js:725-773` |
| C8 | 零新依赖 / 不引构建步骤（保持「直接跑源码」可运行） | `package.json:25-29`（dependencies 空数组） |
| C9 | 既有取证锚点（B01/B03 桌宠日志、B02/B04/B05 updater.log 行、console 行、env 开关）——拆分不得丢失 | `docs/design/AUTO-UPDATE.md` §2.2.9；`docs/design/PET-MULTIMONITOR.md` §3.3 |
| C10 | 既有 dev 提示家族三处：卸载（`:319`）、Windows 右键菜单安装（`:1976`）、更新检查（`:569`）——本批只动更新检查面 | 逐处亲读 |

---

## 二、设计层

### 2.1 方案选型对比

判据取自需求层：US-1…US-8 与 NFR-1…NFR-4；拆分组另加批次档 §1.4 R7 与用户「拆得合理」口径。

#### 选型 A —— 桌宠按键语义的实现面（F1 / US-1·US-2）

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **渲染层按键守卫**（`pointerdown` / `pointerup` 判 `button === 0`；右键链只走 `contextmenu`）+ 主进程 `pet-clicked` 语义改「只开不隐」 | 两条链各自只有唯一入口（左键 = pointer 链，右键 = contextmenu）；拖动 / 指针捕获 / 自愈 / 心跳全部保持既有 pointer 机制；主进程无法区分来源的问题被消掉 | 渲染层 +4 行守卫；`pet.js` 属 F1 改动面（不在 F6 只搬不改面内） | **选定** |
| 2 | 仅主进程抑制（收到 `pet-right-clicked` 后回补显隐状态 / 抑制后续 `pet-clicked`） | 事件顺序 = `pointerup`（触发 `pet-clicked`）先于 `contextmenu`——主进程收到右键信号时左链已执行，闪烁不可避免 | — | 否决 |
| 3 | 弃 pointer 事件、改写 `mousedown` / `mouseup` + `button` 判定 | 重构拖动链（捕获 / 自愈 / 心跳均建于 pointer 之上）= 高风险回归，偏离 US-1/US-2 的最小改动面 | — | 否决 |

#### 选型 B —— 托盘菜单结构（F3 / US-4）

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **重排草案 + 兑换屋一级补位**：11 个一级项 + 4 分隔线；「模式」提为一级 radio；设置四项归「设置 ▸」；危险四项归「高级 ▸」 | 一级 ≤12 ✓；高频在前 ✓；模式提级（用户点名）✓；兑换屋可达（专注模式硬要求）✓；全部既有能力保留 ✓ | 与现状差异较大（17 项 → 11 项 + 2 子菜单重排），真机目视核对成本 | **选定** |
| 2 | 保持现状（17 项平铺 + 模式二级子菜单） | 与用户原话「不好用 / 不符合人类视觉习惯 / 模式放二级不好用」冲突 | — | 否决 |
| 3 | 全平铺（不设子菜单，设置项也一级化） | 一级 >12，危险操作未隔离 | — | 否决 |
| 4 | 大幅精简（删 Windows 右键菜单项 / 自动检查更新等） | 违反「既有能力不得回退」（`docs/batches/B06-shell-ux.md` §1.7） | — | 否决 |

> 结构明细（逐项清单 / 排序 / 与现状差异）落 §2.2.3；相对 R5 基线的两处设计优化（兑换屋补位、「显示 / 隐藏主界面」保留 toggle）理由 = §2.4 DD-3 / DD-4。

#### 选型 C —— 启动形态（F4 / US-5）

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **先建不 show**：引导序列仍建主窗（后端就绪后 `loadURL` 照常），仅去掉 `ready-to-show` 的自动显示；显示收口为显式请求（`showMainWindow()`） | 与现状仅差「可见性」一处；URL 加载时点不变（后端已就绪）✓；`--open` / 第二实例 / 快捷键 / 托盘路径零改动 ✓；后端照常启动（R2）✓ | 窗口仍在引导时创建（内存占用与现状相同——非本批诉求） | **选定** |
| 2 | 懒建（不建窗，首次请求时创建） | 省内存；但引入「首次打开时后端就绪性」竞态（`--open` / 早点击场景）、`activate` / `restartBackend` 等路径耦合面扩大 | 省资源，换来多处新失败模式 | 否决 |
| 3 | 保持现状（自动显示） | 与 C4 / R2 冲突（用户「太冗余重复了」） | — | 否决 |

#### 选型 D —— 更新门禁口径（F5 / US-6）

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **入口单一 + App 面静默跳过**：托盘「检查更新」保留（= harness 检查入口）；dev 下 App 面不执行、无 UI、记 `face=app skipped=dev`；harness 面两态放行 | 无 dev 弹窗（用户诉求）✓；harness 在 dev 可用且真生效（R4 b/c）✓；安装版零改动（AC6）✓；菜单跨态稳定（双态可解释，NFR-4）✓ | dev 的「检查更新」项不再对应 App 自更新（面板形态不变，语义按 face 收敛，落到日志） | **选定** |
| 2 | dev 下隐藏「检查更新」项 + 另设「检查 Harness 更新」项 | 菜单双态分叉（dev ≠ 安装版）——违反 NFR-4 可解释性；一级项计数随态变动 | — | 否决 |
| 3 | 拆两项（「检查 App 更新」+「检查 Harness 更新」）恒显示，dev 隐藏 App 项 | 改变安装版既有形态（B02 U-7 的单入口口径），面板复杂度上升，超出本批范围 | — | 否决 |
| 4 | 保留 dev 弹窗（现状） | 与用户原话「不要做这个显示」冲突 | — | 否决 |

#### 选型 E —— `main.js` 拆分方案（F6 / US-7）

判据（照批次档口径 + 用户「拆得合理」）：**P1** 单文件 <500 行 · **P2** 高内聚低耦合 · **P3** 零行为回退 · **P4** 零新依赖 · **P5** 不引构建步骤 · **P6** 既有取证行 / 日志口径不丢。

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **按功能域拆为 15 个平铺模块（root）+ `main.js` 组合根**；跨模块依赖以注入（`init(deps)`）+ getter/setter 访问器表达 | P1✓（预估最大者 ≈400 行）P2✓（一域一模块）P3✓（纯搬移，允许面见 §2.2.6）P4✓ P5✓（CommonJS require，无构建）P6✓（锚点清单逐条核验） | 15 个新文件 + 接线样板（净增 ≈600 行）；`build.files` 同步 15 项 | **选定** |
| 2 | 子目录布局（`shell/` 聚合，`shell/pet.js` 等） | P1✓ P2✓ P4✓ P5✓；**P3 代价**：`path.join(__dirname, …)` 相对路径全面漂移（资产 / `dsh-bundle` / 各窗口 `loadFile` / preload 路径），迁移面从「搬函数」扩到「改路径」 | 目录更整洁，换来全量路径改写风险 | 否决 |
| 3 | 横向分层（`windows.js` / `ipc.js` / `state.js` / `timers.js` 按技术层切） | P1✓ P4✓ P5✓；**P2✗**：一个窗口的创建 / 关闭 / IPC / 状态散落四文件，改一处要跨读四档；**P3 代价**：状态归属被横向切割，迁移非纯搬 | — | 否决 |
| 4 | 最少切割（只按行数保证 <500 的最少切分） | P1✓ P4✓ P5✓；**P2✗**：切面跨域（一个功能被切两半）；**P6✗**：取证锚点被分割到多文件 | — | 否决 |
| 5 | 引入打包器 / ESM 化（esbuild / rollup + `import`） | P1✓ P2✓；**P5✗**（引入构建步骤，「直接跑源码」不再可运行）；**P4✗**（新增工具链依赖） | — | 否决 |
| 6 | 只拆最大域（pet 域）其余保留 | **P1✗**：`main.js` 仍 ≈2100 行 >500，目标未达 | — | 否决 |

> 拆分后的模块清单 / 依赖方向 / 迁移顺序落 §2.2.6；受影响文件与行数预估落 §2.3。

#### 选型 F —— 无用文件清理范围（F7 / US-8）

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **白名单精确删除**（主 agent 核实清单：2 脚本 + 根重复图 + 9 张旧贴图） | 每项逐条可核（0 引用 / 跑不起来 / 字节级重复）；保留清单明确；全部机检 | 不做全仓扫描——潜在无用文件留待后续批次 | **选定** |
| 2 | 全仓未引用文件扫描后大清理 | 范围失控：`probe-*.js`（B03 T9 待用）/ `debug-pet.cmd` / 另一会话在途文件（`.npmrc` / `scripts/` / `package-lock*`）均为误伤面 | — | 否决（越出用户指示范围） |
| 3 | 不清理（保持现状） | 与用户指示「删 1-5」直接冲突；「残留即示范」 | — | 否决 |

> F7 与 F1–F6 同批（主 agent 裁定 2026-09-16）：清理面小、可机检、与本批「零残留」方向同源；实施时机 = P0 第 ⑥ 步（独立提交）。

### 2.2 架构与契约

#### 2.2.1 桌宠交互契约（F1 / US-1·US-2）

**修改点两处**：

1. `pet.js`（渲染层守卫，`pet.js:98` / `:111` / `:113-120`）：
   - `pointerdown` 监听加 `if (e.button !== 0) return;`——仅左键进入拖动 / 点击链。
   - `pointerup` 监听加同款守卫——仅左键走「点松收尾」（`moved` 分支不变）。
   - `pointermove` 的对称自愈起拖条件由 `e.buttons !== 0` 改为 `(e.buttons & 1) !== 0`（仅左键按住时才重新起拖）。
   - `pointercancel` / `lostpointercapture` / `contextmenu` 监听不变（右键链唯一入口 = `contextmenu` → `rightClicked()`）。
2. `main.js` `pet-clicked` 处理器（`main.js:2660-2667`）：`toggleMainWindow()` → `showMainWindow()`；其余语句（`petStopDrag('pointerup')` / `wakePet()` / `petSay(...)` / happy 动画）逐字保留。

**IPC 面**：通道与载荷零变更（`pet-clicked` / `pet-right-clicked` / `pet-drag-*` / `pet-set-ignore-mouse`）；`pet-preload.js` 不改。

**边界情形（设计判据）**：

| 情形 | 期望行为 |
|---|---|
| 左键原地点击（主界面已显示） | 仍为显示 + 聚焦（不隐藏）——US-1 核心判据 |
| 左键拖动后松手 | 不触发点击语义（位移 >5px 判拖动，既有阈值不变）、不开任何窗口 |
| 右键（兑换屋未开） | 只开兑换屋；主界面显隐状态不变 |
| 右键（兑换屋已开） | 兑换屋 `show()` + `focus()`（既有逻辑）；主界面状态不变 |
| 右键连点 / 左右交替 | 无交叉触发（左链只在左键抬起时执行；右链只在 `contextmenu` 时执行） |

#### 2.2.2 启动形态与窗口显示契约（F4 / US-5）

**主窗口改动（`main.js:725-745`）**：

- `createWindow()`：删除 `ready-to-show` 中的 `mainWindow?.show()`（向导窗显示块由 **F2** 先行摘除——§2.2.4；本步摘除后 `ready-to-show` 处理器为空，整块移除）；`show: false`、`close → hide`、`closed → null`、`setWindowOpenHandler` / `will-navigate` / `did-finish-load → applyBackground()` 全部保留。
- 新增 `showMainWindow()`：`mainWindow` 不存在则 `createWindow()`——**零窗口建窗分支经 `ready-to-show` 首帧就绪后才 `show` + `focus`**（防露未加载空窗；实施期形态注，实现 = `main.js:732-733`）；存在则 `isMinimized() → restore()`、`show()`、`focus()`。作为「显示 + 聚焦」的唯一入口。
- `toggleMainWindow()` 保留（`isVisible() ? hide() : showMainWindow()`）——托盘项与快捷键沿用。

**显示时机表**：

| 触发 | 现状 | B06 后 |
|---|---|---|
| 冷启动（whale / focus） | 自动显示（`ready-to-show`） | **不显示**（隐藏建窗；后端照常启动） |
| 桌宠左键 | toggle | 显示 + 聚焦（只开不隐，US-1） |
| 托盘图标左键 | toggle | 不变 |
| 托盘项「显示 / 隐藏主界面」 | （现项为「显示 / 隐藏 Bigfish」，toggle） | toggle（语义不变） |
| 全局快捷键 `Ctrl+Shift+D` | toggle | 不变 |
| 第二实例 | show + focus（`restore` + `show` + `focus`——`main.js:2458` 已含 `isMinimized() → restore()`） | 不变（统一改经 `showMainWindow()`——`restore()` 为既有语义，等价改写零差异） |
| `--open <path>` | show + focus（`handleOpenArg`，`main.js:1999-2005`；**无** `restore()`） | 不变（统一改经 `showMainWindow()`——`restore()` 分支在本路径不可达，见下口径注） |
| macOS `activate` | 零窗口时建窗（建窗即显） | **统一改经 `showMainWindow()`**（显示 + 聚焦）——Dock 点击 = 用户主动显示请求（零窗口时建窗后显示） |
| `welcome-done` | show + focus | 随向导删除移除 |

> **口径注（评审修正轮 1 #6 / #10）**：第二实例路径的 `restore()` 为既有语义（`main.js:2458`，逐字保留）；`--open` 路径（`handleOpenArg`，`main.js:1999-2005`）现行仅 show + focus——统一改经 `showMainWindow()` 属等价收敛：`restore()` 与「不存在则建窗」两分支在本路径不可达（第二实例先经 `:2458` 还原；启动路径 `:2552` 窗口新建未最小化；两调用点 `mainWindow` 均存在）。目视项 = TC-24 / TC-25 / TC-26。

> 判据（NFR-1 / AC2）：冷启动后除桌宠窗与托盘外无自动可见窗口；「可见窗口枚举」= 真机目视 + `BrowserWindow.getAllWindows()` 计数辅助（工具面 = 临时诊断，不新增常驻日志）。

#### 2.2.3 托盘菜单结构（F3 / US-4）

**重排后菜单（`rebuildTrayMenu`，替换 `main.js:1889-1930` 全段）**——一级项 **11** 个、分隔线 **4** 条：

| # | 标签 | 类型 | 点击行为 | 状态条件 |
|---|---|---|---|---|
| 1 | `显示 / 隐藏主界面` | 普通 | `toggleMainWindow()` | — |
| 2 | `检查更新` | 普通 | `manualCheckUpdates()`（dev 语义见 §2.2.5） | — |
| — | 分隔线 | | | |
| 3 | `🐳 鲸鱼模式` | radio | `setMode('whale')` | `checked: settings.mode !== 'focus'` |
| 4 | `🧘 专注模式` | radio | `setMode('focus')` | `checked: settings.mode === 'focus'` |
| 5 | `更换背景…` | 普通 | `chooseBackground()` | — |
| 6 | `恢复默认背景` | 普通 | `resetBackground()` | — |
| — | 分隔线 | | | |
| 7 | `插件市场` | 普通 | `createMarketWindow()` | — |
| 8 | `鲸鱼娘兑换屋` | 普通 | `openExchangeWindow()` | — |
| 9 | `设置` | 子菜单 | 见下 | — |
| — | 分隔线 | | | |
| 10 | `高级` | 子菜单 | 见下 | — |
| — | 分隔线 | | | |
| 11 | `退出` | 普通 | `quitting = true; app.quit()` | — |

**`设置 ▸`（4 项）**：

- `自动检查更新`（checkbox；`checked: settings.autoCheckUpdates` → `setAutoCheckUpdates(item.checked)`）
- `任务完成时通知`（checkbox；`settings.notifyOnComplete` → `setNotify(item.checked)`）
- `开机自启`（checkbox；`settings.launchAtLogin` → `setAutoStart(item.checked)`）
- `Windows 右键菜单`（子菜单）：`安装「用 Bigfish 打开」` → `installContextMenu()` / `卸载` → `uninstallContextMenu()`

**`高级 ▸`（4 项）**：`找回鲸鱼娘`（`enabled: settings.mode !== 'focus'` → `summonPet()`，承 PET US-14）· `重置插件配置（保留 API Key 和会话）` → `resetConfigKeepSessions()` · `彻底恢复出厂（清空所有）` → `resetAllData()` · `卸载 Bigfish` → `uninstall()`。（`找回鲸鱼娘` 分组取舍 = §2.4 DD-16 / §2.6 U-10——低频救援动作，保留本组。）

**与现状差异表（17 项 → 16 项保留 + 1 项删除；全部映射到新结构）**：

| 现状项 | 处置 |
|---|---|
| 显示 / 隐藏 Bigfish | → #1（改名「显示 / 隐藏主界面」，toggle 语义保留——DD-4） |
| 新手向导（设置 API Key） | **删除**（C2） |
| 插件市场 | → #7（位置不变原理：功能组首位） |
| 鲸鱼娘兑换屋 | → #8（保留；补位为设计新增项——草案曾漏，可达性硬要求） |
| 找回鲸鱼娘 | → #10 高级 ▸ 内（降级入子菜单，`enabled` 条件保留；分组取舍 = §2.4 DD-16） |
| 检查更新 | → #2（提位：与主界面同列高频组） |
| 自动检查更新 | → #9 设置 ▸ 内（降级入子菜单） |
| 更换背景 / 恢复默认背景 | → #5 / #6（不变） |
| 模式（子菜单，2 radio） | → #3 / #4 **一级 radio**（提级——用户点名项） |
| 任务完成时通知 / 开机自启 | → #9 设置 ▸ 内 |
| Windows 右键菜单（子菜单） | → #9 设置 ▸ 内（保持子菜单形态） |
| 重置插件配置 / 彻底恢复出厂 / 卸载 Bigfish | → #10 高级 ▸ 内（危险操作隔离） |
| 退出 | → #11（收尾位不变） |

**专注模式可达性论证（US-4 硬要求）**：专注模式 `mode === 'focus'` ⇒ 桌宠窗被 `destroyPetWindow()` 销毁 ⇒ 右键桌宠链不可用；#8「鲸鱼娘兑换屋」为一级常驻项（无 `enabled` 条件），窗口在无桌宠时按既有短路落系统默认位置（L2）。「找回鲸鱼娘」在同模式下按既有条件置灰（PET US-14 不回退）。

**同步改动**：`maybeShowModeDialog()`（`:1856`）detail 文案「之后可以在右下角托盘 → 模式 随时切换。」→「之后可以在托盘菜单切换「🐳 鲸鱼模式 / 🧘 专注模式」。」（结构变更的指路文案同步，非新增语义）。

#### 2.2.4 向导删除与首启体验（F2 / US-3）

**删除清单（逐触点）**：

| 触点 | 处置 |
|---|---|
| `main.js:81` `DEFAULT_SETTINGS.onboardingDone` | 删该行（既有 `settings.json` 中的残留键不再读写；不迁移、不清理——未知键无副作用） |
| `main.js:63` `welcomeWindow` 变量 | 删 |
| `main.js:616-647` `createWelcomeWindow()` | 整段删 |
| `main.js:739-745` `createWindow()` 的 `ready-to-show` 内向导窗显示块（`:741-744`） | 整块删（**归 F2**——与 `:63` 变量删除同一提交，否则引用悬空：`ready-to-show` 触发时抛 `ReferenceError`；评审修正轮 1 #2） |
| `main.js:1893` 托盘项 | 随 §2.2.3 重排删除 |
| `main.js:2550` 启动调用 `if (!settings.onboardingDone) createWelcomeWindow();` | 删 |
| `main.js:2579-2588` IPC（`welcome-open-url` / `welcome-done`） | 整段删 |
| `welcome.html` / `welcome.js` / `welcome-preload.js` | 删除三文件（104 / 23 / 7 行） |
| `package.json:41-43` `build.files` 三行 | 删 |
| `README.md:46`（特性行）/ `:125`（文件行） | 同步更新 / 删除（随包文档） |
| `使用说明.txt:21-25`（§三 首次使用） | 改写为「托盘 + 桌宠 → 主界面 → 设置 ▸ 模型」路径（不再指向向导） |
| `.test-userdata/settings.json`（测试残留，含 `onboardingDone` 键） | **不处置**——AC3 的 grep 范围须排除 `.test-userdata/` 与 `dsh-bundle/node_modules/`（机检口径见 §3.1 AC3） |

**首启无 Key 体验（删除后的完整路径）**：

1. 冷启动：桌宠 + 托盘在场、无向导、主界面不显示（US-5）。
2. 打开主界面：桌宠左键（或托盘 #1 / 快捷键）。
3. 配置 Key：harness 自带设置面——`设置 ▸ 模型` 页提供 API Key 输入与首启引导。

**承接性证据（设计者亲读，as-of 2026-09-16）**：

| # | 证据 | 指针 |
|---|---|---|
| E1 | harness 模型设置页含 API Key 输入与校验 | `dsh-bundle/node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js:2534`（`keyInput: "API key"`）/ `:2560`（键格式校验） |
| E2 | 同上包自带首启引导文案（中英）——「添加一个 API Key 开始使用」 | 同文件 `:2696`（中文）/ `:2598`（英文 `onboardingTitle`） |
| E3 | 凭据存储包在场（设置写入凭据域） | `dsh-bundle/node_modules/@deepseek-ai/dsh-credentials/`（包存在）；设置根包 `dsh-client-ui-settings` / `dsh-client-ui-settings-general` 在场 |
| E4 | 向导不配置任何东西（第 3 步原文即指路） | `welcome.html:90-99` |

> 结论：harness 自带设置 + 首启引导**足以承接**——本批**不设计**任何替代提示 / 向导（US-3 边界；E2 的引导即为用户面承接物）。

#### 2.2.5 更新门禁口径（F5 / US-6）

**门禁表（B06 后）**：

| 面 | dev（`!app.isPackaged`） | 安装版 |
|---|---|---|
| App 检查（startup / poll / manual） | 不执行；无 UI、无弹窗；记 `face=app skipped=dev` 行 | 执行（不变） |
| App 下载 / 安装 | 不可达（无入口） | 不变 |
| Harness 检查（manual / startup / poll） | 执行（受自动检查开关与 in-flight 守卫，同安装版） | 执行（不变） |
| Harness 更新（install / activate / rollback / 重启） | 执行（`dshBinPath` dev 读活跃指针后真生效） | 执行（不变） |
| 托盘「检查更新」项 | 保留 = Harness 检查入口（无任何 App 面可见物） | 不变 |
| 自动检查开关（连动自动面） | 同安装版 | 不变 |

**代码形态（`main.js:567-584` 改写）**：

```
manualCheckUpdates()：
  ① updateGateBlocked('manual') → 气泡「检查/更新正在进行」并返回（不变）
  ② app.isPackaged ? runAppCheck('manual') : updaterLog('update gate reason=manual face=app skipped=dev')
  ③ runHarnessCheck('manual')   ← dev 与安装版同路径

runAutoChecks(reason)：
  ① !settings.autoCheckUpdates → 记 `skipped=toggle-off` 并返回（不变）
  ② updateGateBlocked(reason) → 返回（不变）
  ③ app.isPackaged ? runAppCheck(reason) : updaterLog(`update gate reason=${reason} face=app skipped=dev`)
  ④ runHarnessCheck(reason)     ← dev 与安装版同路径
```

- **删除**：原 dev 早退（`!app.isPackaged → return`）与手动检查的 dev 弹窗分支（「更新检查只在安装版可用」文案从代码中消失——grep 判据见 §3.1 AC5）。
- **顺序说明**：除删去的 dev 早退外，开关 / in-flight / 面分派的相对顺序与现状一致。

**`dshBinPath()` dev 分支（`main.js:131-140` 改写）**：

```
活跃指针副本优先（harnessStore.resolveActiveBin(userData)）——dev 与打包同口径；
无指针 → app.isPackaged ? resourcesPath/dsh（出厂冻结树，不变） : app.getAppPath()/dsh-bundle（出厂副本，不变）
```

- 对外语义不变（打包版：指针 → 出厂；dev：指针 → 出厂副本）——差异只在兜底路径（NFR-4 允许两处之一）。
- 效果：`getCurrentDshVersion()` / `resolveRuntime()` / 更新日志（`harness activate dsh active path=…`）在 dev 下同样反映活跃副本。

**日志形态（B06 新增一行）**：

```
[ISO] update gate reason=manual|startup|poll face=app skipped=dev
```

- 旧形态 `update gate reason=… skipped=dev`（整面跳过）**退役**（B06 后不再出现）；`skipped=toggle-off|in-flight` 保持不变。
- **跨档同步需求（登记）**：`docs/design/AUTO-UPDATE.md` §2.2.9 的行枚举与 §2.2.7 的门禁描述需登记本行 / 本口径——该档写权不在本角色（观察项 O1，随报告提请）。

#### 2.2.6 拆分架构与迁移计划（F6 / US-7）

**目标结构（15 个新模块 + 组合根 `main.js`；全在仓库根，CommonJS）**：

| 模块 | 职责（单一关注点） | 来源段（现行 `main.js` 行号，as-of 2026-09-16） | 依赖（require → 注入） |
|---|---|---|---|
| `main.js`（改） | 组合根：常量、userData 覆盖、单实例锁、whenReady 引导、退出钩子、模块接线（`init(deps)`） | `1-71` / `2453-2577`（改写） | require 全部模块 |
| `shell-settings.js`（新） | settings 载入 / 保存 / 默认值 / `settingsFileCorrupt` | `73-113` | electron(app) → — |
| `shell-assets.js`（新） | 图标路径（`appIconPath` / `trayIconPath`） | `699-720` | fs/path → — |
| `shell-notify.js`（新） | 系统通知 + 任务完成提醒（`notify` / `latestMtime` / `start·stopCompletionWatcher`） | `246-258` / `605-697` | electron → 注入 `getDshHome` |
| `shell-backend.js`（新） | 后端生命周期 + 路径解析（起停 / 解析 / 重启等；函数清单见注 S1） | `115-244` / `356-362` / `607-611` / `2366-2383` | electron、net/http/fs/child_process → 注入 `sanitizeProfileBundles`、`getMainWindow`、`isQuitting` |
| `shell-pet-geometry.js`（新） | 桌宠几何 helper 组 + 日志 / 尺寸校准（函数清单见注 S4） | `785-1113`/`1209-1210`/`1219-1270` | electron(screen)、fs、`shell-settings`→注入 `getPetWindow`、`getPetDrag`（无新注入） |
| `shell-pet-drag.js`（新） | 拖动跟随 + 拖动 / 穿透 IPC 处理器函数（函数清单见注 S2） | `1190-1208` / `1212-1217` / `1272-1373` / `2591-2618` / `2619-2658` / `2679-2687`（`:1209-1210` / `:1219-1270` 归 geometry——注 S4） | electron(screen)、`shell-settings`、`shell-pet-geometry` → 注入 `getPetWindow`、pet 状态访问面（注 S2） |
| `shell-pet.js`（新） | 桌宠窗口与状态机 + 台词 + 点击 IPC 处理器函数（函数清单见注 S3） | `260-315` / `1114-1188` / `1374-1520` / `2660-2678` | electron、`shell-settings`、`shell-pet-geometry`、`shell-pet-drag` → 注入 `showMainWindow`、`openExchangeWindow`、`broadcastAffinity` |
| `shell-affinity.js`（新） | 好感度 + 兑换屋窗口 + 重置两函数 + `affinity:*` 处理器函数 | `1521-1757` / `2803-2830` | electron、fs、`shell-backend`、`shell-notify`、`shell-assets` → 注入 `petSay`、`setPetState`、`getPetWindow`、`setQuitting` |
| `shell-mode.js`（新） | 背景与模式（`backgroundImagePath`/`applyBackground`/`setMode`/`maybeShowModeDialog`/`chooseBackground`/`resetBackground`） | `1774-1888` | electron、fs、`shell-settings` → 注入 `getMainWindow`、`destroyPetWindow`、`ensurePet`、`rebuildTrayMenu`、`notify` |
| `shell-plugins.js`（新） | 插件引擎（profile 读写 / bundles 防呆 / 版本对比 / `installPlugin` / `uninstallPlugin` / pnpm 通道） | `2007-2364`（除 `restartBackend`） | electron、fs/child_process、`shell-backend` → — |
| `shell-window.js`（新） | 主窗口（`createWindow`/`showMainWindow`/`toggleMainWindow`/`handleOpenArg`） | `722-780` / `1999-2006` | electron、`shell-backend`、`shell-mode`、`shell-assets` → — |
| `shell-market.js`（新） | 市场窗口 + 注册表拉取 + `market:*` 处理器函数（含 `plugin update` 日志行） | `2385-2448` / `2689-2778` | electron、fs、`shell-plugins`、`shell-backend`、`shell-assets`、`shell-update` → — |
| `shell-tray.js`（新） | 托盘菜单 + 全局快捷键 + Windows 右键菜单 + `uninstall()` | `1758-1772` / `1889-1948` / `1951-1996` / `317-330` | electron、`shell-settings`、`shell-assets`、`shell-window`、`shell-mode`、`shell-update`、`shell-market`、`shell-affinity`、`shell-pet` → 注入 `isQuitting`、`setQuitting` |
| `shell-update.js`（新） | 更新编排（呈现 / 门禁 / 调度 / Harness 停-切-启编排）+ `upd:*` 处理器函数 | `332-603` / `2780-2801` | electron、fs、`updater.js`、`shell-backend`、`shell-notify`、`shell-settings` → 注入 `setQuitting` |
| `shell-ipc.js`（新） | IPC 通道注册层（薄绑定：通道 → 域处理器函数） | `2579-2830`（改写） | electron(ipcMain)、`shell-pet`、`shell-pet-drag`、`shell-affinity`、`shell-market`、`shell-update` → — |

> **注 S1（`shell-backend.js` 函数清单）**：`findFreePort` · `dshBinPath` · `bundledSkillDir` · `resolveRuntime` · `waitForReady` · `cleanupStaleDsh` · `startDsh` · `stopDsh` · `dshHome` · `getCurrentDshVersion` · `restartBackend`（+ 状态 `dshProcess` / `port`，经 `getPort()` 暴露）。
>
> **注 S2（`shell-pet-drag.js` 函数清单）**：常量（`PET_DRAG_TICK_MS` / `PET_DRAG_STALE_MS` / `PET_DRAG_PROBE_MS` / `PET_DRAG_LOG_SAMPLE_TICKS` / `PET_DRAG_DEBUG`）·
> `petDragLog` · `petStopDrag` · `petDragTick` · 状态 `petDrag`（经 `getPetDrag()` 暴露）·
> 处理器函数 `handlePetDragStart` / `handlePetDragHeartbeat` / `handlePetDragEnd` / `handlePetSetIgnoreMouse`。
> （`petPosText` / `petCalibrateSize` 归 `shell-pet-geometry`——评审修正轮 1 #14，见注 S4。）
>
> **注 S3（`shell-pet.js` 函数清单）**：`PET_QUOTES` · `petSay` · `playIdleVariant` · `schedulePetChatter` · `clearPetTimers` · `setPetState` · `scheduleSleep` · `wakePet` ·
> `scheduleWander` · `doWander` · `summonPet` · `createPetWindow` · `ensurePet` · `destroyPetWindow` · 状态（`petWindow` / `petState` / 定时器 / 散步状态）·
> 处理器函数 `handlePetClicked` / `handlePetRightClicked`。

> **注 S4（`petCalibrateSize()` 归属修订——评审修正轮 1 #14）**：`petCalibrateSize()`（`main.js:1238-1270`）与 `petPosText()`（`:1209-1210`）归属 **`shell-pet-geometry.js`**（几何 helper 组，PET NFR-8「单一实现」口径；依赖 `petSizeBaseline` / `petCurrentDisplay` / `PET_SIZE_DIP` / `PET_SIZE_TOLERANCE_DIP` / `petGeomLog` 均在本模块内）。
> **函数清单**：`petGeomLog`…`petSettlePos` / `handleDisplayChange` / `petGeomSnapshot` / `petSavePos` / `petPosText` / `petCalibrateSize`。
> **来源段修订**：geometry 增 `:1209-1210` / `:1219-1270`；`shell-pet-drag` 相应为 `:1190-1208` / `:1212-1217` / `:1272-1373` + IPC 段（注 S2 清单同步）。
> **跨模块访问**：`shell-pet-drag`（`petStopDrag` / `petDragTick` / `pet-drag-end` 处理器）与 `shell-pet`（`createPetWindow` / `summonPet`）经 `require('./shell-pet-geometry.js')` 直接调用——依赖方向已声明（两者 → geometry）、无环、**无新注入项**；geometry 自身调用为模块内调用。
> **状态面**：`createPetWindow()` 对 `petSizeBaseline`（`:1166`，连带 `petWanderSizeCheckedAt` `:1167`）的重置经 geometry 导出的**转发访问器**完成（§2.2.6 允许面 ②）——单一实现不破。

**依赖方向规则（零回退的结构前提）**：

1. `require` 只指向**同层或更低层**且全图**无环**；同层引用允许（如 `shell-market → shell-update` 取 `updaterLog`），出现环即改为注入。
2. 需要更高层能力时，由组合根 `main.js` 在启动时以 `init(deps)` 注入（先例：`updater.init(ctx)`、B04 的 `harness-store` runner 注入，`docs/design/AUTO-UPDATE.md` §2.2.1）。
3. 跨模块共享状态 = **属主模块持有 + 访问器**：`petWindow` → `shell-pet.getPetWindow()`；`petDrag` → `shell-pet-drag.getPetDrag()`；`port` → `shell-backend.getPort()`；`mainWindow` → `shell-window.getMainWindow()`；`quitting` → 组合根持有（注入 `isQuitting`/`setQuitting`）。
4. 域模块导出**处理器函数**（如 `handlePetClicked()` / `marketList()`）；IPC 通道 → 函数的绑定集中在 `shell-ipc.js`——通道清单单点可审计（AC7 与既有 IPC 契约一一对照）。

**零行为回退口径（迁移的改动面判据）**：

- **允许**：① 引用限定（`settings.x` → `S.get().x`、`petWindow` → `getPetWindow()`）；② 为跨模块读写抽取**仅转发**的 getter/setter 或处理器函数（函数体逐句搬移）；③ `require` / `exports` / `init(deps)` 样板。
- **禁止**：改变任何函数的执行顺序、条件判断、常量值、字符串字面量、日志行格式与发射时点、env 开关判定；禁止顺手重命名对外符号（`setMode` / `ensurePet` / `petCalibrateSize` 等函数名保持）。
- `pet.*`（渲染三文件）/ `updater.js` / `harness-store.js` / `update-lib.js`：**只搬不改**（本批对 `pet.js` 的唯一改动 = §2.2.1 的 F1 守卫，发生在拆分之前——见迁移顺序）。

**取证锚点清单（P6；拆分自身不增不删，B06 唯一新增 = §2.2.5 的 gate 行）**：

| # | 面 | 行类型（字符串） | 发射点（拆分后） |
|---|---|---|---|
| 1 | `pet-drag.log`（`BIGFISH_PET_DEBUG=1`） | `drag-start grabOffset=` / `drag-end reason=` / `probe pos=` / `tick cursor=` | `shell-pet-drag.js` |
| 2 | `pet-geometry.log`（同 env） | `geom tag=` / `geom-fix reason=` / `geom-switch from=` / `wall x=` / `display-change kind=` | `shell-pet-geometry.js`（`wall` 行随 drag-end 处理器在 `shell-pet-drag.js`） |
| 3 | `updater.log`（常开） | AUTO-UPDATE §2.2.9 的 15 条主格式行 + 6 处变体（`update …` / `harness …` / `plugin update …`）+ B06 新增 gate 行 | `updater.js`（不动）+ `shell-update.js`（编排两行 + gate + `updaterLog`）+ `shell-market.js`（`plugin update`） |
| 4 | `market.log` / `exchange.log` / `bigfish.log` | 市场 / 兑换屋 / 后端的 `console-message` 与后端 stdio 落盘 | `shell-market.js` / `shell-affinity.js` / `shell-backend.js` |
| 5 | console 行 | `[bigfish] backend ready at` / `window created` / `starting backend on` / `global shortcut registered` / `market:enable …` 等 | 随各自模块逐条保留 |
| 6 | env 开关 | `BIGFISH_USER_DATA` / `BIGFISH_UPDATE_URL` / `BIGFISH_UPDATE_INTERVAL_MS` / `BIGFISH_DSH_REGISTRY_URL`（`_FALLBACK_URL`）/ `BIGFISH_PET_DEBUG` / `DSH_NODE` / `DSH_HOME` | 读取点随各模块保留 |

**迁移顺序（F6；总前置 = §1.7 写域错开——B03 的 `main.js` 改动落地或冻结后实施）**：

| 阶段 | 步骤 | 验证 |
|---|---|---|
| P0（行为变更 F1–F5 + 清理 F7，落现行结构） | ① F1 按键守卫与点击语义 → ② F2 向导删除 → ③ F3 托盘重排 → ④ F4 启动形态 → ⑤ F5 门禁 → ⑥ F7 无用文件清理（独立提交，纯删除） | 每项一提交；每步 `node --check` + 对应 AC 的真机/静态核对 |
| P1（拆分 F6，逐层搬迁） | 按 L0 → L3 逐层搬迁（八步，清单见注 M-迁移） | 每层一提交；每步 `node --check`（全部 js）+ 应用冒烟（启动 / 托盘 / 桌宠 / 目标域操作）；P1 起点提交作为「纯迁移 diff 基线」（除样板外逐句一致） |
| P2（收尾） | 全回归（§3.2 TC-18…TC-20）+ 行数实测 + 锚点 grep + **源行覆盖清单机检**（对照 §2.2.6 覆盖核对表：迁移后源行零遗漏、空行 / 注释归属逐条一致） | AC7 判据全绿 |

> **注 M-迁移（P1 八步）**：① L0 `shell-settings` / `shell-assets` → ② L1 `shell-notify` / `shell-backend` → ③ 桌宠三模块（`shell-pet-geometry` → `shell-pet-drag` → `shell-pet`）→
> ④ `shell-affinity` / `shell-mode` → ⑤ `shell-plugins` → ⑥ L2 `shell-window` / `shell-market` / `shell-tray` / `shell-update` → ⑦ L3 `shell-ipc` → ⑧ `main.js` 组合根收尾。
>
> 顺序理由（DD-13）：用户可见修复（F1–F5）先行落地，F6 作为纯迁移收尾——迁移输入 = 最终行为代码，一次全回归覆盖；且每阶段可独立回滚（每层一提交）。

**来源段覆盖核对（评审修正轮 1 #7——来源段并集的行级核对）**：

未覆盖行（**29** 行）逐条归属——**零代码行遗漏**：**15** 处空行（段边界排版行，随相邻模块）；**11** 处注释（`782-784` 桌宠族段头 / `1773` 背景图段头 / `1950` 快捷键段头 / `1997-1998` `--open` 段头 / `2450-2452` App lifecycle 段头 / `2365` `restartBackend` 的 JSDoc——归其标注的相邻模块）。
**3** 处代码行已并段：`1947-1948`（`setAutoCheckUpdates` 尾两行）→ `shell-tray` 来源段修订为 `1889-1948`；`2831`（`else {}` 收尾 `}`）→ 组合根。机检面 = P2「源行覆盖清单」；注 S4 的归属修订另移 `:1209-1210` / `:1219-1270` 入 geometry（边界空行 `1211` / `1218` / `1271` 同按排版行随相邻段）。

**逐档行数预估（评审修正轮 1 #5；口径 = 来源段行数 + 接线样板 ≈10 行/档；实施后由批次档 §5 回填实测）**：

| 模块 | 来源段行数 | 预估行数 |
|---|---|---|
| `shell-settings.js` | 41 | ≈50 |
| `shell-assets.js` | 22 | ≈30 |
| `shell-notify.js` | 106 | ≈115 |
| `shell-backend.js` | 160 | ≈170 |
| `shell-pet-geometry.js` | 383（含 `petPosText` / `petCalibrateSize`——注 S4） | ≈395 |
| `shell-pet-drag.js` | 207 | ≈215 |
| `shell-pet.js` | 297 | ≈305 |
| `shell-affinity.js` | 265 | ≈275 |
| `shell-mode.js` | 115 | ≈125 |
| `shell-plugins.js` | 358 | ≈370 |
| `shell-window.js` | 67 | ≈75 |
| `shell-market.js` | 154 | ≈165 |
| `shell-tray.js` | 135 | ≈145 |
| `shell-update.js` | 294 | ≈305 |
| `shell-ipc.js` | 252（改写为薄绑定后净缩） | ≈180 |
| **合计** | — | **≈2920** |

**>300 行档结论（评审修正轮 1 #5——同口径留档裁定，纯搬移不拆分；承 B04 先例）**：`shell-pet-geometry`（≈395）、`shell-plugins`（≈370）、`shell-pet`（≈305）、`shell-update`（≈305）四档预估越 300（均 <500 硬限）：

- `shell-pet-geometry`：拆分将把**同一几何 helper 组**（PET NFR-8：几何判定 / 尺寸校准收敛为单一来源）切成两处——保持单文件；无新注入项（注 S4）。
- `shell-plugins`：职责单一（插件安装 / 卸载 / pnpm 通道 / profile 防呆）；R7「只搬不改」窗口期不做结构改造——保持单文件。
- `shell-pet` / `shell-update`（≈305 贴线）：一域一模块、<500、无单函数越线——同口径保持单文件。
- **单函数体量核对**：全部被搬移函数 **<300 行**（全文件最大者 = `doWander` ≈90 行；`petDragTick` ≈76 / `installPlugin` ≈47 / `petCalibrateSize` ≈35）——拆分不产生单函数越线。

> 说明：预估口径与 §2.3 表「+约 2920 / 单档 30–395」同源；实施后实测以批次档 §5 回填为准（实测越 500 = 硬红线须修）。

#### 2.2.7 无用文件清理（F7 / US-8）

**删除清单（白名单制；依据 = 主 agent 逐条核实，2026-09-16）**：

| # | 文件（组） | 判定依据 | 处置 |
|---|---|---|---|
| 1 | `remove-pet-bg.js`（120 行） | 全仓 0 引用；依赖 `sharp` 未安装（根 `dependencies` = `{}`）⇒ 跑不起来（一次性抠图工具） | 删除 |
| 2 | `update-pet-frames.js`（76 行） | 全仓 0 引用；职责（生成 `assets/pet/` 旧帧）已被 `assets/pet-new/` 取代 | 删除 |
| 3 | 根 `background.jpg`（395,696 B） | 与 `assets/background.jpg` 逐字节相同（sha256 一致）；`backgroundImagePath()`（`main.js:1778-1781`）只读 `assets/background.jpg`；`build.files` 用 `assets/**/*`（不含根图）⇒ 纯重复 | 删除 |
| 4 | `assets/pet/` 9 张旧贴图 | `pet.js` 逐文件核对 0 引用：`eat-1…4.png` / `sleep.png` / `walk-left-1…2.png` / `walk-right-1…2.png`（合计 426,157 B） | 删除 |

**保留清单（明确不动）**：`assets/pet/idle.png`（`pet.js:10` 待机帧仍在使用）· `assets/pet-new/**`（现行贴图，39 处引用）· `probe-*.js`（7 个）与 `debug-pet.cmd`（B03 实机验收 T9 待用）· `.npmrc` / `scripts/ensure-deps.js` / `package-lock*.json`（另一会话在途）· `.test-userdata*/` / `.test-dsh-home/`（已由主 agent 删除，不在 coder 清单）。

**判据（AC8；全部机检）**：① 四组文件不存在；② 全仓 `grep`（范围 = 代码 / 配置 / 随包文档；**排除** `docs/`、`.test-*`、`dsh-bundle/`、`node_modules/`）0 处引用；③ `package.json` scripts / `build.files` / 依赖零改动（删除项本就不在其中）；④ 保留清单逐项在场；⑤ 真机冒烟：应用启动、桌宠待机动画正常（`idle.png` 承载）。

**边界（不做）**：不做全仓未引用文件扫描式大清理（probe / 调试脚本 / 在途文件都是误伤面）；不动 `.gitignore` / 打包配置。

**报告项（只报告、不自行改）**：`THIRD-PARTY-NOTICES.md:53-54` 提及第三个素材目录 `assets/jimeng-2026-08-15-3386/`——该目录在仓库中不存在（陈旧提及）；登记为观察项 O7，交主 agent 收口。

### 2.3 受影响文件全清单

| 文件 | 当前行数 | 改动点（含现状行号） | 预计改动量 | 末行数（预估） |
|---|---|---|---|---|
| `main.js` | 2831 | F1 `:2660-2667`（toggle→`showMainWindow`）；F2 删 `:81` / `:616-647` / `:741-744` / `:1893` / `:2550` / `:2579-2588`（+`:63` 变量）；F3 重排 `:1889-1930`/文案 `:1856`；F4 `:725-745`（去自动显示）+`showMainWindow`；F5 `:567-584` 改写+`:131-140` dev 分支；F6 拆出全部域（§2.2.6） | −约 2550 / +约 40（余=组合根） | ≈300 |
| `pet.js` | 185 | F1：`pointerdown`（`:98`）/ `pointerup`（`:113-120`）加左键守卫；自愈起拖条件（`:111`）改 `(e.buttons & 1) !== 0` | +4 / −2 | ≈187 |
| `pet-preload.js` | 15 | **不改**（通道与载荷零变更） | 0 | 15 |
| `welcome.html` / `welcome.js` / `welcome-preload.js` | 104 / 23 / 7 | **删除**（F2） | −134 | 不存在 |
| `shell-settings.js` 等 **15 个新模块** | 0 | F6 新增（清单与职责 = §2.2.6） | +约 2920（15 档合计；单档预估 30–395——**逐档行数预估与 >300 档结论见 §2.2.6**） | 每档 <500（预估最大 `shell-pet-geometry.js` ≈395） |
| `package.json` | 116 | F2 删 `:41-43`；F6 `build.files` 增 15 个 `shell-*.js` | +15 / −3 | ≈128 |
| `README.md`（根） | 162 | F2：`:46` 特性行更新、`:125` 向导行删除；F6：`:124` 与目录段同步为拆分后结构 | ±8 | ≈160 |
| `使用说明.txt` | 53 | F2：`:21-25` 首次使用段改写（不再指向向导） | ±5 | ≈53 |
| `docs/requirements/SHELL.md` | **（新）** | 本批新建（需求档） | — | **143**（落档实测） |
| `docs/design/SHELL-UX.md` | **（本档）** | 本批新建（设计档） | — | **568**（落档实测） |
| `docs/requirements/PET.md` | 213 | B06 口径修订注记：头部关联批次行 + §二 观察项 + US-5 边界 + 变更记录 1 行 | +4 | **215**（落档实测） |
| `docs/requirements/UPDATE.md` | 146 | B06 口径修订注记：头部关联批次行 + US-1 边界 / US-5 / US-6 边界 / NFR-3 + 变更记录 1 行 | +7 | **153**（落档实测） |
| `remove-pet-bg.js` / `update-pet-frames.js` | 120 / 76 | **删除**（F7：0 引用 + 依赖 `sharp` 未安装跑不起来） | −196 | 不存在 |
| 根 `background.jpg` | 二进制 395,696 B | **删除**（F7：与 `assets/background.jpg` 逐字节重复；唯一读取面只读后者） | −1 文件 | 不存在 |
| `assets/pet/` 9 张旧贴图 | 二进制合计 426,157 B | **删除**（F7：`pet.js` 逐文件核对 0 引用；保留 `idle.png`） | −9 文件 | 仅余 `idle.png` |

**不改（本批明确不触碰）**：

- 更新链路代码：`updater.js`（497）· `harness-store.js`（332）· `update-lib.js`（90）· `update.html`（92）· `update.js`（104）· `update-preload.js`（10）；
- 市场与兑换屋代码：`market.js`（500，贴线未超——O3）· `market.html`（208）· `market-preload.js`（15）· `market-update.js`（51）· `exchange.html`（56）· `exchange.js`（105）· `exchange-preload.js`（8）；
- 桌宠渲染面：`pet.html`（91）；
- 其余：`plugins.json`（535）· `afterPack.js`（38）· `scripts/ensure-deps.js` · `.npmrc`（另一会话在途）；
- F7 保留面：`assets/pet/idle.png`（待机帧）· `assets/pet-new/**`（现行贴图）· `probe-*.js`（7 个）· `debug-pet.cmd`（B03 实机验收待用）· `package-lock*.json`（另一会话在途）；
- 主 agent 收口面与他档：`docs/TODO.md` / `docs/README.md` · `docs/design/*`。

> 行数口径 = 换行符计数（`find /c /v ""` 口径）；`main.js` 2831 / `package.json` 116 = **B06 立案实测（as-of 2026-09-16）**——与 `docs/design/AUTO-UPDATE.md` §2.3 所记 2827 / 113 的差异源 = 测量时点不同 + B03 会话在途未提交改动（§2.5 C1；评审修正轮 1 #9）；代码文件「末行数」为实施前预估（**实施起点（B03 错开后）须重测并回填批次档 §5**）；文档行按落档实测。

### 2.4 关键决策记录

| # | 决策 | 理由 | 否决的备选 |
|---|---|---|---|
| DD-1 | 左键 = 「显示 / 聚焦」单语义；隐藏只走托盘 toggle 与窗口关闭 | R3：避免「想打开却把它藏了」的误触；关闭按钮仍隐到托盘（既有语义） | 保留 toggle（误触问题原样）；单击开 / 双击切（发明新交互） |
| DD-2 | 按键判定在渲染层做（`button` 守卫），主进程不加抑制逻辑 | 事件顺序决定主进程无法事后挽回（选型 A 候选 2） | 仅主进程抑制（闪烁不可避免） |
| DD-3 | 「鲸鱼娘兑换屋」= 一级项，置于功能组（插件市场旁） | 专注模式下唯一可达入口（硬要求）；与「打开窗口」类动作同族 | 藏入子菜单（专注模式下入口过深）；与桌宠组混排（与 radio/背景动作混质） |
| DD-4 | 首项保留 toggle 语义，标签改「显示 / 隐藏主界面」；**偏离 R5 草案的「打开主界面」** | R3 明文「隐藏主界面走托盘项」——去掉 toggle 会移除唯一的显式隐藏入口 | 严格照草案（与 R3 相抵） |
| DD-5 | 启动形态 = 先建不 show | 与现状只差可见性一处；无新竞态（选型 C） | 懒建（引入就绪性竞态与多路径耦合） |
| DD-6 | 向导删除后**不新增**任何替代提示 | harness 自带首启引导承接（§2.2.4 E2）；C2 明确不重造 | 轻提示气泡（多余——引导已在用户面） |
| DD-7 | dev 门禁 = 「入口单一 + App 面静默跳过」（选型 D 候选 1） | 菜单跨态稳定；无 dev 弹窗；harness 全功能可用 | 隐藏入口 / 拆两项 / 保留弹窗（均见选型 D） |
| DD-8 | dev 的 `dshBinPath()` 与打包同口径（指针优先） | R4(c)：使 harness 更新在 dev 真生效、可验证；差异只剩兜底路径（NFR-4） | 维持 dev 固定 `dsh-bundle/`（更新在 dev 假成功） |
| DD-9 | 新增 gate 行 `… face=app skipped=dev`；旧整面 `skipped=dev` 退役 | 旧形态在「harness 仍执行」后语义失真；新形态可机检 | 复用旧形态（误导）；不落 gate 行（跳过不可取证） |
| DD-10 | 拆分 = 按域 15 模块 + 注入式组合根（选型 E 候选 1） | 唯一同时满足 P1–P6 的方案 | 子目录 / 横向层 / 最少切割 / 构建器 / 只拆 pet 域（逐项否决见选型 E） |
| DD-11 | IPC = 集中注册层（域模块导出处理器函数） | 通道清单单点可审计（零回退对照）；域模块保持无 `ipcMain` 依赖 | 处理器分散各域（通道清单不可单点核对）；全留 `main.js`（超 500 行） |
| DD-12 | 跨模块状态 = 属主 + 访问器；`quitting` 归组合根 | 消除共享可变状态的双写点；无环结构的前提 | 各模块自持副本（双写漂移）；全局可变容器（隐式耦合） |
| DD-13 | 迁移顺序 = 行为变更（F1–F5）先行、纯迁移（F6）收尾 | 用户可见修复优先；迁移输入 = 最终代码；一次全回归 | F6 先行（两次全回归；修复混入迁移 diff） |
| DD-14 | 零回退口径 = 允许三类改动面（限定 / 转发访问器 / 样板），禁止五类语义面（顺序 / 条件 / 常量 / 字符串 / 日志时点） | 使「只搬不改」可审计、可机检（diff 判据） | 仅口头承诺「不改行为」（不可核） |
| DD-15 | F7 清理 = **白名单精确删除**（不做全仓未引用扫描） | 用户指示的「删 1-5」已有逐条核实面；扫描式清理会误伤 B03 待用资产与另一会话在途文件 | 全仓扫描大清理（误伤面多、越权）；不清理（残留即示范） |
| DD-16 | 「找回鲸鱼娘」保留在「高级 ▸」（不移动；评审修正轮 1 #12 裁定） | 低频救援动作（PET US-14：几何意外时自救）——与「高级 ▸」的「低频但须可达」语义一致，且与重置 / 恢复同属「出事才用」的兜底族；移入功能组会与日常高频动作混质（兑换屋进功能组的判据 = 日常动作 + 专注模式可达性硬要求，与救援动作属两类判据） | 移入功能组（动作族归属更顺，但高频 / 低频语义不合——裁定不采纳） |

### 2.5 与既有纪律 / 既有实现的冲突点核对

| # | 既有约束 / 纪律 | 设计处理 | 结论 |
|---|---|---|---|
| C1 | B03 持有 `main.js` 未提交改动 | 实施前置错开（B03 落地或冻结后开工）；设计阶段只读 | 流程面不冲突 |
| C2 | `pet.js` 按键判定缺失（T1） | F1 修正（§2.2.1）——**有意变更**，收口 T1 | 有意变更 |
| C3 | 托盘 17 项现状 | F3 重排（§2.2.3）——**有意变更**（用户点名） | 有意变更 |
| C4 | 向导触点 + 三文件 + `build.files` | F2 全清（§2.2.4） | 有意变更 |
| C5 | 更新门禁 dev 现状 + `dshBinPath` 双态 | F5 改写（§2.2.5）——**有意变更**；`docs/requirements/UPDATE.md` 三处旧条文已加修订注记（US-1 边界 / US-5 / US-6 边界 / NFR-3） | 有意变更（跨档同步登记） |
| C6 | `main.js` 2831 行（T2） | F6 拆分（§2.2.6） | 有意变更 |
| C7 | `createWindow` 建窗即 show | F4（§2.2.2）——**有意变更** | 有意变更 |
| C8 | 零新依赖 / 不引构建 | 拆分只用 CommonJS；`dependencies` 零 diff；`build.files` 只增模块行 | 不冲突 |
| C9 | 既有取证锚点（B01/B03/B02/B04/B05） | 锚点清单（§2.2.6）逐条保留；拆分不增不删（唯一新增 = F5 gate 行） | 不冲突 |
| C10 | dev 提示家族三处（卸载 / 右键菜单 / 更新检查） | 本批只动更新检查面；其余两处**明确保持**（有意为之） | 不冲突（有界变更） |
| C11 | `docs/requirements/PET.md` US-5 边界「不改显隐语义」/ §二 观察项 F2 / US-14 找回入口位置 | 有意变更 → PET.md 加 B06 修订注记（US-5 / §二）+ 变更记录；US-14 位置改入「高级 ▸」子菜单（仍为托盘菜单入口，语义不变） | 有意变更（跨档注记） |
| C12 | `docs/design/AUTO-UPDATE.md` §2.2.7 / §2.2.9 的 dev 门禁描述与行枚举；B02 §3.1 AC7 的 dev 判定面 | 本批覆盖 harness 面；AUTO-UPDATE 同步 = 观察项 O1（该档写权不在本角色）；B02 AC7 的 dev 面以 B06 AC5 为权威 | 有意变更（跨档同步登记） |
| C13 | `market.js` 500 行贴线 | 本批不动（O3） | 不冲突 |
| C14 | 各档 `main.js` 行号指针（as-of 口径） | 拆分后全面漂移属预期（docs/README 口径「行号只作 as-of 参考」）；旧行号段 → 新模块映射表 = §2.2.6 | 不冲突（口径内） |
| C15 | 「零新依赖」与「直接跑源码」 | 15 新模块为纯 CommonJS；无构建步骤、无新依赖 | 不冲突 |
| C16 | 用户指示「删 1-5」的清理面与 B03 待用资产（`probe-*.js` / `debug-pet.cmd`）擦边 | F7 白名单精确删除；待用资产列入**保留清单**（§2.2.7） | 不冲突（边界界定） |

> **口径注（评审修正轮 1 #9）**：上表 C1（B03 写域冲突）的解消动作 = B03 错开后**实施起点重测 `main.js` / `package.json` 行数并回填批次档 §5**（测量口径与 as-of 值见 §2.3 表注）。

**已知限制（明确不修，随本批留档）**

- **L1**（已并入 §2.6 追认清单）：dev 下手动检查且 Harness 无更新时**无反馈**（静默）——与安装版「App 面气泡」不同；候选改进（补一行气泡文案）未采纳（不新增未审文案）。
- **L2**：专注模式下兑换屋窗口无桌宠可依 → 落系统默认位置（既有定位逻辑不变；仅影响窗口落点观感）。
- **L3（评审修正轮 1 #6 改写；原限制已消解，保留条目供追溯）**：macOS 的 `activate`（Dock 点击）**统一改经 `showMainWindow()`**——Dock 点击 = 用户主动显示请求（显示 + 聚焦；零窗口时建窗后显示）；原「不主动显示 / 零窗口建窗亦不显示」作废——与 NFR-2「既有行为不得回退」的相抵面已消解（例外句落 `docs/requirements/SHELL.md` §四 NFR-2）。
- **L4**：模式选择弹窗仍可能在首启 / 版本更新后自动弹出（一次性；§二 范围已声明保持现状）。
- **L5**：拆分后 `main.js` 及引用其行号的既有文档指针全面漂移（as-of 口径容忍；映射表见 §2.2.6）。

**观察项（既有语义缺口 / 批次外协调项）**

- **O1（发现即报告）**：`docs/design/AUTO-UPDATE.md` §2.2.9 需登记新 gate 行（`face=app skipped=dev`，含旧形态退役说明）、§2.2.7 门禁描述需同步；`docs/batches/B02-auto-update.md` §3.1 AC7 的「dev 模式 → 无任何检查行」判定面被本批覆盖（harness 面）。**该两档写权不在本角色**——随报告提请主 agent 处置。
- **O2（发现即报告）**：`docs/README.md` §一 的 `main.js:149` 指针与各档 `main.js:行号` 取证锚点（C14）在拆分后漂移——主 agent 收口面；本次不处置（as-of 口径）。
- **O3（发现即报告）**：`market.js` 500 行贴线（未超）——本批不动；拆分裁决仍归 T2 评估面。
- **O4（发现即报告）**：`.test-userdata/settings.json` 含 `onboardingDone` 键（测试残留数据）——不处置；AC3 grep 范围须排除（§3.1）。
- **O5（发现即报告）**：`README.md:46` / `使用说明.txt:21-25` 的向导描述随 F2 失效——已列入受影响文件表（随包文档更新）；`版本说明.txt:44/:61` 为历史版本注记，**不动**（历史语义保留）。
- **O6（发现即报告）**：`docs/design/PET-DRAG.md` §2.5 观察项 F4（拆分 `main.js`）与 `PET-MULTIMONITOR` 的体量债记录随本批收口——两档指针更新不在本角色写域；随报告提请。
- **O7（发现即报告，只报告不自行改）**：`THIRD-PARTY-NOTICES.md:53-54` 提及第三个素材目录 `assets/jimeng-2026-08-15-3386/`——该目录在仓库中不存在（陈旧提及）；交主 agent 收口。

### 2.6 UI / 交互决策

| # | 决策点 | 决策 |
|---|---|---|
| U-1 | 托盘一级清单与排序 | §2.2.3 表（11 项 + 4 分隔线；高频 → 外观与模式 → 功能与设置 → 高级 → 退出） |
| U-2 | 模式提级 | 两个一级 radio：「🐳 鲸鱼模式」/「🧘 专注模式」（短标签；提示文案见 U-8） |
| U-3 | 兑换屋入口 | 一级「鲸鱼娘兑换屋」（功能组）——专注模式可达性硬要求 |
| U-4 | 设置 / 高级子菜单成员 | §2.2.3（设置 4 项 / 高级 4 项） |
| U-5 | 首项标签 | 「显示 / 隐藏主界面」（保留 toggle 语义，DD-4） |
| U-6 | 首启体验（无 Key） | 桌宠/托盘 → 主界面 → harness「设置 ▸ 模型」；无替代向导、无新增提示（DD-6） |
| U-7 | dev 的更新反馈 | 无 dev 弹窗；有更新 → 既有 Harness 弹窗流程；无更新 → 静默（L1） |
| U-8 | 模式弹窗指路文案 | 「之后可以在托盘菜单切换「🐳 鲸鱼模式 / 🧘 专注模式」。」 |
| U-9 | 冷启动可见物 | 桌宠 + 托盘；主界面按需打开（US-5） |
| U-10 | 「找回鲸鱼娘」所在分组 | **保留「高级 ▸」**（低频救援动作，不移动）——取舍理由 = §2.4 DD-16（评审修正轮 1 #12） |

**open 项**：无未决设计项。**待用户追认项**（非 open——设计已定，用户可在评审时改判）：US-1 的「只开不隐」（R3）、US-5 的启动形态（C4/R2）、US-4 的结构（R5 基线 + DD-3/DD-4 两处优化）、**L1**（dev 手动检查无更新 → 静默无反馈——「已接受行为」）——见 `docs/batches/B06-shell-ux.md` §1.9。

---

## 三、测试层

本仓无自动化测试基建（技术待办 T4 认账不排期；`package.json` 无 `test` script）。本批验证 = **静态核对 + 行数实测 + `node --check` + 真机清单 + 日志锚点 grep**，并按本批性质（壳交互 / 结构迁移）如实标注人工项。

### 3.1 验收标准逐条回指

| 验收 | 回指需求 | 判定方式（细化） | 机检可能性 |
|---|---|---|---|
| AC1 | US-1、US-2 | 真机：左键（已显示时）→ 仍显示 + 聚焦；右键 → 只开兑换屋且主界面状态不变；拖动后松手 → 不开窗。静态：`pet.js` 左键守卫在场（早退式守卫：`e.button !== 0` 早退 ×2（`:99` / `:117`）+ 自愈起拖条件 `(e.buttons & 1) !== 0` 位掩码 ×1（`:114`））；`pet-clicked` 处理器调 `showMainWindow()`（无 `toggleMainWindow` 调用）；右键链唯一入口 = `contextmenu` | 半机检（静态全机检 + 真机目视） |
| AC2 | US-5、US-3、NFR-1、NFR-2 | 真机（隔离 `--user-data-dir` + 隔离 `DSH_HOME`，承 B02 §6.7 手法；预置 `settings.json`：`modeChosen:true`）：冷启动 → 无向导窗、主界面不自动显示、托盘在场、桌宠在场；左键 / 托盘项可打开主界面。辅：`createWindow` 无 `ready-to-show → show` 路径（静态） | 半机检（静态 + 真机窗口枚举） |
| AC3 | US-3、NFR-1 | 机检：`grep -rn "createWelcomeWindow\|onboardingDone\|welcome-open-url\|welcome-done\|welcomeWindow"` 全仓 0 处（范围=全仓；**排除** `docs/`（含设计 / 批次档引述）、`.test-*`（O4）、`dsh-bundle/`）；`welcome.html` / `welcome.js` / `welcome-preload.js` 不存在；`build.files` 无 `welcome` 字样 | 全机检 |
| AC4 | US-4、NFR-2 | 真机目视 + 逐条核对：一级 11 项及其顺序、4 分隔线、2 个 radio 及其 `checked` 条件、`设置 ▸` / `高级 ▸` 成员（§2.2.3 表逐行对照）；专注模式：「鲸鱼娘兑换屋」可开、「找回鲸鱼娘」置灰 | 人判 + 静态（结构逐条） |
| AC5 | US-6 | dev 实跑：点「检查更新」→ 无「只在安装版可用」弹窗；`updater.log` 出现 gate 行（`face=app skipped=dev`）且随后有 harness 检查行；`dshBinPath` 无指针 / 有指针两态正确。静态：App 面受 `app.isPackaged` 保护；该提示文案 grep = 0 处（范围 = 代码 / 配置，**排除** `docs/`——本档与相关档含该文案引述） | 半机检（日志 + 静态全机检；点击行为目视） |
| AC6 | US-6 | 代码路径对照（沿用 B02/B05 判据，不新增）：App 面分支 / 更新窗口 / 清单与校验链路与 B05 终态逐条一致（diff 核对）；真机发布门项另计（T8） | 半机检（diff 对照） |
| AC7 | US-7、NFR-3 | 行数实测：**源码 js 全档 ≤500**（= 全仓 `.js`，含 `probe-*.js` / `scripts/` / `tests/`；**排除** `dsh-bundle/`、`node_modules/`、`.test-*`；唯一超顶者 `main.js`（拆分清零）；口径 `find /c /v ""`）；`node --check` 全绿（15 新模块 + `main.js` / `pet.js`）；锚点清单（§2.2.6）在场；依赖段零 diff；真机回归（§3.2 TC-19） | 机检（行数 / 语法）+ 真机回归 |
| AC8 | US-8 | 删除面：四组文件不存在 + 全仓 grep 0 处（排除 `docs/` / `.test-*` / `dsh-bundle`；§2.2.7）；保留面：`assets/pet/idle.png` / `assets/pet-new/**` / `probe-*.js` ×7 / `debug-pet.cmd` 在场；`package.json` **F7 提交自身**零改动（三面；F2 / F6 预期 diff 除外——§2.2.7 判据③）；真机冒烟 | 机检（存在性 + grep + diff）+ 真机冒烟 |

> 回指口径（评审修正轮 1 #8）：NFR-1（验收：AC2、AC3）落 AC2 / AC3 行；NFR-2 无独立 AC 编号（`docs/requirements/SHELL.md` §四——度量为评审核对 §2.3 / §2.5 + 平台分支 grep 计数，§3.3 手段 ⑥），回指附于其覆盖的改动面（US-5 → AC2、US-4 → AC4）。

### 3.2 用例表

| 用例 | 类型 | 输入 / 前置 | 预期输出 | 映射 |
|---|---|---|---|---|
| TC-1 | 正常 | 左键点击桌宠（主界面已显示） | 主界面保持显示并聚焦（不隐藏）；台词 + 开心动画 | US-1 / AC1 |
| TC-2 | 正常 | 左键点击桌宠（主界面隐藏 / 关闭态） | 主界面显示 + 聚焦 | US-1 / AC1 |
| TC-3 | 正常 | 右键点击桌宠（兑换屋未开） | 仅兑换屋出现；主界面显隐状态不变 | US-2 / AC1 |
| TC-4 | 边界 | 右键点击桌宠（兑换屋已开） | 兑换屋 `show + focus`；主界面状态不变 | US-2 / AC1 |
| TC-5 | 边界 | 按住左键拖动鲸鱼娘后松手（位移 >5px） | 无窗口打开（不触发点击语义）；拖动 / 贴墙 / 尺寸行为不回退 | US-1 / AC1 |
| TC-6 | 错误 | 右键连点 / 左右键快速交替 | 无交叉触发（不出现「一次操作两窗齐开」） | US-1、US-2 / AC1 |
| TC-7 | 正常 | 冷启动（whale；隔离 userData + `settings.json` 预置） | 无向导窗；主界面不显示；托盘 + 桌宠在场；左键可开主界面 | US-3、US-5 / AC2 |
| TC-8 | 边界 | 冷启动（focus 模式） | 无桌宠、无窗口自动出现；托盘在场 | US-5 / AC2 |
| TC-9 | 正常 | 冷启动后经托盘 #1 / 快捷键打开主界面 | 显示 + 聚焦（快捷键 / 托盘 toggle 语义不变） | US-5 / AC2 |
| TC-10 | 正常 | 向导删除静态核验（AC3 三条命令） | **5 符号** 0 处（含 `welcomeWindow`）、三文件不存在、`build.files` 无残留 | US-3 / AC3 |
| TC-11 | 正常 | 首启路径走查：打开主界面 → `设置 ▸ 模型` | 模型 / API Key 配置页可达（自定义向导缺位无阻塞） | US-3 / NFR-1 |
| TC-12 | 正常 | 托盘条目逐条核对（§2.2.3 表） | 11 一级项 / 顺序 / 分隔 / radio 状态 / 子菜单成员逐条一致 | US-4 / AC4 |
| TC-13 | 边界 | 专注模式下点「鲸鱼娘兑换屋」 | 兑换屋窗口打开（无桌宠时落默认位置） | US-4 / AC4 |
| TC-14 | 边界 | 专注模式下看「高级 ▸ 找回鲸鱼娘」 | 置灰不可用（PET US-14 条件保持） | US-4 / AC4 |
| TC-15 | 正常 | dev：点「检查更新」（有指针副本） | 无 dev 弹窗；日志 `face=app skipped=dev` + `type=harness` 检查行；harness 有更新则出既有弹窗 | US-6 / AC5 |
| TC-16 | 正常 | dev：`dshBinPath` 解析（无指针 / 有指针两态） | 无指针 → `dsh-bundle/`；有指针 → 副本路径（与打包分支同口径） | US-6 / AC5 |
| TC-17 | 错误 | dev：手动检查时断网 | 既有 Harness 错误弹窗 + 重试可用（与安装版同路径；无 App 面参与） | US-6 / NFR-4 |
| TC-18 | 正常 | 安装版：更新入口与流程对照 | App 自更新入口 / 弹窗 / 下载 / 安装链路与 B05 终态一致（AC6） | US-6 / AC6 |
| TC-19 | 正常 | 拆分核验：行数实测 + `node --check` + 真机回归清单 | 每档 ≤500；语法全绿；托盘 / 桌宠 / 主窗 / 市场 / 插件 / 更新逐项零回退 | US-7 / AC7 |
| TC-20 | 正常 | 锚点 grep：§2.2.6 清单逐条 | 全部字符串在场且发射点归位；无新增 / 删除日志（gate 行除外） | US-7 / NFR-3 |
| TC-21 | 正常 | F7 删除核验：四组文件存在性 + 全仓 grep（§2.2.7 判据） | 文件不存在；引用 0 处；`package.json` 零改动限定 = **F7 提交自身**（F2 / F6 的预期 diff 除外——§2.2.7 判据③） | US-8 / AC8 |
| TC-22 | 边界 | F7 保留面逐项核对 + 应用冒烟 | `assets/pet/idle.png` / `assets/pet-new/**` / `probe-*.js` ×7 / `debug-pet.cmd` 在场；启动正常、桌宠待机动画正常 | US-8 / AC8 |
| TC-23 | 错误 | 删除前预检：对四项（组）逐条重跑 0 引用核对 | 任一删除项仍被发现引用 → **停删并回报**（不自行扩大或缩小范围） | US-8 / AC8 |
| TC-24 | 正常 | 第二实例（主窗口已存在，含最小化态） | 显示 + 聚焦；最小化态被 `restore()` 还原（既有语义，`main.js:2458` 等价保留）；主界面显隐语义不变 | US-5 / NFR-2 |
| TC-25 | 正常 | `--open <path>` 启动（主窗口已隐藏时） | 主界面显示 + 聚焦 + 通知「已打开：<path>」（`handleOpenArg` 既有路径改经 `showMainWindow()`——§2.2.2 口径注） | US-5 / NFR-2 |
| TC-26 | 边界 | macOS `activate`（Dock 点击；whale / focus 两态） | 主界面显示 + 聚焦（零窗口时建窗后显示）——macOS 目视项（Windows 验收面不受影响） | US-5 / NFR-2 |

### 3.3 验证手段、仪表与限制

**验证手段**

1. **静态核对（grep 清单）**：① AC3 **五符号** 0 处（排除 `docs/`、`.test-*`、`dsh-bundle/`）；② `pet.js` 左键守卫三处；③ `showMainWindow` 为点击路径唯一「显示」入口；④ 托盘条目结构（§2.2.3 对照）；⑤ 门禁分支（`app.isPackaged` 保护 + `face=app` 行）；⑥ 平台分支计数（新增代码零平台分支）；⑦ `grep "更新检查只在安装版可用"` = 0 处（排除 `docs/`）。
   - ⑧ F7 删除面：四组文件不存在 + 引用 0 处（grep 范围含代码 / 配置 / 随包文档，排除 `docs/` 与 `.test-*` / `dsh-bundle`）；⑨ F7 保留面在场（`assets/pet/idle.png` / `assets/pet-new/**` / `probe-*.js` ×7 / `debug-pet.cmd`）。
2. **行数实测**：`find /c /v ""` 于全部 js（口径承 B05）。
3. **语法门**：`node --check` 于 15 个新模块 + `main.js` + `pet.js`（本仓无 lint / test script，此为最小机械门）。
4. **真机清单**：按 §3.2 逐条执行；冷启动类用例用隔离 `--user-data-dir` + 隔离 `DSH_HOME`（承 B02 §6.7 / B05 手法），并预置 `settings.json`（`modeChosen:true`、`mode:'whale'`）。
5. **锚点 grep 清单**：§2.2.6 表逐条（含 `updater.log` 15 条主格式行与变体、`pet-*` 日志、console 行、env 开关）。
6. **纯迁移 diff 判据**：P1 起点提交为基线——各层迁移提交除样板（require / exports / 限定 / 访问器）外，逐句一致；行为变更（F1–F5）不得混入 P1 各提交。
7. **本批不引入**：测试框架 / `test` script / 新增 `tests/` 文件（T4 认账不排期；判据口径承 B05 §3.3 手段 8）。

**只能人工验证的条目（如实标注）**

- AC1 / AC4 / AC5 的交互观感（点击手感、菜单目视顺序、dev 点击行为）——真机人工；其机器证据（静态守卫、结构对照、日志行）如 §3.1 所列。
- AC2 的「无自动可见窗口」——真机窗口枚举人工执行（辅助计数不可替代目视）。
- AC6 的发布门项（真实安装 / 自更新全流程）沿用 B02/B05 的既有判定面，本批只做代码路径对照（T8 另计）。

---

## 四、变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-16 | 初版：B06 桌面壳 UX 整合设计——需求层回指（US-1…US-7、NFR-1…NFR-4）、方案选型对比（A 桌宠按键 / B 托盘结构 / C 启动形态 / D 更新门禁 / E 拆分方案）、契约与结构（桌宠交互 / 窗口显示 / 托盘明细 / 向导删除 / 门禁口径 / 拆分架构与迁移计划）、受影响文件全清单、关键决策 DD-1…DD-14、冲突点核对与观察项、UI 决策 U-1…U-9、测试层（AC1…AC7 判定细化 + 用例 TC-1…TC-20）。 |
| 2026-09-16 | **追加 F7（无用文件清理）**（主 agent 裁定并入本批；依据 = 用户指示「删 1-5」）：新增选型 F（白名单精确删除）、§2.2.7（删除 / 保留清单与判据）、影响文件表三条删除行、DD-15、C16、AC8、TC-21…TC-23、观察项 O7（`THIRD-PARTY-NOTICES.md:53-54` 陈旧提及）；§一 回指表 / §2.1 判据域 / 静态核对清单同步为 US-1…US-8。 |
| 2026-09-16 | **评审修正轮 1**（#2–#12、#14；#13 无改动）：F2 补 `ready-to-show` 向导显块；AC3 五符号 + AC3 / AC5 / AC7 / §3.3 判据范围排除；AC8 / TC-21 零 diff 限 F7 自身；§2.2.6 逐档预估 + >300 档结论 + 覆盖核对 + 注 S4；macOS `activate` 改经 `showMainWindow()`（+ L3 / TC-26）；§3.1 NFR 回指；§2.3 / §2.5 as-of 注；L1 并入追认；DD-16 / U-10；TC-24 / TC-25。 |
| 2026-09-16 | **修正轮 1 遗留项：行宽**——§2.2.6 `shell-pet-geometry.js` 行函数枚举移入注 S4（行内改「函数清单见注 S4」）；`docs/design/AUTO-UPDATE.md` TC-16 行示例路径缩短；两行均压至 ≤300 字符（语义不变）。 |
| 2026-09-16 | **实施期形态注（P0 落地后）**：§2.2.2 补零窗口建窗分支口径（`showMainWindow()` 经 `ready-to-show` 首帧就绪后才 `show` + `focus`，防露未加载空窗——实现 = `main.js:732-733`）；§3.1 AC1 机检措辞按实现形态（`e.button !== 0` 早退 ×2 + `(e.buttons & 1) !== 0` 位掩码 ×1）；均不改语义。 |
