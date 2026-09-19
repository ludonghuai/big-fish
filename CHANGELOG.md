# Changelog

本档 = 本仓**仓库面**变更史（开发者语汇，条目带批次档指针）；用户面摘要见 `版本说明.txt`——**方向单一：本档 → 版本说明**，不得反向回填（D2 单一权威源）。

体例：`[Unreleased]` 置顶；每版一节倒序；条目一行一条，归入 `Added` / `Changed` / `Fixed` / `Removed` 四类；粒度 = **用户可感或工程可判**的变更，不逐提交罗列。

## [Unreleased]

（B11 落档起步：本节收下一版变更；条目来源 = 各批次档 §6 收口行）

### Changed

- 桌宠动作节奏放缓：动作占比 85% → 40%，且动作之后有 30 秒静默期（不再「一直忙着切换动作」——`docs/batches/B27-pet-feel-2.md`）
- 插件市场卡片「主页」不再直接跳转（导航守卫——`docs/batches/B28-plugin-fixes.md`）
- 仓库门禁：新增样本区解耦判据（`samples/` 引用面零命中 + 打包白名单禁列，fail-closed——`docs/batches/B29-samples-guard.md`）
- 好感度数值标尺重定：10 级不变但门槛大幅拉高（旧 10 级 ≈ 新 5 级）、喂食效率 = 被动的 2 倍；存量数据按新表自动重映射（不丢数据——`docs/batches/B31-affinity-balance.md`）

### Fixed

- 桌宠活动范围偏小：物理边界改按「可见身体」口径（上 / 左 / 右三面透明留白消除——`docs/batches/B27-pet-feel-2.md`）
- 桌宠逃跑动作一闪而过：逃跑腿加长 / 加速并播完整段（约 10 秒，不再 0.7–1.3 秒回待机——同上）
- 插件「一键安装」对内置插件无效（`builtin:` 形态现可达——`docs/batches/B28-plugin-fixes.md`）
- 卸载内置插件报「已卸载」但实际未卸载（动作面改用解析后真名——同上）
- 旧后端进程清理在 Windows 上失效（路径通配双形态——同上）
- 启动 App 时误报「任务已完成」（判定加「会话有回合历史」前提——`docs/batches/B30-notify-followup.md`）
- 好感度满级后点数无限增长（满级显示 `MAX`，不再溢出——`docs/batches/B31-affinity-balance.md`）

### Added

- **「等待确认」提醒**：回合静默超 60 秒且确实在等你时，发一条通知 + 桌宠说「等你确认哦！」（每回合最多一次——`docs/batches/B30-notify-followup.md`）

（2026-09-19 六批核销同步：条目源 = 各批 §6；B08–B26 历史回溯补写见 `docs/TODO.md` **T54**）

## [0.0.1] — 待发布（发布动作见 `docs/TODO.md` T11）

### Added

- 插件市场：在线取 awesome-dsh-plugin 全量目录 + 失败回退内置精选副本；一键安装 / 卸载 / 禁用 / 启用（内置 pnpm，无需用户自备环境）
- 鲸鱼娘桌宠：好感度（基于真实 token 消耗）、兑换屋、拖拽跟手、多屏几何与可见性（`docs/batches/B01-pet-drag-follow.md` · `docs/batches/B03-pet-multimonitor.md`）
- 专注模式 / 鲸鱼模式切换；背景更换与恢复默认背景
- 自动更新：App 本体 + Harness 后端 + 已装插件（`docs/batches/B02-auto-update.md`）

### Fixed

- 插件禁用不生效、市场状态不刷新
- Harness ≥ 0.1.5 会话鉴权兼容——主窗口加载后端打印的带 token 地址换取会话 Cookie，重启后自动跟进（`docs/batches/B07-harness-auth-compat.md`）
- 空闲检测不再阻塞主进程——退役每 5 s 的 `~/.dsh` 同步全树遍历（同上）
- 后端不再自动拉起系统浏览器（`--no-open`，同上）
- `main.js` 拆分遗留的未绑定 `notifier` 调用——「更换背景…」/「恢复默认背景」恢复正常（同上）
- 更新激活失败（junction 失效）与安装包累积（`docs/batches/B04-harness-activate-fix.md` · `docs/batches/B05-installer-cleanup.md`）

（首批条目 = **一次性回溯种子**：素材源 = 既有 `版本说明.txt` 两段 + 已核销批次 B01–B07；一条用户可感变更一行，**不回溯逐提交**）
