# 参与贡献

感谢关注 MetaMates。开源主体为本目录（`metamates-app/`）。

## 开发环境

```bash
npm ci
npm run start          # Electron 开发
npm run verify:round   # 类型检查 + 单测 + 功能验证
```

## 提交前

1. 勿提交 API Key、本地数据库、个人工作区（见 [docs/OPEN_SOURCE.md](docs/OPEN_SOURCE.md)）
2. 运行 `npm run check:opensource`
3. 运行 `npm run verify:round`
4. 若改动启动动画、工作区选择器、dev 进程清理、**文件树/标签/链接选择器**，运行 `npm run test:ux-guardrails`（见 [docs/UX_REGRESSION_GUARDRAILS.md](docs/UX_REGRESSION_GUARDRAILS.md)）；发版前建议再跑 `npm run test:e2e:ux-guardrails`。

可选环境变量见 [.env.example](.env.example)；验证脚本默认使用 `inits/zh` 作为工作区。

## 打包

见 [docs/PACKAGING.md](docs/PACKAGING.md)。

## 行为准则

- 尊重本地优先：用户数据在 Markdown 工作区，不引入强制云同步
- 小步 PR：一个 PR 解决一类问题
- 文档与实现同步更新
- UX 已钉死行为见 [docs/UX_REGRESSION_GUARDRAILS.md](docs/UX_REGRESSION_GUARDRAILS.md)，禁止无测试回退

## 许可证

MIT — 见 [LICENSE](LICENSE)
