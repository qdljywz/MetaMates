# 开源文件清单

> **策略**：本仓库以 `metamates-app/` 为唯一开源产品目录；根目录仅保留 CI、产品愿景等少量文件。  
> **不要**再维护 `metamates-opensource/` 双副本。

---

## 一、应公开（纳入 Git / 发布包）

### 1. 应用源码（核心）

| 路径 | 说明 |
|------|------|
| `src/` | React 前端、组件、hooks、服务 |
| `electron/` | 主进程、ACP、Vault API、语音、SQLite |
| `public/` | 静态资源（含 `assets/` Agent 图标） |
| `e2e/` | Playwright E2E |
| `fixtures/` | 测试夹具 |
| `index.html` | Vite 入口 |

### 2. 工作区模板（用户首启复制）

| 路径 | 说明 |
|------|------|
| `inits/zh/` | 中文工作区模板 + Skills |
| `inits/en/` | 英文工作区模板 + Skills |

含 `.claude/`、`.codebuddy/`、`.codex/`、`.gemini/` 下的 **Skills 与模板**（方法论命令），属于产品一部分。

### 3. 脚本与桥接

| 路径 | 说明 |
|------|------|
| `scripts/vault-mcp-bridge.mjs` | Vault MCP（打包 extraResources） |
| `scripts/ollama-acp-bridge.mjs` | Ollama 桥接 |
| `scripts/compile-electron.cjs` | 主进程编译后处理（**必须入库**） |
| `scripts/postinstall-native.mjs` | 原生模块 rebuild |
| `scripts/generate-icons.mjs` | 图标生成 |
| `scripts/verify-*.mjs` | 验证门禁 |
| `scripts/*-e2e.mjs` | E2E / 冒烟脚本 |
| `scripts/stop-metamates.mjs` | 进程清理 |

### 4. 构建与配置

| 文件 | 说明 |
|------|------|
| `package.json` / `package-lock.json` | 依赖锁定 |
| `tsconfig*.json` | TypeScript |
| `vite.config.ts` | 前端构建 |
| `vitest.config.ts` / `playwright.config.ts` | 测试 |
| `electron-builder.yml` | Windows/macOS 安装包 |
| `build/icon.ico` / `icon.icns` / `icon.png` | 应用图标 |
| `build/entitlements.mac.plist` | macOS 权限 |
| `build/icon.svg` | 图标源文件 |
| `.env.example` | 环境变量示例 |
| `config/*.example.*` | 配置示例 |
| `.npmrc` | npm 行为（若有） |

### 5. 文档（随代码发布）

| 路径 | 说明 |
|------|------|
| `README.md` | 项目入口 |
| `LICENSE` | MIT |
| `CHANGELOG.md` | 版本变更 |
| `docs/` | 用户指南、定位、API、IPC、**PACKAGING.md** 等 |

### 6. 仓库根目录（monorepo 可选）

| 路径 | 说明 |
|------|------|
| `.github/workflows/ci.yml` | CI 验证 |
| `.github/workflows/release-pack.yml` | 打包工作流 |
| `MetaMates_Product_Vision.md` | 产品愿景（可选公开） |
| `MetaMates_Product_Design_Summary.md` | 设计摘要（可选公开） |

---

## 二、应忽略（`.gitignore`，勿提交）

### 1. 用户数据与隐私

| 模式 | 原因 |
|------|------|
| `conversations.db` / `conversations.sqlite*` | 本地聊天历史 |
| `session-store.json` | 会话元数据 |
| `MyM2/`、`MyMetaMates/`、`Test/` | 个人 Vault / 测试工作区 |
| `**/Inbox/*`（保留 `.gitkeep`） | 运行时剪藏，勿入库 |
| `.env`、`.env.local` | 环境变量 |
| `config/ai-config.json`、`config/api-keys/` | API Key |
| `**/.claude/settings.local.json` | IDE 本地权限 |
| `*.pfx`、`*.p12` | 代码签名证书 |

### 2. 构建与依赖

| 模式 | 原因 |
|------|------|
| `node_modules/` | 依赖 |
| `dist/`、`dist-electron/` | 构建输出 |
| `release/`、`dist-release*/` | 安装包目录 |
| `*.exe`、`*.dmg`、`*.blockmap` | 安装包文件 |

### 3. 测试与临时产物

| 模式 | 原因 |
|------|------|
| `*-report.json`、`business-logic-report.json` | 验证报告 |
| `test-results/`、`playwright-report/`、`coverage/` | 测试输出 |
| `codex-skill-scenario.log` | 本地日志 |
| `e2e/.workspace/` | E2E 临时目录 |

### 4. 内部备忘（根目录 `.gitignore`）

| 文件 | 原因 |
|------|------|
| `PLAN.md`、`VERSION.md` | 含本地路径与内部迭代 |
| `功能确认.md`、`错误记录.md`、`project_rules.md` | 团队内部记录 |
| `clean-repo.cmd` | 本机清理脚本 |
| `AionUi-source/`、`backup/` | 参考副本 |

### 5. IDE / OS

| 模式 | 原因 |
|------|------|
| `.trae/` | Trae IDE 本地规则 |
| `.vscode/`、`.idea/` | 编辑器配置 |
| `.DS_Store`、`Thumbs.db` | 系统文件 |

---

## 三、发布前检查

```bash
cd metamates-app

# 1.  hygiene：不应被跟踪的文件
node scripts/check-open-source-hygiene.mjs

# 2. 质量门禁
npm run verify:round

# 3. 安装包（先 npm run stop 关闭运行中实例）
npm run electron:build:win    # Windows
npm run electron:build:mac    # macOS（须在 Mac 上）
```

打包说明见 [PACKAGING.md](./PACKAGING.md)。

---

## 四、若历史提交中已有「不应公开」的文件

在确认无敏感内容后，从索引移除（不删本地文件）：

```bash
cd metamates-app

git rm --cached -r --ignore-unmatch \
  .claude/settings.local.json \
  inits/zh/.claude/settings.local.json \
  inits/en/.claude/settings.local.json \
  business-logic-report.json \
  extended-coverage-e2e-report.json \
  full-functional-test-report.json \
  slash-live-cli-e2e-report.json \
  user-journey-e2e-report.json \
  .trae/rules/project_rules.md

# 根目录内部备忘（在仓库根执行）
git rm --cached --ignore-unmatch PLAN.md VERSION.md project_rules.md 功能确认.md 错误记录.md
```

然后提交 `.gitignore` 更新，避免再次入库。

---

## 五、与商业化的边界（备忘）

| 开源 | 可保留商业扩展 |
|------|----------------|
| 本地 Vault + Agent 执行层 | 团队同步 / 云服务 |
| MIT 源码与文档 | 官方签名安装包 / 支持服务 |
| `inits` 工作区模板 | 企业 SSO、审计（若未来做） |

个人版范围见 [PERSONAL_SCOPE.md](./PERSONAL_SCOPE.md)。

---

## 六、推荐的开源仓库结构（两种）

**A. 当前 monorepo（保留）**

```text
MetaMates/
├── .github/workflows/
├── MetaMates_Product_Vision.md   # 可选
├── metamates-app/                # ← 开源主体
└── .gitignore
```

**B. 独立 GitHub 仓库（未来）**

仅导出 `metamates-app/` 内容为仓库根，把 `README.md`、`LICENSE`、`docs/` 置于根路径，减少 monorepo 层级。

---

*更新：2026-06-22 · 与 `electron-builder.yml`、`PACKAGING.md` 对齐*
