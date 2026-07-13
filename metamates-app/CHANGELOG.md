# Changelog

本项目从 **0.1.0** 起采用 [语义化版本](https://semver.org/lang/zh-CN/) 与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 规范。此前的内测标签（v0.x-beta、`VERSION.md` 等）已废弃，不再维护。

## [Unreleased]

（尚未发布的改动写在这里。）

---

## [0.1.0] - 2026-07-13

**首次对外开源基线** — monorepo 结构，产品代码在 `metamates-app/`。

### 产品

- 本地 Electron 桌面知识库：Markdown 工作区 + 文件树 + 多标签编辑器
- 思考引擎（右侧 AI 助手）：Gemini / Claude / CodeBuddy 等，经 ACP 连接
- 15 个 slash 技能（`/today`、`/graduate`、`/closeday` 等），写回 PLAN / 笔记 / Inbox
- 引擎优先空态：根据 PLAN、Inbox、日程等诊断处境并引导下一步
- 知识图谱（2D / 3D）、全局搜索、命令面板、日历与 Vault API 剪藏
- 中英文界面、时区设置、无 CLI 时的安装引导
- **可选扩展**：`document-import`（PDF/DOCX/OCR）、`offline-speech`（Whisper 离线语音）

### 工程与质量

- `inits/zh`、`inits/en` 工作区模版；`sync:inits-to-app` / `sync:inits-to-workspace`
- 插件运行时（`electron/pluginRuntime/`）：设置页安装、GitHub Release zip、bundled 自动安装
- E2E 套件（启动、文件树、编辑器信任、Agent 写回、图谱、无 CLI、**打包空态/插件**）
- UX 回归护栏 **UX-01～UX-38**（`docs/UX_REGRESSION_GUARDRAILS.md`）
- 启动动画合同：**5s 描边一圈 + 5.5s 固定进主界面**（`STARTUP_FORCE_ENTER_MS`）
- 打包版：12s 不灰屏、空态不反复转圈、silent end-turn、portable-green bundled 插件
- CI（`verify:round`、`test:ux-guardrails`、smoke E2E）、`release-pack` 发版工作流
- 发版验收：`acceptance:final`（文档导入 + 便携 + 打包 E2E）

### 开源

- MIT 许可、CONTRIBUTING / SECURITY / CODE_OF_CONDUCT
- GitHub Issue / PR 模板、`check:opensource` 卫生检查
- 文档：`OPEN_SOURCE.md`、`PACKAGING.md`、`PLUGINS.md`、`RELEASE_CHECKLIST.md`
