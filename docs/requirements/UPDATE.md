# 自动更新需求档 — UPDATE

> 归属板块：自动更新（App 本体 / Harness 后端 / 已装插件 / 发布侧）
> 落点：`docs/requirements/UPDATE.md`（本档为自动更新需求唯一权威源）
> 关联批次：`docs/batches/B02-auto-update.md`（§1.3 需求结论、§1.4 技术裁定、§1.5 验收 AC1…AC12、§1.7 既有约束）
> 　　＋`docs/batches/B05-installer-cleanup.md`（§1.3 需求结论、§1.4 技术裁定、§1.5 验收 AC15 / AC15-b、§1.7 既有约束；B05 修订面 = 新增 US-10）
> 关联设计档：`docs/design/AUTO-UPDATE.md`（设计档回指本档条目 US-1…US-10、NFR-1…NFR-4）

---

## 一、总目标

为 Bigfish 桌面端补齐自动更新能力：App 本体、Harness 后端、已装插件三类对象都能自动发现新版本、安全下载并经用户确认完成安装；更新源统一迁移到 Gitee；自动检查失败不打扰用户；更新全程不破坏用户数据。

---

## 二、范围

本档登记两批需求：**B02 批次**（四个域：App 自更新、Harness 更新、插件更新、发布侧配套）与 **B05 批次**（App 更新安装包清理，US-10）。

明确不包含（本批不做，本档也不为其补造需求条文）：

- **全静默安装**——自动化程度固定为「自动检查 + 后台下载 + 用户确认安装」；
- **真·实时推送**——不做常驻长连接，运行中检查节奏上限为每 6 小时轮询一次；
- **bundled-skills / bundled-plugins 的独立更新通道**——它们是安装包一部分，随 App 更新一起更新；
- **awesome-dsh-plugin.com 主站目录的迁移**——只把 jsdelivr 兜底源迁到 Gitee raw；
- **electron-updater 等第三方更新框架**——沿用自研下载通道（裁定见批次档 §1.4）；
- **自动化测试框架的引入**（技术待办 T4 认账不排期）——本批只用 Node 内置 `node --test` 跑开发期断言；
- **main.js 的六域大拆分**（技术待办 T2，另批评估；本批新增更新域代码落独立新模块，见设计档 §2.3）；
- **macOS / Linux 的专项验证**——只要求既有行为不回退；Windows 为验收与验证目标平台。

---

## 三、功能用户故事

格式：**作为一个 [角色]，我想要 [功能]，以便 [目的]**。
每条以「验收」标注对应验收条目——US-1…US-9 的编号取自 `docs/batches/B02-auto-update.md` §1.5（AC1…AC12，已由用户确认）；US-10 的编号取自 `docs/batches/B05-installer-cleanup.md` §1.5（AC15 / AC15-b，已由用户确认）。

### US-1 App 更新发现与提示（验收：AC1、AC2）

作为一个使用 Bigfish 的用户，我想要应用在启动时自动检查一次、运行中每 6 小时轻量轮询一次、并且能从托盘手动触发检查，以便及时知道有新版本可装——启动检查发现新版弹窗告知版本号与更新说明，轮询发现新版只发托盘气泡、不弹模态窗。

- 边界（不做）：不做常驻长连接推送；轮询只拉取清单 JSON、不预下载安装包；dev 模式不检查（沿用现状 `!app.isPackaged` 短路）。

### US-2 App 下载与完整性校验（验收：AC3、AC4）

作为一个使用 Bigfish 的用户，我想要在确认更新后由应用后台下载安装包并展示进度，以便不用手动去网页找包——下载完成的安装包必须通过 sha256 校验才允许安装。

- 边界（不做）：不整包驻留内存（流式写临时文件）；清单缺 sha256 或校验不匹配一律拒装（fail-closed）。

### US-3 App 安装与拉起（验收：AC5）

作为一个使用 Bigfish 的用户，我想要在下载校验完成后一键确认安装，以便从应用内直接完成升级——确认后启动 NSIS 安装器并退出应用，装完自动拉起新版本。

- 边界（不做）：不实现免安装热替换（覆盖运行中的 exe 由安装器处理）；安装器被取消后应用已退出，需用户手动重启（已知限制，见设计档 §2.5 L3）。

### US-4 更新源统一 Gitee（验收：AC6）

作为一个 Bigfish 的维护者，我想要把更新清单与兜底源的唯一权威迁到 Gitee（`gitee.com/ludonghuai/big-fish`），以便 GitHub 弃用后更新链路仍可用——清单源唯一 = Gitee raw；插件注册表兜底源 jsdelivr → Gitee raw；安装包放 Gitee Releases 附件；代码中 GitHub 残留更新源全清（5 处：`main.js:51-52`、`main.js:1319`、`latest.json:5-7`、`market.js:492`、`package.json:11`）。

- 边界（不做）：不迁移 awesome-dsh-plugin.com 主站目录；插件条目的 GitHub 主页/`github:` 安装标识是插件数据语义，不在清理范围。

### US-5 检查纪律与自动检查开关（验收：AC7）

作为一个使用 Bigfish 的用户，我想要自动检查失败时不被弹窗打扰、手动检查失败时得到明确提示且可重试，以便网络不好时应用保持安静、我想查的时候一定能查到——托盘「自动检查」开关关闭时零网络请求（市场页主动打开除外），dev 模式不检查。

- 边界（不做）：手动「检查更新」不受开关约束（用户显式动作，始终可用）；开关只控制自动检查（启动检查 + 6 小时轮询）。

### US-6 Harness 更新（验收：AC8、AC9）

作为一个使用 Bigfish 的用户，我想要 Harness 后端（`@deepseek-ai/dsh`）也能自动升级，以便后端修复与新功能不用等 App 发版——npmmirror 优先、npmjs 兜底查 `latest` dist-tag；`-rc.N` 后缀的版本比较正确；更新装到 userData 独立目录、不写安装目录；`dshBinPath` 优先 userData 副本；成功后重启 dsh 后端；失败旧版照常运行、可重试。

- 边界（不做）：不追 `next` / `alpha` dist-tag（只追 `latest`，裁定见批次档 §1.4）；dev 模式不更新（dev 从 `dsh-bundle/` 启动）。

### US-7 已装插件更新（验收：AC10）

作为一个使用 Bigfish 的用户，我想要在市场「已安装」视图看到哪些插件有新版本并能一键更新，以便插件升级不再需要手动卸载重装——已装版本低于注册表 `version` 时显示更新徽标；单个更新与全部更新都走现有 pnpm 通道；装完重启后端；`github:` 源按原 installSpec 重装。

- 边界（不做）：内置插件（builtin:）随 App 包更新、不单建通道；`link:` 本地源不参与更新；注册表条目缺 `version` 字段时不显示徽标。

### US-8 发布侧辅助脚本（验收：AC11）

作为一个 Bigfish 的维护者，我想要一条命令生成发版所需的清单与上传说明，以便发版流程不易出错——脚本算出各平台安装包 sha256、生成 `latest.json`、打印上传清单（Gitee Releases 附件 + 仓库文件）。

- 边界（不做）：不做自动上传（Gitee 上传仍为人工/CI 步骤，脚本只生成产物与清单）。

### US-9 更新全程数据安全（验收：AC12）

作为一个使用 Bigfish 的用户，我想要更新全程不破坏 `~/.dsh` 下的配置、会话与已装插件，以便升级不丢数据。

- 边界（不做）：App 升级走安装器（NSIS 不触碰 userData 与 `~/.dsh`）；Harness 更新只操作 userData 下自己的目录。

### US-10 App 更新安装包清理（验收：AC15、AC15-b）

作为一个使用 Bigfish 的用户，我想要应用在下次启动时自动回收 `userData/updates/` 下的全部下载产物（已完成的安装包与半成品），以便数百 MB 级的安装包不在磁盘上逐次累积——回收发生在安装器结束之后（安装器运行期其自身可执行文件被 Windows 锁定），单条删不掉时不阻断启动、不报错打扰、下次启动再试。

- 边界（不做）：
  ① **回收时机 = 下次启动**——不在安装器运行期删（理由见 `docs/batches/B05-installer-cleanup.md` §1.4）；
  ② **失败面 = best-effort**——条目被占用时跳过、不抛不阻断启动，下次启动再试；
  ③ **不改动下载 / 校验 / 重试语义**——sha256 fail-closed 与「失败清临时文件、可重试」逐条不变（重试 = 重新下载）；
  ④ **回收范围只限 `userData/updates/`**——不触碰安装目录、`~/.dsh` 与系统临时目录（NFR-2）。

---

## 四、非功能标准

### NFR-1 网络与开销

- 所有检查/下载一律 https（既有约定，`main.js:336`）。
- 无数据超时 10s：下载流任一 10s 窗口无数据即中止（沿用既有超时口径；总时长不设限）。
- 轮询只拉清单 JSON（App 清单 <1KB；Harness 元数据约数百 KB 级——按实测口径，不预下载安装包）。
- 安装包下载流式写临时文件，不整包驻内存。
- 并发守卫：同时至多一个 App 下载 + 一个 Harness 更新在途；下载在途时跳过轮询。
- 度量方式：`userData/updater.log` 的 `check` / `download` 行序列；静态核对（超时常量、临时文件路径、并发标志）。

### NFR-2 安全

- App 安装包：sha256 强校验；清单缺该平台 sha256 或校验不匹配 → 拒装 + 清临时文件 + 明确报错（fail-closed，无降级放行路径）。
- Harness：依赖经 pnpm 按注册表 integrity 校验安装；激活前跑 `bin.js --version` 冒烟测试，失败不激活。
- 临时文件只落 `userData/updates`（App）与 `userData/dsh-update`（Harness），不落系统临时目录、不写安装目录。
- 度量方式：`updater.log` 的 `verify ok|fail` 行；静态核对临时路径常量与安装目录写入点（不存在）。

### NFR-3 兼容

- 核心机制只用 Electron 三平台共有 API（fetch/fs/crypto/spawn/dialog/Tray/Notification），不新增平台分支——安装包启动分支按 `urls[process.platform]` 取 URL，属既有清单语义，非平台代码分支。
- Windows 为验收目标平台；macOS / Linux 既有行为不得回退（既有「弹窗 + 打开下载页」升级为下载安装流程，安装器为各平台各自格式）。
- dev 模式不检查（`!app.isPackaged` 短路，现状保留）。
- 旧清单格式（无 sha256 段）不导致崩溃——按 NFR-2 拒装并明确报错。
- 度量方式：评审时逐条核对设计档 §2.3 改动点表；用例 TC-9（无 sha256 段清单）。

### NFR-4 可维护性

- 版本比较是纯函数、只在一处定义（`update-lib.js`），App 版本（`0.1.2` 形态）与 Harness 版本（`0.1.0-rc.6` 形态）共用同一语义，`main.js` 不得内联第二份实现。
- App/Harness 更新域逻辑收敛在新模块 `updater.js`（Electron 依赖）与 `update-lib.js`（纯函数）；`main.js` 只留托盘、窗口、IPC 与后端重启等接线——`main.js` 不再进一步膨胀（现状 1986 行已超拆分阈值，见设计档 §2.3 拆分评估）。
- 不新增第三方依赖、不新增原生模块：`package.json` 的 `dependencies` 保持空数组；新模块只用 Node 内置模块 + Electron 内置 API。
- 更新诊断日志落 `userData/updater.log`，每步一行（先例：`exchange.log`、B01 的 `pet-drag.log`）。
- 度量方式：静态核对（`compareVersions` 定义唯一性、`dependencies` 为空、日志调用点覆盖各阶段）。

---

## 五、变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-16 | 初版：登记 B02 批次自动更新需求（US-1…US-9、NFR-1…NFR-4），覆盖 App 本体 / Harness / 插件 / 发布侧四个域，验收回指批次档 §1.5 的 AC1…AC12。 |
| 2026-09-16 | B05 修订：新增 **US-10 App 更新安装包清理**（验收回指 `docs/batches/B05-installer-cleanup.md` §1.5 的 AC15 / AC15-b；范围边界四条 = 时机下次启动 / 失败面 best-effort / 下载校验重试语义不变 / 回收面限 `userData/updates/`）；§二 范围段与 §三 验收编号来源同步为两批（B02 + B05），头部关联批次补 B05 指针。 |
