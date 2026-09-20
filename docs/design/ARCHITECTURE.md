# ARCHITECTURE.md — Bigfish 整体架构总览

> **主题**：接手者第一入口——不读遍全部源码，就能知道这个 app 有哪些部分、各管什么、谁依赖谁、数据落在哪、怎么构建发布（B25 立案目标，`docs/batches/B25-architecture-docs.md` §1.1）。
> **读者**：接手本仓的人或代理。细节不在本档——本档只定位 + 回指既有权威档（D2 单一权威源；逐键语义 / 判据句一律按指针跳转，不重述）。
> **as-of**：2026-09-19 实测。**行号只作 as-of 参考**——本仓行号易漂，引用以「文件 + 符号名」为准，行号仅供当时定位。
> **形式**：单档（U-1 裁定，记录于 `docs/batches/B25-architecture-docs.md` §2.3）：总览图区 + 八个面 + 改动入口表 + 验收标准（AC）。

## 关联档指针表

| 要找什么 | 权威档 |
|---|---|
| 壳拆分规则 / 注入面规则 / 壳 UX 语义 | `docs/design/SHELL-UX.md`（§2.2 契约与结构） |
| 拖拽跟手 / 多屏几何与可见性 | `docs/design/PET-DRAG.md` · `docs/design/PET-MULTIMONITOR.md` |
| 动画链引擎 / 工作状态联动 | `docs/design/PET-ANIMATION.md`（工作状态 = 其 §2.7–§2.8） |
| 位移仲裁与物理手感 | `docs/design/PET-MOVEMENT.md` |
| 好感度 / 兑换屋数值体系（等级阈值 / 喂食汇率 / 满级分支） | `docs/design/PET-AFFINITY.md` |
| 自动更新（App / Harness / 插件 / 发布侧） | `docs/design/AUTO-UPDATE.md` |
| 代码规范 / 工程纪律 / 文档地图 | `docs/CONVENTIONS.md` · 根 `AGENTS.md` · `docs/README.md` |
| 构建白名单逐条权威 | `package.json` 的 `build.files` / `extraResources` |
| 本批任务书与裁定记录 | `docs/batches/B25-architecture-docs.md` §2 |

## 1 总览图区

四张 ASCII 图（先例形态 = `docs/design/PET-ANIMATION.md` §2.7 注入面图）：图①＝面①、图②与图④＝面②、图③＝面③。

### 1.1 进程总览（图）

```text
┌─ 主进程 main.js（组合根：单实例锁 / whenReady 引导 / init(deps)×13 / ipc.register）─┐
│                                                                                      │
│  ├ 主窗口（无 preload；loadURL 后端页）────── shell-window.js                        │
│  ├ 桌宠窗（pet-preload → petAPI → pet.html）── shell-pet.js                          │
│  ├ 兑换屋（exchange-preload → exchangeAPI）─── shell-affinity.js                     │
│  ├ 市场窗（market-preload → marketAPI）────── shell-market.js                        │
│  ├ 更新窗（update-preload → updAPI）───────── shell-update.js                        │
│  └ 托盘 + 全局快捷键（非窗口）─────────────── shell-tray.js                          │
│                                                                                      │
└──────────┬───────────────────────────────────────────────────────────┬───────────────┘
           │ spawn 子进程（node bin.js web）                            │ IPC：ipcMain 26 注册 / 24 通道
           ▼                                                           ▼（单点注册 shell-ipc.js；§2.4）
  Harness 后端子进程（127.0.0.1:<port> HTTP 页面）            4 渲染页 ⇄ preload 桥 ⇄ ipcMain
  （页面 = 主窗口的 UI；壳侧只守卫 + 背景注入）                （petAPI / marketAPI / updAPI / exchangeAPI）
```

### 1.2 模块总览（图）

```text
主进程源码 24 档：组合根 1（main.js）+ shell-* 17 + 纯逻辑核 3 + 独立面 3

main.js ─ require 15 档 shell-*（main.js:32-46）＋ init(deps)×13（main.js:76-108）＋ ipc.register()（main.js:248）
│
├─ 更新与后端域
│    shell-backend.js ──► harness-store.js
│    shell-update.js ──► updater.js ──► (update-lib.js + harness-store.js)
│    shell-plugins.js ──► (update-lib.js + shell-backend.js)
│    shell-notify.js / shell-affinity.js ──► shell-backend.js
│
├─ 桌宠域
│    shell-pet.js ──► (pet-chain-core.js + shell-pet-geometry.js + shell-pet-drag.js + shell-pet-physics.js + shell-settings.js)
│    shell-pet-drag.js ──► shell-pet-geometry.js ──► shell-settings.js
│    shell-pet-physics.js ──► (pet-physics-core.js + shell-pet-geometry.js)
│    shell-pet-work.js ──► pet-work-core.js
│
└─ 窗口与壳面域
     shell-window.js ──► (shell-assets.js + shell-backend.js + shell-mode.js + shell-pet.js + shell-notify.js)
     shell-market.js ──► (shell-plugins.js + shell-backend.js + shell-assets.js + shell-update.js)
     shell-tray.js ──► 10 档（fan-out 10，T45 在案）：shell-settings · shell-assets · shell-window ·
                        shell-mode · shell-update · shell-market · shell-affinity · shell-pet ·
                        shell-pet-physics · shell-notify（名单实测 shell-tray.js:10-19；角色见 §2.2 表）
     shell-ipc.js ──► 6 档（fan-out 6，T45 在案；通道见 §2.4）
     无 init 被引用：shell-assets.js · shell-settings.js · shell-market.js（shell-ipc.js 导出 register()，由 main.js:248 调用）
```

### 1.3 数据总览（图）

```text
userData（Electron 用户数据；BIGFISH_USER_DATA 可覆盖，main.js:66-69）
├─ settings.json · affinity.json · custom-background.jpg ………… 常驻状态（§2.3 表）
├─ 诊断日志 8 件（bigfish / updater / market / exchange /
│   pet-drag / pet-geometry / pet-physics / pet-anim）……………… 追加型，无轮转
├─ updates/ ……………………………………………………………………… 更新下载临时区（启动清理）
└─ dsh-update/（versions/<v>/ + dsh-active.json 指针）………… Harness 版本库（harness-store 属主）

~/.dsh（Harness 数据面；DSH_HOME 可覆盖，shell-backend.js:287-289）
├─ storages/session_projcache.json + sessions/ …………………… shell-affinity 读（好感度）
├─ profiles/web + pnpm-store/ ………………………………………… shell-plugins / updater 经 pnpm 写
└─ 其余（会话 / 工程 / 工作状态记录等）………………………… harness 域属主；壳侧只 watch/读
    （字段布局不写——U-5；§2.3 表）
```

### 1.4 依赖总览（图）

```text
装配（B16 判据名：依赖无环 · fan-out ≤ 3 · 接线点唯一——判据句权威 = docs/CONVENTIONS.md §四，机检面 = scripts/gates；实施与验收记录 = B16 批次档）

main.js ─ init(deps)×13 ─► notify / backend / geometry / drag / pet / physics / work /
                           affinity / mode / plugins / update / window / tray
                           （＋ shell-update 内组装 updater.init，shell-update.js:280）

环：实测 require 图无环（§2.2 表逐档列 require 面；B16「依赖无环」守门）
扇出：判据 fan-out ≤ 3；存量超限 6 档冻结于 scripts/gates/baseline.json
     （docs/TODO.md T45：tray=10 · ipc=6 · pet=5，余 3 档见该行）
接线点：B16「接线点唯一」；physics.init 现状双调用点（main.js:96-102 ＋ shell-pet.js:29-35；
       B20 D-1 修偏注记自述双处幂等）——观察项，见 §2.2 尾注
```

## 2 八个面

### 2.1 面① 进程与窗口模型

**常驻进程两个**：

- **主进程** = `main.js`（组合根：常量 / userData 覆盖 / 单实例锁 / whenReady 引导 / 退出钩子 / 模块接线——`main.js:25-27` 自述；require 15 档 `shell-*`（`main.js:32-46`）＋ `init(deps)` 接线 13 处（`main.js:76-108`）＋ `updater.init`（组装点 `shell-update.js:280`）；IPC 注册入口 `main.js:248`）。
- **Harness 后端子进程**：由 `shell-backend.js` spawn（活跃副本优先 + 出厂兜底解析 `shell-backend.js:90-93`；`DSH_BUNDLED_SKILL_DIR` 环境注入 `shell-backend.js:108`），在 `127.0.0.1:<port>` 提供 HTTP 页面；生命周期 = `startDsh` / `stopDsh`（退出钩子两处调用 `main.js:240` / `main.js:244`）。

**窗口 5 + 托盘 1**（建窗点逐一实测，as-of 2026-09-19）：

| 窗口 | 建窗 | preload | 加载 | 生命周期 |
|---|---|---|---|---|
| 主窗口 | `shell-window.js:27` | **无**（页面由后端供） | `loadURL` 后端页（`shell-window.js:65`） | 启动即建（`main.js:128`）；关闭 = 隐到托盘（`shell-window.js:41-46`）；零窗口时 `showMainWindow` 重建（`shell-window.js:69-76`） |
| 桌宠窗 | `shell-pet.js:158` | `pet-preload.js`（`shell-pet.js:171`） | `pet.html`（`shell-pet.js:182`） | 启动按 `petEnabled` 建（`main.js:205-211`）；模式切换经 `destroyPetWindow` / `ensurePet` 销毁重建；透明 / 无边框 / 置顶 / win32 点击穿透（`shell-pet.js:158-181`） |
| 兑换屋 | `shell-affinity.js:210` | `exchange-preload.js`（`shell-affinity.js:221`） | `exchange.html`（缓存爆破 `shell-affinity.js:236-238`） | 右键桌宠按需建（`shell-pet.js:406-410` → `shell-affinity.js:204`）；`closed` → null（`shell-affinity.js:245`） |
| 市场窗 | `shell-market.js:27` | `market-preload.js`（`shell-market.js:37`） | `market.html`（缓存爆破 `shell-market.js:44`） | 托盘菜单按需建（`shell-tray.js:72`）；`closed` → null（`shell-market.js:51`） |
| 更新窗 | `shell-update.js:60` | `update-preload.js`（`shell-update.js:71`） | `update.html`（缓存爆破 `shell-update.js:77`） | 更新流程按需建（`shell-update.js:117` / `:217`）；`did-finish-load` 补发状态防首帧竞态（`shell-update.js:80-84`）；`closed` → null（`shell-update.js:85`） |

- **托盘**非窗口：`createTray`（`shell-tray.js:48`，`new Tray` `shell-tray.js:51`）+ 全局快捷键（`registerShortcuts`，`main.js:191` 调用）；「关闭 = 隐到托盘」语义的承载面（`shell-window.js:40-46`）。
- **渲染页脚本面**（实测各 html 引用）：`pet.html` → `pet-chain-core.js` / `pet-chain.js` / `pet-physics-core.js` / `pet.js`；`market.html` → `market.js` / `market-update.js`；`exchange.html` → `exchange.js`；`update.html` → `update.js`。
  主窗口**无本地脚本**——其 UI 即后端页面，壳侧只做导航守卫 / 外链转系统浏览器（`shell-window.js:49-60`）与背景注入（`shell-window.js:63`）。
- 通信面：渲染页 ↔ 主进程 = 4 个 preload 桥（§2.4）；主进程 ↔ 后端 = 子进程 spawn + HTTP 端口；托盘 / 快捷键 / 系统通知 = 主进程原生面（`shell-tray.js` / `shell-notify.js`）。

### 2.2 面② shell-* 17 档角色与依赖方向

**总口径**：主进程源码 **24 档**（as-of 2026-09-19 实测）= 组合根 `main.js` ＋ `shell-*` **17 档**（立案实测 16 已过期——`docs/batches/B25-architecture-docs.md` §1.3 #2 记 16 档 / require 12 档，本档实 17 档 / require 15 档）＋ 纯逻辑核 3 ＋ 独立面 3（update-lib / harness-store / updater）。

**shell-* 逐档角色与依赖（角色 = 各档 `:3` 头注释压缩；require 面 = 实测；行数 as-of 2026-09-19）**：

| 档 | 行数 | 一句话角色 | require 本地档 | init |
|---|---|---|---|---|
| `shell-affinity.js` | 334（as-of 2026-09-20 实测；原记 357 过期） | 好感度 + 兑换屋窗口 + 重置两函数 + `affinity:*` 处理器 | shell-backend · shell-notify · shell-assets | `:18` |
| `shell-assets.js` | 33 | 图标路径 | — | 无（纯函数面） |
| `shell-backend.js` | 324 | 后端生命周期 + 路径解析（spawn / 端口 / dshBin / 技能目录） | harness-store | `:24` |
| `shell-ipc.js` | 51 | IPC 通道注册层（薄绑定，通道清单单点可审计） | shell-pet · shell-pet-drag · shell-pet-physics · shell-affinity · shell-market · shell-update | 无（`register()`） |
| `shell-market.js` | 199 | 市场窗口 + 注册表拉取 + `market:*` 处理器 | shell-plugins · shell-backend · shell-assets · shell-update | 无 init |
| `shell-mode.js` | 152 | 背景与模式（鲸鱼 / 专注，`main.js:203-204` 模式弹窗注） | shell-settings | `:19` |
| `shell-notify.js` | 315 | 系统通知 + 任务完成提醒（completionGate 判定面） | shell-assets · shell-settings · shell-backend | `:27` |
| `shell-pet-drag.js` | 240 | 拖动跟随 + 拖动 / 穿透 IPC 处理器 | shell-pet-geometry | `:16` |
| `shell-pet-geometry.js` | 438 | 桌宠几何 helper 组 + 日志 / 尺寸校准 | shell-settings | `:15` |
| `shell-pet-physics.js` | 328 | 物理域：光标采样 + 起飞门 + 飞行循环 + 停泊收口 + 挤压 IPC | pet-physics-core · shell-pet-geometry | `:34` |
| `shell-pet-work.js` | 265 | 工作状态联动 I/O 档（fs.watch + 1 s tick + 档位下发 / 降级） | pet-work-core | `:49` |
| `shell-pet.js` | 467（as-of 2026-09-20 实测；原记 458 过期） | 桌宠窗口与状态机 + 台词 + 点击 IPC 处理器 | pet-chain-core · shell-settings · shell-pet-geometry · shell-pet-drag · shell-pet-physics | `:22` |
| `shell-plugins.js` | 455 | 插件引擎（profile 读写 / bundles 防呆 / pnpm 通道） | update-lib · shell-backend | `:16` |
| `shell-settings.js` | 63 | settings 载入 / 保存 / 默认值 | — | 无（`get()` 属主状态面） |
| `shell-tray.js` | 198 | 托盘菜单 + 全局快捷键 + Windows 右键菜单 + uninstall | 10 档（名单见 §1.2 图；实测 shell-tray.js:10-19） | `:25` |
| `shell-update.js` | 332 | 更新编排（呈现 / 门禁 / 调度 / Harness 停-切-启）+ `upd:*` 处理器 | updater · shell-backend · shell-notify · shell-settings · shell-assets | `:22` |
| `shell-window.js` | 110 | 主窗口 | shell-assets · shell-backend · shell-mode · shell-pet · shell-notify | `:18` |

**非 shell 主进程档**：

| 档 | 行数 | 一句话角色 | 被 require |
|---|---|---|---|
| `pet-chain-core.js` | 218 | 动画链核心（池校验与段选取；权威 = `PET-ANIMATION.md`） | `shell-pet.js:12` ＋ `pet.html`（渲染层同源） |
| `pet-physics-core.js` | 348 | 物理核心（权威 = `PET-MOVEMENT.md`） | `shell-pet-physics.js:17` ＋ `pet.html`（渲染层同源） |
| `pet-work-core.js` | 167 | 工作状态记录解析核心（权威 = `PET-ANIMATION.md` §2.7） | `shell-pet-work.js:14` |
| `update-lib.js` | 91 | 版本对比 / registry 元数据解析 | `shell-plugins.js:11` · `updater.js:20` |
| `harness-store.js` | 333 | Harness 版本库与活跃指针属主（userData/dsh-update） | `shell-backend.js:17` · `updater.js:21` |
| `updater.js` | 498 | 更新执行器：流式下载 / 校验 / 激活 / 回滚 / 清理（`init(ctx)` `:40`） | shell-update（§1.2 图） |

**行数计数口径注**（`updater.js` 两值对账）：本表记 498 = 含尾空行口径（文件末空行计入）；门禁 lint NOTE 记 497 = 去尾空行口径（引于 `docs/batches/B25-architecture-docs.md` §2.5）——两值同源、非数值漂移。

**尾注（只记录不修）**：

- `physics.init` 双调用点：`main.js:96-102`（B20 D-1 修偏补线，`main.js:94-95` 注记自述双处幂等）＋ `shell-pet.js:29-35`。与 B16「接线点唯一」判据的相容性未见判例——登记为观察项。
- `main.js:26` 自述「各域实现分居 15 个 shell-*.js 平铺模块」已过期（实 17）——头注释滞后，记录。
- `shell-ipc.js` 对 `pet-drag-start` / `pet-drag-end` 双监听（`:17`/`:26`、`:19`/`:27`）= B20 物理域自有监听的声明并存面（`shell-ipc.js:23-25`），非缺陷。

### 2.3 面③ 数据面（userData 与 ~/.dsh）

**U-5 深度声明**：本面只记「谁写 / 谁读 / 路径形态 / 生命周期」；**字段布局不写**（属 harness 域与既有档权威——`AUTO-UPDATE.md` / `PET-ANIMATION.md` §2.7）。

**userData 面**（`app.getPath('userData')`；`BIGFISH_USER_DATA` 覆盖钩子 `main.js:66-69`，probe 同口径 `probe-pet-media.js:26-28`）：

| 落盘物 | 写 | 读 | 生命周期 |
|---|---|---|---|
| `settings.json` | shell-settings（路径 `:34`） | 全壳 `settings.get()`（例 `main.js:205` / `:214` / `:215`） | 常驻；损坏有 `isFileCorrupt` 面 |
| `affinity.json` | shell-affinity（路径 `:42`） | 同档 load / broadcast | 常驻 |
| `custom-background.jpg` | `shell-mode.js:129` | `shell-mode.js:34` | 用户设自定义背景时在；恢复默认删除（`:139`） |
| `updates/`（`*.part` 流式 + 改名） | `updater.js:108` / `:118` | updater 校验流程 | 启动清理回收（`updater.js:455-462`） |
| `dsh-update/versions/<v>/` + 指针 `dsh-active.json` | harness-store（布局 `:22-30`；prepare `:148-155`；activate `:205-212`） | `resolveActiveBin`（`:129-137`）→ 消费点 `shell-backend.js:93` | activate 写指针 / rollback 回指（`:242-246`）/ cleanup 收敛（`:267` 起） |
| 旧布局 `dsh` / `dsh-prev` | —（历史遗留） | 旧布局兜底解析（`harness-store.js:135`） | cleanup 迁移收敛 |

**诊断日志 8 件**（userData 下；追加型 `appendFileSync`，仓内无读面，不轮转）：

- `bigfish.log`（`shell-backend.js:215`）· `updater.log`（`shell-update.js:53`）· `market.log`（`shell-market.js:47`）· `exchange.log`（`shell-affinity.js:241`）
- `pet-drag.log`（`shell-pet-drag.js:32`）· `pet-geometry.log`（`shell-pet-geometry.js:53`）· `pet-physics.log`（`shell-pet-physics.js:56-60`）· `pet-anim.log`（`shell-pet.js:42`/`:52`；probe 落隔离 userData 同名 `probe-pet-media.js:222`）

**~/.dsh 面**（`DSH_HOME` 覆盖 `shell-backend.js:287-289`；宿主 = Harness 后端，本档只记壳侧接触点）：

| 落盘物 | 写 | 读 |
|---|---|---|
| `storages/session_projcache.json` + `storages/session_projcache/sessions/` | Harness 后端 | `shell-affinity.js:93` / `:111`（好感度读面） |
| 工作状态记录面 | Harness 后端 | `shell-pet-work.js`（`:3` 头注释：fs.watch + tick；路径与判据权威 = `PET-ANIMATION.md` §2.7–§2.8）；另 `shell-notify.js:66` watch `DSH_HOME` 做完成判定——读面谓词重复 = 台账 **T33** 在案（只记录） |
| `profiles/web` | shell-plugins 经 pnpm（`:27`；bundles 读写 `:77-99`） | 同档 + 后端 |
| `pnpm-store/` | `shell-plugins.js:287` · `updater.js:300`（`--store-dir` 固定，注 `shell-plugins.js:286`） | pnpm |
| 其余全部（会话 / 工程 / API Key 等） | Harness 域属主 | 壳侧只经 `dshHome()` 指根与重置删除（`shell-affinity.js:248-250` resetAllData；`main.js:168` 删 profiles / `:170` 删全 home 两级重置）；字段布局不写（U-5） |

### 2.4 面④ IPC / 注入面契约

**preload 桥（4 个；`contextBridge.exposeInMainWorld`）**——逐键语义权威 = 各 preload 档与 `SHELL-UX.md` §2.2（本表只列形状计数，不重述逐键，D2）：

| preload | 桥名 | 键数（方向） | 承载 |
|---|---|---|---|
| `pet-preload.js:4` | `petAPI` | 13（send 7 / on 6） | 拖动 / 点击 / 台词与状态推送 / 链配置 / 物理挤压 |
| `market-preload.js:4` | `marketAPI` | 10（invoke 9 / send 1） | 市场列表与安装操作 |
| `update-preload.js:4` | `updAPI` | 5（on 1 / send 4） | 更新状态推送与操作 |
| `exchange-preload.js:4` | `exchangeAPI` | 3（invoke 3） | 兑换屋查看 / 兑换 / 购买 |

**ipcMain 侧**：注册 **26 处 / 唯一通道 24**（实测 as-of 2026-09-19；`shell-ipc.js:15-48` 单点注册，`main.js:248` 调用；`pet-drag-start` / `pet-drag-end` 各双监听——B20 物理域自有监听的声明并存面，`shell-ipc.js:23-25`）。
主 → 渲染推送不经 ipcMain 注册（`webContents.send`，例 `upd:status` 首帧重发 `shell-update.js:80-84`；`pet:physics-squash` 桥键 `pet-preload.js:17`）。

**init(deps) 注入实参表（主进程 14 个接线点 = main.js 13 ＋ shell-update 内组装 updater 1）**——键名列举即契约面；逐键语义权威 = `SHELL-UX.md` §2.2 与各模块文件头：

| 模块（init 行） | deps 键（接线点） |
|---|---|
| `shell-notify.js:27` | getDshHome · petSay · IDLE_NOTIFY_MS · IDLE_NOTIFY_FALLBACK_MS（`main.js:76`） |
| `shell-backend.js:24` | HOST · READY_TIMEOUT_MS · sanitizeProfileBundles · getMainWindow（`main.js:77`） |
| `shell-pet-geometry.js:15` | getPetWindow · getPetDrag（`main.js:78`） |
| `shell-pet-drag.js:16` | getPetWindow · pet（`main.js:79`） |
| `shell-pet.js:22` | showMainWindow · openExchangeWindow · broadcastAffinity（`main.js:80`；init 内另注册 `pet-chain-move` 监听 `shell-pet.js:27`） |
| `shell-pet-work.js:49` | setPetState · getPetState · petSay · wakePet · logAnim · getPetWindow · getPetDrag · settings · dshHome（9 项，`main.js:82-92`） |
| `shell-pet-physics.js:34` | getPetWindow · getPetDrag · getMoveTimer · settings · setPetState（`main.js:96-102` ＋ `shell-pet.js:29-35` 双调用点，见 §2.2 尾注） |
| `shell-affinity.js:18` | getPetWindow · pet · setQuitting · APP_NAME（`main.js:103`） |
| `shell-mode.js:19` | getMainWindow · destroyPetWindow · ensurePet · rebuildTrayMenu · notify · APP_NAME（`main.js:104`） |
| `shell-plugins.js:16` | updaterLog（`main.js:105`） |
| `shell-update.js:22` | setQuitting · APP_NAME · runtimeNodeExe · bundledPnpmPath（`main.js:106`） |
| `shell-window.js:18` | HOST · APP_NAME · isQuitting（`main.js:107`） |
| `shell-tray.js:25` | setQuitting · APP_NAME · setPetWorkStatus（`main.js:108`） |
| `updater.js:40` | manifestUrl · registryUrls · dirs · runtime · log · getCurrentVersion · getCurrentDshVersion（组装点 `shell-update.js:280-291`） |

### 2.5 面⑤ 桌宠子系统关系图

**范围声明**：桌宠子系统五块 = 几何 / 拖拽 / 动画链 / 物理 / 工作状态。本面只画「谁在哪块 + 依赖方向 + 数据流」；
逐块语义 / 判据 / 参数权威回指各 `PET-*` 档（D2，不重述）：几何与多屏 = `PET-MULTIMONITOR.md`、拖拽跟手 =
`PET-DRAG.md`、动画链引擎 = `PET-ANIMATION.md` §2.2、工作状态联动 = `PET-ANIMATION.md` §2.7–§2.8、
位移仲裁与物理手感 = `PET-MOVEMENT.md`。

```text
模块依赖（require 面 = §2.2 表实测；init 接线 = §2.4 注入表）：

  shell-pet.js（桌宠窗面；init main.js:80）── 组合四块 + 状态机 + 台词 + 点击 IPC；渲染层 = pet.html
  ├─ pet-chain-core.js ······· 动画链核（池校验 / 段选取；渲染层同源核）
  ├─ shell-pet-geometry.js ··· 几何块（尺寸常量 / workArea 校准 / 几何日志）
  ├─ shell-pet-drag.js ······· 拖拽块（跟手移动 / 点击穿透切换）
  └─ shell-pet-physics.js ···· 物理块（光标采样 → 起飞门 → 飞行循环 → 停泊收口）
       └─ pet-physics-core.js   物理核（渲染层同源核）
  shell-pet-work.js（工作状态块；init main.js:82）── pet-work-core.js（工作状态记录解析核）
       数据源 = ~/.dsh 工作状态记录面（Harness 属主；壳侧接触点见 §2.3 ~/.dsh 表）

  横向关系：拖拽块与物理块均 require 几何块（共用窗口 / 坐标 helper），两块之间无 require——
  物理块经 init 注入 getPetDrag 引用拖拽块（§2.4 表 main.js:96-102 接线）。
  settings：shell-pet.js / 几何块 require shell-settings（§2.2 表），各块经 settings.get() 读常量。
```

```text
数据流 / 谁触发谁（一条主路径，编号即顺序）：

  ① 用户按住桌宠（pet.html 采样）
  ② → 渲染层经 petAPI 发 pet-drag-start（shell-ipc 单点分发，§2.4）
  ③ → 拖拽块跟手移动（几何块做屏边界 / workArea 校准）
  ④ → 用户松手 = pet-drag-end
  ⑤ → 物理块接管：起飞门 → 飞行循环 → 停泊收口（落点经几何块校准）
  ⑥ → shell-pet.js 状态机更新，状态 / 台词经 petAPI 推回渲染层

  并行支路（工作状态）：shell-pet-work.js fs.watch ~/.dsh 工作状态记录 + 1 s tick
  → setPetState / 档位降级下发 → 动画链按状态选段换段（权威 = PET-ANIMATION.md §2.7–§2.8）。
```

**同源核提示**：`pet-chain-core.js` / `pet-physics-core.js` 被主进程与 `pet.html` 双面 require
（证据 = §2.2 非 shell 表「被 require」列）——改这两个核即主进程与渲染层两面同时生效，
是本子系统最大的联动面。

**观察项（引用不展开）**：`physics.init` 双调用点（`main.js:96-102` ＋ `shell-pet.js:29-35`，
B20 D-1 修偏注记自述双处幂等）——见 §1.4 图④注与 §2.2 尾注；`pet-drag-start` / `pet-drag-end`
双监听 = B20 声明并存面（`shell-ipc.js:23-25`）——见 §2.4。

### 2.6 面⑥ 8 档探针清点

**定位**：`probe-*.js` = 开发期诊断探针（`npx electron probe-<名>.js` 单档直跑；不入包——`docs/CONVENTIONS.md` §八
白名单外即不入，`package.json:46-92` 无 probe 条目）。共 **8 档**（glob 全清单，as-of 2026-09-19），
全部为多屏 / 桌宠几何问题的取证与校准工具——产出打到 stdout / 日志，**不改产品代码、不写仓库文件**。

| 探针 | 行数 | 干什么（档头自述压缩） | 怎么跑 | 读什么 | 产出什么 |
|---|---|---|---|---|---|
| `probe-displays.js` | 55 | E6 判定：setSize / getSize / getPosition 在 DIP 还是物理像素（`probe-displays.js:1-2`） | `npx electron probe-displays.js`（`:3`） | `screen.getAllDisplays()` 各屏几何 | stdout：各屏几何 + 窗口尺寸读数分段打印 |
| `probe-displays2.js` | 77 | 尺寸坐标系机制钉死：建窗于各屏 getSize 读什么 / 跨屏移动待 DPI 稳定后读什么（`:1-3`） | `npx electron probe-displays2.js`（`:4`） | 双屏几何 + 跨屏移动过程读数 | stdout：Q1 / Q2 两问的读数对照 |
| `probe-size-readback.js` | 53 | setSize / setBounds 后立即 getSize 在混合 DPI 屏是否稳定（「尺寸闪烁 / 拖动迟滞」假说，`:1-2`） | `npx electron probe-size-readback.js`（`:3`） | setSize 前后窗口尺寸读数 | stdout：写后立即读的稳定性序列 |
| `probe-straddle-size.js` | 68 | 窗口跨异 DPI 屏边界时 setSize(250,270) 是否可靠（设计禁跨屏写尺寸——验该禁令必要性，`:1-4`） | `npx electron probe-straddle-size.js`（`:5`） | 跨边界摆位后的尺寸读数 | stdout：跨屏写尺寸成败对照 |
| `probe-position-accuracy.js` | 70 | setPosition / setBounds 在双屏各自是否位置精确（「穿越后回位漂移 → re-anchor 烙入误差」假说，`:1-4`） | `npx electron probe-position-accuracy.js`（`:5`） | 请求位置 vs 回读位置逐屏对照 | stdout：每屏读写误差表 |
| `probe-resizable-setsize.js` | 56 | `resizable:false` 是否阻断 setSize（几何修正日志 size-from === size-to 疑点，`:1-3`） | `npx electron probe-resizable-setsize.js`（`:4`） | resizable 两态窗口同步骤对照 | stdout：两态 setSize 生效性对照 |
| `probe-settle-scan.js` | 117 | 逐字复现 petSettlePos 等纯函数，主屏逐高度扫描「用户报的 y 在哪被弹到哪」（`:1-3`） | `npx electron probe-settle-scan.js`（`:4`） | 主屏全高度 × 落点修正数学（复刻 `petIsVisible` / `petStraddleFix` / `petSettlePos`，`:8-10`） | stdout：逐 y 的弹出行为扫描表 |
| `probe-pet-media.js` | 397 | 桌宠视频通道探针（B18）：VP9-alpha 合成 / video 加载 / alpha 包围盒校准 / 通道计数 / reduce 样式 / B21 取证（`:5-16`） | `npx electron probe-pet-media.js` ＋ flag 集（`:12`） | 自建同配置透明窗（`:14-15`）；canvas 取帧；CDP 模拟 | stdout 读数（隔离 userData `:26-29`） |

**probe-pet-media 的耦合面（实测复核，as-of 2026-09-19）**：require 产品档 **5** 个 =
`pet-chain-core.js`（`:22`）＋ `shell-settings.js` / `shell-pet-geometry.js` / `shell-pet-drag.js` /
`shell-pet.js`（惰性 require `:138-141`）；并复刻主进程的 `BIGFISH_USER_DATA` userData 隔离钩子
（`:26-29`，同口径 `main.js:66-69`）。**无 `require('./main.js')`**（全仓 grep 零命中）——
「probe-pet-media 硬绑 main.js」为过期口径（§1.3 #3；台账 T29 更正建议已另报主 agent，
`docs/batches/B25-architecture-docs.md` §2.5 复核表 #3）。

### 2.7 面⑦ 构建与发布面

**打包机制**：electron-builder（devDependency，`package.json:34`）；`asar: false`（`package.json:42`）＋
`build.files` **白名单 46 条**（`package.json:46-92`，逐条实测 as-of 2026-09-19；§1.3 记 43 已过期——
`docs/batches/B25-architecture-docs.md` §2.5 复核表 #4）。白名单外仓根文件一律不进包——
**加档纪律：主进程 / 渲染层新增 `.js` / `.html` 档必须同步加入 `build.files`，否则安装包运行缺档**。
平台 target：win = nsis（`package.json:107-114`）· mac = dmg（`:124-130`）· linux = AppImage + deb（`:131-138`）。

**build.files 46 条构成**（分组计数 = 逐条点数复核）：

| 组 | 条数 | 内容 |
|---|---|---|
| 主进程 js | 20 | main.js ＋ shell-* 17 ＋ pet-physics-core / pet-work-core（`package.json:46-65`） |
| 桌宠渲染链 | 5 | pet.html / pet.js / pet-chain-core / pet-chain.js / pet-preload（`:66-70`） |
| 市场 | 4 | market.html / market.js / market-update.js / market-preload（`:71-74`） |
| 更新执行器 + 更新窗 | 6 | update.html / update.js / update-preload ＋ updater / update-lib / harness-store（`:75-80`） |
| 兑换屋 | 3 | exchange.html / exchange.js / exchange-preload（`:81-83`） |
| 配置 | 1 | plugins.json（`:84`） |
| 打包目录 | 2 | bundled-skills/**/* · assets/**/*（`:85-86`） |
| 图标 | 3 | build/icon.png · build/icon.ico · build/tray.png（`:87-89`） |
| 文档 | 2 | THIRD-PARTY-NOTICES.md · LICENSE（`:90-91`） |
| **合计** | **46** | 与 `package.json:46-92` 逐条点数一致 |

**extraResources 3 项**（`package.json:93-106`；随包装入资源根，不经 files 白名单）：

| 项 | 源 → 目标 | 角色 |
|---|---|---|
| node-runtime | `node-runtime` → `node-runtime` | 出厂 Node 运行时（node.exe + pnpm/，实测目录 2 项）——后端 spawn 与更新切换用（`runtimeNodeExe` 注入 `shell-update.js:22`，`main.js:106`） |
| bundled-plugins | `bundled-plugins` → `bundled-plugins` | 出厂插件目录（现仅 README.txt 1 项——出厂空置，用户后装，见 §2.8） |
| dsh-bundle 依赖树 | `dsh-bundle/node_modules` → `dsh/node_modules` | 出厂冻结的后端依赖树（目标名 dsh）——后端 spawn 的兜底来源（`shell-backend.js:90-93`） |

**构建 / 发布脚本 5 件**（行数 as-of 2026-09-19 实测）：

| 脚本 | 行数 | 干什么 | 入口 |
|---|---|---|---|
| `afterPack.js` | 39 | 打包后钩子：独立 rcedit 向 exe 自嵌图标 + 版本元数据（electron-builder 内置 rcedit 依赖 winCodeSign 归档，macOS dylib 符号链接在 Windows 提取失败——`:3-7` 自述） | `build.afterPack`（`package.json:44`） |
| `make-icons.js` | 72 | sharp 从源 PNG（`build/icon_background_removed.png`）产出 4 件图标（icon.png / icon.ico / tray.png / assets/icon.png，`:2-6`） | `npm run icons`（`package.json:22`） |
| `make-latest.js` | 93 | 发布侧：扫 dist/ 三平台产物算 sha256 → 组装 latest.json 写仓根 + 打印上传清单（附件托管 GitHub Releases——Gitee 单文件 100MB 上限装不下安装包，`:16`）；缺平台跳过 | `npm run make-latest`（`package.json:23`） |
| `scripts/ensure-deps.js` | 95 | 源码运行依赖自检：根 devDependencies（electron / electron-builder）＋ dsh-bundle 生产依赖两处要装（`:4-10`）；不进安装包 | `postinstall` / `prestart`（`package.json:14-15`） |
| `scripts/refresh-dsh-bundle.js` | 291 | 出厂冻结树刷新与只读判定（B08；`AUTO-UPDATE.md` §2.2.10）：钉版 = registry `latest` dist-tag；`--check` 退出码 0/1/2；失败不留半成品 | `npm run bundle:refresh` / `bundle:check`（`package.json:24-25`） |

（`download-*` 注：立案档 §1.3 #5 / §1.4 做#7 点名的 `download-*` 脚本**已不存在**——as-of 2026-09-19 实测
工作区零命中 ＋ git 全历史零提交；现存构建 / 发布脚本 = 上表 5 件。§1.3 #5「根目录 6 档脚本 / 构建」口径
订正注 → `docs/batches/B25-architecture-docs.md` §2 修订轮 1。）

（门禁与测试脚本 `scripts/gates/**` / `test-run.js` / `test-integration.js` 属发布门链，权威 = 根
`AGENTS.md` §三（门禁面）＋ `docs/CONVENTIONS.md` §四/§五（判据与基线机制）；实施与验收记录 = B16 批次档——本面不重述。）

**更新链三角（只列参与面，逐键语义 / 判据 / 流程权威 = `AUTO-UPDATE.md`，不重述）**：

- **App 自更新**：latest.json → `updater.js`（流式下载 userData/updates → 校验 → 激活 dsh-update/versions），
  编排面 = `shell-update.js`；版本库属主 = `harness-store.js`。
- **Harness 后端更新**：dsh-bundle 出厂冻结树 ＋ dsh-update 版本库双源，`shell-backend.js` 解析活跃副本。
- **插件更新**：`shell-plugins.js` 经 pnpm 通道（profiles/web + pnpm-store，见 §2.3 ~/.dsh 表）。
- 出厂三件（node-runtime / bundled-plugins / dsh 树）＋ 更新门禁面回指 `AUTO-UPDATE.md`；刷新工具回指上表
  `refresh-dsh-bundle.js` 行。

### 2.8 面⑧ 插件 · 技能 · bundle 三面

**定位**：三个装配目录 = 三条互不相同的通道（不是同一东西的三种叫法）：

| 面 | 目录与内容（实测 as-of 2026-09-19） | 什么 | 装配 | 更新路径 |
|---|---|---|---|---|
| 插件 | `bundled-plugins/`（出厂仅 README.txt **1 项**） | Electron 壳侧插件引擎的用户可装面（profile 读写 / bundles 防呆 / pnpm 通道——`shell-plugins.js`） | 出厂空置；用户经市场安装落 `~/.dsh/profiles/web`（§2.3 表） | 市场 + pnpm 通道；编排回指 `SHELL-UX.md` 与 `shell-plugins.js` 头注 |
| 技能 | `bundled-skills/`（5 档 .md：document-summary · image-recognition · ppt-generation · translation · writing-assistant） | 后端技能面；随包整体打入（`package.json:85`）；运行时目录由 `DSH_BUNDLED_SKILL_DIR` 注入（`shell-backend.js:108`） | 出厂即随包，无安装动作 | 随 App 发版走，无独立更新链 |
| bundle | `dsh-bundle/`（4 项） | 后端 @deepseek-ai/dsh 的出厂冻结依赖树（dependencies 空——`package.json:31`） | extraResources 映射到 dsh/node_modules（§2.7 表）；spawn 兜底（`shell-backend.js:90-93`） | 钉版 = registry `latest`（B08；权威 = `AUTO-UPDATE.md` §2.2.10） |

**环境覆盖钩子（三面共用一处）**：`DSH_HOME` 覆盖 ~/.dsh（`shell-backend.js:287-289`）；`DSH_BUNDLED_SKILL_DIR`
覆盖技能目录（`shell-backend.js:108`）；`BIGFISH_USER_DATA` 覆盖 userData（`main.js:66-69`）。
三钩子 = 本仓探针隔离与多实例开发的统一隔离面（probe 用法见 §2.6 probe-pet-media 行）。

### 2.9 改动入口表（U-3 收窄形态：改动类型 → 该动哪档 / 该更新哪份文档）

> 用法：动手前先按改动类型找行——「该动哪档」= 契约 / 语义的**权威档**（改行为先改档）；「该更新哪份文档」=
> 落地后必须同步的**登记面**（写权见 `AGENTS.md` §一 写权矩阵）。本表只指路，不重述各档判据（D2）。

| 改动类型 | 该动哪档（权威档 / 代码面） | 该更新哪份文档 |
|---|---|---|
| 改 shell-* 档行为 / 壳 UX 语义 | 对应设计档（`SHELL-UX.md` 等）→ 再动对应主进程 / 渲染层档（扁平档名；本仓无 `src/` 目录） | `CHANGELOG.md`；`ARCHITECTURE.md` 面②角色表随口径变化 |
| 新增主进程 / 渲染层档 | 接线面（`main.js` require + init）＋ `package.json` `build.files` 白名单（§2.7 加档纪律） | `ARCHITECTURE.md` 面②（24 档计数）；`docs/README.md` 文档地图（主 agent 写权） |
| 改 IPC 通道 / preload 桥 | `shell-ipc.js` / 各 preload 档；契约权威 = `SHELL-UX.md` §2.2 | `ARCHITECTURE.md` 面④（桥键数 / 通道计数） |
| 改数据落盘（userData / ~/.dsh 接触点） | `AUTO-UPDATE.md`（更新域）/ `PET-ANIMATION.md` §2.7（工作状态） | `ARCHITECTURE.md` 面③（谁写谁读表）；字段布局不写（U-5） |
| 改桌宠子系统（几何 / 拖拽 / 动画链 / 物理 / 工作状态） | 对应 `PET-MULTIMONITOR.md` / `PET-DRAG.md` / `PET-ANIMATION.md` / `PET-MOVEMENT.md` | `ARCHITECTURE.md` 面⑤（仅关系图随依赖变化） |
| 改打包 / 发布（资源、target、afterPack、latest.json） | `package.json` `build` 段 / `afterPack.js` / `make-latest.js`；更新链权威 = `AUTO-UPDATE.md` | `ARCHITECTURE.md` 面⑦（白名单条数） |
| 改 bundled-skills / dsh-bundle / bundled-plugins | `AUTO-UPDATE.md` §2.2.10（钉版 / 刷新）；`SHELL-UX.md`（插件编排） | `ARCHITECTURE.md` 面⑧ |
| 加诊断探针 | 新 `probe-*.js`（不入包；取证结论记入对应设计档测试层） | `ARCHITECTURE.md` 面⑥（8 档计数） |
| 改判据 / 门禁 / 代码规范 | `docs/CONVENTIONS.md` ＋ `scripts/gates/**` | 根 `AGENTS.md` §三（主 agent 写权） |

**前瞻注（B15）**：B15（仓库卫生；`docs/TODO.md` T34 / T35）将把 8 档 `probe-*` 与构建脚本归位到 `scripts/` / `tools/`——**落地后须同步本档面⑥（跑法 / 路径）、面⑦（脚本位置）与本表**（本档两面按 as-of 2026-09-19 根目录平铺形态记录）。

### 2.10 八面覆盖自检（as-of 2026-09-19，落笔时点）


| 面 | 成文落点 | 指针 | 证据行 |
|---|---|---|---|
| ① 进程与窗口模型 | 成文（§2.1）：常驻进程 2 ＋ 窗口表 5 行 ＋ 托盘 | 回指 SHELL-UX | 建窗点 / preload / 加载 / 生命周期逐窗实测 |
| ② shell-* 17 档角色与依赖 | 成文（§2.2）：shell-* 17 行 ＋ 非 shell 6 行 ＋ 尾注 3 条观察项 | 逐档头注压缩 | 逐档行数 + require 面实测 |
| ③ 数据面 | 成文（§2.3）：userData 6 行 ＋ 日志 8 件 ＋ ~/.dsh 5 行；U-5 深度声明 | 回指 AUTO-UPDATE / PET-ANIMATION §2.7 | 写 / 读 / 路径 / 生命周期逐行带 file:line |
| ④ IPC / 注入面契约 | 成文（§2.4）：桥表 4 行 ＋ ipcMain 26/24 ＋ init 实参表 14 行 | 回指 SHELL-UX §2.2 | 逐键数 / 接线点实测 |
| ⑤ 桌宠子系统关系图 | 成文（§2.5）：依赖图 ＋ 数据流主路径 ①–⑥ ＋ 工作状态支路 ＋ 同源核提示 | 回指 PET-* 四档（不重述） | require 面 / init 接线引 §2.2 / §2.4；physics.init 观察项引用 |
| ⑥ 8 档探针清点 | 成文（§2.6）：8 行逐档「干什么 / 怎么跑 / 读什么 / 产出什么」 | 回指 CONVENTIONS §八、PET-ANIMATION §3.3 | 逐档行数 + 跑法 + 档头行号；probe-pet-media 耦合面实测复核（5 require，无 main.js） |
| ⑦ 构建与发布面 | 成文（§2.7）：白名单 46 条分组表 ＋ extraResources 3 项 ＋ 脚本 5 件 ＋ 更新链三角 | 回指 AUTO-UPDATE、B16 | package.json:46-92 逐条点数复核；脚本行数实测 |
| ⑧ 插件·技能·bundle 三面 | 成文（§2.8）：三面表 3 行 ＋ 环境钩子注 | 回指 SHELL-UX / AUTO-UPDATE §2.2.10 | 三目录逐项 ls 实测（1 / 5 / 4 项） |
| 改动入口表 | 成文（§2.9）：9 行（U-3 收窄形态） | 每行双向指路（权威档 + 登记面） | 写权回指 AGENTS.md §一 |

**与 AC 的对应**：本表 = §3 的 AC-1（八面成文＋证据行）与 AC-2（残留痕迹）的落笔面自检；AC-3–AC-5（lint / D2 / as-of）为全档横切判据——见 §3。

## 3 可验证的验收标准（AC）

> 本批为纯文档批（无代码面）——验收面 = 本档自身与批次档 `docs/batches/B25-architecture-docs.md` §2 的声明面对账；
> 判据口径 = 可机检 / 可逐条勾销；回指 = 根 `AGENTS.md` §二 设计步三要素（本表 = 批次档 §6 核销的判据面）。

| # | 验收标准（回指立案档 §1.4 做 1–8） | 判据（可机检） |
|---|---|---|
| AC-1 | **八面成文 ＋ 证据行在场率 100%** | 面①–⑧ 逐一成文（§2.1–§2.8），每面 ≥1 条 `file:line` / 实测命令证据行；§2.10 覆盖表八行齐全；抽查 ≥8 处证据行 100% 在场 |
| AC-2 | **零占位**——全档只写现状、无待补痕迹 | 「待补」/「补实」/「占位」逐串 grep——**除本判据行（引证字样）外零命中**（收笔时点） |
| AC-3 | **本档 lint 零违例**（行宽 ≤300 等，§1.5-6） | `npm run lint` 输出中 `docs/design/ARCHITECTURE.md` 零违例（width 超 300 行数 = 0；他档存量违例不计入本批） |
| AC-4 | **D2 不重述抽查**（§1.5-2 单一权威源） | 抽查 ≥5 处细节回指（`PET-ANIMATION.md` §2.7 / `SHELL-UX.md` §2.2 / `AUTO-UPDATE.md` §2.2.10 等）逐处判「只回指不重述、无权威内容复制」 |
| AC-5 | **as-of 口径全覆盖**（§1.5-1） | 事实行带 as-of；行锚引用带「行号只作 as-of 参考」总注（档头 `:5`）；抽查 ≥8 处 `file:line` 引用均带 as-of 口径 |

**与 §2.10 的对应**：§2.10 覆盖自检表 = AC-1 / AC-2 的落笔面自检；AC-3–AC-5 为全档横切判据——上表逐条。

## 4 变更记录

| 日期 | 变更点 |
|---|---|
| 2026-09-19 | 建档 + 面①–④ 与总览图区四图落笔（第一棒）；面⑤–⑧ 与改动入口表 = 第二棒。 |
| 2026-09-19 | 第二棒落笔：面⑤–⑧、改动入口表（§2.9）、八面覆盖自检（§2.10）；probe-pet-media 耦合按实测写（无 main.js，台账 T29 更正另报）；§1.3 过期口径（17 档 / 15 require / 46 条白名单）在对应面订正。 |
| 2026-09-19 | **修订轮 1**（评审轮 1 十条收敛）：补 §3 验收标准 AC-1…5（§2.10 建对应；变更记录顺延 §4）；tray 10 档名单（§1.2）· 技能 5 档名（面⑧）· 无 init 补 shell-market · `src` 措辞 · PET-AFFINITY 行 · 行数口径注 · B15 前瞻注；面⑦ 补 `download-*` 说明 ＋ 判据指针补 `docs/CONVENTIONS.md`。依据 = 批次档 §3 轮次 1。 |
