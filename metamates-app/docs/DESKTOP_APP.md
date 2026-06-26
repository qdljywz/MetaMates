# Metamates 桌面应用架构

> Metamates 是 **本地安装的 Electron 桌面程序**，不是「用浏览器打开的网站」。  
> 手机上的 `/mobile` 页面只是 **Vault API 辅助入口**（剪藏 / 只读浏览），不是主产品。

---

## 三种运行方式

| 方式 | 命令 / 入口 | 说明 |
|------|-------------|------|
| **生产（推荐给用户）** | 安装 `Metamates.exe` 或 `electron:build` 产物 | 窗口内加载打包后的 `dist/index.html`，完全离线本地 |
| **开发（推荐给开发者）** | `npm run start` 或 `npm run electron:dev` | Electron 壳 + Vite 热更新，仍是桌面窗口 |
| **仅 Vite（不推荐）** | `npm run dev` | 只在浏览器打开 `http://localhost:3000`，**缺少文件系统 / ACP / 终端**，仅适合调试 UI |

```text
┌──────────────────────────────────────┐
│  Electron 主进程 (main.ts)            │
│  · 文件读写 · ACP 子进程 · Vault API  │
├──────────────────────────────────────┤
│  渲染进程 (React)                     │
│  生产: loadFile(dist/index.html)      │
│  开发: loadURL(localhost:3000)        │
└──────────────────────────────────────┘

        可选辅助（同机 Vault API）
┌──────────────────────────────────────┐
│  手机浏览器 → /mobile                 │
│  剪藏 POST /api/capture → Inbox       │
└──────────────────────────────────────┘
```

---

## 为何必须用 Electron

以下能力依赖主进程，浏览器模式不可用：

- 选择本地工作区文件夹、读写 Markdown/PDF
- ACP 多 CLI Agent 子进程与会话
- 内置终端（xterm）
- Vault API 与局域网剪藏
- 系统级窗口、托盘、自动更新（规划中）

若在纯浏览器中打开，应用会显示 **「请使用桌面版启动」** 提示。

---

## 开发与打包

```bash
# 日常开发（桌面窗口）
npm run start

# 类型检查 + 单元测试 + 功能冒烟
npm run verify:round

# Windows 安装包
npm run electron:build:win
```

---

## 相关文档

- [POSITIONING.md](./POSITIONING.md) — 产品定位
- [USER_GUIDE.md](./USER_GUIDE.md) — 用户操作
- [PERSONAL_SCOPE.md](./PERSONAL_SCOPE.md) — 做 / 不做边界
