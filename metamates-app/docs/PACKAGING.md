# MetaMates 打包指南（Windows / macOS）

MetaMates 使用 [electron-builder](https://www.electron.build/) 生成安装包：

| 平台 | 产物 | 命令 |
|------|------|------|
| Windows x64 | `release/MetaMates-<version>-win-x64.exe` (NSIS) | `npm run electron:build:win` |
| 文档导入扩展 | `release/MetaMates-document-import-<version>-win-x64.zip` | `npm run plugin:document-import:pack` |
| macOS arm64 / x64 | `release/MetaMates-<version>-mac-<arch>.dmg` | `npm run electron:build:mac` |
| 本地调试目录（不打包） | `release/win-unpacked` 等 | `npm run electron:build:dir` |
| **绿色便携版（验收用）** | `release/portable-green/win-unpacked/` + `resources/plugin-zips/*.zip` | `npm run electron:build:win:portable` |

## 绿色便携版（portable-green）

带 bundled 插件 zip，首次启动自动安装 **文档导入** + **离线语音**（约 3～4 分钟，全新 userData）。

```powershell
cd metamates-app
npm run electron:build:win:portable
# 产物：release/portable-green/win-unpacked/MetaMates.exe
```

开发中快速热更新 frontend + 主进程（**非正式发布路径**）：

```powershell
npm run build && npm run electron:compile && npm run patch:portable-dist
```

钉死的打包行为见 **`docs/UX_REGRESSION_GUARDRAILS.md` UX-31～UX-38**（打包专区，含灰屏、空态、插件自动安装）。

## 发布前验收（必须事项）

在 tag / GitHub Release **之前**跑（约 15～25 分钟，不要绑进每次 PR）：

```powershell
cd metamates-app
npm run acceptance:final
```

`acceptance:final` 包含：真实 PDF/DOCX 导入、offline-speech 冒烟、便携版 12s 不灰屏 + 插件自动安装、打包空态 spinner、打包 PDF + Whisper 功能 E2E。

可选更全：

```powershell
npm run test:e2e:packaged:full    # ~16min 全量打包 E2E
npm run overnight:acceptance        # 单元 + 便携 + packaged full
```

**改特定区域时只跑对应项：**

| 改动区域 | 命令 |
|----------|------|
| 进程清理 / 灰屏 | `npm run verify:acceptance-portable` |
| 空态转圈 / emptyTurn toast | `npm run test:e2e:packaged:empty-state` |
| 插件自动安装 / PDF / 语音 | `npm run test:e2e:packaged:plugins` |
| 文档导入管线 | `npm run verify:document-import-real` |
| Agent 打包 E2E（耗配额） | `npm run test:e2e:packaged:agent-live` |

日常 PR 仍用 `npm run test:ux-guardrails` + 相关 targeted spec（见 `docs/UX_REGRESSION_GUARDRAILS.md`）。

## 环境要求

- **Node.js 20+**、npm
- **Windows 打包**：在 Windows 上执行（需 NSIS，electron-builder 会自动下载）
- **macOS 打包**：必须在 **macOS** 上执行（生成 `.dmg` / `.icns`）
- 原生模块：`better-sqlite3` — 打包前会自动 `npm run rebuild:native`
- **体积优化**：
  - `electronLanguages` 仅保留 `en-US` / `zh-CN`
  - UI 库（React/Ant Design/Three.js 等）在 **`devDependencies`**，由 Vite 打进 `dist/`；**`dependencies` 仅主进程**（SQLite 等）
- **Whisper / ONNX 等重型语音依赖**在可选扩展 `offline-speech` 中，不进入主安装包
  - 打包后自动跑 `npm run electron:pack:verify-asar`，防止 UI 依赖再次进入 `app.asar`
  - 内置终端（`node-pty`）已移除；Gemini OAuth 仍用系统外部终端

## 一键打包

```bash
cd metamates-app
npm ci
npm run electron:build:win   # 或 :mac
```

流水线步骤（`electron:build`）：

1. `npm run build` — 前端 Vite 产物 → `dist/`
2. `npm run electron:compile` — 主进程 TS → `dist-electron/`
3. `npm run icons` — 从 `build/icon.png` 生成 `.ico` / `.icns`
4. `npm run rebuild:native` — Electron ABI 原生模块
5. `npm run electron:pack:check` — 校验 inits、bridge 脚本、图标等
6. `electron-builder` — 输出到 `release/`
7. `npm run electron:pack:verify-asar` — 确认 `app.asar` 不含 React/Ant Design 等重复依赖

发布到 GitHub 时还需（见 `release-pack.yml`）：

```bash
npm run whisper:download-model
npm run plugin:offline-speech:pack
npm run plugin:document-import:pack
```

并将主安装包与两个扩展 zip 一并上传到 Release。

## 打包进安装包的资源

通过 `electron-builder.yml` 的 `extraResources` 打入：

- `inits/` — 工作区初始化模板
- `docs/user-manual.html` — 完整使用手册（应用内「打开完整使用手册」）
- `scripts/vault-mcp-bridge.mjs`、`ollama-acp-bridge.mjs` — MCP 桥接
- `public/assets/` — Agent 图标
- `build/icon.*` — 应用图标

原生 `.node` 模块通过 `asarUnpack` 解包，避免加载失败。

## 代码签名（可选，发布推荐）

### Windows

设置环境变量后打包：

```powershell
$env:CSC_LINK = "path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "your-password"
npm run electron:build:win
```

未签名时安装包仍可运行，SmartScreen 可能提示「未知发布者」。

### macOS

```bash
export CSC_LINK="/path/to/certificate.p12"
export CSC_KEY_PASSWORD="..."
export APPLE_ID="your@apple.id"
export APPLE_APP_SPECIFIC_PASSWORD="..."
export APPLE_TEAM_ID="XXXXXXXXXX"
npm run electron:build:mac
```

`build/entitlements.mac.plist` 已包含麦克风、网络权限（语音输入与 Agent 连接）。

## 开发与运维

```bash
npm run start    # 开发模式
npm run stop     # 清理 dev 残留进程
npm run clean:artifacts  # 清理 release 目录（Windows）
```

## 常见问题

**Q: macOS 提示缺少 icon.icns**  
A: 在 mac 上运行 `npm run icons`，或将生成的 `build/icon.icns` 提交到仓库。

**Q: 安装后 MCP / Vault 不可用**  
A: 确认设置中 Vault API 已启用；打包版使用内置 bridge 路径与 `ELECTRON_RUN_AS_NODE`，无需系统 Node。

**Q: better-sqlite3 报错（NODE_MODULE_VERSION）**  
A: MetaMates 只为 **Electron** 编译 native 模块。关闭所有 MetaMates 窗口后执行 `npm run rebuild:native`，或重新 `npm run start`（会自动检测并重建）。**不要**对 better-sqlite3 单独执行 `npm rebuild`（会按系统 Node 编译，导致 Electron 无法加载）。

**Q: 退出后仍有 bridge 进程**  
A: 0.1.0+ 已在 `before-quit` 统一断开 Agent 并清理进程树；仍残留时用 `npm run stop`。
