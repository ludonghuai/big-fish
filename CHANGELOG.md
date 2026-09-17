# Changelog

本档 = 本仓**仓库面**变更史（开发者语汇，条目带批次档指针）；用户面摘要见 `版本说明.txt`——**方向单一：本档 → 版本说明**，不得反向回填（D2 单一权威源）。

体例：`[Unreleased]` 置顶；每版一节倒序；条目一行一条，归入 `Added` / `Changed` / `Fixed` / `Removed` 四类；粒度 = **用户可感或工程可判**的变更，不逐提交罗列。

## [Unreleased]

（B11 落档起步：本节收下一版变更；条目来源 = 各批次档 §6 收口行）

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
