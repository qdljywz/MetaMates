# 开源文件清单

> **策略**：本仓库采用 **monorepo** 结构；`metamates-app/` 为唯一开源产品目录，根目录保留 CI、产品愿景等少量文件。  
> **不要**再维护 `metamates-opensource/` 双副本。  
> **回归护栏**以 `docs/` 为准（`.cursor/` 为本地 IDE 配置，不随仓库发布）。

---

## 一、应公开（纳入 Git / 发布包）

### 1. 应用源码（核心）

| 路径 | 说明 |
|------|------|
| `src/` | React 前端、组件、hooks、服务 |
| `electron/` | 主进程、ACP、Vault API、语音、SQLite |
| `electron/pluginRuntime/` | 扩展安装、bundled zip、IPC |
| `public/` | 静态资源（含 `assets/` Agent 图标） |
| `e2e/` | Playwright E2E（含 packaged spec 21～31） |
| `fixtures/`、`test-fixtures/` | 测试夹具 |
| `index.html`、`index.template.html` | Vite 入口 |

### 2. 可选扩展（插件源码）

| 路径 | 说明 |
|------|------|
| `plugins/document-import/` | PDF/DOCX/OCR 扩展（`manifest.json` + `extractExtended.cjs` + `package.json`） |
| `plugins/offline-speech/` | Whisper 离线语音扩展（`manifest.json` + `transcribe.cjs` + `package.json`） |
| `scripts/pack-document-import-plugin.mjs` | 扩展 zip 打包 |
| `scripts/pack-offline-speech-plugin.mjs` | 扩展 zip 打包（需先 `whisper:download-model`） |

**不入库**：`plugins/**/node_modules/`、`plugins/**/models/`（Whisper 模型）、`build/plugin-zips/*.zip`。

详见 [PLUGINS.md](./PLUGINS.md)。

### 3. 工作区模板（用户首启复制）

| 路径 | 说明 |
|------|------|
| `inits/zh/` | 中文工作区模板 + Skills |
| `inits/en/` | 英文工作区模板 + Skills |

含 `.claude/`、`.codebuddy/`、`.codex/`、`.gemini/` 下的 **Skills 与模板**（方法论命令），属于产品一部分。

### 4. 脚本与桥接

| 路径 | 说明 |
|------|------|
| `scripts/vault-mcp-bridge.mjs` | Vault MCP（打包 extraResources） |
| `scripts/ollama-acp-bridge.mjs` | Ollama 桥接 |
| `scripts/compile-electron.cjs` | 主进程编译后处理（**必须入库**） |
| `scripts/postinstall-native.mjs` | 原生模块 rebuild |
| `scripts/generate-icons.mjs` | 图标生成 |
| `scripts/verify-*.mjs` | 验证门禁 |
| `scripts/final-acceptance.mjs` | 发版前验收（`acceptance:final`） |
| `scripts/*-e2e.mjs` | E2E / 冒烟脚本 |
| `scripts/stop-metamates.mjs` | 进程清理 |

### 5. 构建与配置

| 文件 | 说明 |
|------|------|
| `package.json` / `package-lock.json` | 依赖锁定 |
| `tsconfig*.json` | TypeScript |
| `vite.config.ts` | 前端构建 |
| `vitest.config.ts` / `playwright*.config.ts` | 测试（含 packaged 配置） |
| `electron-builder.yml` | Windows/macOS 安装包 + `plugin-zips` extraResources |
| `build/icon.ico` / `icon.icns` / `icon.png` | 应用图标 |
| `build/entitlements.mac.plist` | macOS 权限 |
| `build/icon.svg` | 图标源文件 |
| `.env.example` | 环境变量示例 |
| `config/*.example.*` | 配置示例 |
| `.npmrc` | npm 行为（若有） |

### 6. 文档（随代码发布）

| 路径 | 说明 |
|------|------|
| `README.md` | 项目入口 |
| `LICENSE` | MIT |
| `CHANGELOG.md` | 版本变更 |
| `docs/` | 用户指南、定位、API、**PACKAGING.md**、**PLUGINS.md**、**UX_REGRESSION_GUARDRAILS.md** 等 |

### 7. 仓库根目录（monorepo）

| 路径 | 说明 |
|------|------|
| `README.md` | monorepo 总入口（指向 `metamates-app/`） |
| `.github/workflows/ci.yml` | CI 验证（push/PR 自动跑） |
| `.github/workflows/release-pack.yml` | 发版打包（手动触发） |
| `MetaMates_Product_Vision.md` | 产品愿景（可选公开） |
| `MetaMates_Product_Design_Summary.md` | 设计摘要（可选公开） |

```text
MetaMates/                    ← Git 仓库根
├── .github/workflows/
├── README.md
├── metamates-app/            ← 开源产品主体
│   ├── src/
│   ├── electron/
│   ├── plugins/
│   └── ...
└── .gitignore
```

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
| `release/`、`release-fresh*`、`release-out/` | 安装包与验收目录 |
| `build/plugin-zips/` | 扩展 zip 构建产物 |
| `plugins/**/models/` | Whisper 模型（`whisper:download-model` 再生） |
| `*.traineddata` | OCR tessdata 本机文件 |
| `*.exe`、`*.dmg`、`*.blockmap` | 安装包文件 |

### 3. 测试与临时产物

| 模式 | 原因 |
|------|------|
| `*-report.json`、`acceptance-report.json` | 验证报告 |
| `e2e-packaged-*.json` | 打包 E2E 结果 |
| `startup-audit/` | 启动审计输出 |
| `test-results/`、`playwright-report/`、`coverage/` | 测试输出 |
| `e2e/.workspace/` | E2E 临时目录 |

### 4. 内部备忘

| 文件 | 原因 |
|------|------|
| `docs/OVERNIGHT-RELEASE-REPORT.md` | 含本机路径的内部验收备忘 |
| `PLAN.md`、`VERSION.md`（根目录） | 含本地路径与内部迭代 |
| `功能确认.md`、`错误记录.md`、`project_rules.md` | 团队内部记录 |
| `.omc/`、`backups/` | Agent 记忆 / 本地备份 |

### 5. IDE / OS

| 模式 | 原因 |
|------|------|
| `.cursor/` | Cursor IDE 本地规则（公开版见 `docs/UX_REGRESSION_GUARDRAILS.md`） |
| `.trae/`、`.vscode/`、`.idea/` | 编辑器配置 |
| `.DS_Store`、`Thumbs.db` | 系统文件 |

---

## 三、发布前检查

```bash
cd metamates-app

# 1. hygiene：不应被跟踪的文件
npm run check:opensource

# 2. 模板与质量门禁
npm run verify:inits-sync
npm run verify:round
npm run test:ux-guardrails

# 3. 发版验收（Windows，较慢，tag 前必跑）
npm run acceptance:final

# 4. 安装包（先 npm run stop 关闭运行中实例）
npm run electron:build:win    # Windows NSIS + 扩展 zip
npm run verify:fresh-user
```

打包说明见 [PACKAGING.md](./PACKAGING.md)、发版清单见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。

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
  acceptance-report.json \
  .trae/rules/project_rules.md

# 根目录内部备忘（在仓库根执行）
git rm --cached --ignore-unmatch PLAN.md VERSION.md project_rules.md 功能确认.md 错误记录.md
```

然后提交 `.gitignore` 更新，避免再次入库。

---

## 五、首次开源推送（monorepo）

1. 在 GitHub 创建公开仓库 `qdljywz/MetaMates`
2. 本地整理并提交 `metamates-app/` 下全部应公开源码（见上文第一节）
3. 配置 remote 并推送：

```bash
git remote add origin https://github.com/qdljywz/MetaMates.git
git push -u origin master
git tag v0.1.0
git push origin v0.1.0
```

4. GitHub Actions → **Release Pack** → `publish_release=true`，上传 exe + 两个扩展 zip

---

## 六、与商业化的边界（备忘）

| 开源 | 可保留商业扩展 |
|------|----------------|
| 本地灵感仓库 + 思考引擎 | 团队同步 / 云服务 |
| MIT 源码与文档 | 官方签名安装包 / 支持服务 |
| `inits` 工作区模板 | 企业 SSO、审计（若未来做） |

个人版范围见 [PERSONAL_SCOPE.md](./PERSONAL_SCOPE.md)。

---

*更新：2026-07-13 · monorepo + 插件架构 + portable-green 验收对齐*
