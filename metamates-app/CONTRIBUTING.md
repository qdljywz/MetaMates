# 参与贡献

感谢关注 MetaMates。本仓库为 **monorepo**：开源产品代码在 **`metamates-app/`** 目录；根目录含 CI 与产品愿景文档。

```bash
cd metamates-app
npm ci
npm run start
```

## 开发环境

```bash
npm ci
npm run start          # Electron 开发
npm run verify:round   # 类型检查 + 单测 + 功能验证
```

默认 E2E 工作区为 `e2e/.workspace/vault`（从 `inits/zh` 复制，见 [e2e/E2E_WORKSPACE.md](e2e/E2E_WORKSPACE.md)）。可用 `METAMATES_WORKSPACE` 覆盖。

## 提交前

1. 勿提交 API Key、本地数据库、个人工作区（见 [docs/OPEN_SOURCE.md](docs/OPEN_SOURCE.md)）
2. 运行 `npm run check:opensource`
3. 运行 `npm run verify:round`
4. 若改动启动/进程/文件树/标签/打包/插件，运行 `npm run test:ux-guardrails` 与对应 targeted spec（见 [docs/UX_REGRESSION_GUARDRAILS.md](docs/UX_REGRESSION_GUARDRAILS.md)）

可选环境变量见 [.env.example](.env.example)。

## 测试约定

- **每个用户可见 bug** 须有专项 E2E，不要只跑通用 journey（见 UX 文档「贡献者测试约定」）
- **默认不消耗 Agent 配额**；`test:e2e:agent-live` 等须 opt-in
- 发版前（维护者）：`npm run acceptance:final` — 见 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)

## 打包与扩展

- [docs/PACKAGING.md](docs/PACKAGING.md) — 安装包与 portable-green 验收
- [docs/PLUGINS.md](docs/PLUGINS.md) — 扩展架构与打包

## 行为准则

- 尊重本地优先：用户数据在 Markdown 工作区，不引入强制云同步
- 小步 PR：一个 PR 解决一类问题
- 文档与实现同步更新
- UX 已钉死行为见 [docs/UX_REGRESSION_GUARDRAILS.md](docs/UX_REGRESSION_GUARDRAILS.md)，禁止无测试回退

## 许可证

MIT — 见 [LICENSE](LICENSE)
