# Slash 命令 E2E 检查表（15 条）

> 前置：Metamates 已打开工作区、Agent 已连接、工作区含 `.claude` / `.codebuddy` / `.gemini` skills（首启或 `reinit-workspace` 会自动补齐）。

## 自动化（无需 GUI）

```bash
npm run test:slash          # inits 模板与 skill 文件完整性（76+ 项）
npm run test:run -- src/test/agentSlashCommands.test.ts src/test/skillResolver.test.ts
npm run slash:e2e:ready     # 检查本机 CLI、工作区 skills 是否就绪
```

## 手动 E2E（每条命令）

对 **每个要测的 CLI**（Gemini / Claude / CodeBuddy）重复下表。勾选 `[ ]` → `[x]`。

| # | 命令 | 需输入 | 点击后气泡 | 预期 AI 行为 | 写回文件（如有） | Gemini | Claude | CodeBuddy |
|---|------|--------|------------|--------------|------------------|--------|--------|-----------|
| 1 | `/context` | 否 | `/context` | 读 Master_Control + 近 7 日日记，输出上下文摘要 | 通常只读 | [ ] | [ ] | [ ] |
| 2 | `/today` | 否 | `/today` | 生成今日优先级计划 | 可选写 PLAN | [ ] | [ ] | [ ] |
| 3 | `/closeday` | 否 | `/closeday` | 日复盘、未完成结转 | 可选写日记 | [ ] | [ ] | [ ] |
| 4 | `/schedule` | 否 | `/schedule` | 本周时间分配建议 | — | [ ] | [ ] | [ ] |
| 5 | `/trace` | **是** | `/trace` + 你的主题 | 主题在库中的演变时间线 | — | [ ] | [ ] | [ ] |
| 6 | `/connect` | **是** | `/connect` + 两主题 | 跨主题连接分析 | — | [ ] | [ ] | [ ] |
| 7 | `/challenge` | **是** | `/challenge` + 观点 | 反面论证 / 挑战假设 | — | [ ] | [ ] | [ ] |
| 8 | `/ghost` | **是** | `/ghost` + 场景 | 模拟对话 / 预演 | — | [ ] | [ ] | [ ] |
| 9 | `/ideas` | 否 | `/ideas` | 从 Inbox/点滴提炼灵感 | 可选新 Zettel | [ ] | [ ] | [ ] |
| 10 | `/graduate` | 否 | `/graduate` | 成熟想法升格为项目 | 可选 `02_…` | [ ] | [ ] | [ ] |
| 11 | `/drift` | 否 | `/drift` | 发现目标与行动漂移 | — | [ ] | [ ] | [ ] |
| 12 | `/emerge` | 否 | `/emerge` | 跨笔记涌现模式 | — | [ ] | [ ] | [ ] |
| 13 | `/intel` | **是** | `/intel` + URL 或路径 | 本地抓取 + 深化情报笔记 | `04_…/*.md` | [ ] | [ ] | [ ] |
| 14 | `/sync` | 否 | `/sync` | 同步 Master_Control 与近期计划 | `Master_Control.md` | [ ] | [ ] | [ ] |
| 15 | `/soal` | **是** | `/soal` + 习惯/教训 | 写入进化层 | `2M.md` | [ ] | [ ] | [ ] |

### 输入型命令测试用例（统一）

| 命令 | 建议输入 |
|------|----------|
| `/trace` | `Metamates 产品定位` |
| `/connect` | `AI 对话` 与 `Obsidian 笔记` |
| `/challenge` | `应该把所有功能都做成聊天入口` |
| `/ghost` | `明天和产品经理由 Metamates 演示` |
| `/intel` | `https://example.com/article` 或 `04_情报与连接/sources/report.pdf` |
| `/soal` | `回复用户时使用中文，代码注释用 JSDoc` |

## 通过标准

1. **发送**：chip 点击后用户气泡显示 `/命令名`（不是整段 prompt）
2. **Skill 加载**：DevTools / 日志出现 `Loaded skill file: {name}`（无 skill 时 fallback 默认 prompt 也可接受）
3. **响应**：Agent 在 120s 内开始流式回复，无 `No backend` / `Skill file not found` 错误
4. **写回**（`/sync`、`/soal`）：对应 Markdown 文件 mtime 更新或内容含今日日期

## 新 CLI（Qwen / Codex 等）说明

检测到 CLI 后，应用会在工作区创建 **该 CLI 原生目录** 下的 skills（与 Gemini/CodeBuddy 同结构）：

| CLI | 工作区路径 |
|-----|------------|
| Qwen | `.qwen/skills/{cmd}/SKILL.md` |
| Codex | `.codex/skills/{cmd}/SKILL.md`（部分版本也读 `.agents/skills/`） |
| Claude | `.claude/skills/{cmd}.md`（扁平，历史格式） |
| 其他 | `.{backendId}/skills/{cmd}/SKILL.md` |

内容来源：inits 专用模板 → 否则从 CodeBuddy 模板合成（15 条命令语义一致）。

`read-skill-file` 查找顺序：后端专用路径 → `.metamates/skills/` →（Codex 额外 `.agents/skills/`）→ `.claude/skills/` 兼容旧工作区。

终端内原生 `/skills` 或 `$skill-name` 需该 CLI 已启用 skills 功能；Metamates 面板 Slash 始终通过读盘 + 注入 prompt 生效。

---

**文档版本**：1.0 · 2026-06-20
