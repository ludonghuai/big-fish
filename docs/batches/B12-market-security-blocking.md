# B12 —— 插件市场的安全与阻塞三项

> 六段制批次档（每段一位作者、append-only）：§1 主 agent · §2 eng-designer · §3 评审子代理 · §4 主 agent · §5 eng-coder · §6 主 agent。

## §1 批次立案（主 agent）

### 1.1 立案背景

接手代码面只读体检（子代理 2026-09-17）报出三项互相咬合的缺陷，**主 agent 已逐条亲读源码验证**（非采信报告）：

**① 🔴 路径穿越 ⇒ 任意目录递归删除**（`shell-plugins.js`）

| 行 | 事实 |
|---|---|
| `:312` | `bundledName = String(spec).replace(/^builtin:/, '')` —— 入参 `spec` **零校验** |
| `:313` | `bundledSource = path.join(bundledPluginsDir(), bundledName)` —— `path.join` **归一化 `..`** |
| `:314` | `if (fs.existsSync(bundledSource))` —— 逃逸路径（盘根/上级）必然存在 ⇒ **进门** |
| `:316-319` | `target = path.join(profileDir(), 'node_modules', bundledName)` → `fs.rmSync(target, {recursive, force})` → `fs.cpSync(bundledSource, target, {recursive})` |
| `:358-362` | `uninstallPlugin(pkgName)` **同形**（同样零校验 + 递归删） |

- **影响面**：`target` 可归一化至 **`<DSH_HOME>`（`~/.dsh`）或更高**——含 `sessions/` · `profiles/` · **`.credentials.yaml`** · `settings.yaml` ⇒ **递归删除用户全部会话与 API 凭据**；随后 `cpSync` 再把逃逸源整目录拷入。
- **可达链**：`market:install` IPC（`shell-ipc.js:25`）← 渲染层 `marketAPI.install`（`market-preload.js`）← **用户在插件市场点条目**（spec 来自**第三方注册表** `awesome-dsh-plugin.com`，实测 3727 条）。
- **修复面小**：同档**已有** `isPlainPackageName()`（`:99-106`）并被 `addBundle` / `marketEnable` 使用 ⇒ 两处各加一道门 + 归一化后越界校验。

**② 🔴 注册表数据经 `innerHTML` 注入（XSS）⇒ 直连 ①**

- `market.js:286-290`：`confirmModal(title, html)` → `body.innerHTML = html`。
- 调用点 `:296-302`：把 `${p.name}`（第三方注册表字段，**未消毒**）插值进该 HTML。
- ⇒ 恶意条目的 `name` 含 `<img src=x onerror=…>` 时，**用户点开即在该渲染进程执行脚本**；该进程持有 `marketAPI`（install / uninstall / restart / update）⇒ **无需额外动作即触达 ①**。

**③ 🔴 主线程同步阻塞（可感知卡顿的直接根因）**

- `shell-plugins.js:152-177`：循环体内**逐项**调用 `resolveInstalledName(spec)`（`:109-123` → `:111 listInstalledPlugins()` = `readdirSync` + 逐项 `statSync`）与 `isPluginInProfile`（→ `:52` 同步读 + `JSON.parse`）。
- 注册表实测 **3727 项** ⇒ 每次 `market:list` / `market:state` 约 **3.7k 轮同步 fs**，全部跑在 **Electron 主线程**（与桌宠 16 ms 移动循环、拖动 8 ms tick 争线程）。
- 同类先例：B07 刚退役的 `~/.dsh` 同步全树遍历（NFR-5）。

### 1.2 任务来源

- 用户 2026-09-17：「我的项目是后来接手的……**检查代码是否有优化改进空间**」+「**听你的，你可以有非常合理的安排**」。
- 承接：需求池 **R11**（接手项目规范化）第 0 步「只读体检」的**前三条结论**落地批。
- 台账：**T18**（穿越）· **T19**（阻塞）· **T20**（XSS）——本批承载。

### 1.3 范围

**做**：

1. **入参门与越界校验**（`shell-plugins.js`）：`installPlugin` / `uninstallPlugin` 对 `spec` / `pkgName` 走 `isPlainPackageName` 门；**并在 `path.join` 之后做归一化越界校验**（`target` 必须落在 `profileDir()/node_modules` 之下；`bundledSource` 必须落在 `bundledPluginsDir()` 之下）——白名单是主防线，越界校验是纵深防御（防未来形态变化）。
2. **市场弹窗文本化**（`market.js`）：把注入 `innerHTML` 的插值改为文本节点（或对插值转义）；**UI 外观与文案保持不变**。
3. **扫描提到循环外**（`shell-plugins.js` 的 `computePluginUpdates`）：单次扫描 + 复用；**判定语义与逐项结果逐字不变**。

**不做（边界）**：

- 不改 IPC 通道名 / 参数契约 / 返回值形态；
- 不改 `market:update-all` 的编排语义、不改注册表来源与回退链；
- 不引入**新依赖**、不新增构建步骤；
- 不做「注册表签名校验 / 宿主白名单」等更大机制（另议；体检已记录在更新链信任面）。

### 1.4 验收标准（初拟，供设计细化并给可机检判据）

| # | 验收标准（可机检 / 可桩测） |
|---|---|
| AC1 | `installPlugin('../../..')` / `uninstallPlugin('../../..')` ⇒ `ok:false`，且 **fs 零改动**（桩测断言目标未被删/拷） |
| AC2 | `isPlainPackageName` 门覆盖负例：`..` · `../..` · `/abs` · `C:\` · `github:` · `link:` · `file:` · `@scope/..`；正例：合法 npm 名 · `@scope/name` 放行 |
| AC3 | 越界校验独立有效：构造绕过白名单的入参 ⇒ `target` 不在 `node_modules` 之下时拒绝，**不执行任何 fs 写/删** |
| AC4 | 恶意 `name`（含 HTML/script 形态）在市场弹窗中**只以文本呈现**、不执行（桩测：断言无新增元素节点） |
| AC5 | `computePluginUpdates` 对 N 项注册表只做**常数次**目录扫描（计数器桩断言），且**逐项判定结果与改前一致**（同输入同输出对照） |
| AC6 | 零新依赖 · 改动 js 全部 `node --check` 绿 · 市场既有文案/交互不变 |

### 1.5 关联与时效

- 需求档：`docs/requirements/SHELL.md`（归属由 eng-designer 判定；US-7 附近为插件域）
- 设计档：`docs/design/SHELL-UX.md`（落点由设计判定；**不得修改 B07 已核销判据行**，B09/B10 正在同档追加，只做追加不重排）
- **时效**：用户尚未发布 v0.0.1（台账 T11）⇒ **建议本批在发版前完成**（发布即带该路径）

---

## §2 本批任务书（eng-designer）

### 2.1 本批条目（三方一致源——硬）

| # | 本批条目 | 需求档条目 | 设计档验收 | 交付面 |
|---|---|---|---|---|
| I1 | 入参三形态白名单门（`installPlugin` / `uninstallPlugin`，覆盖 `market:install` / `uninstall` / `update` / `update-all`） | `docs/requirements/SHELL.md` **US-14** | `docs/design/SHELL-UX.md` §3.1 **AC26 · AC27** | `shell-plugins.js` |
| I2 | `path.join` 之后越界校验（`target` ⊂ `profileDir()/node_modules`；`bundledSource` ⊂ `bundledPluginsDir()`；词法判定、不做 `realpath`） | **US-14** | **AC27** | `shell-plugins.js` |
| I3 | 拒绝消息形态（`{ok:false,message}`，**不含绝对路径**，只回显入参前 60 字符） | **US-14** | **AC31** | `shell-plugins.js` |
| I4 | 市场弹窗文本化（节点构造 + `innerHTML` 清零；外观与文案逐字不变） | **US-14** | **AC28** | `market.js` |
| I5 | 扫描提到循环外（单次请求一次快照 + 复用；逐项判定零回退） | **US-15** | **AC29** | `shell-plugins.js` + `shell-market.js` |
| I6 | 零回退面（零新依赖 / 语法绿 / 四文件零 diff / `market.js` ≤ 500 行 / IPC 契约零改动） | **US-14 · US-15 · NFR-3 · NFR-6 · NFR-7** | **AC30** | 全部改动面 |

> **三方一致**：§2 本批条目（I1–I6）= 设计档 **AC26–AC31** 回指条目 = 需求档 **US-14 / US-15**（并含 NFR-6 / NFR-7）。
> §1.4 的 AC1–AC6 → 设计 AC26–AC31 的映射：**AC1→AC26 · AC2→AC27 · AC3→AC27 · AC4→AC28 · AC5→AC29 · AC6→AC30**；**AC31** = 本批新增（拒绝消息形态——§1 交设计裁定项「拒绝时的错误消息与返回值形态」的落点，§1.4 未列）。
> 需求档归属 = `docs/requirements/SHELL.md`（判定见 §2.7）；设计档落点 = §2.1 选型 M（M-1…M-5）+ §2.2.14（机制节）+ §3.1 AC26–AC31 + §3.2 TC-68–TC-86 + §3.3 手段 13。

### 2.2 §1「交设计裁定项」逐项裁定

| # | §1 交裁定项 | 本批裁定 | 依据（设计档落点） |
|---|---|---|---|
| ① | 两层防御的形态：哪层是主防线 / 判据句 / 拒绝形态 / 是否抽公共 helper | **主防线 = 入参三形态白名单**（复用 `isPlainPackageName`；形态 = `builtin:`+纯包名 / 裸纯包名 / `github:owner/repo[#片段]` / `[scope/]name[@版]`）；**第二层 = `path.relative` 词法包含判定**（纵深，防形态演进）。（余文见 §2.9 注①） | §2.2.14「入参门判据句」/「越界校验判据句」/「两层关系」/「拒绝消息形态」；DD-41 · DD-42 · DD-44 |
| ① 附 | 白名单对真实数据的误拒面（本批风险点） | **3725 个推导标识实测零误拒**（含 1832 个 `github:`、491 个 scoped、**139 个 `github:…#path:/…` 子目录形态**）；注册表 `npm` 字段非纯包名条目 = 0；`version` 形态异常 = 0 | §2.2.14「零误拒实测」（设计者本轮亲跑；含一次修订教训——`#` 片段必须放开 `[A-Za-z0-9._:@/-]`，否则误拒 139 条） |
| ② | XSS 修复形态 + 同类 `innerHTML` 扫描 + 「外部数据 vs 常量」判据 | **结构面修**：`confirmModal(title, okLabel, ...parts)` 改收节点（`frag()` 收字符串/节点；字符串永走 `createTextNode`）（余文见 §2.9 注②） | §2.2.14「弹窗文本化判据句」+「外部数据 / 常量裁定表」；选型 M-3；DD-43；C39 |
| ③ | 阻塞修复形态 + 「判定结果与改前一致」对照判据 + 是否引入短期缓存 | **请求内单次快照 + 复用**（`scanProfile()` ⇒ `{names,nameSet,bundles,entries,versions}`，经**可选** `ctx` 尾参下传）；（余文见 §2.9 注③） | §2.2.14「扫描契约」+「等价性论证」（`names` 逐条等价 / `isPluginInProfile` 深度 ≤ 2 等价 / `installedPluginVersion` 记忆）；选型 M-4；DD-45 |
| ④ | AC + TC 细化（可机检 / 可桩测） | **AC26–AC31**（判据全文见 §3.1，枚举面见该表下「B12 判据细化」注①–③）+ **TC-68–TC-86**（正常 / 边界 / 异常；含穿越形态枚举负例、恶意 `name` 三形态、N=3727 计数对照） | §3.1 / §3.2 |
| ⑤ | 是否落回归测试 | **落** `tests/b12-plugin-guards.test.js`（`node --test`；**零第三方框架 / 零依赖**：`node:test` + `node:vm` + `node:fs`）；运行命令 = `node --test tests/b12-plugin-guards.test.js`；**不登记 `package.json`**（门禁接入属 T4）、**不入 `build.files`**。寿命口径 = ① 开发期工具（批次收口逐条判处置，默认退役——落批次档 §6） | 选型 M-5；DD-46；§3.3 手段 13 |
| ⑥ | 受影响文件清单 + 需求档条目 | 见 §2.5；需求档 = US-14 / US-15 + NFR-6 / NFR-7（**未改写任何既有已核销条目**；B07 已核销判据行零改动） | §2.3 B12 表 / §2.5 |

### 2.3 覆盖需求（US-14 / US-15 / NFR-6 / NFR-7 逐条 → 设计落点）

| 需求契约点 | 设计落点（`docs/design/SHELL-UX.md`） |
|---|---|
| US-14 入参门（三形态 + 覆盖四条 IPC 链 + 零误拒） | §2.2.14「入参门判据句」+ 零误拒实测 + §3.1 AC26·AC27 |
| US-14 越界校验（严格包含 / 词法 / 不 `realpath`） | §2.2.14「越界校验判据句」+ 两层关系蕴含论证 + §3.1 AC27 |
| US-14 弹窗文本化（`innerHTML` 清零 / 外观文案不变） | §2.2.14 弹窗判据句 + 外部数据/常量表 + §3.1 AC28 |
| US-14 拒绝消息形态（不含绝对路径） | §2.2.14「拒绝消息形态」+ §3.1 AC31 |
| US-15 扫描次数与 N 解耦 | §2.2.14「扫描契约」+ §3.1 AC29 |
| US-15 判定零回退（黄金样本 + 日志行不回退） | §2.2.14 等价性论证 +「取证锚点不回退」+ §3.1 AC29 |
| NFR-6 不可信输入面（不进路径拼接 / 不进 HTML 解析面） | §2.2.14 全节 + NFR-6 度量方式（静态 + 桩测 + 真机） |
| NFR-7 扫描开销解耦（计数器判据） | §2.2.14「扫描契约」+ NFR-7 度量方式（N=2 与 N=3727 计数相等） |

### 2.4 明确出批（本批不做）

- 不改 IPC 通道名 / 参数契约 / 返回字段（`shell-ipc.js` 零 diff）；不改注册表来源与回退链；不改更新判定语义（入选条件 / 版本比较 / `github:` 重装口径 / 日志行）；
- 不做**注册表签名校验 / 更新 URL 宿主白名单**（体检另记，属另批）；不做 `<a href>` 协议守卫与市场窗口 `will-navigate` / `setWindowOpenHandler` 守卫（登记 **O20**）；不改 `market.html`（含其 CSP 与文案）；
- 不改 `exchange.js`（常量源，判定见 §2.2 ②）；不改 `market-preload.js` / `market-update.js` / `plugins.json`；
- 不做 `realpath` / 符号链接感知（登记 **L-B12-1**）；不做异步化改造（选型 M-4 候选 4 已否决）；
- 不引新依赖、不新增构建步骤；`package.json` 的 `dependencies` 与 `build.files` 零 diff；
- **禁碰**：`docs/TODO.md` / `docs/README.md`（主 agent 写域）· `docs/design/AUTO-UPDATE.md` / `docs/requirements/UPDATE.md`（B08 面）；不代他批改任何档。

### 2.5 受影响文件（行数 = 换行符计数；行宽判据 = 不含行尾 CR）

| 文件 | 当前行数 | 改动点 | 末行数 |
|---|---|---|---|
| `shell-plugins.js` | 396 | 新增 `installSpecKind()` / `isInsideDir()` / `scanProfile()`；六个既有函数增可选 `ctx`（清单见 §2.2.14 注 S8）；`installPlugin`（`:311-322`）/ `uninstallPlugin`（`:358-365`）加入参门 + 越界校验；导出面 +3 | ≈461 → **实施期实测回填** |
| `shell-market.js` | 196 | `marketList`（`:80-91`）/ `marketState`（`:95-102`）各建一次快照并下传 | ≈198 |
| `market.js` | **500** | `el()` 变参 / 新增 `frag()` 与段落 helper / `confirmModal` 改收节点 / 三处调用点改节点构造 / 三处清空改 `textContent=''` | 净 **≤ 0** → **≤ 500（硬限——NFR-3）** |
| `tests/b12-plugin-guards.test.js`（新） | 0 | 三层夹具（守卫面 / XSS 面 / 扫描面） | ≈260（不入 `build.files`） |
| `docs/requirements/SHELL.md` | 250 | US-14 / US-15 / NFR-6 / NFR-7 / B12 批次目标与层级注 / 头部关联与条目区间 / 变更记录 2 行 | **299**（落档实测） |
| `docs/design/SHELL-UX.md` | 1349 | 回指表 +3 行 / 选型 M / §2.2.14 / 注 S8 + 锚点 B12 附注 / §2.3 B12 表 / DD-41…DD-47 / C36–C39 · O20–O23 · L-B12 / U-15 与追认块 / AC26–AC31 / TC-68–TC-86 / 手段 13 / 变更记录 | **1601**（落档实测） |

**行数 / 行宽实测（本角色落笔后）**：`docs/requirements/SHELL.md` = **299** 行、最宽 **276**、超 300 行数 = **0**；`docs/design/SHELL-UX.md` = **1601** 行、最宽 **300**、超 300 行数 = **0**（两档自指行已按实测回填——承 D6 / D7）。

### 2.6 验收判据（可机检清单——与设计档 AC26–AC31 同源，判据全文见 §3.1）

| 验收 | 判据（可机检） |
|---|---|
| AC26 | 穿越形态枚举（12 形）⇒ 全部 `{ok:false}`；两侧夹具 fs **零改动**（存在性 / 内容哈希 / manifest）；无子进程（计数 = 0） |
| AC27 | 白名单正负例（谓词组）放行 / 拒；`isInsideDir` 真值表（`nm/a` true · `nm/../..` false · `nm` 自身 false · `bundled/x` true · `bundled/../profiles` false）；两处 `path.join` 后各有一次包含判定调用（grep） |
| AC28 | 静态：`market.js` 全文 `innerHTML` = **0**；三处 `confirmModal(` 第二实参非字符串。桩测：`node:vm` + DOM 桩 ⇒ 恶意 `name` 三形态只产生文本节点。真机人工：注入恶意条目 ⇒ 弹窗只显文本 |
| AC29 | 计数器：同一夹具 N=2 与 N=3727 的 `readdirSync` / `statSync` / `readFileSync` **计数相等**；`node_modules` 的 `readdirSync` = 1 / 次调用。黄金样本：返回值逐字段 + `updaterLog` 行序列逐字相等 |
| AC30 | `package.json` 零 diff；改动文件 `node --check` 全绿；`market.html` / `market-preload.js` / `market-update.js` / `exchange.js` / `shell-ipc.js` 零 diff；`market.js` ≤ **500** 行 |
| AC31 | 两类拒绝消息匹配 `^无效的插件标识：` / `^插件标识越界，已拒绝：`；不含 `[A-Za-z]:[/\\]` 与三个基准目录取值 |

### 2.7 归属与判据句（指针——全文在设计档，本节不重述，D2）

- **需求档归属 = `docs/requirements/SHELL.md`**：判据 = ① §二 排除句明指「**dsh web 应用内部**内容页」，壳自有市场窗口（`market.html` / `shell-market.js` / `shell-plugins.js` 安装通道面）不在排除范围；② §二「跨批不得回退项」已含「市场 / 兑换屋窗口」；③ 模块面 = `shell-plugins.js` 为 B06 F6 拆分的 `shell-*.js` 之一（桌面壳层）。
  **未触发「归属不明 ⇒ 停下打回」分支**（对该排除句加**层级注**说明，原句不改——落 SHELL.md §二）。
- **三项修复的判据句**（原文见 `docs/design/SHELL-UX.md` §2.2.14）：① 入参门判据句（三形态 + 拒绝形态）；② 越界校验判据句（严格包含 + 词法判定 + 不 `realpath` 理由）；③ 弹窗文本化判据句（`innerHTML` 0 处 + `frag()` / `el()` 变参语义）；④ 扫描判据句（1 次扫描 / 与 N 无关 / 等价性论证）。
- **行为差异（有意变更）**：越过入参门的入参从「执行 fs / 起子进程」变为「拒绝」；未解析的 `github:` 卸载面收紧为拒绝（卸载面合法输入 = 已装纯包名）；同一请求内的重复读变为**一致快照**；新增两类拒绝消息（走既有失败 toast 渲染面，**无新用户面文案**）——四条全文见 §2.2.14「行为差异表」。

### 2.8 实施顺序（硬）与报告项

- **实施顺序（硬约束，顺序倒置即样本不可信）**：① **先在改前代码上**用同一夹具跑一次 `computePluginUpdates`，把返回值与 `updaterLog` 行序列冻结进 `tests/b12-plugin-guards.test.js` 的期望常量（黄金样本）；② 再改代码；③ 跑 `node --test tests/b12-plugin-guards.test.js` + 静态判据组。样本内容与夹具定义回填批次档 §5。
- **计数同步（D3）**：SHELL.md US **13 → 15** / NFR **5 → 7**；SHELL-UX.md 回指表 +3 行、选型 +1 组（M-1…M-5）、AC +6、TC +19、DD +7、C +4、O +4、U +1、注 S8、锚点附注 1 条。
- **报告项 O20**：`market.js:254-258` 把注册表字段 `p.url` 直接赋给 `<a href>`（点击路径已由 `preventDefault` + 主进程 `^https?://` 判据兜住，但中键 / 新窗与导航守卫未设）——与「更新 URL 宿主白名单」同族，**本批不改**。
- **报告项 O21**：`docs/design/AUTO-UPDATE.md` §2.2.5 / §3.1 AC10 与 `docs/requirements/UPDATE.md` US-7 的更新判定面在本批后新增**前置条件**（入参门）——该两档写权不在本角色（B08 面禁碰），提请主 agent 处置。
- **报告项 O22**：**内置插件「一键安装」路径当前不可达**——`normalizePlugin`（`market.js:99-103`）只从 `install` 字段提取 `add …` 之后的标识，而内置条目 `install` 被构造为字面量 `'builtin:' + n`（`market.js:451`）⇒ `installSpec` 为 `undefined`（设计者模拟实跑确认）⇒ 渲染面走「不可一键安装」分支（`:275` 的「一键安装」标签为死码）。
  **本批不改**（超范围；`installPlugin('builtin:<名>')` 经 IPC 仍可达——本批的门正是守这条 IPC 面）。
- **报告项 O23**：`shell-market.js:127` / `:131` 的 `console.log` 调试行在 `market:enable` 路径上各调一次 `listDisabledPlugins()` / `profileBundles()`（**为打日志而扫描**）——同属「主进程扫描开销」家族，本批不改。
- **观察项（CSP 事实注记）**：`market.html:5` 已设 CSP（`default-src 'self' data:`，无 `unsafe-inline`）⇒ 按规范内联事件处理器与 `javascript:` URL 应被阻断（**未实机实测**）；本批判据不依赖该结论（修的是**注入面**）——全文见 §2.2.14「事实注记」。
- **流程项**：本批对 `docs/requirements/SHELL.md` / `docs/design/SHELL-UX.md` **只做追加**，未重排、未改他人已落内容、**未改动 B07 已核销判据行**（逐条核对：所有落笔均为新增行 / 新增节 + 既有两个自指行的实测回填）。
- **本段写入状态**：§2 **已写入**（经 `batch_segment`，无路径参数；内容为上述 §2.1–§2.8）。

### 2.9 行宽压行（§2.2 表长单元格下沉 + §2.7 / §2.8 就地断行）

**本轮压行（形态修正——语义逐字不变；承「残留即示范」）**：上一轮本角色落笔后实测 §2 有 **5** 行超 300 字符（`:98` 433 / `:100` 453 / `:101` 372 / `:154` 306 / `:164` 313；判据 = 不含行尾 CR 的字符数；§1 全部 ≤ 300）。
本轮就地压行：三处表行把长单元格的余文下沉到本节（行内改留节内指针），两处条目行就地断为续行——内容逐字不删、无语义改动。

**实测（压行后）**：§2 段内最宽 **298**（`:103`，整档最宽同值）；§2 超 300 字符行数 = **0**；整档超 300 字符行数 = **0**（§3 段头无正文）；本档 **197** 行（换行符计数——与 §2.5 行数口径同）。

本节 = §2.2 表 ①②③ 行「本批裁定」单元格的**下沉余文**——行内保留段 + 本注逐字拼接 = 原单元格全文（零删减）：

**注①（§2.2 ① 行余文）**：**拒绝形态 = `{ok:false,message}`，不含绝对路径**。**抽两个纯函数 helper**：`installSpecKind(spec)`（形态门）+ `isInsideDir(child,base)`（包含判定），随 `module.exports` 导出（桩测机检用，无副作用）

**注②（§2.2 ② 行余文）**：，`el()` 改变参（单字符串 ⇒ 旧语义），清空面改 `textContent = ''` ⇒ **`market.js` 全文 `innerHTML` = 0 处**。**判据 = 来源是否在本仓源码内**：注册表字段 ⇒ 修（`market.js:296-302` / `:326-330` / `:354-358`）；`exchange.js:39-46` 插值源 = 主进程硬编码 `FOODS`（`shell-affinity.js:34-38`）+ 本地数字 ⇒ **常量源，不改**

**注③（§2.2 ③ 行余文）**：**不引入跨请求缓存**（失效面为零；快照生命周期 = 单次 IPC 调用）。**对照判据 = 黄金样本**：同一夹具下 `computePluginUpdates` 返回值逐字段相等 + `updaterLog` 行序列逐字相等

**就地断行（无下沉余文）**：§2.7 需求档归属行 / §2.8 报告项 O22 行 = 叙述性条目，压行 = 就地断为续行，全文逐字留在原位（本注不重述——D2）。

上一轮本节的 5 个「压行版」副本块已移除：①②③ 由上述逐字余文取代；归属行 / O22 两块为改写措辞的副本，其正文即 §2.7 / §2.8 的原位行。

## §3 设计评审（评审子代理）

## §4 评审裁决与实施启动（主 agent）

## §5 实施记录（eng-coder）

## §6 验收核销（主 agent）。
