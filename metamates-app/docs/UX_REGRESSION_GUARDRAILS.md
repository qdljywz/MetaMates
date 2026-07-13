# UX 回归护栏（钉死已修复行为）

用户不应成为专职测试。凡修复过的启动/工作区/进程类 UX 问题，必须满足本页规则，**禁止在无测试、无说明的情况下改回旧行为**。

**本页是唯一编号清单（UX-01～UX-38）。** 打包专区 UX-31～38 是近期补充，**不替代** UX-01～30（含启动动画 **5s 一圈 / 5.5s 进主界面**、工作区、文件树等）。

## 总览（按领域）

| 领域 | ID | 一句话 |
|------|-----|--------|
| **启动 / 首屏** | UX-01～03, UX-07 | Logo **5s** 描边动画 → **5.5s** 固定进主界面（`STARTUP_FORCE_ENTER_MS`）；**不等** Agent；`initApp` 不因 i18n 重跑 |
| **工作区 / 向导** | UX-04～05, UX-12, UX-23, UX-29 | 有库不弹选择器；欢迎向导不骚扰老用户；切库脏检查 |
| **进程 / 窗口** | UX-06, UX-07, UX-31 | Dev 不误杀 Vite；窗口先于 ACP；**打包**不误杀 renderer（灰屏） |
| **文件树 / 标签 / 编辑器** | UX-08～11, UX-14, UX-16 | 新建即见、展开保留、打开必有标签、关标签确认、幽灵标签清理 |
| **思考引擎 / 空态** | UX-13, UX-21, UX-24, UX-27, UX-33～34 | 引擎优先空态；无 Agent 引导；**不反复转圈**；后台 rethink 不弹 emptyTurn |
| **Agent / slash 写回** | UX-15, UX-17, UX-20～22, UX-25 | /today、/graduate 写盘、开标签、Inbox 归档 |
| **日历 / 时区 / 捕获** | UX-18～19 | IANA 时区与 PLAN；Vault API capture |
| **图谱 / 命令面板** | UX-26, UX-29 | 3D 图谱；命令面板切工作区 |
| **打包 / 插件** | UX-28, UX-31～38 | 空 userData 建库；portable-green；bundled 插件；PDF/Whisper |
| **技能 / 内置数据** | UX-30 | slash 技能与 `inits/zh` 同步 |

### 贡献者测试约定（原 IDE 本地规则，已写入 docs）

本仓库 **不提交** `.cursor/`。以下约定与 UX 编号同等效力：

#### 专项 E2E（每个用户可见 bug 必须有对应 spec）

修复具体 bug/UX 问题时，**不要**只重跑通用套件（如 `test:e2e:journey`）。

1. 用白话命名失败模式（如「点文件夹 → EISDIR」「caret 跳两次」）
2. 在 `e2e/` 下新增或扩展 **专项 spec**（优先按交互域分文件）
3. 先跑专项 spec 通过，再跑相关 guardrails
4. PR 中注明覆盖该问题的 spec 与命令

| 用户报告 | 专项 spec |
|----------|-----------|
| 文件夹点击读目录 | `e2e/suite/02-file-tree.spec.ts` |
| Caret 双跳 | `e2e/suite/02-file-tree.spec.ts` |
| 子文件夹新建笔记 | `e2e/suite/02-file-tree.spec.ts` 或 `06-full-journey.spec.ts` |
| 打包空态转圈 | `e2e/suite/30-packaged-empty-state-no-spinner.spec.ts` |
| 打包插件/PDF/语音 | `e2e/suite/31-packaged-plugins-functional.spec.ts` |

#### Agent 配额（默认测试不消耗 CLI）

CodeBuddy / Gemini / Claude 实连会话消耗用户配额，视为稀缺资源。

**默认（日常 / CI / 回归）**

- `npm run test:all` — 不 spawn Agent、不发起 LLM prompt；journey 仅步骤 1–24 + 28
- `test:e2e:full` / `test:e2e:journey` — 步骤 25–27 默认跳过，除非 `E2E_AGENT_LIVE=1`
- 优先 targeted、无 Agent 的 spec（`test:e2e:file-tree`、`test:ux-guardrails`）

**Opt-in Agent-live（每次验证最多一次）**

| 脚本 | 用途 |
|------|------|
| `npm run test:e2e:agent-live` | Journey 步骤 25–27 |
| `npm run test:e2e:packaged:agent-live` | 打包版 Claude 实连 |
| `npm run test:all:agent` | `test:all` + 一次 agent-live |
| `verify:stream` / `verify:cli` | 实连 ACP 冒烟（默认 CodeBuddy） |

环境变量：`E2E_AGENT_LIVE=1`、`VERIFY_AGENT_BACKEND=claude`、`VERIFY_ALL_AGENTS=1` 等见 `package.json` 脚本注释。

#### 打包修改自检（UX-31～38）

改 `main.ts`、`processTreeKill.ts`、`ensureBundledPlugins.ts`、`useEmptyStatePlanner.ts`、`AcpConnection.ts` 等打包相关文件时：

- **灰屏**：`processTreeKill.ts` 须保留 renderer/GPU 子进程
- **打包 dev URL**：`isDev` 仅 `!app.isPackaged`，不用 `NODE_ENV`
- **空态转圈**：已有 snapshot 时 silent 刷新，不 `setLoading(true)`
- **emptyTurn toast**：后台 rethink 的 `end-turn` 须 `silent: true`
- **bundled 插件**：portable-green 首次启动自动安装两扩展 zip
- 跑最小回归：`verify:acceptance-portable` / `test:e2e:packaged:empty-state` / `test:e2e:packaged:plugins`
- 发版前：`npm run acceptance:final`（非每次 PR）

### 日常 vs 发布 必跑命令

| 场景 | 命令 |
|------|------|
| **每次改 UX/启动/树/标签** | `npm run test:ux-guardrails` + 对应 targeted / guardrails E2E |
| **每次 PR（默认）** | `npm run test:all`（无 Agent live） |
| **发布 portable-green 前** | `npm run acceptance:final`（见 `docs/PACKAGING.md`） |

## 原则

1. **先可用，再完美** — 主界面必须在后台任务完成前可交互；Agent/CLI 连接一律后台进行。
2. **有上限，无死等** — 启动动画为 **LOCKED 5.5s** 合同（见 `startupUx.ts`）；其它弹窗、遮罩须有硬性超时。
3. **状态一致** — UI 遮罩/弹窗必须与真实状态一致（有工作区就不弹选择器）；**打开文件 = 树选中 + 编辑器 + 标签** 三者同步。
4. **小步可测** — 改 UX 必须带单测或 E2E；改 `startupUx.ts` / `processTreeKill.ts` 必须跑对应测试。
5. **一条 PR 一类问题** — 不顺手改无关启动/进程逻辑，避免「修 A 带出 B」。

## 已钉死的行为（不可回退）

### 启动 / 工作区 / 进程 / 编辑器（UX-01～30）

| ID | 行为 | 实现锚点 | 测试 |
|----|------|----------|------|
| UX-01 | 启动动画 **5s 一圈**（`STARTUP_SPLASH_CYCLE_S`），**5.5s** 固定进入主界面（`STARTUP_FORCE_ENTER_MS`）；预加载不得提前关 splash | `logoTrace.ts` + `startupUx.ts` → `App.tsx` mount-only timer | `startupUx.test.ts`, `e2e/startup-ux-guardrails.spec.ts` |
| UX-02 | **不等待** Agent 连接才关启动动画 | `skipAgentWait: true` | `startupUx.test.ts` |
| UX-03 | `changeLanguage` 等 **不得** 取消 splash 退出 | `initApp` 使用 `[]` deps；`setLoading(false)` 无条件 | 见 UX-01 E2E |
| UX-04 | 工作区已恢复时 **不弹**「选择工作区」 | `shouldOpenWorkspacePicker` | `startupUx.test.ts`, E2E |
| UX-05 | 磁盘上路径有效时 **自动关闭** 选择器 | `shouldCloseWorkspacePicker` + `useEffect` | `startupUx.test.ts`, E2E |
| UX-06 | Dev 启动 **不得** 误杀同会话 Vite；打包清理 **不得** 误杀 renderer 子进程（见 UX-31） | `processTreeKill.ts` 祖先链 + `descendantPids` | `processTreeKill.test.ts`, UX-31 便携验收 |
| UX-07 | Electron 窗口 **先于** ACP 全量初始化创建 | `main.ts` `createWindow()` 提前 | 手工 + E2E shell 可见 |
| UX-08 | 在子文件夹 **新建笔记/文件夹** 后，文件树 **立即显示** 新项 | `fileTreeUx.ts` + `FileTreePanel.refreshAfterCreateInFolder` | `fileTreeUx.test.ts`, `e2e/file-tree-ux-guardrails.spec.ts` |
| UX-09 | 全树刷新时 **保留** 已展开子目录内容（不只刷根目录） | `refreshExpandedTree` + `getExpandedDirsToRehydrate` | `fileTreeUx.test.ts`, E2E UX-08 |
| UX-10 | **打开文件必有标签**；`SET_CURRENT_FILE` 自动补标签 | `appStore.ts` `SET_CURRENT_FILE` / `ADD_TAB` | `appStore.test.ts`, E2E UX-08 |
| UX-11 | Wiki 链接选择器 **仅显示用户笔记**（与文件树同规则） | `filterMarkdownFilesForFileTree` → `Editor.formatWikiLink` | `vaultPaths.test.ts`, `e2e/editor-link-ux-guardrails.spec.ts` |
| UX-12 | **有工作区记录的老用户不弹**欢迎向导；未选文件夹时 **不堆叠** 提示 | `shouldShowWelcomeWizard` + `WelcomeWizard` | `startupUx.test.ts` |
| UX-13 | 关完所有标签后显示 **引擎优先空态**（个性化问句 + 10min 缓存刷新）；连接期间不长时间转圈（见 UX-33） | `emptyStatePlanner.ts` + `EditorEmptyState` + `useEmptyStatePlanner.ts` | `emptyStatePlanner.test.ts`, `e2e/suite/03-editor.spec.ts`, `test:e2e:packaged:empty-state` |
| UX-14 | **未保存**关标签须确认；取消保留标签 | `tabClose.ts` + `TabBar` | `e2e/suite/14-editor-trust.spec.ts` |
| UX-15 | slash 写回成功后 **自动打开**目标文件标签 | `openSlashWriteback.ts` + `AgentChatPanel` | `openSlashWriteback.test.ts`, `e2e/suite/14-editor-trust.spec.ts` |
| UX-16 | 磁盘上已删文件 **自动关闭**幽灵标签 | `openSlashWriteback.ts` + `App.tsx` vault listener | `openSlashWriteback.test.ts`, `e2e/suite/14-editor-trust.spec.ts` |
| UX-17 | `/graduate` 成功后 Inbox 源归档到 `processed/` | `graduateInboxArchive.ts` + `AgentChatPanel` | `graduateInboxArchive.test.ts`, `e2e/suite/14-editor-trust.spec.ts` |
| UX-18 | 设置 **IANA 时区** 后日历「今日」与 PLAN 路径一致 | `resolveUserTimezone` + `DailyNoteCalendar` + `SettingsModal` | `paths.timezone.test.ts`, `e2e/suite/15-timezone-calendar.spec.ts` |
| UX-19 | Vault API **POST /api/capture** 写入 Inbox 且文件树可见 | `electron/vaultApi/server.ts` | `e2e/suite/16-vault-capture.spec.ts` |
| UX-20 | CodeBuddy **/today** 写回 PLAN 并自动打开编辑器标签 | `AgentChatPanel` + `openSlashWriteback.ts` | `e2e/suite/17-agent-slash-writeback.spec.ts`（`test:e2e:agent-writeback`，需 CLI） |
| UX-21 | **无 CLI** 时思考引擎显示安装引导、空态标注 no-agent | `AgentCliInstallGuide` + `METAMATES_E2E_NO_AGENTS` | `e2e/suite/18-startup-no-cli.spec.ts` |
| UX-22 | CodeBuddy **/graduate** 写回 + Inbox 源归档 `processed/` | `graduateInboxArchive.ts` + `AgentChatPanel` | `e2e/suite/19-agent-graduate-live.spec.ts`（`test:e2e:graduate-live`，需 CLI） |
| UX-23 | **切换工作区**前有未保存标签须确认；取消则留在当前库 | `tabClose.ts` + `App.tsx` / `Sidebar.tsx` | `tabClose.test.ts`, `e2e/suite/20-workspace-dirty-guard.spec.ts` |
| UX-24 | 空态 **无 Agent** 主按钮打开 CLI 安装引导（非设置页） | `EditorEmptyState` + `agentBridge.openCliInstall` | `e2e/suite/18-startup-no-cli.spec.ts` |
| UX-25 | `/graduate` 归档后 **toast** 提示移至 `processed/` | `AgentChatPanel` + `writeback.inboxArchived` | `graduateInboxArchive.test.ts`（归档逻辑）+ agent-live E2E |
| UX-26 | 图谱 **3D 模式** 可切换且 WebGL 画布可见 | `GraphView3D` + `graph-3d-switch` | `e2e/suite/12-graph-interaction.spec.ts`（`test:e2e:graph`） |
| UX-27 | 空态「安装助手」打开 **CLI 安装面板** | `EditorEmptyState` + `CliInstallPanel` | `e2e/suite/18-startup-no-cli.spec.ts` |
| UX-28 | 打包 exe **空 userData** 可创建 session DB | `verify-fresh-packaged-user.mjs` | `npm run verify:fresh-user`（release-pack CI） |
| UX-29 | 命令面板可搜索 **切换工作区** | `CommandPalette` + `selectWorkspace` | `e2e/suite/10-command-palette.spec.ts` |
| UX-30 | 内置 slash 技能与 `inits/zh` **一致** | `verify-inits-sync.mjs` | `npm run verify:inits-sync`（`electron:pack:check`） |

### 打包版 / portable-green（不可回退）

| ID | 行为 | 实现锚点 | 测试 |
|----|------|----------|------|
| UX-31 | 打包版启动 **≥12s 不灰屏**（进程清理须保留 renderer/GPU 子进程） | `processTreeKill.ts` → `shouldKeepStaleProcess` + `collectDescendantPids` | `npm run verify:acceptance-portable` |
| UX-32 | 打包版 **仅用** `!app.isPackaged` 判 dev，**不得**用 `NODE_ENV=development` 加载 Vite URL | `electron/main.ts` `isDev` | `npm run test:e2e:packaged`（smoke） |
| UX-33 | 空态：`agentHint` 变化与 `empty-state-updated` 在已有 snapshot 时 **silent 刷新**，CLI 连接期间不反复转圈 | `useEmptyStatePlanner.ts` → `runApply(..., { silent: true })` | `npm run test:e2e:packaged:empty-state` |
| UX-34 | 后台空态 rethink 的 `end-turn` 须带 `silent: true`，**不得**弹「助手已完成回复但没有可见输出」 | `AcpConnection.ts` `emitEndTurn` + `AgentChatPanel.tsx` `handleEndTurn` | 手工；改后跑 `test:e2e:packaged:empty-state` |
| UX-35 | portable 首次启动 **自动安装** document-import + offline-speech（来自 `resources/plugin-zips/`） | `ensureBundledPlugins.ts` + `main.ts` | `npm run verify:acceptance-portable`、`npm run test:e2e:packaged:plugins` |
| UX-36 | 打包 E2E 模拟新用户装插件时须设 `METAMATES_E2E_ALLOW_BUNDLED_PLUGINS=1`（默认 E2E 仍跳过） | `ensureBundledPlugins.ts` + `launchElectron.ts` `freshUserData` | `npm run test:e2e:packaged:plugins` |
| UX-37 | 打包 E2E 解析「今日」**禁止** renderer 动态 `import('/src/...')` | `e2e/helpers/agentLiveClaude.ts` `getEffectiveTodayFromApp` | `npm run test:e2e:packaged:agent-live`（opt-in，耗 CLI 配额） |
| UX-38 | 绿色便携版 `resources/plugin-zips/` 须含 document-import + offline-speech 两个 zip | `electron-builder.yml` + `verify-portable-pack-prereqs.mjs` | `npm run electron:build:win:portable` 前置校验 |

改打包/空态/插件相关文件前，先读本页 **UX-31～38** 与上文「打包修改自检」。

## 修改前自检（Agent / 开发者）

- [ ] 是否动到 `App.tsx` 启动、`startupGate.ts`、`processTreeKill.ts`、`main.ts` 窗口时机？
- [ ] 是否动到 `FileTreePanel.tsx`、`appStore.ts`（标签/当前文件）、`Editor.tsx`（链接选择器）、`vaultPaths.ts`？
- [ ] 是否动到 `useEmptyStatePlanner.ts`、`ensureBundledPlugins.ts`、`AcpConnection.ts`（打包/空态/插件）？
- [ ] 若动到，是否更新/通过 `test:ux-guardrails` 中对应单测？
- [ ] 文件树/标签/链接 UX 改动是否跑 `e2e/file-tree-ux-guardrails.spec.ts` 与 `e2e/editor-link-ux-guardrails.spec.ts`？
- [ ] 打包/进程/空态/插件改动是否跑对应 **packaged spec**（见上表 UX-31～38）？
- [ ] 是否说明「为何不会重现用户报告的卡死/重复弹窗/灰屏」？

## 命令

```bash
npm run test:ux-guardrails
npm run test:e2e:ux-guardrails
```

**打包版 / 发布前（较慢，不要绑进每次 PR）：**

```bash
npm run acceptance:final          # 文档导入 + 便携验收 + 空态 + 插件功能
npm run test:e2e:packaged:full      # 全量打包 E2E（~16min）
npm run overnight:acceptance        # 单元 + 便携 + packaged full
```

**单点回归（改哪跑哪）：**

```bash
npm run verify:acceptance-portable       # UX-31、UX-35
npm run test:e2e:packaged:empty-state    # UX-33、UX-34
npm run test:e2e:packaged:plugins        # UX-35、UX-36
npm run verify:document-import-real      # PDF/DOCX 导入管线
```

`test:ux-guardrails` 覆盖启动、进程、文件树、标签、链接选择器的 **单测**。  
`test:e2e:ux-guardrails` 覆盖 UX-01/04/08/10/11 的 **Electron E2E**（需 Vite :3000）。

E2E 默认工作区为 **`e2e/.workspace/vault`**（首次从 `inits/zh` 复制，gitignore；**不修改** `inits/zh` 模版本身）。可通过 `METAMATES_WORKSPACE` 覆盖。测试仅在 `02_项目与知识/_MetaMates_E2E/` 下创建/删除以 `e2e-` 开头的文件。详见 `e2e/E2E_WORKSPACE.md`。

## 新增护栏流程

1. 把策略收到 `src/utils/*.ts` 或 `electron/**/*.ts`（可单测的纯函数）。
2. 写 `src/test/*.test.ts` 或 `e2e/suite/*.spec.ts`（打包行为优先 packaged config）。
3. 关键路径补 `e2e/*-guardrails.spec.ts` 或 `e2e/suite/3x-packaged-*.spec.ts`。
4. 在本表增加一行 ID（UX-31 起为打包专区），并在 PR 描述中引用。
5. 若涉及 `main.ts` / 插件 / 空态，同步更新本页 UX 表与「打包修改自检」小节。
