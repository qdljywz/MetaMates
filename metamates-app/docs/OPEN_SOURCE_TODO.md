# 开源准备清单

> 记录 MetaMates 项目从内测版本到开源/可安装版本的进度  
> **仓库形态**：monorepo（根目录 + `metamates-app/`）  
> **首发版本**：v0.1.0

---

## 红线原则

**⚠️ 任何修改都不能让现有程序不可用**

- 每次修改后必须验证应用正常启动
- 每次修改后必须运行 E2E 测试
- 配置变更必须向后兼容

---

## 第一阶段：配置抽离（已完成 ✅）

| # | 任务 | 状态 |
|---|------|------|
| 1.1 | 创建 .env.example | ✅ |
| 1.2 | 更新 .gitignore | ✅ |
| 1.3 | 验证程序可用 | ✅ |

---

## 第二阶段：打包发布（已完成 ✅）

| # | 任务 | 状态 |
|---|------|------|
| 2.1 | 配置 electron-builder | ✅ |
| 2.2 | 创建 LICENSE 文件 | ✅ |
| 2.3 | 修复 TypeScript 错误 | ✅ |
| 2.4 | 生成 Windows 可执行文件 | ✅ |
| 2.5 | 功能验证 | ✅ |

---

## 第三阶段：文档完善（已完成 ✅）

| # | 任务 | 状态 |
|---|------|------|
| 3.1 | README.md | ✅ |
| 3.2 | 安装使用文档 | ✅ |
| 3.3 | LICENSE | ✅ |
| 3.4 | GitHub 主页（根 README + 截图占位） | ✅ |

---

## 第四阶段：开源准备（进行中 🔄）

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 4.1 | 版本基线 0.1.0 | ✅ | CHANGELOG / package.json |
| 4.2 | 开源卫生检查 | ✅ | `npm run check:opensource` |
| 4.3 | inits 同步校验 | ✅ | `npm run verify:inits-sync` |
| 4.4 | Issue/PR 模板 | ✅ | `.github/` |
| 4.5 | GitHub Actions CI | ✅ | `ci.yml`（自动验证） |
| 4.6 | UX 回归门禁 | ✅ | UX-01～38，`test:ux-guardrails` |
| 4.7 | `.gitignore` 加固 | ✅ | 插件模型、验收报告、内部备忘 |
| 4.8 | 插件架构入库 | ✅ | `plugins/` + `pluginRuntime/` + 打包脚本 |
| 4.9 | 文档对齐 docs/ | ✅ | 去掉 `.cursor` 引用；PLUGINS / RELEASE_CHECKLIST |
| 4.10 | 源码整理提交 | ✅ | commit `48a514e` — 392 files |
| 4.11 | 发版验收 | ✅ | 手动验收绿色版 + 插件自动安装 |
| 4.12 | GitHub 公开推送 | ⏳ | `git push` + `v0.1.0` tag + Release |

### 发布前自检（本地）

```bash
cd metamates-app
npm run check:opensource
npm run verify:inits-sync
npm run test:ux-guardrails
npm run verify:round
# 发版门禁（Windows，tag 前）：
npm run acceptance:final
```

### 推送后

```bash
git remote add origin https://github.com/qdljywz/MetaMates.git
git push -u origin master
git tag v0.1.0
git push origin v0.1.0
# GitHub Actions → Release Pack → publish_release=true
```

---

## 进度总览

```
第一阶段 ████████ 100% ✅ 配置抽离
第二阶段 ████████ 100% ✅ 打包发布
第三阶段 ████████ 100% ✅ 文档完善
第四阶段 ████████░  95%   开源准备（待 commit + push + Release）
```

---

## 下一步工作

1. ~~**提交**整理后的完整源码~~ ✅
2. ~~**本机验收**绿色版~~ ✅
3. ~~**GitHub 主页**根 README + 截图占位 + Description 文案~~ ✅
4. **创建 GitHub 公开仓库**并 `git push`
5. **打 tag** `v0.1.0`，触发 `release-pack.yml` 上传 exe + 两个扩展 zip
6. （可选）用真实界面 PNG 替换 `docs/screenshots/*.svg`

---

> 本文档记录开源准备的每一步进展
