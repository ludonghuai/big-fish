# B29 —— `samples/` 解耦守卫与定位收口

## §1 立案（主 agent）

### 1.1 目标（一句话）

把「`samples/` = 外部项目样本区，完全解耦（不引用 / 不构建 / 不入仓）」从**口头约定**变成**机检判据**，并补上可读的定位文档。

### 1.2 任务来源

台账需求点 **R14**（用户 2026-09-17 交付 `samples/dsh-pet` 并划定「完全解耦」硬约束）。父侧已落部分：`samples/` 目录 + `.gitignore:24-26` 条目（含理由注）+ 地图落点行；**余项 = 机械守卫 + 定位文档**。

### 1.3 现状实测（证据，as-of 2026-09-19）

- `samples/` 现 1 项（`samples/dsh-pet`）；`.gitignore:24-26` = `samples/` + 「不被任何代码引用 · 不参与构建 · 不打进发行版」注 ✓。
- **缺口**：无任何机检句保证「① 全仓引用面（`require` / 路径拼接）不出现 `samples/` ② `package.json` 的 `build.files` / `extraResources` 不登记 `samples/**`」——现全靠人眼 ✗。
- 先例：B16 六判据（`scripts/gates/**`）已有判据骨架与自检机制，可挂新判据。

### 1.4 范围（做 / 不做）

**做**：① 在既有门禁加**判据**（引用面零命中 + 打包白名单零登记；违规 ⇒ 红 + 自检用例）；② 定位文档（`samples/` 是什么 / 怎么加样本 / 移植怎么走四步流程——落点由设计定）；③ 地图 / 台账指针同步（主 agent）。
**不做**：① 不引入样本内容（第三方代码不入仓历史 ✗）；② 不改 `build.files` 现行白名单内容（只加「不得登记 `samples`」判据）；③ 不做移植本体（R15 已收口 A 面 ✓；后续另立需求点）。

### 1.5 硬约束

1. **零样本写入**：本批不进任何第三方代码 / 二进制（守卫与文档的对象是**规则**，不是样本）。
2. 新判据须进 `scripts/gates/**` 既有骨架（含自检用例），随 CI 生效；判据严格性 = 「零命中」而非「基线冻结」。
3. 行宽 / 行数 / 文件头照规范档；三道门 + lint。

### 1.6 待决项（须裁定后才能定稿设计）

- **U-1**：定位文档落点——`README.md` 增节 vs `docs/` 新档 vs 两处（**样本区不入仓 ⇒ 文档必须在仓内** ✗ 不可放 `samples/` 内）。
- **U-2**：判据挂法——并入既有 `assembly` / 新增**第七判据**（`samples-guard`）——设计者给候选 + 理由。

### 1.7 关联台账与需求档

台账 **R14** → 本批（销账条件 = 判据机检生效 + 定位文档落档 + 地图/台账指针）；需求档：无新增（工程/流程类，依 B11 先例）。同族：T13（行宽债）无关；T36（43 档不搬立场）不冲突 ✓。

### 1.8 交付物与排期

交付物 = 门禁新判据（含自检）+ 定位文档 + 验收证据（判据红/绿双向实测）。**可立即派设计**（`scripts/gates/**` 面零在途冲突 ✓）。

### 1.9 变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-19 | 建档（B29 立案）：R14 余项（守卫 + 定位）承载；U-1 / U-2 待决 |

---

## §2 本批任务书（eng-designer）

<!-- 由 eng-designer 填 -->

---

### 任务书（eng-designer · 2026-09-19 设计轮）

设计落点 = `docs/design/REPO-CONVENTIONS.md` 附 A-续（§A-B29.1 需求层 / §A-B29.2 设计层 / §A-B29.3 测试层）+ 四处活契约修订（A.2.2.1 契约表 · A.2.2.2 判据表与 F1 覆盖面 · A.3.1 AC-B16-1 判据串）。本批条目与设计档验收标准、批次档 §1.4「做」三项三方同源。

**① 本批条目**

1. F1 **门禁新判据 E（samples-guard）**（§1.4-①）：E① 引用面零命中 + E② 打包白名单零登记；**零命中恒判**（不入基线、不冻结）；自证 6 例（TC-B29-01…06）。
   - E① = 全仓代码面零引用 `samples/`：路径形态 `samples/` · `samples\` + 引号形态 `'samples'` / `"samples"` 两式；E② = `build.files` / `extraResources` 子串 `samples` 判，缺档 fail-closed。
   - 摘要行 `CHECK samples PASS refs=0 pkg=0`、总摘要 `GATE lint PASS checks=7 selftest=20/20`；设计 = 附 A-续 §A-B29.2.2；判据句权威 = `docs/CONVENTIONS.md` §四（实施轮落笔）。
2. F2 **定位文档 `docs/SAMPLES.md`**（§1.4-②；U-1 裁定落点 = docs/ 顶层新档）：是什么（完全解耦三条）/ 怎么加样本 / 移植四步流程。内容契约 = 附 A-续 §A-B29.2.2；实施轮 eng-designer 落笔。
3. F3 **地图 / 台账指针同步**（§1.4-③；主 agent 面）：建议行 = 附 A-续 §A-B29.2.3（地图 §一 / §二 各 +1 行 + 台账 R14 销账）。

**② 范围外（显式不做）**

- **零样本写入**：不引入任何第三方代码 / 二进制（判据与文档的对象 = 规则，不是样本）；`samples/` 现 1 项不变。
- 不改 `build.files` / `extraResources` 白名单现行内容（只加「不得登记 `samples`」判据）；不改 `package.json` 任何块（E② 只读）。
- 不做移植本体（R15 已收口 A 面 ✓；后续另立需求点）；不搬任何档进出 `samples/`。
- 不碰根 `README.md` / `版本说明.txt` / `THIRD-PARTY-NOTICES.md`（B27 实施期冻结面 ✗）；不写台账 / 地图 / `CHANGELOG.md`（主 agent 面，只给建议行）。
- 本设计轮不落 `docs/SAMPLES.md` / `docs/CONVENTIONS.md` / `AGENTS.md` 正文（任务书硬约束 = 只写设计档 + 本段；三档随实施轮 eng-designer 落笔）。

**③ 受影响文件（写权 + 现状行数 as-of 2026-09-19 + 预计增量）**

| 文件 | 现状 | 本批动作 | 增量 | 写权 |
|---|---|---|---|---|
| `scripts/gates/checks.js` | 261 行 | 增 `checkSamples(files, root)`（E①/E② + fail-closed） | +≈75 → ≈336 | eng-coder |
| `scripts/gates/run.js` | 122 行 | 增 E 判据块 + `checkCount=7` + selftest 分母动态化（`passed/total`） | +≈14 → ≈136 | eng-coder |
| `scripts/gates/selftest.js` | 260 行 | 增 `samplesFixture` + TC-B29-01…06 六例 | +≈85 → ≈345 | eng-coder |
| `scripts/gates/lib.js` | 177 行 | **0**（跳过清单已含 `samples`——口径不变） | 0 | — |
| `scripts/gates/baseline.json` | 38 行 | **0**（E = 零命中恒判，不入基线） | 0 | — |
| `docs/SAMPLES.md` | 不存在 | 新建（U-1 选定落点） | ≈70 | eng-designer |
| `docs/CONVENTIONS.md` | 191 行 | §四 增 E 判据句 + 表头注记 + 变更记录 1 行 | +≈6 → ≈197 | eng-designer |
| `AGENTS.md` | 67 行 | §三「六判据」→「七判据」+ 写权矩阵补定位档 + 变更记录 1 行 | +≈4 → ≈71 | eng-designer |
| `docs/README.md` | 98 行 | §一 落点行 + §二 当前文档行（建议行） | +2 → ≈100 | 主 agent |
| `docs/design/REPO-CONVENTIONS.md` | 701 行 | 附 A-续 + 四处活契约修订 + 变更记录 1 行 | +191 → 892 | eng-designer（本设计轮已落） |
| `package.json` / 运行时代码 / `samples/**` / `.github/**` | — | **零改动**（`gates.yml` 只调 npm script，判据面变化透明生效） | 0 | — |

**④ 验收标准（AC-B29-1…7，判据串逐条 = 设计档 §A-B29.3.1）+ 步序**

- AC-B29-1 判据 E 落地（`CHECK samples PASS` + `checks=7 selftest=20/20`）· AC-B29-2/3 引用面与白名单**红面双向实测**（注入 ⇒ 退出 1 + `VIOLATION samples`、移除 ⇒ 退出 0）· AC-B29-4 自证常驻（6 例每次 lint 跑）。
- AC-B29-5 定位文档落档（三问标题 + 地图两行）· AC-B29-6 判据句权威（规范档 §四）与计数同步（`AGENTS.md` 无「六判据」残留）· AC-B29-7 零样本写入 + 零业务改动（改动面 = gates 三档 + 文档层四档；`package.json` / `samples/**` 零 diff）。
- 步序契约：① checks.js → ② selftest.js → ③ run.js → ④ 本地 `npm run lint` 取证 + 红面双向实测 → ⑤ eng-designer 微轮落 `docs/SAMPLES.md` + 规范档 §四 + `AGENTS.md` → ⑥ 主 agent 落地图两行 → ⑦ 三条门全绿 + 批次 §5/§6 收口。
- 待确认（设计档 §A-B29.2.7）：① E① 引号形态是否保留（推荐保留——`path.join('samples', …)` 是真实引用形态）② 写权矩阵「定位档 = eng-designer」半行 ③ ARCHITECTURE.md（B25 面）指针另议。

### 修正轮 1 记录（eng-designer，2026-09-19；append-only）

- **源**：评审轮 1（§3 轮次 1：🔴0 / 🟡6 / 🔵3，共 9 条）+ 父侧裁决口径——#1–#5、#7–#9 本设计轮落；#6（open ②/③）父侧 §4 处置，本设计轮不动。
- **#1（🟡 E① 检测式缝）**：E① 补**第三式**（引号 / 反引号包裹且路径末段 = `samples`，收 `require('./samples')` / `'../samples'` / `./samples` 等）；与 open ① 合并为一次裁定 = **引号形态保留**（`path.join(…, 'samples', …)` / `require('./samples')` 是真实引用形态，漏判即守卫空心）⇒ open ① 关闭；DD-A17 / TC-B29-01/02/05 / AC-B29-2 同步（设计档 §A-B29.2.2 / §A-B29.3）。
- **#2（🟡 E①/E② 重叠）**：**E① 排除 `package.json`**（归 E② 独占——该档 `samples` 字面量属打包白名单判据面，E① 再判 = 同键双报、红面计数失真）；TC-B29-03 期望订正（`pkg-build` + `pkg-extra` 各 1 条、**无 `ref`**）；AC-B29-3 红面计数口径 = **逐 kind 列全**（不以 `pkg` 合计模糊表述）。
- **#3（🟡 错误路径口径）**：`pkg-unreadable`（缺档 / `JSON.parse` 失败）退出码**写死 = 2**（承 A.2.2.1「解析异常一律 2 / 门禁自身无法完成」）；补**非预期条目形态**（`build.files` 对象式 FileSet / `extraResources` 纯字符串）处置 = `pkg-shape`，**fail-closed 退出 2**（检测器无法对其做子串判定 ⇒ 不得按「未命中」静默放行——静默放行 = 守卫空洞）。
- **#4（🟡 300 档声明）**：受影响文件表下补 **300 档结论**（`checks.js` ≈336 / `selftest.js` ≈345 无需拆分——职责单一 / 纯函数增量 / 无新面；行数唯一口径 = 判据 C 480/500）。
- **#5（🟡 活契约修订完整性）**：`REPO-CONVENTIONS.md:406` 扫描面行「六条判据共用」→「七条」计入 B16 面修订清单**第五处**（顶注与清单四处 → 五处，已同步）。
- **#7（🔵 现状锚口径）**：`REPO-CONVENTIONS.md:696` 与 AC-B29-2 的现状锚改按 **E① 实际扫描面**（非文档档 − `scripts/gates/**` − `.gitignore` − `package.json`）表述——扫描面内命中 = 0 处（实测 as-of 2026-09-19 逐档 grep；枚举仅为示例口径，实施首跑「锚外命中」以判据输出为准）。
- **#8（🔵 package.json 行锚）**：只读实测 `package.json`：`build.files` = `:45-92` / `extraResources` = `:93-106`——与设计原锚**一致**，补「实测 as-of 2026-09-19」注，数值不动。
- **#9（🔵 B27 冻结面措辞）**：补依据指针 = B27 批次档 `docs/batches/B27-pet-feel-2.md` §2.3 零改动面 **15 档**（含 `README.md` / `版本说明.txt` / `THIRD-PARTY-NOTICES.md`）——设计档 §A-B29.2.1 候选 5 行与 §A-B29.2.5 边界行各一句；本段 §2 范围外行（`:74`）措辞同源，随本记录补注。
- 验证：`npm run lint` 结果 + D6 回读见主会话交付报告。

## §3 设计评审（评审子代理）

<!-- 由评审子代理填 -->

---

### 轮次 1（评审子代理）

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | 需求覆盖（判据 E① 检测式） | 🟡 | E①「检测两式」留有一类缝：**以 `/samples` 结尾且引号不紧贴 `samples`** 的路径串不命中——`require('./samples')`、`'../samples'`、`fs.readdirSync('./samples')` 均非路径形态（`samples/` · `samples\`）也非引号形态（`'samples'` / `"samples"`）的命中面（`docs/design/REPO-CONVENTIONS.md:760`）；反引号裸段形态 `` `samples` `` 同样不中。与 DD-A17 宣称「覆盖 require / 路径拼接 / 裸段引用三种引用形态」（`docs/design/REPO-CONVENTIONS.md:825`）及批次缺口句「引用面零命中」（`docs/batches/B29-samples-guard.md:16`）的目标不完全相符 | 建议把 E① 检测集收口为一次口径裁定：补「引号 / 反引号包裹且路径**末段** = `samples`」形态，或显式声明该限制与理由；与 open ①（`docs/design/REPO-CONVENTIONS.md:845`）合并裁定，避免两处分判 |
| 2 | 清晰性 / 验收（判据重叠） | 🟡 | E① 扫描面 = 非文档档（`.json` 在内，`docs/design/REPO-CONVENTIONS.md:757`）⇒ TC-B29-03 夹具的 `package.json`（`"samples/dsh-pet"` / `"samples"`）会被 E①**同时**判 `ref`，与期望「共 2 条」（`docs/design/REPO-CONVENTIONS.md:869`）不符；AC-B29-3 的仓内注入（`docs/design/REPO-CONVENTIONS.md:857`）同理会 `ref` + `pkg-build` 双报 | 明确 E① 是否排除 `package.json`（由 E② 独占该档），或修正 TC-B29-03 期望与红面计数口径（逐 kind 列全） |
| 3 | 验收（错误路径口径） | 🟡 | E② 把「缺档 / 不可解析」列为判据「红」（`pkg-unreadable`，`docs/design/REPO-CONVENTIONS.md:758`、TC-B29-04 `docs/design/REPO-CONVENTIONS.md:870`），与 A.2.2.1「解析异常一律 **2**（门禁自身无法完成）」（`docs/design/REPO-CONVENTIONS.md:398`）并置时退出码口径未写死（1 还是 2）；`build.files` 对象式 / `extraResources` 纯字符串条目的处置亦未写 | 写死 `pkg-unreadable` 的退出码归属，并补非预期条目形态的处置（判红 / fail-closed），使错误面可机检闭合 |
| 4 | 受影响档尺寸（300 档） | 🟡 | `checks.js`（261 → ≈336）与 `selftest.js`（260 → ≈345）（`docs/design/REPO-CONVENTIONS.md:796` / `docs/design/REPO-CONVENTIONS.md:798`；现状行数按设计所载，`scripts/gates/**` 属评审范围外未复核）**跨 300 行档线**；设计仅答「贴线档拆分计划：无——改动档均 <480 行」（`docs/design/REPO-CONVENTIONS.md:816`），只按规范档 §五 的 480 口径（`docs/CONVENTIONS.md:135`）作答，缺 300 档的主动拆分评审声明 | 补一句 300 档结论（两档为何无需拆 / 或给拆面），或注明以规范档 §五 480/500 为唯一口径（与判据 C 同源）——二者取一即可 |
| 5 | 清晰性（活契约修订完整性） | 🟡 | 设计声明 B16 面随本批修订「四处」（`docs/design/REPO-CONVENTIONS.md:694`，逐条 `docs/design/REPO-CONVENTIONS.md:772-775`），但 `docs/design/REPO-CONVENTIONS.md:406`「扫描面（**六条**判据共用的档集合）」亦是活契约句——E 共用该扫描面（仅再加两条排除面）而未被修订 ⇒ 修订清单缺一处 | 把 `:406` 计入修订清单（第五处），或纳入 AC-B29-6（`docs/design/REPO-CONVENTIONS.md:860`）的「无残留」扫描面 |
| 6 | 协调项（open 归属） | 🟡 | open ②（写权矩阵半行）、③（B25 / ARCHITECTURE 指针）（`docs/design/REPO-CONVENTIONS.md:846`、`docs/design/REPO-CONVENTIONS.md:847`）待 §4 裁决 / 后续批次落地；① 见 #1 | §4 逐条给结论（设计已给推荐值），无需改设计骨架；若 ② 被否，AC-B29-6 的矩阵行判据需同步改口径 |
| 7 | 清晰性（现状锚口径） | 🔵 | 现状锚「代码面（`.js` / `.mjs` / `.html` / `.json` / `.cmd` / `.yml`）含 `samples` 字面量恰 1 处」（`docs/design/REPO-CONVENTIONS.md:696`）的枚举面窄于 E① 实际扫描面（**非文档档全量**——`.editorconfig` / `.npmrc` 等未枚举文本档亦在面内，`docs/design/REPO-CONVENTIONS.md:757`） | 现状锚改按 E① 扫描面口径表述（或注明枚举仅为示例），防实施首跑出现「锚外命中」时口径无据 |
| 8 | 文档一致性（数字漂移） | 🔵 | `package.json` 行锚两处不一致：`docs/CONVENTIONS.md:173` 的 `build.files` `:41-82`（as-of B08 口径）vs 本设计 `docs/design/REPO-CONVENTIONS.md:697` 的 `:45-92` / `:93-106`（as-of 2026-09-19）；两处均带「as-of 参考」注（`package.json` 属范围外，未能复核哪组为真） | 随 B14 / T31 行锚对账一并刷新，或本批顺手对齐（归主 agent 面） |
| 9 | 措辞 / 状态一致性 | 🔵 | 「B27 实施期冻结面」（`docs/batches/B29-samples-guard.md:74`；`docs/design/REPO-CONVENTIONS.md:749`、`docs/design/REPO-CONVENTIONS.md:833`）与文档地图 B27 行「已立案（设计待派）」并置易读为 B27 已在实施 | 若冻结依据来自 B27 批次档 §2 的预留（范围外），补注依据句；否则措辞改「B27 面（待实施）」 |

计数：🔴 0 / 🟡 6 / 🔵 3

VERDICT: pass

## §4 评审裁决与实施启动（主 agent）

<!-- 由主 agent 填 -->

---

## §5 实施记录（eng-coder）

<!-- 由 eng-coder 填 -->

**实施记录（eng-coder · 2026-09-19）**

**步序契约执行**：① checks.js（checkSamples）→ ② selftest.js（六例）→ ③ run.js（E 块 + 计数）→ ④ npm run lint 取证 + 红面双向实测 → 内部审计 + 内部评审 + 裁决加固 → 收口。⑤⑥（SAMPLES.md / 规范档 §四 / 地图 / 台账）= 设计微轮与主 agent 面，未动。

**改动面（写域 = 声明三档；行数 as-of 收口）**

| 文件 | 动作 | 收口行数 |
|---|---|---|
| scripts/gates/checks.js | 增判据 E（细目见下注）：samplesRefHit（E① 三式）+ checkPackageSamples（E②）+ checkSamples(files, root) 总入口 + 导出 | 261 → **367** |
| scripts/gates/selftest.js | 增 samplesFixture + TC-B29-01…06 六例 + total 动态化（DD-A18）+ liveAnchorOnly 锚红标记；TC-B29-06 = 现状锚语义（红 = 仓内违规非门禁坏） | 260 → **355** |
| scripts/gates/run.js | 增 E 判据块（D③ 之后；逐 kind 分流：ref/pkg-build/pkg-extra = 退出 1、pkg-unreadable/pkg-shape = fail-closed 退出 2 优先）+ checkCount=7 + selfSum=passed/total 全摘要行动态化 + 锚红分流（anchorOnly 收窄：混合失败一律退 2） | 122 → **156** |

> 注（checks.js 细目，压行逐字保留）：SAMPLES_PATH_RE（式① 路径形态）/ SAMPLES_QUOTED_RE（式②③合并，契约 :761 授权）；samplesRefHit 同行多式只记一次；checkPackageSamples = pkg-build/pkg-extra 判红、pkg-unreadable/pkg-shape fail-closed；checkSamples 扫描面排除集四条（E① 只排除**根** package.json——嵌套 package.json 归 E② 未覆盖面、留 E① 管辖）。

**实现期发现与处置（三项，均如实登记）**

1. **自证先行 × 红面实测的契约交互缝**（实测撞出）：TC-B29-06 现状锚例常驻自证 ⇒ 仓内注入必先被自证层拦截退出 2，AC-B29-2/3 期望的「退出 1 + VIOLATION samples」不可达。处置 = TC-B29-06 标「现状锚」（liveAnchorOnly）：仅锚红时落入 E 判据块以**判据码**报告（SELFTEST-FAIL 行仍打印，不静默）；锚红未确认（瞬态竞态）仍退 2。方向处处偏保守（不确定即 2）。**设计档附 A-续未载此分流规则**（评审 #1 同此）——建议设计微轮在 §A-B29.2.2 补一句，属文档面。
2. **夹具订正两处**（自证 19/20 抓出）：TC-B29-03 夹具 extraResources.to: 'samples' 多命中一条 pkg-extra ⇒ 改 to: 'dsh'（设计期望 = from 判 1 条）；TC-B29-03 断言按共享夹具树改按档贡献面（package.json 零 ref 贡献 + pkg-build/pkg-extra 各 1）。
3. **内部评审裁决加固 1 行**（🟡#2）：run.js 分流条件收窄为 anchorOnly = liveAnchorOnly && failures.length === 1（混合失败面一律退 2，消除与自述契约「夹具类失败 ⇒ 退 2」的相抵）。其余裁决：🟡#1 分流规则入设计档 = 父侧/设计微轮（Dispatched 出本代码面）；🔵×4（反引号转义末段缝 / build 非对象静默放行 / 模块级状态不重置 / pkg-shape 无自证例）= 未修，随设计微轮一并裁定，交付报告如实列出。

**自证原始结果行（收口时点）**

- node --check 三档 = OK ×3；自证直跑 = selftest 20/20 ALL GREEN
- npm run lint 尾行 = CHECK samples PASS refs=0 pkg=0 + GATE lint FAIL checks=7 selftest=20/20（FAIL 原因 = width 存量违例 3 条，**全在别批在飞档**：B22 / B27 / docs/design/ARCHITECTURE.md——非本批写域，不越域代修；本批三档零新增违例）
- 红/绿双向实测（注入/移除，try/finally 单脚本）：注入 ref（新建 probe-samples-ref.js）⇒ 退出 1 + VIOLATION samples ref probe-samples-ref.js:2 :: require('./samples/x.js');；删除后回绿。
  注入 build.files "samples/x" ⇒ 退出 1 + VIOLATION samples pkg-build（无 ref 双报 ✓）；加注 extraResources {from:'samples'} ⇒ 再 +2 条 pkg-extra（from/to 各 1）；移除 ⇒ 回绿。
- 还原核验 = package.json sha256 注入前/后一致（cf6052acf2a58608…）、probe 档不存在。
- npm run test:full = GATE test:full PASS pass=45 fail=0；npm run test:integration = GATE test:integration PASS scenarios=3 pass=3 fail=0。
- EOL/规范面：三档 CRLF 原样保持（就地 edit）；行宽 max 179、行数 367/355/156 全 <480；文件头标准形。

**冻结面零 diff**：package.json / scripts/gates/baseline.json / scripts/gates/lib.js / samples/** / .github/** / 运行时代码 = 零改动（git diff --stat 核验）。工作区其余改动档 = 别批在飞面（B22/B25/B27/B28/B30/SHELL-UX 文档层 + pet 链代码），本批未触碰。

### 代码微修轮（eng-coder · 2026-09-19 · fix round；append-only）

- **源**：设计微轮口径（`docs/design/REPO-CONVENTIONS.md:764`）= `pkg-shape`（`build` 非对象（字符串 / 数组等）…）⇒ **fail-closed 退出 2**。实现落后 = 上轮 `checks.js` 守卫在 `build` 非对象时置空 ⇒ 静默零命中放行（上轮 §5「🔵×4」其一，设计微轮已裁定）；本修 = 口径对齐。
- **改动（只写声明档 ✓）**：`scripts/gates/checks.js:284-292` 的 `build` 分类守卫改写——`build` **存在值但非对象**（字符串 / 数组 / 数字 / null 等）⇒ 归 `pkg-shape`（fail-closed ⇒ 与既有 `pkg-shape` 同 kind、同退出码 2 面；
  消息含形态名 +「无法核对白名单（fail-closed）」）；`build === undefined`（键缺省）⇒ **保持不判**（零条目零命中契约面）；
  `build.files` 非数组 / 条目异常 / `extraResources` 面 = 既有分支**零改动**。JSDoc（:264-265）同步把「build 非对象」计入 `pkg-shape` 枚举。
  `run.js` / `selftest.js` **零改动**（`pkg-shape` → 退出 2 分流上轮已落地；TC 集固定 6 例、不新增自证例——设计 :772）。
- **自检原始结果行**：
  - ① `node --check scripts/gates/checks.js` ⇒ 退出 0（Syntax OK）。
  - ② `node scripts/gates/selftest.js` ⇒ 退出 0；直跑 `runSelftest()` ⇒ `passed=20 total=20 failures=[] liveAnchorOnly=false`（**20/20** ✓）。
  - ③ `npm run lint` ⇒ `CHECK samples PASS refs=0 pkg=0` + `GATE lint FAIL checks=7 selftest=20/20`——FAIL 面 = width 违例 1 条：`docs/batches/B22-pet-work-six.md :: current=1`（**他批在飞** ✗ 不代修，如实标注；本批写域零违例）。
  - ④ 红/绿双向（注入/还原，try/finally 单脚本）：临时把 `package.json` 的 `build` 改成字符串 ⇒ **退出 2** + `CHECK samples FAIL refs=0 pkg=1` +
    `VIOLATION samples pkg-shape package.json :: build 非对象（形态 = String）⇒ 无法核对白名单（fail-closed）` +
    `GATE lint FAIL checks=7 selftest=19/20 reason=samples-pkg-fail-closed`（19/20 = TC-B29-06 现状锚红分流面，锚红按判据码报告——设计契约行为，非门禁坏）；还原 ⇒ 回绿 `CHECK samples PASS refs=0 pkg=0`。
  - 还原核验 = `package.json` sha256 注入前 = 注入后 = `cf6052acf2a58608f6cd4ea8847acc1ecddb4f58194eff82a97b9b1eda2c8061`（字节级一致 ✓）。
  - 边界探针（临时目录六态）：键缺省 → pkg=[]（不判 ✓）；build = 数字 / 数组 / null → 各 1 条 `pkg-shape` ✓；`build.files` = 字符串 → `pkg-shape`（既有面 ✓）；build 对象 + files 正常 → pkg=[] ✓。
  - 门禁链：`npm run test:full` ⇒ `GATE test:full PASS pass=51 fail=0 skipped=0 ms=1103`；`npm run test:integration` ⇒ `GATE test:integration PASS scenarios=3 pass=3 fail=0`。
- **审计与评审轮次**：内部审计（explore 子代理）⇒ **clean**（四类偏差 0；观察 1 条 = 顶层 JSON 非对象零命中——既有边界、超本修范围，见下）。内部评审（advisor）⇒ 轮 1/2 超 600s 预算无表、轮 3 缩窄 scope 后 **VERDICT: pass**（0🔴）；裁决表 = 上轮 🔵「build 非对象静默放行」→ Fixed（本修）；「顶层 JSON 非对象」→ 观察项上浮父侧（非缺陷、设计范围外）。
- **§5 段落压行（承 B30 先例；本角色自属段、内容逐字保留）**：上轮记录两处超宽行（改动面 checks.js 表行 323 字符 + 红/绿双向实测行 305 字符）⇒ 就地压行（表行细节移至表下注、实测行拆两行）——lint 中本批批次档 width 违例 2 → **0**。
- **未落/存疑项**：① lint 全局 FAIL 仍 1 条（他批 B22 在飞面——非本批写域，提请父侧收口标注）；② 顶层 JSON 非对象（`package.json` 内容 = `[]` / `"str"` 等）⇒ 现零命中放行——设计 :764 只覆盖 `build` 键非对象，属既有边界，建议父侧斟酌是否另轮收口（本修未动）。


## §6 验收核销（主 agent）

**核销（2026-09-19）**——B29 全链 = 设计（REPO-CONVENTIONS 附 A-续：判据 E 三式 + E② + 定位档落点）→ 评审轮 1 = **pass**（🔴0 / 🟡6 / 🔵3）→ 修正轮 1 全落 → **用户批准** →
实施双轮（判据 E：checks 367 / selftest 355 / run 156 ✓ 红绿双向 + `package.json` sha256 校回；文档面：`docs/SAMPLES.md` 建档 + 规范档 §四 + `AGENTS.md` 七判据）→
代码微修轮（E② 口径对齐）→ **全仓 lint 首绿** → 本节核销。

**验收证据链**：

| 面 | 证据（可复核） |
|---|---|
| E① 引用面零命中 | `CHECK samples PASS refs=0` ✓（三式检测）；自证 20/20 ✓ |
| E② 打包白名单 | `pkg=0` ✓；`build` 非对象 ⇒ `pkg-shape` fail-closed 退出 2（`checks.js:284-292` ✓ 父侧实读）；红绿双向 + sha256 校回 `cf6052ac…` ✓ |
| 定位档 | `docs/SAMPLES.md`（57 行）✓ + 判据 E 权威句 = `docs/CONVENTIONS.md` §四 ✓ |
| 门禁 | **`lint PASS`**（checks=7 ✓ · 全仓首绿）· `test:full` 51 ✓ · `test:integration` 3 ✓ |
| 冻结面 | `package.json` / `baseline.json` / `samples/**` / `.github/**` 零 diff ✓ |

**派生登记（D7）**：**T50**（`REPO-CONVENTIONS` 491 → 492 同族 + B08 §5.6 死指针）· **T51**（顶层 JSON 非对象未 fail-closed）——均已落台账 ✓（分别归下次动 `REPO-CONVENTIONS.md` / `checks.js` 的轮次 ✓）。

**测试面处置（① 寿命判）**：本批无新增单元桩；自证例留 `scripts/gates/selftest.js`（门禁资产 ✓ 不退役）。

**台账**：**R14 → 已核销**（机械守卫 + 定位文档双落 ✓；逐条移入 `docs/TODO-archive.md`）✓；地图 B29 行 → 「已收口 + 核销」✓。