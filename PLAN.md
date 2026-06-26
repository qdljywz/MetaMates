# 复刻 Obsidian 文档编辑格式 - 实施计划

## 一、项目背景

Metamates 是一个基于 Electron + React + CodeMirror 的桌面应用，目标是成为用户的"第二大脑架构师"。

### 1.1 应用定位确认

**结论：Metamates 是一个"AI 原生的 Obsidian 简化版"**

| 维度 | Metamates | Obsidian |
|------|-----------|----------|
| **定位** | AI 驱动的个人规划助手 | 知识管理工具 |
| **核心价值** | AI 自动化 + 规划 | 知识连接 + 可扩展性 |
| **本地存储** | ✅ .md 文件 | ✅ .md 文件 |
| **双向链接** | ✅ `[[note]]` | ✅ `[[note]]` |
| **标签系统** | ✅ `#tag` | ✅ `#tag` |
| **关系图谱** | ✅ Canvas | ✅ D3.js/Canvas |
| **AI 集成** | ✅ 深度集成 | ❌ 需插件 |
| **插件生态** | ❌ 无 | ✅ 1000+ 插件 |

### 1.2 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | 33.4.11 | 桌面应用框架 |
| React | 19.2.4 | 前端UI框架 |
| CodeMirror | 6.0.2 | Markdown编辑器 |
| Ant Design | 6.3.2 | UI组件库 |

---

## 二、核心目标：Obsidian 实时预览模式

### 2.1 什么是 Obsidian 实时预览？

Obsidian 的"实时预览"模式是一种编辑体验：
- **当光标不在某行时**：隐藏 Markdown 语法标记，只显示格式化效果
- **当光标移动到某行时**：显示原始语法标记，方便编辑

### 2.2 效果示例

```
原始文本：
**粗体文本** 和 *斜体文本* 以及 ## 标题

光标不在该行时显示：
粗体文本 和 斜体文本 以及 标题（大号字体）

光标在该行时显示：
**粗体文本** 和 *斜体文本* 以及 ## 标题
```

### 2.3 当前实现状态

当前 `Editor.tsx` 已有 `hideMarksPlugin`，但实现不完善：

```typescript
// 当前实现的问题：
// 1. 只隐藏了部分标记（HeaderMark, EmphasisMark 等）
// 2. 没有同时应用格式化样式
// 3. 没有处理所有 Obsidian 语法
```

---

## 三、需要实现的功能

### 3.1 语法标记隐藏（当光标不在行内）

| 语法 | 标记 | 隐藏后效果 |
|------|------|-----------|
| 标题 | `# ` 到 `###### ` | 大号字体标题 |
| 粗体 | `**` 或 `__` | 粗体文字 |
| 斜体 | `*` 或 `_` | 斜体文字 |
| 粗斜体 | `***` 或 `___` | 粗斜体文字 |
| 删除线 | `~~` | 删除线文字 |
| 高亮 | `==` | 高亮背景 |
| Wiki链接 | `[[` 和 `]]` | 可点击链接 |
| 标签 | `#` | 标签样式 |
| 外部链接 | `[文本](url)` | 可点击链接 |
| 图片 | `![alt](url)` | 显示图片 |
| 行内代码 | `` ` `` | 代码样式 |
| 引用 | `> ` | 引用块样式 |
| 列表 | `- ` 或 `1. ` | 列表样式 |
| 复选框 | `- [ ]` 或 `- [x]` | 可点击复选框 |

### 3.2 格式化样式应用

隐藏标记的同时，需要应用对应的 CSS 样式：

```css
/* 标题样式 */
.cm-header-1 { font-size: 2em; font-weight: 700; }
.cm-header-2 { font-size: 1.5em; font-weight: 600; }
/* ... */

/* 粗体样式 */
.cm-strong { font-weight: 700; }

/* 斜体样式 */
.cm-emphasis { font-style: italic; }

/* 高亮样式 */
.cm-highlight { background: yellow; }

/* Wiki链接样式 */
.cm-wiki-link { color: purple; cursor: pointer; }
```

### 3.3 新增语法支持

| 功能 | 语法 | 当前状态 |
|------|------|---------|
| 粗体备用语法 | `__文本__` | ❌ 需实现 |
| 斜体备用语法 | `_文本_` | ❌ 需实现 |
| 粗斜体组合 | `***文本***` | ❌ 需实现 |
| Markdown链接 | `[文本](url)` | ❌ 需实现 |
| 外部图片 | `![alt](url)` | ❌ 需实现 |
| 转义字符 | `\*不倾斜\*` | ❌ 需实现 |

---

## 四、实施计划

### Phase 1: 增强 hideMarksPlugin（核心）

#### 1.1 改进标记隐藏逻辑

```typescript
// 改进后的 hideMarksPlugin
const hideMarksPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  buildDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = []
    const cursorPos = view.state.selection.main.head
    const cursorLine = view.state.doc.lineAt(cursorPos).number

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from, to,
        enter: (node) => {
          const nodeLine = view.state.doc.lineAt(node.from).number
          
          // 光标所在行不隐藏
          if (nodeLine === cursorLine) return

          // 根据节点类型添加隐藏装饰
          if (this.shouldHideNode(node)) {
            decorations.push(
              Decoration.mark({ class: 'cm-hidden-mark' }).range(node.from, node.to)
            )
          }
        },
      })
    }
    
    return Decoration.set(decorations.sort((a, b) => a.from - b.from))
  }

  shouldHideNode(node: SyntaxNode): boolean {
    const hideNodes = [
      'HeaderMark',           // # ## ### 等
      'EmphasisMark',         // * _ 等
      'StrongEmphasisMark',   // ** __ 等
      'StrikethroughMark',    // ~~
      'HighlightMark',        // ==
      'LinkMark',             // []()
      'ImageMark',            // ![]
      'WikiLinkMark',         // [[]]
      'CodeMark',             // `
      'QuoteMark',            // >
      'ListMark',             // - 1.
      'CheckboxMark',         // [ ] [x]
    ]
    return hideNodes.some(name => node.name.includes(name))
  }
})
```

#### 1.2 添加格式化装饰

```typescript
// 同时应用格式化样式的插件
const formatDecorationsPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  buildDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = []
    const cursorPos = view.state.selection.main.head
    const cursorLine = view.state.doc.lineAt(cursorPos).number

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from, to,
        enter: (node) => {
          const nodeLine = view.state.doc.lineAt(node.from).number
          if (nodeLine === cursorLine) return

          // 为整个格式化区域添加样式
          if (node.name === 'StrongEmphasis') {
            decorations.push(
              Decoration.mark({ class: 'cm-strong' }).range(node.from, node.to)
            )
          }
          if (node.name === 'Emphasis') {
            decorations.push(
              Decoration.mark({ class: 'cm-emphasis' }).range(node.from, node.to)
            )
          }
          // ... 其他格式
        },
      })
    }
    
    return Decoration.set(decorations)
  }
})
```

### Phase 2: 增强语法解析

#### 2.1 添加自定义 Markdown 扩展

```typescript
import { Parser } from '@lezer/markdown'
import { Strikethrough, Highlight } from './custom-markdown-extensions'

const customMarkdownParser = Parser.configure([
  Strikethdown,      // ~~删除线~~
  Highlight,         // ==高亮==
  WikiLink,          // [[链接]]
  Tag,               // #标签
  ExternalLink,      // [文本](url)
  Image,             // ![alt](url)
])
```

#### 2.2 处理嵌套格式

```typescript
// 处理 **粗体和 _嵌套斜体_ 文本**
// 需要递归解析嵌套的格式节点
```

### Phase 3: 样式优化

#### 3.1 完善 CSS 样式

```css
/* 隐藏标记 */
.cm-hidden-mark {
  font-size: 0;
  width: 0;
  display: inline-block;
}

/* 标题样式 */
.cm-header-1 { font-size: 2.25em; font-weight: 700; color: #111; }
.cm-header-2 { font-size: 1.75em; font-weight: 600; color: #222; }
.cm-header-3 { font-size: 1.4em; font-weight: 600; color: #333; }
.cm-header-4 { font-size: 1.15em; font-weight: 600; color: #444; }
.cm-header-5 { font-size: 1em; font-weight: 600; color: #555; }
.cm-header-6 { font-size: 0.9em; font-weight: 600; color: #666; }

/* 文本样式 */
.cm-strong { font-weight: 700; color: #111; }
.cm-emphasis { font-style: italic; color: #444; }
.cm-strikethrough { text-decoration: line-through; color: #888; }
.cm-highlight { background: #fef08a; padding: 0 2px; border-radius: 2px; }

/* 链接样式 */
.cm-wiki-link {
  color: #7c3aed;
  cursor: pointer;
  background: #f3e8ff;
  padding: 0 4px;
  border-radius: 4px;
}
.cm-wiki-link:hover {
  background: #e9d5ff;
}

.cm-tag {
  color: #d97706;
  cursor: pointer;
  background: #fef3c7;
  padding: 0 4px;
  border-radius: 4px;
}

.cm-link {
  color: #2563eb;
  text-decoration: underline;
  cursor: pointer;
}

/* 代码样式 */
.cm-inline-code {
  font-family: 'Fira Code', monospace;
  background: #1e1e1e;
  color: #a5d6ff;
  padding: 2px 6px;
  border-radius: 4px;
}

/* 引用样式 */
.cm-quote {
  color: #666;
  font-style: italic;
  border-left: 4px solid #d1d5db;
  padding-left: 16px;
  background: #f3f4f6;
}

/* 列表样式 */
.cm-list {
  color: #8b5cf6;
}

/* 复选框样式 */
.cm-checkbox {
  cursor: pointer;
}
```

### Phase 4: 交互增强

#### 4.1 Wiki 链接点击跳转

```typescript
// 点击 [[链接]] 时跳转到目标文件
editorView.dom.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  if (target.classList.contains('cm-wiki-link')) {
    const linkText = target.textContent
    navigateToWikiLink(linkText)
  }
})
```

#### 4.2 标签点击

```typescript
// 点击 #标签 时搜索相关文件
editorView.dom.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  if (target.classList.contains('cm-tag')) {
    const tagName = target.textContent?.slice(1) // 去掉 #
    searchByTag(tagName)
  }
})
```

---

## 五、文件修改清单

| 文件 | 修改内容 | 优先级 |
|------|---------|--------|
| `src/components/Editor.tsx` | 重写 hideMarksPlugin、添加格式装饰 | P0 |
| `src/App.css` | 添加完整的格式化样式 | P0 |
| `src/services/linkParser.ts` | 增强链接解析 | P1 |
| `src/components/MarkdownPreview.tsx` | 同步预览增强 | P1 |

---

## 六、验收标准

### 6.1 功能验收

1. ✅ 光标不在行内时，隐藏所有 Markdown 标记
2. ✅ 光标移动到行内时，显示原始标记
3. ✅ 隐藏标记的同时，正确应用格式化样式
4. ✅ Wiki 链接 `[[链接]]` 可点击跳转
5. ✅ 标签 `#标签` 可点击搜索
6. ✅ 外部链接可点击打开
7. ✅ 图片正确显示

### 6.2 视觉验收

1. ✅ 标题大小和样式正确
2. ✅ 粗体、斜体、删除线、高亮效果正确
3. ✅ 链接和标签颜色和样式正确
4. ✅ 列表和引用样式正确
5. ✅ 整体视觉效果接近 Obsidian

### 6.3 性能验收

1. ✅ 大文档（1000+ 行）滚动流畅
2. ✅ 光标移动无卡顿
3. ✅ 内存占用合理

---

## 七、风险和注意事项

1. **CodeMirror 语法树** - 需要深入理解 Lezer 语法树结构
2. **嵌套格式** - 嵌套格式（如 `**粗体 _斜体_**`）处理复杂
3. **性能** - 大文档的装饰计算需要优化
4. **兼容性** - 确保与现有功能不冲突

---

**计划创建时间**: 2026-03-16  
**计划状态**: 待用户确认
