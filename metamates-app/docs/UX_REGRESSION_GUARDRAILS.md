# UX 回归护栏（钉死已修复行为）

用户不应成为专职测试。凡修复过的启动/工作区/进程类 UX 问题，必须满足本页规则，**禁止在无测试、无说明的情况下改回旧行为**。

## 原则

1. **先可用，再完美** — 主界面必须在后台任务完成前可交互；Agent/CLI 连接一律后台进行。
2. **有上限，无死等** — 启动动画、弹窗、遮罩必须有硬性超时（当前：4s）。
3. **状态一致** — UI 遮罩/弹窗必须与真实状态一致（有工作区就不弹选择器）；**打开文件 = 树选中 + 编辑器 + 标签** 三者同步。
4. **小步可测** — 改 UX 必须带单测或 E2E；改 `startupUx.ts` / `processTreeKill.ts` 必须跑对应测试。
5. **一条 PR 一类问题** — 不顺手改无关启动/进程逻辑，避免「修 A 带出 B」。

## 已钉死的行为（不可回退）

| ID | 行为 | 实现锚点 | 测试 |
|----|------|----------|------|
| UX-01 | 启动动画 **≤4s** 必须进入主界面 | `startupUx.ts` → `App.tsx` mount-only timer | `startupUx.test.ts`, `e2e/startup-ux-guardrails.spec.ts` |
| UX-02 | **不等待** Agent 连接才关启动动画 | `skipAgentWait: true` | `startupUx.test.ts` |
| UX-03 | `changeLanguage` 等 **不得** 取消 splash 退出 | `initApp` 使用 `[]` deps；`setLoading(false)` 无条件 | 见 UX-01 E2E |
| UX-04 | 工作区已恢复时 **不弹**「选择工作区」 | `shouldOpenWorkspacePicker` | `startupUx.test.ts`, E2E |
| UX-05 | 磁盘上路径有效时 **自动关闭** 选择器 | `shouldCloseWorkspacePicker` + `useEffect` | `startupUx.test.ts`, E2E |
| UX-06 | Dev 启动 **不得** 误杀同会话 Vite | `processTreeKill.ts` 祖先链保留 | `processTreeKill.test.ts` |
| UX-07 | Electron 窗口 **先于** ACP 全量初始化创建 | `main.ts` `createWindow()` 提前 | 手工 + E2E shell 可见 |
| UX-08 | 在子文件夹 **新建笔记/文件夹** 后，文件树 **立即显示** 新项 | `fileTreeUx.ts` + `FileTreePanel.refreshAfterCreateInFolder` | `fileTreeUx.test.ts`, `e2e/file-tree-ux-guardrails.spec.ts` |
| UX-09 | 全树刷新时 **保留** 已展开子目录内容（不只刷根目录） | `refreshExpandedTree` + `getExpandedDirsToRehydrate` | `fileTreeUx.test.ts`, E2E UX-08 |
| UX-10 | **打开文件必有标签**；`SET_CURRENT_FILE` 自动补标签 | `appStore.ts` `SET_CURRENT_FILE` / `ADD_TAB` | `appStore.test.ts`, E2E UX-08 |
| UX-11 | Wiki 链接选择器 **仅显示用户笔记**（与文件树同规则） | `filterMarkdownFilesForFileTree` → `Editor.formatWikiLink` | `vaultPaths.test.ts`, `e2e/editor-link-ux-guardrails.spec.ts` |
| UX-12 | **有工作区记录的老用户不弹**欢迎向导；未选文件夹时 **不堆叠** 提示 | `shouldShowWelcomeWizard` + `WelcomeWizard` | `startupUx.test.ts` |
| UX-13 | 关完所有标签后显示 **引擎优先空态**（个性化问句 + 10min 缓存刷新） | `emptyStatePlanner.ts` + `EditorEmptyState` | `emptyStatePlanner.test.ts`, `e2e/suite/03-editor.spec.ts` |
| UX-14 | **未保存**关标签须确认；取消保留标签 | `tabClose.ts` + `TabBar` | `e2e/suite/14-editor-trust.spec.ts` |
| UX-15 | slash 写回成功后 **自动打开**目标文件标签 | `openSlashWriteback.ts` + `AgentChatPanel` | `openSlashWriteback.test.ts`, `e2e/suite/14-editor-trust.spec.ts` |
| UX-16 | 磁盘上已删文件 **自动关闭**幽灵标签 | `openSlashWriteback.ts` + `App.tsx` vault listener | `openSlashWriteback.test.ts`, `e2e/suite/14-editor-trust.spec.ts` |
| UX-17 | `/graduate` 成功后 Inbox 源归档到 `processed/` | `graduateInboxArchive.ts` + `AgentChatPanel` | `graduateInboxArchive.test.ts`, `e2e/suite/14-editor-trust.spec.ts` |
| UX-18 | 设置 **IANA 时区** 后日历「今日」与 PLAN 路径一致 | `resolveUserTimezone` + `DailyNoteCalendar` + `SettingsModal` | `paths.timezone.test.ts`, `e2e/suite/15-timezone-calendar.spec.ts` |
| UX-19 | Vault API **POST /api/capture** 写入 Inbox 且文件树可见 | `electron/vaultApi/server.ts` | `e2e/suite/16-vault-capture.spec.ts` |
| UX-20 | CodeBuddy **/today** 写回 PLAN 并自动打开编辑器标签 | `AgentChatPanel` + `openSlashWriteback.ts` | `e2e/suite/17-agent-slash-writeback.spec.ts`（`test:e2e:agent-writeback`，需 CLI） |
| UX-21 | **无 CLI** 时 Agent 面板显示安装引导、空态标注 no-agent | `AgentCliInstallGuide` + `METAMATES_E2E_NO_AGENTS` | `e2e/suite/18-startup-no-cli.spec.ts` |
| UX-22 | CodeBuddy **/graduate** 写回 + Inbox 源归档 `processed/` | `graduateInboxArchive.ts` + `AgentChatPanel` | `e2e/suite/19-agent-graduate-live.spec.ts`（`test:e2e:graduate-live`，需 CLI） |
| UX-23 | **切换工作区**前有未保存标签须确认；取消则留在当前库 | `tabClose.ts` + `App.tsx` / `Sidebar.tsx` | `tabClose.test.ts`, `e2e/suite/20-workspace-dirty-guard.spec.ts` |
| UX-24 | 空态 **无 Agent** 主按钮打开 CLI 安装引导（非设置页） | `EditorEmptyState` + `agentBridge.openCliInstall` | `e2e/suite/18-startup-no-cli.spec.ts` |
| UX-25 | `/graduate` 归档后 **toast** 提示移至 `processed/` | `AgentChatPanel` + `writeback.inboxArchived` | `graduateInboxArchive.test.ts`（归档逻辑）+ agent-live E2E |
| UX-26 | 图谱 **3D 模式** 可切换且 WebGL 画布可见 | `GraphView3D` + `graph-3d-switch` | `e2e/suite/12-graph-interaction.spec.ts`（`test:e2e:graph`） |
| UX-27 | 空态「安装助手」打开 **CLI 安装面板** | `EditorEmptyState` + `CliInstallPanel` | `e2e/suite/18-startup-no-cli.spec.ts` |
| UX-28 | 打包 exe **空 userData** 可创建 session DB | `verify-fresh-packaged-user.mjs` | `npm run verify:fresh-user`（release-pack CI） |
| UX-29 | 命令面板可搜索 **切换工作区** | `CommandPalette` + `selectWorkspace` | `e2e/suite/10-command-palette.spec.ts` |
| UX-30 | 内置 slash 技能与 `inits/zh` **一致** | `verify-inits-sync.mjs` | `npm run verify:inits-sync`（`electron:pack:check`） |

## 修改前自检（Agent / 开发者）

- [ ] 是否动到 `App.tsx` 启动、`startupGate.ts`、`processTreeKill.ts`、`main.ts` 窗口时机？
- [ ] 是否动到 `FileTreePanel.tsx`、`appStore.ts`（标签/当前文件）、`Editor.tsx`（链接选择器）、`vaultPaths.ts`？
- [ ] 若动到，是否更新/通过 `test:ux-guardrails` 中对应单测？
- [ ] 文件树/标签/链接 UX 改动是否跑 `e2e/file-tree-ux-guardrails.spec.ts` 与 `e2e/editor-link-ux-guardrails.spec.ts`？
- [ ] 是否说明「为何不会重现用户报告的卡死/重复弹窗」？

## 命令

```bash
npm run test:ux-guardrails
npm run test:e2e:ux-guardrails
```

`test:ux-guardrails` 覆盖启动、进程、文件树、标签、链接选择器的 **单测**。  
`test:e2e:ux-guardrails` 覆盖 UX-01/04/08/10/11 的 **Electron E2E**（需 Vite :3000）。

E2E 默认使用 **`E:\MyM2`**（或 `METAMATES_WORKSPACE`），仅在 `02_项目与知识/_MetaMates_E2E/` 下创建/删除以 `e2e-` 开头的测试文件，**不删除用户其他笔记**。应用配置使用 `%TEMP%\metamates-e2e-userdata`（**不是你的日常 AppData**），并预置 `workspacePath` + 跳过欢迎向导/YOLO，**不得**再弹出首次使用界面。

## 新增护栏流程

1. 把策略收到 `src/utils/*.ts`（可单测的纯函数）。
2. 写 `src/test/*.test.ts`。
3. 关键路径补 `e2e/*-guardrails.spec.ts`。
4. 在本表增加一行 ID，并在 PR 描述中引用。
