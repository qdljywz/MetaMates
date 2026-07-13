# MetaMates 截图 / Screenshots

GitHub 主页与 README 引用的界面截图放此目录。替换占位图后无需改路径。

## 文件名（与根 README 一致）

| 文件 | 内容建议 |
|------|----------|
| `main-ui.png` | 三栏主界面：文件树 + 编辑器 + 思考引擎（深色或浅色任选一种） |
| `empty-state.png` | 无打开文件时的思考引擎空态（显示处境问题，非转圈） |
| `plugins-settings.png` | 设置 → 扩展：document-import + offline-speech 已安装 |

推荐宽度 **1280px** 或 **1440px**，PNG，无敏感路径/密钥。

## 如何截取（Windows 绿色版）

```text
1. 关闭其他 MetaMates 实例
2. 运行 release/portable-green/win-unpacked/MetaMates.exe
3. 首次启动等待插件自动安装完成（约 3–5 分钟）
4. Win + Shift + S 区域截图，保存为本目录上述文件名
```

## 占位图

当前仓库内 `*.svg` 为占位；提交真实 PNG 后删除对应 SVG，并保留 PNG 即可。

```bash
# 可选：批量导出后自检
ls metamates-app/docs/screenshots/*.png
```
