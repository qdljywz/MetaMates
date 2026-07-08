# MetaMates 个人版 — 范围边界

> 产品定位见 [POSITIONING.md](./POSITIONING.md)。本文记录**做 / 不做**，避免范围蔓延。

---

## 不做（Out of Scope）

| 功能 | 原因 |
|------|------|
| **独立 Skills Hub / 技能市场** | slash 命令 + 工作区 skills 足够 |
| **WebUI 远程完整 Agent** | 桌面为主；手机只做剪藏/只读 |
| **MCP OAuth 云端登录** | 首版仅 stdio MCP；OAuth 等有明确需求再做 |
| **多用户 / 企业 SSO** | 首版单人本地；商业化若做同步再议 |
| **Obsidian 插件兼容** | 用 MCP + CLI 扩展 |
| **Headless CI 实连 ACP** | 不阻塞发布；应用内连接为准 |

---

## 会做（In Scope）

- 本地 Vault（替代 Obsidian 的日常笔记）
- ACP 多 CLI + 启动时自动发现（`AcpDetector`，见 [AGENT_DETECTION.md](./AGENT_DETECTION.md)）+ MCP stdio + Vault 桥接
- 会话持久化、权限、Plan、cancel、重连、authenticate
- Vault API、**移动端 Inbox 剪藏**、Ollama
- MCP / Vault 设置变更后重载 session
- 可选 **局域网** 访问 Vault API（手机同 WiFi 剪藏）

---

## 可选扩展（按需开启）

| 项 | 触发条件 |
|----|----------|
| MCP OAuth | 你要接 Notion/GitHub 等云端 MCP |
| 完整 WebUI Agent | 需要浏览器远程全功能操作 |
| 云同步 / 账号 | 商业化路线确定且做 Pro |
| 无人值守 E2E | 需要 CI 自动验 ACP |

---

## 参考

- [POSITIONING.md](./POSITIONING.md)
- [AGENT_DETECTION.md](./AGENT_DETECTION.md)
