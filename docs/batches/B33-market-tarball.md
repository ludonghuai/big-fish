# B33 —— 插件市场 GitHub 源 tarball 化 + 失败文案归类 + T57 弹窗重入守卫

> 六段一作者（append-only）：§1 / §4 / §6 = 主 agent · §2 = 设计要点（快速通道落笔）· §3 = 评审裁定 · §5 = eng-coder。
> **流程形态 = 快速通道**（用户 2026-09-20 裁定）：设计要点聊天内确认 + 用户口头批准后直接实施；评审子代理轮免除（§3 记录该裁定）。

## §1 需求与根因（主 agent）

### 1.1 用户报告（2026-09-20）

插件市场下载插件失败，报错弹窗 =「安装失败：安装失败（pnpm exit 1）：from remote repository. Please make sure you have the correct access rights and the repository exists.」+ 一长串 `pnpm.cjs` 内部堆栈（`getRepoRefs → resolveRef → resolveGit`）；用户并称「有很多很不对劲的问题」。

### 1.2 根因（实测封口，as-of 2026-09-20）

`github:` 源插件走 pnpm 的 **git 协议**解析（截图堆栈 `getRepoRefs` = `git ls-remote https://github.com/…`）。本机实测：

- `git ls-remote https://github.com/ysyyhhh/dsh-pet` ⇒ **Connection was reset**（github.com 的 git 面在无代理环境不可达——与 T56 同族）；
- `curl https://codeload.github.com/ysyyhhh/dsh-pet/tar.gz/HEAD` ⇒ **HTTP 200（0.7 s）**（tarball 面可达）；
- 三个公共镜像（ghproxy.net / ghfast.top / gh-proxy.com）对该仓库均 404——仅作回退兜底。

⇒ `plugins.json` 中约 17 个仅有 `github:` 源的插件在无代理环境**全部装不上**；npm 源（npmmirror）不受影响。且 git 协议面依赖本机安装 git，普通用户机器通常没有。

### 1.3 顺带发现（同批处置，均与用户报告「不对劲」同族）

① 失败 toast 双重前缀（UI 前缀 + 主进程消息自带前缀）；② pnpm 原始堆栈 800 字符直接弹窗；③ T57（台账已登记）：`showModal` 单变量覆盖 ⇒ 前确认框 Promise 永久悬挂（「点了没反应」同形）。

### 1.4 需求三层

- **总目标**：国内无代理环境下插件市场全目录可装；失败时给出可读指引。
- **功能用户故事**：US-1 作为用户，装 GitHub 源插件不需要本机 git、不依赖 github.com 主站可达；US-2 作为用户，安装失败看到一句中文指引而非英文堆栈；US-3 作为用户，弹窗打开期间误点其它操作不会卡死。
- **非功能标准**：既有安全门（B12 白名单 / 越界 / 解析门）零回退；门禁三连绿；`market.js` 贴线档净行数 ≤0。

## §2 设计要点与凭证（快速通道落笔）

设计契约唯一详述处 = `docs/design/SHELL-UX.md` **§2.2.16**（下载链 / 防呆 / 持久落点 / 失败文案四类 / UI 两处 / 零回退面六条）。
要点回顾：① `github:` 源改走 HTTPS tarball 下载链（新模块 `shell-plugin-fetch.js`：codeload 直连 + `GITHUB_MIRRORS` 回退，gzip 魔数防呆，tarball 持久落 `dshHome()/plugin-tarballs/`），`pnpm add` 实参 = 相对 profile 的 posix 路径；② `friendlyInstallError` 四类归类 + 原始输出落 update 域日志；③ `failText` 去双重前缀；④ `showModal` 重入守卫（T57）。
**设计凭证**：用户 2026-09-20 聊天内确认上述要点并口头批准（「开工」），快速通道生效。

## §3 评审裁定

快速通道：评审子代理轮**免除**（用户 2026-09-20 裁定）。自证面 = 桩测六用例（TC-107…TC-112）+ 门禁机检（TC-113）+ 根因实测行（§1.2）。

## §4 受影响文件全清单（主 agent）

| 文件 | 改动 | 行数（改前 → 改后） |
|---|---|---|
| `shell-plugin-fetch.js` | **新建**：tarball 下载链 + 失败文案分类 | 0 → 91 |
| `shell-plugins.js` | github 分支接下载链；pnpm 失败归类；`logInstallFail` | 456 → 475 |
| `market.js` | `showModal` 重入守卫 +1；失败 toast 四处改 `failText` ±0；删两条调试 `console.log` −2 | 498 → **497** |
| `market-update.js` | `failText` helper（反向供 `market.js`）；`doUpdate` 去双重前缀 | 51 → 59 |
| `package.json` | `build.files` 登记 `shell-plugin-fetch.js`（随包发） | 142 → 143 |
| `tests/b33-market-tarball.test.js` | **新建**（TC-107…TC-112） | 0 → 276 |
| `docs/design/SHELL-UX.md` | §2.2.16 + 用例表 TC-107…113 + 变更记录 | — |
| `docs/TODO.md` / `CHANGELOG.md` / `docs/batches/B31-affinity-balance.md` | T57 勾销 + T58 登记 / B33 条目 / 存量超宽行折行（§5.3） | — |

**贴线档拆分计划（`market.js` 497 ≥ 480 的纪律件）**：下次对 `market.js` 有增量改动前，把渲染面（`renderCard` / `renderGrid` / `renderTabs` / `renderStatus`）拆出为 `market-render.js`（同页 sibling 共享全局，先例 = `market-update.js`）；行为零回退判据 = b28 / b33 两档 vm 桩测试全绿 + 门禁三连。**本批净 −1，未触顶。**

## §5 实施记录（eng-coder）

### 5.1 代码面

按 §4 清单逐档落地；关键决策：

- **pnpm 实参取相对 posix 路径**（`path.relative(profileDir(), tgz)`）：规避盘符被 pnpm 误解析为协议，与 manifest 的 `file:` 引用同径（TC-107 断言实参形态）。
- **gzip 魔数防呆**：镜像 404/错误页可能返回 HTML 200，不落盘直接回退下一源（§2.2.16 条 2）。
- **失败消息一律以「安装失败：」起**，UI 侧 `failText` 识别五类动作前缀不叠加——主进程 / 渲染层双保险。

### 5.2 测试面

`tests/b33-market-tarball.test.js`（276 行）：TC-107 成功链（首调 URL / tgz 实参 / 持久落盘 / 真名注册四断言）· TC-108 回退 · TC-109 全败（零 pnpm + 注册面零改动 + 尝遍下载链）· TC-110 pnpm 失败归类（无堆栈帧 / 无英文原文）· TC-111 toast 前缀 · TC-112 模态重入。桩手法 = b28 同族（假 spawn / 假 fetch / vm + 极简 DOM）。

### 5.3 顺手处置（门禁解锁件）

`lint` 初跑报 `docs/batches/B31-affinity-balance.md` 非豁免超宽 1 行（§6 收口轮段 370 字符，**存量**——随 4151ffc 进仓、CI 未再跑过该面）：同段内折行（语义零变更），lint 转绿。**未动 `baseline.json`**（T55 ③ 的 asOf 残留仍归 T55）。

### 5.4 门禁实测（as-of 2026-09-20）

- `npm run lint` ⇒ **PASS**（7 判据 + selftest 20/20；`market.js` 497 贴线提示行正常）；
- `npm run test:full` ⇒ **PASS 57/57**（含本批新增 6 用例；b12 / b28 档零 diff 同绿）；
- `npm run test:integration` ⇒ **PASS**（S1 / S2 / S3 三场景，55 s）。

## §6 验收勾销（主 agent）

| AC | 内容 | 证据 | 状态 |
|---|---|---|---|
| AC-B33-1 | 无 git 且 github.com 主站不可达时 GitHub 源插件可装（codeload 可达即可），bundles 注册真名 | TC-107 / TC-108 桩测 ✓；**真机实装待用户确认** | ☑ 桩测面 / ☐ 真机面 |
| AC-B33-2 | 下载链全败 / pnpm 失败 ⇒ 中文归类指引，无堆栈帧、无英文原文 | TC-109 / TC-110 ✓ | ☑ |
| AC-B33-3 | 失败提示不叠双重前缀（安装 / 更新面） | TC-111 ✓（doUpdate 同用 `failText`） | ☑ |
| AC-B33-4 | 模态打开时再点操作不悬挂（T57） | TC-112 ✓；台账 T57 已勾销 | ☑ |
| AC-B33-5 | 零回退 + 门禁：白名单三面不动、npm / 内置源路径不动、lint + test:full + test:integration 全绿 | TC-113 面：b12 / b28 档零 diff；§5.4 三连实测 | ☑ |

**台账联动**：T57 → **已核销**；T58（镜像表可用性巡检）→ 已登记待讨论。`CHANGELOG.md` `[Unreleased]` Fixed 增三条（tarball 链 / 失败文案 / T57）。
**遗留**：AC-B33-1 真机面（用户实装一个 GitHub 源插件确认）——通过后本行转全 ☑。
