# B34 —— 插件市场后续小修（禁用诚实面 · 受管 tarball 清理 · 全部更新空结果两态）

> 六段一作者（append-only）：§1 / §4 / §6 = 主 agent · §2 = 设计要点（快速通道落笔）· §3 = 评审裁定 · §5 = eng-coder。
> **流程形态 = 快速通道**（同 B33 裁定）：用户 2026-09-20 指令「插件市场设计的一键更新其他功能有没有检查修改一下」= 检查 + 修复的预先批准。

## §1 需求与根因（主 agent）

### 1.1 需求

B33 交付后用户要求对市场其余功能（一键更新 / 全部更新 / 禁用 / 卸载）做一轮审计并修复发现的问题。

### 1.2 审计结论（as-of 2026-09-20 读码 + 桩测）

**无问题面（零改动）**：单个更新（`marketUpdate`）对 GitHub 源复用 B33 tarball 链（`updateSpec` = 原 `github:` 标识）、npm 源走 `realName@version` ✓；更新徽标即时消除 ✓；启用 / 卸载解析门（B28 面）✓。

**三个真问题（同属静默失效 / 不诚实家族）**：

1. **禁用假成功**：profile 清单读不出时 `removeBundle` 静默返回，`marketDisable` 照报「已禁用」。
2. **tarball 残留**：B33 后经 tarball 安装的插件，卸载后 `dshHome()/plugin-tarballs/*.tgz` 无人清理（磁盘泄漏 + 陈包堆积）。
3. **全部更新两态不诚实**：目录三源全败照样重启后端并显示「成功 0 / 失败 0」；无可更新项也无谓重启一次后端。

## §2 设计要点与凭证（快速通道落笔）

设计契约唯一详述处 = `docs/design/SHELL-UX.md` **§2.2.17**（三条契约 + 零回退面）。
要点：① `removeBundle` 返回写盘结果，`marketDisable` 据实报成败；② 卸载成功分支清理「`file:` 依赖且严格位于 `plugin-tarballs/` 内」的安装包（`isInsideDir` 词法判定，外物不动）；③ `marketUpdateAll` 目录 `none` 源 ⇒ 单条失败项，无可更新项 ⇒ 空表且不重启，渲染层空表报「全部已最新」。
**设计凭证**：用户 2026-09-20 指令原文（见 §1.1）= 检查 + 修复批准，快速通道生效。

## §3 评审裁定

快速通道：评审子代理轮**免除**（同 B33 裁定）。自证面 = 桩测五用例（TC-114…TC-118，TC-114 归慢测层）+ 门禁机检（TC-119）。

## §4 受影响文件全清单（主 agent）

| 文件 | 改动 | 行数（改前 → 改后） |
|---|---|---|
| `shell-plugins.js` | `removeBundle` 返回写盘结果；`uninstallPlugin` 成功分支受管 tarball 清理 | 475 → 485 |
| `shell-market.js` | `marketDisable` 据实报；`marketUpdateAll` 两态守卫 | 195 → 199 |
| `market-update.js` | `doUpdateAll` 空结果守卫 | 59 → 60 |
| `tests/b34-market-followup.test.js` | **新建**（TC-114…TC-118；TC-114 归慢测层 `slow()`） | 0 → 264 |
| `docs/design/SHELL-UX.md` / `CHANGELOG.md` / 本档 | §2.2.17 + 用例表 + 变更记录 / 三条目 / — | — |

## §5 实施记录（eng-coder）

### 5.1 代码面

按 §4 清单落地；关键决策：① 清理面只认 `file:` 依赖 + `isInsideDir` 严格包含——registry 依赖（`^x.y.z`）与无主文件一概不碰（TC-116 看门件封口）；② pnpm 警告分支**不清** tarball（半装态保留现场，语义不变）；③ TC-114 因 `readProfileManifest` 三重试（解析门 + 写盘门双读 ≈ 500 ms）归**慢测层**（`slow()`，先例 = `tests/layer.js`）。

### 5.2 门禁实测（as-of 2026-09-20）

- `npm test`（快层）⇒ **PASS 60 / skip 2**（TC-114 与既有慢测各一，归册跳过）；
- `npm run test:full` ⇒ **PASS 62/62**（含本批新增 5 用例；b12 / b28 / b33 档零 diff 同绿）；
- `npm run lint` ⇒ B34 触碰四档**零超宽、零结构违规**（亲测 `checks.js` 判据逐档核）；**全档红 = 并行工作流存量**——`docs/batches/B14-doc-facts.md` 2 行（`:78` / `:80`）非豁免超宽，系本批在飞期间另一工作面（B14 文档事实收口族）+40 行所致（PET.md 3 行同类问题在收尾前已由该面自行消解），**不属 B34 改动面、未动 `baseline.json`**；处置见 §6 遗留。
- **贴线提示（新增）**：`shell-plugins.js` 本批后 **484** 行 ≥ 480（门禁提示行、不拦）——下次改动该档前须先给拆分计划（判据句 = `docs/CONVENTIONS.md` §五）；建议方向 = 扫描 / 更新计算面（`scanProfile` / `computePluginUpdates` / `installedPluginVersion`）拆 `shell-plugins-scan.js`。

## §6 验收勾销（主 agent）

| AC | 内容 | 证据 | 状态 |
|---|---|---|---|
| AC-B34-1 | 禁用不得假成功（清单不可读 ⇒ 报「禁用失败」） | TC-114 ✓（慢测层归册） | ☑ |
| AC-B34-2 | 受管 tarball 随卸载清理；registry 依赖与无主外物不动 | TC-115 / TC-116 ✓ | ☑ |
| AC-B34-3 | 全部更新：目录不可用 ⇒ 如实报失败；无可更新 ⇒ 不重启 + 「全部已最新」 | TC-117 / TC-118 ✓ | ☑ |
| AC-B34-4 | 零回退 + 门禁：B34 触碰面零违规、测试双绿 | §5.2 实测；b12 / b28 / b33 档零 diff | ☑（lint 全档红 = 并行面存量，见遗留） |

**台账 / 变更史联动**：`CHANGELOG.md` `[Unreleased]` Fixed 增两条 + Changed 增一条。
**遗留**：① `docs/batches/B14-doc-facts.md:78,80` 两行非豁免超宽 = **并行工作面（B14 文档事实收口族）引入**——归该族批次处置（或用户裁定后折行），B34 不越权代改；② AC-B33-1 真机面（B33 遗留）仍待用户实装确认；③ `shell-plugins.js` 484 行贴线（拆分建议见 §5.2）。
