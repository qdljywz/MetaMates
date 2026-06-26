# Metamates

> **本地优先的个人知识操作系统** — Markdown Vault 是主场，Agent 是执行层。  
> Local-first personal knowledge OS — your vault is home; agents execute in the same workspace.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)

---

## 一句话 / One-liner

**Metamates** 是安装在本机的 **Electron 桌面应用**（不是网页）：用 Obsidian 式 Markdown 工作区承载思考与规划，通过 **ACP** 连接 Gemini / Claude / CodeBuddy 等 CLI，让 AI **读写同一文件夹**——`/today`、`/trace` 等命令把结果写回笔记，而不是消失在聊天里。

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

### 用户

1. 运行 `Metamates.exe`（**桌面窗口**，不是浏览器）
2. 首启向导：选择/初始化工作区文件夹
3. 安装并连接至少一个 CLI Agent
4. 在中间写笔记，在右侧运行 `/today` 等命令

### 开发者

```bash
cd metamates-app
npm install
npm run start          # Electron 开发（推荐）
# npm run dev         # 仅 Vite 浏览器预览，无文件系统与 Agent
```

```bash
npm run verify:round   # tsc + 单测 + 功能检查
npm run electron:build:win
```

---

## 工作区模板

首次初始化工作区时，会从 [`inits/zh`](inits/zh) 或 [`inits/en`](inits/en) 复制标准目录：

- `01_…` 日记与计划（含 Inbox）
- `02_…` 项目与知识
- `03_…` 点滴积累
- `04_…` 情报与连接
- `05_…` 模板与配置（`Master_Control.md`、`2M.md`、CLI Skills）

工作区内的说明见初始化后的 `README.md`。

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
| [开源原则备忘](docs/OPEN_SOURCE.md) | 未来从本仓库导出，不维护双副本 |
| [API](docs/API.md) · [IPC](docs/IPC_Protocol.md) | 开发者参考 |

---

## 许可证

MIT — 见 [LICENSE](LICENSE)

---

*Metamates · 更新 2026-06-20*
