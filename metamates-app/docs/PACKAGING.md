# MetaMates 打包指南（Windows / macOS）

MetaMates 使用 [electron-builder](https://www.electron.build/) 生成安装包：

| 平台 | 产物 | 命令 |
|------|------|------|
| Windows x64 | `release/MetaMates-<version>-win-x64.exe` (NSIS) | `npm run electron:build:win` |
| macOS arm64 / x64 | `release/MetaMates-<version>-mac-<arch>.dmg` | `npm run electron:build:mac` |
| 本地调试目录（不打包） | `release/win-unpacked` 等 | `npm run electron:build:dir` |

## 环境要求

- **Node.js 20+**、npm
- **Windows 打包**：在 Windows 上执行（需 NSIS，electron-builder 会自动下载）
- **macOS 打包**：必须在 **macOS** 上执行（生成 `.dmg` / `.icns`）
- 原生模块：`better-sqlite3` — 打包前会自动 `npm run rebuild:native`
- **体积优化**：
  - `electronLanguages` 仅保留 `en-US` / `zh-CN`
  - UI 库（React/Ant Design/Three.js 等）在 **`devDependencies`**，由 Vite 打进 `dist/`；**`dependencies` 仅主进程**（SQLite、PDF/OCR/Office 解析）
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

## 打包进安装包的资源

通过 `electron-builder.yml` 的 `extraResources` 打入：

- `inits/` — 工作区初始化模板
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
