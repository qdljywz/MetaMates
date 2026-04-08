# 版本记录

> 记录 Metamates 项目的所有版本标签和发布信息

---

## 主程序启动指南

### 工作目录
```
E:\Trae\Metamates\metamates-app
```

### 启动步骤

#### 步骤 1：检查 TypeScript 编译
```bash
npx tsc --noEmit
```
- 如果有错误，需要先修复
- 如果通过，继续下一步

#### 步骤 2：检查是否有未提交的修改
```bash
git status
```
- 如果有未提交的修改可能导致错误，可以恢复：
```bash
git restore .
```

#### 步骤 3：检查端口占用
```bash
# PowerShell - 停止占用 5173 端口的进程
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

#### 步骤 4：启动开发模式
```bash
npm run electron:dev
```

### 启动成功的标志
日志中会显示：
```
VITE v6.4.1  ready in 1176 ms
➜  Local:   http://localhost:5173/

[DETECT] Found: Gemini CLI
[DETECT] Found: CodeBuddy
[DETECT] Found: Claude Code
[DETECT] Found 3 installed CLIs
[ACP] IPC handlers registered
```

### 常见问题解决

| 问题 | 解决方案 |
|------|----------|
| TypeScript 错误 | `git restore .` 恢复文件 |
| 端口 5173 被占用 | 停止占用进程 |
| electron 进程残留 | `Stop-Process -Name electron -Force` |

---

## 版本标签

| 标签 | 提交哈希 | 日期 | 说明 |
|------|----------|------|------|
| v0.5-beta | 882c8f9 | 2026-04-08 | Beta 0.5 - 打包前稳定版，性能优化、主题系统完善 |
| v0.4-beta | a10e20f | 2026-04-07 | Beta 0.4 - ACP 多 Agent 支持，13 个 slash 命令按钮 |
| v0.3-beta | 0e92b1c | 2026-03-26 | Beta 0.3 - AI命令集成Gemini CLI，移除AI对话 |
| v0.2-beta | 0ac48a7 | 2026-03-24 | Beta 0.2 - 国际化支持和主题系统完善 |
| v0.1-beta | ba17bef | 2026-03-20 | Beta 0.1 - 关系图谱修复和文件树改进 |
| v2026.03.17 | a744ae4 | 2026-03-17 | 3月17日版本 - 修复和增强功能 |

---

## 版本详情

### v0.5-beta (2026-04-08)

**日期**：2026-04-08

**类型**：打包前稳定版

**主要功能**：

1. **性能优化**
   - 懒加载重型组件（CommandPalette、GlobalSearch、GraphView、TemplateSelector）
   - 主题 CSS 按需加载，不再一次性加载所有主题
   - 关系图谱添加 5 分钟缓存，避免重复计算
   - 添加加载骨架屏，提升用户体验

2. **主题系统完善**
   - 修复 CSS 变量语法错误（颜色值不应有引号）
   - 完善 forest 主题样式
   - 更新默认主题配色为 Metamates logo 橙色和青绿色
   - 添加 3D 按钮系统

3. **CLI 改进**
   - 添加 CLI 初始化时间记录（显示每个 CLI 的启动耗时）
   - 修复 PATH 环境变量问题（Windows 下 Electron 进程无法找到 npm 全局命令）
   - 切换 Agent 时自动加载历史消息

4. **同步功能**
   - 支持中英文模板目录（inits/zh/ 和 inits/en/）
   - 同步时只添加不存在的文件，避免覆盖用户内容
   - 同步所有文件夹（包括 01-05 内容文件夹）

5. **关系图谱优化**
   - 过滤隐藏文件夹（.claude、.codebuddy、.gemini）
   - 只显示实际存在的文件链接
   - 改进链接解析（支持锚点、嵌入语法、路径提取）

6. **编辑器修复**
   - 修复文本选择高亮不可见问题
   - 添加 drawSelection 扩展
   - 调整选中背景色为更明显的蓝色

7. **UI 简化**
   - 移除 Connected 状态显示
   - 移除 Session ID 显示
   - 简化 CLI 面板顶部布局

**修复的问题**：
- CSS 变量值添加引号导致白屏
- CLI 检测失败（PATH 环境变量问题）
- 切换 Agent 后历史消息不加载
- 编辑器文本选择不可见
- 关系图谱显示不存在的文件节点

**技术改进**：
- React.lazy 懒加载实现
- 主题 CSS 动态导入
- 图谱缓存机制
- Windows PATH 环境变量修复

---

### v0.4-beta (2026-04-07)

**日期**：2026-04-07

**类型**：ACP 多 Agent 集成版本

**主要功能**：

1. **ACP 多 Agent 支持**
   - 集成 Claude Code、CodeBuddy、Gemini CLI
   - 自动检测本地安装的 CLI
   - 每个 Agent 独立连接和会话
   - 点击 Logo 无缝切换 Agent
   - 连接状态指示（绿灯/黄灯/红灯）

2. **13 个 slash 命令按钮**
   - 按分类排列：日常、思考、灵感、规划
   - 支持直接执行和需要输入的命令
   - 输入框显示浅色提示字
   - 命令按钮禁用状态（未连接时）

3. **修复的问题**
   - CodeMirror drawSelection 导入错误导致的白屏
   - CLI 历史消息不加载（依赖数组问题）
   - 工具调用内容显示原始 JSON
   - 浅色模式下用户消息文字不清晰
   - 编辑器文本选择不可见

4. **UI 改进**
   - 新增状态栏显示连接状态和 Session ID
   - 所有元素添加 data-testid 支持自动化测试
   - 命令按钮按分类分组显示
   - 命令选择时的视觉反馈

**技术改进**：
- 实现 ACP 连接池管理
- 递归提取工具调用文本内容
- 完善主题变量支持
- 添加自动化测试支持

---

### v0.3-beta (2026-03-26)

**日期**：2026-03-26

**类型**：AI命令重构版本

**主要功能**：

1. **AI 命令集成 Gemini CLI**
   - 13 个 AI 命令现在通过 Gemini CLI 执行
   - 点击命令按钮直接发送 slash 命令（如 `/today`）
   - 命令分类：直接执行（9个）和需要输入（4个）
   - 需要输入的命令弹出输入框收集用户输入

2. **移除 AI 对话功能**
   - ChatPanel 简化为只渲染 TerminalPanel
   - 移除 AI 对话相关的所有 UI 和状态
   - 移除 Segmented 模式切换
   - 代码从 533 行简化为 26 行

3. **终端 UI 优化**
   - 移除"已连接/未连接"状态标签
   - 改为简洁的"终端"文字标签

4. **翻译修复**
   - 修复删除对话框翻译问题
   - 添加 `actions.delete`、`actions.cancel` 翻译

**命令列表**：

| 命令 | 分类 | 需要输入 |
|------|------|----------|
| `/context` | 日常管理 | ❌ |
| `/today` | 日常管理 | ❌ |
| `/closeday` | 日常管理 | ❌ |
| `/schedule` | 日常管理 | ❌ |
| `/trace` | 深度思考 | ✅ |
| `/connect` | 深度思考 | ✅ |
| `/challenge` | 深度思考 | ✅ |
| `/ghost` | 深度思考 | ✅ |
| `/ideas` | 灵感挖掘 | ❌ |
| `/graduate` | 灵感挖掘 | ❌ |
| `/drift` | 灵感挖掘 | ❌ |
| `/emerge` | 灵感挖掘 | ❌ |
| `/sync` | 规划基础 | ❌ |

**技术改进**：
- TerminalPanel 直接发送 slash 命令到终端
- 简化 ChatPanel 组件结构
- 更新翻译文件

---

### v0.2-beta (2026-03-24)

**日期**：2026-03-24

**类型**：国际化与主题系统版本

**主要功能**：

1. **国际化支持 (i18n)**
   - 完整的中英文切换支持
   - 使用 react-i18next 框架
   - 翻译文件按模块组织（common, sidebar, editor, terminal, graph, commands, templates, help, welcome）
   - 设置页面语言切换实时生效
   - 欢迎向导页面支持中英文

2. **主题系统完善**
   - 深色/浅色主题完整支持
   - 主题切换实时生效
   - 所有 UI 组件适配主题
   - 终端支持浅色模式
   - 主题设置持久化存储

3. **终端增强**
   - 浅色模式主题支持
   - 修复终端标题重复显示问题
   - 终端边框和背景随主题变化

4. **UI 组件主题适配**
   - Sidebar 侧边栏
   - GraphView 关系图谱
   - GlobalSearch 全局搜索
   - StatusBar 状态栏
   - Header 头部
   - CommandPalette 命令面板
   - TabBar 标签栏
   - ChatPanel 对话面板
   - MarkdownPreview 预览
   - TitleBar 标题栏
   - Editor 编辑器

**修复**：
- 修复浅色模式不生效问题（useTheme 从 storageService 加载设置）
- 修复 CSS 变量优先级问题（`:root[data-theme="light"]` 选择器）
- 修复设置按钮无法点击问题（`-webkit-app-region: drag` CSS 冲突）
- 修复终端边框在浅色模式下显示黑色问题
- 修复终端标题重复显示"终端"问题
- 修复英文模式下欢迎页面不显示英文问题（应用启动时加载语言设置）
- 修复 Editor 不响应主题变化问题

**技术改进**：
- AppSettings 类型支持 `system` 主题选项
- AppSettings 类型添加 `language` 字段
- 应用启动时从 storageService 加载语言设置

---

### v0.1-beta (2026-03-20)

**日期**：2026-03-20

**类型**：首个内测版本（关系图谱修复）

**主要功能**：

1. **文件树管理**
   - 显示工作区文件列表
   - 支持搜索过滤文件
   - 右键菜单：重命名、删除、新建文件/文件夹
   - 使用模板创建文件
   - 实时刷新（监听文件变化）
   - 折叠时完全隐藏
   - **文件拖拽移动**

2. **Markdown 编辑器**
   - 基于 CodeMirror 6
   - 语法高亮
   - Wiki Link 支持 `[[文件名]]` 语法
   - 实时编辑

3. **AI 对话功能**
   - 支持 Gemini API
   - 流式对话
   - 上下文记忆

4. **终端集成**
   - 基于 xterm.js + node-pty
   - 支持 PowerShell/CMD
   - ConPTY 支持（正确显示动画和进度条）

5. **窗口控制**
   - 自定义标题栏
   - 最小化/最大化/关闭按钮
   - 无边框窗口

6. **界面功能**
   - 活动栏（左侧工具栏）
   - 标签页系统
   - 状态栏
   - 命令面板 (Ctrl+P)
   - 全局搜索
   - 关系图谱视图

7. **工作区初始化**
   - 新工作区自动初始化模板文件夹结构
   - 检测已有结构避免重复初始化

**修复**：
- preload.cjs 中 path 模块问题（通过 IPC 实现）
- 文件树折叠时完全隐藏
- 文件树实时刷新（监听文件变化）
- **修复 path API 返回 Promise 问题**（所有 `path.join`、`dirname`、`basename` 调用添加 `await`）
- **修复右键菜单不显示问题**（创建自定义 ContextMenu 组件）
- **修复新建笔记/文件夹/模板创建功能**
- **添加文件拖拽移动功能**
- **修复关系图谱功能**：
  - 修复初始加载显示错误状态的问题
  - 修复 canvas 坐标和鼠标坐标不匹配的问题
  - 修复标签过滤后无法回到全部视图的问题
  - 添加 E2E 测试验证功能

**关系图谱功能状态**：
| 功能 | 状态 |
|------|------|
| 打开关系图谱 | ✅ |
| 滚轮缩放 | ✅ |
| 标签过滤 | ✅ |
| 单击选择 | ✅ |
| 双击打开文件 | ✅ |
| 点击"打开文件"按钮 | ✅ |
| 拖拽移动 | ⏳ 待实现 |

---

### v2026.03.17 (a744ae4)

**日期**：2026-03-17

**类型**：功能增强版本

**主要更新**：

1. **UI 增强**
   - 添加 Header 区域帮助、设置、GitHub 按钮
   - 创建 HelpModal 帮助弹窗
   - 保留 "Metamates 个人洞察与规划助手" 标题

2. **模板功能**
   - 修复模板功能，集成 TemplateSelector 组件
   - 从"开发中"改为完整实现

3. **关系图谱功能**
   - 修复关系图谱功能，集成 GraphView 组件
   - 从"开发中"改为完整实现
   - 添加标签过滤功能，支持清除过滤

4. **文件管理增强**
   - 修复新建笔记后文件树不刷新问题
   - 添加 refreshKey 机制，创建文件后自动刷新文件树
   - 实现新建文件夹功能（侧边栏入口）
   - 添加新建文件夹弹窗，支持在工作区根目录创建文件夹

5. **编辑器增强**
   - 实现标签点击搜索功能
   - 添加 createTagPlugin，支持点击标签显示包含该标签的文件列表
   - 完善 Wiki 链接点击跳转功能
   - Wiki 链接现在可以正确跳转到目标文件

6. **右键菜单优化**
   - 实现文件夹和文件的差异化右键菜单
   - 文件夹菜单：展开、新建笔记、新建子文件夹、使用模板、重命名、删除、复制路径、在资源管理器中打开
   - 文件菜单：打开、在新标签页打开、重命名、删除、复制路径、在资源管理器中打开

7. **文档更新**
   - 更新功能确认文档，添加 4 个核心模块定义
   - 添加 P0/P1/P2/P3 功能规划
   - 添加功能变更记录

8. **Git 仓库初始化**
   - 初始化 Git 仓库
   - 添加 .gitignore 文件
   - 创建初始提交

---

## 技术栈

- **前端**：React 19.2.4 + TypeScript 5.9.3
- **UI 框架**：Ant Design 6.3.2
- **编辑器**：CodeMirror 6.0.2
- **构建工具**：Vite 7.3.1
- **桌面框架**：Electron 33.4.11
- **国际化**：react-i18next 16.5.8

---

## 依赖

### 核心依赖

```json
{
  "react": "^19.2.4",
  "react-dom": "^19.2.4",
  "antd": "^6.3.2",
  "@codemirror/state": "^6.0.2",
  "@codemirror/view": "^6.0.2",
  "@codemirror/lang-javascript": "^6.0.2",
  "electron": "^33.4.11",
  "vite": "^7.3.1",
  "react-i18next": "^16.5.8",
  "i18next": "^25.8.20"
}
```

---

## 测试状态

- **TypeScript 编译**：✅ 通过
- **单元测试**：✅ 39 passed | 1 skipped
- **应用启动**：✅ 成功
- **功能测试**：✅ 已验证
- **国际化测试**：✅ 中英文切换正常
- **主题测试**：✅ 深浅色切换正常

---

## 已知问题

- [ ] 实时预览模式需要完善（hideMarksPlugin）
- [ ] Wiki 链接点击跳转需要完善交互
- [ ] 标签点击搜索需要完善交互
- [ ] 部分测试文件有 TypeScript 错误（不影响主应用）

---

## 下一步计划

### 短期（1-2 周）

- [ ] 完善实时预览模式
- [ ] 完善 Wiki 链接和标签的交互
- [ ] 优化性能和用户体验
- [ ] 修复测试文件 TypeScript 错误

### 中期（3-4 周）

- [ ] 集成 Gemini CLI（AI Agent 能力提升）
- [ ] 实现上下文管理
- [ ] 完善工具系统

### 长期（5-8 周）

- [ ] 实现 3D 关系图谱
- [ ] 使用 LangChain 重构 AI 服务
- [ ] 构建强大的 Agent 系统

---

> 本文档由 AI Agent 自动维护
> 每次发布新版本时更新此文档
