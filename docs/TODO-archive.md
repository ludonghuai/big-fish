# Bigfish 台账归档（docs/TODO-archive.md）

> 本档是 `docs/TODO.md` 的**归档档**：已核销 / 已废弃条目逐条移入此处，活文件只留未决四态（待讨论 / 待设计 / 在途 / 待核销）。
> 一条一行，不展开任务细节；保留原编号与结论，便于回溯。

---

## 一、需求池（已核销 / 已废弃）

| # | 条目 | 结论 | 批次 | 日期 |
|---|---|---|---|---|
| R3 | App 更新安装包清理——已下载完成的安装包不在磁盘累积（下次启动回收，不在安装器运行时删） | 已核销——回收面扩为 `userData/updates/` 全部条目 + 取证行 `update cleanup type=app removed=<n> failed=<m>`；AC15 / AC15-b 全绿（真机五路径 + 假桩回归四态）；证据 = `docs/batches/B05-installer-cleanup.md` §6.2 | B05 | 2026-09-16 |
| R5 | 桌面壳 UX 整合（启动形态 / 桌宠左右键语义 / 删新手向导 / 托盘菜单重排 / 更新门禁口径） | 已核销——P0（F1–F5 + F7）落地并经用户真机目视验收（2026-09-16 22:43）；F6 拆分由后续提交落地；收尾核销见 `docs/batches/B06-shell-ux.md` §6 与 `docs/batches/B07-harness-auth-compat.md` §6 | B06（收尾并入 B07） | 2026-09-17 |
| R6 | `main.js` 拆分（高内聚低耦合 / 零回退 / 不引依赖） | 已核销——`main.js` 2831 → **204 行** + 15 个 `shell-*.js`（最大 437 < 500）；IPC 面一致（`on` 11 / `handle` 12）；`node --check` 40/40 绿；遗留缺陷 T12 已由 B07 修复并真机确认 | B06 F6（复测 B07） | 2026-09-17 |
| R7 | 启动不再自动拉起系统浏览器（dsh CLI `--no-open`） | 已核销——本批 3 次启动（`:60227` / `:59825` / `:50844`）日志均无 `opening the default browser`（该行历史 16 次全在改前）；用户目视确认 | B07 | 2026-09-17 |
| R8 | Harness ≥ 0.1.5 会话鉴权兼容（主窗口加载带 token 地址 + 重启后跟进） | 已核销——真机主窗口为完整对话 UI（用户截图）+ `dsh-auth-*` Cookie 五条 authority 时间线（含重启后新端口 `:50844` 11:36:45 签发） | B07 | 2026-09-17 |
| R9 | 空闲检测不得阻塞主进程（同步全树遍历清除；通知语义不回退） | 已核销——`grep "Sync(" shell-notify.js` = 0 · `latestMtime`（词边界）全仓 0 · `process.platform` = 0；通知语义桩测 14 项全绿；真机无顿挫报告 | B07 | 2026-09-17 |

## 二、技术待办（已核销 / 已废弃）

| # | 条目 | 结论 | 批次 | 日期 |
|---|---|---|---|---|
| T3 | `setPetEnabled()` 不可达——「按 `petEnabled` 开关桌宠」之路无入口 | 已核销——用户裁定 A：删除死代码（`setPetEnabled()` 移除；`settings.petEnabled` 键与 `DEFAULT_SETTINGS` 保留，`setMode()` 为唯一模式入口） | B02 | 2026-09-16 |
| T6 | 打包前置缺 `node-runtime/node.exe`——打包版后端起不来（90s×2 超时后弹「后端启动失败」），更新检查永不执行 | 已核销——本机按 `download-node.js` 同源 URL 补入 Node v24.16.0，打包版后端正常启动、真机复测通过；**结构性缺口（全新克隆仍无法打包）由 T7 继续承载** | B02 | 2026-09-16 |
| T1 | 桌宠右键语义修正——右键松开也走 `clicked()`，导致一次右键同时开主窗口与兑换屋 | 已核销——左键开 / 聚焦、右键仅开兑换屋（真机确认，B07 §6.1 AC7） | B06（承 B07） | 2026-09-17 |
| T2 | `main.js` 拆分——单文件承载 6 个功能域 | 已核销——见需求池 R6 行（同日同据） | B06 F6（复测 B07） | 2026-09-17 |
| T12 | F6 拆分遗留缺陷——`shell-mode.js` 两处调用未绑定的 `notifier` | 已核销——`:131` / `:141` 改用注入面 `notify`；该档 `notifier` = 0、未绑定引用全扫 0；真机托盘「更换背景…」「恢复默认背景」均正常（改前后者必抛未捕获异常） | B07 | 2026-09-17 |
| T15 | `shell-backend.js` 头注释函数清单未同步（缺 `writeDiag` / `webUrlWaitMs` / `makeTee`） | 已核销——按实测文件序补齐（仅注释，零逻辑改动，`node --check` 绿） | B07 | 2026-09-17 |
| T17 | `docs/requirements/UPDATE.md:182`（B08 变更行）行尾多一个空单元格 `\| \|`（两列表格出现三格）——Markdown 形态面，非语义问题 | 已核销——B08 修正轮 1 清除（需求档 §变更记录 现状零三格行；机检 `\| \|\s*$` 无命中） | B08 | 2026-09-17 |
| T14 | 好感度「真实消耗」读面疑长期失效——`shell-affinity.js` 读 `storages/session_projcache.json`，而 0.1.5 已改 per-record 目录布局 ⇒ 恒 `null`、好感度不累积 | 已核销——读面重写为「per-record 目录优先（口径 B 四桶之和，只读 `totals`）+ 旧单文件兜底（带消解期）」；载具 **77 断言**（主 agent 亲跑）+ 真目录独立复算一致；证据 = `docs/batches/B10-affinity-token-source.md` §6.1 | B10 | 2026-09-17 |
| T27 | 好感度累加在「启动期读数 `null`」后本进程永久暂停（`lastTokenSum` 只在守卫内被赋值 ⇒ 基线永远停 `null`） | 已核销——修法 = **既有守卫行之前插入 1 行**（`if (lastTokenSum === null && s2 !== null) lastTokenSum = s2;`；**守卫行零改动**）；TC-67B「首非 null tick 只重建基线 ⇒ 后续累加恢复」亲跑通过；证据 = 同上 §6.1 | B10 | 2026-09-17 |
| T18 | 🔴 插件安装/卸载路径穿越 ⇒ 任意目录递归删除（`shell-plugins.js` 对 `spec`/`pkgName` 零校验，`..` 归一化后 `rmSync(recursive)`） | 已核销——入参**三形态白名单门**（新增 `installSpecKind`）+ **四处守卫面**包含判定（`isInsideDir`，各紧随 `path.join` 且**先于其后的任何 fs 调用**）；13 形穿越枚举全拒 + 夹具零改动；证据 = `docs/batches/B12-market-security-blocking.md` §6.1（主 agent 亲跑 19/19） | B12 | 2026-09-17 |
| T19 | 🔴 主线程同步阻塞（`computePluginUpdates` 循环内逐项 `listInstalledPlugins()`，注册表 3727 项 ⇒ 每调用约 3.7k 轮同步 fs） | 已核销——`scanProfile()` **单次快照** + 六函数可选 `ctx` 尾参（循环体内零扫描）；**N=2 与 N=3727 的 fs 调用计数相等** + `node_modules` 顶层 `readdirSync` = 1/次；逐项判定零回退（黄金样本 + 改前⨯改后 7 面对照）；证据 = 同上 §6.1 | B12 | 2026-09-17 |
| T20 | 🔴 第三方注册表字段经 `innerHTML` 注入（XSS；恶意条目被点开即在持有 `marketAPI` 的渲染进程执行脚本） | 已核销——弹窗/卡片改**节点构造**（`el()` / `frag()`，`confirmModal(title, okLabel, ...parts)`）；`market.js` 四符号（`innerHTML` / `insertAdjacentHTML` / `outerHTML` / `document.write`）**各 0 处**（主 agent 亲 grep）+ 恶意字段三形态下弹窗与卡片只产生文本节点（TC-77/78）；**真机目视归用户回归**；证据 = 同上 §6.1 | B12 | 2026-09-17 |
