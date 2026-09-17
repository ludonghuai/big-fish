# 设计档 SHELL-UX — 桌面壳 UX 整合（启动 · 托盘 · 桌宠交互 · 更新门禁 · main.js 拆分）

> 归属板块：桌面壳
> 落点：`docs/design/SHELL-UX.md`
> 关联需求档：`docs/requirements/SHELL.md`（US-1…US-11、NFR-1…NFR-5）
> 关联批次：`docs/batches/B06-shell-ux.md`（§1.3 需求结论 C1–C7、§1.4 技术裁定 R1–R7、§1.5 验收 AC1–AC7、§1.6 事实、§1.7 既有约束）·
> `docs/batches/B07-harness-auth-compat.md`（§1.3 需求结论 C1–C6、§1.4 技术裁定 R1–R6、§1.5 验收 AC1–AC7、§1.6 事实、§1.7 既有约束）

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
| **US-9 主窗口会话鉴权兼容**（B07） | 主窗口加载后端打印的带令牌地址 | §2.1 G、§2.2.8、§3.1 AC9·AC10 |
| **US-10 后端不拉起系统默认浏览器**（B07） | `--no-open` + 取证面不回退 | §2.1 H、§2.2.9、§3.1 AC11·AC15 |
| **US-11 空闲检测不阻塞主进程**（B07） | fs.watch 主路径 + 异步回落；busy 判定面 | §2.1 I、§2.2.10、§3.1 AC12·AC13 |
| **US-7 补注（T12）**（B07） | 拆分遗留未绑定 `notifier` 修复 | §2.1 J、§2.2.11、§3.1 AC14 |
| **NFR-5 主进程响应性**（B07） | 探测域无同步文件系统调用面 | §2.2.10、§3.1 AC12 |
| **NFR-2 / NFR-3**（B07 注记） | 跨平台不回退 / 取证锚点与零依赖 | §2.3、§2.5（C17–C25） |
| **US-12 完成提醒及时性与误报边界**（B09） | 阈值 30 s → 8 s + 「回合已闭合」判定 | §2.1 K、§2.2.12、§3.1 AC17·AC18·AC19·AC20 |
| **NFR-5 主进程响应性**（B09 注记） | 判定读至多一次/静默窗、按会话数计、无遍历 | §2.2.12、§3.1 AC17 |
| **US-13 好感度按真实消耗累积（数据面读口）**（B10） | per-record 目录优先 / 旧单文件兜底 / 计费口径 B / 全量聚合 + 水位语义 | §2.1 L、§2.2.13、§3.1 AC21–AC25 |
| **US-14 插件安装面不接受越界入参、注册表字段不执行**（B12） | 入参三形态门（主防线）+ `path.join` 后越界校验（纵深）+ 弹窗文本化 | §2.1 M-1·M-2·M-3、§2.2.14、§3.1 AC26–AC28 |
| **US-15 市场扫描开销与注册表规模解耦**（B12） | 单次请求内一次扫描 + 快照复用；逐项判定零回退 | §2.1 M-4、§2.2.14、§3.1 AC29–AC30 |
| **NFR-6 不可信输入面 / NFR-7 扫描开销解耦**（B12） | 第三方字段不进路径拼接 · 不进 HTML 解析面 · 扫描次数与 N 无关 | §2.2.14、§3.1 AC26–AC30 |

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

#### 选型 G —— 主窗口 URL 契约（B07 C1 / US-9）

判据（取自 `docs/requirements/SHELL.md` §三 US-9 / §四 NFR-2）：「打开就能用」（不停在 401 文本页）；不写死版本差异；不动 Harness 内部；零新依赖。

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **以后端输出行 `dsh web: <url>` 为唯一来源**（回环主机 + 当前端口校验）——取带 `?token=` 的地址加载主窗口 | 「打开就能用」✓（带令牌地址访问 → 303 + 签名 Cookie）；同一实现兼容无令牌的旧版（捕到裸地址亦可用）✓；不动 Harness ✓；零新依赖 ✓（正则 + 字符串） | 依赖后端打印行的**形状稳定性**（已验证 0.1.0 与 0.1.5 均打印；行形变更则回落到裸地址并有取证行）；需一小段宽限期躲「HTTP 就绪先于输出到达」竞态 | **选定** |
| 2 | 关闭鉴权（新增启动开关） | Harness **无此开关**：`dsh --profile web` 仅 `--host` / `--no-open` / `--port` / `--trusted-host`（`dsh-web-app/lib/startup.js:22`）；改 Harness 内部代码违本批约束（批次档 §1.7） | — | 否决 |
| 3 | 壳侧自行推算 / 构造令牌 | 不可得：`launchToken = processLaunchToken(owner)` 为**每进程随机** 32 字节并缓存在**进程内** WeakMap（`dsh-client-connection/lib/index.js:240-246`）——壳（另一个进程）读不到 | — | 否决 |
| 4 | 壳侧读凭据域自行伪造签名 Cookie | Cookie 体 = `v1.<payload>.<HMAC(secret, body)>`，且 payload 内含 `authority`（`…/index.js:280-318` / `:392-407`）——等于在壳里重实现一份 Harness 鉴权（版本格式一变即碎）且跨安全边界读凭据 | — | 否决 |
| 5 | 壳侧先自行 HTTP `GET /?token=` 换 Cookie，再注入 Electron session | 仍需先拿到带 token 的 URL（未消除候选 1 的前置），多出「解析 Set-Cookie + 写 session cookie jar + 域名/路径/过期对齐」整段复杂度，收益为零；另需处理 cookie 与窗口加载的时序 | — | 否决 |

> 选定方案的竞态与边界口径落 §2.2.8；被否决候选的依据均为设计者亲读的 Harness 源码（路径 = `userData/dsh-update/versions/0.1.5-rc.1/node_modules/.pnpm/…`，行号见 §2.2.8 取证表）。

#### 选型 H —— 后端 stdout 处置（B07 C2 / US-10 + 取证面）

判据：「不拉浏览器」与「仍能拿到带 token 地址」两者并存；B04 / B05 取证面（`bigfish.log` 的 harness 行）不回退；tee 不得成为新的失败源。

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **管道 + tee 双写**：`stdio: ['ignore', 'pipe', 'pipe']`，每个 chunk 先喂嗅探再写 `bigfish.log`（写不了降级 `process.stdout`） | 同时满足两个诉求 ✓；取证面保持（同一文件、同一行格式，仅改写入口）✓；管道背压由 Node 流缓冲吸收（日志量小）✓ | 多一层进程内接力（需自行处理编码 / 错误事件 / 不抛出——见 §2.2.9 加固四点） | **选定** |
| 2 | 保持 `stdio: ['ignore', logStream, logStream]` 直写，另行尾随读 `bigfish.log` 嗅探 URL | 需要边写边读：文件偏移 / 轮次交错（多次启动追加同一文件）/ 读量随日志增长；嗅探时点晚于写入（新增竞态面） | — | 否决 |
| 3 | 管道只嗅探、不落盘 | 直接违 B04 / B05 取证面（批次档 §1.4 R3 硬） | — | 否决 |
| 4 | 不用 `--no-open`，改为壳侧启动后立即关掉后端拉起的浏览器窗口 | 需枚举 / 操控外部浏览器进程（平台相关且粗暴）；用户诉求是「不要拉」而非「拉了再关」 | — | 否决 |

#### 选型 I —— 完成探测机制（B07 C3 / US-11 + NFR-5）

判据：5 s 周期**不得阻塞主进程**；「任务完成」语义不回退；零新依赖；开销与 `~/.dsh` 规模解耦。

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **`fs.watch(home, {recursive:true})` 主路径 + 非 Windows 异步扫描回落**；5 s 定时器只做纯算术空闲判定 | 零遍历（OS 级事件推送）✓；不阻塞（事件回调只做字符串 + 赋值；回落走 `fs.promises`）✓；零新依赖（`node:fs`）✓ | Windows 递归 watch 有 OS 缓冲溢出 — 漏事件的固有风险（记为 L-B07-3）；回落路径每 5 s 仍全树异步扫描（不阻塞但持续 I/O，记为 L-B07-2） | **选定** |
| 2 | 保持 5 s 轮询，只把递归 `stat` 改异步（旧实现的异步化） | 不阻塞 ✓；但每 5 s 仍对 20,849 文件（`~/.dsh` 实测总量 20,857）做一轮 stat——持续 I/O / 耗电，与「开销与规模解耦」相抵 | — | 否决 |
| 3 | 引入 `chokidar` 等成熟库 | 违零新依赖纪律（`dependencies` 保持空数组，`package.json:25`）；且需同步 `build.files` | — | 否决 |
| 4 | 收窄监视面（只监视 `storages/` + 顶层文件） | 开销最小；但**改变了 busy 判定面**（写入 `profiles/` 深层不再计忙）——语义变更，超出本批（在途改动已定口径） | 改动面小，但引入了需求层未审的口径变更 | 否决（登记为后续可选加固，见 O9） |

#### 选型 J —— F6 遗留缺陷修复口径（B07 C4 / T12·US-7 补注）

判据：修好后两处托盘动作无异常；不引入新的模块依赖面；不违反 §2.2.6 依赖方向规则。

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **改用已注入的 `notify(...)`**（`shell-mode.js:17` / `:24`，组合根 `main.js:67` 注入 `notifier.notify`） | 与 §2.2.6 声明的注入面一致 ✓；零新 require、零新依赖边 ✓；与同档其他注入（`getMainWindow` / `ensurePet` / `rebuildTrayMenu`）同形 ✓ | 仅两处标识符修正（`notifier.notify` → `notify`） | **选定** |
| 2 | 新增 `const notifier = require('./shell-notify.js')` | 不产生环：`shell-notify` 只依赖 `shell-assets` / `shell-settings`，不依赖 `shell-mode`（无环可证）——技术上可行；但与已声明的注入面**同能力两条路径**（同一能力两个来源，后续漂移风险） | — | 否决 |
| 3 | 改由 `shell-tray.js` 在菜单回调里自己调 `notifier.notify` | 域归属错位：背景动作的反馈属 `shell-mode`；且托盘已 require `shell-notify`（`shell-tray.js:18`），会把「背景是否成功」的判定散到两处 | — | 否决 |

#### 选型 K —— 阈值取值与「回合闭合」判定源（B09 / US-12）

判据（取自 `docs/requirements/SHELL.md` §三 US-12 / §四 NFR-5 B09 注记 + 批次档 §1.5）：**P1** 显著缩短迟滞（末次写入 → 提醒 ≤ 15 s）· **P2** 任务中途静默不误报（判据可机检 / 可桩测）· **P3** 零新依赖 / 零新增文件 / 不改 Harness · **P4** 判定读不随 `~/.dsh` 规模增长。

**K-1 阈值取值**：

| # | 候选 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **8 s**（= 投影缓存写后阈值 5000 ms + 3000 ms 余量） | P1 ✓（有效时延 8–13 s，现状 30–35 s 的 ≈1/3）；**P2 的结构前提** ✓——阈值 > 写后阈值才能保证判定时快照已折叠最近事件（§2.2.12 判定前提）；余量 3 s 吸收写序抖动 / watch 到达延迟 / 判定读开销 | 与 5 s 周期对齐 ⇒ 时延有 0–5 s 抖动（现状同样抖动，非新增） | **选定** |
| 2 | 5 s | P1 ✓（有效 5–10 s，再快 3 s）；但 5 s **≤** 写后阈值 ⇒ 判定可能读到尚未追上日志的快照（规则②兜底 ⇒ 白白推迟，收益被吃掉）；且阈值 ≤ 周期 ⇒ 阈值语义退化为「≤ 1 个周期」 | 收益 3 s，换来判定面与时序前提相抵 | 否决 |
| 3 | 15 s | P1 △（有效 15–20 s，仅 ≈2× 改善）；余量最足 | 用户诉求（「太久了」）改善有限 | 否决 |
| 4 | 保持 30 s | 用户 2026-09-17 真机验收点名项，不解决 | — | 否决 |

**K-2 判定源（「回合已闭合」读哪里）**：

| # | 候选 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **会话投影缓存记录**（`session_projcache/sessions/<会话 ID>.json` 的 `rows.turnBoundary.val.openTurnStartSeq`） | P2 ✓（非 null ⇔ 回合在途，逐字取自 Harness 投影定义）；P3 ✓（plain JSON；不改 Harness）；P4 ✓（按会话数计）；写时机确定 ✓（**每 `turn/end` 强制落盘**） | 依赖 Harness **内部形态** → 形态守卫 + 降级封口；该 family 已变过一次（T14 / B10） | **选定** |
| 2 | 会话事件日志（`sessions/**/session.v3.jsonl.zstd` 的末事件 = `turn/end`） | 语义同样精确（`turn/end` 事件即完成标记）；但需 **zstd 解压**（`node:zlib` 的 zstd 支持要求 Node ≥ 22.15 / 23.8——Electron 内置 Node 版本待核）+ 多帧拼接（实测该档 19 个独立帧）+ 读取量随会话增长 | 复杂度与版本依赖显著更高，信息与候选 1 同源 | 否决 |
| 3 | 后端 stdout 输出行 | 批次档 §1.3 ② 已实测排除（后端启动后不再输出任何行） | — | 否决（不可行） |
| 4 | HTTP 轮询 Harness web 服务取会话状态 | 需带会话 Cookie 的鉴权请求（令牌每进程随机）；Harness 内部 API 契约未登记；新增每静默窗网络往返与失败面 | — | 否决 |
| 5 | 只缩短阈值（不引入判定源） | 实测（§2.2.12 证据表 #1）单次工具调用静默 **21.9 s** ⇒ 8 s 阈值必误报 | — | 否决（违 P2） |

> K-2 候选 1 的取舍展开：域 v7 / 行 `ver`=2 属 Harness 内部形态（换代即降级——§2.2.12 规则②）；同目录 family 的读面失效先例 = `shell-affinity.js:70`（0.1.5 改 per-record 布局后读不到，技术待办 T14 / 批次 B10）。
>
> 选定方案的判定规则 / 降级 / 交互与限制落 §2.2.12；被否决候选 2 的形态依据（帧结构）与候选 3 的实测依据均为设计者亲读亲测（指针见 §2.2.12 证据表）。

#### 选型 L —— 好感度数据面读面（B10 / US-13）

判据（取自 `docs/requirements/SHELL.md` §三 US-13）：**P1** 与当前出厂 / 活跃两种 Harness 布局一致（离线版与更新版都能读）· **P2** 失败域最小（单条损坏不整面失效）·
**P3** 零新依赖 / 零新增文件 · **P4** 与既有实现语义同源（低改造风险）。

**L-1 读面形态（读哪一份）**：

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **双形态：per-record 目录优先 → 旧单文件兜底**（形态判别以**磁盘事实**为准） | P1 ✓（活跃 0.1.5 走目录、出厂 `0.1.0-rc.6` 走旧文件——两条路径都覆盖）；P2 ✓；P3 ✓（`node:fs` / `node:path` 既有）；P4 ✓（旧面分支 = 现状代码语义保留） | 两个分支的维护面（旧面随 B08 到期剔除——§2.2.13 消解期） | **选定** |
| 2 | 只支持 per-record 目录（新形态） | **P1 ✗**：出厂内置 Harness = `0.1.0-rc.6`（单文件布局）⇒ 离线用户的好感度**继续永久失效**——正是本 bug 的形态 | — | 否决 |
| 3 | 只支持旧单文件 | **P1 ✗**：活跃 0.1.5 不再写该文件 ⇒ 本 bug 原样保留 | — | 否决 |
| 4 | 按 Harness 版本号择形态（先读 `getCurrentDshVersion()` 再分支） | P1 △（要维护「版本 → 布局」映射）；**P4 ✗**：判别面从磁盘事实变成版本字符串（实际落盘形态无法由此确证），且多一张会过期的映射表 | — | 否决 |

**L-2 多会话聚合口径（批次档 §1.5 ② 交设计裁定项）**：

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **全量累加**（目录下全部可解析记录求和） | 语义 = 「该用户的终身消耗」，与旧实现**同源**（旧面 `tables.sessions[*]` 即全量）；**水位单调性最好**（新会话只增不减）；可判定 | 水位随会话记录清理而下降 ⇒ 触发既有重基线（不扣已计入的好感） | **选定** |
| 2 | 仅当前会话（mtime 最新记录） | **水位随会话切换剧烈波动**：新会话从 0 起 ⇒ 每次切换都触发重基线 ⇒ 大段消耗漏计；且壳侧无可靠「当前会话」判定源（用户可在多窗口 / 多客户端间切换） | — | 否决 |
| 3 | 按 workspace（`record.identity.cwd` 过滤） | 旧实现不按 workspace 过滤（口径变更）；同一用户的多个工程应计入同一份终身消耗；且过滤需定义「当前工程」——壳侧无此概念 | — | 否决 |
| 4 | 时间窗（如近 N 天记录） | 发明新口径（无需求依据）；窗口滚动 ⇒ 水位非单调、随会话数漂移；判据不可机检 | — | 否决 |

**L-3 两形态并存时的处置**：

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **目录面有可解析记录 ⇒ 目录专读**（不叠加旧文件） | 两形态是**同一批消耗的两种表示**（旧文件 = 0.1.0 期同一领域的聚合快照）⇒ 叠加即双计；判据单值可机检（返回值 ≠ 两形态之和） | 并存且旧文件更新更近时也不读旧面——旧面在新面在场时本就已废弃 | **选定** |
| 2 | 两形态求和 | **双计**（同一批消耗计两次）⇒ 好感度与可兑换余额双双虚高 | — | 否决 |
| 3 | 取 mtime 更新者 | 形态判别退化为时间判别：旧文件 mtime 可能更新（被备份 / 复制）⇒ 误选旧面 ⇒ 漏计新消耗；且逐 tick 结果可能翻转（水位抖动） | — | 否决 |

> 选定方案的读面四步判据 / 累加判据句 / 容错表落 §2.2.13；归属判定（为何落 SHELL 而非 PET）= §2.5 C32 与批次档 §2.6。

#### 选型 M —— 插件市场安全与阻塞三项的实现形态（B12 / US-14·US-15）

判据（取自 `docs/requirements/SHELL.md` §三 US-14·US-15 / §四 NFR-6·NFR-7 + 批次档 §1.4）：**P1** 不可信数据不可达文件系统与 HTML 解析面（可机检）· **P2** 合法形态零回退（判定与文案逐字不变）· **P3** 零新依赖 / 不改 IPC 契约 / 不越 500 行硬限 · **P4** 扫描次数与注册表条目数解耦。

**M-1 入参门形态（`installPlugin` / `uninstallPlugin` 的第一道门）**：

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **三形态白名单**（`builtin:`+纯包名 / `github:owner/repo[#片段]` / `[scope/]name[@版]`；名字部分复用 `isPlainPackageName`） | P1 ✓（形态外一律拒，判据单值可机检）；P2 ✓（**注册表 3725 个推导标识实测零误拒**——含 491 个 scoped、1832 个 `github:`、139 个 `#path:/…` 子目录形态）；P3 ✓（纯字符串判据） | 需在实现内声明三形态判据句（形态演进时须同步改——判据句落 §2.2.14） | **选定** |
| 2 | 黑名单（拒 `..` / 绝对路径 / 盘符 / 反斜杠） | P1 ✗：黑名单追不上形态全集（UNC `\\srv\share` / `\\?\C:` / 设备名 / 未来形态）——漏一个变体即漏一次递归删除 | — | 否决 |
| 3 | 只做越界校验（不设入参门） | P1 △：就本 bug 的可达面有效；但 `pnpm` 面（npm 分支）零防御——`pnpm add ../../..` 会把本地目录作为 `link:` 依赖写进 profile（下次启动 dsh 从市场之外加载代码）；且拒绝点落在分支后半 | — | 否决 |
| 4 | 只对 `builtin:` 分支加门 | P1 △：封住递归删；npm 面同候选 3；且「裸包名走内置面」形态（`installPlugin('dsh-x')`）未覆盖 | — | 否决 |

**M-2 越界校验形态（纵深防御层）**：

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **`path.relative` 词法包含判定**（`target` 严格在 `node_modules` 下 / `bundledSource` 严格在 `bundledPluginsDir` 下） | P1 ✓（与白名单**判据面不同**：一个判形态、一个判位置）；P2 ✓（合法形态过门后必然包含 ⇒ 恒真、零误拒）；P3 ✓（`node:path` 既有） | 与白名单的蕴含关系（§2.2.14 蕴含论证）⇒ 当前形态下不可构造「过门但越界」的端到端用例（判据以函数级驱动） | **选定** |
| 2 | 字符串前缀比较（`p.startsWith(base + sep)`） | P1 △：未归一化即比较——`node_modules/../..` 前缀仍匹配；大小写 / 分隔符混用 / 末尾斜杠三处坑 | — | 否决 |
| 3 | `realpathSync` 后比较（抗符号链接） | P1 △△：pnpm 的 `node_modules` 是链接布局（本机实测顶层含 `.pnpm` / `.modules.yaml` 元数据）⇒ 合法包目录可指向 store，真实路径在基准之外会**误拒合法安装**；且路径不存在时抛错（新增失败面） | 收益（抗本地链接）不在本 bug 威胁面（攻击源 = 远端注册表字段，无法创建本地链接） | 否决 |
| 4 | 不设越界校验（只靠白名单） | P1 △：单层防御——白名单一旦被改宽（或形态演进引入新拼接点）即裸奔，而本 bug 的后果是**递归删除用户凭据** | 成本 = 一个 6 行 helper | 否决 |

**M-3 弹窗文本化形态（`market.js`）**：

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **结构面：`confirmModal` 改收节点 + 调用点用 `el()` / 文本节点构造**（`innerHTML` 全档清零） | P1 ✓（注入面**不存在**，而非「调用点记得转义」）；P2 ✓（同标签同文案：`<p>` / `<code>` / `<b>` 与 `margin-top:8px` 逐字保留）；P3 ✓（净行数 ≤ 0——§2.3） | 三处调用点重写 + 一个 `frag()` helper（约 6 行） | **选定** |
| 2 | 转义 helper（`esc()` + 保留 HTML 字符串） | P1 △：注入面仍在（`body.innerHTML = html` 未消失），安全性依赖**每个调用点**都记得转义——未来新增调用点即新漏洞；机检判据只能是「实参形态」 | — | 否决 |
| 3 | `textContent` 直替（整段当纯文本） | P2 ✗：丢失 `<code>` / `<b>` / `margin-top` 结构 ⇒ 外观变更（违批次硬约束「保留既有 UI 外观与文案」） | — | 否决 |

**M-4 扫描复用形态（`shell-plugins` / `shell-market`）**：

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **单次请求内一次扫描 + 快照复用**（快照 = `node_modules` 顶层条目 + bundles + 已装名单；经可选参数下传） | P4 ✓（与 N 解耦：N=2 与 N=3727 计数相等）；P2 ✓（同一磁盘状态的逐项判定与改前一致——等价性论证落 §2.2.14）；P3 ✓ | 同一请求内由「多次读」变为「一次读」⇒ 并发写窗口内由「可能撕裂」变为「一致快照」（**有意变更**，见 §2.2.14 行为差异表） | **选定** |
| 2 | 短期 TTL 缓存（如 500 ms）跨请求复用 | P4 ✓；P2 ✗：需定义失效面（安装 / 卸载后 `market:state` 可能读到陈旧快照 ⇒ 按钮状态与磁盘不符）；本批无「同一秒内重复请求」的实证需求 | 收益（省一次 readdir）远小于新增的失效面 | 否决 |
| 3 | 只把 `computePluginUpdates` 内部的扫描提到循环外（不动 `marketList` / `marketState` 的其余调用） | P4 △：`market:list` 仍有 2 次全扫（`listInstalledPlugins` + `listDisabledPlugins`）、`market:state` 同 | 半修：主线程仍付两次全扫 | 否决 |
| 4 | 异步化（`fs.promises`）改造整条市场调用链 | P4 ✓；P2 △（`marketList` / `marketState` 全链路改 async 的改动面远超本批边界）；P3 △ | 改动面与回归面显著放大，与「判定零回退」相抵 | 否决 |

**M-5 验证落点（批次档 §1.4 AC1–AC6 的可机检化）**：

| # | 候选方案 | 判据逐项评估 | 取舍（选定代价/权衡） | 结论 |
|---|---|---|---|---|
| 1 | **落 `tests/b12-plugin-guards.test.js`**（`node --test`；假 `electron` / 假 `shell-backend` 经加载器注入 + 临时 `DSH_HOME` 夹具） | P1 ✓（三项判据均**行为面**，静态不可达）；P3 ✓（零依赖：`node:test` / `node:vm` / `node:fs`） | 新增 1 个仓内文件（不入 `build.files` / `package.json`）；寿命口径 = ①（收口逐条判处置——§3.3 手段 13） | **选定** |
| 2 | 桩测脚本落 `.thincoder/`（gitignore，B03 / B09 先例） | 同 P1；但一次性、批后即失（三项修复属安全面，长期价值超出单批） | 与「安全修复应可复跑」相抵 | 否决 |
| 3 | 不落测试，只做静态判据 | **P1 ✗**：三项修复的判据都是行为面——`grep` 无法证明「fs 零改动」与「计数与 N 无关」 | — | 否决 |

> M-5 候选 1 的仓内先例 = `tests/update-lib.test.js` / `tests/harness-store.test.js`（本批新增文件与两者同层；收口处置归批次档 §6）。

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
| `shell-notify.js`（新） | 系统通知 + 任务完成提醒（`notify` / `start·stopCompletionWatcher`；函数清单见注 S5） | `246-258` / `605-697` | electron → 注入 `getDshHome` |
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

> **注 S1（`shell-backend.js` 函数清单；B07 实施期实测补全，文件序）**：`writeDiag` · `webUrlWaitMs` · `findFreePort` · `dshBinPath` · `bundledSkillDir` · `resolveRuntime` · `waitForReady` · `captureWebUrl` · `waitForWebUrl` · `browserUrl` ·
> `cleanupStaleDsh` · `startDsh`（内含 `makeTee` 工厂——每管道各自一只 `StringDecoder`）· `stopDsh` · `dshHome` · `getCurrentDshVersion` · `restartBackend` · `getPort`（+ 状态 `dshProcess` / `port` / `browserLaunchUrl`）。
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

> **注 S5（B07 修订——`shell-notify.js` 函数清单）**：`notify` · `isIgnoredPath` · `latestMtimeAsync` · `startCompletionWatcher` · `stopCompletionWatcher` · 转发访问器 `setLastBusyAt` / `setNotifiedForCycle`。
> 同步实现 `latestMtime` **B07 退役**（全仓 0 调用点 + NFR-5 静态判据要求探测域无同步 fs 调用面）——依据与判据见 §2.2.10 修正 B。

> **注 S6（B09 修订——`shell-notify.js` 函数/状态清单增量）**：新增函数 `completionGate()`（判定：读最新投影缓存记录 + 会话档 mtime 比较，返回 `done` / `open` / `stale` / `unavailable` 四态）与档内常量 `GATE_FRESH_TOLERANCE_MS`(1000) / `GATE_TURN_BOUNDARY_VER`(2)；
> 新增状态 `completionGateMemo`（`{ lastBusyAt, verdict }`——按末次写入时刻记忆）/ `completionGateProbeRunning`（在途标记）/ `completionGateDiagLogged`（诊断行至多一次/生命周期）。
> 注入面增量：`IDLE_NOTIFY_FALLBACK_MS`（组合根常量注入，承 `IDLE_NOTIFY_MS` 同形）；**无新增导出**（判定不对外暴露符号——判定规则见 §2.2.12）。

> **注 S7（B10 修订——`shell-affinity.js` 读面增量）**：档内新增常量（目录段 `['storages','session_projcache','sessions']` / 旧文件名段 `session_projcache.json` / 四桶名清单）与一次性诊断标记 `affinityDiagLogged`；
> `sumSessionTokens()` 由「旧布局单面读」改为**双形态读面**（规则见 §2.2.13）；**导出面 +1** = `sumSessionTokens`（桩测机检用，无副作用）；
> `shell-backend.js` 的 `module.exports` 增 `writeDiag`（1 行——函数体不动，诊断行落盘面复用；现状未导出 = 设计者亲读 `shell-backend.js:311-322`）。

> **注 S8（B12 修订——`shell-plugins.js` 函数/导出增量）**：新增三个**纯函数**（零副作用）——`installSpecKind(spec)`（入参形态门：返回 `bundled` / `github` / `npm` / `null`）、
> `isInsideDir(child, base)`（`path.relative` 词法包含判定）、`scanProfile()`（单次扫描快照：`{ names, nameSet, bundles, entries, versions }`）；
> 既有函数增**可选**尾参 `ctx`（`resolveInstalledName` / `isPluginInProfile` / `installedPluginVersion` / `listInstalledPlugins` / `listDisabledPlugins` / `computePluginUpdates`）——缺省时内部自建一次快照（既有调用点语义逐字不变）；
> **导出面 +3**（三个新纯函数——桩测机检用，无副作用）；`shell-market.js` 的 `marketList` / `marketState` 改为建一次快照并下传（无新增导出）。

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

> **B07 附注（计数与枚举同改——D3）**：本批对该清单的增删——① 新增 env 开关 `BIGFISH_WEB_URL_WAIT_MS`（URL 捕获宽限期；默认 3000，仅测试钩子，读取点 `shell-backend.js`）；
> ② 新增 console / `bigfish.log` 行 2 条（`backend web url captured` / `backend web url not captured`——§2.2.8）；③ 新增 console 行 1 条（`completion watcher unavailable; falling back to async scan`——§2.2.10，条件发射）。
> 除上述三项外，本批**不增不删**任何日志行 / env 开关（B01–B05 锚点逐条保持——US-10 取证面硬要求）。

> **B09 附注（计数与枚举同改——D3）**：本批对该清单的增删——① 新增 env 开关 `BIGFISH_IDLE_NOTIFY_MS`（空闲阈值测试钩子；默认 8000，读取点 `main.js`）；
> ② 新增 console 行 1 条（`completion gate unavailable; falling back to idle threshold <ms>ms`——§2.2.12，条件发射、每监视器生命周期至多一条）；
> ③ 既有行**不增不删**：`IDLE_NOTIFY_MS` 的注入值由 30 s 改为 8 s（**常量值变更**，非新增开关 / 非新增行）；通知文案三串逐字不变（§2.2.12 交互表）。除上述两项外本批不增不删任何日志行 / env 开关。

> **B10 附注（计数与枚举同改——D3）**：本批对该清单的增删——① 新增 `bigfish.log` / console 行 **1** 条（`affinity token source unavailable; …`——§2.2.13，条件发射、每进程生命周期至多一条）；
> ② 新增**导出面 2 项**（`shell-affinity.sumSessionTokens` / `shell-backend.writeDiag`——非日志行，随注 S7 登记备查）；
> ③ 既有行 / env 开关**不增不删**（`market.log` / `exchange.log` 面零改动；`DSH_HOME` 读取点仍在 `shell-backend.js`）。除上述两项外本批不增不删任何日志行 / env 开关。

> **B12 附注（计数与枚举同改——D3）**：本批对该清单的增删——**零新增、零删除**：不新增 env 开关、不新增 / 不改任何日志行（`plugin update …` 行的发射条件、顺序与条数逐字不变——§2.2.14）；
> 另增**导出面 3 项**（`shell-plugins.installSpecKind` / `isInsideDir` / `scanProfile`——非日志行，随注 S8 登记备查）。

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

#### 2.2.8 主窗口 URL 契约（B07 C1 / US-9）

**取值链（单入口 `browserUrl()`）**：

```
后端进程启动（--no-open）→ stdout 行 `dsh web: <url>`
  → captureWebUrl（每 chunk 追加尾缓冲；正则 WEB_URL_LINE + 回环主机 + 当前端口校验）
  → browserLaunchUrl（首次命中即锁定）
  → browserUrl() = browserLaunchUrl || `http://${HOST}:${port}`   ← 主窗口 URL 的唯一出口
      ・ shell-window.js createWindow() → loadURL(browserUrl())（现状 :65）
      ・ shell-backend.js restartBackend() → loadURL(browserUrl())（现状 :256；两个分支均不复用旧地址）
```

**Harness 侧契约**（设计者亲读，as-of 2026-09-17；版本目录 = `%APPDATA%\bigfish\dsh-update\versions\0.1.5-rc.1\node_modules\.pnpm\…`）：

| # | 事实 | 指针 |
|---|---|---|
| 1 | 令牌查询参数名 = `token`；`launchToken` 每进程随机（32 字节）并缓存在**进程内** WeakMap | `@deepseek-ai/dsh-client-connection/lib/index.js:222` / `:240-246` |
| 2 | `GET /` 且**恰好一个** `token` 参数、authority 命中、令牌匹配 ⇒ `303` 跳 `/` 并下发签名 Cookie（`HttpOnly; SameSite=Strict; Path=/`，名 = `dsh-auth-<sha256(authority)>`） | 同上 `:386-409` / `:280-293` |
| 3 | 无 Cookie 的 index 请求 ⇒ `401` + 正文 `dsh web authentication required; reopen the URL printed by dsh web.` | 同上 `:442-448`（正文 `:447`） |
| 4 | Cookie 与 authority 绑定（签名 payload 含 `authority`，校验逐次比对），端口变化即失效 ⇒ **每次启动都须重新换取** | 同上 `:392-400` / `:431-441` |
| 5 | `dsh --profile web` 的 CLI 面只有 `--host` / `--no-open` / `--port` / `--trusted-host` ⇒ **无关闭鉴权的开关** | `@deepseek-ai/dsh-web-app/lib/startup.js:22` |
| 6 | 启动输出（`bigfish.log` 实证）：`dsh web: http://127.0.0.1:<port>`（更新前，`:44`…`:115`）→ `dsh web: http://127.0.0.1:<port>/?token=<hex>`（`:119` 起）；`--no-open` 生效后 `dsh web: opening the default browser; …` 行消失（`:123-124` / `:127-128`） | `%APPDATA%\bigfish\bigfish.log` |

**捕获参数与边界（判据）**：

| 情形 | 期望行为 |
|---|---|
| 后端先打印、HTTP 后就绪（常见） | `waitForReady` 完成前已捕获；主窗口直接加载带令牌地址 |
| HTTP 就绪早于打印 | `waitForWebUrl` 宽限 3000 ms（100 ms 轮询； env `BIGFISH_WEB_URL_WAIT_MS` 可覆盖）内等到即用 |
| 宽限内仍无行 | `browserUrl()` 回落裸地址 + **一条诊断行**（不静默）；窗口可能停在 401 文本页——是否加用户面提示 = open 项 U-12 |
| 宽限耗尽之后 URL 行才到达（晚命中） | 补一次加载（DD-28）：已建窗且当前 URL ≠ 命中地址 ⇒ `loadURL(命中地址)`；日志 = 先 `not captured`（宽限结束时）后 `captured`（行到达时）——同一序列两条齐备（用例 TC-31） |
| 行存在但主机非回环 / 端口 ≠ 当前端口 / URL 解析失败 | 不采用，记 `reason=mismatch`（或 `parse-fail`）；继续等后续行 |
| 多次打印 / 行被 chunk 切断 | 尾缓冲滚动 4096 字符拼接；首次命中即锁定（后续行不覆盖） |
| `restartBackend`（插件安装 / 手动重启） | `stopDsh` 清空捕获 → 新进程重捕 → `loadURL(browserUrl())`；不复用旧端口 / 旧令牌；捕获时若窗口已建旧地址 ⇒ DD-28 补载一次（随后本行再加载同址，幂等） |
| 旧版 Harness（裸地址） | 捕获成功（`token=no`）→ 加载裸地址，行为与既有版本一致 |
| `will-navigate` 守卫 | 用 `origin`（`shell-window.js:53-60`，不含查询串）——带令牌 URL 的 origin = `http://127.0.0.1:<port>`，与守卫期望值相等；本批不改该守卫 |

**晚命中回收（本批新增机制点；DD-28；评审修正轮 1 #5）**：

- 触发：`captureWebUrl` 首次锁定 `browserLaunchUrl` 时——含宽限期早已耗尽、窗口已按裸地址加载的情形。
- 动作：主窗口已建且未销毁、且其当前 URL ≠ 命中地址 ⇒ `loadURL(命中地址)`（一次；锁定即终态，后续行不覆盖）。
- 可达面：① **晚命中**（宽限耗尽后行才到）；② **后端重启**（`restartBackend` → `startDsh`：捕获时窗口仍持旧地址 ⇒ `getURL() !== 新地址` ⇒ 补载一次，随后 `:304` 再加载同一地址）——双守卫（`!isDestroyed()` + 地址不等）+ `.catch` 兜底，**重启路径的一次重复加载 = 有意接受（同址幂等）**；窗口未建（`startDsh` 未返回前）⇒ 不触发（`createWindow()` 按 `browserUrl()` 加载命中地址）。
- 判据：① 静态——命中分支内的回收段在场（`getMainWindow()` 已是既有注入面，零新增注入）；② 真机（TC-31）——宽限耗尽后窗口在 URL 行到达后自行回到对话 UI，无需重启应用。
- 与 open 项 U-12 的边界：本机制只定「已加载裸地址的窗口是否回收」，U-12 只定「未捕获时的用户面提示」——两者互不重叠，U-12 的裁定不改变本机制。

**诊断行（本批新增 2 条；同写 console 与 `bigfish.log`）**：

```
[bigfish] backend web url captured port=<n> token=yes|no
[bigfish] backend web url not captured port=<n> reason=no-line|mismatch|parse-fail fallback=http://<HOST>:<port>
```

- 只记 `token=yes|no`，**不记令牌值**（凭证不入档）；后端自己那行 `dsh web: …` 保持原样——它是本机制与用户排查的取证面。
- 发射点：捕获命中时（`captureWebUrl` 内）发第一条；宽限期结束仍未捕获时（`startDsh` 内、`waitForWebUrl()` 之后）发第二条——每次启动至多一条 not captured。
- 机检：`findstr /c:"backend web url" bigfish.log`（成功 = captured；回落 = not captured + reason）。

**落盘机制（本批补——判据可达性）**：现状 `captureWebUrl` 只 `console.log`（`shell-backend.js:131`），而 `bigfish.log` 仅由 `tee` 写**后端输出**（`:181-189` / `:201-208`）——诊断行不补落盘路径，则上条机检与 AC9 / AC15 不可达。本批：

- `logStream` 由 `startDsh` 局部（`:179`）**提升为模块级**（近 `outputTail`，`:41`）；`startDsh` 内改为赋值。既有横幅行（`:189`）与 tee 路径语义不变；A3 的「置 `logStream = null`」即指该模块级变量。
- 新增本档内 helper `writeDiag(line)` = `console.log(line)` + `if (logStream) { try { logStream.write(line + '\n'); } catch { /* 诊断行写不了不致命 */ } }`——两条 URL 诊断行均经它发射。
- `reason` 追踪：模块级 `webUrlRejectReason`——`captureWebUrl` 见到行但主机 / 端口校验不过 ⇒ `mismatch`，URL 解析失败 ⇒ `parse-fail`；`startDsh` / `stopDsh` 重置捕获处一并置 `null`；宽限期结束时 `reason = webUrlRejectReason || 'no-line'`。
- 诊断行是壳侧**追加**行，不替代 tee 路径、不改文件名 / 落点；`logStream === null` 时只到 console（不新增失败面）。

**边界（不做）**：不跨启动缓存 URL 复用；不改 `waitForReady` 就绪判据（`statusCode < 500`，含 401——鉴权面不参与就绪判定，有意保持）；不新增 Harness 未支持的启动参数；不在壳侧改写 / 脱敏后端输出；**不回溯上一会话**——回收只覆盖本次启动内「宽限耗尽后命中」的窗口，地址始终未到时残留态 = 本次会话停在 401 文本页（用户重启应用即恢复），该残留下是否加用户面提示 = open 项 U-12。

#### 2.2.9 后端 stdout 处置（B07 C2 / US-10 + 取证面）

**现状（基线，在途改动）+ 本批四个加固点**（行号 as-of 2026-09-17）：

| # | 现状（`shell-backend.js`） | 风险 | 本批处理 | 判据 |
|---|---|---|---|---|
| A1 | `tee(chunk)` = `chunk.toString('utf8')`（`:202`） | UTF-8 多字节字符被 chunk 边界切开 ⇒ 日志出现 U+FFFD（取证面污染）；嗅探侧不受影响（令牌为 ASCII） | 引入 `node:string_decoder` 的 `StringDecoder('utf8')` 累积跨 chunk 字节（内置模块，零新依赖） | 分片注入后日志无 U+FFFD（TC-36） |
| A2 | 日志流打不开时降级 `process.stdout.write(text)`（`:205`，未包 try） | 降级路径自身若抛（EPIPE 等）= 挂在 `data` 事件上的未捕获异常，中断后端输出处理 | 降级分支同样包 try/catch（tee 恒不抛） | 静态核对（tee 内无裸写） |
| A3 | 预开启阶段的 `logStream.once('error')`（`:186`） | `once` 只吃第一次；运行期写失败（磁盘满 / 路径失效）后无监听 ⇒ 流 `error` 无人接管 | 改**常驻** `error` 监听：置 `logStream = null` 并切到 `process.stdout`（一次性降级，不重试） | 静态核对（`on('error')` 常驻）+ 真机（只读 userData 启动不崩） |
| A4 | stdout / stderr 两个 pipe 各自 tee（`:207-208`） | 写入顺序与背压 | 口径化：**单流内保序**；stdout 与 stderr 的交叉顺序不保证（与改动前两 fd 直写同一文件同口径，非回退）；不处理 `drain`（日志量小；记为 L-B07-1） | 文档口径 + 真机对照（同一启动序列日志行齐备） |
| A5 | `logStream` 为 `startDsh` 局部（`:179`）——仅 `tee`（同闭包）可达 | 壳侧诊断行（§2.2.8）须落 `bigfish.log`，但 `captureWebUrl` 在模块级、够不到该局部 | 提升为**模块级** `let logStream`（近 `:41`）+ `writeDiag(line)` 双写 helper + `reason` 追踪（机制与判据 = §2.2.8「落盘机制」） | 静态核对（`writeDiag` 在场、模块级声明）+ 机检（`findstr` 命中 captured 行） |

**取证面不回退（硬）**：`bigfish.log` 仍是后端 stdout/stderr 的落点，行格式与内容不变——B04 / B05 依赖的 `harness activate …` / `harness install phase=…` 行逐条在场；
壳侧写入该文件的行 = 既有启动横幅（`:189`）+ 本批新增 2 条（§2.2.8）。新增行计数与枚举同步登记于 §2.2.6 取证锚点清单的 B07 附注。

**边界（不做）**：不改日志文件名 / 落点 / 追加语义；不引入日志轮转 / 脱敏；不把 tee 拆为独立模块。

#### 2.2.10 完成探测机制（B07 C3 / US-11）

**结构（在途改动为基线 + 本批四个修正点 B/C/D/E）**：

```
startCompletionWatcher()
  ① fs.watch(getDshHome(), {recursive:true})   ← 主路径（Windows：OS 级递归监听）
       事件回调：路径过滤（谓词见下）→ 命中则 lastBusyAt = now; notifiedForCycle = false
       [B07 修正 C] 回调首行加开关守卫：!settings.get().notifyOnComplete ⇒ return（恢复旧语义）
       [B07 修正 D] watcher 常驻 error 监听：置 useWatch=false + 诊断行 ⇒ 回落路径接管
  ② 回落路径（触发形态见下「回落触发」）：每 5 s 触发一次 latestMtimeAsync（fs.promises，异步、不阻塞）
       首扫只建基线（lastSeenMtime === null ⇒ 不报 busy）；后续 mtime 前进 ⇒ 计忙；在途时跳过重叠触发
  ③ 5 s 定时器（纯算术，无 I/O）：busy 后静默 > IDLE_NOTIFY_MS(30 s) 且本轮未通知 ⇒ 通知一次
```

**回落触发（形态；评审修正轮 1 #6）**：回落**不由平台判定驱动**——① 建监听时 `fs.watch` 同步抛错经 `try/catch` 吞下（`shell-notify.js:109-118`；非 Windows 不支持 `recursive` 即走此路）② 运行期 `error` 事件（修正 D）⇒ `useWatch = false`。
本档全文 **零 `process.platform`**（as-of 2026-09-17 实测：`grep -n "platform" shell-notify.js` = 0 处）⇒ NFR-2 的「新增代码零平台分支」判据有确定值；**不引入平台判定，故无「有意分支」声明**（`docs/requirements/SHELL.md` §四 NFR-2 的度量口径不变）。

**busy 判定面（口径；B07 定稿——见 §2.5 C17 / §2.4 DD-22）**：

- 谓词 = **路径任一段落** ∈ `{profiles, node_modules}` ⇒ 忽略；其余写入 ⇒ 计忙。
- 实测依据（2026-09-17 三法复核）：`~/.dsh` 递归文件总量 **20,857** = `profiles/` 4 + `pnpm-store/` 20,849 + `storages/` 1 + 顶层 3；
  **目录名恰为 `node_modules` 者 3 处，全在 `profiles/**` 下**（`profiles/node_modules` / `profiles/web/node_modules` / `profiles/web/.dsh-module-fallback/node_modules`），`pnpm-store/` 下 **0 处**。
- ⇒ 在本机当前布局下，「任一段落」与「顶层段」**结果等价**（批次档 §1.6 #8）；本角色上轮所记「`pnpm-store/**` 下 2,302 个 `node_modules` 目录」经复核**无法复现**（见 §2.5 O8）。
- 本批取「任一段落」的理由 = **① 对旧实现逐字忠实**（旧 skip 语义 = 任意深度同名目录）+ **② watch 与回落两路共用单一谓词**——与等价性无关。主 agent 已采纳（批次档 §1.9 更正 ③④）。
- `filename` 为 null / 空（Windows 偶发）⇒ 计忙（保守方向：宁可推迟通知，不误报「完成」）。

**旧新语义对照（逐条）**：

| 面 | 旧实现（5 s 同步全树扫描） | 新实现 | 方向 |
|---|---|---|---|
| 主进程阻塞 | 每轮 ≈2 s（20,849 文件 `statSync`） | 无（事件推送 / 异步） | **有意改进** |
| busy 触发 | 扫描时点的「新写入宽限」：`t > lastBusyAt+2000 && now-t < 2000`——写入落在两扫之间且早于 2 s ⇒ **整轮漏检** | 事件到达即记账（无量化窗） | **有意改进**（漏检面消除；只多不少） |
| 跳过面 | 任意深度 skip `{profiles, node_modules}` 同名目录 | 同（任一段落谓词，修正 E 对齐） | 不回退 |
| 开关关闭 | 定时器早退 ⇒ 不计忙（`setNotify(false)` 同时清 `lastBusyAt`） | 定时器早退 + **回调也守卫**（修正 C） | 不回退（修正前有「重开即误报」缺口） |
| 首扫误报 | 无（旧实现无基线面） | 回落路径首扫只建基线 | 不回退 |
| 通知条件 | `lastBusyAt > 0 && 静默 > 30 s && !notifiedForCycle` | 同（逐字保留） | 不回退 |
| 清理 | `clearInterval` | `clearInterval` + `fsWatcher.close()`（在途已落） | 不回退 |

**修正点（本批新增，均以在途实现为基线）**：

| # | 修正 | 依据 | 判据 |
|---|---|---|---|
| B | 删除死代码 `latestMtime`（同步递归实现 + 其导出 + 相关 JSDoc 引用）；同步修订 §2.2.6 的 `shell-notify.js` 职责列 | 全仓 0 调用点；NFR-5 静态判据 = 探测域无 `*Sync(` 调用面（残留即示范） | `grep -n "Sync(" shell-notify.js` = 0 处（as-of 扫描见下） |
| C | watch 回调加 `notifyOnComplete` 守卫 | 现状回调不判开关 ⇒ 关闭期间活动照记忙 ⇒ 重新开启后第一次 5 s tick 即补发一条「任务完成」（旧实现不会） | TC-39（关闭 → 活动 → 重开 → 不补发） |
| D | watcher `error` ⇒ 切回落 + 诊断行 | 现状 `on('error')` 是空处理：监听死去后无人接管，通知静默失效且不可诊断 | 静态核对（`useWatch=false` + 日志）+ 真机 TC-41 |
| E | 过滤谓词统一为「任一段落」（watch 与回落同口径）——现状 watch 取顶层段（`shell-notify.js:111-112`）、回落取任一段落（`latestMtimeAsync` 的 `skipNames.has(e.name)`） | 见上「busy 判定面」；消除同一特性两套口径 | 静态核对（单一谓词被两路复用）+ `shell-notify.js:103` 头注释口径句同步（残留即示范） |

**修正 B 判据的 as-of 扫描（评审修正轮 1 #4；本轮亲跑）**：`findstr /n "Sync(" shell-notify.js` ⇒ 命中 **2 处**，均在待删死代码 `latestMtime` 内、**属本批退役面**——`:48` `fs.readdirSync(dir, { withFileTypes: true })` · `:59` `fs.statSync(full).mtimeMs`。
同档其余同步调用面 = **0 处**（`latestMtimeAsync` 全程 `fs.promises`；`fs.watch` 无同步面；全档 `Sync` 字符串亦仅此 2 处）；退役面另含实现 `:44-65` + 导出 `:159` + `:67-70` JSDoc 的「与同步版同样的递归语义」句。
⇒ 删除后该档 `*Sync(` **≡ 0**，AC12 / NFR-5 的机检判据可达；**未发现本批退役面之外的同步调用点**（若有，须停下回报、不得自行扩大退役范围）。

**诊断行（本批新增 1 条，console；条件发射）**：

```
[bigfish] completion watcher unavailable; falling back to async scan
```

**已知限制（本批不修，留档）**：

- **L-B07-1**：tee 不处理 `drain`（日志量小；极端刷屏时内存缓冲增长）。
- **L-B07-2**：回落路径（非 Windows）每 5 s 仍异步全树扫描（20,849 文件）——不阻塞，但持续 I/O；收窄面属语义变更，留待后续批次（O9）。
- **L-B07-3**：Windows 递归 watch 的 OS 缓冲溢出可致**漏事件**（方向 = 少记一次忙 = 可能少一次提醒）；本批不加兜底轮询（会重新引入 I/O），登记为观察项 O10。
- **L-B07-4**：`~/.dsh` 在监视器启动时不存在（全新安装）⇒ `fs.watch` 抛 ENOENT → 走回落；目录建成后不自愈（重启应用即自愈）。现状口径，登记备查。

#### 2.2.11 F6 遗留缺陷修复（B07 C4 / T12·US-7 补注）

**两处修正（`shell-mode.js`，行号为现状 as-of 2026-09-17）**：

| 位置 | 现状 | 修正后 | 影响 |
|---|---|---|---|
| `chooseBackground()` `:131` | `notifier.notify(APP_NAME, '背景已更换')`（在 `try` 内 ⇒ 异常被吞，只留 `[bigfish] 更换背景失败:` + ReferenceError） | `notify(APP_NAME, '背景已更换')` | 背景确实已换（拷贝 + 注入在 `:129-130` 已执行）——修正后通知恢复、假错误日志消失 |
| `resetBackground()` `:141` | `notifier.notify(APP_NAME, '已恢复默认背景')`（**不在 try 内** ⇒ 未捕获异常） | `notify(APP_NAME, '已恢复默认背景')` | 异常消失（主进程不再收到未捕获异常）；恢复动作本身已在 `:139-140` 执行 |

- 不加额外 `try/catch`：`notify` 自身已 try（`shell-notify.js:32-38`），修正后不再抛——最小改动面。
- 循环依赖核对：候选 2（`require('./shell-notify.js')`）也不成环（`shell-notify` 不依赖 `shell-mode`）；否决理由 = 与已声明注入面重复（§2.1 J）。

**同类未绑定命名空间引用全扫（机检判据）**：

- 方法：对 `main.js` + 全部 `shell-*.js`，剥离注释与字符串字面量后取所有「`IDENT.` 形式的使用」，与档内声明集（`require` 名 / `const|let|var` / 函数与类声明 / 形参 / 解构）比对；命中 = 未绑定。
- 期望：**0 处**（本批修正后）。
- 设计者本轮实扫结果（as-of 2026-09-17，修正前）：唯一命中 = `shell-mode.js` 的 `notifier`（`:131` / `:141`）——即 T12 两处；其余候选为扫描白名单缺口，已逐条核实。
- 白名单：JS / Node / Electron 全局（`process` / `console` / `Buffer` / `app` / `BrowserWindow` / `Notification` / `Atomics` …）+ 渲染层 `window` / `document` / `navigator`。

**边界（不做）**：不做全仓（非壳档）未绑定扫描的修复；不改托盘菜单结构；不改 `notify` 自身实现。

#### 2.2.12 完成提醒的判定面（B09 / US-12）

**问题（现状语义的缺口）**：触发条件 = `now - lastBusyAt > IDLE_NOTIFY_MS`（`shell-notify.js:132`），忙信号 = `~/.dsh` 下非 `profiles` / `node_modules` 的写入（`isIgnoredPath`）。
该信号与「回合是否结束」**无因果**：工具在用户工程目录里长跑（构建 / 安装 / 长命令）期间 `~/.dsh` 零写入，等待模型（首字延迟）期间同样零写入 ⇒ 静默窗口与「已完成」在现状判据下不可区分。

**设计者实测证据（2026-09-17；源 = 本机 `~/.dsh` 真实会话的事件日志——解帧后取事件时间戳，共 48 事件 / 4 回合 / 1 次工具调用）**：

| # | 实测 | 结论 |
|---|---|---|
| 1 | 单次 `tool/call → tool/result` 间隔 **21.9 s**，其间会话档与投影缓存**零写入** | 阈值降到 8 s 后，任务中途静默**必然**误报（= 批次档 §1.5 要求写死的误报边界；而 30 s 阈值下 30 s+ 的工具调用 / 构建同样会误报） |
| 2 | 同档回合内其余静默：1.3 / 1.5 / 1.8 / 3.8 / 4.7 s；回合外（等用户）10.5 / 11.7 / 25.9 s；回合内静默 >8 s 共 **1** 次 | 静默长度与「是否完成」无关；只有「回合已结束」的静默才是完成 |
| 3 | 写入形态 = **按事件批次落盘**（实测该档 19 个 zstd 帧 ↔ 19 个事件批次）；末次写入 = 回合末批（含 `turn/end`） | 「末次写入」在真完成时确实 ≈ 回合结束时刻 ⇒ 缩短阈值方向正确，但需一个**因果**的完成标记 |

**判定源（Harness 会话投影缓存；设计者亲读源码，as-of 2026-09-17）**：

| # | 事实 | 指针 |
|---|---|---|
| 1 | 域 `session_projcache`：`layout: 'per-record'` ⇒ **每会话一份文档** `<dshHome>/storages/session_projcache/sessions/<会话 ID>.json`（plain JSON，非压缩） | `@deepseek-ai/dsh-session-projection-cache/lib/index.js:89-101`（`layout: "per-record"`） |
| 2 | 文档形态 = `{ version: 7, record: { identity, rows } }`，行 = `{ ver, seq, val }`（`rows[key]`）——**行只会 stale、不会错**：`seq` 即它的水位 | 同上 `:61-64`（`checkpointRecord`）；实测样本（本机 0.1.5-rc.1） |
| 3 | `rows.turnBoundary.val = { openTurnStartSeq, lastStepStartSeq, lastStepBoundary, lastTurn }`；
**`openTurnStartSeq` 非 null ⇔ 回合在途**（`turn/start` 置为 seq、`turn/end` 置 null） | `@deepseek-ai/dsh-agent-loop/lib/index.js` 的 `turnBoundaryProjectionDefinition`：`key: "turnBoundary"` · `stateVersion: 2` · `init` 全 null · `apply` 的 `turn/start` / `turn/end` 两分支 |
| 4 | **写时机**：每个 `turn/end` ⇒ **立即无条件落盘**；其余事件按写后阈值（`writeEveryEvents` / `writeIntervalMs`）；会话创建 / 释放亦强制落盘 | 同上 projection-cache `:290-321`（`installWritePath`）+ `@deepseek-ai/dsh-base/cordis.patch.yml`（`writeEveryEvents: 200` / `writeIntervalMs: 5000`） |
| 5 | 落盘顺序：先 `sessions.flush`（会话日志）后写缓存记录 ⇒ 回合末「缓存记录 mtime ≥ 会话日志 mtime」；实测两档同秒（…03:38:34） | 同上 `:263-267`（`write()`：`await …flush(session)` → `put(…)`） |
| 6 | 同目录 family 已变过一次（0.1.0 → 0.1.5 改 per-record 布局），`shell-affinity.js:70` 的旧读面因此失效（技术待办 T14 / 批次 B10） | `docs/TODO.md` §技术组；`docs/README.md` §一（B10 立案） |

**判定前提（本设计承重前提；判决句）**：

> 阈值 `IDLE_NOTIFY_MS`（8 s）**必须大于**投影缓存的写后阈值 `writeIntervalMs`（实测 shipped composition = **5000 ms**）——由事实 #4 可推：任一事件后 ≤ 5000 ms 内必有缓存写入，而该写入自身又刷新 `lastBusyAt` ⇒ **静默达 8 s 时，快照必已折叠最近一次会话事件**。
> 该前提使「静默 + 快照回合态」可作完成判据；前提失效（配置被改 / 形态换代）⇒ 规则② 兜底（方向 = 抑制，安全侧）+ 实施期真机复核（TC-46）；登记为 **L-B09-4**。

**判定规则（本批定稿；四态）**：

> 静默达 `IDLE_NOTIFY_MS` 后，判定**一次性**执行（异步）：
> ① 取 `<dshHome>/sessions/**` 下 mtime 最大的会话日志 `L` 与 `<dshHome>/storages/session_projcache/sessions/*.json` 下 mtime 最大的记录 `C`；
> ② `C` 不存在 / 不可解析 / 无 `record.rows.turnBoundary` / `rows.turnBoundary.ver !== 2` ⇒ `unavailable`——**判定源不可用 ⇒ 降级**（阈值改用 `IDLE_NOTIFY_FALLBACK_MS` = 30 s，= 现状语义）；
> ③ `mtime(C) + FRESH_TOLERANCE_MS(1000) < mtime(L)` ⇒ `stale`——**快照落后于会话日志 ⇒ 本轮不提醒**（保守：宁可推迟，不误报）；
> ④ `rows.turnBoundary.val.openTurnStartSeq !== null` ⇒ `open`——**回合在途 ⇒ 不提醒**；
> ⑤ 否则 ⇒ `done`——**判为「已完成」⇒ 走既有通知语句（逐字保留）**。

**执行面（`shell-notify.js`）**：

- 判定仅在「静默 ≥ `IDLE_NOTIFY_MS` 且本轮未通知」时触发；结果按 **`lastBusyAt` 记忆**（`completionGateMemo.lastBusyAt !== lastBusyAt` 才重读）——任何新写入（含 `setLastBusyAt` 跨模块清零）自动失效重判 ⇒ **每个静默窗至多一次读**；
  5 s 定时器回调内仍**无同步 I/O**（判定是 `fs.promises` 异步，且由 `completionGateProbeRunning` 防重叠——与 `fallbackScanRunning` 同形）。
- 读次数上界 ≈ 2 次目录列表（`sessions/` 两层 + `projcache/sessions/`）+ 每会话 1 次 stat + 1 次记录 `readFile`（实测单档 7.8 KB）——**按会话数计，不按文件数计、不做目录递归遍历**（NFR-5 B09 注记）。
- 判定只可能**抑制**提醒，不新增提醒：`notifiedForCycle` / 开关守卫 / 清忙态三处既有语义**零改动**。

**降级与可观测性**：

- 降级 = 规则② 的 `unavailable` 分支：阈值改用 30 s（现状值）——保证「读不到判定源」时行为与现状**逐字一致**（零回退）。
- 诊断行（条件发射，**每监视器生命周期至多一条**，由 `completionGateDiagLogged` 把门）：

```
[bigfish] completion gate unavailable; falling back to idle threshold <ms>ms
```

- 发射面 = `console.log`（与 §2.2.10 的 `completion watcher unavailable …` 同行口径；**不新增 `bigfish.log` 壳侧写入面**）；读失败不抛出（判定函数全包 `try/catch` ⇒ 不新增失败面）。
- 实施期真机复核点（硬）：① 回合结束时缓存记录 **确实落盘**且 `openTurnStartSeq === null`；② 静默期中快照**不落后**于会话日志（规则③ 不误伤）；③ shipped composition 的 `writeIntervalMs` = 5000（前提）。任一不成立 ⇒ **停下报告**（改判定源或退回纯阈值——不在实施期自行放宽规则）。

**与既有语义的交互（逐条核对；AC19）**：

| 面 | 现状（B07 终态） | 本批 |
|---|---|---|
| 一个活动周期一次提醒 | `notifiedForCycle` 由任意写入复位 | **不变**（判定只抑制，不新增通知） |
| `notifyOnComplete=false` | 定时器早退 + watch 回调守卫（修正 C） | **不变**（关闭态下判定不执行） |
| 关闭期活动 ⇒ 重开不补发 | `setNotify(false)` 清 `lastBusyAt` / `notifiedForCycle`；重开需新写入 | **不变**（判定无法凭空产生通知：`lastBusyAt === 0` 时判定不触发） |
| 回落路径（非 Windows / `fs.watch` 抛错） | 异步扫描记忙 | **不变**（判定与 busy 记法无关：只读文件与 stat） |
| busy 判定面（任一段落谓词） | `isIgnoredPath` | **不变**（本批不碰） |
| 通知文案三串 | `Bigfish 任务已完成` / `后端已空闲，可以回来看看结果了` / 桌宠台词 `任务完成啦！` | **不变**（逐字） |

**阈值取值（判据；选型见 §2.1 K-1）**：`IDLE_NOTIFY_MS = 8 s = 写后阈值 5000 ms + 3000 ms 余量`：

- ① **必须大于** 5000 ms（判定前提，见上）；
- ② 余量 3000 ms 吸收写序抖动 / watch 事件到达延迟 / 判定的 stat+read 开销；
- ③ 有效时延 = 8–13 s（5 s 周期对齐）——现状 30–35 s 的 ≈1/3（用户诉求面）；
- ④ 静态可机检：常量关系 `IDLE_NOTIFY_MS`(8000) > 5000（§3.3 手段 11 ①）。

**对 B07 已核销判据的修订面（显式登记；原文一律不改）**：

- §2.2.10 结构块 ③ 的「静默 > `IDLE_NOTIFY_MS`(30 s)」与 §3.1 AC13 / §3.2 TC-38 · TC-39 中「静默 30 s」的**读数**由本批修订为 8 s + 回合闭合判定；**上述原文按批次硬约束保持不动**（B07 已核销判据行）——生效口径以本节为准。
- `docs/requirements/SHELL.md` US-11 的「阈值不改 / 空闲达阈值即通知」两处由 **US-12 显式修订**（US-11 原文同样不动；修订句见该档 US-12「契约修订」）。
- 修订面登记为 §2.5 C27 · C28 与观察项 O16（本批只登记，不在本批改写 B07 原文）。

**已知限制（本批不修，留档）**：

- **L-B09-1**：等待用户确认期间（审批 / ask-user / 计划模式）回合保持**在途** ⇒ 不再收到提醒（现状会在 30 s 后发一条语义错误的「已完成」）；是否增设「等待你的确认」提醒 = open 项 U-13（新文案，超本批范围）。
- **L-B09-2**：多会话并行（subagent）时判定取「最新日志 + 最新记录」对——两者若分属不同会话，规则③ / ④ 可致本轮不提醒（方向 = 推迟，不误报）；下个写入周期自然重判。
- **L-B09-3**：判定源为 Harness **内部形态**（域 v7 / 行 `ver` = 2）——换代即走 `unavailable` 降级（30 s + 诊断行），不误报；采信条件收在规则②。
- **L-B09-4**：判定前提失效（Harness 侧 `writeIntervalMs` ≥ 阈值，或外壳后续把阈值调 < 5000）⇒ 判定可能误报——缓解 = 规则③ 兜底（方向 = 抑制）+ 实施期复核点③ + 诊断行；本批以「阈值 8000 > 5000」的静态判据把门。

**边界（不做）**：不改 Harness（其落盘物**只读**）；不加用户面提示 / 新通知类型；不改 busy 判定面与回落机制；不新增依赖 / 文件 / 常驻日志；不新增提醒时刻的行内取证行（时延量化靠真机人工计时，见 §3.3）；不代 B10 修 `shell-affinity.js` 读面。

#### 2.2.13 好感度数据面读口（B10 / US-13）

**现状与缺口（设计者亲读，as-of 2026-09-17）**：`sumSessionTokens()`（`shell-affinity.js:68-83`）读 `<dshHome>/storages/session_projcache.json`，取 `j.tables.sessions[*].rows.tokenUsage.val.totals`；
活跃 Harness（0.1.5-rc.1）已改为 **per-record 目录布局** ⇒ `readFileSync` 抛错被 `catch { return null }`（`:82`）吞掉 ⇒ 好感度不因真实消耗增长（技术待办 T14；勘察 = 批次档 §1.3）。

**读面判据（四步；全机检）**：

> ① **目录面**：读 `<dshHome>/storages/session_projcache/sessions/`，枚举名字**以 `.json` 结尾**的条目（`.json.bak.<stamp>` 类天然排除——批次档 §1.3 ⑥）；逐档 `JSON.parse`，成功者计为**可解析记录**。
> ② **目录面可用判据 = 可解析记录数 ≥ 1** ⇒ **只读目录面**（不读旧文件），返回各记录 `record.rows.tokenUsage.val.totals` 的四桶之和（缺 `totals` 的记录按 0 贡献）。
> ③ **目录面不可用**（目录不存在 / `readdir` 抛错 / 可解析记录数 = 0）⇒ 读旧面 `<dshHome>/storages/session_projcache.json`，取 `tables.sessions[*].rows.tokenUsage.val.totals` 求和。
> ④ **旧面也不可用** ⇒ 返回 `null`（**不是 0**——`0` 会把水位降到 0，使此前已计入的消耗在读数回升时被重复计入）；全过程**不抛错**。

**累加判据句（计费口径 B；用户 2026-09-17 12:19 裁定）**：

> `sumSessionTokens()` 的返回值 = 对**生效读面**下**每一条可解析记录**计算
> `(uncachedInputTokens || 0) + (cacheReadTokens || 0) + (cacheWriteTokens || 0) + (outputTokens || 0)` 后求和；
> **只读 `totals`，不读 `last.buckets`**（后者 = 最近一个 step 的分桶，其数值**已包含在 `totals` 内** ⇒ 一并累加即双计）；四桶任一缺失按 0。

- 样本算例（批次档 §1.3 ⑤ 的活样本；设计者本轮亲读 `…/session_projcache/sessions/session-f80ce725-….json:48-68`）：
  `uncachedInputTokens 9666 + cacheReadTokens 37504 + cacheWriteTokens 0 + outputTokens 2434 = **49604**`。
- 口径依据：Harness 计费口径 = billed input = `uncached + cacheRead + cacheWrite`（批次档 §1.3 ⑦）；现状只累加 `uncachedInput + output`（`shell-affinity.js:78`）
  ⇒ 本机样本下现口径值 12100 vs 口径 B 值 49604（≈**4.1 倍**；`cacheRead` 单项占口径 B 的 75.6%）。

**失败语义与容错（逐条）**：

| 情形 | 期望行为 | 判据 |
|---|---|---|
| 单条记录损坏（半写 / 非法 JSON） | **跳过该条**，其余照常求和（不整面失效） | 夹具：1 坏 + 1 好 ⇒ 返回值 = 好条之和 |
| 目录下全部损坏 | 目录面不可用 ⇒ 走旧面 | 夹具 ⇒ 旧面值或 `null` |
| 目录不存在 / `readdir` 抛错（EACCES 等） | 走旧面；旧面也不可用 ⇒ `null` | 夹具 ⇒ `null`，不抛 |
| 两形态并存 | 目录面专读（防双计） | 夹具 ⇒ 返回值 ≠ 两形态之和 |
| `*.json.bak.<stamp>` / 非 `.json` 条目 | 不被枚举（后缀判据天然排除） | 夹具 ⇒ 返回值不受其影响 |
| `totals` 缺失（无 LLM 调用的会话） | 该记录贡献 0（仍计为可解析记录） | 夹具 ⇒ 返回值不受其影响 |
| 调谐：本机真实目录 | 返回值 = 独立复算值 | TC-57 |

**增量语义（水位；避免重启重复计入）**：

- `sumSessionTokens()` = **幂等水位**：不写盘、不持状态，同一磁盘状态重复调用返回同值。
- `affinity.usage` / `affinity.wallet`（`shell-affinity.js:47`）= **持久化的终身累计值**（落 `affinity.json`，只增不减）。
- 关系 = 水位差：`startAffinityWatcher()`（`:116-147`）在启动时把当前读数记为基线 `lastTokenSum`（`:125`），之后 `delta = s2 − lastTokenSum` 累加（`:129-139`）；
  **重启不重复计入**：`usage` 已持久化 + 基线每次启动重置 ⇒ 已计入的消耗不会被再次计入；仅当 `usage === 0`（首次使用 / `affinity.json` 缺失）时把整份水位一次性计入（`:120-124`，既有语义逐字保留）。
- 水位下降（会话记录被清理 / 备份跳过）⇒ 仅重置基线（`:140-141`，既有语义，**不扣**好感）；水位回升的重复计入面 = **L-B10-2**。
- 调用方语义零改动：`startAffinityWatcher` / `stopAffinityWatcher` / `affinityView` / `handleAffinity*` / 渲染面通道 `pet-affinity` 与常量 `EXCHANGE_RATE` / `AFFINITY_RATE` / `LEVEL_THRESHOLDS` / `FOODS` 逐字不变；
  **可兑换余额（`wallet`）与好感度同源**（同一 `delta`——见 U-14）。

**本批改动面（`shell-affinity.js`）**：

- `sumSessionTokens()`（`:68-83`）整体替换为双形态读面（上判据）；JSDoc（`:67`）与模块头注释（`:25-30` 的「uncachedInput + output」句）同步为口径 B + 双形态口径（**口径残留即示范**）。
- 新增档内常量与一次性诊断标记 `affinityDiagLogged`；新增导出 `sumSessionTokens`（`module.exports`，`:292-305`）——**导出面 +1**，用途 = 使 AC21–AC25 可经桩测机检（承 B09 §3.3 手段 11 ③ 先例；无副作用）。

**诊断行（本批新增 1 条；条件发射、每进程生命周期至多一条）**：

```
[bigfish] affinity token source unavailable; real-usage accumulation is off
```

- 条件：两形态均不可用（判据 ④ 分支）⇒ 经 `backend.writeDiag(line)` 发射（console + `bigfish.log` 双写，承 §2.2.8 落盘机制）；正常读数（任一面可用）⇒ **0 条**；
  配套 = `shell-backend.js` 的 `module.exports`（`:311-322`）增 `writeDiag` **1 行**（现状未导出——设计者亲读）。
- 依据：本 bug 的伤害来自**静默**（读失败无任何信号，长期无人察觉）⇒ 失败面须可诊断；复用 B07 已建立的单一诊断落盘面（`shell-backend.js:61-64`），不新造落盘路径、不改文件名 / 落点。
- 机检：`findstr /c:"affinity token source unavailable" bigfish.log`（两形态均不可用时 1 条；正常态 0 条）。

**读面开销（口径与再议触发）**：单次 tick = 1 次 `readdir` + N 次小档 `readFile`（N = 可解析记录数；本机实测 **1** 档 / 7827 B）；**不做目录递归**；
同步读与现状同口径（NFR-5 的「无 `*Sync(`」判据**只覆盖 `shell-notify.js`**——口径界定见 §2.5 C32）。再议触发（本批不做，登记 **L-B10-1**）：记录数 > 100 或单次读量 > 5 MB ⇒ 另批评估异步化 / 增量读。

**已知限制（本批不修，留档）**：

- **L-B10-1**：同步读的量级随会话记录数增长（10 s 一次全量读）；触发条件与再议路径见上条。
- **L-B10-2**：水位**回升**（会话记录被备份回滚 / 由会话日志重建后 `totals` 重新出现）⇒ 该段消耗可能被重复计入——现状逻辑不区分「回升」与「新消耗」（`:128-141` 既有语义未变）；
  触发 = 实际偏差被观察到 ⇒ 另批做「按会话 ID 记账」。
- **L-B10-3**：`null` 与 `0` 的区分是本设计的安全前提（判据 ④）；若后续实现改成「读不到即 0」，L-B10-2 的重复计入面会被显著放大——判据须保持。

**边界（不做）**：不改 Harness（`~/.dsh` / `dsh-bundle/` / 更新副本**只读**）；不改喂食 / 兑换 / 好感度 UI 与既有常量；不改 10 s 周期与广播节奏；
不新增依赖 / 不新增源文件；不做目录递归；不按 workspace / 会话过滤；不做异步化改造；不代 B08 改 bundle 版本；不代 B09 改判定面（§2.2.12 与本条是同一目录 family 的两条**独立**读面）。

#### 2.2.14 插件市场安全与扫描契约（B12 / US-14·US-15）

**现状与缺口（设计者亲读，as-of 2026-09-17；行号为现行值）**：

| # | 面 | 事实（file:line） | 后果 |
|---|---|---|---|
| 1 | 内置安装 / 卸载面 | `shell-plugins.js:312-319` / `:358-362`：入参 `spec` / `pkgName` 零校验 → `path.join(bundledPluginsDir(), name)` 归一化 `..` → `fs.rmSync(target,{recursive,force})` + `fs.cpSync(…)` | `target` 可归一化至 `<DSH_HOME>`（含 `sessions/` 与 `.credentials.yaml`）⇒ 递归删用户凭据与会话 |
| 2 | 可达链 | `shell-ipc.js:25-26`（`market:install` / `market:uninstall`）← `market-preload.js:7-8` ← 渲染层条目按钮，`spec` 源 = 第三方注册表（实测 **3727** 项） | 远端字段决定本地路径 ⇒ 一次点击即触达 #1 |
| 3 | 弹窗注入面 | `market.js:286-290`（`body.innerHTML = html`）+ 调用点 `:296-302` / `:326-330` / `:354-358`（插值 `${p.name}` / `${name}`，源 = 注册表字段） | 任意标记注入（该渲染进程持有 `marketAPI` ⇒ 与 #2 同一信任面） |
| 4 | 主线程阻塞 | `shell-plugins.js:152-177` 循环体内**逐项**调 `resolveInstalledName`（`:109-123` → `:111` 的 `listInstalledPlugins()`：`readdirSync` + 逐项 `statSync`）与 `isPluginInProfile`（`:201-208` → `:52` 同步读 + `JSON.parse`） | N=3727 ⇒ 每次 `market:list` / `state` ≈3.7k 轮同步 fs（主线程） |
| 5 | 同档既有防线 | `isPlainPackageName()`（`:99-106`）已被 `addBundle`（`:78`）/ `resolveInstalledName` 兜底（`:122`）/ `sanitizeProfileBundles`（`:189`）/ `market:enable`（`shell-market.js:129`）使用——#1 的两处是**唯一漏用点** | 修复面 = 复用既有判据，不新造机制 |

**入参门判据句（主防线；US-14 契约第一层）**：

> `installPlugin(spec)` 与 `uninstallPlugin(spec)` 的入参只允许三种形态，**其它一律 `{ ok:false, message }` 且不触文件系统、不起子进程**：
> ① **内置形态** `builtin:<纯包名>` 或**裸** `<纯包名>`；② **GitHub 形态** `github:<owner>/<repo>[#<片段>]`（`owner` / `repo` 匹配 `[A-Za-z0-9._-]+`；`片段` 匹配 `[A-Za-z0-9._:@/-]+` 且不含 `..` 段）；
> ③ **npm 形态** `[<scope>/]<纯包名>[@<版本>]`（版本 / 标签 / 范围匹配 `[A-Za-z0-9-._+~^*<>=|]+`）。
> 其中「纯包名」的判据 = **既有** `isPlainPackageName()`（`:99-106`，逐字复用：`@scope/name` 放行；`..` / `/abs` / 盘符 / 反斜杠 / `github:` / `git+` / `link:` / `file:` 一律拒）。

- 实现面 = 新增纯函数 `installSpecKind(spec)`（返回 `'bundled' | 'github' | 'npm' | null`），`installPlugin` / `uninstallPlugin` 的**第一行**调用它；`null` ⇒ 早退拒绝。**内置分支的进入条件 = `kind === 'bundled'`**（名字段判别——`github:` / `name@ver` 形态不进内置面，与改前的 `existsSync` 结果面实测等价：`bundled-plugins/` 目录名全为纯包名，现仅含 `README.txt`）。
- **零误拒实测（设计者本轮亲跑，2026-09-17）**：把注册表 3727 项按两条既有推导链（`normalizePlugin` `market.js:95-107` / `pluginUpdateSpecOf` `shell-plugins.js:130-141`）展开，得 **3725** 个不同的安装标识形态 ⇒ 对拟议白名单判定 **误拒 0**；
  其中含 1832 个 `github:`（139 个为 `github:…#path:/…` 子目录形态）、491 个 scoped；注册表 `npm` 字段非纯包名的条目 = **0**；`version` 字段形态异常 = **0**。
- 攻击形态判定（同一次实测）：`../../..` / `builtin:../../..` / `..\..\..` / `/abs/path` / `C:\Windows` / `@scope/..` / `..` / `a/../../b` / `\\srv\share` / `file:/etc/passwd` / `link:../x` / `git+https://x/y` / `builtin:/abs` / `a\b` ⇒ **全部拒**。

**越界校验判据句（纵深防御；US-14 契约第二层）**：

> 两处 `path.join` **之后**各做一次包含判定——① `target = path.join(profileDir(),'node_modules', name)` 必须**严格落在** `path.join(profileDir(),'node_modules')` 之下；② `bundledSource = path.join(bundledPluginsDir(), name)` 必须**严格落在** `bundledPluginsDir()` 之下。
> 判据 = `isInsideDir(child, base)`：`const rel = path.relative(path.resolve(base), path.resolve(child)); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);`（`rel === ''` = 基准自身 ⇒ **不算通过**）。
> 不满足 ⇒ 与入参门同形拒绝（`{ ok:false, message }`），**且在 `fs.existsSync` / `rmSync` / `cpSync` / `mkdirSync` 之前返回**。
> **判定为词法归一化（`path.relative`），不 `realpath`**：pnpm 的 `node_modules` 是链接布局（本机 `~/.dsh/profiles/web/node_modules` 顶层 4 条目含 `.pnpm` / `.modules.yaml` 元数据）
> ⇒ `realpath` 会把合法的 store 链接判成越界（误拒合法安装），且路径不存在时 `realpathSync` 抛错（新增失败面）；威胁源 = 远端注册表字符串（无法在本地创建链接）⇒ 符号链接不在本条威胁面内（登记 **L-B12-1**）。

**两层关系（为何保留第二层）**：白名单 ⇒ 包含性是**蕴含**关系（纯包名不含分隔符与归一化件 ⇒ `path.join` 结果必在基准之下）⇒ 当前形态下第二层**不会**成为决定层。保留理由 = **判据独立性**：白名单判「形态」、包含判定判「位置」；形态演进（新增前缀 / 放新字符集 / 新增拼接点）时位置判据仍守得住——本 bug 的后果等级（递归删除用户凭据）不值得只挂一层。可机检面 = 函数级（`isInsideDir` 真值表）+ 调用点在场（`installPlugin` / `uninstallPlugin` 各 1 处）。

**拒绝消息形态（US-14 契约第四层）**：

> `{ ok:false, message: '无效的插件标识：<入参前 60 字符>' }`（越界校验命中 ⇒ `'插件标识越界，已拒绝：<入参前 60 字符>'`）。
> **消息内不出现任何绝对路径**——不拼 `profileDir()` / `dshHome()` / `bundledPluginsDir()` 的解析值（渲染层会把 `res.message` 原样显示在 toast 上；含路径的消息会把用户主目录暴露给持有 `marketAPI` 的渲染进程）。判据 = 桩测正则：message 不含盘符形态 `[A-Za-z]:[/\\]`、不含三个基准目录的取值子串。

**弹窗文本化判据句（US-14 契约第三层）**：

> 市场页（`market.js`）**全文 `innerHTML` 出现 0 处**；弹窗正文由 DOM 节点构造——`confirmModal(title, okLabel, ...parts)` 把 `parts` 收进 `frag(...)`（字符串 → `document.createTextNode`；节点 → 原样），`showModal` 清空正文改用 `textContent = ''`；
> `el(tag, cls, ...parts)` 改为**变参**：单个字符串实参 ⇒ `textContent = it`（既有 **27** 处调用点语义逐字不变——设计者逐处核对：第三实参全为字符串字面量或恒为字符串的表达式），多参 ⇒ 逐项 `appendChild`（字符串走文本节点）。

- 「外部数据 vs 常量」判据（本批 scan 结论）：**外部数据 = 来源不在本仓源码内的字符串**（第三方注册表字段、IPC 载荷、Harness 落盘物、用户文件）；**常量 = 本仓源码里写死的字面量**（含主进程常量表的字段）。据此逐面裁定：

| 面 | 插值源 | 判定 | 处置 |
|---|---|---|---|
| `market.js:296-302` / `:326-330` / `:354-358` | `${p.name}` / `${name}`（`p` = 注册表条目；`name` = `pkgBase(installSpec)`） | **外部**（注册表） | **本批修**（结构面，见上） |
| `market.js:52-57` / `:207` / `:228-275`（`el()` 面） | 同上 | 外部，但**出口已是 `textContent`** | 不改（现状即安全） |
| `exchange.js:39-46`（`row.innerHTML` 的 `${f.emoji}` / `${f.name}` / `${f.msg}` / `${f.price}` / `${f.id}` / `${owned}`） | `f` = `shell-affinity.js:34-38` 的 `FOODS` **字面量常量**；`owned` = 本地持久化数字 | **常量 / 本地数字** | **不改**（判据：`FOODS` 在本仓源码内写死，第三方不可达；`owned` 为 `Number`） |
| `market.html:5` 的 CSP | 静态配置（非插值） | 常量 | 不改；作为执行面的既有缓解记录（见「事实注记」） |

- **事实注记（US-14 ② 的执行面——未实机实测）**：`market.html:5` 已设 CSP（`default-src 'self' data:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:`）。
  按 CSP 规范，`script-src` 回退 `default-src 'self'` 且无 `unsafe-inline` ⇒ **内联事件处理器属性与 `javascript:` URL 应被阻断**（规范推断，**未实机实测**——AC28 的真机人工项覆盖）。本批判据不依赖该结论：**注入面本身成立**（任意标记注入 ⇒ UI 欺骗 / 伪造按钮），修的是注入面。

**扫描契约（US-15）**：

> `market:list` / `market:state` 每次调用做 **1 次** `node_modules` 顶层扫描（`readdirSync` + 每顶层条目 1 次 `statSync`）+ **1 次** profile manifest 读；**与注册表条目数 N 无关**（N=2 与 N=3727 的文件系统调用计数相等）；同一已装状态下 `computePluginUpdates` 的逐项判定与改前逐字一致。

- 实现面：`scanProfile()` 单次扫描得快照 `{ names, nameSet, bundles, entries, versions }`；`listInstalledPlugins(ctx)` / `listDisabledPlugins(ctx)` / `computePluginUpdates(plugins, ctx)` / `resolveInstalledName(spec, ctx)` / `isPluginInProfile(name, ctx)` / `installedPluginVersion(name, ctx)` 均接受**可选** `ctx`；
  **缺省（未传 `ctx`）⇒ 内部自建一次快照** ⇒ `sanitizeProfileBundles`（`:183-200`）与 `shell-market.js` 的 `marketUninstall` / `marketDisable` / `marketEnable` 三个既有调用点**零改动、零语义变化**；`marketList()` / `marketState()`（`shell-market.js:80-102`）各建**一次**快照并下传给三个消费面（installed / disabled / updates）。
- **等价性论证（判定零回退的判据）**：
  - `names` = 旧 `listInstalledPlugins()`（`:210-229`）的逐条等价（同一 `readdir` + `stat` 逻辑，仅执行一次；元素集合与排序逐字相同）⇒ `resolveInstalledName` 的候选面不变。
  - `isPluginInProfile(name)`：旧 = `profileBundles().includes(name) || fs.existsSync(join(nm, name))`；新 = `ctx.bundles.has(name) || ctx.entries.has(name)`。
  - **等价依据**：`ctx.entries` = `node_modules` 顶层**全部**条目名（含点目录与文件、不 `stat` 过滤）∪ 每个 `@` 前缀目录的一层子项（`@scope/x`）——即 `existsSync(nm/<name>)` 的判定面；
    而 `<name>` 的取值面 = `resolveInstalledName` 的三条返回路径（候选名 / 候选内匹配名 / 无分隔符的兜底名）⇒ **深度 ≤ 2** ⇒ 逐条等价（`entries` 含文件条目是刻意的：`existsSync` 对文件与目录同判真，而 `names` 只收目录）。
  - `installedPluginVersion`（`:144-149`）的逐项读经 `ctx.versions`（`Map`）记忆 ⇒ 同一 `realName` 只读一次；读面同上（读不到 ⇒ `''`）。
- **不引入跨请求缓存**：快照生命周期 = 单次 IPC 调用，无失效面（同一请求内多次读本就应看到同一份磁盘状态）。**有意变更**：同一请求内由「重复读」变为「一致快照」——并发写窗口内的结果由「可能撕裂」变为「一致」（见行为差异表）。
- **取证锚点不回退**：`plugin update spec=… result=… detail=…` 行（`shell-plugins.js:164` / `shell-market.js:150` / `:156` / `:159` / `:170`）的**发射条件、顺序与条数逐字不变**（判定条件未改、迭代序未改）⇒ 判据 = 桩测下 `updaterLog` 行序列与改前黄金样本逐字相等。

**行为差异表（有意变更，逐条）**：

| 情形 | 改前 | 改后 | 依据 |
|---|---|---|---|
| `installPlugin('../../..')` / `uninstallPlugin('../../..')` | 递归删 / 拷（可达 `<DSH_HOME>`） | `{ ok:false, message:'无效的插件标识：…' }`，零 fs 改动 | US-14（本批目标） |
| `installPlugin('<合法名>')` / `'<名>@<版本>'` / `'@scope/name'` / `'github:owner/repo#path:/x'` | 走内置面或 pnpm 面 | **同**（3725 形态零误拒实测） | US-14 P2 |
| `uninstallPlugin('<未安装的 github: 标识>')`（`resolveInstalledName` 解析失败后的剩余面） | 走 `pnpm remove <github:…>`（多为 not-found 后清 bundles） | `{ ok:false, message:'无效的插件标识：…' }`——该形态不在白名单内 | 有意收紧：卸载面的合法输入 = 已装真实包名（纯包名）；「解析失败」时本就不存在可卸载对象（渲染层按钮亦不出现——`market.js:164-175`） |
| 同一 IPC 请求内 profile 被并发修改 | 各次读取可能看到不同状态（撕裂） | 快照一致（一次读） | US-15（单次扫描的自然结果） |
| 拒绝消息文本 | 无（原路径无拒绝分支） | 新增两类拒绝消息（不含绝对路径；走既有失败 toast 渲染面） | US-14 契约第四层（无新用户面文案） |

**改动面清单（本批；行号为 as-of 2026-09-17）**：

| 文件 | 改动点 | 说明 |
|---|---|---|
| `shell-plugins.js` | 新增 `installSpecKind()` / `isInsideDir()` / `scanProfile()`；六个既有函数增可选 `ctx`（清单见注 S8）；`installPlugin`（`:311-322`）/ `uninstallPlugin`（`:358-365`）加入参门 + 越界校验；导出面 +3 | 判定语义零变更（等价性论证见上） |
| `shell-market.js` | `marketList`（`:80-91`）/ `marketState`（`:95-102`）改为建一次快照并下传 | 零契约变更（返回字段不变） |
| `market.js` | `el()`（`:43-48`）改变参 + 新增 `frag()` 与段落 helper；`confirmModal`（`:286-290`）改收节点；三处调用点（`:296-302` / `:326-330` / `:354-358`）改节点构造；`body.innerHTML` 清空三处（`:76` / `:203` / `:219`）改 `textContent = ''` | `innerHTML` 归零；外观 / 文案逐字不变；**行数 ≤ 500 硬限**（`market-update.js:4` 已记录该上限） |
| `tests/b12-plugin-guards.test.js`（新） | 三层夹具：守卫面（穿越枚举 + 形态正负例）/ XSS 面（`vm` + 极简 DOM 桩）/ 扫描面（计数器 + 黄金样本对照） | 开发期工具（§3.3 手段 13；`package.json` / `build.files` 零改动） |

> 注 S8 的六个函数 = `resolveInstalledName`（`:109-123`）/ `isPluginInProfile`（`:201-208`）/ `listInstalledPlugins`（`:210-229`）/ `listDisabledPlugins`（`:232-257`）/ `installedPluginVersion`（`:144-149`）/ `computePluginUpdates`（`:152-177`）。

**已知限制（本批不修，留档）**：

- **L-B12-1**：越界校验为词法判定、不含 `realpath` ⇒ 若 `node_modules/<name>` 被替换为**本地符号链接**（需本机写权限，不在本 bug 威胁面），删除面可经链接指向外部；触发条件 = 实际观察到链接逃逸 ⇒ 另批评估「链接感知」收口面（须同时处理 pnpm 合法链接）。
- **L-B12-2**：注入面消除后，市场页仍是**展示第三方内容**的窗口；本批不做「URL 宿主白名单 / 链接协议守卫 / 图片源限制」（超批次边界）——登记 **O20**。
- **L-B12-3**：`scanProfile` 快照在同一请求内是一致视图；若未来引入「安装后不重启即刷新」的流程，需重评快照时点（当前消费面 = 一次 IPC 一次快照，无跨调用复用）。

**边界（不做）**：不改 IPC 通道名 / 参数契约 / 返回字段；不改注册表来源与回退链；不改更新判定语义（入选条件 / 版本比较 / `github:` 重装口径 / 日志行）；不做签名校验、宿主白名单、`will-navigate` / `setWindowOpenHandler` 守卫；不引新依赖、不新增构建步骤；不改 `market.html`（含其 CSP 与文案）。

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

> 行数口径 = **换行符计数**（LF / CRLF 皆按 1 计；`find /c /v ""` 会少计末尾空行，本档以换行符计数为准）；`main.js` 2831 / `package.json` 116 = **B06 立案实测（as-of 2026-09-16）**——与 `docs/design/AUTO-UPDATE.md` §2.3 所记 2827 / 113 的差异源 = 测量时点不同 + B03 会话在途未提交改动（§2.5 C1；评审修正轮 1 #9）；代码文件「末行数」为实施前预估（**实施起点（B03 错开后）须重测并回填批次档 §5**）；文档行按落档实测。

**B07 受影响文件（as-of 2026-09-17；行数口径 = 换行符计数，见 §2.3 行数口径注；行号与行数为设计者亲测）**：

| 文件 | 当前行数 | 改动点（现状行号） | 预计改动量 | 末行数（预估） |
|---|---|---|---|---|
| `shell-backend.js` | 274 | §2.2.8：捕获锁定 + **晚命中回收（DD-28）** + 回落取证行 + `reason` 分类 + env 宽限覆盖；§2.2.9：A1 `StringDecoder` / A2 降级 try / A3 常驻 `error` 监听 / **A5** `logStream` 提升模块级（`:179` → 模块级、近 `:41`）+ `writeDiag()` 双写 helper + `reason` 追踪（DD-27） | +约 34 / −约 6 | ≈302 → **322**（实施期实测，+20；越 300 软档） |
| `shell-notify.js` | 165 | §2.2.10：修正 B（删 `latestMtime` 同步实现 + 导出 + 头注释）/ C（开关守卫）/ D（`error` ⇒ 回落 + 诊断行）/ E（谓词统一） | +约 12 / −约 26 | ≈151 → **163**（实施期实测，+12） |
| `shell-mode.js` | 151 | §2.2.11：`:131` / `:141` `notifier.notify` → `notify`（两处标识符修正） | ±0 | **151**（实施期实测，与预估一致） |
| `shell-window.js` | 109 | **不改**（`:65` 现状即 `loadURL(backend.browserUrl())`——本批目标形态已就位） | 0 | 109 |
| `main.js` | 204 | **不改**（`notify` 注入已就位，`main.js:67`；env 读取在 `shell-backend.js`） | 0 | 204 |
| `package.json` | 128 | **不改**（本批零新增文件 ⇒ `build.files` 不动；`dependencies` 零 diff） | 0 | 128 |
| `已知问题与排查.md` | 145 | **不改**（他在途已落「问题 4」用户文档段；内容与本设计一致——核对于 §2.5 C24） | 0 | 145 |
| `docs/requirements/SHELL.md` | 144 | 本批追加 US-9…US-11 / NFR-5 / US-7 补注 / NFR-2·3 注记 / 范围 / 变更记录；修正轮 1：US-9 契约补「晚命中自动跟进」句 | +55 / −3（实测） | **196**（落档实测） |
| `docs/design/SHELL-UX.md` | 625 | 本档修订：§一 回指表 / §2.1 G–J / §2.2.8–2.2.11（修正轮 1：晚命中回收 / 回落触发 / B 判据扫描）/ §2.3 B07 表 / §2.4 DD-17…DD-28 / §2.5 C17–C26·L·O / §2.6 U-11·U-12 与追认清单 / §3.1 AC9–AC16 / §3.2 TC-27–TC-45 / §3.3 / 变更记录 | +351 / −4（实测） | **972**（落档实测） |
| `docs/design/AUTO-UPDATE.md` | 854 | §3.1 AC7 / TC-14 两行加 B06 口径注 + 变更记录 1 行（T13 ①） | +4 / −3（实测） | **855**（落档实测） |

> B07 口径：代码文件「末行数」列 = 实施前预估 → **实施期实测回填**（源 = `docs/batches/B07-harness-auth-compat.md` §5）；文档行按落档实测；行数列 as-of 2026-09-17。
> 本批**零新增文件**——与 B06 的 15 模块新增不同，故 `package.json` 的 `build.files` 与 `dependencies` 均不动（NFR-3）。
> **delta 口径统一（评审修正轮 1 #1）**：`shell-backend.js` 行原记 +约 22 / −约 6（未含 A5 展开项），批次档 §2.3 记 +约 30 / −约 6——本表统一为 **+约 34 / −约 6 → 实施期实测 322（预估 ≈302）**（含 A5 与 DD-28 晚命中回收）。**口径以本表为准**（批次档 §2 为 append-only——生效口径注记落批次档 §2.8）；该档 **>300 软档 体量裁定**见下条。
> **单函数体量核对（评审修正轮 1 #7）**：三档改动均为函数内小改——最长函数 = `shell-backend.js:165` `startDsh`（48 行，本批加宽限检查 + A5 落盘 ⇒ 实施期实测 **63** 行）· `shell-notify.js:105` `startCompletionWatcher`（36 行，修正 C/D ⇒ 实施期实测 **43** 行）· `shell-mode.js:39` `applyBackground`（41 行，本批不改）——均 **<<300**，无 >300 函数面，无需拆分裁定。
> **>300 软档 体量裁定（`shell-backend.js` 预估 ≈302 → **实测 322**；评审修正轮 1 #1 补正）**：① 事实 = 越 300 软档但 **< 400 消解线**（未触 NFR-3 的 500 硬限）；② 理由 = 本批为**纯增量**（捕获锁定 / 晚命中回收 / 取证行与 `reason` 分类 / A5 双写——无新职责、无新文件、无新依赖），单函数最长 63 行（见上条核对）；③ 消解路径 = **保持单文件、不拆分**——后续再有增量使该档**逼近 400**、或新增独立职责（新增导出面 / 新增落盘机制）时，另批做拆分复核。

**B07 明确不触碰（在 B06 不改清单之外新增）**：`bundled-skills/**`（本批硬约束：只读）/ `docs/TODO.md`（台账归主 agent）/ `docs/README.md`（收口面属主 agent——T13 ②）/ B06 §1.9 与 §6（不代写他人段落——C5）。

**B09 受影响文件（as-of 2026-09-17；行数口径 = 换行符计数，见 §2.3 行数口径注；行数为设计者亲测）**：

| 文件 | 当前行数 | 改动点（现状行号） | 预计改动量 | 末行数（预估） |
|---|---|---|---|---|
| `shell-notify.js` | 163 | §2.2.12：新增 `completionGate()` + 三份状态/常量（`:13-24` 注入面与状态区）；tick 内插入判定分支（`:132` 条件处改为「短阈值 + 判定」两步）；头注释（`:86-96`）补判定面口径 | +约 70 / −约 6 | ≈227 → **实施期实测回填** |
| `main.js` | 204 | §2.2.12：`:49` 阈值 30 s → 8 s + 新增 `IDLE_NOTIFY_FALLBACK_MS`(30 s) + env 解析 `idleNotifyMs()`（承 `shell-backend.js:66-74` 形）；`:61` 注入面 +1 键 | +约 12 / −约 2 | ≈214 → **实施期实测回填** |
| `docs/requirements/SHELL.md` | 196 | 本批追加 US-12 / NFR-5 B09 注记 / §二 范围 / 头部关联指针 / 变更记录 2 行 | +21 / −0（实测） | **217**（落档实测） |
| `docs/design/SHELL-UX.md` | 972 | 本档修订：§一 回指表 +2 行 / §2.1 选型 K / §2.2.12 / §2.2.6 注 S6 + 锚点 B09 附注 / §2.3 B09 表 / §2.4 DD-29…DD-33 / §2.5 C27…C31 + O15·O16 + L-B09 指针 / §2.6 U-13 与 B09 追认块 / §3.1 AC17–AC20 / §3.2 TC-46–TC-55 / §3.3 手段 11 / 变更记录 | +193 / −0（实测） | **1165**（落档实测） |

> 本批**零新增文件**（桩测手段若采用须经主 agent 裁定——§3.3 手段 11 ③ 已标注）：`package.json` 的 `build.files` 与 `dependencies` 均不动（P3）。
> 不触碰（明确）：`shell-tray.js`（175 行，`setNotify` 面不变）/ `shell-settings.js`（60，`notifyOnComplete` 默认值不变）/ `shell-affinity.js`（305，其读面失效 = 技术待办 T14，归 **B10**）/ 其余 `shell-*.js` / `docs/TODO.md` 与 `docs/README.md`（主 agent 写域）。
> 单函数体量核对：`completionGate()` 预估 ≈40 行、`startCompletionWatcher()` 163 → ≈178 行——均 **<<300**，无 >300 函数面，无需拆分裁定（NFR-3 的 500 行硬限亦无影响）。

**B10 受影响文件（as-of 2026-09-17；行数口径 = 换行符计数，见 §2.3 行数口径注；行数为设计者亲测）**：

| 文件 | 当前行数 | 改动点（现状行号） | 预计改动量 | 末行数（预估） |
|---|---|---|---|---|
| `shell-affinity.js` | 305 | §2.2.13：`sumSessionTokens()` 重写（`:68-83`）+ JSDoc / 头注释口径句（`:25-30` / `:67`）+ 档内常量与诊断标记 + 导出面 +1（`:292-305`） | +约 60 / −约 14 | ≈351 → **实施期实测回填** |
| `shell-backend.js` | 322 | §2.2.13：`module.exports` 增 `writeDiag`（`:311-322`，1 行——函数体不动） | +1 / −0 | 323 |
| `docs/requirements/SHELL.md` | 217 | 本批追加 US-13 / §一 B10 批次目标 / §二 B10 条目与层级注 / 头部关联批次与条目区间 / 变更记录 2 行 | +33 / −0（实测） | **250**（落档实测） |
| `docs/design/SHELL-UX.md` | **1282** | 本档修订：§一 回指 +1 行 / §2.1 选型 L / §2.2.13 / §2.2.6 注 S7 + B10 附注 / §2.3 B10 表 / §2.4 DD-34…DD-40 / §2.5 C32–C35 + O17–O19 + L-B10 指针 / §2.6 U-14 与 B10 追认块 / §3.1 AC21–AC25 / §3.2 TC-56–TC-67 / §3.3 手段 12 / 变更记录 | +约 170 / −0（估算；口径见下注） | **1349**（落档实测） |

> **行数口径注（B10）**：`docs/design/SHELL-UX.md` 的「当前行数」= **1282**（本批前段落笔后、后续段落落笔前的实测值）；本批自有增量（估算，含本批全部段落）= **+约 170 / −0**（其中可分离面 = **1282 → 1349（+67）**，前段增量已含在 1282 内）；总增量 1165 → **1349** = **+184**（含 **B09 同档在途**改动——本档为两批并行写入，两批增量不可逐行分离）。行宽判据（不含行尾 CR）实测 **0** 行超 300（改后最宽 300——B06 旧行）。

> 本批**零新增文件**（桩测脚本若采用须经主 agent 裁定——§3.3 手段 12 ③ 已标注）：`package.json` 的 `build.files` 与 `dependencies` 均不动（P3）。
> 不触碰（明确）：`shell-notify.js`（B09 判定面——同一目录 family 的另一条读面，本批只引用不改）/ `shell-tray.js` / `shell-settings.js` / `main.js`（`startAffinityWatcher` 的调用与注入面不变）/ 其余 `shell-*.js` / `docs/TODO.md` 与 `docs/README.md`（主 agent 写域）。

**B12 受影响文件（as-of 2026-09-17；行数口径 = 换行符计数，见 §2.3 行数口径注；行数为设计者亲测）**：

| 文件 | 当前行数 | 改动点（现状行号） | 预计改动量 | 末行数（预估） |
|---|---|---|---|---|
| `shell-plugins.js` | 396 | §2.2.14：新增三 helper（`installSpecKind` / `isInsideDir` / `scanProfile`）；六个既有函数增可选 `ctx`；两处入口加门 + 越界校验；`module.exports` +3 | +约 95 / −约 30 | ≈461 → **实施期实测回填**（<500 硬限） |
| `shell-market.js` | 196 | §2.2.14：`marketList` / `marketState` 各建一次快照并下传 | +约 6 / −约 4 | ≈198 |
| `market.js` | **500** | §2.2.14：`el()` 变参（+2）/ 新增 `frag()`（+6）与段落 helper（+1）/ `confirmModal` 改收节点（±0）/ 三处调用点（−9）/ 三处清空改 `textContent = ''`（±0） | 净 **≤ 0**（−4 … +4） | **≤ 500**（**硬限**——NFR-3；实施后实测回填） |
| `tests/b12-plugin-guards.test.js` | 0（新） | §3.3 手段 13 / §3.2 TC-68…TC-85 | +约 260 | ≈260（**不入** `build.files`） |
| `docs/requirements/SHELL.md` | 250 | 本批追加 US-14 / US-15 / NFR-6 / NFR-7 / B12 批次目标与层级注 / 头部关联与条目区间 / 变更记录 2 行 | **+49 / −0**（落档实测） | **299**（落档实测） |
| `docs/design/SHELL-UX.md` | 1349 | 本档修订：§一 回指 +3 行 / §2.1 选型 M（M-1…M-5）/ §2.2.14 / §2.2.6 注 S8 + 锚点 B12 附注 / §2.3 B12 表 / §2.4 DD-41…DD-47 / §2.5 C36–C39 + O20–O23 + L-B12 指针 / §2.6 U-15 与 B12 追认块 / §3.1 AC26–AC31 / §3.2 TC-68–TC-86 / §3.3 手段 13 / 变更记录 | **+252 / −0**（落档实测） | **1601**（落档实测） |

> 本批**新增 1 个文件**（`tests/b12-plugin-guards.test.js`）：`package.json` 的 `dependencies` 与 `build.files` **零 diff**（测试不入包）；`market.html` / `market-preload.js` / `market-update.js` / `exchange.js` / `plugins.json` **零改动**。
> 不触碰（明确）：`docs/TODO.md` / `docs/README.md`（主 agent 写域）；`docs/design/AUTO-UPDATE.md` / `docs/requirements/UPDATE.md`（B08 面，本批硬约束禁碰）；`docs/design/PET*.md`；其他批次档；`dsh-bundle/` 与 `bundled-plugins/`（只读）。
> 单函数体量核对：改动后最长函数 = `installPlugin`（预估 ≈55 行）· `computePluginUpdates`（≈40）· `scanProfile`（≈35）——均 **<<300**，无拆分裁定。
> 行宽判据（不含行尾 CR）：本批新增段落 ≤ 300 字符/行；落档后实测行数与超宽行数随本表回填（承 D6 / D7）。
> 单函数体量核对：`sumSessionTokens()` 重写后预估 ≈45 行（<<300）；`startAffinityWatcher()`（`:116-147`，32 行）**不改**——无 >300 函数面，无需拆分裁定（NFR-3 的 500 行硬限亦无影响）。

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
| DD-17（B07） | 主窗口 URL 取值链 = 后端打印行作**唯一来源**；兜底 = 裸地址 + 诊断行 | 唯一同时满足「不停在 401」「不写死版本」「不动 Harness」的方案（选型 G） | 关鉴权 / 推算令牌 / 伪造 Cookie / 壳侧先换 Cookie（逐条否决见选型 G） |
| DD-18（B07） | 回落路径**只记日志**，不加用户面弹窗 / 提示 | 该路径仅在壳侧探测失败时可达；日志 + 401 页面本身可排查；新增未审 UI 文案超出本批（列为 open 项 U-12） | 加气泡 / 对话框提示（未审文案，本批不引入）；静默回落（违 AC1「留日志」） |
| DD-19（B07） | URL 宽限期 env 可覆盖：`BIGFISH_WEB_URL_WAIT_MS`（默认 3000） | 使「未捕获 → 回落」路径可机检驱动（承 `BIGFISH_UPDATE_INTERVAL_MS` 先例）；否则只能改源码验证 | 测试时手改源码（不可重复、无痕、有误提交风险）；不提供测试钩（AC9 回落面不可机检） |
| DD-20（B07） | 后端 stdout = 管道 + tee 双写 + 四项加固（StringDecoder / 降级 try / 常驻 `error` / 背压口径） | 同时满足「拿到令牌地址」与「取证面不回退」（选型 H）；四项加固均有现状证据 | 直写 + 尾随读日志嗅探 / 只嗅探不落盘 / 不用 `--no-open`（见选型 H） |
| DD-21（B07） | 完成探测 = `fs.watch(recursive)` 主路径 + 非 Windows 异步回落；5 s 定时器纯算术 | 唯一同时满足「不阻塞」「零新依赖」「开销与规模解耦」（选型 I） | 异步全树轮询 / `chokidar` / 收窄监视面（逐条否决见选型 I） |
| DD-22（B07） | busy 谓词 = **路径任一段落** ∈ `{profiles, node_modules}`（旧 skip 语义原样；批次档 §1.4 R4 的「顶层段」表述已同步采纳本口径——§1.9 更正 ③④） | 取旧语义（任意深度同名目录）可证「语义不回退」，且 watch 与回落两路同谓词；本机布局下与「顶层段」结果**等价**（§1.6 #8：名为 `node_modules` 的目录 3 处，全在 `profiles/**`） | 保留顶层段过滤（语义面窄于旧版，且两路不同口径）；收窄监视面（语义变更，见选型 I #4）——**待用户追认** |
| DD-23（B07） | 开关关闭时 watch 回调也守 `notifyOnComplete` | 恢复旧语义（旧实现定时器早退 ⇒ 不计忙）；不如此则关闭期间活动累积、重开即补发一条假通知 | 不守卫回调（现状——重开即误报） |
| DD-24（B07） | watcher `error` ⇒ 切回落 + 诊断行 | 避免监听静默死亡（现状空处理）；回落路径已在（复用既有分支，成本≈0） | 保持空处理（不可诊断的通知失效） |
| DD-25（B07） | 删死代码同步 `latestMtime`（含导出与头注释引用） | 全仓 0 调用点 + NFR-5 静态判据（探测域无 `*Sync(` 调用面）；残留即示范 | 保留导出（静态判据无法机检；死代码无维护价值） |
| DD-26（B07） | F6 修复走**已注入的 `notify`**（不新增 require） | 与 §2.2.6 声明的注入面一致；避免同能力两条路径（选型 J） | 新增 `require('./shell-notify.js')`（不成环但双面）；托盘代调（域归属错位） |
| DD-27（B07） | 诊断行落盘 = `logStream` 提升模块级 + `writeDiag(line)` 双写 + `reason` 追踪（§2.2.8） | AC9 / AC15 的机检要求这两条行**真的落盘**；现状 `console.log` 只到主进程 stdout ⇒ 不补机制则判据不可达 | 只写 console（机检不可达）；行走 `tee`（污染后端取证面）；另起日志文件（新增落点） |
| DD-28（B07） | 晚命中（宽限耗尽后 URL 行才到达）⇒ 对已按裸地址加载的主窗口**补一次 `loadURL`** 到命中地址（§2.2.8） | 该态下窗口整场停在 401、须重启应用——与 US-9「打开主界面这一动作永远真的能打开界面」相抵；成本 = 命中分支内一个 if（`getMainWindow()` 是既有注入面：零新增注入 / 零新增日志） | 不回溯（本次会话残留 401；实现者易各自发挥）；壳侧先换 Cookie / 轮询重试（越界：伪造 Cookie、加 Harness 未支持的启动参数） |
| DD-29（B09） | 空闲阈值 = **8 s**（= 投影缓存写后阈值 5000 ms + 3000 ms 余量） | 判据见 §2.1 K-1 / §2.2.12：① 必须大于写后阈值——否则判定会读到尚未追上日志的快照；② 余量 3 s 吸收写序抖动 / watch 到达延迟 / 判定读开销；③ 有效时延 8–13 s = 现状 ≈1/3 | 5 s（阈值 ≤ 写后阈值，判定前提相抵）；15 s（改善有限）；保持 30 s（不解决） |
| DD-30（B09） | 通知触发条件增「**回合已闭合**」合取项（读 Harness 会话投影缓存 `turnBoundary`） | 静默与「已完成」无因果（实测 21.9 s 工具调用静默、其间零写入）；`turn/end` 是 Harness 自己写下的完成标记，且**每回合强制落盘** | 只缩阈值（必误报）；解析 jsonl.zstd（需 zstd 解压 + 多帧解析）；stdout（无输出）；HTTP 轮询（鉴权 + 未审 API） |
| DD-31（B09） | 判定源不可用 ⇒ **退回 30 s**（现状值）+ 一条诊断行（每监视器生命周期至多一条） | 「读不到判定源」时行为与现状逐字一致（零回退）；诊断行使降级可观测（不静默、不误报） | 退回 8 s 纯阈值（放大误报）；静默降级（不可诊断）；不降级（新装 / 旧版 Harness 下永不提醒） |
| DD-32（B09） | 判定结果**按末次写入时刻记忆**（`completionGateMemo.lastBusyAt !== lastBusyAt` 才重读）；判定读异步 + `completionGateProbeRunning` 防重叠 | 每个静默窗至多一次读（NFR-5 B09 注记）；5 s 回调保持「无同步 I/O」；任何写入自动失效重判 | 每 tick 重读（每 5 s 一次 I/O，且静默窗内结果不会变）；同步读（违 NFR-5 判据） |
| DD-33（B09） | 保留 mtime 新鲜度兜底（`mtime(C) + 1000 < mtime(L)` ⇒ 不提醒），但**不以其为承重判据** | 承重判据 = 「阈值(8 s) > 写后阈值(5 s) ⇒ 判定时快照必已折叠最近事件」（§2.2.12 判定前提）；兜底仅在前提失效时生效，方向 = 抑制（安全侧） | 只靠承重判据（前提失效即误报）；只靠 mtime（同批次差几毫秒的写序分不出——实测两档同秒） |
| DD-34（B10） | 读面 = **双形态**（per-record 目录优先 → 旧单文件兜底），形态判别基于**磁盘事实**（不嗅探 Harness 版本） | 唯一同时覆盖「活跃 0.1.5」与「出厂 `0.1.0-rc.6`（单文件布局）」两态的方案（选型 L-1） | 只支持目录 / 只支持旧文件 / 版本号择形态（逐条否决见选型 L-1） |
| DD-35（B10） | 聚合口径 = **全量累加**（目录下全部可解析记录；不按 workspace / 不按会话过滤） | 语义 = 用户终身消耗，与旧实现同源（旧面 `tables.sessions[*]` 即全量）；水位单调性最好（新会话只增不减）⇒ 不触发不必要的重基线 | 仅当前会话（切换即水位暴跌 ⇒ 漏计）；按 workspace（口径变更 + 壳侧无「当前工程」概念）；时间窗（新口径、不可机检） |
| DD-36（B10） | 计费口径 = **B**：`uncachedInput + cacheRead + cacheWrite + output`（只读 `totals`，不读 `last.buckets`） | 用户 2026-09-17 12:19 裁定；与 Harness 计费口径同源（批次档 §1.3 ⑦）；现口径漏掉 `cacheRead`（本机样本 37504，占口径 B 的 75.6%） | 现口径（`uncached + output`——本机样本低估 ≈4.1 倍）；只加 `cacheRead` 不加 `cacheWrite`（选择性对齐无依据） |
| DD-37（B10） | 目录面**逐条容错**（单条损坏跳过），可用判据 = **可解析记录数 ≥ 1** | per-record 布局的固有优点 = 故障域收窄到单条；整面 `null` 会让一条坏记录废掉全部读数——与本次事故同型（一处形态变化 ⇒ 长期静默失效） | 整面 `null`（故障域放大到全量）；「读到第一条即用」（记录间无可比优先级） |
| DD-38（B10） | 返回 `null` 而非 `0`（读不到任何有效记录时）；读面 = **幂等水位**，累计值由调用方按水位差累加 | `0` 会把基线降到 0 ⇒ 读数回升时此前已计入的消耗被**重复计入**；`null` 使基线保持不变（安全侧）。水位语义使「重启不重复计入」由「`usage` 持久化 + 基线每次启动重置」自然成立（既有机制，逐字保留） | 返回 `0`（重复计入面显著放大）；读面自行持久化 / 记账（新增持久化状态与失败面，超本批） |
| DD-39（B10） | 旧布局兜底 = **带消解期的条件性保留**：保留至 **B08 收口点**，到期条件 = 内置 bundle ≥ 0.1.5 ∧ 活跃副本无 < 0.1.5 | 兜底**当前仍是出厂路径的活跃形态**（内置 Harness = `0.1.0-rc.6`，单文件布局）——不是历史包袱；到期条件可机检（版本枚举） | 无期限保留（永久先例——纪律禁止）；立即剔除（离线用户永久失效） |
| DD-40（B10） | 诊断行经 `backend.writeDiag`（console + `bigfish.log` 双写）；`shell-backend.js` 导出面 +1 行 | 本 bug 的伤害来自**静默**；B07 已建立单一诊断落盘面（§2.2.8 / §2.2.9 A5 / DD-27），复用优于新造；打包版 stdout 不可见 ⇒ console-only 诊断价值低 | console-only（打包版不可见）；另起日志文件（新增落点）；不加诊断（静默缺陷型保持不变） |
| DD-41（B12） | 入参门 = **三形态白名单**（`builtin:`·`github:owner/repo[#片段]`·`[scope/]name[@版]`；名字复用 `isPlainPackageName`）；面 = `installPlugin` / `uninstallPlugin`（含 `market:` 四链） | 判据单值可机检；对真实数据零误拒（3725 形态实测）；一处门守住四条 IPC 链 | 黑名单（追不上形态全集）；只封 `builtin:` 分支（npm 面裸奔）；只做越界校验（拒绝点晚）——选型 M-1 |
| DD-42（B12） | 越界校验 = **`path.relative` 词法包含判定**（不做 `realpath`） | 判据独立于白名单（位置 vs 形态）；不 `realpath` 的理由 = pnpm 链接布局（本机实测）会误拒合法安装 + 路径不存在时抛错；威胁源为远端字符串，本地链接不在威胁面 | 字符串前缀比较（未归一化即比较）；`realpath` 比较（误拒合法安装）；不设第二层（本 bug 后果等级不值得只挂一层）——选型 M-2 / L-B12-1 |
| DD-43（B12） | 弹窗 = **结构面修**（`confirmModal` 收节点 + `el()` 变参 + `frag()` helper；`innerHTML` 全档清零） | 注入面**消失**（而非「调用点记得转义」）；结构与文案逐字保留（同标签 / 同 `margin-top`）；净行数 ≤ 0（守 500 行硬限） | 转义 helper（注入面仍在、依赖每个调用点）；`textContent` 直替（丢结构 ⇒ 外观变更）——选型 M-3 / DD-47 |
| DD-44（B12） | 拒绝消息**不含任何绝对路径**，只回显入参前 60 字符 | 渲染层持有 `marketAPI` 且会把 message 原样展示 ⇒ 含路径的消息等于把用户主目录（与 `~/.dsh` 布局）交给渲染进程；回显入参足以定位问题（入参本就是用户侧标识） | 原样回显解析后的路径（信息泄漏）；完全不回显（不可诊断，与既有 `原始标识：${spec}` 风格不一致） |
| DD-45（B12） | 扫描复用 = **请求内单次快照**（`ctx` 参数下传），**不引入跨请求缓存** | 失效面为零（快照随调用生灭）；同一请求内的一致性优于「多次读」；既有调用点缺省自建快照 ⇒ 零改动 | TTL 缓存（新增失效面且无实证需求）；只改 `computePluginUpdates`（主线程仍付两次全扫）；异步化改造（改动面超本批）——选型 M-4 |
| DD-46（B12） | 验证落 `tests/b12-plugin-guards.test.js`（`node --test` + 加载器注入假 `electron` / 假 `shell-backend` + 临时 `DSH_HOME` 夹具；XSS 面用 `node:vm` + 极简 DOM 桩） | 三项修复的主判据均为**行为面**（fs 零改动 / 计数相等 / 无元素节点），静态判据不可达；仓内已有 `tests/` 先例；零依赖、零框架 | `.thincoder/` 一次性脚本（批后即失，与安全面长期价值相抵）；只做静态判据（证明不了行为面）——选型 M-5 |
| DD-47（B12） | XSS 结构面修**净行数 ≤ 0**（helper 内聚 + 调用点变参压缩），守住 `market.js` 的 500 行硬限 | `market.js` 现 **500** 行（NFR-3 硬限贴线；`market-update.js:4` 已为同一原因把更新逻辑外置）——任何净增都破线 | 允许越限（违 NFR-3）；本批拆 `market.js`（结构改造超本批边界，归 T2 评估面） |

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
| C17（B07） | 批次档 §1.4 R4 原表述的 busy 判定面（「非遗 `profiles` / `node_modules` **顶层**的写入」） | 本设计统一为「**路径任一段落**」（= 旧 skip 语义原样；本机布局下与「顶层段」结果等价——§1.6 #8）——主 agent 已采纳（批次档 §1.9 更正 ③④） | 口径统一（表述更正，非语义变更）——**待用户追认**（DD-22） |
| C18（B07） | 批次档 §1.6 #10 记 `main.js` **200** 行 | 实测 **204** 行（换行符计数口径；工作区未改 main.js） | 计数更正（登记 O11，随批次档 §6 核销一并处理） |
| C19（B07） | 零新依赖 / 不引构建 | 只用内置模块（`node:fs` / `node:string_decoder` / `node:path`）；`dependencies` 零 diff；本批**零新增文件** ⇒ `build.files` 不动 | 不冲突 |
| C20（B07） | 既有取证锚点（B01–B05）不得丢 | §2.2.6 锚点清单 B07 附注：**新增 1 个 env 开关 + 2 条日志行 + 1 条条件诊断行**；其余不增不删（计数与枚举同改） | 不冲突（有界新增） |
| C21（B07） | 批次档 §1.7：4 文件持有他会话未提交改动 | 本批以现状为基线**收编**（只加固不重写）；`shell-window.js` / `main.js` 实测**无需改动**（目标形态已就位） | 不冲突 |
| C22（B07） | 技术待办 T12（未绑定 `notifier`） | §2.2.11 修复 + 同类未绑定引用全扫判据（期望 0 处） | 有意变更 |
| C23（B07） | 技术待办 T13 三拆：① AUTO-UPDATE §3.1 判定面；② `docs/README.md` 技术待办计数与 `main.js:149` 指针；③ B06 §5 实施记录缺口 | ① 本批落（§2.2.11 与 §3.3 手段 8）；②③ 属主 agent 写域（本角色不处置——批次档 C5 已裁定不代写） | 部分移交（登记） |
| C24（B07） | `已知问题与排查.md` 的「问题 4」用户文档段（在途已落） | 与本设计逐项一致：地址来源（日志里的 `dsh web:` 行）/ `--no-open` / 令牌每进程变化——**不改** | 不冲突 |
| C25（B07） | 凭证与路径不入档（批次档 §1.7） | 设计只记行形态与 `token=yes|no`，**不记令牌值**；后端自身打印行保持原样（取证与用户排查需要，非新增写入） | 不冲突 |
| C26（B07） | 既有取证面口径：`bigfish.log` = 后端 stdio 落盘（B04 / B05 依赖） | 本批新增壳侧诊断行经 `writeDiag` **追加**写入同一文件（不替代 tee 路径、不改文件名 / 落点；计数见 §2.2.6 B07 附注） | 不冲突（有界新增） |
| C27（B09） | `docs/requirements/SHELL.md` US-11 明文「不改阈值（`IDLE_NOTIFY_MS` = 30 s）」与「空闲达阈值后通知一次」 | US-12 **显式修订**该两处（阈值面 / 触发条件面），US-11 原文**不动**；US-11 其余语义逐条保持（§2.2.12 交互表） | 有意变更（跳条目修订，已登记） |
| C28（B09） | 本档 §2.2.10 结构块 ③「静默 > `IDLE_NOTIFY_MS`(30 s) 且本轮未通知 ⇒ 通知一次」与 §3.1 AC13 / §3.2 TC-38 · TC-39 的「静默 30 s」读数 | 生效口径由 §2.2.12 修订（8 s + 回合闭合判定）；**上述原文按批次硬约束保持不动**（B07 已核销判据行），修订面在 §2.2.12 显式登记 | 有意变更（口径区；原文留档，指针见 O16） |
| C29（B09） | NFR-5 的静态判据（探测域无 `*Sync(`）+「5 s 定时器回调纯算术（无文件系统 I/O）」 | 判定读异步且在阈值触发时才发生（每静默窗至多一次）；5 s 回调体内**不新增**同步调用；NFR-5 判据文字不动，口径补充落需求档 NFR-5 B09 注记 | 不冲突（有界新增） |
| C30（B09） | NFR-2 「新增代码零平台分支」（B07 注记） | 本批判定面零 `process.platform`（只读路径与 JSON 字段） | 不冲突 |
| C31（B09） | 投影缓存目录读面**已在 0.1.5 变过一次**（T14：`shell-affinity.js:70` 读的聚合文件在 per-record 布局下不存在；归 **B10**） | 判定读以形态守卫 + 降级封口：形态不符 / 解析失败 / 记录缺失 ⇒ 「判定源不可用」⇒ 退回 30 s（不猜、不默认回合已闭合）；**不代 B10 修读面** | 风险已知（有界耦合 + 安全降级） |
| C32（B10） | NFR-5 的「探测域无 `*Sync(`」判据的**适用面** = `shell-notify.js`（`docs/requirements/SHELL.md` §四 NFR-5 度量方式原文） | `shell-affinity.js` 保留同步读（与现状同口径；10 s 周期一次小读，本机 1 档 / 7827 B）；**不把 NFR-5 的判据扩到本档**（扩面 = 语义变更，须另立条目） | 不冲突（口径界定；读量上界与再议触发见 §2.2.13 / L-B10-1） |
| C33（B10） | B09 判定面（§2.2.12）读同一目录 family（`session_projcache/sessions/*.json` 的 `rows.turnBoundary`） | 本批只改 `shell-affinity.js` 的另一条读面：**不触碰** `shell-notify.js`（判定面 + 降级封口逐字保留）；同族两条读面**互不依赖** | 不冲突（同族解耦；同族再变的风险登记 O17） |
| C34（B10） | 计费口径现状 = `uncachedInput + output`（`shell-affinity.js:78`；头注释同口径） | 口径 B 落地（用户裁定）——**有意变更**：好感度与**可兑换余额**增长更快（本机样本 ≈4.1 倍）；常量（`AFFINITY_RATE` / `EXCHANGE_RATE` / `LEVEL_THRESHOLDS` / `FOODS`）与文案逐字不变 | 有意变更（用户裁定；后果披露于 §2.6 U-14） |
| C35（B10） | 批次档 §1.4 边界：不改喂食 / 兑换 / 好感度 UI 交互 | 逐条核对：`openExchangeWindow` / `handleAffinity*` / `affinityView` / `broadcastAffinity` / 渲染面通道 `pet-affinity` / `exchange.html` 零改动（diff 判据） | 不冲突（有界变更） |
| C36（B12） | `docs/design/AUTO-UPDATE.md` §2.2.5 / §3.1 AC10（插件更新判定面）与 `docs/requirements/UPDATE.md` US-7 | 本批在 `installPlugin` 入口新增入参门 ⇒ 更新链的**前置条件**变化（合法形态零影响，实测 3725 形态零误拒）；该两档写权不在本角色（本批硬约束禁碰）⇒ 登记 **O21**，随报告提请主 agent | 不冲突（有界新增 + 跨档登记） |
| C37（B12） | 批次档 §1.3 边界「不改 IPC 通道名 / 参数契约 / 返回值形态」 | 逐条核对：通道名与参数个数零改动（`shell-ipc.js` 零 diff）；返回字段零改动——新增的只是 `ok:false` 取值下的两条 message 文本（属既有形态内的取值） | 不冲突 |
| C38（B12） | `market.js` 500 行贴线（B06 观察项 O3 + `market-update.js:4` 的显式记录） | 本批改动**净行数 ≤ 0**（helper 内聚 + 调用点变参压缩：三处调用点 −9 行 / helper +9 行）——NFR-3 硬限守住（实测回填 §2.3） | 不冲突（红线守住） |
| C39（B12） | `exchange.js:39-46` 同形 `innerHTML` 插值 | 插值源 = 主进程硬编码常量 `FOODS`（`shell-affinity.js:34-38`）+ 本地数字 ⇒ **常量源、非外部数据**；本批**不改**（判据与裁定落 §2.2.14） | 不冲突（有界变更：只改外部数据面） |

> **口径注（评审修正轮 1 #9）**：上表 C1（B03 写域冲突）的解消动作 = B03 错开后**实施起点重测 `main.js` / `package.json` 行数并回填批次档 §5**（测量口径与 as-of 值见 §2.3 表注）。

**已知限制（明确不修，随本批留档）**

- **L1**（已并入 §2.6 追认清单）：dev 下手动检查且 Harness 无更新时**无反馈**（静默）——与安装版「App 面气泡」不同；候选改进（补一行气泡文案）未采纳（不新增未审文案）。
- **L2**：专注模式下兑换屋窗口无桌宠可依 → 落系统默认位置（既有定位逻辑不变；仅影响窗口落点观感）。
- **L3（评审修正轮 1 #6 改写；原限制已消解，保留条目供追溯）**：macOS 的 `activate`（Dock 点击）**统一改经 `showMainWindow()`**——Dock 点击 = 用户主动显示请求（显示 + 聚焦；零窗口时建窗后显示）；原「不主动显示 / 零窗口建窗亦不显示」作废——与 NFR-2「既有行为不得回退」的相抵面已消解（例外句落 `docs/requirements/SHELL.md` §四 NFR-2）。
- **L4**：模式选择弹窗仍可能在首启 / 版本更新后自动弹出（一次性；§二 范围已声明保持现状）。
- **L5**：拆分后 `main.js` 及引用其行号的既有文档指针全面漂移（as-of 口径容忍；映射表见 §2.2.6）。
- **L-B07-1 / L-B07-2 / L-B07-3 / L-B07-4（B07 新增；正文定义在机制节——本处只登记号与指针，不重述（D2）**：L-B07-1（tee 处理 `drain`）见 §2.2.9；L-B07-2（回落路径全树异步扫描）/ L-B07-3（watch 缓冲溢出漏事件）/ L-B07-4（`~/.dsh` 不存在时不自身修复）见 §2.2.10。
- **L-B09-1 / L-B09-2 / L-B09-3 / L-B09-4（B09 新增；正文定义在机制节——本处只登记号与指针，不重述（D2）**：L-B09-1（等待用户确认期间不提醒 = U-13）· L-B09-2（多会话并行的判定对）· L-B09-3（判定源为 Harness 内部形态）· L-B09-4（判定前提失效时的误报面：兜底已部分抵消、残余已接受、本批不另修）——四条均见 §2.2.12「已知限制」。
- **L-B12-1 / L-B12-2 / L-B12-3（B12 新增；正文定义在机制节——本处只登记号与指针，不重述（D2）**：三条均见 §2.2.14「已知限制」（越界校验不含 `realpath` / 注入面消除后仍展示第三方内容 / 快照时点的再评条件）。

**观察项（既有语义缺口 / 批次外协调项）**

- **O1（发现即报告）**：`docs/design/AUTO-UPDATE.md` §2.2.9 需登记新 gate 行（`face=app skipped=dev`，含旧形态退役说明）、§2.2.7 门禁描述需同步；`docs/batches/B02-auto-update.md` §3.1 AC7 的「dev 模式 → 无任何检查行」判定面被本批覆盖（harness 面）。**该两档写权不在本角色**——随报告提请主 agent 处置。
- **O2（发现即报告）**：`docs/README.md` §一 的 `main.js:149` 指针与各档 `main.js:行号` 取证锚点（C14）在拆分后漂移——主 agent 收口面；本次不处置（as-of 口径）。
- **O3（发现即报告）**：`market.js` 500 行贴线（未超）——本批不动；拆分裁决仍归 T2 评估面。
- **O4（发现即报告）**：`.test-userdata/settings.json` 含 `onboardingDone` 键（测试残留数据）——不处置；AC3 grep 范围须排除（§3.1）。
- **O5（发现即报告）**：`README.md:46` / `使用说明.txt:21-25` 的向导描述随 F2 失效——已列入受影响文件表（随包文档更新）；`版本说明.txt:44/:61` 为历史版本注记，**不动**（历史语义保留）。
- **O6（发现即报告）**：`docs/design/PET-DRAG.md` §2.5 观察项 F4（拆分 `main.js`）与 `PET-MULTIMONITOR` 的体量债记录随本批收口——两档指针更新不在本角色写域；随报告提请。
- **O7（发现即报告，只报告不自行改）**：`THIRD-PARTY-NOTICES.md:53-54` 提及第三个素材目录 `assets/jimeng-2026-08-15-3386/`——该目录在仓库中不存在（陈旧提及）；交主 agent 收口。
- **O8（B07 发现即报告——已复核收口）**：本角色上轮据「`pnpm-store/**` 下 2,302 个 `node_modules` 目录」质疑批次档 §1.6 #8 的「名为 `node_modules` 的目录仅 3 处、全在 `profiles/**`」——
  **经三法复核，该质疑不成立、原结论保留**：递归文件 **20,857**（`profiles/` 4 + `pnpm-store/` 20,849 + `storages/` 1 + 顶层 3）；名为 `node_modules` 的目录 **3** 处（全在 `profiles/**`），`pnpm-store/` 下 **0** 处。
  原记 2,302 **本轮无法复现**（同口径复扫：路径中出现 `node_modules` 字样的目录 28 处）——成因未定，按「误计数」收口（依据 = 三法一致）。
  ⇒ R4 的「任一段落」表述由主 agent 采纳（理由 = 逐字忠实旧 skip 语义 + 单一谓词；与等价性无关——批次档 §1.9 更正 ③④）。**本项已收口，无遗留动作**。
- **O9（B07 发现即报告）**：回落路径（非 Windows）每 5 s 仍全树异步扫描 20,849 文件——不阻塞但持续 I/O；候选加固（收窄活动面 / 降频）属语义变更，留待后续批次（本批列为选型 I 候选 4 的否决理由）。
- **O10（B07 发现即报告）**：`fs.watch({recursive:true})` 的 OS 缓冲溢出可漏事件（Windows）——本批不加兜底轮询（会重新引入 I/O）；可选加固 = 低频（≥60 s）兜底扫描，待后续批次。
- **O11（B07 发现即报告）**：批次档 §1.6 #10 记 `main.js` **200** 行，实测 **204**（同换行符计数口径，工作区未改 main.js）——请主 agent 在 §6 核销时更正计数。
- **O12（B07 发现即报告）**：`waitForReady` 将 401 计入「就绪」（`statusCode < 500`，`shell-backend.js:100`）——**有意保持**（就绪判定不涉鉴权面）；登记备查。
- **O13（B07 发现即报告 → open 项）**：URL 未捕获时的**用户面提示**未定（设计建议不加——见 §2.6 U-12）；需评审 / 用户裁定。
- **O14（B07 发现即报告）**：技术待办 T13 的②（`docs/README.md` 技术待办计数与 `main.js:149` 指针）与③（B06 §5 实施记录缺口）属主 agent 写域——本批不处置，随 §6 收口。
- **O15（B09 发现即报告——已由台账登记，本批只引用）**：`shell-affinity.js:70` 的读面（`storages/session_projcache.json`）在活跃 Harness 下**不存在**该文件（实测 `~/.dsh/storages/` 只有 `session_projcache/` 目录与 `workspace.json`），
  且代码期望的形状（`j.tables.sessions[*].rows`）与实际（`{version, record:{identity, rows}}`）不符 ⇒ `sumSessionTokens()` 恒 `null`（per-record 布局，0.1.5-rc.1）。
  **该项已登记为技术待办 T14 / 批次 B10（2026-09-17 三批并行立案）**——本批只引用不处置（读面修复属 B10；本批判定读已按 §2.2.12 规则② 封口）。
- **O16（B09 发现即报告）**：本档 §2.2.10 结构块 ③ 与 §3.1 AC13 / TC-38 的「静默 30 s」读数在本批后**与生效口径不一致**（批次硬约束：不改 B07 已核销判据行）——建议在下一批解除该锁定或做一次口径重述；本批以 §2.2.12 显式登记修订面（C28），不自行改写 B07 原文。
- **O17（B10 发现即报告）**：B09 判定面（§2.2.12）与本批读面（§2.2.13）**同读一族 Harness 落盘物**（`session_projcache`）——本批只修 `shell-affinity` 一条；
  形态若再变（承 T14 一类的第三次），两条读面会**各自**失效（B09 侧有降级封口、本批侧有诊断行与 `null` 安全侧）。建议后续批次评估「同族形态守卫」的统一收口；本批不处置。
- **O18（B10 发现即报告）**：`docs/requirements/PET.md:214` 有 **1** 行超 300 字符（321 字符，不含行尾 CR 口径）——行宽债；该档**不在本角色写域**（本批写域 = SHELL.md / SHELL-UX.md / 批次档 §2）⇒ 随报告提请主 agent 处置。
- **O19（B10 发现即报告）**：`docs/requirements/PET.md:33` 与 `docs/requirements/SHELL.md:45` 同持「桌宠其余机制（好感度…）的功能性需求…本档不代其立需求」句——本批在 SHELL.md 侧加**层级注**（不改原句，见该档 §二）；
  PET.md 侧是否需同款注记 = 主 agent 写域裁定项（本批不改）。
- **O20（B12 发现即报告）**：`market.js:254-258` 把注册表字段 `p.url` 直接赋给 `<a>` 的 `href`——点击路径已由 `e.preventDefault()` + 主进程 `marketOpenExternal`（`shell-market.js:181`）的 `^https?://` 判据兜住；
  但 `href` 本身仍是不可信值（中键 / 新窗路径未守；市场窗口无 `will-navigate` / `setWindowOpenHandler` 守卫）。与「更新 URL 宿主白名单」同族 ⇒ 按批次边界**本批不改**，提请另批（或用户裁定）。
- **O21（B12 发现即报告）**：`docs/design/AUTO-UPDATE.md` §2.2.5 / §3.1 AC10 的插件更新判定面在本批后新增**前置条件**（入参门）；`docs/requirements/UPDATE.md` US-7 的「边界（不做）」未提入参形态。该两档写权不在本角色（本批硬约束禁碰）⇒ 随报告提请主 agent。
- **O22（B12 发现即报告）**：**内置插件「一键安装」路径当前不可达**——`normalizePlugin`（`market.js:99-103`）只从 `install` 字段提取 `add …` 之后的标识，而内置条目的 `install` 被构造为字面量 `'builtin:' + n`（`market.js:451`）
  ⇒ `installSpec` 为 `undefined` ⇒ 渲染面走 `market.js:263-264` 的「不可一键安装」分支（`:275` 的「一键安装」标签为死码）。设计者本轮模拟实跑确认（`normalizePlugin({name:'dsh-x', install:'builtin:dsh-x'})` ⇒ `installSpec: undefined`）。
  **本批不改**（超范围；且 `installPlugin('builtin:<名>')` 经 IPC 仍可达——本批的门正是守这条 IPC 面）。提请另批裁定（修 UI 接线还是删死码）。
- **O23（B12 发现即报告）**：`shell-market.js:127` / `:131` 的 `console.log` 调试行在 `market:enable` 路径上各调一次 `listDisabledPlugins()` / `profileBundles()`（一次全目录扫描 + 一次 profile 读）——**为打日志而扫描**；不属本批三项，但同属「主进程扫描开销」家族。本批不改（提请另批与 `market:enable` 面一并收口）。

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
| U-11（B07） | 主窗口实际加载的地址（用户不可见） | 优先后端打印的带令牌地址（US-9）；回落时窗口可能停在 401 文本页（日志有诊断行） |
| U-12（B07） | URL 未捕获时的**用户面提示** | **open**——建议不加（与「日志 + 401 页可排查」一致，且不引入未审文案）；待评审 / 用户裁定 |
| U-13（B09） | 「等待你的确认」是否单独提醒（审批 / ask-user / 计划模式期间回合在途 ⇒ 现状 30 s 后发一条语义错误的「已完成」，本批后不发） | **open**——建议本批不做（新增通知类型 / 新文案，超批次边界；依据 = §2.2.12 边界 + L-B09-1）；待评审 / 用户裁定 |
| U-14（B10） | 用户可见后果：好感度与兑换屋余额按**口径 B** 增长更快（`cacheRead` 计入——本机样本 ≈4.1 倍） | 有意变更（用户 2026-09-17 裁定）；**无新 UI / 无新文案**；`affinityView()` 字段与渲染面零改动；`wallet` 与 `usage` 同源（同一 `delta`，不拆两套口径） |
| U-15（B12） | 用户可见面：市场页外观 / 文案 / 交互 | **无新增**——三处弹窗同标签同文案（`<code>` / `<b>` / `margin-top` 保留）；拒绝只走既有失败 toast（消息 = 「无效的插件标识：…」，不含路径）；「不可一键安装」标签保持现状（O22 的现存缺口不在本批处置） |

**open 项（B07）**：**U-12**（URL 未捕获时是否加用户面提示）——设计建议不加（依据 = DD-18）；待用户 / 评审裁定。

**open 项（B09）**：**U-13**（「等待你的确认」类提醒是否设立）——设计建议本批不做（依据 = 批次档 §1.4 边界「不改文案」+ L-B09-1）；待用户 / 评审裁定。

**open 项（B10）**：无未决设计项。

**B10 待用户追认项**（非 open——设计已定，用户可在评审时改判）：

- **DD-35 / 选型 L-2**：聚合口径 = **全量累加**（不按 workspace / 不按会话过滤；单条损坏只跳过该条）；
- **DD-37**：目录面逐条容错（可解析记录数 ≥ 1 即可用）；
- **DD-40**：新增 1 条条件诊断行（经 `writeDiag` 双写 `bigfish.log`）+ `shell-backend.js` 导出面 +1 行；
- **L-B10-1 / L-B10-2**：同步读量随会话记录数增长（再议触发 = 记录数 > 100 或读量 > 5 MB）；水位回升可能重复计入（现状不修）。

**open 项（B12）**：无未决设计项。

**B12 待用户追认项**（非 open——设计已定，用户可在评审时改判）：

- **DD-41**：入参门取「三形态白名单」（复用 `isPlainPackageName`；注册表 3725 形态零误拒）；面 = `installPlugin` / `uninstallPlugin`（覆盖 `market:install` / `uninstall` / `update` / `update-all`）；
- **DD-42 / L-B12-1**：越界校验为**词法判定**（不做 `realpath`）——本地符号链接逃逸不在本批威胁面；
- **DD-44**：拒绝消息不含绝对路径（只回显入参前 60 字符）；
- **M-5 / DD-46**：本批**新增 1 个仓内文件** `tests/b12-plugin-guards.test.js`（开发期工具口径；收口处置归批次档 §6）；
- **O22 / O20**：内置插件「一键安装」路径当前不可达、`<a href>` 仍是不可信值（第三方 `url`）——两条**本批不改**，提请另批裁定。

**B07 待用户追认项**（非 open——设计已定，用户可在评审时改判）：

- **DD-22**：busy 判定面取「路径任一段落」（= 旧 skip 语义逐字忠实 + watch / 回落单一谓词；本机布局下与「顶层段」等价——批次档 §1.6 #8）；
- **DD-18 / DD-19**：回落路径不做用户面提示；新增 `BIGFISH_WEB_URL_WAIT_MS` 测试钩子（默认 3000，仅为 AC9 回落面可机检）；
- **L-B07-2 / L-B07-3**：回落路径（非 Windows）每 5 s 仍异步全树扫描（不阻塞但持续 I/O——O9）；Windows 递归 watch 的 OS 缓冲溢出可漏事件（少记一次忙 = 可能少一次提醒——O10）——两条均为「已接受限制」，正文见 §2.2.10，本批不修。

**B06 待用户追认项（原文保留）**：**open 项**：无未决设计项。**待用户追认项**（非 open——设计已定，用户可在评审时改判）：US-1 的「只开不隐」（R3）、US-5 的启动形态（C4/R2）、US-4 的结构（R5 基线 + DD-3/DD-4 两处优化）、**L1**（dev 手动检查无更新 → 静默无反馈——「已接受行为」）——见 `docs/batches/B06-shell-ux.md` §1.9。

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
| AC7 | US-7、NFR-3 | 行数实测：**源码 js 全档 ≤500**（= 全仓 `.js`，含 `probe-*.js` / `scripts/` / `tests/`；**排除** `dsh-bundle/`、`node_modules/`、`.test-*`；唯一超顶者 `main.js`（拆分清零）；口径 = 换行符计数，见 §2.3 行数口径注）；`node --check` 全绿（15 新模块 + `main.js` / `pet.js`）；锚点清单（§2.2.6）在场；依赖段零 diff；真机回归（§3.2 TC-19） | 机检（行数 / 语法）+ 真机回归 |
| AC8 | US-8 | 删除面：四组文件不存在 + 全仓 grep 0 处（排除 `docs/` / `.test-*` / `dsh-bundle`；§2.2.7）；保留面：`assets/pet/idle.png` / `assets/pet-new/**` / `probe-*.js` ×7 / `debug-pet.cmd` 在场；`package.json` **F7 提交自身**零改动（三面；F2 / F6 预期 diff 除外——§2.2.7 判据③）；真机冒烟 | 机检（存在性 + grep + diff）+ 真机冒烟 |
| AC9（B07） | US-9 | 真机：活跃副本 `0.1.5-rc.1` 冷启动 → 主窗口显示对话 UI（非 401）；`bigfish.log` 有 `dsh web: …?token=` + `backend web url captured … token=yes`。静态：主窗口 URL 唯一出口 = `browserUrl()`（两处调用点均经它）；回落 / 旧版两子面 = 本表后「AC9 补充判据」行 | 半机检（日志 + 静态全机检；UI 目视） |
| AC10（B07） | US-9 | 真机：插件安装 / 手动重启后端 → 新端口 + 新令牌自动跟进（重载后仍是 UI 而非 401）；日志出现**第二条 captured 行且 port 与前一条不同** | 半机检（日志 + 目视） |
| AC11（B07） | US-10 | 机检：启动日志**无** `dsh web: opening the default browser` 行；同序列有 `dsh web: …` 行（`--no-open` 不影响打印）；真机：无新浏览器窗口 / 标签页 | 半机检（日志全机检 + 真机目视） |
| AC12（B07） | US-11、NFR-5 | 机检：`grep -n "Sync(" shell-notify.js` = **0 处**；`latestMtime` 符号（**词边界** `\blatestMtime\b`）0 处（同步版已删；`latestMtimeAsync` 不计入）；5 s 定时器回调体内无 fs 调用（逐行静态核对）；真机：`~/.dsh` 20,857 文件下拖动桌宠 / 点托盘无可感周期性顿挫（旧实现对照 ≈2 s/轮） | 机检 + 真机 |
| AC13（B07） | US-11 | 真机三路径：① 后端活动（写 `storages/`）→ 静默 30 s → 通知**一次**；② `notifyOnComplete=false` → 零通知；③ 关闭期间有活动 → 重新开启**不补发**（修正 C）。回落路径：首扫不误报（基线面保持） | 半机检（真机目视 + 静态核对） |
| AC14（B07） | US-7 补注（T12） | 静态：`shell-mode.js` 无 `notifier` 符号（0 处），两处为 `notify(...)`；同类未绑定命名空间引用全扫 = **0 处**（方法 = §2.2.11）。真机：托盘「更换背景…」/「恢复默认背景」均出通知、无异常 | 半机检（静态全机检 + 真机点菜单） |
| AC15（B07） | US-9、US-10、NFR-3 | 机检：B04 / B05 锚点逐条在场 + URL 诊断行每次启动至少命中一条（不要求单次两条齐备）+ 日志无 U+FFFD + `node --check` 全绿（对照方式与行形细目见本表后「AC15 判据细化」） | 机检（日志对照 + 语法） |
| AC16（B07） | NFR-2（B07 注记）、NFR-1…NFR-5 | 真机十面回归（B06 AC1–AC6 判据沿用，不新增）：启动形态 / 托盘 11 项 / 桌宠左右键 / 主窗口 / 兑换屋 / 市场 / 插件 / 更新门禁 / 通知 / 背景更换；新增：主窗口 URL 捕获面（AC9/AC10） | 半机检（B06 静态面复跑 + 真机回归） |
| AC17（B09） | US-12、NFR-5（B09 注记） | **阈值与判定面生效 + 降级面**：① 静态——常量关系 `IDLE_NOTIFY_MS`(8000) > 5000、注入面两键、判定函数单一实现（含 `ver !== 2` 守卫）、无 `*Sync(` / 无 `process.platform`；② 降级——判定源不可用 ⇒ 30 s 面 + 诊断行；③ 真机：TC-46 / TC-49 / TC-50 / TC-55 | 机检（静态）+ 半机检（真机构造） |
| AC18（B09） | US-12 | **误报边界**：① 真机——执行 ≥15 s 工具调用（或长构建）⇒ 静默期内**零**提醒、回合结束后一次提醒（现状对照：30 s+ 静默同样会误报）；② 构造 / 桩测——回合在途（规则④）与快照落后于日志（规则③）分别构造 ⇒ 均不提醒 | 半机检（真机 + 构造） |
| AC19（B09） | US-11（口径修订见 US-12） | **既有语义不回退**：`notifyOnComplete=false` 零提醒 / 关闭期活动重开不补发 / 一个活动周期一次提醒 / 回落路径同判定面 / 通知文案三串逐字不变；静态判据 = 既有守卫行与清忙态调用零 diff（改动只落判定块与注入面） | 半机检（静态 diff + 真机） |
| AC20（B09） | US-12、US-11 | **真机时延量化**：记录「回合末次写入（= 投影缓存记录 mtime，强制落盘点）→ 通知可见」的实测区间，期望 **8–13 s**（5 s 周期对齐；现状对照 30–35 s）；用户判「显著更快」 | 真机人工（秒表 / 通知中心时间戳） |
| AC21（B10） | US-13 | **per-record 读面生效**：静态——`sumSessionTokens()` 含目录面分支（`storages` / `session_projcache` / `sessions` 段在场）+ 导出在场 + 无目录递归；夹具——构造 1 条记录（四桶 = 批次档 §1.3 ⑤ 样本值）⇒ 返回值 = **49604**；真实目录 ⇒ 与独立复算一致 | 全机检（夹具 + 桩电子） |
| AC22（B10） | US-13 | **旧单文件兜底 + 并存判据**：夹具——旧布局单文件（`tables.sessions[*]`，两条会话）⇒ 返回值 = 两条之和；目录缺 / 空 / 全损坏 ⇒ 走旧面；两形态并存 ⇒ 只读目录（返回值 ≠ 两形态之和）；兜底消解期登记在场（§2.2.13 + DD-39 + §2.6 追认块） | 全机检 |
| AC23（B10） | US-13 | **失败语义不回退**：夹具——两形态均缺 / 目录不可读 / 全部记录损坏 ⇒ 返回 `null`（**非 0**）且不抛；调用面零改动（diff：`startAffinityWatcher` / `affinityView` / `handleAffinity*` 逐句一致）；真机——读面失败下喂食 / 兑换 / 好感度 UI 正常；诊断行：两形态不可用 ⇒ 1 条（每生命周期），正常态 ⇒ 0 条 | 机检 + 真机 |
| AC24（B10） | US-13 | **计费口径 B 的累加判据**：静态——四桶标识符逐条在场（`uncachedInputTokens` / `cacheReadTokens` / `cacheWriteTokens` / `outputTokens`）、`last` 不参与求和；夹具——构造 `last.buckets` 与 `totals` 不同值的记录 ⇒ 返回值取 `totals`；样本复核 9666+37504+0+2434 = **49604** | 全机检 |
| AC25（B10） | US-13 | **聚合口径 + 水位语义**：夹具——3 条记录 ⇒ 返回值 = 三条之和（不按会话 / workspace 过滤）；幂等——同一夹具连续两次调用相等；空目录 ⇒ `null`（非 0）；重启不重复计入——预置 `affinity.json`（`usage > 0`）+ 固定夹具 ⇒ 启动后 `usage` 不因读面值变化 | 全机检 |
| AC26（B12） | US-14 | **穿越封口（行为面）**：桩测——`installPlugin` / `uninstallPlugin` 对穿越形态枚举（见注①）⇒ 全部 `{ ok:false }`；**两侧夹具文件系统零改动**（存在性与内容哈希 / profile manifest 不变）；无子进程（计数器 = 0） | 全机检（桩测 + 计数器） |
| AC27（B12） | US-14、NFR-6 | **两层防御**：① 白名单——正负例见注②；② 越界校验——`isInsideDir` 真值表（`nm/a` true · `nm/../..` false · `nm` 自身 false · `bundled/x` true · `bundled/../profiles` false）；③ 结构——两处 `path.join` 之后各有一次包含判定调用（grep） | 全机检 |
| AC28（B12） | US-14、NFR-6 | **弹窗文本化**：① 静态——`market.js` 全文 `innerHTML` **0** 处；`confirmModal(` 三处调用的第二实参均为节点构造；② 桩测——`node:vm` + DOM 桩驱动弹窗与卡片渲染，恶意 `name`（注③）只产生**文本节点**；③ 真机人工——注入恶意条目 ⇒ 弹窗只显文本、无脚本执行 | 机检 + 真机人工（③） |
| AC29（B12） | US-15、NFR-7 | **扫描常数次 + 判定零回退**：① 计数器——同一夹具下 N=2 与 N=3727 的 `readdirSync` / `statSync` / `readFileSync` 计数**相等**，且 `node_modules` 的 `readdirSync` = 1 / 次调用；② 黄金样本——`computePluginUpdates(夹具)` 的返回值逐字段与改前一致、`updaterLog` 行序列逐字一致 | 全机检（计数器 + 黄金样本） |
| AC30（B12） | NFR-3（B12 面）、US-14、US-15 | **零回退面**：① 零新依赖（`package.json` 零 diff）；② 改动文件 `node --check` 全绿；③ `market.html` / `market-preload.js` / `market-update.js` / `exchange.js` 零 diff；④ `market.js` ≤ **500** 行（实测）；⑤ `shell-ipc.js` 零 diff；⑥ `plugin update …` 行形与条数不变 | 机检 |
| AC31（B12） | NFR-6 | **拒绝消息形态**：两类拒绝消息均匹配 `^无效的插件标识：` / `^插件标识越界，已拒绝：`，且不含盘符形态 `[A-Za-z]:[/\\]` 与三个基准目录的取值子串（桩测正则） | 全机检 |

> **B12 判据细化（AC26–AC28 的枚举面，承 AC17 细化先例）**：① **穿越形态枚举**（AC26 输入集）= `../../..` · `builtin:../../..` · `..\..\..` · `/abs/path` · `C:\Windows` · `@scope/..` · `..` · `a/../../b` · `\\srv\share` · `file:/etc/passwd` · `git+https://x/y` · `builtin:/abs`；
> ② **形态正负例**（AC27）= 正例 `名` / `@scope/name` / `<名>@<版本>` / `github:owner/repo` / `github:owner/repo#path:/x`；负例 = 注① 全量 + `link:` / `file:` / `git+` / 非字符串入参；
> ③ **恶意 name 形态**（AC28）= `<img src=x onerror=…>` / `<script>…</script>` / `"><svg onload=…>`。

> **B07 回指口径（三方条目一致——硬）**：批次档 §2 本批条目（I1–I6）= 本表 AC 回指条目 = `docs/requirements/SHELL.md` 条目（US-9 / US-10 / US-11 / NFR-5 / US-7 补注）。
> **B09 回指口径（三方条目一致——硬）**：批次档 §2 本批条目（I1–I4）= 本表 **AC17–AC20** 回指条目 = `docs/requirements/SHELL.md` **US-12**（并含 NFR-5 的 B09 注记与对 US-11 的显式修订面）。批次档 §1.6 的 AC1–AC4 与设计 AC17–AC20 的映射：**AC1 → AC17 · AC2 → AC18 · AC3 → AC19 · AC4 → AC20**。
> **B10 回指口径（三方条目一致——硬）**：批次档 §2 本批条目（I1）= 本表 **AC21–AC25** 回指条目 = `docs/requirements/SHELL.md` **US-13**。批次档 §1.6 的 AC1–AC4 与设计 AC21–AC25 的映射：**AC1 → AC21 · AC2 → AC22 · AC3 → AC23 · AC4 → AC24**；**AC25** = 批次档 §1.5 ②（多会话聚合口径）的裁定面（§1.6 未列，本批新增）。
> **B12 回指口径（三方条目一致——硬）**：批次档 §2 本批条目（I1–I6）= 本表 **AC26–AC31** 回指条目 = `docs/requirements/SHELL.md` **US-14 / US-15**（并含 NFR-6 / NFR-7）。
> 批次档 §1.4 的 AC1–AC6 与设计 AC26–AC31 的映射：**AC1 → AC26 · AC2 → AC27 · AC3 → AC27 · AC4 → AC28 · AC5 → AC29 · AC6 → AC30**（AC2 与 AC3 同落 AC27——门与越界校验同属「两层防御」）；**AC31** = 本批新增（拒绝消息形态）。
> **AC17 判据细化（B09）**：① env 钩子 `BIGFISH_IDLE_NOTIFY_MS` 解析面在场（组合根，承 `webUrlWaitMs()` 形：空 / 非有限数 / 负数 ⇒ 取默认 8000）；② 判定四态与三条条件句在场（`turnBoundary` · `openTurnStartSeq` · `ver !== 2` · mtime 比较）；③ 判定读的异步性与「每静默窗至多一次」（`completionGateMemo` 按 `lastBusyAt` 记忆 + `completionGateProbeRunning` 防重叠）静态核对。
> **AC13 / TC-38 · TC-39 读数修订（B09）**：B07 判据中的「静默 30 s」读数按 §2.2.12 修订为「静默达 8 s + 回合已闭合」；**AC13 原文与 TC-38 · TC-39 原文按批次硬约束保持不动**（修订面登记见 §2.5 C28 / 观察项 O16）。
> **AC9 补充判据（回落 / 旧版两子面）**：① `BIGFISH_WEB_URL_WAIT_MS=0` 启动（URL 行晚到）→ `not captured … reason=no-line` + 窗口先加载裸地址，行到达后补一次加载自愈为对话 UI（DD-28；不接受的行形见 TC-32）；② harness 无令牌输出 → captured `token=no` 仍可用（旧版兼容，用例 TC-33）。
> **AC15 判据细化（AC15 行压行后的细则面，内容与原行等价）**：① 对照方式 = 改动前后**同一启动序列**的 `bigfish.log`；② 在场锚点 = `harness activate …` / `harness install phase=…` / `update …`（B04 / B05）；③ URL 诊断行形 = `captured`，或 `not captured` + `reason`——不要求单次两条齐备；④ 「两条齐备」判定并入 TC-31（晚到序列）；⑤ 日志无 U+FFFD = 分片注入 TC-36。
> 批次档 §1.5 的 AC1–AC7 与设计 AC9–AC16 的映射：**AC1 → AC9·AC10 · AC2 → AC11 · AC3 → AC12 · AC4 → AC13 · AC5 → AC14 · AC6 → AC15 · AC7 → AC16**。

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
| TC-27（B07） | 正常 | Harness = `0.1.5-rc.1`（活跃指针）冷启动（隔离 userData + 隔离 `DSH_HOME`） | 主窗口显示对话 UI（非 401 文本页）；`bigfish.log` 有 `dsh web: …?token=` + `backend web url captured port=<n> token=yes` | US-9 / AC9 |
| TC-28（B07） | 正常 | 静态：主窗口 URL 取值链 | `shell-window.js` 与 `restartBackend` 两处均调 `browserUrl()`；**窗口 URL 出口面**的裸地址拼接仅 `browserUrl()` 内 1 处（就绪探针 / 启动横幅 / 守卫 origin 的地址串不计入本判据）；`will-navigate` 守卫未改 | US-9 / AC9 |
| TC-29（B07） | 正常 | 触发后端重启（插件安装 / 手动） | 新端口 + 新令牌自动跟进；日志第二条 captured 行 port 不同；窗口重载后仍为 UI | US-9 / AC10 |
| TC-30（B07） | 正常 | `--no-open` 生效启动 | 日志无 `dsh web: opening the default browser`；无新浏览器窗口；`dsh web: …` 行仍在（打印不受影响） | US-10 / AC11 |
| TC-31（B07） | 边界 | `BIGFISH_WEB_URL_WAIT_MS=0` 启动（强制宽限期耗尽；URL 行晚于宽限到达） | 窗口先加载裸地址（401 文本页）+ 日志 `not captured port=<n> reason=no-line fallback=http://…`（不静默）；URL 行随后到达 ⇒ 补发 `captured port=<n> token=yes`（**两条齐备面**）且窗口自愈为对话 UI（DD-28，无需重启） | US-9 / AC9 |
| TC-32（B07） | 错误 | 后端输出行形异常：非回环主机 / 旧端口 / URL 不可解析 | 该行不被采用（不加载非本机地址）；最终 `reason=mismatch` 或 `parse-fail` 取证行在场 | US-9 / AC9 |
| TC-33（B07） | 边界 | Harness = `0.1.0-rc.6`（或等效的无 token 输出） | 捕获成功（`token=no`）→ 加载裸地址；窗口正常可用（旧版兼容） | US-9 / NFR-2 |
| TC-34（B07） | 正常 | tee 双写取证面：同一启动序列的 `bigfish.log` | 后端输出（含 `harness …` 行）逐条在场；URL 诊断行**每次启动至少命中一条**（`captured` 或 `not captured` + `reason`）；无 U+FFFD | US-10 / AC15 |
| TC-35（B07） | 错误 | 日志流打不开（隔离 userData 只读 / 目录被占） | 后端照常启动、应用不崩；输出降级到 `process.stdout`；无未捕获异常 | US-10 / AC15 |
| TC-36（B07） | 边界 | 跨 chunk 的 UTF-8 多字节字符（分片写入；开发期一次性 node 脚本核对 `StringDecoder` 路径） | 日志逐字还原、无 U+FFFD；嗅探不受影响 | US-10 / AC15 |
| TC-37（B07） | 正常 | 静态：探测域同步调用面 | `grep -n "Sync(" shell-notify.js` = 0 处；`latestMtime` 符号（**词边界**）0 处（`latestMtimeAsync` 不计入）；5 s 回调体内无 fs 调用 | US-11 / AC12 |
| TC-38（B07） | 正常 | 真机：后端执行任务（产生 `~/.dsh` 写入）→ 静默 30 s | 写入期间不通知；静默达阈值后通知**一次**（气泡 + 桌宠台词）；再静默不重复 | US-11 / AC13 |
| TC-39（B07） | 边界 | 托盘关闭「任务完成时通知」→ 产生活动 → 重新开启 → 静默 30 s | 关闭期间零通知；重新开启后**不补发**（修正 C 判据） | US-11 / AC13 |
| TC-40（B07） | 边界 | 回落路径（非 Windows / 强制 `fs.watch` 抛错）冷启动后无任何写入 | 首扫只建基线 → 不通知（不误报）；后续有新写入 → 达阈值通知一次 | US-11 / AC13 |
| TC-41（B07） | 错误 | watcher 运行期 `error`（监视根被删 / 权限变化） | 发出 `completion watcher unavailable; falling back to async scan`；切回落路径后通知仍可用（不再静默失效） | US-11 / AC13 |
| TC-42（B07） | 错误 | 托盘「更换背景…」（选一张图） | 背景更换生效 + 通知「背景已更换」；**无** `[bigfish] 更换背景失败:` 假错误行 | US-7 补注 / AC14 |
| TC-43（B07） | 错误 | 托盘「恢复默认背景」 | 恢复生效 + 通知「已恢复默认背景」；主进程无未捕获异常（改前抛 ReferenceError） | US-7 补注 / AC14 |
| TC-44（B07） | 正常 | 同类未绑定引用全扫（§2.2.11 方法） | 0 处（修正后 `shell-mode.js` 的 `notifier` 两处清零） | US-7 补注 / AC14 |
| TC-45（B07） | 正常 | 真机十面回归 + B06 静态面复跑 | 各面零回退（启动形态 / 托盘 11 项 / 桌宠左右键 / 主窗口 / 兑换屋 / 市场 / 插件 / 更新门禁 / 通知 / 背景更换） | NFR-2 / AC16 |
| TC-46（B09） | 正常 | 真机：一轮带工具调用的任务跑完（记录回合末次写入时刻与通知可见时刻） | 提醒落在末次写入后 **8–13 s**（对照现状 30–35 s）；全程仅一次提醒 | US-12 / AC17·AC20 |
| TC-47（B09） | 边界 | 真机：一轮含 ≥15 s 工具调用（长命令 / 构建）的任务 | 静默期内**零**提醒；回合结束后 8–13 s 一次提醒（不早报、不漏报） | US-12 / AC18 |
| TC-48（B09） | 边界 | 构造 / 桩测：回合在途 + 静默达阈值（规则④）；快照落后于会话日志（规则③） | 两种情况均**不提醒**（判定 `open` / `stale`）；新写入到达后重判 | US-12 / AC18 |
| TC-49（B09） | 边界 | 构造：`BIGFISH_IDLE_NOTIFY_MS=0`（把判定提到静默窗起点）；非法值（`abc` / `-1` / 空串） | `0` ⇒ 达阈值即判定（可用于构造）；非法值 ⇒ 取默认 8000 | US-12 / AC17 |
| TC-50（B09） | 错误 | 构造：隔离 `DSH_HOME`（无会话记录 / 记录损坏 / `rows.turnBoundary.ver !== 2`） | 退回 30 s 阈值（行为 = 现状）+ 诊断行一条（`grep "completion gate unavailable"`）；不误报为「已完成」 | US-12 / AC17 |
| TC-51（B09） | 正常 | 真机：托盘关闭「任务完成时通知」→ 产生活动 → 重新开启 → 静默达阈值 | 关闭期间零提醒；重开**不补发**；重开后新一轮活动仍按判定面提醒一次 | US-11 / AC19 |
| TC-52（B09） | 正常 | 构造：回落路径（强制 `fs.watch` 抛错 / 非 Windows） | 判定面同样生效（回合在途不提醒 / 待回合结束提醒一次）；首扫不误报 | US-11 / AC19 |
| TC-53（B09） | 边界 | 真机 / 构造：多会话并行（subagent 在途） | 子会话在途（回合未闭合）期间不提醒；全部回合结束后一次提醒（已知限制 L-B09-2：可推迟、不误报） | US-12 / AC18 |
| TC-54（B09） | 正常 | 静态 + 真机：通知文案与桌宠台词 | 三串逐字不变（`Bigfish 任务已完成` / `后端已空闲，可以回来看看结果了` / `任务完成啦！`） | US-11 / AC19·AC20 |
| TC-55（B09） | 正常 | 静态判据组（§3.3 手段 11 ①） | 判定函数 / 采信守卫在场；`*Sync(` = 0；`process.platform` = 0；注入两键在场；常量关系 8000 > 5000 | US-12 / AC17 |
| TC-56（B10） | 正常 | 夹具：per-record 目录 + 1 条记录（四桶 = 9666 / 2434 / 37504 / 0） | 返回值 **49604**（口径 B 四桶之和） | US-13 / AC21·AC24 |
| TC-57（B10） | 正常 | 真实目录（本机 `session_projcache/sessions/*.json`） | 返回值 = 用同口径独立复算的值（逐档四桶求和） | US-13 / AC21 |
| TC-58（B10） | 边界 | 夹具：3 条记录（含一条 `totals` 缺失 = 无 LLM 调用） | 返回值 = 三条之和（缺失条贡献 0）；不按会话 / workspace 过滤 | US-13 / AC25 |
| TC-59（B10） | 边界 | 夹具：目录存在但为空 + 旧单文件布局在场 | 返回值 = 旧布局值（`tables.sessions[*]` 全量） | US-13 / AC22 |
| TC-60（B10） | 边界 | 夹具：目录有 1 条有效记录 **且** 旧单文件在场 | 返回值 = 目录值（**≠ 两形态之和**——防双计判据） | US-13 / AC22 |
| TC-61（B10） | 异常 | 夹具：目录下 1 条损坏（非法 JSON）+ 1 条有效 | 返回有效条之和；不抛；不因单条损坏整面失效 | US-13 / AC21·AC23 |
| TC-62（B10） | 异常 | 夹具：两形态均缺 / 目录权限不可读 / 目录下全部损坏 | 返回 **`null`**（非 0）、不抛；喂食与兑换路径不受影响 | US-13 / AC23 |
| TC-63（B10） | 边界 | 夹具：目录内置 `x.json.bak.<stamp>` / `x.tmp` / 子目录 | 均不被枚举（`.json` 后缀判据）；返回值不受其影响 | US-13 / AC21 |
| TC-64（B10） | 正常 | 夹具：旧布局单文件 + 两条会话（`tables.sessions[*]`） | 返回值 = 两条四桶之和（口径 B） | US-13 / AC22·AC24 |
| TC-65（B10） | 边界 | 夹具：记录内 `last.buckets` 与 `totals` 取不同值 | 返回值取 `totals`（不叠加 `last`） | US-13 / AC24 |
| TC-66（B10） | 正常 | 夹具固定 + 预置 `affinity.json`（`usage > 0`）；同一夹具连续两次调用 | 两次返回值相等（幂等）；启动后 `usage` 不因读面值变化（重启不重复计入） | US-13 / AC25 |
| TC-67（B10） | 正常 / 异常 | 诊断行：① 两形态均不可用；② 正常夹具 | ① `bigfish.log` / console 出现 1 条 `affinity token source unavailable`（每生命周期至多一条）；② 0 条 | US-13 / AC23 |
| TC-68（B12） | 正常 | 夹具：`bundled-plugins/<name>/package.json` 存在 + `profiles/web/package.json`（含 `dsh.profile.bundles`）⇒ `installPlugin('builtin:<name>')` | `{ ok:true }`；目标目录与源逐文件一致（内容哈希）；bundles 含该名（内置面零回退，= 黄金样本对照） | US-14 / AC26 |
| TC-69（B12） | 正常 | 同上夹具 ⇒ `uninstallPlugin('<name>')` | `{ ok:true }`；目标目录不存在；bundles 不含该名 | US-14 / AC26 |
| TC-70（B12） | 异常 | `installPlugin` 入参枚举：`../../..` · `builtin:../../..` · `..\..\..` · `/abs/path` · `C:\Windows` · `@scope/..` · `\\srv\share` · `file:/etc/passwd` · `git+https://x/y` | 全部 `{ ok:false }`；夹具外部目录与 profile manifest **零改动**；子进程计数 = 0 | US-14 / AC26 |
| TC-71（B12） | 异常 | `uninstallPlugin` 同枚举 | 同上（含「目标目录未被删除」的哈希断言——旧实现下 `../../..` 会递归删） | US-14 / AC26 |
| TC-72（B12） | 边界 | 形态正例：`<名>` · `<名>@<版本>` · `@scope/name` · `@scope/name@<版>` · `github:owner/repo` · `github:owner/repo#path:/packages/x` | `installSpecKind` 均非 `null`（npm / github 面只做谓词级断言——不触发子进程） | US-14 / AC27 |
| TC-73（B12） | 边界 | 形态负例：`link:../x` · `file:/etc/passwd` · `git+https://x/y` · `@scope/..` · 空串 · `null` · `42` · `{}` | 均 `null`（非字符串入参不得抛错） | US-14 / AC27 |
| TC-74（B12） | 边界 | `isInsideDir` 真值表：(`nm/a`, `nm`) · (`nm/../..`, `nm`) · (`nm`, `nm`) · (`bundled/x`, `bundled`) · (`bundled/../profiles`, `bundled`) | `true` · `false` · `false`（严格包含）· `true` · `false` | US-14 / AC27 |
| TC-75（B12） | 异常 | 两类拒绝消息（穿越入参） | 形如 `无效的插件标识：…` / `插件标识越界，已拒绝：…`；不含 `[A-Za-z]:[/\\]` 与基准目录取值 | US-14 / AC31 |
| TC-76（B12） | 边界 | `uninstallPlugin('github:owner/repo')`（`resolveInstalledName` 解析失败态） | `{ ok:false }`（有意收紧——§2.2.14 行为差异表第 3 行；旧实现走 `pnpm remove`） | US-14 / AC27 |
| TC-77（B12） | 正常 | `node:vm` + DOM 桩载入 `market.js` ⇒ 驱动三处弹窗构造；恶意 `name`：`<img src=x onerror=alert(1)>` · `<script>alert(1)</script>` · `"><svg onload=alert(1)>` | 弹窗正文内**只多出文本节点**（元素节点数与合法输入相同）；无 `img` / `script` / `svg` 元素；字符串逐字可见 | US-14 / AC28 |
| TC-78（B12） | 边界 | 同上沙箱：`api.list()` 桩返回含恶意 `name` / `desc` / `owner` / `url` 的条目 ⇒ 走 `refresh()` 渲染卡片 | 无新增元素节点（恶意串只作文本）；`href` 赋值不产生脚本执行（静态面） | US-14 / AC28 |
| TC-79（B12） | 正常 | 静态判据组：`market.js` 的 `innerHTML` 计数；`confirmModal(` 三处调用的第二实参 | `innerHTML` = **0** 处；三处均为 `el(...)` / `frag(...)` 构造（无模板字符串实参） | US-14 / AC28 |
| TC-80（B12） | 正常 | 黄金样本对照：同一夹具下 `computePluginUpdates` 的返回值与 `updaterLog` 行序列 | 逐字段相等 / 逐字相等（改前 vs 改后）；`plugin update …` 行条数与顺序不变 | US-15 / AC29 |
| TC-81（B12） | 正常 | 计数器桩：同一夹具，注入 N=2 与 N=3727 两组注册表条目（同内容重复） | `readdirSync` / `statSync` / `readFileSync` 计数**相等**；`node_modules` 的 `readdirSync` = 1 / 次调用 | US-15 / AC29·AC31 |
| TC-82（B12） | 边界 | 夹具：profile 无 `package.json` / `node_modules` 为空 / 无目录 | 不抛；`listInstalledPlugins` 返回空数组；`computePluginUpdates` 返回 `[]`（与改前同法） | US-15 / AC29 |
| TC-83（B12） | 异常 | 夹具：`node_modules` 不可读（权限 / ACL 构造） | 不抛；扫描面降级为空集（`best-effort` 语义不变）——**Windows 下需人工构造** | US-15 / AC29 |
| TC-84（B12） | 边界 | 夹具：`bundled-plugins/@scope/name/`（嵌套目标）⇒ `installPlugin('builtin:@scope/name')` | `{ ok:true }`；目标 = `node_modules/@scope/name`（含中间目录创建）；两处包含判定均过 | US-14 / AC26·AC27 |
| TC-85（B12） | 正常 | 零回退面机检：`git diff --stat` 于 `package.json` / `market.html` / `market-preload.js` / `market-update.js` / `exchange.js` / `shell-ipc.js`；行数实测；`node --check` | 六个文件**零 diff**；`market.js` ≤ **500** 行；改动 js 语法全绿 | US-14·US-15 / AC30 |
| TC-86（B12） | 正常 | **真机人工**：本地 `plugins.json` 注入恶意 `name`（带事件处理器 / `javascript:` 形态）⇒ 开市场并点开该条目 | 弹窗只显文本；无脚本执行、无新增元素节点（DevTools Elements / Console 断言） | US-14 / AC28 |

> **TC-31 的可达性口径（评审修正轮 1 #3）**：本用例强制宽限耗尽；若该序列中 URL 行在 `waitForWebUrl` 返回前已到达（捕获早已锁定），则只命中 `captured` 一条、不产生 `not captured` 行——此时「两条齐备」面**未构造到**，记为未覆盖该态（不伪报），回归主判据仍为 AC15 的「每次启动至少命中一条」。

### 3.3 验证手段、仪表与限制

**验证手段**

1. **静态核对（grep 清单）**：① AC3 **五符号** 0 处（排除 `docs/`、`.test-*`、`dsh-bundle/`）；② `pet.js` 左键守卫三处；③ `showMainWindow` 为点击路径唯一「显示」入口；④ 托盘条目结构（§2.2.3 对照）；⑤ 门禁分支（`app.isPackaged` 保护 + `face=app` 行）；⑥ 平台分支计数（新增代码零平台分支）；⑦ `grep "更新检查只在安装版可用"` = 0 处（排除 `docs/`）。
   - ⑧ F7 删除面：四组文件不存在 + 引用 0 处（grep 范围含代码 / 配置 / 随包文档，排除 `docs/` 与 `.test-*` / `dsh-bundle`）；⑨ F7 保留面在场（`assets/pet/idle.png` / `assets/pet-new/**` / `probe-*.js` ×7 / `debug-pet.cmd`）。
2. **行数实测**：换行符计数于全部 js（口径承 B05；口径定义见 §2.3 行数口径注）。
3. **语法门**：`node --check` 于 15 个新模块 + `main.js` + `pet.js`（本仓无 lint / test script，此为最小机械门）。
4. **真机清单**：按 §3.2 逐条执行；冷启动类用例用隔离 `--user-data-dir` + 隔离 `DSH_HOME`（承 B02 §6.7 / B05 手法），并预置 `settings.json`（`modeChosen:true`、`mode:'whale'`）。
5. **锚点 grep 清单**：§2.2.6 表逐条（含 `updater.log` 15 条主格式行与变体、`pet-*` 日志、console 行、env 开关）。
6. **纯迁移 diff 判据**：P1 起点提交为基线——各层迁移提交除样板（require / exports / 限定 / 访问器）外，逐句一致；行为变更（F1–F5）不得混入 P1 各提交。
7. **本批不引入**：测试框架 / `test` script / 新增 `tests/` 文件（T4 认账不排期；判据口径承 B05 §3.3 手段 8）。
8. **B07 静态核对清单（新增项）**：① `shell-mode.js` 无 `notifier` 符号（`grep -n "notifier" shell-mode.js` = 0 处）；② `shell-notify.js` 无 `*Sync(`（含 `readdirSync` / `statSync`）且无 `latestMtime` 符号（**词边界**，`latestMtimeAsync` 不计入）；
   ③ 主窗口 URL 单入口——`grep -n "browserUrl()" *.js` 命中点均合法，**窗口 URL 出口面**的裸地址拼接仅 1 处；④ 日志流常驻 `error` 监听在场；⑤ watcher 常驻 `error` 监听 + `useWatch=false` 分支在场；⑥ busy 过滤谓词为单一实现且被两路复用（无第二份 skip 集）。
9. **B07 扫描脚本（开发期一次性，不入仓、不登记 `package.json`）**：未绑定命名空间引用全扫（方法见 §2.2.11）——期望 0 处。
10. **B07 日志取证**：`bigfish.log`——`backend web url captured|not captured` 行；`dsh web:` 行（带 / 不带 `token=`）；`dsh web: opening the default browser` 行**缺失**（AC11）；B04 / B05 锚点行在场（AC15）。
11. **B09 判定面判据（新增）**：① 静态——`grep -n "turnBoundary\|openTurnStartSeq" shell-notify.js`（判定在场）、`grep -n "process.platform" shell-notify.js` = 0、`grep -n "Sync(" shell-notify.js` = 0、注入两键在场、常量关系 8000 > 5000；
    ② 真机构造——`BIGFISH_IDLE_NOTIFY_MS`（默认 8000；`0` 用于把判定提到静默窗起点）+ 隔离 `DSH_HOME`（空目录 ⇒ 判定源不可用 ⇒ 30 s 面 + 诊断行；构造记录 ⇒ 四态可分别驱动）；
    ③ 桩测（**可选，须经主 agent 裁定**——本批边界声明「零新增文件」）：开发期一次性脚本（若采用，落 `.thincoder/`（gitignore）面，承 B03 `b03-pet-calibrate-stub.mjs` 先例）——
       注入假 `electron`（`Notification` 桩）+ 构造 `DSH_HOME` + `init({ IDLE_NOTIFY_MS: 0, IDLE_NOTIFY_FALLBACK_MS: 0 })` 驱动 `startCompletionWatcher()`，断言四态；不入仓、不登记 `package.json`、不进 `build.files`。
12. **B10 读面判据（新增）**：① 静态——`grep -n "session_projcache" shell-affinity.js`（两侧路径段在场）、`grep -n "uncachedInputTokens\|cacheReadTokens\|cacheWriteTokens\|outputTokens" shell-affinity.js`（四桶逐条在场）、`recursive` **0** 处（无目录递归）、`grep -n "sumSessionTokens" shell-affinity.js`（实现 + 导出各 1 处）；
    ② 夹具机检（AC21–AC25 的主力手段）——桩电子（`require.cache` 注入假 `electron`）+ `DSH_HOME=<夹具目录>`（`shell-backend.js:286-290` 已支持该 env）+ `require('./shell-affinity.js').sumSessionTokens()` 断言 TC-56…TC-67；
    ③ 桩测脚本（**可选，须经主 agent 裁定**——本批边界声明「零新增文件」）：开发期一次性脚本，若采用则落 `.thincoder/`（gitignore）面（承 B03 `b03-pet-calibrate-stub.mjs` / 手段 11 ③ 先例），不入仓、不登记 `package.json`、不进 `build.files`。
13. **B12 判据（新增；桩测落 `tests/b12-plugin-guards.test.js`——经主 agent / 批次档 §2 裁定的唯一新增文件）**：
   ① 静态——`grep -c "innerHTML" market.js` = **0**；`grep -n "path.join" shell-plugins.js` 的每处后随包含判定；`installSpecKind\|isInsideDir\|scanProfile` 在场（实现 + 导出）；`shell-ipc.js` 零 diff。
   ② 桩测——加载器注入假 `electron`（`{ app: { isPackaged: false, getAppPath, getPath } }`）与假 `./shell-backend.js`（`{ dshHome() }`）+ 临时 `DSH_HOME` 夹具：
   - 守卫面：`installSpecKind` 正负例 + `installPlugin` / `uninstallPlugin` 穿越枚举（含两侧夹具零改动与子进程计数 = 0）；
   - XSS 面：`node:vm` 载入 `market.js` 源码（沙箱提供极简 DOM 桩与 `marketAPI` 桩）⇒ 驱动弹窗与卡片渲染，断言恶意 `name` 只产生文本节点；
   - 扫描面：包装 `node:fs` 的 `readdirSync` / `statSync` / `readFileSync` 计数器（`fs` 为模块对象属性、调用期查表 ⇒ 加载后包装有效；`spawn` 在加载时被解构，但桩测不触发 npm 分支）；断言 N=2 与 N=3727 计数相等 + 黄金样本对照。
   运行命令 = `node --test tests/b12-plugin-guards.test.js`（**不登记 `package.json`**——门禁接入属 T4；本文件不入 `build.files`）。
   ③ **黄金样本的来源与顺序（硬）**：先在**改前**代码上用同一夹具跑一次、把返回值与 `updaterLog` 行序列**冻结进测试常量**，再改代码（顺序倒置则样本不可信）——样本内容与夹具定义记批次档 §5。

**只能人工验证的条目（如实标注）**

- AC1 / AC4 / AC5 的交互观感（点击手感、菜单目视顺序、dev 点击行为）——真机人工；其机器证据（静态守卫、结构对照、日志行）如 §3.1 所列。
- AC2 的「无自动可见窗口」——真机窗口枚举人工执行（辅助计数不可替代目视）。
- AC6 的发布门项（真实安装 / 自更新全流程）沿用 B02/B05 的既有判定面，本批只做代码路径对照（T8 另计）。
- **B07 人工项**：AC9 / AC10 / AC11 / AC13 / AC14 / AC16 的 UI 观感与真机行为（对话界面是否出、浏览器是否拉、通知 / 菜单项行为、十面回归）——真机人工；其机器证据（日志行 / 静态判据）如 §3.1 所列。
  AC12 的「无可感周期性顿挫」为主观体验项，但已由**机检硬判据**（`*Sync(` = 0 处）承重（真机只看无回归）。

**B09 待用户追认项**（非 open——设计已定，用户可在评审时改判）：

- **DD-29**：阈值取 8 s（= 投影缓存写后阈值 5000 ms + 3000 ms 余量；有效时延 8–13 s）；
- **DD-30 / DD-31**：判定源 = Harness 会话投影缓存（`turnBoundary.openTurnStartSeq`）；判定源不可用 ⇒ 退回 30 s + 一条诊断行；
- **DD-33 / L-B09-4**：mtime 新鲜度只作兜底、承重判据 = 「阈值 > 写后阈值」这一前提（Harness 侧配置变更即使其失效）；
- **L-B09-1（U-13）**：等待用户确认期间不再收到提醒（现状会收到一条语义错误的「已完成」）——本批接受。
- **B07 不可机检 / 需构造的项**：TC-31（回落）靠 env 强制；TC-35（日志流打不开）靠隔离 userData 权限构造；TC-40 / TC-41（回落与 watcher 异常）在 Windows 上需人工构造（临时改路径 / 删监视根）——一律如实标注为人工执行，不伪报机检。
- **B09 人工项**：AC18 / AC19 / AC20 的真机行为与时延计时（工具调用期零提醒、开关与补发、时延区间）——真机人工；其机器证据（诊断行 / 静态判据）如 §3.1 所列。
  TC-48 / TC-53（规则③·④ 构造与多会话时序）在 Windows 上需人工构造或桩测，一律如实标注，不伪报机检；TC-49 / TC-50 的构造面仅需 env 与隔离 `DSH_HOME`（无源码改动）。
- **B10 人工项**：好感度条与兑换屋余额的**增长观感**（口径 B 的可见后果）为真机人工；其机器证据 = AC21–AC25 的夹具判据 + `affinity.json` 的 `usage` 增长（文件面）。
  TC-62 的「权限不可读」在 Windows 上需人工构造（只读目录 / ACL），如实标注，不伪报机检。
- **B12 人工项**：AC28 的③（本地注入恶意注册表条目后的弹窗目视 / DevTools 断言）与 AC29 的真机面（3727 项目录下开市场 / 刷新状态的顿挫感）为真机人工；其机器证据（静态判据 + 桩测，含 TC-77 / TC-78 / TC-81）如 §3.1 所列。
  TC-83（`node_modules` 不可读）在 Windows 上需人工构造（只读目录 / ACL），如实标注，不伪报机检。

---

## 四、变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-16 | 初版：B06 桌面壳 UX 整合设计——需求层回指（US-1…US-7、NFR-1…NFR-4）、方案选型对比（A 桌宠按键 / B 托盘结构 / C 启动形态 / D 更新门禁 / E 拆分方案）、契约与结构（桌宠交互 / 窗口显示 / 托盘明细 / 向导删除 / 门禁口径 / 拆分架构与迁移计划）、受影响文件全清单、关键决策 DD-1…DD-14、冲突点核对与观察项、UI 决策 U-1…U-9、测试层（AC1…AC7 判定细化 + 用例 TC-1…TC-20）。 |
| 2026-09-16 | **追加 F7（无用文件清理）**（主 agent 裁定并入本批；依据 = 用户指示「删 1-5」）：新增选型 F（白名单精确删除）、§2.2.7（删除 / 保留清单与判据）、影响文件表三条删除行、DD-15、C16、AC8、TC-21…TC-23、观察项 O7（`THIRD-PARTY-NOTICES.md:53-54` 陈旧提及）；§一 回指表 / §2.1 判据域 / 静态核对清单同步为 US-1…US-8。 |
| 2026-09-16 | **评审修正轮 1**（#2–#12、#14；#13 无改动）：F2 补 `ready-to-show` 向导显块；AC3 五符号 + AC3 / AC5 / AC7 / §3.3 判据范围排除；AC8 / TC-21 零 diff 限 F7 自身；§2.2.6 逐档预估 + >300 档结论 + 覆盖核对 + 注 S4；macOS `activate` 改经 `showMainWindow()`（+ L3 / TC-26）；§3.1 NFR 回指；§2.3 / §2.5 as-of 注；L1 并入追认；DD-16 / U-10；TC-24 / TC-25。 |
| 2026-09-16 | **修正轮 1 遗留项：行宽**——§2.2.6 `shell-pet-geometry.js` 行函数枚举移入注 S4（行内改「函数清单见注 S4」）；`docs/design/AUTO-UPDATE.md` TC-16 行示例路径缩短；两行均压至 ≤300 字符（语义不变）。 |
| 2026-09-16 | **实施期形态注（P0 落地后）**：§2.2.2 补零窗口建窗分支口径（`showMainWindow()` 经 `ready-to-show` 首帧就绪后才 `show` + `focus`，防露未加载空窗——实现 = `main.js:732-733`）；§3.1 AC1 机检措辞按实现形态（`e.button !== 0` 早退 ×2 + `(e.buttons & 1) !== 0` 位掩码 ×1）；均不改语义。 |
| 2026-09-17 | **B07 批次修订**（源 = `docs/batches/B07-harness-auth-compat.md` §1.3 C1–C6 / §1.4 R1–R6；权威需求 = `docs/requirements/SHELL.md` US-9…US-11 / NFR-5 / US-7 补注）：§一 回指表补 6 行；§2.1 增选型 **G**（主窗口 URL 契约）/ **H**（后端 stdout 处置）/ **I**（完成探测机制）/ **J**（F6 缺陷修复口径）； |
|  | §2.2 增 **2.2.8**（URL 契约与取证行）/ **2.2.9**（stdout 四加固）/ **2.2.10**（探测机制 + busy 口径改判 + 修正 B–E + L-B07-1…4）/ **2.2.11**（F6 修复 + 未绑定引用全扫）；§2.2.6 增注 S5 与取证锚点清单 B07 附注；§2.3 增 B07 受影响文件表； |
|  | §2.4 增 DD-17…DD-27；§2.5 增 C17–C26、L-B07 指针、O8–O14；§2.6 增 U-11 / U-12 与 B07 open / 追认项；§3.1 增 AC9–AC16 与三方条目映射；§3.2 增 TC-27–TC-45；§3.3 增手段 8–10 与 B07 人工项。需求档修订同步落 `docs/requirements/SHELL.md`（US 8 → 11、NFR 4 → 5）。 |
| 2026-09-17 | **B07 定点更正（主 agent 复核裁定后）**：① busy 口径的**理由更正**（§2.2.10 / §2.4 DD-22 / §2.5 C17 / §2.6 追认项）——上轮所记「`pnpm-store/**` 下 2,302 个 `node_modules` 目录 ⇒ R4 等价性前提被否证」经三法复核**无法复现**； |
|  | 名为 `node_modules` 的目录 3 处（全在 `profiles/**`；`pnpm-store/` 0 处），取「任一段落」的理由改为「逐字忠实旧 skip 语义 + 单一谓词」；O8 由「待裁定」改为「已复核收口」（**决策不变**）； |
|  | ② **设计缺口补齐（判据可达性）**：新增 §2.2.8「落盘机制」与 §2.2.9 A5——`logStream` 提升模块级 + `writeDiag(line)` 双写 + `reason` 追踪（DD-27 / C26），否则 AC9 / AC15 的 `bigfish.log` 机检不可达；③ §2.3 B07 表的文档末行数按实测更正（SHELL.md **195** / AUTO-UPDATE **855**）；④ 计数与枚举同改（§一 回指表 5 → **6** 行；DD-17…DD-26 → **DD-17…DD-27**）。 |
| 2026-09-17 | **B07 修正轮 1**（源 = `docs/batches/B07-harness-auth-compat.md` §3 轮次 1 发现 #1–#7、#9；#8 已裁定不修）：§2.2.8 定稿**晚命中回收**（DD-28；`docs/requirements/SHELL.md` US-9 契约同步）＋「捕获参数与边界」表新增该态行； |
|  | §2.2.10 补**回落触发形态**（`fs.watch` 抛错 / 运行期 `error`，零 `process.platform`——#6）与**修正 B 判据的 as-of 扫描**（2 处命中均在待删死代码内——#4）；§2.3 统一 `shell-backend.js` delta 口径并补列 A5（#1）+ 单函数体量核对（#7）； |
|  | §2.4 增 **DD-28**；§2.6 追认清单补 **L-B07-2 / L-B07-3**（#2）；§3.1 AC15 判据改写 + 回指列补 US-9（#3 / #9）；§3.2 TC-31 承接「两条齐备」面 + TC-34 同判据同步。 补正 2（2026-09-17）：① 行宽压行（AC15 行 300 → 159 字符、细则移入表下注）+ 体量裁定落档（`shell-backend.js` ≈302）；② 本档行数 969 → **971**。 实施期形态注：DD-28 可达面 / 注 S1·S5 / 判据精度 / 实测回填；本档 → **972**。 |
| 2026-09-17 | **B09 批次修订**（源 = `docs/batches/B09-notify-latency.md` §1.3 前置事实 / §1.5 待决点 / §1.6 验收 AC1–AC4；权威需求 = `docs/requirements/SHELL.md` US-12 + NFR-5 B09 注记）：§一 回指表补 2 行；§2.1 增选型 **K**（阈值取值 K-1 + 判定源 K-2）； |
|  | §2.2 增 **2.2.12**（完成提醒判定面：实测证据 / 判定源六事实 / 判定前提 / 四态判定规则 / 执行面 / 降级与诊断行 / 交互表 / 修订面 / L-B09-1…4）；§2.2.6 增注 **S6** 与 **锚点 B09 附注**（新增 1 env 开关 + 1 条件行；常量值变更非新增）； |
|  | §2.3 增 **B09 受影响文件表**；§2.4 增 **DD-29…DD-33**；§2.5 增 **C27–C31** · **O15 · O16** · **L-B09 指针**；§2.6 增 **U-13** 与 B09 追认块；§3.1 增 **AC17–AC20** 与 B09 回指口径；§3.2 增 **TC-46–TC-55**；§3.3 增手段 11 与 B09 人工项。需求档修订同步落 `docs/requirements/SHELL.md`（US 11 → **12**；NFR-5 增 1 条注记）。 |
|  | 补正（2026-09-17，落档实测）：全文行宽 ≤ 300 字符（改后最宽 300）；§2.3 B09 表两处自指行按实测回填（`docs/requirements/SHELL.md` **217** / 本档 **1165**）。 |
| 2026-09-17 | **B10 批次修订**（源 = `docs/batches/B10-affinity-token-source.md` §1.3 勘察结论 / §1.5 待决点 / §1.6 验收 AC1–AC4；权威需求 = `docs/requirements/SHELL.md` US-13）：§一 回指表补 1 行；§2.1 增选型 **L**（L-1 读面形态 / L-2 聚合口径 / L-3 并存处置）； |
|  | §2.2 增 **2.2.13**（好感度数据面读口：读面四步判据 / 口径 B 累加判据句与样本算例 / 失败语义与容错表 / 水位语义 / 改动面 / 诊断行 / 读面开销与 L-B10-1…3）；§2.2.6 增注 **S7** 与 **锚点 B10 附注**； |
|  | §2.3 增 **B10 受影响文件表**；§2.4 增 **DD-34…DD-40**；§2.5 增 **C32–C35** · **O17–O19**；§2.6 增 **U-14** 与 B10 追认块；§3.1 增 **AC21–AC25** 与 B10 回指口径；§3.2 增 **TC-56–TC-67**；§3.3 增手段 12 与 B10 人工项。需求档修订同步落 `docs/requirements/SHELL.md`（US 12 → **13**；NFR 计数不变）。 |
|  | 补正（2026-09-17，落档实测）：B10 新增段落行宽 ≤ 300 字符（不含行尾 CR 口径；全文实测 **0** 行超 300）；§2.3 B10 表两处自指行按实测回填（`docs/requirements/SHELL.md` **217 → 250** / 本档 **1165 → 1349**——两批并行写入，口径与可分离面见 §2.3 行数口径注（B10））。 |
| 2026-09-17 | **B12 批次修订**（源 = `docs/batches/B12-market-security-blocking.md` §1.1 三项缺陷 / §1.3 范围 / §1.4 验收 AC1–AC6；权威需求 = `docs/requirements/SHELL.md` US-14 / US-15 + NFR-6 / NFR-7）：§一 回指表补 3 行；§2.1 增选型 **M**（M-1 入参门 / M-2 越界校验 / M-3 弹窗文本化 / M-4 扫描复用 / M-5 验证落点）； |
|  | §2.2 增 **2.2.14**（插件市场安全与扫描契约：三项缺陷证据表 / 入参门判据句与 3725 形态零误拒实测 / 越界校验判据句与「不做 realpath」理由 / 两层关系 / 拒绝消息形态 / 弹窗文本化判据与「外部数据 vs 常量」裁定表 / 扫描契约与等价性论证 / 行为差异表 / 改动面清单 / L-B12-1…3）；§2.2.6 增注 **S8** 与**锚点 B12 附注**（零新增日志行 + 导出面 +3）；
|  | §2.3 增 **B12 受影响文件表**（含 `market.js` 500 行硬限的净行数 ≤ 0 约定）；§2.4 增 **DD-41…DD-47**；§2.5 增 **C36–C39** · **O20–O23** · **L-B12 指针**；§2.6 增 **U-15** 与 **B12 追认块**； |
|  | §3.1 增 **AC26–AC31** 与 B12 回指口径；§3.2 增 **TC-68–TC-86**；§3.3 增手段 13 与 B12 人工项。需求档修订同步落 `docs/requirements/SHELL.md`（US 13 → **15**、NFR 5 → **7**）。 |
|  | 补正（2026-09-17，落档实测）：B12 新增段落行宽 ≤ 300 字符（不含行尾 CR；全文实测 **0** 行超 300、最宽 **300**）；§2.3 B12 表两处自指行按实测回填（`docs/requirements/SHELL.md` **250 → 299** / 本档 **1349 → 1601**——口径同 §2.3 B10 行数口径注）。 |

