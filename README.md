# MetaMates

<p align="center">
  <img src="metamates-app/public/logo.png" alt="MetaMates" width="128" />
</p>

<p align="center">
  <strong>私人灵感仓库 + 思考引擎</strong>
</p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-0A66C2?style=for-the-badge&logoColor=white" alt="简体中文"/></a>
  &nbsp;
  <a href="README.en.md"><img src="https://img.shields.io/badge/English-555555?style=for-the-badge" alt="English"/></a>
</p>

<p align="center">
  <a href="https://github.com/qdljywz/MetaMates/releases"><img src="https://img.shields.io/badge/version-0.1.0-blue" alt="version"/></a>
  <a href="metamates-app/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"/></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey" alt="platform"/>
</p>

---

## 一句话

MetaMates 是装在你电脑上的 **Electron 桌面应用**：左边是本地 Markdown 灵感仓库，右边是思考引擎。  
和 AI 对话、跑 `/today` `/graduate`——**成品写回同一文件夹里的笔记**，而不是消失在聊天记录里。

---

## 看看界面

### 主界面：仓库 · 编辑器 · 思考引擎

![主界面](metamates-app/docs/screenshots/main-ui.zh.png)

### 空态：关掉标签后，处境会变成下一步问题

![空态](metamates-app/docs/screenshots/empty-state.zh.png)

### 设置：连接 AI 助手与可选扩展

![设置与扩展](metamates-app/docs/screenshots/plugins-settings.zh.png)

---

## 适合谁

- 灵感、日记、计划散落各处，希望 **文件在自己硬盘上**
- 想用 AI，又不要「聊完什么都不剩」
- 愿意本机安装 Gemini / Claude / CodeBuddy 等助手 CLI

## 不适合谁

- 只想要网页聊天客户端  
- 需要团队协作、强制云同步、企业 SSO  

---

## 怎么用（三步）

1. **下载或构建** → [Releases](https://github.com/qdljywz/MetaMates/releases)（若尚无安装包，见下方自行构建）  
2. **选一个文件夹当仓库**（可用 `inits/zh` 模版初始化）  
3. **设置里连接 AI 助手** → 右侧说话或运行斜杠命令  

```bash
git clone https://github.com/qdljywz/MetaMates.git
cd MetaMates/metamates-app
npm ci
npm run start                    # 开发运行
# npm run electron:build:win:portable   # Windows 便携包
```

用户手册：[USER_GUIDE.md](metamates-app/docs/USER_GUIDE.md)

---

## 斜杠命令（15）

| 日常 | `/context` `/today` `/closeday` `/schedule` `/sync` |
| 思考 | `/trace` `/connect` `/challenge` `/ghost` |
| 灵感 | `/ideas` `/graduate` `/drift` `/emerge` `/intel` |
| 规划 | `/soal` |

---

## v0.1.0

- 桌面：文件树、多标签 Markdown、笔记关系图、搜索、中英文 UI  
- 思考引擎：多助手 + 写回 PLAN / Inbox / 笔记  
- 可选扩展：文档导入、离线语音  
- MIT 开源 · CI · 发版脚本  

详细变更：[CHANGELOG.md](metamates-app/CHANGELOG.md) · 定位：[POSITIONING.md](metamates-app/docs/POSITIONING.md)

---

## 许可证

MIT — [metamates-app/LICENSE](metamates-app/LICENSE)

<p align="center"><sub>MetaMates · 开源 v0.1.0 · 2026</sub></p>
