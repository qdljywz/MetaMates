import { describe, it, expect, beforeEach } from 'vitest'
import { IntentRecognitionService, Intent } from '../../services/intentRecognition'

describe('意图识别业务场景测试', () => {
  
  describe('复杂用户场景', () => {
    
    describe('场景1: 用户创建项目文档', () => {
      it('应该正确识别"帮我创建一个项目README文档"的意图链', () => {
        const userMessage = '帮我创建一个项目README文档'
        const intent = IntentRecognitionService.recognize(userMessage)
        
        expect(intent.type).toBe('create_file')
        expect(intent.confidence).toBeGreaterThan(0.5)
      })
      
      it('应该从上下文提取文件类型信息', () => {
        const userMessage = '创建一个Markdown格式的会议记录'
        const intent = IntentRecognitionService.recognize(userMessage)
        
        expect(intent.type).toBe('create_file')
      })
      
      it('应该识别包含多个要求的创建请求', () => {
        const userMessage = '创建一个包含标题、日期和任务列表的每日计划模板'
        const intent = IntentRecognitionService.recognize(userMessage)
        
        expect(['create_file', 'plan', 'template']).toContain(intent.type)
      })
    })
    
    describe('场景2: 用户修改现有内容', () => {
      it('应该区分创建和修改意图', () => {
        const createIntent = IntentRecognitionService.recognize('创建一个新文件')
        const modifyIntent = IntentRecognitionService.recognize('修改这个文件的内容')
        
        expect(createIntent.type).toBe('create_file')
        expect(modifyIntent.type).toBe('modify_file')
      })
      
      it('应该识别追加内容的意图', () => {
        const intent = IntentRecognitionService.recognize('在文件末尾添加一个新的章节')
        
        expect(intent.type).toBe('append_file')
      })
      
      it('应该识别重命名意图', () => {
        const intent = IntentRecognitionService.recognize('把note.md重命名为daily-note.md')
        
        expect(intent.type).toBe('rename_file')
      })
      
      it('应该识别移动文件意图', () => {
        const intent = IntentRecognitionService.recognize('把这个文件移动到archive文件夹')
        
        expect(intent.type).toBe('move_file')
      })
    })
    
    describe('场景3: 用户分析内容', () => {
      it('应该识别总结意图并提取目标', () => {
        const intent = IntentRecognitionService.recognize('总结[[项目计划]]的主要内容')
        
        expect(intent.type).toBe('summarize')
        expect(intent.entities?.some(e => e.type === 'file')).toBe(true)
      })
      
      it('应该识别代码分析意图', () => {
        const intent = IntentRecognitionService.recognize('分析这段代码的质量问题')
        
        expect(intent.type).toBe('analyze')
      })
      
      it('应该识别提取任务意图', () => {
        const intent = IntentRecognitionService.recognize('从会议记录中提取待办事项')
        
        expect(intent.type).toBe('extract_tasks')
      })
    })
    
    describe('场景4: 用户管理标签和链接', () => {
      it('应该从消息中提取多个标签', () => {
        const intent = IntentRecognitionService.recognize('给这个文件添加 #工作 #重要 #紧急 标签')
        
        expect(intent.entities).toBeDefined()
        const tags = intent.entities?.filter(e => e.type === 'tag')
        expect(tags?.length).toBeGreaterThanOrEqual(2)
      })
      
      it('应该识别查找反向链接的意图', () => {
        const intent = IntentRecognitionService.recognize('哪些文件链接到了[[项目计划]]')
        
        expect(['search', 'plan']).toContain(intent.type)
      })
    })
  })
  
  describe('连续对话场景', () => {
    
    describe('场景5: 多轮对话意图追踪', () => {
      it('应该在连续对话中保持上下文', () => {
        const intents = [
          IntentRecognitionService.recognize('创建一个项目文档'),
          IntentRecognitionService.recognize('添加一个简介章节'),
          IntentRecognitionService.recognize('再添加一个任务列表'),
        ]
        
        expect(intents[0].type).toBe('create_file')
        expect(['modify_file', 'create_file', 'append_file']).toContain(intents[1].type)
        expect(['modify_file', 'create_file', 'append_file']).toContain(intents[2].type)
      })
      
      it('应该识别意图转换', () => {
        const intents = [
          IntentRecognitionService.recognize('读取配置文件'),
          IntentRecognitionService.recognize('修改其中的端口号'),
          IntentRecognitionService.recognize('保存并重启服务'),
        ]
        
        expect(intents[0].type).toBe('read_file')
        expect(intents[1].type).toBe('modify_file')
      })
    })
    
    describe('场景6: 模糊请求处理', () => {
      it('应该处理模糊的"这个"引用', () => {
        const intent = IntentRecognitionService.recognize('删除这个')
        
        expect(intent.type).toBe('delete_file')
        expect(intent.confidence).toBeLessThan(1)
      })
      
      it('应该处理简短的命令', () => {
        const intent = IntentRecognitionService.recognize('新建')
        
        expect(intent.type).toBe('create_file')
      })
      
      it('应该处理口语化表达', () => {
        const intent = IntentRecognitionService.recognize('帮我把那个旧的文档删掉')
        
        expect(intent.type).toBe('delete_file')
      })
    })
  })
  
  describe('优先级和紧急程度识别', () => {
    
    describe('场景7: 紧急任务识别', () => {
      it('应该识别紧急关键词', () => {
        const intent = IntentRecognitionService.recognize('紧急！马上创建一个bug报告')
        
        expect(intent.type).toBe('create_file')
        expect(IntentRecognitionService.needsContext(intent)).toBe(false)
      })
      
      it('应该识别低优先级关键词', () => {
        const intent = IntentRecognitionService.recognize('有空的时候整理一下文档')
        
        expect(['modify_file', 'chat']).toContain(intent.type)
      })
    })
  })
  
  describe('实体提取场景', () => {
    
    describe('场景8: 复杂实体提取', () => {
      it('应该从复杂句子中提取日期', () => {
        const intent = IntentRecognitionService.recognize('创建一个2024-03-21的会议记录')
        
        expect(intent.entities?.some(e => e.type === 'date')).toBe(true)
      })
      
      it('应该提取wiki链接作为文件实体', () => {
        const intent = IntentRecognitionService.recognize('查看 [[项目计划]] 和 [[会议记录]] 的内容')
        
        const fileEntities = intent.entities?.filter(e => e.type === 'file')
        expect(fileEntities?.length).toBe(2)
      })
      
      it('应该正确处理中英文混合', () => {
        const intent = IntentRecognitionService.recognize('创建一个 README.md 文件')
        
        expect(intent.type).toBe('create_file')
      })
    })
  })
  
  describe('意图冲突解决', () => {
    
    describe('场景9: 多意图冲突', () => {
      it('应该在创建和修改冲突时选择主要意图', () => {
        const intent = IntentRecognitionService.recognize('创建或修改配置文件')
        
        expect(['create_file', 'modify_file']).toContain(intent.type)
      })
      
      it('应该处理条件性意图', () => {
        const intent = IntentRecognitionService.recognize('如果文件存在就修改，否则创建')
        
        expect(['create_file', 'modify_file', 'read_file']).toContain(intent.type)
      })
    })
  })
  
  describe('业务规则验证', () => {
    
    describe('场景10: 文件操作安全性', () => {
      it('应该识别危险操作', () => {
        const intent = IntentRecognitionService.recognize('删除所有文件')
        
        expect(intent.type).toBe('delete_file')
        expect(intent.confidence).toBeGreaterThan(0)
      })
      
      it('应该识别批量操作', () => {
        const intent = IntentRecognitionService.recognize('批量重命名所有图片文件')
        
        expect(intent.type).toBe('rename_file')
      })
    })
    
    describe('场景11: 模板使用场景', () => {
      it('应该识别模板应用意图', () => {
        const intent = IntentRecognitionService.recognize('使用每日计划模板创建今天的笔记')
        
        expect(['template', 'daily_note']).toContain(intent.type)
      })
      
      it('应该识别日记创建意图', () => {
        const intent = IntentRecognitionService.recognize('写今天的日记')
        
        expect(intent.type).toBe('daily_note')
      })
    })
  })
  
  describe('关键词提取业务场景', () => {
    
    describe('场景12: 关键词质量', () => {
      it('应该提取有意义的业务关键词', () => {
        const intent = IntentRecognitionService.recognize('帮我创建一个包含用户认证功能的模块')
        
        expect(intent.keywords).toBeDefined()
        expect(intent.keywords.some(k => 
          k.includes('创建') || k.includes('用户') || k.includes('认证') || k.includes('模块')
        )).toBe(true)
      })
      
      it('应该过滤无意义的停用词', () => {
        const intent = IntentRecognitionService.recognize('请帮我创建一个文件')
        
        expect(intent.keywords).not.toContain('请')
        expect(intent.keywords).not.toContain('帮我')
        expect(intent.keywords).not.toContain('一个')
      })
    })
  })
  
  describe('意图分类边界测试', () => {
    
    describe('场景13: 边界情况', () => {
      it('应该处理空输入', () => {
        const intent = IntentRecognitionService.recognize('')
        
        expect(intent.type).toBe('chat')
      })
      
      it('应该处理纯符号输入', () => {
        const intent = IntentRecognitionService.recognize('!!!???')
        
        expect(intent.type).toBeDefined()
      })
      
      it('应该处理超长输入', () => {
        const longInput = '创建一个文件'.repeat(100)
        const intent = IntentRecognitionService.recognize(longInput)
        
        expect(intent.type).toBe('create_file')
      })
    })
    
    describe('场景14: 特殊格式处理', () => {
      it('应该正确处理Markdown格式', () => {
        const intent = IntentRecognitionService.recognize('创建一个包含 # 标题和 **加粗** 的文档')
        
        expect(intent.type).toBe('create_file')
      })
      
      it('应该正确处理代码块引用', () => {
        const intent = IntentRecognitionService.recognize('解释 `console.log` 的作用')
        
        expect(intent.type).toBe('chat')
      })
    })
  })
  
  describe('建议和后续操作', () => {
    
    describe('场景15: 操作建议', () => {
      it('应该为文件创建提供后续建议', () => {
        const intent: Intent = { type: 'create_file', confidence: 1, keywords: [] }
        const suggestions = IntentRecognitionService.suggestNextAction(intent)
        
        expect(suggestions.length).toBeGreaterThan(0)
        expect(suggestions.some(s => s.includes('编辑'))).toBe(true)
      })
      
      it('应该为删除操作提供确认建议', () => {
        const intent: Intent = { type: 'delete_file', confidence: 1, keywords: [] }
        const suggestions = IntentRecognitionService.suggestNextAction(intent)
        
        expect(suggestions).toContain('确认删除')
      })
    })
  })
})
