# CONVENTIONS —— 本仓代码规范（Bigfish）

> 本档是本仓**代码形态的唯一权威句**（写什么形态）。三处分工，互不重述：
> ① 流程 / 写权 / 门禁 → `AGENTS.md`（唯一详述处）；② 文档落点约定与清单 → `docs/README.md`（唯一详述处）；③ **代码形态 → 本档**。
> 本档不重复 ① ② 的内容，只给指针；**禁止绝对化断言**——凡「现状」陈述一律带实测口径（数字 / 文件数 / 行号，as-of **2026-09-17**），把现状写成「全都一致 / 都已统一」一类即与实证相抵。
> 变更记录见文末。

---

## 零、现状基线（实测，as-of 2026-09-17）

| 面 | 实测 | 口径来源 |
|---|---|---|
| 跟踪路径 | **155** 条（`git ls-files`）；命名分布见 §二 | 本批实测（§1.3 ① 体检轮为 154 条，差额 = 体检轮之后新增的批次档） |
| 代码档 | **41** 个 `.js` + **1** 个 `.mjs` = 42 档 / **6,679** 行 | 逐档行数统计 |
| 文本档 | **93** 档（另 62 档为二进制/资源） | `git ls-files --eol` |
| EOL | **索引（仓库真值）全 LF**；工作区 = **51 LF / 42 CRLF** | 同上 + 逐档字节比对 |
| 末行换行 / 行尾空白 / Tab 缩进 | 93 档**全部**已带末行换行 · **0 行**行尾空白 · **0 档** Tab 缩进 | 逐档扫描 |
| 注释语言 | 抽样 20 个根 `.js`：中文为主 **15（75%）** · 英文为主 3 · 混排 3 | §1.3 ②（体检 id=17 §4.3） |
| 门禁 | **0/3**（详述在 `AGENTS.md` §三，本档不复述） | §1.3 ⑥ |

---

## 一、文件头（标准形）

**标准形**（判据，取自 B04/B06 世代的逐字同构形态，§1.3 ③）：

```js
'use strict';
/**
 * <文件名>.js — <一句话职责>（<批次号>；设计档 docs/design/<主题>.md §<节>）。
 * <可选行：函数清单（注 S<n>） · 属主状态（跨模块读写的状态与出口） · 依赖方向>
 */
```

三条判据：

1. **第 1 行**逐字 `'use strict';`（JSDoc 紧随其后，中间不加空行）。
2. **第 2 行起** JSDoc 块 `/** … */`，首行 = `文件名 — 职责（批次；设计档 全路径 §节）`；职责写「本档负责什么」，不写实现细节。
3. **设计档指针必须含路径**（D4 指针纪律）：写 `docs/design/<主题>.md §<节>`；**禁**「设计档 §x」式相对指针。

### 1.1 世代现状（as-of 2026-09-17，42 档）

| 面 | 档数 | 说明 |
|---|---|---|
| **合规面** | **23** | `'use strict'` 第 1 行 + JSDoc 块 + **含路径**的设计档指针：`main.js` · `updater.js` · `harness-store.js` · 15 个 `shell-*.js` · `market-update.js` · `update-lib.js` · `update-stub.mjs` · `tests/*.js`（B04/B06 世代，逐字同构） |
| 形态待迁移 | 2 | 指针为相对形态：`update.js:2`（「设计档 §2.6」）· `make-latest.js:3`（「设计档 §2.2.8」） |
| **前世代** | **17** | 无设计档指针：`pet.js` · `market.js` · `exchange.js` · `afterPack.js` · `make-icons.js` · `scripts/ensure-deps.js` · 3 个 `*-preload.js` · 7 个 `probe-*.js`；其中 7 个 `probe-*.js` 的 `'use strict';` **不在第 1 行**（实测第 4–6 行，头部为用途注释） |

- 前世代 = **待迁移面**（**不是**合规面，不享「存量豁免」）。迁移判据 = 本 §一的三条判据；**迁移另批执行**（本批零 `.js` 改动，见 `docs/design/REPO-CONVENTIONS.md` §2.3 出批项 O2）。

---

## 二、命名

| 面 | 规则 | 实测（as-of 2026-09-17） |
|---|---|---|
| 文件 / 目录名 | **kebab-case**、全小写；扩展名小写（`.js` / `.md`） | 154 条跟踪路径 = kebab-case **147** + 中文名 **3** + dotfile **4**；**camelCase · snake_case = 0**（§1.3 ①） |
| 中文名文件 | 仅限**用户面文档**（`使用说明.txt` · `版本说明.txt` · `已知问题与排查.md`）——豁免；工程面档名一律 kebab-case | 同上 |
| 函数 / 变量 | lowerCamelCase | 例：`main.js:57` `isQuitting` · `main.js:76` `gotLock` |
| 模块级常量 | UPPER_SNAKE_CASE | 例：`main.js:46-49` `APP_NAME` · `HOST` · `READY_TIMEOUT_MS` · `IDLE_NOTIFY_MS`；`market.js:6` `CATEGORY_LABELS` |
| IPC 通道 | `<域>:<动作>` | 实测 12 条（`shell-*.js` 的 `ipcMain.handle`）：`market:install` · `market:state` · `market:update-all` · `affinity:buy` · `affinity:view` 等 |

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
- **依赖方向与拆分纪律**的唯一详述处 = `docs/design/SHELL-UX.md` §2.2.6（本档只给指针，不重述）。

---

## 五、行宽与行数（成文判据）

| 面 | 判据 | 口径与豁免面 |
|---|---|---|
| 行宽 | 单行 **≤300 字符** | 口径 = **不含行尾 CR** 的字符数（本仓工作区 42 档为 CRLF）。豁免面 = 台账 `docs/TODO.md` 与地图 `docs/README.md` 的**表格行**（用户 2026-09-17 裁定 A）+ 批次档 **§3**（裁定 A′）；**豁免仅限这两面，不得自行扩大** |
| 单档行数 | **≤500 行**（`.js` / `.mjs`） | 实测最大 = `market.js` **恰 500 行**（贴线 · 零余量）；次高 `updater.js` 497 · `shell-pet-geometry.js` 437。先例：B06 F6 把 `main.js` 拆成 15 个 `shell-*.js`；`market-update.js` 即 `market.js` 触顶的产物（见 `market-update.js:4`） |

- **贴线档（≥480 行）**在下一次改动**之前**须先给**拆分计划**（拆什么 / 拆到哪几个档 / 行为零回退判据）。
- **行宽债现状**（实测）：非豁免面 **65 行**超宽——`docs/batches/B03-*` 40 · `docs/design/PET-MULTIMONITOR.md` 18 · `docs/design/AUTO-UPDATE.md` 3 · `docs/batches/B01` / `B05` / `B06` 各 1 · `docs/requirements/PET.md` 1；豁免面 56 行（台账 16 · 地图 6 · 批次档 §3 34）。**登记与处置归台账 T13**（写权 = 主 agent）。
- 本判据**升为门禁句**（机检接入 CI）= 归 B16（见 `docs/design/REPO-CONVENTIONS.md` §2.3 出批项 O3）。

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
- **已知局限**：无 `core.autocrlf` 的克隆（Linux/macOS 协作者、CI runner）下 EOL 归一依赖于该机 git 配置，非仓库化 ⇒ 建议另批加 `.gitattributes`（`* text=auto eol=lf`）固化口径（出批项 O1，本批不落）。

---

## 七、提交与变更

- **提交信息形态**（实测两种并存，均可用）：
  - 文档/收口类：`<类型>(<批次号>): <一句话>`——例 `c07dfcf docs(b09): …`、`d8d9b32 docs(b06): …`；类型取 `docs` / `feat` / `fix` / `refactor` / `chore` / `test`。
  - 实施步：`<批次号>-F<n>-<步序>: <一句话>`——例 `1384769 B06-F6-L3: 拆分 L3——shell-ipc 抽出（纯迁移）`。
- **一次提交一件事**：提交信息须含「类型/范围 + 一句话变更」，禁无信息量提交（反例，§1.3 ⑦：`commit: update` 1 条 + 自述「混合提交」1 条）；**格式化 diff 不得与行为改动同提交**。
- **若将来引入 formatter / linter**（本批**不引入**，取舍与理由见 `docs/design/REPO-CONVENTIONS.md` §2.1.3）：**纯格式化必须单独提交、分批执行**，且不与任何行为改动混提。
- **变更登记**：仓库面（开发者/接手者）全量权威源 = 根 `CHANGELOG.md`（Keep a Changelog 形态，倒序）；用户面对外说明 = `版本说明.txt`（**由 `CHANGELOG.md` 摘要生成**，含安装包清单）。方向单一：`CHANGELOG → 版本说明`；**不得反向回填**，两处不重复维护。

---

## 八、开发期脚本（探针 / 辅助）

- `probe-*.js`（7 档）与 `debug-pet.cmd` = **开发期诊断工具、不入包**（`package.json:39-80` 的 `build.files` 未列）。
- 形态要求：头部注释写清「用途 + 跑法」（实测 `probe-displays.js:1-3`：`// Diagnostic probe: …` / `// Run: npx electron probe-displays.js`）；`'use strict';` 应在**第 1 行**（现状在第 4–6 行 ⇒ 属迁移面，见 §1.1）。

---

## 变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-17 | 建档（B11）：零 现状基线 · 一 文件头标准形与世代计数（23 / 2 / 17）· 二 命名 · 三 注释语言 · 四 模块与依赖注入 · 五 行宽与行数（EOL 口径 + 豁免面 + 行宽债 65 行）· 六 EOL/空白/缩进（42 档 / 0 档量化）· 七 提交与变更 · 八 开发期脚本；回指 `docs/batches/B11-conventions.md` §1.6 AC2。 |
