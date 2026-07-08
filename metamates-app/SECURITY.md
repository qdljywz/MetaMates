# 安全策略 / Security Policy

## 支持的版本

| 版本 | 支持 |
|------|------|
| 0.1.x（最新 release） | ✅ |

## 报告漏洞

请勿在公开 Issue 中披露可利用的安全问题。

请通过以下方式私下报告：

1. GitHub **Security Advisories**（推荐）：仓库 → Security → Report a vulnerability  
2. 或发送邮件至维护者（请在首次 Release 后于 `package.json` 的 `author` / 项目主页补充联系邮箱）

请尽量包含：

- 影响版本与平台（Windows / macOS）
- 复现步骤
- 影响范围（本地数据泄露、RCE、SSRF 等）
- 如有可能，建议修复思路

我们会在 **7 个工作日内** 确认收到，并尽力在 **90 天内** 发布修复或说明。

## 范围说明

**在范围内：**

- MetaMates 桌面应用与 `metamates-app/` 源码
- Vault API 本地 HTTP 接口的未授权访问、路径穿越
- ACP / MCP 桥接中的命令注入或沙箱绕过

**通常不在范围内：**

- 第三方 CLI（Gemini、Claude、CodeBuddy 等）自身漏洞
- 用户自行安装的 MCP 服务器
- 仅影响本机且需用户主动运行恶意工作区内容的场景（请在 Issue 中说明为何仍应视为产品缺陷）

## 安全最佳实践（用户）

- 不要将 API Key 提交到 Git；使用 `.env`（已在 `.gitignore`）
- Vault API 默认仅本机；启用 LAN 访问前请了解网络暴露风险
- 工作区文件夹即信任边界，勿对不可信来源直接打开

详见 [docs/OPEN_SOURCE.md](docs/OPEN_SOURCE.md)。
