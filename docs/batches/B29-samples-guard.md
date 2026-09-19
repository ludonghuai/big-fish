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

## §3 设计评审（评审子代理）

<!-- 由评审子代理填 -->

---

## §4 评审裁决与实施启动（主 agent）

<!-- 由主 agent 填 -->

---

## §5 实施记录（eng-coder）

<!-- 由 eng-coder 填 -->

