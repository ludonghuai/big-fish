# Bigfish 第三方组件与致谢（THIRD-PARTY NOTICES）

Bigfish 整合了以下开源组件，谨此致谢。完整许可证文本见各组件 LICENSE 文件或来源仓库。

> **Bigfish 本体**：源码托管在 Gitee（<https://gitee.com/ludonghuai/big-fish>），MIT 协议，见 [LICENSE](LICENSE)。

---

## 桌宠插件方案参考 —— s17179XTY / dsh-BigfishPet

> ⚠️ **该插件不是 Bigfish 官方出品，也不属于 Bigfish Team。**
> 它由社区开发者 **s17179XTY** 将 Bigfish 的桌宠改造为 DeepSeek Harness 插件
> （fork 自 Bigfish 项目），Bigfish 仅在其开发过程中作为方案参考，并向其致谢。

- **作者**：s17179XTY（第三方社区开发者，非 Bigfish Team 成员）
- **作者 GitHub**：https://github.com/s17179XTY
- **仓库**：https://github.com/s17179XTY/dsh-BigfishPet
- **协议**：MIT License
- **说明**：Bigfish 桌宠的插件化方案（把桌宠做成 DSH 官方插件、设置页 + 状态持久化 +
  真实完成信号）参考自该开源项目，谨此致谢。

---

## DeepSeek Harness（@deepseek-ai/dsh 及其插件体系）

- **来源**：https://github.com/deepseek-ai/deepseek-harness
- **协议**：MIT License
- **说明**：Bigfish 是 DeepSeek Harness 的桌面壳，后端为官方 `dsh` CLI（web profile），
  插件市场遵循官方 Cordis 插件体系。

---

## 社区插件目录（插件市场数据）

- **来源**：https://awesome-dsh-plugin.com / https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
- **说明**：插件市场在线目录实时取自 awesome-dsh-plugin 社区平台（1000+ 插件）；
  `plugins.json` 为内置的精选离线副本（各插件版权归其作者所有，Bigfish 插件市场
  仅提供目录与安装入口）。

---

## pnpm（随应用内置，用于插件安装）

- **来源**：https://github.com/pnpm/pnpm
- **协议**：MIT License
- **说明**：`node-runtime/pnpm/pnpm.mjs` 为 pnpm 官方发布包，用于在 web profile 中
  安装/卸载 DSH 插件。

---

## 桌面宠物动画素材

- **说明**：Bigfish 桌宠（鲸鱼娘）动画素材为 Bigfish 自有素材（`assets/pet/`、
  `assets/pet-new/`、`assets/jimeng-2026-08-15-3386/`），由用户提供/生成。

---

## 桌宠视频动画素材与动画链机制 —— dsh-pet（PC2005-cloud）

- **作者**：PC2005-cloud
- **作者 GitHub**：<https://github.com/PC2005-cloud>
- **仓库**：<https://github.com/PC2005-cloud/dsh-pet>（v0.2.11）
- **素材许可**：**允许开源使用、禁止商用**；原作者要求：任何介绍 / 展示 / 分发处须附原作者 GitHub 地址
- **说明**：Bigfish 桌宠的视频动画素材（`assets/pet-anim/webm/**`，106 段 VP9-alpha，640×360）
  与动画链机制（动作池 / 权重链 / 双缓冲交叉淡入 / 事件档位）参考自该项目，谨此致谢。
- **⚠️ 禁止商用（消解路径）**：本仓当前为**非商用**（免费、无付费功能）⇒ 本素材可用；
  若本仓**转向商用**，必须在此之前完成「**替换为自产素材**」或「**取得原作者授权**」——
  消解前每次发版复核一次。
