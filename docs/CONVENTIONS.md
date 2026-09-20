# CONVENTIONS —— 本仓代码规范（Bigfish）

> 本档是本仓**代码形态的唯一权威句**（写什么形态）。三处分工，互不重述：
> ① 流程 / 写权 / 门禁 → `AGENTS.md`（唯一详述处）；② 文档落点约定与清单 → `docs/README.md`（唯一详述处）；③ **代码形态 → 本档**。
> 本档不重复 ① ② 的内容，只给指针；**禁止绝对化断言**——凡「现状」陈述一律带实测口径（数字 / 文件数 / 行号，as-of **2026-09-17**），把现状写成「全都一致 / 都已统一」一类即与实证相抵。
> 变更记录见文末。

---

## 零、现状基线（实测，as-of 2026-09-17）

| 面 | 实测 | 口径来源 |
|---|---|---|
| 跟踪路径 | **161** 条（`git ls-files`，as-of 2026-09-17，本批 6 档落档后）；命名分布见 §二 | 口径 = 仓库**跟踪路径总数**（随批次落档递增——引用时以当次 `git ls-files` 输出为准）：154（§1.3 ① 体检轮）→ 155（B11 起草时刻）→ **161**（见下注） |
| 代码档 | **41** 个 `.js` + **1** 个 `.mjs` = 42 档 / **6,679** 行 | 逐档行数统计 |
| 文本档 | **93** 档（另 62 档为二进制/资源） | `git ls-files --eol` |
| EOL | **索引（仓库真值）全 LF**；工作区 = **51 LF / 42 CRLF** | 同上 + 逐档字节比对 |
| 末行换行 / 行尾空白 / Tab 缩进 | 93 档**全部**已带末行换行 · **0 行**行尾空白 · **0 档** Tab 缩进 | 逐档扫描 |
| 注释语言 | 抽样 20 个根 `.js`：中文为主 **15（75%）** · 英文为主 3 · 混排 3 | §1.3 ②（体检 id=17 §4.3） |
| 门禁 | **3/3**（详述在 `AGENTS.md` §三，本档不复述） | §1.3 ⑥ |

**计数口径与漂移**（上表「跟踪路径」行）：跟踪路径总数随批次落档递增，本档只记 as-of 2026-09-17 的快照——
154（§1.3 ① 体检轮）→ 155（B11 起草时刻）→ **161**（本批 6 档落档后）。差额 6 = 本批产出：
`AGENTS.md` · `.editorconfig` · `docs/CONVENTIONS.md` · `docs/design/REPO-CONVENTIONS.md` · `docs/batches/B11-conventions.md` · `CHANGELOG.md`。
台账 / 地图的计数行由主 agent 维护（建议行见批次档 `docs/batches/B11-conventions.md` §2.10）。

---

## 一、文件头（标准形）

**标准形 = 推荐形（写作面；取自 B04/B06 世代的逐字同构形态，§1.3 ③；新档遵循、存量不追溯）**——判据见下三条：

```js
'use strict';
/**
 * <文件名>.js — <一句话职责>（<批次号>；设计档 docs/design/<主题>.md §<节>）。
 * <可选行：函数清单（注 S<n>） · 属主状态（跨模块读写的状态与出口） · 依赖方向>
 */
```

**`.mjs`（ESM）同形，但免判据 ①**：首行直接起 JSDoc 块（实测 `tests/update-stub.mjs:1` = `/**`，`:10` = `import`）——ESM 隐式严格模式，加 `'use strict';` 既无必要也非惯例。

三条判据：

1. **第 1 行**逐字 `'use strict';`——**适用范围 = `.js`（CJS）**；**`.mjs` 不适用**（ESM 隐式严格模式）。**推荐形**：JSDoc 紧随其后，中间不加空行。
2. **JSDoc 块（`/** … */`）在场** + 块内含**含路径**的设计档指针（指针形态细则见判据 ③）——位置：`'use strict';` 行之后起（`.mjs` 免判据 ① ⇒ 第 1 行起，实测 `tests/update-stub.mjs:1`）。
3. **设计档指针必须含路径**（D4 指针纪律）：写 `docs/design/<主题>.md §<节>`；**禁**「设计档 §x」式相对指针。

**推荐形（写作面；新档遵循，存量不追溯）**：JSDoc 首行 = `文件名 — 职责（批次；设计档 全路径 §节）`（模板见上）；职责写「本档负责什么」，不写实现细节。
合规面 4 处存量档为该形的**非逐字变体**（**非缺陷，不迁移、不追溯**；逐名与子形态见 §1.1）。

### 1.1 世代现状（as-of 2026-09-17，42 档）

| 面 | 档数 | 判据 |
|---|---|---|
| **合规面** | **22** | 判据齐备：`'use strict'` 第 1 行（**仅 `.js`**；`.mjs` 免——ESM 隐式严格，见 §一）+ JSDoc 块 + **含路径**的设计档指针 |
| 形态待迁移 | 3 | 有设计档指针但为**相对形态**（「设计档 §x」，无路径） |
| **前世代** | **17** | 无设计档指针 |

- **合规面 22 档（逐名）**：
  - 组合根 / 域档 4 档：`main.js` · `updater.js` · `harness-store.js` · `update-lib.js`。
  - `shell-*.js` 15 档（1/2）：`shell-affinity` · `shell-assets` · `shell-backend` · `shell-ipc` · `shell-market` · `shell-mode` · `shell-notify` · `shell-pet`。
  - `shell-*.js` 15 档（2/2）：`shell-pet-drag` · `shell-pet-geometry` · `shell-plugins` · `shell-settings` · `shell-tray` · `shell-update` · `shell-window`。
  - `tests/` 3 档：`harness-store.test.js` · `update-lib.test.js` · `update-stub.mjs`。
  - **合规面内的形态差异（4 处 · 非缺陷 · 不迁移、不追溯；as-of 2026-09-17）**：判据齐备、但非推荐形的逐字形态——
    `main.js`（`:2` 为空行、JSDoc 起于 `:3`；`:4` 首行 = 项目名 `Bigfish — …`，无「文件名 —」前缀）·
    `tests/harness-store.test.js:3` · `tests/update-lib.test.js:3` · `tests/update-stub.mjs:1-2`（三档 JSDoc 首行无「文件名 —」前缀，均带批次号 + 设计档全路径指针）。
    三分不变：**22 + 3 + 17 = 42**（判据 ② 的宽口径 vs 推荐形见 §一）。
- **形态待迁移 3 档（逐名）**：`update.js:2`（「设计档 §2.6」） · `make-latest.js:3`（「设计档 §2.2.8」） · `market-update.js:2`（「设计档 §2.2.5」；头部为 `/* … */` 而非 JSDoc 块——指针与块形双重不合标准形）。
- **前世代 17 档（逐名）**：
  - 根 / 脚本 6 档：`pet.js` · `market.js` · `exchange.js` · `afterPack.js` · `make-icons.js` · `scripts/ensure-deps.js`。
  - `*-preload.js` 4 档：`exchange-preload.js` · `market-preload.js` · `pet-preload.js` · `update-preload.js`。
  - `probe-*.js` 7 档：`probe-displays.js` · `probe-displays2.js` · `probe-position-accuracy.js` · `probe-resizable-setsize.js` · `probe-settle-scan.js` · `probe-size-readback.js` · `probe-straddle-size.js`；
    其 `'use strict';` **不在第 1 行**（实测第 4–6 行，头部为用途注释）。
- **计数校验**：22 + 3 + 17 = **42** = 41 个 `.js` + 1 个 `.mjs`（§零）；口径 = 逐档核头（as-of 2026-09-17）。
- **`tests/` 三档均在上表 22 档逐名清单内**：`tests/update-stub.mjs`（已单列）+ `tests/*.js` 另 2 档（`harness-store.test.js` · `update-lib.test.js`）——两处并列时**勿重复计数**。
- **ESM 注（判据 ① 的扩展名口径 · 主 agent 2026-09-17 已裁定）**：`tests/update-stub.mjs` 为 ESM（`.mjs`），无 `'use strict';` 行（实测 `:1` = `/**`，`:10` = `import`）⇒ **判据 ① 适用于 `.js`（CJS），`.mjs` 免**；
  该档合规性由**判据 ② ③** 承载（本无 `'use strict';` 行）——判据 ① 的扩展名口径**不改变**其归属（上表 22 档逐名含它），三分不变：22 + 3 + 17 = **42**（裁定与落点见 `docs/batches/B11-conventions.md` §2 修正轮 2）。
- 前世代 = **待迁移面**（**不是**合规面，不享「存量豁免」）。迁移判据 = 本 §一的三条判据；**迁移另批执行**（本批零 `.js` 改动，见 `docs/design/REPO-CONVENTIONS.md` §2.3 出批项 O2）。
- **B15 as-of 注（计数时效；源 = 附 B §B.2.7 ③）**：本节三分与逐名清单 = **as-of 2026-09-17 快照**；此后码档随各批增长（B15 as-of 2026-09-20 实测跟踪码档 **68** 档；`probe-pet-media.js` 未列入三清单——计数与枚举不符），且 B15 归位时 10 档迁移面已动（注见 §八）。**本批只加此 as-of 注、不重算全域**；全量重算归台账 T31 / B14 对账族。

---

## 二、命名

| 面 | 规则 | 实测（as-of 2026-09-17） |
|---|---|---|
| 代码档名（`.js` / `.mjs`） | **kebab-case**、全小写，扩展名小写 | 42 档：kebab-case **41** + 例外 **1**（`afterPack.js`——**camelCase**，electron-builder 钩子名，上游约定） |
| 文档 / 资源档名 | 沿用既有命名：`README` / `AGENTS` / `CHANGELOG` 类约定名 · 板块与批次号大写（`PET.md` · `SHELL-UX.md` · `docs/batches/B01-*.md`） | 161 条跟踪路径（§零）中非代码档 **119** = kebab **81** + 大写约定名 **30** + 中文名 **3** + dotfile **4** + snake_case **1**（`build/icon_background_removed.png`，构建中间产物） |
| 中文名文件 | 仅限**用户面文档**（`使用说明.txt` · `版本说明.txt` · `已知问题与排查.md`）——豁免；工程面档名一律 kebab-case | 同上 |
| 函数 / 变量 | lowerCamelCase | 例：`main.js:57` `isQuitting` · `main.js:76` `gotLock` |
| 模块级常量 | UPPER_SNAKE_CASE | 例：`main.js:46-49` `APP_NAME` · `HOST` · `READY_TIMEOUT_MS` · `IDLE_NOTIFY_MS`；`market.js:6` `CATEGORY_LABELS` |
| IPC 通道 | `<域>:<动作>` | 实测 12 条（`shell-*.js` 的 `ipcMain.handle`）：`market:install` · `market:state` · `market:update-all` · `affinity:buy` · `affinity:view` 等 |

**命名例外清单（既有 2 处 · 判据外，as-of 2026-09-17）**：`afterPack.js`（**camelCase**——electron-builder 钩子名，上游约定）· `build/icon_background_removed.png`（**snake_case**——构建中间产物）。
**除该例外清单外，现有 161 条跟踪路径中 camelCase / snake_case 零命中**（口径 = `git ls-files` 逐名核对；as-of 2026-09-17）；**新档一律按本节命名规则**，例外清单不随新档扩张（新增例外须用户裁定）。

---

## 三、注释语言

- **以中文为主**：实测抽样 20 个根 `.js` ⇒ 中文为主 **15（75%）** · 英文为主 **3**（`afterPack.js` · `make-icons.js` · `probe-displays.js`）· 混排 **3**（§1.3 ②）。
- **保留原文**的例外：第三方 API / 环境变量 / 协议名 / 上游术语（例：`DSH_BUNDLED_SKILL_DIR` · `userData` · `pnpm` · `BrowserWindow`）。
- 既有英文注释**不回溯改写**（属迁移面，随「下次动该档」的批次处理）；新增注释一律按本条。

---

## 四、模块与依赖注入

- **`main.js` = 组合根**（唯一装配点）：`main.js:60-71` 逐模块 `init(deps)` —— 模块之间不互取状态，依赖经 `deps` 传入。
- **`init(deps)` 形态**：15 个 `shell-*.js` 中 **11 档**具名导出 `function init(deps)`：
  - 具名 `init`：`shell-affinity` · `shell-backend` · `shell-mode` · `shell-notify` · `shell-pet-drag` · `shell-pet-geometry` · `shell-pet` · `shell-plugins` · `shell-tray` · `shell-update` · `shell-window`。
  - 无 `init` 的 4 档：`shell-ipc.js` 用 `register()`（通道 → 域处理器薄绑定）；`shell-assets.js` / `shell-settings.js` 为工具档；`shell-market.js` 为域实现档（经 `shell-ipc.js` 接线，无跨模块状态注入）。
- **结构判据三条 + 样本解耦判据一条（E）**（成文判据；**本表 = 判据句权威** —— 附 A §A.2.2.2 / 附 A-续 §A-B29.2.2 只承载机检口径与回指，不复述判据句；机检面 = `npm run lint` 的判据 D①②③ + E，机检**已落地**（2026-09-19）——设计与基线契约见 `docs/design/REPO-CONVENTIONS.md` 附 A §A.2.2.2 / §A.2.2.6）：

| # | 判据 | 判据句 | 口径与免检 |
|---|---|---|---|
| D① | 依赖无环 | 自研档的静态相对依赖图必须是 **DAG（0 环）** | 只认字面量 `require('.<相对路径>')`；边 = 解析到仓库内自研档 |
| D② | 域模块扇出 | **域模块**的静态相对 `require` **出度 ≤3** | 域模块 = 仓库内自研 `.js` / `.mjs` 去掉 `tests/` · `scripts/` · `probe-*` 后的档；组合根 `main.js` **免判**（装配面天然高扇出） |
| D③ | 接线点唯一（= §1.4-5 的 **T39 ②「装配面唯一」**） | 组合根 `main.js` 的每个绑定 `const <名> = require('<相对>')` 须有**恰一处** `<名>.init(` 调用 | **覆盖面 = 组合根绑定面**（未被 `main.js` 绑定者不入清单：实测其 17 条 require 之外 = `shell-assets.js` / `shell-market.js`）；面内不导出 `init` 的档列入**免检清单**（含理由）；未解析的 `require` 形态 = **红**（fail-closed） |
| E | 样本区解耦（B29） | **全仓引用面零命中 `samples/`（三式检测）+ `package.json` 的 `build.files` / `extraResources` 零登记 `samples`**；零命中恒判、不进基线 | 扫描面与三式细则 → `docs/design/REPO-CONVENTIONS.md` 附 A-续 §A-B29.2.2（机检口径，不复述）；错误面 fail-closed（退出 2）；裸标识符不判 |

**现状（实测，as-of 2026-09-18；D③ 数随 B31 / B23 同步，as-of 2026-09-20）**：D① **0 环**；D② 超限 **6 档** = `shell-tray` **10** · `shell-ipc` **6** · `shell-pet` / `shell-update` / `shell-window` 各 **5** · `shell-market` **4**；
D③ **13/13 恰一处**（绑定面 **17** 条），免检 **4 档** = `shell-settings.js`（工具档，无 `init` 导出）· `shell-ipc.js`（以 `register()` 接线）· `affinity-core.js`（B31 新增，无 `init` 导出——结构性免检）· `pet-unlock-core.js`（B23 新增，无 `init` 导出——同形结构性免检）。
**基线处理**（已落地生效：`scripts/gates/baseline.json`——冻结 + 只拦新增 + 陈腐即红）：存量违规**冻结 + 只拦新增**；上调冻结值须登记理由与**新到期条件**；**陈腐即红**（违规已清零而基条目未缩减 ⇒ 红）；**基线不是豁免面**，到期条件逐条写死（契约 = `docs/design/REPO-CONVENTIONS.md` §A.2.2.6）。

- **依赖方向与拆分纪律**的唯一详述处 = `docs/design/SHELL-UX.md` §2.2.6（本档只给指针，不重述）。

---

## 五、行宽与行数（成文判据）

| 面 | 判据 | 口径与豁免面 |
|---|---|---|
| 行宽 | 单行 **≤300 字符** | 口径 = **不含行尾 CR** 的字符数（本仓工作区 42 档为 CRLF）。豁免面 = 台账 `docs/TODO.md` · 地图 `docs/README.md` · 归档档 `docs/TODO-archive.md` 的**表格行**（用户 2026-09-17 裁定 A + 主 agent 2026-09-18 裁决 D1）+ 批次档 **§3**（裁定 A′）；**豁免仅限这几面，不得自行扩大**；**豁免面计数不含归档档**（D1：归档档已定案、不参与门禁计数） |
| 单档行数 | **≤500 行**（`.js` / `.mjs`） | 实测最大 = `market.js` **恰 500 行**（贴线 · 零余量）；次高 `updater.js` 497 · `tests/b12-plugin-guards.test.js` 491 · `shell-pet-geometry.js` 437（as-of 2026-09-18）。先例：B06 F6 把 `main.js` 拆成 15 个 `shell-*.js`；`market-update.js` 即 `market.js` 触顶的产物（见 `market-update.js:4`） |

- **贴线档（≥480 行）**在下一次改动**之前**须先给**拆分计划**（拆什么 / 拆到哪几个档 / 行为零回退判据）。
- **行宽债现状**（实测，as-of **2026-09-18**）：非豁免面 **15 档 / 93 行**超宽（口径 = 基线冻结面；计数权威 = `scripts/gates/baseline.json`）——前三：`B03-pet-multimonitor.md` 40 · `PET-MULTIMONITOR.md` 18 · `B18-pet-animation-chain.md` 7，余 12 档 1–6 行。**与 B07 期登记的 65 行并存**——差异 = 扫描面 / 豁免面口径不同，**以本批门禁口径为准**；登记与处置归台账 T13（写权 = 主 agent）。
- **本判据 = 门禁句**（B16）：**本档 = 行宽 / 行数判据句的权威处**（附 A §A.2.2.2 只承载机检口径，不复述判据句）；机检入口 = `npm run lint`（判据 B = 行宽 · 判据 C = 行数；本地与 CI 同形——CI 只调 npm script）。
  **口径** = 行宽按「不含行尾 CR 的字符数」· 行数按 `\n` 计数（末行有换行不额外计）；**豁免面仅限**台账 / 地图的表格行与批次档 §3（不得扩大）；行数 **≥480** 只出**提示行**（不拦）。
  机检**已落地**（设计与基线契约 = `docs/design/REPO-CONVENTIONS.md` 附 A §A.2.2.2 / §A.2.2.6）；存量超宽 = **基线冻结 + 只拦新增**（陈腐即红 · 到期条件逐条写死）。

---

## 六、EOL / 空白 / 缩进（`.editorconfig` 的唯一详述处）

- 声明档 = 根 `.editorconfig`（`root = true`）。**它本身不改写任何文件**——它是编辑器与工具读取的声明；「全仓套用」= 逐档按声明统一，可分批、可随时停。
- **EOL = `lf`**：与**仓库真值**一致（93 文本档**索引 EOL 全 LF**）。量化（全仓套用）：
  - 工作区 **42 档**字节变化（19 个根 `.js` + `scripts/ensure-deps.js` · 14 个 `.md` · 2 个 `.txt` · 4 个 `.json` · 2 个 `.npmrc`）；
  - **git 提交面 0 档 diff**（本机 `core.autocrlf = true`；已实证：`main.js` 工作区 CRLF + 索引 LF ⇒ `git diff --numstat main.js` 空）——**故本档不以格式化全仓为代价**。
  - 反向（统一 CRLF）会让 51 档推向与仓库真值相反的方向 ⇒ 已否决；`unset` 放任漂移 ⇒ 已否决（选型对比见 `docs/design/REPO-CONVENTIONS.md` §2.1.2）。
- **末行换行** = 必须有（`insert_final_newline = true`；实测 93 档已全部合规，本项 0 档待改）。
- **行尾空白** = 裁剪（`trim_trailing_whitespace = true`；实测 0 行）。例外：`*.md` 设 `false`——**行尾两空格 = Markdown 硬换行语义**，机检无法区分「有意」与「误留」。
- **缩进** = 空格、2 格（`indent_style = space` · `indent_size = 2`；实测无 Tab 缩进档、0 行 Tab 缩进）。**禁止制表符缩进**。
- **字符集** = UTF-8（无 BOM；实测 93 文本档 0 档带 BOM）。
- **`max_line_length` 不写入 `.editorconfig`**：豁免面（台账/地图表格行、批次档 §3）无法表达，误报率高 ⇒ 行宽判据由本档 §五 + B16 机检承载。
- **EOL 口径固化（B15 已落，as-of 2026-09-20）**：根 `.gitattributes` 在场（`* text=auto eol=lf`）⇒ EOL 归一**仓库化**——跨机（Linux/macOS 协作者、CI runner）不再依赖本机 git 配置；固化为**只声明**：未做 `--renormalize`（索引面零变化：158 文本档全 LF · `i/crlf` = 0）。原「已知局限」条由本条**消解**。落点与契约 = `docs/design/REPO-CONVENTIONS.md` 附 B §B.2.2 ⑤。

---

## 七、提交与变更

- **提交信息形态**（实测两种并存，均可用）：
  - 文档/收口类：`<类型>(<批次号>): <一句话>`——例 `c07dfcf docs(b09): …`、`d8d9b32 docs(b06): …`；类型取 `docs` / `feat` / `fix` / `refactor` / `chore` / `test`。
  - 实施步：`<批次号>-F<n>-<步序>: <一句话>`——例 `1384769 B06-F6-L3: 拆分 L3——shell-ipc 抽出（纯迁移）`。
- **一次提交一件事**：提交信息须含「类型/范围 + 一句话变更」，禁无信息量提交（反例，§1.3 ⑦：`commit: update` 1 条 + 自述「混合提交」1 条）；**格式化 diff 不得与行为改动同提交**。
- **若将来引入 formatter / linter**（本批**不引入**，取舍与理由见 `docs/design/REPO-CONVENTIONS.md` §2.1.3）：**纯格式化必须单独提交、分批执行**，且不与任何行为改动混提。
- **变更登记**：仓库面（开发者/接手者）全量权威源 = 根 `CHANGELOG.md`（Keep a Changelog 形态，倒序）；用户面对外说明 = `版本说明.txt`（**由 `CHANGELOG.md` 摘要生成**，含安装包清单）。方向单一：`CHANGELOG → 版本说明`；**不得反向回填**，两处不重复维护。
- **发版流程**（`make-latest.js` / `latest.json` / sha256 / 上传三步）的唯一详述处 = `docs/design/AUTO-UPDATE.md` §2.2.8（本档只给指针，不重述）。

---

## 八、开发期脚本（探针 / 辅助）

- `scripts/probes/probe-*.js`（**8 档**；B15 归位，as-of 2026-09-20）与 `debug-pet.cmd` = **开发期诊断工具、不入包**（`package.json:46-94` 的 `build.files` 未列 probe 条目——行锚只作 as-of 参考；归位布局与新增约定 = `docs/design/REPO-CONVENTIONS.md` 附 B §B.2.2）。
- 形态要求（探针**特有**项）：头部注释写清「用途 + 跑法」（实测 `scripts/probes/probe-displays.js:3-5`：`probe-displays.js — E6 判定探针：…` / `跑法：npx electron scripts/probes/probe-displays.js`）。
- 头部形态（`'use strict';` 第 1 行 + JSDoc 块 + 含路径设计档指针）= **见 §一**（唯一详述处，本处不重述）；**B15 注（as-of 2026-09-20）**：归位后 8 档探针头部均已在标准形（原「`'use strict';` 在第 4–6 行」形态随归位迁移消解）——三分计数与其余迁移面 = §1.1 的 B15 as-of 注（不重算）。

---

## 变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-17 | 建档（B11）：零 现状基线 · 一 文件头标准形与世代计数（23 / 2 / 17）· 二 命名 · 三 注释语言 · 四 模块与依赖注入 · 五 行宽与行数（EOL 口径 + 豁免面 + 行宽债 65 行）· 六 EOL/空白/缩进（42 档 / 0 档量化）· 七 提交与变更 · 八 开发期脚本；回指 `docs/batches/B11-conventions.md` §1.6 AC2。 |
| 2026-09-17 | **修正轮 1**（评审轮次 1 pass 后）：§1.1 三档计数按实况逐名重算为 **22 / 3 / 17**（建档行所记 23 / 2 / 17 = 该轮之前的口算值）· §七 补 `docs/design/AUTO-UPDATE.md` §2.2.8 指针 · §八 重复句改指针。 |
| 2026-09-17 | **修正轮 2**：§一 判据 ① 补**扩展名口径**（`.js` 适用 / `.mjs` 免——ESM 隐式严格）· §1.1 合规面行与 ESM 注同步该口径 · §二 补**命名例外清单**（camelCase 1 · snake_case 1）与「除该例外清单外零命中」判据句。 |
| 2026-09-17 | **修正轮 3**：§一 判据 ② 收为**宽口径**（「JSDoc 块在场」+「块内含路径的设计档指针」），原「首行 = `文件名 — 职责（批次；设计档 全路径 §节）`」改为**推荐形（写作面；新档遵循、存量不追溯）**；判据 ① 的「JSDoc 紧随、不加空行」同标为推荐形；§1.1 增**合规面内的形态差异**（4 处逐名 · 非缺陷 · 三分 22 / 3 / 17 = 42 不变）。 |
| 2026-09-17 | **修正轮 4**：§1.1 `tests/` 计数注改为「三档**均在** 22 档逐名清单内」（防并列误读为重复计数）· ESM 注**归因统一**——该档合规性由**判据 ② ③** 承载（本无 `'use strict';` 行），判据 ① 的扩展名口径**不改变**其归属（结论不变：22 档逐名含它、三分 22 + 3 + 17 = 42）。 |
| 2026-09-17 | **B08 收口轮（实施后文档事实同步）**：§八 的 `build.files` 行锚按 as-of 实测更正 `package.json:39-80` → **`:41-82`**（成因 = 根 `package.json` 因 B08 增两行 scripts，其后各行整体 +2；注「行号只作 as-of 参考」）。**判据 / 计数不变。** |
| 2026-09-18 | **B16 落笔轮**（主 agent 裁定：规范档写权 = eng-designer）：§四 增**结构判据三条**（D① 依赖无环 · D② 域模块扇出 ≤3 · D③ 接线点唯一）+ 口径与免检清单 + 现状实测（as-of 2026-09-18）+ 基线处理；§五 的「升门禁句」行改为**门禁句**（判据 B / C + 口径 + 豁免面 + 基线冻结）。机检**随 B16 实施落地**（设计 = `docs/design/REPO-CONVENTIONS.md` 附 A）。**既有条文与计数未动。** |
| 2026-09-18 | **B16 修正轮 1**（设计评审轮 1 pass 后）：§四 标**判据句权威 = 本档**（附 A §A.2.2.2 只留机检口径 + 回指）+ D③ 覆盖面写为**组合根绑定面**（未被 `main.js` 绑定的 `shell-assets` / `shell-market` 不入免检清单）+ D③ = T39 ② 的机检落点；§五 豁免面补**归档档**并写明**计数不含归档档**（裁决 D1）+ 标注判据句权威 = 本档。**判据句与既有计数未动。** |
| 2026-09-19 | **B16 收口轮（门禁现状同步）**：§零 门禁计数 **0/3 → 3/3**；§四 / §五 「随 B16 实施落地」→「已落地」×2；§四 基线处理行改「已落地生效」；§五 行宽债计数与基线对齐 **92 行 / 16 档 → 15 档 / 93 行**（计数权威 = `scripts/gates/baseline.json`；余 13 档 → 12 档同步）。依据 = `docs/batches/B16-test-gates.md` §5 / §6。 |
| 2026-09-19 | **B29 实施轮（判据 E 判据句落笔）**：§四 表头注「结构判据三条」→「+ 样本解耦判据一条（E）」+ 表增 **E 行**（判据句权威 = 本档；零命中恒判、不进基线）+ 表头注机检面补 E；顺手修表头注行尾既有游离反引号。判据句细则与机检口径 → `docs/design/REPO-CONVENTIONS.md` 附 A-续 §A-B29.2.2（不复述）。依据 = 批次档 `docs/batches/B29-samples-guard.md` §2 · AC-B29-6。 |
| 2026-09-19 | **B31 收口轮（文档层折账；源 = `docs/batches/B31-affinity-balance.md` §5.2）**：§四 D③ 覆盖面「15 条 require」→ **16**；现状行「免检 **2 档**」→ **3 档**（枚举同步 + `affinity-core.js`——结构性免检，D3）——随 B31 `assemblyExempt` +1 生效（as-of 2026-09-19）。**判据句本体零动。** |
| 2026-09-20 | **B15 实施后文档同步轮**：§六「已知局限」→ **EOL 固化条**（`.gitattributes` 已落；原局限消解）；§八 探针位置 → `scripts/probes/`（**8 档**计数 + 跑法例新路径 + 回指附 B）+ `build.files` 行锚刷新；§1.1 补 **B15 as-of 注**（三分计数时效；不重算）。依据 = `docs/batches/B15-repo-hygiene.md` §5 / 设计 `docs/design/REPO-CONVENTIONS.md` 附 B §B.2.3。 |
