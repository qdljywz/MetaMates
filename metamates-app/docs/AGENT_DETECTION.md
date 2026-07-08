# Agent CLI 自动发现

> 产品行为：用户安装 CLI 后打开 MetaMates，右侧 Agent 工具栏自动出现对应图标，**无需手动配置**。

---

## 架构

```text
app.whenReady
    └─ acpDetector.initialize()     # 主进程预热
           └─ getEnhancedEnv()       # 合并 PATH
           └─ 并行扫描 acpRegistry
           └─ 缓存 detectedAgents

Renderer Agent 面板
    └─ get-detected-agents / refreshAgents
           └─ 返回缓存或强制重扫
```

## 代码位置

| 模块 | 路径 |
|------|------|
| CLI 注册表 | `electron/shared/acpRegistry.ts` |
| 环境增强 | `electron/shellEnv.ts` |
| 检测器单例 | `electron/acp/AcpDetector.ts` |
| IPC | `electron/acp/ipcHandlers.ts` → `get-detected-agents` |
| 子进程启动 | `electron/acp/acpSpawn.ts` + `AcpConnection.ts` |

## 检测策略（按顺序）

1. **PATH** — `where` / `which`，Windows 回退 `Get-Command`（支持 `.ps1` shim）
2. **npm 全局 bin** — 扫描 `npm` 目录下是否存在 `cmd` / `cmd.cmd`
3. **npm 全局包** — `npm list -g <package>`（包装了但 PATH 未刷新时仍可发现）

命中后通过 `resolveSpawnConfig()` 生成正确的 `cliPath` + `acpArgs`（例如 Codex 走 `npx @zed-industries/codex-acp`，Goose 走 `goose acp`）。

## 支持的 CLI（个人版）

Gemini、CodeBuddy、Claude、Qwen、Codex、iFlow、Goose、Augment、Kimi、OpenCode、Droid、Copilot、Qoder、Vibe、Nanobot、Cursor Agent；另可选 Ollama 本地桥接。

新增 CLI：在 `acpRegistry.ts` 增加一条 `detectByDefault: true` 的定义即可，检测与安装面板自动对齐。

### Agent 图标

| 项 | 说明 |
|----|------|
| 品牌 SVG | `public/assets/{backendId}.svg`，Gemini/Claude 等 5 个从 `src/assets/logos/` 同步 |
| 颜色 / 首字母 | `acpRegistry.ts` → `LOGO_COLORS` |
| 统一逻辑 | `electron/shared/agentLogos.ts` |
| 生成缺失图标 | `npm run logos:agents`（打包前 `npm run icons` 会自动执行） |
| CI 校验 | `npm run verify:agent-logos`（acceptance 门禁） |

工具栏与 CLI 安装面板均通过 `backendId` → `./assets/{backendId}.svg` 显示；文件缺失时回退为彩色首字母。

## 验证

```bash
cd metamates-app
npm run electron:compile
npx tsx -e "(async()=>{const {acpDetector}=await import('./electron/acp/AcpDetector.ts');await acpDetector.initialize(true);console.log(acpDetector.getDetectedAgents().map(a=>a.backend).join(', '))})()"
npm run test:run -- src/test/cli-detection.test.ts
node scripts/full-functional-test.mjs --skip-build
```

## 与 AionUi 的关系

检测思路对齐 AionUi（注册表 + enhanced PATH + Windows shim），MetaMates 额外增加 npm 全局包回退，并将结果接入「Vault 主场 + 单 Agent 单对话」的执行层 UI，而非聊天 App 三栏布局。

**参考源码（勿放入 MetaMates 仓库内，避免 Cursor 锁定 `app.asar`）：**

```powershell
git clone --depth 1 https://github.com/iOfficeAI/AionUi.git E:\Trae\AionUi-source
```

对照重点：`AcpDetector`、`acpRegistry`、MCP 同步、ACP spawn 参数。

---

## Skills 同步（与 CLI 检测联动）

| 时机 | 行为 |
|------|------|
| `detectInstalledClis(force)` | 对每个已检测 backend 调用 `ensureSkillsForDetectedBackend` |
| `set-workspace-path` | 若缓存为空则 force 重扫；再 `syncAllWorkspaceSkills` |
| `acp-refresh-agents` | 重扫 + 为新 CLI warmup + skills（在 detect 内） |
| `sync-workspace-skills`（设置按钮） | force 重扫 + 全量 sync |
| `init-workspace` | **不**复制 dot 目录；skills 留给上述路径 |

工作区目录约定：`.{backendId}/skills/{cmd}/SKILL.md`（Claude 例外为 flat `.md`）。

## 多对话协同改 CLI 时的边界

避免两个 Cursor 会话同时改同一文件，建议分工：

| 区域 | 负责内容 |
|------|----------|
| `electron/shared/acpRegistry.ts`、`AcpDetector.ts`、`acpSpawn.ts` | 注册表、PATH 检测、spawn 参数 |
| `electron/acp/ipcHandlers.ts` | IPC、warmup、refresh-agents（改前看 diff） |
| `electron/workspaceSkills.ts`、`skillLayouts.ts` | Skills 模板与按需 provision |
| `src/components/CliInstallPanel.tsx` | 安装 UI（安装后应 `refreshAgents`） |
| `src/components/AgentChatPanel.tsx` | 连接状态、warmup UI、slash 读 skill |

**合并前**：`git diff electron/acp electron/cliDetection.ts` 确认无冲突。
