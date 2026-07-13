# MetaMates

**私人灵感仓库 + 思考引擎** — 本地 Markdown 工作区承载碎片与计划，右侧 AI 助手（Gemini / Claude / CodeBuddy 等）读写同一文件夹；`/today`、`/graduate` 等命令把成品写回笔记，而不是消失在聊天里。

开源桌面应用（Electron）。**产品代码、工作区模版与构建配置均在 [`metamates-app/`](metamates-app/) 目录**（monorepo 结构）。

```bash
cd metamates-app
npm ci
npm run start
```

---

## 下载

Releases 页提供 Windows（`.exe`）与 macOS（`.dmg`）安装包（发布后在 [GitHub Releases](https://github.com/qdljywz/MetaMates/releases) 获取）。

---

## 工作区模版（`inits/`）

首启向导会从 [`metamates-app/inits/zh`](metamates-app/inits/zh) 或 [`metamates-app/inits/en`](metamates-app/inits/en) **复制标准目录**到用户选择的工作区。模版即产品方法论在磁盘上的「出厂形态」：

| 目录 | 中文 | 英文 | 用途 |
|------|------|------|------|
| `01_…` | 日记与计划 | Log and Plan | 日记、`PLAN`、**Inbox** 剪藏缓冲 |
| `02_…` | 项目与知识 | Project and Knowledge | 长期项目与结构化知识 |
| `03_…` | 点滴积累 | Insights | 原子笔记与灵感碎片 |
| `04_…` | 情报与连接 | Intelligence | 外部资料、会议、人脉 |
| `05_…` | 模板与配置 | Templates and Config | `Master_Control.md`、`2M.md`、CLI 协作协议 |

**Inbox 设计**（`01_…/Inbox/`）：

- 手机 Vault API、随手剪藏、临时捕获的**入口缓冲**（出厂为空目录，仅 `.gitkeep`）
- 运行 `/graduate` 成功后，源条目归档到 `Inbox/processed/`（运行时创建，不在初始模版里）
- 空态「思考引擎」会读取 PLAN、日程、Ideas 与未处理 Inbox 数量，提出贴合当前处境的问题

**Agent Skills**（随模版一并复制到工作区根目录）：

- `.claude/skills/`、`.codebuddy/skills/`、`.gemini/skills/` — 15 条 slash 命令的实现说明
- 根目录 `GEMINI.md` / `CLAUDE.md` / `CODEBUDDY.md` — 各 CLI 协作协议

初始化后，工作区内的 [`README.md`](metamates-app/inits/zh/README.md)（中/英各一份）说明目录含义与建议工作流。

---

## 产品要点

| | 私人灵感仓库 | 思考引擎 |
|---|-------------|----------|
| **是什么** | 本地 Markdown 文件夹 | 右侧 AI 对话 + 15 条 slash 命令 |
| **主入口** | 剪藏、日记、双链整理 | 打开 App → 选 CLI → 说话或 `/today` |
| **产物** | Inbox、永久笔记、Master Control | 计划、复盘、升级后的笔记 — **写回仓库** |

关完所有编辑器标签时，中间区域显示**思考引擎空态**：根据 PLAN 未完成任务、今日日程、Ideas 报告与 Inbox 积压，生成「真处境 → 真问题」式引导（非功能菜单式欢迎页）。

详细定位见 [metamates-app/docs/POSITIONING.md](metamates-app/docs/POSITIONING.md)。

---

## 文档

| 文档 | 说明 |
|------|------|
| [metamates-app/README.md](metamates-app/README.md) | 产品介绍、能力清单与开发者快速开始 |
| [metamates-app/docs/USER_GUIDE.md](metamates-app/docs/USER_GUIDE.md) | 用户操作指南 |
| [metamates-app/docs/POSITIONING.md](metamates-app/docs/POSITIONING.md) | 产品边界与双核叙事 |
| [metamates-app/inits/zh/README.md](metamates-app/inits/zh/README.md) | 中文工作区模版说明（初始化后也会出现在用户目录） |
| [metamates-app/CHANGELOG.md](metamates-app/CHANGELOG.md) | 版本记录（基线 **0.1.0**） |
| [metamates-app/docs/OPEN_SOURCE.md](metamates-app/docs/OPEN_SOURCE.md) | 开源文件清单（monorepo） |
| [metamates-app/docs/PACKAGING.md](metamates-app/docs/PACKAGING.md) | 打包指南 |
| [metamates-app/docs/PLUGINS.md](metamates-app/docs/PLUGINS.md) | 扩展（插件）架构 |
| [metamates-app/docs/RELEASE_CHECKLIST.md](metamates-app/docs/RELEASE_CHECKLIST.md) | 发版清单 |
| [metamates-app/docs/UX_REGRESSION_GUARDRAILS.md](metamates-app/docs/UX_REGRESSION_GUARDRAILS.md) | UX 回归护栏 UX-01～38 |
| [metamates-app/CONTRIBUTING.md](metamates-app/CONTRIBUTING.md) | 贡献指南 |
| [metamates-app/SECURITY.md](metamates-app/SECURITY.md) | 安全报告 |
| [metamates-app/CODE_OF_CONDUCT.md](metamates-app/CODE_OF_CONDUCT.md) | 行为准则 |

---

## 版本

- **首发开源：v0.1.0** — 首次 `git push` + GitHub Release 前的完整基线
- 变更记录：[metamates-app/CHANGELOG.md](metamates-app/CHANGELOG.md)
- 应用内版本号来自 `metamates-app/package.json` 的 `version` 字段

---

## 许可证

MIT — 见 [metamates-app/LICENSE](metamates-app/LICENSE)
