# MetaMates

<p align="center">
  <img src="metamates-app/public/logo.png" alt="MetaMates" width="120" />
</p>

<p align="center">
  <strong>私人灵感仓库 + 思考引擎</strong><br/>
  <strong>Private inspiration vault + thinking engine</strong>
</p>

<p align="center">
  <a href="https://github.com/qdljywz/MetaMates/releases"><img src="https://img.shields.io/badge/version-0.1.0-blue" alt="version"/></a>
  <a href="metamates-app/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"/></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey" alt="platform"/>
</p>

<p align="center">
  本地 Markdown 工作区承载碎片与计划，右侧 AI 助手读写<strong>同一文件夹</strong>；<code>/today</code>、<code>/graduate</code> 等命令把成品写回笔记，而不是消失在聊天里。<br/>
  <em>Local Markdown workspace; AI assistants on the right read and write the same folder—slash commands write back to notes, not chat-only replies.</em>
</p>

---

## 界面预览 / Screenshots

> 当前为占位图；替换为 PNG 后路径不变。见 [metamates-app/docs/screenshots/README.md](metamates-app/docs/screenshots/README.md)。

| 主界面 Main UI | 思考引擎空态 Empty state | 扩展 Extensions |
|:---:|:---:|:---:|
| ![Main UI](metamates-app/docs/screenshots/main-ui.svg) | ![Empty state](metamates-app/docs/screenshots/empty-state.svg) | ![Plugins](metamates-app/docs/screenshots/plugins-settings.svg) |

---

## 我们是什么 / What we are

| ✅ 我们是 | ❌ 我们不是 |
|-----------|------------|
| **私人灵感仓库** + **思考引擎**（本地 Markdown，AI 读写同一目录） | 纯 Chat 客户端 |
| 右侧思考引擎为主入口 + 中间编辑器看成品 | 三栏「聊天 App」布局 |
| 每个 AI 助手一条持续对话 | 多会话 / 对话树 |
| 数据在本地 Markdown，可选 Vault API 剪藏 | 强制云同步 SaaS |

```text
┌──────────┬─────────────────────────┬──────────────────┐
│ 灵感仓库  │  编辑器（查看与修改成品） │  思考引擎（主入口）│
│ 文件树    │  Markdown · 双链 · 标签  │  AI + 15 slash   │
└──────────┴─────────────────────────┴──────────────────┘
```

详细定位：[metamates-app/docs/POSITIONING.md](metamates-app/docs/POSITIONING.md)

---

## v0.1.0 亮点 / Highlights

| 类别 | 内容 |
|------|------|
| **桌面核心** | Electron 应用、文件树、多标签编辑、知识图谱、全局搜索、中英文 UI |
| **思考引擎** | Gemini / Claude / CodeBuddy 等（ACP），15 条 slash 命令写回 PLAN / Inbox / 笔记 |
| **空态引导** | 根据 PLAN、日程、Ideas、Inbox 积压生成「真处境 → 真问题」（非功能菜单欢迎页） |
| **可选扩展** | `document-import`（PDF/DOCX/OCR）、`offline-speech`（Whisper 离线语音）；绿色版首次启动可自动安装 |
| **开源基线** | MIT、CI、UX 回归护栏 UX-01～38、打包 E2E、发版清单 |

完整变更：[metamates-app/CHANGELOG.md](metamates-app/CHANGELOG.md)

---

## 下载 / Download

[GitHub Releases](https://github.com/qdljywz/MetaMates/releases) 提供 Windows（`.exe`）安装包；macOS（`.dmg`）随发版工作流上传。

开发者可在 `metamates-app/` 内构建绿色便携版（QA 用）：

```bash
cd metamates-app
npm ci
npm run electron:build:win:portable
# → release/portable-green/win-unpacked/MetaMates.exe
```

---

## 快速开始 / Quick start

### 用户

1. 下载并安装 [Releases](https://github.com/qdljywz/MetaMates/releases) 中的安装包  
2. 首启向导：选择或初始化工作区文件夹（从 `inits/zh` 或 `inits/en` 复制模版）  
3. 连接至少一个 AI CLI（Gemini / Claude / CodeBuddy 等）  
4. 在右侧发消息或运行 `/today`、`/graduate` 等命令  

用户手册：[metamates-app/docs/USER_GUIDE.md](metamates-app/docs/USER_GUIDE.md) · [user-manual.html](metamates-app/docs/user-manual.html)

### 开发者

```bash
git clone https://github.com/qdljywz/MetaMates.git
cd MetaMates/metamates-app
npm ci
npm run start
```

```bash
npm run check:opensource
npm run verify:round
npm run test:ux-guardrails
```

---

## 方法论命令（15）/ Slash commands

| 日常 | `/context` `/today` `/closeday` `/schedule` `/sync` |
| 思考 | `/trace` `/connect` `/challenge` `/ghost` |
| 灵感 | `/ideas` `/graduate` `/drift` `/emerge` `/intel` |
| 规划 | `/soal`（写入 `05_…/2M.md` 进化层） |

`/intel`：桌面端先本地抓取（网页/PDF/图片等），Agent 再摘要并写回 `04_情报与连接/`。

---

## 工作区模版 / Workspace template (`inits/`)

| 目录 | 中文 | 英文 | 用途 |
|------|------|------|------|
| `01_…` | 日记与计划 | Log and Plan | 日记、PLAN、**Inbox** 剪藏缓冲 |
| `02_…` | 项目与知识 | Project and Knowledge | 长期项目 |
| `03_…` | 点滴积累 | Insights | 原子笔记 |
| `04_…` | 情报与连接 | Intelligence | 外部资料、会议 |
| `05_…` | 模板与配置 | Templates and Config | Master Control、`2M.md`、CLI 协议 |

**Inbox**：剪藏入口 → `/graduate` 升维 → 源文件归档到 `Inbox/processed/`（运行时创建）。

模版说明：[metamates-app/inits/zh/README.md](metamates-app/inits/zh/README.md)

---

## 仓库结构 / Monorepo

```text
MetaMates/
├── README.md                 ← 本页（GitHub 主页）
├── .github/workflows/        ← CI + Release Pack
└── metamates-app/            ← 产品源码、文档、插件、E2E
    ├── src/  electron/  plugins/
    ├── inits/zh  inits/en
    └── docs/
```

---

## 文档 / Documentation

| 文档 | 说明 |
|------|------|
| [metamates-app/README.md](metamates-app/README.md) | 产品介绍与开发者详情 |
| [docs/USER_GUIDE.md](metamates-app/docs/USER_GUIDE.md) | 用户操作指南 |
| [docs/POSITIONING.md](metamates-app/docs/POSITIONING.md) | 产品边界 |
| [docs/PLUGINS.md](metamates-app/docs/PLUGINS.md) | 扩展架构 |
| [docs/PACKAGING.md](metamates-app/docs/PACKAGING.md) | 打包指南 |
| [docs/RELEASE_CHECKLIST.md](metamates-app/docs/RELEASE_CHECKLIST.md) | 发版清单 |
| [docs/OPEN_SOURCE.md](metamates-app/docs/OPEN_SOURCE.md) | 开源文件清单 |
| [CONTRIBUTING.md](metamates-app/CONTRIBUTING.md) | 贡献指南 |

---

## GitHub 仓库设置（维护者复制用）

在 [github.com/qdljywz/MetaMates](https://github.com/qdljywz/MetaMates) → **Settings → General**：

**Description**

```text
MetaMates — 私人灵感仓库 + 思考引擎。Local Markdown vault + AI thinking engine (Electron). Slash commands write back to your notes. v0.1.0 MIT.
```

**Website**（可选）

```text
https://github.com/qdljywz/MetaMates#readme
```

**Topics**（建议）

```text
electron markdown knowledge-base note-taking ai-assistant gemini claude codebuddy obsidian-alternative personal-knowledge-management typescript react
```

**Social preview**：上传 1280×640 截图（可用 `docs/screenshots/main-ui.png` 就绪后导出）。

---

## 许可证 / License

MIT — [metamates-app/LICENSE](metamates-app/LICENSE)

---

<p align="center"><sub>MetaMates · 首发开源 v0.1.0 · 2026</sub></p>
