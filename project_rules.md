# Metamates 项目规则

## 核心原则

### 1. 不说谎、不糊弄
- **禁止声称"完成"但实际未验证**
- **禁止输出"验证成功"但实际未检查**
- **禁止声称"文件已保存"但实际未保存**
- **禁止用"测试通过"糊弄用户**

### 2. 真实验证
- 每次修改代码后，必须运行应用测试
- 必须检查实际结果，不能只看代码
- 必须验证文件是否真的被创建/更新
- 必须验证功能是否真的工作

### 3. 诚实沟通
- 发现问题要诚实承认
- 不确定时要明确说明
- 没有完成要如实告知
- 不要用"应该可以"来糊弄

### 4. 任务跟踪（重要！）
- **用户给的每一项任务，必须逐项完成**
- **使用 TodoWrite 工具跟踪任务进度**
- **任务完成后，必须更新相关文档**
- **不能遗漏任何一项任务**
- **完成一项，标记一项，不能批量标记**

### 5. 自动测试修复循环（重要！）
- **自动测试，并自动修复，问题解决前，不要停下来**
- **发现错误后立即修复，然后重新测试验证**
- **循环执行：测试 → 发现问题 → 修复 → 重新测试**
- **直到所有功能正常工作为止**
- **不要停下来等待用户确认，要主动完成整个修复流程**

---

## 开发流程

### 1. 代码修改后必须测试
- 每次修改代码后，必须运行 `npm run electron:dev` 测试应用
- 确保应用正常启动，界面正常显示
- 测试相关功能是否正常工作

### 2. TypeScript 编译检查
- 修改代码后，运行 `npx tsc --noEmit` 检查类型错误
- 修复所有编译错误后再交付

### 3. 功能测试清单
- [ ] 应用正常启动
- [ ] 侧边栏文件列表正常显示
- [ ] 打开工作区功能正常
- [ ] 新建笔记功能正常
- [ ] 新建文件夹功能正常
- [ ] 模板创建文件功能正常
- [ ] AI 对话功能正常
- [ ] 自动保存功能正常

### 4. 单元测试验证
对于核心功能，必须编写单元测试来验证：

**运行测试：**
```bash
npm test -- --run                    # 运行所有测试
npm test -- --run src/test/xxx.test.ts  # 运行指定测试文件
```

**测试文件位置：**
- `src/test/` - 测试文件目录
- 测试文件命名：`*.test.ts`

**测试示例：**
```typescript
import { describe, it, expect } from 'vitest'
import { LinkParser } from '../services/linkParser'

describe('LinkParser.resolveLink', () => {
  it('应该精确匹配文件名', () => {
    const result = LinkParser.resolveLink('文件名', ['文件名.md'])
    expect(result).toBe('文件名.md')
  })
})
```

**必须测试的功能：**
- 链接解析功能 (`LinkParser.resolveLink`)
- 文件路径处理
- 正则表达式匹配
- 数据转换逻辑

### 5. AI 助手工具和方法

AI 助手在开发过程中使用以下工具和方法：

**代码搜索工具：**
- `SearchCodebase` - 语义搜索代码库，查找相关代码
- `Grep` - 正则表达式搜索文件内容
- `Glob` - 按文件名模式搜索文件
- `LS` - 列出目录内容

**代码编辑工具：**
- `Read` - 读取文件内容
- `Write` - 创建新文件
- `SearchReplace` - 搜索并替换代码片段
- `DeleteFile` - 删除文件

**命令执行工具：**
- `RunCommand` - 执行终端命令
- `CheckCommandStatus` - 检查命令执行状态
- `StopCommand` - 停止正在运行的命令

**测试验证方法：**
1. **TypeScript 编译检查**
   ```bash
   npx tsc --noEmit
   ```

2. **单元测试**
   ```bash
   npm test -- --run
   ```

3. **应用启动测试**
   ```bash
   npm run electron:dev
   ```

4. **代码验证流程**
   - 修改代码 → TypeScript 编译 → 单元测试 → 应用启动 → 功能验证

**调试方法：**
- 在关键位置添加 `console.log` 输出调试信息
- 使用 `CheckCommandStatus` 查看应用运行日志
- 检查浏览器开发者工具控制台输出

**快速测试工具：**
- `tsx` - 直接运行 TypeScript 文件进行快速测试
  ```bash
  npx tsx test-file.ts    # 首次运行会提示安装 tsx
  ```
- 适用于：快速验证函数逻辑、正则表达式、数据处理等

### 6. E2E 测试（模拟用户操作）

使用 **Playwright** 进行 Electron 应用的端到端测试，可以模拟用户点击、输入等操作。

**安装配置：**
```bash
npm install -D @playwright/test
npx playwright install
```

**配置文件 `playwright.config.ts`：**
```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
})
```

**测试示例 `e2e/link-click.spec.ts`：**
```typescript
import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'

test.describe('Wiki Link 点击功能', () => {
  let electronApp
  let window

  test.beforeAll(async () => {
    electronApp = await electron.launch({ 
      args: ['./dist-electron/main.js'],
      cwd: process.cwd()
    })
    window = await electronApp.firstWindow()
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('点击 wiki link 应该跳转到目标文件', async () => {
    // 等待应用加载
    await window.waitForSelector('.cm-editor')
    
    // 点击 wiki link
    await window.click('.cm-wiki-link')
    
    // 验证文件是否打开
    const title = await window.textContent('.editor-title')
    expect(title).toContain('目标文件名')
  })

  test('点击不存在的链接应该显示提示', async () => {
    // 点击不存在的 wiki link
    await window.click('.cm-wiki-link[data-link-target="不存在的文件"]')
    
    // 验证提示消息
    await expect(window.locator('.ant-message')).toBeVisible()
  })
})
```

**运行 E2E 测试：**
```bash
npx playwright test              # 运行所有测试
npx playwright test --ui         # 带 UI 运行
npx playwright test --debug      # 调试模式
```

**常用操作：**
| 操作 | 代码 |
|------|------|
| 点击元素 | `await window.click('.selector')` |
| 输入文本 | `await window.fill('.input', '文本')` |
| 等待元素 | `await window.waitForSelector('.selector')` |
| 获取文本 | `await window.textContent('.selector')` |
| 截图 | `await window.screenshot({ path: 'screenshot.png' })` |

---

## 经验教训

### 1. Electron preload 脚本限制（重要！）
**问题**：preload.cjs 中使用了 `require('path')`，导致整个 preload 脚本加载失败，electronAPI 变成 undefined
**原因**：
- Electron 的 sandbox 环境不允许在 preload 脚本中直接使用 Node.js 模块
- 只有 `electron` 模块（contextBridge, ipcRenderer）可以在 preload 中使用
- 错误日志：`Unable to load preload script: Error: module not found: path`

**教训**：
- preload 脚本中只能使用 `contextBridge` 和 `ipcRenderer`
- 如果需要 Node.js 模块功能（如 path、fs），必须通过 IPC 调用主进程实现
- 测试时检查浏览器控制台的 "Unable to load preload script" 错误
- 这是导致"窗口按钮不工作"、"终端不可用"等问题的根本原因

### 2. Agent 能力问题
**问题**：声称实现了 Agent 能力，但实际只是一个"命令执行器"
**原因**：
- 没有实现 Function Calling
- 没有实现 Agent 循环
- 没有实现上下文感知
- 只是把指令传给 AI，然后输出文本

**教训**：
- 不要声称实现了没有真正实现的功能
- Agent 需要真正的工具调用能力，不是简单的函数调用
- 要诚实评估自己的能力

### 2. 文件操作验证问题
**问题**：声称"文件已保存"，但实际没有保存
**原因**：
- 没有验证文件是否真的被创建
- 没有验证文件内容是否正确
- 只是调用了 API 就假设成功

**教训**：
- 文件写入后必须读取验证
- 必须检查文件内容是否与预期一致
- 必须输出验证结果，不能只输出"成功"

### 3. 路径不一致问题
**问题**：不同文件使用不同的路径格式
**原因**：
- 没有统一的路径常量
- 不同文件硬编码了不同的路径

**教训**：
- 所有路径应该使用常量定义
- 路径格式要统一（如 `Daily Note&Plan`）

### 4. 测试文件过多问题
**问题**：创建了大量没有价值的测试文件
**原因**：
- 没有区分"功能测试"和"代码通过测试"
- 创建了很多评估类、基准类测试，但没有实际价值

**教训**：
- 测试应该聚焦核心功能
- 不要创建没有实际价值的测试
- 定期清理无用的测试文件

### 5. 文档过多问题
**问题**：创建了大量中间文档，但没有价值
**原因**：
- 没有区分"核心文档"和"临时文档"
- 创建了很多看起来专业但没有实际价值的文档

**教训**：
- 只保留核心文档
- 临时文档用完即删
- 不要为了"看起来专业"而创建文档

### 6. 声称无法测试的问题
**问题**：声称"AI 无法操作 GUI，无法测试"，但实际上可以用 E2E 测试验证
**原因**：
- 没有想到用 Playwright E2E 测试来模拟用户操作
- 找借口逃避测试责任

**教训**：
- **要想办法测试，而不要轻易声称没办法测试**
- **E2E 测试可以模拟用户点击、输入等操作**
- **不要找借口，要主动寻找解决方案**

### 7. CLI 检测与启动命令分离（重要！）
**问题**：混淆了 CLI 检测命令和实际启动命令
**原因**：
- 以为 `claude` 命令可以直接启动 ACP 模式
- 没有查看 AionUi 的实际实现

**教训**：
- **检测命令（cmd）**：用于 `where`/`which` 检测 CLI 是否安装
- **启动命令（cliPath）**：实际 spawn 的命令，可以是 npx 包
- **必须查看参考项目的实际实现，不要假设**

### 8. 启动时自动连接所有 CLI
**问题**：启动时只连接第一个 CLI，其他 CLI 需要手动点击才连接
**原因**：
- 没有理解 AionUi 的设计意图
- 用户体验不佳

**教训**：
- **启动时应该自动连接所有检测到的 CLI**
- **先等待第一个连接完成（启用 UI），再并行连接其他**
- **这样用户看到的是所有 CLI 都是绿灯状态**

### 9. CLI 账号安全（非常重要！）
**问题**：频繁重启应用导致 CLI（如 Gemini）频繁登出登入，可能导致账号被封
**原因**：
- 每次重启应用都会重新建立 CLI 连接
- 短时间内频繁登入登出会触发安全风控

**教训**：
- **不要频繁重启应用**
- **测试时尽量复用已有的 CLI 连接**
- **如果需要测试，等待一段时间再重启**
- **账号安全比测试进度更重要**

### 10. 自动化测试的正确理解（重要！）
**问题**：误以为在界面上添加一个"测试按钮"让用户点击就是自动化测试
**原因**：
- 没有理解"自动化"的真正含义
- 把"手动触发"当成"自动化"

**教训**：
- **真正的自动化测试必须满足以下条件**：
  1. **无需人工干预** - 不需要用户点击按钮或输入
  2. **自动执行测试用例** - 脚本按预设步骤自动运行
  3. **自动验证结果** - 自动判断测试通过/失败
  4. **输出测试报告** - 清晰的结果汇总和详细日志

- **自动化测试示例**：
  ```bash
  # 运行自动化测试脚本
  npx electron auto-test.js
  ```

- **测试报告示例**：
  ```
  ============================================================
  测试报告
  ============================================================
  总计: 5 个测试
  通过: 5
  失败: 0

  详细结果:
    ✅ [1] CLI 检测
    ✅ [2] Gemini 连接
    ✅ [3] CodeBuddy 连接
    ✅ [4] 后台响应保存 - 1 条消息
    ✅ [5] 请求完成
  ============================================================
  ```

- **不是自动化测试的做法**：
  - 在界面上添加测试按钮让用户点击
  - 需要用户手动验证结果
  - 需要用户手动查看日志

---

## 代码规范

### 1. 图标使用
- 使用 Ant Design 图标时，确保图标名称正确
- 常用图标：`FolderAddOutlined`, `FileAddOutlined`, `FolderOutlined`, `FileOutlined`

### 2. 文件操作
- 创建文件时确保文件名包含 `.md` 扩展名
- 使用 `window.electronAPI.path.join()` 拼接路径

### 3. 错误处理
- 所有异步操作都要有 try-catch 或错误处理
- 用户操作失败时显示友好的错误提示

### 4. 变量命名
- 变量名要一致，不要在不同地方使用不同名称
- 未使用的参数用 `_` 前缀标记

---

## 常见问题

### 1. 应用界面空白
- 检查 TypeScript 编译错误
- 检查控制台错误日志
- 确保所有导入的组件和图标存在

### 2. 文件操作失败
- 检查 `window.electronAPI` 是否可用
- 检查工作区路径是否正确
- 检查文件权限

### 3. AI 功能异常
- 检查 API Key 配置
- 检查网络连接
- 检查 AI 服务状态

---

## 文件清理规则

### 应该删除的文件
- `e2e/` - E2E 测试（大部分无用）
- `sprints/` - Sprint 文档（已过时）
- `playwright-report/` - 测试报告
- `test-results/` - 测试结果
- `release/` - 发布文件（可重新构建）
- `dist/` - 构建产物（可重新构建）
- `dist-electron/` - 构建产物（可重新构建）
- `*.cjs` - 临时脚本
- `test-*.html` - 测试文件
- `*.tsbuildinfo` - 构建产物

### 应该保留的文件
- `src/` - 源代码
- `electron/` - Electron 主进程
- `public/` - 静态资源
- `config/` - 配置文件（注意不要提交敏感信息）
- `package.json` - 项目配置
- `tsconfig.json` - TypeScript 配置
- `vite.config.ts` - Vite 配置
- `vitest.config.ts` - 测试配置
