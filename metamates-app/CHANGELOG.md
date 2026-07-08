# Changelog

本项目从 **0.1.0** 起采用 [语义化版本](https://semver.org/lang/zh-CN/) 与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 规范。此前的内测标签（v0.x-beta、`VERSION.md` 等）已废弃，不再维护。

## [Unreleased]

（尚未发布的改动写在这里。）

---

## [0.1.0] - 2026-07-08

**基线版本** — 以当前代码库为唯一正式起点。

### 产品

- 本地 Electron 桌面知识库：Markdown 工作区 + 文件树 + 多标签编辑器
- 思考引擎（右侧 Agent 面板）：Gemini / Claude / CodeBuddy 等 CLI，经 ACP 连接
- 15 个 slash 技能（`/today`、`/graduate`、`/closeday` 等），写回 PLAN / 笔记 / Inbox
- 引擎优先空态：根据 PLAN、Inbox、日程等诊断处境并引导下一步
- 知识图谱（2D / 3D）、全局搜索、命令面板、日历与 Vault API 剪藏
- 中英文界面、时区设置、无 CLI 时的安装引导

### 工程与质量

- `inits/zh`、`inits/en` 工作区模版；`sync:inits-to-app` / `sync:inits-to-workspace`
- E2E 套件（启动、文件树、编辑器信任、Agent 写回、图谱、无 CLI 等）
- UX 回归护栏（`docs/UX_REGRESSION_GUARDRAILS.md`）
- CI（`verify:round`、`test:ux-guardrails`）、Windows/macOS 打包与 `verify:fresh-user`

### 开源

- MIT 许可、CONTRIBUTING / SECURITY / CODE_OF_CONDUCT
- GitHub Issue / PR 模板、`release-pack` 工作流
