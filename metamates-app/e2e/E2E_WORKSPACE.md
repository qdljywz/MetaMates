# E2E 测试工作区

E2E **不会**使用你的私人灵感仓库（如 `E:\MyM2`），也**不会**直接修改内置模版 `inits/zh`。

## 机制

| 项 | 说明 |
|----|------|
| 运行时路径 | `e2e/.workspace/vault/`（已在 `.gitignore`） |
| 首次创建 | 从 `inits/zh` **复制**一份到上述目录 |
| 测试写入范围 | 仅在 `02_项目与知识/_MetaMates_E2E/` 下创建 `e2e-*` 文件 |
| 用户配置 | Electron 使用 `%TEMP%\metamates-e2e-userdata`，不是你的 AppData |

## 覆盖默认路径

```bash
# 使用自己的目录跑 E2E（高级）
set METAMATES_WORKSPACE=D:\path\to\vault
npm run test:e2e:smoke

# 从 inits/zh 重新复制 E2E 工作区（模版大改后）
set METAMATES_E2E_RESET_WORKSPACE=1
npm run test:e2e:smoke
```

## 相关代码

- `scripts/lib/default-workspace.mjs` — 复制与解析逻辑
- `e2e/helpers/e2eWorkspace.ts` — Playwright 入口
- `e2e/helpers/myM2Fixtures.ts` — `_MetaMates_E2E` 沙箱辅助函数
