# 开源准备清单

> 记录 MetaMates 项目从内测版本到开源/可安装版本的进度

---

## 红线原则

**⚠️ 任何修改都不能让现有程序不可用**

- 每次修改后必须验证应用正常启动
- 每次修改后必须运行 E2E 测试
- 配置变更必须向后兼容

---

## 第一阶段：配置抽离（已完成 ✅）

### 目标
- 用户可以配置自己的 API Key
- 敏感信息不提交到 Git

### 任务清单

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1.1 | 创建 .env.example | ✅ 完成 | 示例配置文件 |
| 1.2 | 更新 .gitignore | ✅ 完成 | 忽略 .env 和 config/ |
| 1.3 | 验证程序可用 | ✅ 完成 | E2E 测试通过 |

### 重要说明

**API Key 配置方式**：
- **主要方式**：在应用设置界面配置，保存到 localStorage
- **备用方式**：`.env` 文件，用于开发时环境变量

**用户不需要手动创建 .env 文件**，直接在应用设置中配置 API Key 即可。

**Gemini CLI 认证方式**：
- Gemini CLI 使用 **OAuth 认证**，不是 API Key
- 认证流程：运行命令 → 浏览器授权 → 令牌自动保存
- 认证信息存储位置：
  - Windows: `C:\Users\<用户名>\.gemini\oauth_creds.json`
  - macOS/Linux: `~/.gemini/oauth_creds.json`

**环境变量适用场景**：
| 服务 | 认证方式 | 环境变量 |
|------|----------|----------|
| Gemini CLI | OAuth | 不需要 |
| 智谱 AI | API Key | `ZHIPU_API_KEY` |
| OpenAI | API Key | `OPENAI_API_KEY` |
| Anthropic | API Key | `ANTHROPIC_API_KEY` |

### 实施记录

#### 2026-03-19

**已完成的修改**：
1. 创建 `.env.example` 示例配置文件
2. 更新 `.gitignore` 忽略敏感文件
3. 验证程序仍然可用

---

## 第二阶段：打包发布（已完成 ✅）

### 目标
- 生成 Windows 可执行文件

### 任务清单

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 2.1 | 配置 electron-builder | ✅ 完成 | electron-builder.yml |
| 2.2 | 创建 LICENSE 文件 | ✅ 完成 | MIT 协议 |
| 2.3 | 修复 TypeScript 错误 | ✅ 完成 | path API Promise 问题 |
| 2.4 | 生成 Windows 可执行文件 | ✅ 完成 | dist-release-v2/win-unpacked/MetaMates.exe |
| 2.5 | 功能验证 | ✅ 完成 | 关系图谱、文件树功能正常 |

### 实施记录

#### 2026-03-20

**已完成的修改**：
1. 修复关系图谱功能：
   - 修复初始加载显示错误状态的问题
   - 修复 canvas 坐标和鼠标坐标不匹配的问题
   - 修复标签过滤后无法回到全部视图的问题
   - 添加 E2E 测试验证功能

2. 改进文件树功能：
   - 单击文件夹展开/折叠
   - 单击文件打开文件

3. 修复 init-workspace 检测逻辑缺少 04_ 文件夹

4. 打包成功生成 Windows 可执行文件

**打包输出位置**（electron-builder 默认）：

- `release/win-unpacked/MetaMates.exe`（Windows）
- `release/*.dmg` / `release/*.exe`（安装包）

---

## 第三阶段：文档完善（已完成 ✅）

### 目标
- 用户能看懂、能用

### 任务清单

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 3.1 | README.md | ✅ 完成 | 项目介绍 |
| 3.2 | 安装使用文档 | ✅ 完成 | 用户指南 |
| 3.3 | LICENSE | ✅ 完成 | MIT 协议 |

---

## 第四阶段：开源准备（进行中 🔄）

### 目标
- GitHub 开源发布

### 任务清单

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 4.1 | 版本基线 0.1.0 | ✅ 完成 | CHANGELOG / package.json 统一为 0.1.0 |
| 4.2 | 开源卫生检查 | ✅ 完成 | `npm run check:opensource` |
| 4.3 | inits 同步校验 | ✅ 完成 | `npm run verify:inits-sync` |
| 4.4 | Issue/PR 模板 | ✅ 完成 | `.github/ISSUE_TEMPLATE/`、`PULL_REQUEST_TEMPLATE.md` |
| 4.5 | GitHub Actions | ✅ 完成 | `ci.yml`、`release-pack.yml` |
| 4.6 | UX 回归门禁 | ✅ 完成 | `test:ux-guardrails` 纳入 CI |
| 4.7 | `.gitignore` 收尾 | ✅ 完成 | `.cursor/`、`e2e-results.json` |
| 4.8 | GitHub 仓库发布 | ⏳ 待做 | 创建公开仓库、`git push`、可选 `v0.1.0` tag |

### 发布前自检（本地）

```bash
cd metamates-app
npm run check:opensource
npm run verify:inits-sync
npm run test:ux-guardrails
# 完整门禁（较慢）：
npm run verify:round
```

---

## 进度总览

```
第一阶段 ████████ 100% ✅ 配置抽离
第二阶段 ████████ 100% ✅ 打包发布
第三阶段 ████████ 100% ✅ 文档完善
第四阶段 ██████░░  75%   开源准备（待 push）
```

---

## 下一步工作

1. **创建 GitHub 公开仓库**并添加 `origin` remote
2. **提交并推送**当前 0.1.0 基线（`git tag v0.1.0` 可选）
3. **Release** — 使用 `release-pack.yml` 或本地 `electron:pack` 产出安装包

---

> 本文档记录开源准备的每一步进展
