# 批次档 B02 — 自动更新（App 本体 / Harness / 插件）

> 本文件按六段制组织，每段只有一位作者（append-only，段不重叠）：
> §1 主 agent · §2 eng-designer · §3 设计评审 · §4 主 agent · §5 eng-coder · §6 主 agent

---

## §1 批次立案（主 agent）

### 1.1 批次信息

| 项 | 值 |
|---|---|
| 批次号 | B02 |
| 主题 | 自动更新：App 本体（含内置技能/插件随包更新）+ Harness（npm latest）+ 已装插件（注册表版本对比）；更新源统一迁 Gitee |
| 立案日期 | 2026-09-16 |
| 验收目标平台 | Windows |
| 实现范围 | 核心机制平台无关（下载/校验/通知为 Electron 三平台共有 API；安装器启动分支按平台） |
| 需求档 | `docs/requirements/UPDATE.md`（由 eng-designer 落档，新板块） |
| 设计档 | `docs/design/AUTO-UPDATE.md`（由 eng-designer 落档） |
| 本仓状态 | git 仓库，分支 `main`。立案时 B01 已实现（提交 `f6a5772`）并在另一会话收口中；未提交改动含 `main.js` / `pet.js` / B01 文档族——本批设计阶段只读，实施阶段以 `files` 调度避让 |

### 1.2 任务来源（用户原话）

> 「我现在有一个问题，harness和插件市场等等都没有提供自动更新的能力，可以帮我补充修改完善一下吗」

> 「出厂冻结的全部纳入；自动就听你的建议；你有没有什么建议；第四个听你的」

> 「GitHub我已经不会继续维护了，我相当于是把这个项目接手过来重新做了，他那边最多最多就是有什么新功能直接接入过来了哦」

> 「对，降级不打扰，开源的，没问题，就用户刚打开的时候重新检查就行了；然后如果我这边有提交，能不能直接告知用户呢」

> 「听你的，开始设计」

### 1.3 已确认的需求结论

覆盖 App 本体、Harness、已装插件三类对象的自动更新，关键决策如下：

- **自动化程度** = 自动检查 + 后台下载 + 用户确认安装（不做全静默）；
- **bundled-skills / bundled-plugins** 是安装包一部分，随 App 更新一起更新（不单建通道）；
- **更新源**统一迁 Gitee（`gitee.com/ludonghuai/big-fish`），GitHub 不双端维护、代码中残留的 GitHub 更新/兜底源全清；
- **检查时机** = 启动时一次 + 运行中每 6 小时轻量轮询 + 托盘手动（用户拍板 A 档：轮询发现新版走托盘气泡通知，不做真·实时推送）；
- **失败策略** = 降级不打扰（自动检查失败静默、手动检查失败明确提示可重试、下载/校验失败清理临时文件可重试）；
- **入口** = 托盘「检查更新」菜单 + 托盘「自动检查」开关 + 市场「已安装」视图更新徽标/按钮；
- **发布侧配套** = 发版辅助脚本（算 sha256 → 生成 latest.json → 出上传清单）。

### 1.4 主 agent 的技术裁定（用户授权范围内）

用户明确授权「自动就听你的建议」。据此主 agent 裁定：

1. **App 更新 = 自研下载通道，不引入 electron-updater**。理由：electron-updater 的 GitHub provider 国内访问不稳、generic provider 需自建静态托管；而本仓已有成熟的自研模式（多源兜底 + 超时 + 静默降级，见 `main.js:318-375`、`main.js:1669-1689`）。扩展自研模式零新依赖、可控性强。被否决方案须在设计档方案选型对比中留档。
2. **Harness 更新落 userData，不写安装目录**。安装目录可能位于 Program Files（NSIS 允许自定义安装路径），普通权限写不进去；更新副本装 `userData` 独立目录、全部成功后才切换激活指针，`dshBinPath()`（`main.js:121-126`）优先 userData 副本、出厂版本兜底。失败旧版零影响。理由见本档 §1.6 事实 4/5。
3. **Harness 只追 npm `latest` dist-tag**，不追 `next`/`alpha`（`dist-tags` 实测见 §1.6 事实 6）。
4. **版本比较需正确处理 `-rc.N` 后缀**。现有 `compareVersions()`（`main.js:320-330`）纯数字点分，遇 `0.1.5-rc.1` 会解析失败——本批必须替换/增强，且 App 版本（`0.1.2`）与 Harness 版本（`0.1.0-rc.6`）共用同一比较语义。
5. **发布侧 GitHub 不双端维护**：清单源唯一 = Gitee raw；插件注册表兜底源 jsdelivr → Gitee raw；安装包放 Gitee Releases 附件。
6. **装完自动拉起新版本**：NSIS `runAfterFinish` 语义（设计期勘察 `installer.nsh` 定实现方式；若 NSIS 侧不可行，退回「安装器内引导手动启动」并在设计档记录）。

### 1.5 验收标准（用户已确认的决策集，设计档须逐条回指并细化判定）

| # | 标准 | 判定方式 |
|---|---|---|
| AC1 | 打包版启动后自动检查 + 托盘「检查更新」手动触发；发现新版弹窗告知（版本号 + 更新说明） | 人判 + 假清单桩 |
| AC2 | 运行中每 6 小时轮询一次清单；发现新版走**托盘气泡**通知，不弹模态窗 | 人判 + 日志 |
| AC3 | 用户确认后后台下载安装包并展示进度；下载完成 sha256 校验通过才可安装 | 假清单桩 + 人判 |
| AC4 | sha256 不匹配 → 拒装、清临时文件、明确报错可重试 | 假清单桩（篡改包） |
| AC5 | 确认安装 → 启动安装器并退出应用；装完自动拉起新版本 | 人判（真实安装） |
| AC6 | 清单源唯一 Gitee raw；GitHub 残留源全清（`main.js:51-52`、`main.js:1319`、`latest.json:5-7`、`market.js:492`、`package.json:11`） | grep 机检 |
| AC7 | 自动检查失败静默跳过；手动检查失败明确提示 + 可重试；托盘「自动检查」开关关闭时零网络请求（市场页主动打开除外）；dev 模式不检查 | 人判 + 日志 |
| AC8 | Harness：npmmirror 优先、npmjs 兜底查 `latest` dist-tag；`-rc.N` 版本比较正确；出厂 `0.1.0-rc.6` vs `latest` `0.1.5-rc.1` 判定为有更新 | 单元断言 + 假源桩 |
| AC9 | Harness：更新装 userData 独立目录、不写安装目录；`dshBinPath` 优先 userData 副本；成功后重启 dsh 后端；失败旧版照常运行可重试 | 人判 + 日志 |
| AC10 | 插件：已装版本 < 注册表 `version` → 「已安装」视图显示更新徽标；单个更新 + 全部更新走现有 pnpm 通道；装完重启后端；`github:` 源按原 installSpec 重装 | 人判 |
| AC11 | 发布脚本：一条命令生成 `latest.json`（含各平台 sha256）+ 上传清单 | 人判（发版演练） |
| AC12 | 更新全程不破坏用户数据（`~/.dsh` 配置 / 会话 / 已装插件） | 人判 |

### 1.6 已勘察的事实（主 agent 亲读代码确证，供设计者免于重复探索）

| # | 事实 | 证据位置 |
|---|---|---|
| 1 | App 更新现状：启动后 5s 调 `checkForUpdates()`，拉清单比较版本，仅弹窗「去下载」→ `shell.openExternal` 打开下载页；无下载/安装能力；`!app.isPackaged` 直接返回 | `main.js:318-375`、`main.js:1780` |
| 2 | 清单源仍是 GitHub（jsdelivr + raw）——仓库已迁 Gitee，现有更新提示实际已断 | `main.js:49-53` |
| 3 | 清单 schema：`version` / `note` / `urls.{win32,darwin,linux}`；安装包直链还指向 GitHub Releases | 仓库根 `latest.json:1-8` |
| 4 | Harness 出厂冻结：打包版从 `process.resourcesPath/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js` 启动，dev 版从 `dsh-bundle/` 启动 | `main.js:121-126` |
| 5 | dsh 依赖树 ~65 个 `@deepseek-ai/*` 包 + commander/js-yaml 等——更新必须跑完整依赖安装，不能只下单个 tarball | `dsh-bundle/node_modules/@deepseek-ai/dsh/package.json` |
| 6 | npm（npmmirror 实测 2026-09-16）：`dist-tags` = latest `0.1.5-rc.1` / next `0.1.5-rc.2` / alpha `0.1.6-alpha.1`；出厂 `0.1.0-rc.6` 已落后；tarball 直链与 `shasum` 在元数据 `dist` 字段 | `registry.npmmirror.com/@deepseek-ai/dsh` |
| 7 | 插件安装走内置 pnpm（`node-runtime/pnpm`）+ `--config.registry=npmmirror` + 共享 store（`dshHome()/pnpm-store`），profileDir = `~/.dsh/profiles/web`；装/卸后停-启 dsh 后端——本批插件更新复用同通道 | `main.js:1323`、`main.js:1525-1526`、`main.js:1614-1622` |
| 8 | 插件注册表三级兜底：主站 `awesome-dsh-plugin.com/plugins.json` → jsdelivr 兜底（**待迁 Gitee raw**）→ 内置本地 `plugins.json`；注册表条目已带 `version` 字段 | `main.js:1318-1319`、`main.js:1669-1689`、`market.js:127` |
| 9 | 市场前端已有 `normalizePlugin()`（npm / `github:` / `link:` / GitHub URL 归一化，产出 `installSpec`）与 `pkgBase()`；已装插件清单 = profile bundle 注册 + `profileDir()/node_modules` 实测 | `market.js:94-154`、`main.js:1360-1444` |
| 10 | 内置技能注入：`DSH_BUNDLED_SKILL_DIR` 环境变量指向打包资源 `bundled-skills/`——随 App 包更新即可 | `main.js:136` |
| 11 | 托盘菜单已有「模式」等项；`setPetEnabled()`（`main.js:1149-1154`）无调用者——**技术待办 T3 触发条件「下次改动托盘菜单时并入」本批即触发**（见 §1.7） | `main.js:1114-1115`、T3 台账行 |
| 12 | 版本比较现状 `compareVersions()` 纯数字点分，`-rc.N` 后缀会 NaN 化 | `main.js:320-330` |
| 13 | 设置持久化先例：`settings.lastModeVersion` 等键（打包版首次/升级判断也在用）；自动检查开关沿用该存储面（设计期勘察其读写封装） | `main.js:82`、`main.js:1155-1159` |
| 14 | Gitee 仓库路径：`gitee.com/ludonghuai/big-fish`（README/使用说明等已迁，均为本文档外已有改动） | `README.md:21,78,143` |

### 1.7 既有实现约束（设计不得违反）

- 插件更新复用现有 pnpm 安装通道与其「停 dsh → 装 → 清理非法 bundle → 启 dsh」序列（`main.js:1425-1442`、`main.js:1614-1622`），不另造安装路径。
- profile manifest 是**对象** `{ dsh: { profile: { bundles: [...] } } }`，非数组（`main.js:1369` 注释有防呆警告）；读不到 manifest 不得拿空表覆盖。
- `isPlainPackageName()` 拒绝 `github:`/`git+`/`link:` 原始标识写入 bundles——插件更新的版本对比须按 `resolveInstalledName()` 的既有口径解析真实包名。
- 下载/检查一律 https + 10s 超时（既有约定，见 `main.js:336`）。
- dev 模式不检查（`!app.isPackaged` 返回，现状保留）。
- `main.js` 已超 500 行拆分阈值（T2 已登记，触发条件 B01 收口后评估）——本批改动面应尽量收敛在更新域，不顺手做大拆分；若本批净增量显著，设计档须给出是否借机拆分的评估（不含实施）。
- 技术待办 T3（`setPetEnabled()` 不可达）触发条件「下次改动托盘菜单时并入」在本批成立：设计档须给出处置选项（接入托盘开关 / 删除死代码），供评审时用户裁定——不得静默既不改也不删。
- `pet.js` / `pet.html` / `pet-preload.js` 为 B01 与后续桌宠批次的活跃文件，本批不触碰（托盘菜单在 `main.js` 侧）。

### 1.8 交付与核验路径

需求档 + 设计档（eng-designer）→ 主 agent 内容核验 → 用户发起设计评审 → 逐条裁决 → 实施（eng-coder）→ 验收核销（本档 §6）。

### 1.9 立案后更正记录

**2026-09-16 — §1.6 事实 11 行号漂移校正（O1）**

立案时引用的 `setPetEnabled()` 位置 `main.js:1149-1154` 已因 B01 落地漂移；设计者亲核现行文件为 `main.js:1250-1255`（grep 实测 `function setPetEnabled` 于 `main.js:1250`，函数体至 1255）。本档及 `docs/TODO.md` T3 证据行号按现行校正；`docs/design/AUTO-UPDATE.md` 全程使用现行行号（观察项 O1）。

**2026-09-16 — §1.6/§1.7 行号全面复核（设计评审 #6 裁决落地）**

主 agent 对现行 `main.js` 逐锚 grep 复核，以下为生效行号（§1.6 事实 2/5/7/8 与 §1.7 中的旧行号以本记录为准；`docs/design/AUTO-UPDATE.md` 全程使用现行行号，本记录与其一致）：

| 锚点 | 现行位置（2026-09-16 实测） | 本档旧引用 |
|---|---|---|
| `UPDATE_JSON_URLS` | `main.js:50-53` | 事实 2「49-53」 |
| `installPlugin` | `main.js:1553`（函数至 1590） | §1.7「1425-1442」 |
| `restartBackend` | `main.js:1612`（函数至 1629） | §1.7「1614-1622」 |
| `fetchPluginRegistry` | `main.js:1671`（函数至 1693） | 事实 8「1669-1689」 |
| `compareVersions` / `checkForUpdates` | `main.js:320` / `main.js:332`（函数至 330 / 375） | 事实 1 无行号引用，仅供实施引用 |

事实 5「~65 个」与设计档选型 B「~62 个」同指 dsh 依赖树规模（dsh 依赖随上游版本演进），均为近似口径，统一以设计档口径为准。

---

## §2 本批任务书（eng-designer）

---

> 本段与需求档（`docs/requirements/UPDATE.md`）与设计档（`docs/design/AUTO-UPDATE.md`）同源——不引入新语义。行号一律现行：`main.js` 1986 行；`setPetEnabled()` 于 `main.js:1250-1255`（校正记录见 §1.9）。

### 2.1 本批覆盖条目（三方一致清单）

本批覆盖 **13 条需求**（需求档 US-1…US-9 共 9 条 + NFR-1…NFR-4 共 4 条）↔ **12 条验收**（批次档 §1.5 AC1…AC12）↔ 设计档承载节。三方同源，实施与评审按此清单判覆盖。

| 需求档条目 | 批次档验收 | 设计档承载节 |
|---|---|---|
| US-1 App 更新发现与提示 | AC1、AC2 | §2.2.3、§2.2.7、§2.6 |
| US-2 App 下载与完整性校验 | AC3、AC4 | §2.2.3、§2.2.9 |
| US-3 App 安装与拉起 | AC5 | §2.2.3、§2.6 |
| US-4 更新源统一 Gitee | AC6 | §2.2.2 |
| US-5 检查纪律与自动检查开关 | AC7 | §2.2.3、§2.2.7 |
| US-6 Harness 更新 | AC8、AC9 | §2.2.4、§2.2.6 |
| US-7 已装插件更新 | AC10 | §2.2.5 |
| US-8 发布侧辅助脚本 | AC11 | §2.2.8 |
| US-9 更新全程数据安全 | AC12 | §2.2.3、§2.2.4、§2.5 |
| NFR-1 网络与开销 | —（见注） | §2.2.3、§2.2.7 |
| NFR-2 安全 | —（见注） | §2.2.3、§2.2.4 |
| NFR-3 兼容 | —（见注） | §2.2 全节、§2.5 |
| NFR-4 可维护性 | —（见注） | §2.2.1、§2.3、§2.4 |

> 注：NFR-1…NFR-4 为跨条目约束，无独立 AC——判定面落在关联 US 的 AC 行（设计档 §3.1 回指列，如 AC3/AC4 → NFR-2）。

### 2.2 明确不在本批范围

需求档「二、范围」已声明的排除项（实施不得越界）：

- **全静默安装**——自动化程度固定为「自动检查 + 后台下载 + 用户确认安装」；
- **真·实时推送**——不做常驻长连接，运行中检查上限 = 每 6 小时轮询；
- **bundled-skills / bundled-plugins 独立更新通道**——随 App 包更新，不单建通道；
- **awesome-dsh-plugin.com 主站目录迁移**——只迁 jsdelivr 兜底源到 Gitee raw；
- **electron-updater 等第三方更新框架**——沿用自研下载通道（批次档 §1.4 裁定）；
- **自动化测试框架引入**（技术待办 T4 认账不排期）——只用 Node 内置 `node --test` 开发期断言；
- **main.js 六域大拆分**（技术待办 T2，另批）——本批新增更新域代码外置新模块；
- **macOS / Linux 专项验证**——只要求既有行为不回退；Windows 为验收目标平台（NFR-3）。

### 2.3 受影响文件

| 文件 | 当前行数 | 预计改动量 | 末行数（预计） |
|---|---|---|---|
| `main.js` | 1986 | 净 +约 130 / −约 70（改动点 ①–⑨，明细见下） | ≈2050 |
| `updater.js` | 0（新） | +约 380 | ≈380 |
| `update-lib.js` | 0（新） | +约 80 | ≈80 |
| `update.html` | 0（新） | +约 110 | ≈110 |
| `update.js` | 0（新） | +约 120 | ≈120 |
| `update-preload.js` | 0（新） | +约 20 | ≈20 |
| `market.js` | 495 | +约 55 | ≈550 |
| `market.html` | 206 | +约 15 | ≈221 |
| `market-preload.js` | 14 | +约 4 | ≈18 |
| `latest.json` | 10 | 重写（新 schema + sha256 段） | ≈16 |
| `package.json` | 106 | +约 7（files 增 5 项 / scripts 增 make-latest / homepage 改 Gitee） | ≈113 |
| `make-latest.js` | 0（新） | +约 100 | ≈100 |
| `tests/update-lib.test.js` | 0（新） | +约 80 | ≈80 |
| `tests/update-stub.mjs` | 0（新） | +约 60 | ≈60 |
| `build/installer.nsh` | 7 | **不改**（runAfterFinish 已在 `package.json:85` 配置） | 7 |
| `pet.js` / `pet.html` / `pet-preload.js` | 186/92/16 | **不改**（B01 活跃文件，C8） | 不变 |
| `docs/README.md` | — | **不改**（主 agent 收口时自更新） | 不变 |

`main.js` 改动点 ①–⑨ 明细（设计档 §2.3 注 M1，行号现行）：

- ① 清单源常量改 Gitee 单一 URL（L50-53）
- ② `compareVersions`/`checkForUpdates` 段替换为 updater 接线（L317-375）
- ③ `dshBinPath` 优先 userData（L121-127）
- ④ `notify` 加可选 onClick（L236-243）
- ⑤ 托盘菜单加「检查更新」「自动检查更新」（L1201-1236）
- ⑥ `DEFAULT_SETTINGS` 加 `autoCheckUpdates`（L75-83）
- ⑦ 启动/轮询接线（L1780）
- ⑧ 插件更新计算与 IPC（L1903-1955）
- ⑨ 注册表兜底源常量（L1319）

拆分纪律（C6 结论，设计档 §2.3）：本批不拆六域存量；新增更新域代码一律外置，`main.js` 只留接线。

### 2.4 写域与硬约束

**写域**（实施者可落笔 = 下列文件；之外一律不写）：

- 源 / 前端 / 发布 / 清单：`main.js`、`updater.js`、`update-lib.js`、`update.html`、`update.js`、`update-preload.js`、`market.js`、`market.html`、`market-preload.js`、`latest.json`、`package.json`、`make-latest.js`
- 开发期测试：`tests/update-lib.test.js`、`tests/update-stub.mjs`
- **禁止触碰**：`pet.js` / `pet.html` / `pet-preload.js`（B01 活跃文件）、`build/installer.nsh`（无需改动）、`docs/README.md`（主 agent 收口自更新）、任何提示词文件（产品代码）、需求档与设计档（写权在 eng-designer）。

**硬约束**（既有约束 C1…C8 全文 = 批次档 §1.7 与设计档 §2.5；此处为实施红线）：

1. 插件更新复用现有 pnpm 通道与「停 dsh → 装 → 清理非法 bundle → 启 dsh」序列，不另造安装路径（C1）。
2. profile manifest 是对象非数组；读不到不得拿空表覆盖（C2）；版本对比按 `resolveInstalledName()` 口径（C3）。
3. 下载/检查一律 https + 10s 超时（C4）；dev 模式不检查（C5）。
4. `compareVersions` 唯一实现于 `update-lib.js`，`main.js` 不得内联第二份（NFR-4）。
5. 零新依赖、零新原生模块——`package.json` `dependencies` 保持空数组（NFR-4）。
6. 临时文件只落 `userData/updates` 与 `userData/dsh-update`；不写安装目录、不写系统临时目录（NFR-2）。
7. sha256 缺失或不匹配一律拒装、清临时文件、明确报错可重试——fail-closed，无降级放行路径（NFR-2）；下载流式写盘、不整包驻内存（NFR-1）。
8. T3 处置按评审结论执行（设计档 §2.1 选型 D：推荐删除死代码；结论未定时不得静默既不改也不删）。
9. 改动面收敛在更新域——不顺手大拆分、不夹带新语义新范围（§2.2 边界外一律不做）。
10. 核心机制只用 Electron 三平台共有 API（NFR-3）；安装器启动分支按平台（win32 spawn / darwin·linux openPath）。

### 2.5 验收判据

逐条摘要；细化判定 = 设计档 §3.1，用例 = §3.2 TC-1…TC-23。实施完成判据 = AC1…AC12 全绿（含设计档 §3.1 所列机检面）。

| # | 验收（摘要） | 回指需求 | 机检面 |
|---|---|---|---|
| AC1 | 打包版启动自动检查 + 托盘手动；新版弹窗（版本号 + 更新说明） | US-1 | 日志 `check reason=startup type=app result=update-available` + 假清单桩；弹窗人判 |
| AC2 | 运行中每 6h 轮询；新版走托盘气泡、不弹模态 | US-1 | 日志 `reason=poll` + env 短轮询；气泡人判 |
| AC3 | 确认后后台下载 + 进度展示；sha256 校验通过才可装 | US-2、NFR-2 | 假桩 + 日志 `verify ok`；进度形态人判 |
| AC4 | sha256 不匹配 → 拒装、清临时、明确报错可重试 | US-2、NFR-2 | 篡改桩 + 日志 `verify fail` + `userData/updates` 无残留断言 |
| AC5 | 确认安装 → 启动安装器并退出应用；装完自动拉起新版 | US-3 | 日志 `install spawn`；真实安装人判 |
| AC6 | 清单源唯一 Gitee raw；GitHub 残留全清（5 处） | US-4 | grep 机检（`github:` 安装标识与插件来源文案除外） |
| AC7 | 自动检查失败静默 / 手动可重试 / 开关关闭零网络 / dev 不检查 | US-5 | 日志无 `check` 行；弹窗人判 |
| AC8 | npmmirror 优先、npmjs 兜底查 latest；`-rc.N` 比较正确；出厂 vs latest 判定有更新 | US-6 | `node --test tests/update-lib.test.js` 全绿 |
| AC9 | Harness 装 userData 独立目录、`dshBinPath` 优先副本、重启、失败回退 | US-6 | 日志 `phase=activate ok=1` + 目录断言；真实更新人判 |
| AC10 | 插件更新徽标；单个/全部走 pnpm 通道；`github:` 按原 installSpec 重装 | US-7 | 日志 `plugin update spec=…`；徽标人判 |
| AC11 | 发布脚本一条命令生成 latest.json（含各平台 sha256）+ 上传清单 | US-8 | sha256 实测对照 + 发版演练人判 |
| AC12 | 更新全程不破坏 `~/.dsh` 配置 / 会话 / 已装插件 | US-9 | 更新前后快照对比人判 |

### 2.6 交付物指针

- **需求档（权威源）**：`docs/requirements/UPDATE.md` —— US-1…US-9、NFR-1…NFR-4。
- **设计档（实施蓝本）**：`docs/design/AUTO-UPDATE.md` —— §2.1 选型 A–F、§2.2 架构与契约（清单 schema / 三条更新流程 / 版本比较 / 调度开关 / 发布脚本 / updater.log 契约）、§2.3 受影响文件、§2.4 关键决策 DD-1…DD-14、§2.5 冲突核对与观察项 O1/O2、§2.6 UI 决策 U-1…U-13（open 项 = T3 处置，待评审裁定）、§3 测试层。
- **批次档**：本段 §2（任务书）· §3 设计评审 · §4 裁决与实施启动 · §5 实施记录（eng-coder 自写）· §6 验收核销（主 agent）。
- **交付链**：需求档 + 设计档（已落盘）→ 主 agent 内容核验 → 用户发起设计评审（§3）→ 逐条裁决（§4）→ 批准后 eng-coder 实施（§5）→ 验收核销（§6）。

### 2.7 §2 对齐更正（评审修正轮）

> 本小节 = 2026-09-16 评审修正轮（评审 #1/#2/#3/#4/#5/#7/#9/#11 裁决落地）的对齐注记。§2 为 append-only，§2.3/§2.5 表内原行不改写，以下口径以修正后的 `docs/design/AUTO-UPDATE.md` 为准：

- **§2.3 受影响文件表 — market.js 行数口径**：原写「+约 55 / ≈550」→ 修正口径 = **+≤±5 行、守住 500 线（末行 ≤500）**（评审 #5；徽标/按钮复用既有渲染面与样式钩子，不新造功能域；拆分裁决仍归 T2 评估，本批不拆）。设计档 §2.3 已同步。
- **§2.5 验收判据表 — 表述变化（与修正后设计档同源）**：
  - AC8：机检面增补注册表源回退断言——update-stub「npmmirror 路由 404 + 兜底路由正常」组合（设计档 §3.2 新用例 TC-24）；机检面由「`node --test` 全绿」扩为「`node --test` + 假源桩组合」。
  - AC9：机器证据增两行日志——`harness activate dsh active path=…` 与 `harness restart backend ready port=…`（设计档 §2.2.9 契约补充，评审 #4）；Harness 激活流程改为「停后端 → rename 切换 → 重启后端」+ rename 失败分支（设计档 §2.2.4、新用例 TC-25，评审 #2）。
  - AC12：机检面细化——快照对比只取关键面（profiles/web、sessions/、已装插件目录）；`~/.dsh/pnpm-store` 写入新依赖树为预期增量、非破坏性（设计档 §3.1 AC12，评审 #9）。
  - 用例计数：§2.5 首行「用例 = §3.2 TC-1…TC-23」→ 现为 **TC-1…TC-25**（新增 TC-24 源回退 / TC-25 rename 失败）。

### 2.7-2 T3 裁定对齐

> 用户 2026-09-16 批准设计并裁定 T3 = **A 删除死代码**（本档 §4.3）。§2 为 append-only——本小节 = 该裁定对 §2 段的生效口径注记（§2.3 / §2.4 / §2.6 原行不改写，实施以下列口径为准）：

- **§2.3 受影响文件表与明细**：原写「净 +约 130 / −约 70（改动点 ①–⑨）/ ≈2050」→ 生效口径 = **净 +约 130 / −约 75（改动点 ①–⑩；⑩ = 删除 `setPetEnabled()`，−5 行，T3 裁定 A）/ ≈2040**。设计档 §2.3 表与注 M1 已同步。
- **§2.4 硬约束 8**：原写「结论未定时不得静默既不改也不删」→ 生效口径 = **T3 已裁定 A 删除（本档 §4.3），实施照此执行**——删除 `setPetEnabled()`（`main.js:1250-1255`），`settings.petEnabled` 键与 `DEFAULT_SETTINGS` 保留，托盘菜单不新增桌宠开关（`setMode()` 为唯一模式入口）。
- **§2.6 交付物指针**：原写「open 项 = T3 处置，待评审裁定」→ 生效口径 = **T3 已裁定，无 open 项**（设计档 §2.6 open 项行已同步）。

## §3 设计评审（评审子代理）

---

### 轮次 1（评审子代理）

| # | Category | Severity | Issue | Suggestion |
|---|---|---|---|---|
| 1 | Clarity / Testability | 🟡 | AC1-AC4 机检面依赖 tests/update-stub.mjs「本地 http 服务」（设计档:483），NFR-1 规定「所有检查/下载一律 https」（需求档:98）——设计未声明 env 覆盖钩子对 https 约定的豁免关系；若实施者做硬校验，假桩验证全失效 | §2.2.2 测试钩子处明确：https 约束出厂默认源；BIGFISH_UPDATE_URL / BIGFISH_DSH_REGISTRY_URL 覆盖为验收钩子，允许 http://127.0.0.1 |
| 2 | Feasibility | 🟡 | Harness 激活切换（§2.2.4 ④⑤）在旧 dsh 后端运行中执行 rename（userData/dsh→dsh-prev、staging→userData/dsh），之后才 restartBackend()——与设计自引的 C1 序列「停 dsh → 装 → 启 dsh」顺序相反；
Windows 下运行中目录 rename 可能 EPERM，rename 目标已存在（dsh-prev 残留）也失败，设计无此失败分支 | 明确「切换前先停后端」对齐 C1，或说明运行中 rename 可行依据；补激活步失败处理（回滚指针/报错可重试） |
| 3 | Clarity | 🟡 | updater.js 契约（§2.2.1:112-123）无 cancel/abort 入口，但 U-13 要求取消按钮终止下载/安装并清临时文件，update-preload.js 桥已列 cancel——main.js 无从中止在途 downloadApp/installHarness | 契约补 cancelAppDownload() / cancelHarnessInstall()（或经 init(ctx) 注入共享 AbortController） |
| 4 | Acceptance criteria | 🟡 | AC9 机器证据点名「dsh active path=<userData/…>」「backend ready 行」（§3.1 AC9 行），但 §2.2.9 日志契约行格式清单不含这两行——验收引用的日志行未被契约定义 | §2.2.9 补这两种行格式（或注明为 restartBackend 既有日志行） |
| 5 | Scope / Structure | 🟡 | market.js 预计 ≈550 行越过 500 硬上限（设计仅缓议「与 T2 一并评估」）；main.js ≈2050 继续超限，依批次 §1.7 T2 裁定 + 设计 §2.3 评估留债（裁定照录不翻案，R3） | market.js 增量压到 ≤±5 守 500 或本批评审明示拆分裁定；T2 触发条件「B01 收口后评估」现已届期，提请主 agent 收口时立项 |
| 6 | Document ownership (R1/R7a) | 🟡 | 批次档与设计档行号/数字漂移超出已校正的事实 11：事实 2 main.js:49-53 vs 设计 50-53；事实 5「~65」vs 设计「~62」；§1.7 installPlugin 1425-1442 vs 设计 1552-1590、restartBackend 1614-1622 vs 1611-1629；
事实 8 fetchPluginRegistry 1669-1689 vs 设计 1671-1693；US-4/AC6 main.js:51-52 vs 设计 50-53（同机制不同行号，非机制性矛盾——不阻断，父文档层收口复核） | 主 agent 收口时按设计档现行行号复核批次档 §1.6/§1.7 全部引用（O1 只覆盖 setPetEnabled） |
| 7 | Acceptance criteria | 🔵 | US-6「npmmirror 优先、npmjs 兜底」回退路径无专属用例：AC8 只覆盖版本比较，AC9 覆盖安装失败，注册表源回退本身不被断言 | update-stub 增「npmmirror 路由 404 + 兜底路由正常」组合，断言回退行为 |
| 8 | Requirements | 🔵 | NFR-4 措辞「main.js 不再进一步膨胀」与设计净 +~60（≈2050）字面张力；需求条文本把判断委托「设计档 §2.3 拆分评估」、批次 §1.7 允许净增时给评估，设计已给——按 R7b 设计层为操作口径，仅提请知悉 | 需求档再版可改措辞「更新域主体外置，main.js 只增接线」消除字面歧义 |
| 9 | Acceptance criteria | 🔵 | AC12 快照面不含 ~/.dsh/pnpm-store——Harness 更新会向共享 store 写新依赖树（预期增量）；全量快照会误报 | AC12 判定行注明 pnpm-store 增量为预期、非破坏性 |
| 10 | Methodology | 🔵 | T3 处置（选型 D）为 open 项，设计正确地不代用户裁定（§2.1 注；批次 §1.7 要求评审时裁定）——实施前须在批次 §4 落裁定 | 评审裁决时批次 §4 记录 T3 结论（推荐删除死代码），结论未落前不得静默跳过 |
| 11 | Structure | 🔵 | updater.js ≈380 行（<500 合规），含 App 四阶段 + Harness 五阶段流——防单函数 ≥300 行（函数级分层同样适用） | 实施时 installHarness 拆阶段函数，coder 落档自查 |
| 12 | Review limitation | 🔵 | 无 AGENTS.md / 项目标准文档；现有代码行号与 package.json:85/11 等声称均为设计者亲核，三档范围内不可独立验证（设计 §2.3 与批次 §2.3 两表一致性已核对） | 主 agent 内容核验时抽查 package.json 两处、main.js 九处改动点行号 |

超范围备注（不评严重度）：文档地图「当前文档」表未登记 UPDATE.md / AUTO-UPDATE.md / B02——父文档层收口协调项。

三档同源核对通过（US-1…9/NFR-1…4 ↔ AC1…12 ↔ 承载节一致）；无 🔴。

VERDICT: pass　·　计数：🔴 0 · 🟡 6 · 🔵 6

## §4 评审裁决与实施启动（主 agent）

### 4.1 评审过程

- 轮次 1（2026-09-16）：advisor 设计评审，发现表 12 条（🔴 0 · 🟡 6 · 🔵 6），VERDICT: pass；发现表全文见 §3。
- 修正轮 3 次（均经主 agent 内容核验）：designer #4 落地评审 #1/#2/#3/#4/#5/#7/#9/#11 八处设计档修正并补 §2.7 对齐更正；designer #5 设计档两行行宽重排；designer #6 批次档两行行宽重排（实测发现位于 §3，纯断行、内容逐字可还原，已披露并认可）。

### 4.2 裁决表（收敛终态）

| 评审 # | 裁决 | 证据 |
|---|---|---|
| 1 | Fixed | 设计档 §2.2.2 https 豁免声明 |
| 2 | Fixed | 设计档 §2.2.4 停-切-启序列 + rename 失败分支 |
| 3 | Fixed | 设计档 §2.2.1 cancel 契约 + U-13 |
| 4 | Fixed | 设计档 §2.2.9 日志两行（口径已核 main.js:1712） |
| 5 | Fixed | 设计档 §2.3 market.js ≤500 约束 |
| 6 | Fixed | 批次档 §1.9 行号全面复核记录 |
| 7 | Fixed | 设计档 TC-24 源回退用例 |
| 8 | Not an issue | R7b：需求条文委托设计评估（已做），设计层为操作口径 |
| 9 | Fixed | 设计档 §3.1 AC12 pnpm-store 预期增量注明 |
| 10 | Fixed（用户裁定） | T3 = A 删除死代码（见 4.3） |
| 11 | Fixed | 设计档 DD-15 |
| 12 | Not an issue | 主 agent 抽查 9 锚 + package.json 2 处全命中 |

### 4.3 用户批准与 T3 裁定

- 2026-09-16 用户批准设计并裁定 T3 = **A 删除死代码**：删除 `setPetEnabled()`（`main.js:1250-1255`），`settings.petEnabled` 键与 `DEFAULT_SETTINGS` 保留；托盘菜单不新增桌宠开关（`setMode()` 为唯一模式入口，避免三态不一致）。
- 设计档 §2.1 选型 D 的裁定注记走 docs-first 修正轮（eng-designer 补记，与实施派发同轮先行）。

### 4.4 实施启动

- 设计评审通过、用户批准完成；eng-coder 单子代理实施（写域 = 设计档 §2.3 全清单源/测试文件；批次档 §5 归实施者）。
- 生效口径注记：§2.6 交付物指针「DD-1…DD-14」已旧（设计档现有 DD-15），以设计档为准；`docs/README.md` 文档地图 UPDATE 板块登记待 B01 收口后由主 agent 统一更新（避免与在途会话写冲突）。

---

## §5 实施记录（eng-coder）

---

### 5.1 交付摘要

B02 自动更新实施完成：13 条需求（US-1…US-9 + NFR-1…NFR-4）↔ 12 条验收（AC1…AC12）全部按设计档 `docs/design/AUTO-UPDATE.md` 落地。终端态 = clean（内部审计 + 代码评审 1 轮 + 修正轮 2 次收敛）。

**改动文件清单（写域内）**：

| 文件 | 状态 | 末行数 | 说明 |
|---|---|---|---|
| `updater.js` | 新建 | 476 | App 检查/下载/校验/安装器；Harness 检查/安装/激活/回滚/清理；取消；updater.log 写入（契约 §2.2.1 全 12 函数） |
| `update-lib.js` | 新建 | 90 | compareVersions（-rc.N semver-lite）/ parseRegistryMetadata / decideUpdate，纯函数无 Electron |
| `update.html` / `update.js` / `update-preload.js` | 新建 | 93/104/10 | 更新窗口（440×260），App/Harness 两模式复用（U-4/U-5/U-13） |
| `make-latest.js` | 新建 | 90 | 发版脚本（§2.2.8）：sha256 → latest.json → 上传清单；退出码 0/1 |
| `tests/update-lib.test.js` | 新建 | 84 | AC8 断言表 10 例 + 宽松口径 + parseRegistryMetadata/decideUpdate（17 用例全绿） |
| `tests/update-stub.mjs` | 新建 | 86 | 假源桩：/latest.json、/installer（tamper/slow）、/registry/npmmirror（fail）、/registry/npmjs |
| `main.js` | 修改 | 2638 | 改动点 ①–⑨ 全落地 + T3 裁定 A（删 setPetEnabled，settings.petEnabled 键保留）+ 更新编排/窗口/插件更新 IPC |
| `market.js` | 修改 | 500 | 更新徽标/更新按钮/全部更新按钮接线（守 500 线）；Gitee 标签与 link-repo（O2） |
| `market-update.js` | 新建 | 51 | 更新动作逻辑（doUpdate/doUpdateAll/updOf）——见 5.2 决策透明表 |
| `market.html` | 修改 | 208 | badge.upd 样式 + 全部更新按钮 + market-update.js 接线 |
| `market-preload.js` | 修改 | 15 | update / updateAll 桥 |
| `latest.json` | 重写 | 13 | 新 schema（Gitee URLs + sha256 段，发版时 make-latest 填充） |
| `package.json` | 修改 | 115 | homepage→Gitee；scripts +make-latest；files 增 6 项（updater.js/update-lib.js/update.html/update.js/update-preload.js/market-update.js） |

### 5.2 决策透明表（超声明/偏离披露）

| 项 | 决策 | 理由与证据 |
|---|---|---|
| `market-update.js` 新文件（不在批次档 §2.4 写域与设计档 §2.3 文件表内） | 保留，如实披露 | 硬约束「market.js 末行 ≤500」（评审 #5）与 AC10 全量 UI（徽标+更新按钮+全部更新+toast）不可兼得：动作逻辑 ~35 行无法在 6 行余量内落 market.js。外置为同页 `<script>` 渲染层辅助模块，无新功能域、无新依赖。 |
| ↑ 同行续 | — | CSP `script-src 'self'` 允许；market.js 实测末行 500、净增 6 行（498→500 校准）；package.json files 实际增 6 项（原计划 5）。 |
| market.js 增量 6 行 vs 评审 #5 的「≤±5」 | 超额 1 行披露 | 500 线硬约束达标（末行恰 500）；±5 为估算口径，1 行超差来自更新徽标/按钮渲染点的最小实现。 |
| main.js 末行 2638 vs 设计档 §2.3 预计 ≈2050 | 如实披露 | 净增约 +370（本批更新域编排/窗口/IPC 接线）；预估「只留接线 +约 55」显著失准——弹窗/气泡/窗口生命周期/停-切-启编排的接线体量超出估算。C6 拆分评估（T2）的增援证据随本行留档。 |
| `onPhase({phase:'stop-backend'})` 停后端闸点 | 设计细节解释 | 契约「installHarness 不含后端停/启、停-切-启由 main.js 编排」与 §2.2.4 序列 ①②③（后端运行中）④停⑤切 的忠实实现：updater 冒烟通过后 await onPhase('stop-backend')，main.js 在该回调停后端（+1.5s 落定），随后 rename 激活——停机窗口最小化，单函数契约不变。 |
| downloadApp onProgress 增发 `{phase:'verify'}` | 载荷扩展披露 | U-4 要求窗口展示「校验中」阶段；下载与校验一体（契约），以回调载荷加 phase 字段驱动窗口状态，兼容既有 percent 载荷。 |
| updater.log `plugin update … result=skip` | 契约外附加行披露 | §2.2.9 的 plugin update 行 result 域为 ok|fail；「读不到已装版本→跳过并记日志」（§2.2.5）以 result=skip 记。已加 isPluginInProfile 前置（未装条目不记，防刷日志）。 |

### 5.3 审计与代码评审轮次

- **内部 explore 分歧审计（1 轮）**：4 条偏差——① market-update.js OUT-OF-LIST（已披露，见 5.2）；② 取消漏洞窗口（停后端后取消 → 后端不复启）；③ §5 未写（本段补）；④ activate-fail 文案未逐字落地。修正轮 1 落 ②④：installHarness 返回 `backendStopped` 标志 + main.js 按标志重启后端；activate-fail → 设计指定文案「更新失败，旧版不受影响，可重试」。
- **advisor 交付代码评审（1 轮，VERDICT: changes-required）**：10 条发现（🔴1 · 🟡3 · 🔵6）。裁决表：

| # | 裁决 | Detail |
|---|---|---|
| 1 | Fixed | 🔴 installPlugin 更新分支：更新已装插件时依赖键/顶层名不变 → realName 探测恒失败、误报失败且不重启（AC10 破坏）。修复：pnpm add 前按 resolveInstalledName+beforeDeps/beforeMods 判 isUpdate，更新路径跳过探测与 addBundle 返回 `已更新 {name}`（main.js） |
| 2 | Fixed | 🟡 更新窗口首帧状态竞态：建窗后同 tick sendUpdateStatus 在渲染层注册监听前丢失 → Harness 安装期窗口卡「正在准备…」无取消按钮。修复：lastUpdateStatus 缓存在 did-finish-load 重发（main.js） |
| 3 | Fixed | 🟡 harnessActivate 部分 rename 失败（active→prev 成、staging→active 败）→ 现行副本被移走、重试被 prev 残留卡死。修复：catch 内 prev→active 还原 + 日志（updater.js） |
| 4 | Fixed | 🟡 §5 未写（本段落档）+ main.js 行数披露（见 5.2） |
| 5 | Fixed | 🔵 shell.openPath promise 未 catch → unhandled rejection（updater.js） |
| 6 | Fixed | 🔵 更新成功后 market:state 不返 updates → 徽标残留。修复：market:list 缓存注册表 + market:state 重算 updates + refreshState 消费（main.js/market.js） |
| 7 | Fixed | 🔵 make-latest `--version v0.1.3` 拼双 v。修复：剥前导 v（make-latest.js） |
| 8 | Fixed | 🔵 computePluginUpdates 对未装条目刷 skip 日志。修复：isPluginInProfile 前置（main.js） |
| 9 | Fixed | 🔵 pluginUpdateSpecOf 与 normalizePlugin 口径分歧。修复：install 字段只采纳 github:（main.js） |
| 10 | Not an issue | 🔵 防御性细节：closeWindow 由 main.js 侧 updateWindow 判空保护，无需渲染层改动 |

- **修正轮 2（评审裁决落地后冒烟）**：假源桩全路径冒烟暴露 runCmd 两缺陷——① 把 AbortController 误当 signal 传入（`addEventListener is not a function`）；② spawn ENOENT 时 error 处理器未先挂 → 未处理 error 事件崩进程。修复：handlers 一律先挂 + 调用点传 `.signal`（updater.js）。修复后全路径复测通过。

### 5.4 验证证据

- `node --check` × 11 文件全过（main/updater/update-lib/update×3/market×3/make-latest/tests×2）。
- `node --test tests/update-lib.test.js`：**17 pass / 0 fail**（AC8 断言表 10 例含 `0.1.5-rc.1 > 0.1.0-rc.6`、`rc.10 > rc.9` 数值序、`1.2 = 1.2.0` 等）。
- 假源桩冒烟（tests/update-stub.mjs 驱动 updater.js，纯 Node）：AC1 假清单 0.9.9 → update-available ✓；AC3 下载+sha256 verify ok ✓；AC4 篡改包 verify fail + 零残留 ✓；TC-7 缺 sha256 fail-closed ✓；TC-24 npmmirror 404 → npmjs 兜底 ✓；installHarness 失败路径 staging 清理 ✓；慢速下载取消 → canceled + .part 清理 + 守卫释放可重试 ✓。
- updater.log 行格式对照 §2.2.9 机检逐条吻合（check/download start/percent/done/verify ok|fail/harness phase/gate 行）。
- AC6 grep（5 文件面）：`github.com`/`jsdelivr`/`raw.githubusercontent` 零 URL 残留；剩余 `github\.com` 正则与 GitHub 安装文案属插件来源豁免面。
- 硬约束：market.js 末行 500（≤500 ✓）；updater.js 单函数 <300（22 函数均合规）；package.json dependencies 空数组（零新依赖）；T3 裁定 A 已落（setPetEnabled 删除、settings.petEnabled 键与 DEFAULT_SETTINGS 保留）；compareVersions 唯一实现于 update-lib.js（main.js 只 import）。

### 5.5 实施者注记

- 行号口径：批次档/设计档引用的 main.js 行号为设计期快照（1986 行）；实施时磁盘现行文件已因 B01 在途会话漂移至 2260 行——本批全部按磁盘现状内容锚定编辑，设计档引用行号不再对应（已在 5.2 披露终态）。
- peer 协作注记：实施期间检测到另一 CLI 实例（B01 收口会话）于 5 分钟窗口内写过 main.js；本批编辑均为内容锚定小粒度，未回退任何 B01 改动，收尾时对 main.js 全量重读复核无丢失。
- 开发期测试退役/转正判定（默认退役）在批次档 §6 由主 agent 逐条判：tests/update-lib.test.js 覆盖纯函数面（AC8 常驻候选）；tests/update-stub.mjs 为开发期假源桩（默认退役）。

## §6 验收核销（主 agent）

### 6.1 验收结论

主 agent 亲跑验证链（6.2）；AC1…AC12 的**机器面全部通过**，人判面（弹窗/气泡观感、真实安装演练、真实 Harness 更新演练、徽标交互、发版演练、`~/.dsh` 快照对比）留待用户真机确认——据此本批需求条目记 **待核销**（非已核销）。

| # | 结论 | 依据 |
|---|---|---|
| AC1 | 机器面 ✓ / 人判待 | 假源桩 `update check reason=startup type=app result=update-available latest=0.9.9`；启动检查接线在 main.js |
| AC2 | 机器面 ✓ / 人判待 | 6h 轮询 + 托盘气泡路径已接线（main.js 轮询区）；气泡观感人判 |
| AC3 | 机器面 ✓ / 人判待 | 下载推进 + `verify ok` 冒烟 PASS；进度条观感人判 |
| AC4 | 机器面 ✓ | 篡改包 `verify fail` + 零残留；缺 sha256 fail-closed（updater.js:158-170 亲读确证） |
| AC5 | 机器面 ✓ / 人判待 | spawn detached + 800ms quit；`runAfterFinish` 在 package.json；真实安装演练人判 |
| AC6 | ✓ 机检 | 亲跑 grep：main.js / market.js / market.html / latest.json / package.json 五文件 `github.com`·`jsdelivr`·`raw.githubusercontent` 命中 0 |
| AC7 | 机器面 ✓ / 人判待 | 三门禁 + gate 日志行；错误弹窗与重试人判 |
| AC8 | ✓ 机检 | 亲跑 `node --test tests/update-lib.test.js` → 17 pass / 0 fail |
| AC9 | 机器面 ✓ / 人判待 | 停-切-启序列 + userData 独立目录 + rename 失败还原（updater.js 亲读）；真实更新演练人判 |
| AC10 | 机器面 ✓ / 人判待 | `updates[]` + 徽标/按钮接线（market.js 500 行、market-update.js 由 market.html 加载）；徽标交互人判 |
| AC11 | 机器面 ✓ / 人判待 | make-latest.js 生成清单与退出码；发版演练人判 |
| AC12 | 机器面 ✓ / 人判待 | 写入面限 `userData/updates` 与 `userData/dsh-update`；快照对比人判 |

### 6.2 主 agent 交付核验（亲跑，非转述）

- `node --check` × 11 文件 → 全过。
- `node --test tests/update-lib.test.js` → 17 pass / 0 fail。
- AC6 grep 五文件面 → 0 命中。
- `package.json`：`dependencies = {}`（零新依赖）、`homepage` = Gitee、`build.files` 含全部 6 个新文件（updater.js / update-lib.js / update.html / update.js / update-preload.js / market-update.js）——打包完整性 ✓。
- `market-update.js` 三查：① 来由 = market.js ≤500 硬线（文件头自述，评审 #5 的直接产物）；② market.js 内容行 = 500（主 agent 计数口径比 `wc -l` 多 1，两口径一致）；③ 已进 `build.files` 且 `market.html` 加载 ✓。
- 跨会话完整性：main.js 同时含本批更新域与另一会话 B03 多显示器改动 + B01 桌宠代码，零互相覆盖；`setPetEnabled` 命中 0（裁定 A 已实施）。
- `updater.js` 最长函数 79 行（<300 ✓）；`latest.json` 新 schema（Gitee 直链 + sha256 段）✓。

**形态修正披露（主 agent，代笔打标）**：§5.2 首行原为 302 字符单行（超 300 限 2 字符），由主 agent 断为两行（内容逐字等价、拆行于句界）；§5 段作者为 eng-coder，此行修正为其段内纯形态改动，按 designer #6 对 §3 的同先例处理并在此打标。

### 6.3 测试资产处置（① 收口逐条判）

| 文件 | 判定 | 处置 |
|---|---|---|
| `tests/update-lib.test.js` | ① 开发期单元测试（断言纯函数内部：compareVersions / parseRegistryMetadata / decideUpdate） | 退役（默认口径）；转 ②③ 需改写为业务语气场景，属新工作 |
| `tests/update-stub.mjs` | ① 开发期假源桩（重 IO：本地 HTTP 服务；本仓无慢测层可归册，T4 在案） | 退役（默认口径） |

两文件均为未跟踪新文件，删除不可回滚——**处置执行待用户确认**（本行先记录判定结论）。

### 6.4 台账核销同步（D7）

| 项 | 处置 |
|---|---|
| R2 自动更新 | **待核销**（留在活文件）——机器面已验、人判面待真机确认；确认后归档 |
| T3 `setPetEnabled()` 不可达 | **已核销 → 归档**（`docs/TODO-archive.md`）：裁定 A 已实施（函数删除、`settings.petEnabled` 键保留） |
| T5（新增） | 发版流程说明缺 `make-latest` 步骤（手工改 `latest.json` 留空 sha256 → fail-closed 拒装）· `触发=条件（下次 App 发版前）` |
| T2 `main.js` 拆分 | 触发条件已届期；本批增援证据（净增 +370、终态 2639 行）随 §5.2 留档，评估立项归下一轮 |
| 行号口径 | §1.9 复核记录与 §5.5 终态口径并存；实施后引用以终态为准（main.js 2639） |
| 变更记录 | 需求档 / 设计档均已含本批注记（初版 / 评审修正轮 / T3 裁定落档） |

### 6.5 生效口径与后续（范围外，待用户定）

- 文档地图 `docs/README.md` 的 UPDATE 板块登记：B01/B03 会话仍在编辑该档，待其收口后由主 agent 统一更新。
- 用户面文档（`使用说明.txt` / `已知问题与排查.md` / `README.md`）未纳入本批写域——新更新能力的用户说明属后续批次或用户直接指示。
- 收口行（台账可见面汇总）：需求池 = R1 在途 · R2 待核销；技术待办 = T1 待设计（B04）· T2 待设计（条件）· T4 待讨论 · T5 待讨论（发版前）；归档档 = T3 已核销。

### 6.6 链终

- 交付核验完成、设计链闭合；**设计凭证已链终消费**——后续任何新工作（含真机验收暴露的偏差修复）须重新走设计评审与签发。

### 6.7 真机验收记录（2026-09-16，打包版实测）

**结论：AC9 不通过（Harness 更新激活后不生效）；其余抽测项通过。** 测试用隔离 userData（`--user-data-dir`）+ 隔离 `DSH_HOME`，全程未触碰用户真实 `~/.dsh`。

**验收前置修复（T6）**：`node-runtime/node.exe` 缺失 → 打包版后端 spawn 失败（90s×2 超时后弹「后端启动失败」）→ 按 `download-node.js` 同源 URL（npmmirror）补入 Node v24.16.0 → 重打包后后端正常（`bigfish.log: dsh web: http://127.0.0.1:60100`）。

**通过项**（证据 = `updater.log`）：

| 项 | 证据 |
|---|---|
| AC1 发现新版本 | 假源桩：`update check reason=startup type=app result=update-available latest=0.9.9 current=0.1.2`；真连 Gitee：`result=up-to-date latest=0.1.2 current=0.1.2` |
| AC3 下载 + 校验 | `download start … done bytes=4125` → `verify ok expected=2cb703… actual=2cb703…` |
| AC5 安装器拉起 | `update install type=app spawn=…\updates\installer`（假包；真实安装演练仍需真发版） |
| AC7 失败策略 | 自动+不可达 → `result=error` 且无 UI；手动失败 → 明确提示可重试；dev 模式 → 用户实测提示「只能在安装版里面使用」 |
| AC8 Harness 检查 | 真连 npmmirror：`type=harness result=update-available latest=0.1.5-rc.1 current=0.1.0-rc.6`（`-rc.N` 比较正确） |
| AC2 气泡 | 启动检查发现 Harness 新版走托盘气泡（非模态窗） |

**不通过项 — AC9（Harness 更新不生效）**：

- 现象：全阶段 `ok=1`（prepare → install → smoke → activate → 后端重启成功），但 `harness activate dsh active path=…\resources\dsh\…\bin.js` 指向**出厂内置副本**——激活副本未被采用。
- 根因（实测坐实）：pnpm 在 Windows 建的 junction 为**绝对路径**，而原子切换靠「改名」实现（staging → `userData/dsh`）；改名后 junction 仍指向已消失的旧路径：
  `userData/dsh/node_modules/@deepseek-ai/dsh` → `…\dsh-update\staging\node_modules\.pnpm\@deepseek-ai+dsh@0.1.5-rc.1_…/node_modules/@deepseek-ai/dsh`
  → `dshBinPath()`（`main.js:133-135`）`fs.existsSync` 失败 → 回退出厂副本 → 旧版继续运行。
- 影响：更新「报成功但不生效」（静默失败）——DD-3 的原子切换机制在 Windows 上不成立。
- 证据：`.test-userdata/dsh/node_modules/@deepseek-ai/dsh`（JUNCTION 目标指向 `.test-userdata/dsh-update/staging/…`）、`.test-userdata/updater.log:21-26`。
- 处置：设计链已终端消费（6.6）→ 按锚#5，修复须**重新走设计评审 + 签发**；台账 R2 回落 `在途`。

**观察项（非缺陷）**：首启「选择模式」对话框（`dialog.showMessageBoxSync`）会**同步阻塞主进程事件循环**——启动检查（5s 定时）被推迟到对话框被回答之后。实测三次「无 updater.log」均由此导致；检查最终仍会执行，不构成 AC 违背。

