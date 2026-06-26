# 开源发布原则（备忘）

> **现状（2026-06）**：`metamates-opensource/` 旧副本已废弃并删除。  
> 未来若重新开源，**从 `metamates-app/` 当前主分支导出**，不再维护双仓库同步。

---

## 沿用原则

| 原则 | 说明 |
|------|------|
| **本地优先** | 数据在用户 Markdown 工作区，不强制云同步 |
| **MIT 许可证** | 个人版与开源版同一许可思路 |
| **可复现构建** | `npm install` → `npm run verify:round` → `npm run electron:build` |
| **文档随代码** | README、`docs/POSITIONING.md`、`docs/USER_GUIDE.md` 与实现一致 |
| **敏感信息不入库** | 无 API Key、无个人 `settings.json`、无 `conversations.db` |
| **边界清晰** | 个人版范围见 [PERSONAL_SCOPE.md](./PERSONAL_SCOPE.md) |

## 未来开源时的导出清单

从 `metamates-app/` 复制/发布时包含：

- `src/`、`electron/`、`public/`、`inits/`、`scripts/`、`docs/`
- `package.json`、`LICENSE`、`README.md`、构建配置
- 工作区模板 `inits/zh`、`inits/en`

**不要**带入：

- `node_modules/`、`dist/`、`dist-electron/`、`dist-release-*`
- `conversations.db`、`session-store.json`、本地测试工作区
- `MyMetaMates/`、`Test/` 等个人 Vault 数据

## 与商业化的关系（待定）

- 开源：Vault + 基础 Agent 执行层 + 文档
- 若做 Pro：优先在**服务/同步/团队**层收费，而非锁死本地 Markdown

## 验证门禁（发布前）

```bash
cd metamates-app
npm run verify:round
node scripts/full-functional-test.mjs --skip-build
```

## 清理历史打包目录

`dist-release/`、`dist-release-v2`… 均为 **electron-builder 历史输出**，开发不需要保留：

```bash
npm run clean:artifacts   # 关闭 Metamates 窗口后执行；若 app.asar 仍被占用，重启后再跑一次
npm run electron:build:win  # 需要安装包时再打
```

CLI 自动发现行为以 [AGENT_DETECTION.md](./AGENT_DETECTION.md) 为准。

---

*原则备忘 · 旧 `metamates-opensource` 双仓方案已废止*
