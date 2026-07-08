# MetaMates

> **本地优先的个人知识操作系统** — Markdown Vault 是主场，Agent 是执行层。  
> Local-first personal knowledge OS — your vault is home; agents execute in the same workspace.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)

---

## 一句话 / One-liner

**MetaMates** 是安装在本机的 **Electron 桌面应用**（不是网页）：用 Obsidian 式 Markdown 工作区承载思考与规划，通过 **ACP** 连接 Gemini / Claude / CodeBuddy 等 CLI，让 AI **读写同一文件夹**——`/today`、`/trace` 等命令把结果写回笔记，而不是消失在聊天里。

---

## 我们是什么 / 不是什么

| ✅ 我们是 | ❌ 我们不是 |
|-----------|------------|
| 本地 Vault + 多 CLI Agent 一体 | 纯 Chat 客户端 |
| 编辑器中轴 + 右侧 Agent 执行层 | 三栏「聊天 App」布局 |
| 每个 CLI 一条持续对话 | 多会话 / 对话树 |
| 数据在本地 Markdown | 强制云同步 SaaS |

详细定位见 [docs/POSITIONING.md](docs/POSITIONING.md) · 桌面架构见 [docs/DESKTOP_APP.md](docs/DESKTOP_APP.md)

---

## 核心能力

| 模块 | 说明 |
|------|------|
| **Vault** | `[[双链]]`、`#标签`、全文 + 语义搜索、关系图谱、多标签编辑、自动保存 |
| **思考引擎空态** | 无编辑器标签时，根据 PLAN / 日程 / Ideas / Inbox 提出处境化问题；支持本地轮换与后台 Agent 重判 |
| **日记日历** | 点击日期创建/打开 `YYYY-MM-DD.md` 与 `YYYY-MM-DD PLAN.md` |
| **Agent 执行层** | 右侧选 CLI、slash 命令 chips、工具调用卡片；输出跳回编辑器 |
| **方法论命令** | 15 条 slash（见下），对应工作区 Skills |
| **Vault API** | 手机 `/mobile` 只读 + `POST /api/capture` 写入 Inbox |
| **MCP / Ollama** | 可选扩展本机 Agent 能力 |

---

## 界面结构

```text
┌──────────┬─────────────────────────┬──────────────────┐
│ 文件树    │  编辑器（Vault 主场）     │  Agent 执行层     │
│ 日历/搜索 │  Markdown · 双链 · 标签  │  CLI + slash 命令 │
└──────────┴─────────────────────────┴──────────────────┘
```

---

## 方法论命令（15）

| 类别 | 命令 |
|------|------|
| 日常 | `/context` `/today` `/closeday` `/schedule` `/sync` |
| 思考 | `/trace` `/connect` `/challenge` `/ghost` |
| 灵感 | `/ideas` `/graduate` `/drift` `/emerge` `/intel` |
| 规划 | `/soal`（写入 `05_…/2M.md` 进化层） |

> `/intel` 由桌面端先完成本地抓取（网页/PDF/图片等），Agent 再深化摘要并写回 `04_情报与连接/`。

---

## 快速开始

### 系统要求

- **Node.js 20+**（仅开发者构建时需要）
- **Windows 10+** 或 **macOS 12+**（Apple Silicon / Intel）
- 至少一个已安装的 ACP CLI（Gemini / Claude / CodeBuddy 等，可选）

### 用户

1. 从 [GitHub Releases](https://github.com/qdljywz/MetaMates/releases) 下载安装包，或自行 `npm run electron:build:win` / `:mac`
2. 运行 **MetaMates**（**桌面窗口**，不是浏览器）
3. 首启向导：选择/初始化工作区文件夹
4. 安装并连接至少一个 CLI Agent
5. 在中间写笔记，在右侧运行 `/today` 等命令

### 开发者

```bash
cd metamates-app
npm ci
npm run start          # Electron 开发（推荐）
# npm run dev         # 仅 Vite 浏览器预览，无文件系统与 Agent
```

默认验证工作区为 `inits/zh`（可通过 `METAMATES_WORKSPACE` 覆盖）。

```bash
npm run check:opensource
npm run verify:round   # tsc + 单测 + 功能检查
npm run electron:build:win
```

---

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · [SECURITY.md](SECURITY.md)

---

## 工作区模板

首次初始化工作区时，会从 [`inits/zh`](inits/zh) 或 [`inits/en`](inits/en) 复制标准目录与 Agent 配置：

| 目录 | 中文 | 英文 | 说明 |
|------|------|------|------|
| `01_…` | 日记与计划 | Log and Plan | 日记、`PLAN`、**Inbox/** 剪藏缓冲（出厂为空） |
| `02_…` | 项目与知识 | Project and Knowledge | 长期项目与结构化知识 |
| `03_…` | 点滴积累 | Insights | 原子笔记与灵感 |
| `04_…` | 情报与连接 | Intelligence | 外部资料与连接 |
| `05_…` | 模板与配置 | Templates and Config | `Master_Control.md`、`2M.md`、CLI 协议 |

**Inbox 流程**：手机剪藏与临时捕获 → `01_…/Inbox/` → `/graduate` 升维为永久笔记 → 源文件移至 `Inbox/processed/`（运行时目录）。

**随模版复制的 Agent 资产**（工作区根目录）：`.claude/skills/`、`.codebuddy/skills/`、`.gemini/skills/` 及 `GEMINI.md` / `CLAUDE.md` / `CODEBUDDY.md`。

工作区内的说明见初始化后的 [`inits/zh/README.md`](inits/zh/README.md)（或英文版）。

**用户手册**：[docs/user-manual.html](docs/user-manual.html)（浏览器打开）· [docs/USER_GUIDE.md](docs/USER_GUIDE.md)

---

## 技术栈

React 19 · TypeScript · Electron 33 · CodeMirror 6 · ACP (JSON-RPC) · SQLite 会话存储 · Vite 7

---

## 文档

| 文档 | 说明 |
|------|------|
| [用户指南](docs/USER_GUIDE.md) | 操作说明 |
| [产品定位](docs/POSITIONING.md) | 边界与路线图 |
| [个人版范围](docs/PERSONAL_SCOPE.md) | 做 / 不做 |
| [开源文件清单](docs/OPEN_SOURCE.md) | 应公开 / 应 ignore |
| [打包指南](docs/PACKAGING.md) | Windows / macOS 安装包 |
| [SECURITY.md](SECURITY.md) | 漏洞报告 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献流程 |
| [API](docs/API.md) · [IPC](docs/IPC_Protocol.md) | 开发者参考 |

---

## 许可证

MIT — 见 [LICENSE](LICENSE)

---

*MetaMates · 更新 2026-07-07*
