# MetaMates Release Checklist

Use this before tagging **v0.1.0** (or any release). See also [PACKAGING.md](./PACKAGING.md), [PLUGINS.md](./PLUGINS.md), [OPEN_SOURCE.md](./OPEN_SOURCE.md).

**仓库形态**：monorepo — 所有命令在 `metamates-app/` 下执行。

---

## 1. 源码与卫生（push 前）

```bash
cd metamates-app
npm run check:opensource
```

- [ ] `plugins/` 源码已提交（无 `node_modules/`、无 `models/`）
- [ ] `electron/pluginRuntime/` 已提交
- [ ] 无 `session-store.json`、`conversations.sqlite*`、`*-report.json` 被跟踪
- [ ] `docs/OVERNIGHT-RELEASE-REPORT.md` 未入库

---

## 2. Pre-build validation（开发机）

```bash
npm ci
npm run verify:inits-sync
npm run verify:round
npm run test:ux-guardrails
npm run test:e2e:plugins
npm run verify:document-import-dev
npm run verify:offline-speech-dev   # 需本地已装扩展 + whisper 模型
```

---

## 3. Build artifacts（Windows）

```bash
npm run whisper:download-model
npm run plugin:offline-speech:pack
npm run plugin:document-import:pack
npm run electron:build:win
```

Expected under `release/`:

| Asset | Purpose |
|-------|---------|
| `MetaMates-<version>-win-x64.exe` | Main installer |
| `MetaMates-document-import-<version>-win-x64.zip` | PDF/OCR extension |
| `MetaMates-offline-speech-<version>-win-x64.zip` | Whisper extension (~130 MB) |
| `latest.yml` | Auto-update metadata (if signed) |

**All three binaries must be attached to the GitHub Release.**

---

## 4. 发版验收（Windows，tag 前必跑）

```bash
npm run acceptance:final
```

或分项：

```bash
npm run verify:acceptance-portable      # UX-31、UX-35 灰屏 + bundled 插件
npm run test:e2e:packaged:empty-state   # UX-33、UX-34
npm run test:e2e:packaged:plugins       # UX-35～38 PDF + Whisper
npm run verify:document-import-real
```

- [ ] `acceptance:final` 全绿（或等价分项全绿）
- [ ] `npm run verify:fresh-user` 通过（需 `release/` 内已构建 exe）

可选（耗 CLI 配额，**最多一次**）：

```bash
npm run test:e2e:packaged:agent-live
```

---

## 5. Manual smoke

- [ ] Fresh install opens vault; no crash on first run
- [ ] Settings → Extensions shows document-import + offline-speech
- [ ] Install each extension from GitHub Release (or local zip)
- [ ] PDF import works with document-import installed
- [ ] Voice: offline-speech Whisper path works when installed

---

## 6. CI / GitHub

| 检查 | 说明 |
|------|------|
| `ci.yml` | push/PR 自动跑 hygiene + `verify:round` + smoke E2E |
| `release-pack.yml` | **手动触发**；`publish_release=true` 创建 Release |
| Version | `package.json` version 与 tag 一致（`v0.1.0`） |
| Changelog | `CHANGELOG.md` 已更新 |

CI **不跑** packaged E2E / `acceptance:final`（需 Windows + 已构建 exe）。

---

## 7. 公开发布

### GitHub 仓库主页

- [ ] 根 [README.md](../README.md) 已更新（双语摘要、v0.1.0 亮点、截图占位）
- [ ] Settings → **Description / Website / Topics** 已按 README「GitHub 仓库设置」一节填写
- [ ] （可选）Social preview 图：1280×640，使用 `docs/screenshots/main-ui.png`

### Push 与 Release

```bash
# 在仓库根
git remote add origin https://github.com/qdljywz/MetaMates.git   # 首次
git push -u origin master
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions → **Release Pack** → platform `win` → `publish_release=true`

---

## Known platform limits

- Plugin zips are **win-x64 only** today. macOS: document extensions TBD.
- Offline speech requires ~130 MB download on first extension install.
- Portable-green (`electron:build:win:portable`) is for **QA**, not the default GitHub Release artifact.

---

## Quick regression commands

| Area | Command |
|------|---------|
| Plugin E2E | `npm run test:e2e:plugins` |
| Offline speech | `npm run test:e2e:offline-speech-plugin` |
| Document import | `npm run test:e2e:document-import-plugin` |
| Full non-agent gate | `npm run test:all` |
| UX guardrails | `npm run test:ux-guardrails` |
