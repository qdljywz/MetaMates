import { describe, it, expect } from 'vitest'
import { IntentRecognitionService, Intent } from '../services/intentRecognition'

describe('IntentRecognitionService', () => {
  describe('recognize', () => {
    describe('文件操作意图', () => {
      it('应该识别创建文件意图', () => {
        const intent = IntentRecognitionService.recognize('帮我创建一个笔记文件')
        expect(intent.type).toBe('create_file')
        expect(intent.confidence).toBeGreaterThan(0)
      })

      it('应该识别新建文件意图', () => {
        const intent = IntentRecognitionService.recognize('新建一个文档')
        expect(intent.type).toBe('create_file')
      })

      it('应该识别写文件意图', () => {
        const intent = IntentRecognitionService.recognize('写一个测试文件')
        expect(intent.type).toBe('create_file')
      })

      it('应该识别生成代码意图', () => {
        const intent = IntentRecognitionService.recognize('生成代码')
        expect(intent.type).toBe('create_file')
      })

      it('应该识别修改文件意图', () => {
        const intent = IntentRecognitionService.recognize('修改这个文件')
        expect(intent.type).toBe('modify_file')
      })

      it('应该识别更新文件意图', () => {
        const intent = IntentRecognitionService.recognize('更新配置文件')
        expect(intent.type).toBe('modify_file')
      })

      it('应该识别编辑文件意图', () => {
        const intent = IntentRecognitionService.recognize('编辑笔记')
        expect(intent.type).toBe('modify_file')
      })

      it('应该识别删除文件意图', () => {
        const intent = IntentRecognitionService.recognize('删除这个文件')
        expect(intent.type).toBe('delete_file')
      })

      it('应该识别读取文件意图', () => {
        const intent = IntentRecognitionService.recognize('读取配置文件')
        expect(intent.type).toBe('read_file')
      })

      it('应该识别查看文件意图', () => {
        const intent = IntentRecognitionService.recognize('查看笔记内容')
        expect(intent.type).toBe('read_file')
      })

      it('应该识别移动文件意图', () => {
        const intent = IntentRecognitionService.recognize('移动文件到其他目录')
        expect(intent.type).toBe('move_file')
      })

      it('应该识别重命名文件意图', () => {
        const intent = IntentRecognitionService.recognize('重命名这个文件')
        expect(intent.type).toBe('rename_file')
      })

      it('应该识别批量创建意图', () => {
        const intent = IntentRecognitionService.recognize('批量创建文件')
        expect(intent.type).toBe('batch_create')
      })

      it('应该识别追加内容意图', () => {
        const intent = IntentRecognitionService.recognize('追加内容到文件末尾')
        expect(intent.type).toBe('append_file')
      })
    })

    describe('分析意图', () => {
      it('应该识别总结意图', () => {
        const intent = IntentRecognitionService.recognize('总结这篇文章')
        expect(intent.type).toBe('summarize')
      })

      it('应该识别分析意图', () => {
        const intent = IntentRecognitionService.recognize('分析代码质量')
        expect(intent.type).toBe('analyze')
      })

      it('应该识别推荐意图', () => {
        const intent = IntentRecognitionService.recognize('推荐一些工具')
        expect(intent.type).toBe('recommend')
      })
    })

    describe('计划意图', () => {
      it('应该识别计划意图', () => {
        const intent = IntentRecognitionService.recognize('帮我制定一个计划')
        expect(intent.type).toBe('plan')
      })

      it('应该识别回顾意图', () => {
        const intent = IntentRecognitionService.recognize('复盘今天的工作')
        expect(intent.type).toBe('review')
      })

      it('应该识别提取任务意图', () => {
        const intent = IntentRecognitionService.recognize('提取任务')
        expect(intent.type).toBe('extract_tasks')
      })
    })

    describe('搜索意图', () => {
      it('应该识别搜索意图', () => {
        const intent = IntentRecognitionService.recognize('搜索关键词')
        expect(intent.type).toBe('search')
      })

      it('应该识别查找意图', () => {
        const intent = IntentRecognitionService.recognize('查找相关文件')
        expect(intent.type).toBe('search')
      })
    })

    describe('模板意图', () => {
      it('应该识别模板意图', () => {
        const intent = IntentRecognitionService.recognize('使用模板创建文件')
        expect(intent.type).toBe('template')
      })

      it('应该识别日记意图', () => {
        const intent = IntentRecognitionService.recognize('今日笔记')
        expect(intent.type).toBe('daily_note')
      })
    })

    describe('列出文件意图', () => {
      it('应该识别列出文件意图', () => {
        const intent = IntentRecognitionService.recognize('列出所有文件')
        expect(intent.type).toBe('list_files')
      })

      it('应该识别文件列表意图', () => {
        const intent = IntentRecognitionService.recognize('文件列表')
        expect(intent.type).toBe('list_files')
      })
    })

    describe('聊天意图', () => {
      it('应该默认为聊天意图', () => {
        const intent = IntentRecognitionService.recognize('你好')
        expect(intent.type).toBe('chat')
      })
    })
  })

  describe('extractEntities', () => {
    it('应该提取标签实体', () => {
      const intent = IntentRecognitionService.recognize('这个 #工作 很重要')
      expect(intent.entities).toBeDefined()
      expect(intent.entities?.some(e => e.type === 'tag' && e.value === '工作')).toBe(true)
    })

    it('应该提取日期实体', () => {
      const intent = IntentRecognitionService.recognize('2024-03-21 的计划')
      expect(intent.entities).toBeDefined()
      expect(intent.entities?.some(e => e.type === 'date')).toBe(true)
    })

    it('应该提取文件实体', () => {
      const intent = IntentRecognitionService.recognize('查看 [[项目计划]] 文件')
      expect(intent.entities).toBeDefined()
      expect(intent.entities?.some(e => e.type === 'file' && e.value === '项目计划')).toBe(true)
    })

    it('应该提取多个实体', () => {
      const intent = IntentRecognitionService.recognize('#工作 #重要 的 [[项目计划]] 在 2024-03-21')
      expect(intent.entities?.length).toBeGreaterThan(1)
    })
  })

  describe('extractKeywords', () => {
    it('应该提取关键词', () => {
      const intent = IntentRecognitionService.recognize('帮我创建一个测试文件')
      expect(intent.keywords).toBeDefined()
      expect(intent.keywords.length).toBeGreaterThan(0)
    })

    it('应该过滤停用词', () => {
      const intent = IntentRecognitionService.recognize('帮我创建一个文件')
      expect(intent.keywords).not.toContain('帮我')
      expect(intent.keywords).not.toContain('一个')
    })
  })

  describe('isFileOperation', () => {
    it('应该识别文件操作意图', () => {
      const intent: Intent = { type: 'create_file', confidence: 1, keywords: [] }
      expect(IntentRecognitionService.isFileOperation(intent)).toBe(true)
    })

    it('应该识别修改文件操作', () => {
      const intent: Intent = { type: 'modify_file', confidence: 1, keywords: [] }
      expect(IntentRecognitionService.isFileOperation(intent)).toBe(true)
    })

    it('应该识别删除文件操作', () => {
      const intent: Intent = { type: 'delete_file', confidence: 1, keywords: [] }
      expect(IntentRecognitionService.isFileOperation(intent)).toBe(true)
    })

    it('应该识别移动文件操作', () => {
      const intent: Intent = { type: 'move_file', confidence: 1, keywords: [] }
      expect(IntentRecognitionService.isFileOperation(intent)).toBe(true)
    })

    it('应该识别重命名文件操作', () => {
      const intent: Intent = { type: 'rename_file', confidence: 1, keywords: [] }
      expect(IntentRecognitionService.isFileOperation(intent)).toBe(true)
    })

    it('应该识别批量创建操作', () => {
      const intent: Intent = { type: 'batch_create', confidence: 1, keywords: [] }
      expect(IntentRecognitionService.isFileOperation(intent)).toBe(true)
    })

    it('应该不识别非文件操作', () => {
      const intent: Intent = { type: 'summarize', confidence: 1, keywords: [] }
      expect(IntentRecognitionService.isFileOperation(intent)).toBe(false)
    })
  })

  describe('needsContext', () => {
    it('应该识别需要上下文的意图', () => {
      const intent: Intent = { type: 'summarize', confidence: 1, keywords: [] }
      expect(IntentRecognitionService.needsContext(intent)).toBe(true)
    })

    it('应该识别分析需要上下文', () => {
      const intent: Intent = { type: 'analyze', confidence: 1, keywords: [] }
      expect(IntentRecognitionService.needsContext(intent)).toBe(true)
    })

    it('应该识别计划需要上下文', () => {
      const intent: Intent = { type: 'plan', confidence: 1, keywords: [] }
      expect(IntentRecognitionService.needsContext(intent)).toBe(true)
    })

    it('应该不识别文件操作需要上下文', () => {
      const intent: Intent = { type: 'create_file', confidence: 1, keywords: [] }
      expect(IntentRecognitionService.needsContext(intent)).toBe(false)
    })
  })

  describe('generatePrompt', () => {
    it('应该生成创建文件的提示', () => {
      const intent: Intent = { type: 'create_file', confidence: 1, keywords: [] }
      const prompt = IntentRecognitionService.generatePrompt(intent, {})
      expect(prompt).toContain('创建文件')
    })

    it('应该生成分析的提示', () => {
      const intent: Intent = { type: 'analyze', confidence: 1, keywords: [] }
      const prompt = IntentRecognitionService.generatePrompt(intent, {})
      expect(prompt).toContain('分析')
    })

    it('应该包含工作区路径', () => {
      const intent: Intent = { type: 'create_file', confidence: 1, keywords: [] }
      const prompt = IntentRecognitionService.generatePrompt(intent, { workspacePath: '/test/path' })
      expect(prompt).toContain('/test/path')
    })

    it('应该包含当前文件', () => {
      const intent: Intent = { type: 'modify_file', confidence: 1, keywords: [] }
      const prompt = IntentRecognitionService.generatePrompt(intent, { currentFile: 'test.md' })
      expect(prompt).toContain('test.md')
    })
  })

  describe('suggestNextAction', () => {
    it('应该为创建文件提供建议', () => {
      const intent: Intent = { type: 'create_file', confidence: 1, keywords: [] }
      const suggestions = IntentRecognitionService.suggestNextAction(intent)
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions).toContain('编辑这个文件')
    })

    it('应该为删除文件提供建议', () => {
      const intent: Intent = { type: 'delete_file', confidence: 1, keywords: [] }
      const suggestions = IntentRecognitionService.suggestNextAction(intent)
      expect(suggestions).toContain('确认删除')
    })

    it('应该为分析提供建议', () => {
      const intent: Intent = { type: 'analyze', confidence: 1, keywords: [] }
      const suggestions = IntentRecognitionService.suggestNextAction(intent)
      expect(suggestions).toContain('生成报告')
    })
  })

  describe('secondaryIntents', () => {
    it('应该识别次要意图', () => {
      const intent = IntentRecognitionService.recognize('创建文件并分析代码质量')
      expect(intent.type).toBeDefined()
      expect(intent.confidence).toBeGreaterThan(0)
    })
  })
})
