# MetaMates 工作区

> **私人灵感仓库** — 本地 Markdown 文件夹，由 [MetaMates](https://github.com/qdljywz/MetaMates) 桌面应用读写。碎片、日记、剪藏先放这里；**右侧引擎**（AI 对话 + slash 命令）读过仓库后，把计划与洞察写回这些文件。

---

## 在 MetaMates 里怎么用

1. **打开工作区**：在 MetaMates 中选择本文件夹（首启向导会自动从 `inits/zh` 模板复制结构）。
2. **从引擎开始**：右侧选 AI，发消息或点 `/today` 等命令——这是主入口。
3. **看成品**：引擎写回的文件可在中间编辑器打开；日历可打开当日日记/PLAN。
4. **手机剪藏**：开启 Vault API 后，内容写入 `01_日记与计划/Inbox/`。
5. **时区**：在 MetaMates **设置**中配置 IANA 时区（如 `Asia/Shanghai`），日记、PLAN 与 Agent 日期以此为准。
6. **空态引导**：关掉所有编辑器标签后，中间「思考引擎」会根据 PLAN、日程、Ideas 与 Inbox 积压提出贴合当前处境的问题。

每个 CLI **保持一条持续对话**；切换 Agent 不会丢失各自的历史。

---

## 目录结构

### 📂 `01_日记与计划`

| 文件 | 用途 |
|------|------|
| `Daily_Note.md` | 日记模板（修身、随手记、闪念） |
| `Daily_Plan.md` | 每日计划模板（P0、时间块） |
| `YYYY-MM-DD.md` | 当日日记 |
| `YYYY-MM-DD PLAN.md` | 当日主控计划 |
| `Inbox/` | 手机剪藏与临时捕获（出厂为空；`/graduate` 成功后源文件归档到 `Inbox/processed/`） |

### 📂 `02_项目与知识`

长期项目、PRD、方案与结构化知识。种子模板：`Project_Homepage.md`。

### 📂 `03_点滴积累`

原子化笔记与灵感碎片。种子模板：`Zettel_Note.md`。

### 📂 `04_情报与连接`

外部资料、会议、人脉与情报。可参考 `Intelligence_Home.md`。

### 📂 `05_模板与配置`

| 文件 | 用途 |
|------|------|
| `Master_Control.md` | 全局战略指挥塔（优先阅读） |
| `2M.md` | 进化层：用户 DNA、战术协议、学习日志 |
| `AI_Commands_Prompt.md` | 15 条方法论 slash 命令说明 |
| `GEMINI.md` / `Claude.md` / `CodeBuddy.md` | 各 CLI 协作协议 |
| `.claude/skills/`、`.codebuddy/skills/`、`.gemini/skills/` | 各 Agent 读取的 Skill 文件 |

---

## 方法论命令（15）

在 MetaMates **右侧 Agent 面板**使用（无需手动敲完整 prompt）：

- **日常**：`/context` `/today` `/closeday` `/schedule` `/sync`
- **思考**：`/trace` `/connect` `/challenge` `/ghost`
- **灵感**：`/ideas` `/graduate` `/drift` `/emerge` `/intel`
- **规划**：`/soal` → 更新本目录下的 `2M.md`

> `/intel`：粘贴链接或文档路径，桌面端抓取后 Agent 深化摘要，写入 `04_情报与连接/`。

---

## 建议工作流

1. 晨间：日历打开今日 PLAN，运行 `/today`
2. 日间：在 `01_…` 记日记，在项目目录推进笔记
3. 晚间：运行 `/closeday`，同步 `Master_Control.md`
4. 有教训或习惯固化时：运行 `/soal` 写入 `2M.md`

---

**工作区模板版本**：1.4 · 与 MetaMates 桌面应用同步 · 2026-07-07
