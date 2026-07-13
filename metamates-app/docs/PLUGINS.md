# MetaMates 扩展（插件）架构

> 从 **0.1.0** 起，重型可选能力以扩展包形式分发，主安装包保持精简。

## 设计原则

1. **主程序零依赖启动** — 缺扩展时仅相关菜单失败，不崩溃
2. **IPC 契约稳定** — `prepare-intelligence-import` 等接口不变
3. **扩展安装在用户目录** — `%APPDATA%/MetaMates/plugins/<id>/`（macOS: `~/Library/Application Support/MetaMates/plugins/`）
4. **开源分发** — 官方扩展随 [GitHub Releases](https://github.com/qdljywz/MetaMates/releases) 发布 zip

## 已内置扩展

| ID | 名称 | 主包保留 | 扩展提供 |
|----|------|----------|----------|
| `document-import` | 文档导入 | txt / md / html / csv / json | pdf / docx / xlsx / 图片 OCR |
| `offline-speech` | 离线语音识别 | 麦克风 + 引擎调度 + fallback | 本地 Whisper 离线转写 |

安装：设置 → Agent → **扩展** →「从 GitHub 安装」

开发机：`npm run plugin:document-import:install` / `npm run plugin:offline-speech:install` 后可用「从开发目录安装」。

离线语音扩展打包前需下载模型：`npm run whisper:download-model`（写入 `plugins/offline-speech/models/`）。

## 扩展包结构

```
document-import/
  manifest.json       # 元数据 + GitHub Release 资源名
  package.json        # 仅扩展自己的 dependencies
  extractExtended.cjs # CommonJS 入口，导出 extractDocumentText()
  node_modules/       # npm install 产物（含原生 .node）
```

### manifest.json 字段

| 字段 | 说明 |
|------|------|
| `id` | 唯一标识，对应安装目录名 |
| `apiVersion` | 主程序支持的插件 API 版本（当前 `1`） |
| `main` | 入口脚本（相对路径） |
| `github.assetTemplate` | Release 资源文件名，支持 `{version}` |

### 入口契约（apiVersion 1）

```javascript
// extractExtended.cjs
module.exports = {
  async extractDocumentText(resolvedPath, format, mimeType) {
    return { success, format, mimeType, text, metadata?, warnings?, error? }
  },
}
```

主进程通过 `createRequire()` 从扩展目录加载，**不会**把扩展打进 `app.asar`。

## 打包与发布

```bash
cd metamates-app
npm run plugin:document-import:pack
# → release/MetaMates-document-import-0.1.0-win-x64.zip

npm run whisper:download-model
npm run plugin:offline-speech:pack
# → release/MetaMates-offline-speech-0.1.0-win-x64.zip
```

CI `release-pack.yml` 可将此 zip 作为独立 Release 资产上传。

## 第三方如何做扩展？

当前是 **受控插件 API v1**（不是任意 UI 插件市场）：

1. Fork [qdljywz/MetaMates](https://github.com/qdljywz/MetaMates)
2. 在 `plugins/<your-id>/` 新建目录，提供 `manifest.json` + `main` 入口
3. 仅使用 Node 主进程可加载的 CommonJS；原生模块需针对 Electron ABI `rebuild`
4. 用户手动安装：将 zip 解压到 `%APPDATA%/MetaMates/plugins/<id>/`（后续版本可提供侧载 UI）

**尚未开放的能力**（未来可迭代）：

- 渲染进程 UI 扩展（主题、面板）
- 通用 MCP 扩展注册（今日 MCP 见下文 Vault 桥）
- 扩展签名与商店审核

欢迎先在 Issues 讨论新 `apiVersion` 能力，再实现加载器。

## 与 MCP 桥的关系

| 机制 | 作用 | 运行位置 |
|------|------|----------|
| **扩展（本页）** | 主进程可选能力（文档解析） | MetaMates 进程内 `require` |
| **Vault MCP 桥** | 把本地 Vault HTTP API 暴露给外部 Agent | 独立 stdio 子进程 `vault-mcp-bridge.mjs` |
| **用户 MCP** | 任意 stdio MCP 服务器 | 由 ACP 在 Agent 会话中拉起 |

三者互补：扩展瘦身安装包；MCP 连接外部 AI 与本地笔记。

## 安全提示

- 只安装信任来源的扩展（官方 GitHub Release 或自行构建）
- 扩展代码以主进程权限运行，与 Electron 主进程同级
- 后续可加 manifest 签名校验与白名单
