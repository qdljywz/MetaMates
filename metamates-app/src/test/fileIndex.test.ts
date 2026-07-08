import { describe, it, expect, beforeEach } from 'vitest'
import { FileIndexService } from '../services/fileIndex'

describe('FileIndexService', () => {
  let fileIndexService: FileIndexService

  beforeEach(async () => {
    fileIndexService = new FileIndexService()
    
    await fileIndexService.buildIndex([
      {
        name: 'note1.md',
        path: '/workspace/note1.md',
        content: `# 项目计划

这是一个 #工作 项目。

## 任务列表
- [ ] 完成设计
- [x] 创建文档
- [ ] 代码审查

相关链接: [[项目文档]] [[会议记录]]
`
      },
      {
        name: 'note2.md',
        path: '/workspace/note2.md',
        content: `# 项目文档

标签: #工作 #重要

## 概述
这是项目的详细文档。

链接到: [[note1]] [[参考资料]]
`
      },
      {
        name: 'meeting.md',
        path: '/workspace/meeting.md',
        content: `# 会议记录

#会议 #工作

## 待办事项
- [ ] 发送会议纪要
- [x] 安排下次会议

参见: [[项目计划]]
`
      }
    ])
  })

  describe('buildIndex', () => {
    it('应该建立文件索引', async () => {
      const stats = await fileIndexService.buildIndex([
        { name: 'test.md', path: '/test.md', content: '# Test' }
      ])
      
      expect(stats.totalFiles).toBe(1)
    })

    it('应该返回正确的统计信息', async () => {
      const stats = fileIndexService.getStats()
      
      expect(stats.totalFiles).toBe(3)
      expect(stats.totalLinks).toBeGreaterThan(0)
      expect(stats.totalTags).toBeGreaterThan(0)
      expect(stats.totalTasks).toBeGreaterThan(0)
    })

    it('应该提取链接', () => {
      const file = fileIndexService.getFile('/workspace/note1.md')
      
      expect(file?.links).toContain('项目文档')
      expect(file?.links).toContain('会议记录')
    })

    it('应该提取标签', () => {
      const file = fileIndexService.getFile('/workspace/note1.md')
      
      expect(file?.tags).toContain('工作')
    })

    it('应该提取标题', () => {
      const file = fileIndexService.getFile('/workspace/note1.md')
      
      expect(file?.headings).toContain('项目计划')
      expect(file?.headings).toContain('任务列表')
    })

    it('应该提取任务', () => {
      const file = fileIndexService.getFile('/workspace/note1.md')
      
      expect(file?.tasks.length).toBe(3)
      expect(file?.tasks.find(t => t.text === '完成设计')?.completed).toBe(false)
      expect(file?.tasks.find(t => t.text === '创建文档')?.completed).toBe(true)
    })

    it('应该计算字数', () => {
      const file = fileIndexService.getFile('/workspace/note1.md')
      
      expect(file?.wordCount).toBeGreaterThan(0)
    })

    it('应该去重链接和标签', async () => {
      await fileIndexService.buildIndex([
        {
          name: 'test.md',
          path: '/test.md',
          content: '[[link]] [[link]] #tag #tag'
        }
      ])
      
      const file = fileIndexService.getFile('/test.md')
      
      expect(file?.links.length).toBe(1)
      expect(file?.tags.length).toBe(1)
    })
  })

  describe('search', () => {
    it('应该搜索内容', () => {
      const results = fileIndexService.search('项目')
      
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].matches).toContain('content')
    })

    it('应该搜索链接', () => {
      const results = fileIndexService.search('项目文档', { searchIn: ['links'] })
      
      expect(results.length).toBeGreaterThan(0)
    })

    it('应该搜索标签', () => {
      const results = fileIndexService.search('工作', { searchIn: ['tags'] })
      
      expect(results.length).toBeGreaterThan(0)
    })

    it('应该搜索标题', () => {
      const results = fileIndexService.search('计划', { searchIn: ['headings'] })
      
      expect(results.length).toBeGreaterThan(0)
    })

    it('应该按相关性排序', () => {
      const results = fileIndexService.search('工作')
      
      expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score)
    })

    it('应该限制结果数量', () => {
      const results = fileIndexService.search('项目', { limit: 1 })
      
      expect(results.length).toBeLessThanOrEqual(1)
    })

    it('应该支持大小写敏感', async () => {
      await fileIndexService.buildIndex([
        { name: 'test.md', path: '/test.md', content: 'Hello World' }
      ])
      
      const caseSensitive = fileIndexService.search('Hello', { caseSensitive: true })
      const caseInsensitive = fileIndexService.search('hello', { caseSensitive: false })
      
      expect(caseSensitive.length).toBe(1)
      expect(caseInsensitive.length).toBe(1)
    })

    it('应该返回空数组如果没有匹配', () => {
      const results = fileIndexService.search('不存在的关键词xyz123')
      
      expect(results.length).toBe(0)
    })
  })

  describe('findByTag', () => {
    it('应该按标签查找文件', () => {
      const files = fileIndexService.findByTag('工作')
      
      expect(files.length).toBeGreaterThan(0)
    })

    it('应该返回空数组如果没有匹配', () => {
      const files = fileIndexService.findByTag('不存在的标签')
      
      expect(files.length).toBe(0)
    })
  })

  describe('findByLink', () => {
    it('应该按链接查找文件', () => {
      const files = fileIndexService.findByLink('项目文档')
      
      expect(files.length).toBeGreaterThan(0)
    })

    it('应该返回空数组如果没有匹配', () => {
      const files = fileIndexService.findByLink('不存在的链接')
      
      expect(files.length).toBe(0)
    })
  })

  describe('findBacklinks', () => {
    it('应该找到反向链接', () => {
      const backlinks = fileIndexService.findBacklinks('/workspace/note1.md')
      
      expect(backlinks.length).toBeGreaterThan(0)
    })

    it('应该排除文件本身', () => {
      const backlinks = fileIndexService.findBacklinks('/workspace/note1.md')
      
      expect(backlinks.find(f => f.path === '/workspace/note1.md')).toBeUndefined()
    })
  })

  describe('getRelatedFiles', () => {
    it('应该获取相关文件', () => {
      const related = fileIndexService.getRelatedFiles('/workspace/note1.md')
      
      expect(related.length).toBeGreaterThan(0)
    })

    it('应该返回空数组如果文件不存在', () => {
      const related = fileIndexService.getRelatedFiles('/nonexistent.md')
      
      expect(related.length).toBe(0)
    })

    it('应该限制结果数量', () => {
      const related = fileIndexService.getRelatedFiles('/workspace/note1.md', 2)
      
      expect(related.length).toBeLessThanOrEqual(2)
    })

    it('应该按相关性排序', () => {
      const related = fileIndexService.getRelatedFiles('/workspace/note1.md')
      
      for (let i = 1; i < related.length; i++) {
        expect(related[i - 1].relevance).toBeGreaterThanOrEqual(related[i].relevance)
      }
    })
  })

  describe('getStats', () => {
    it('应该返回正确的统计', () => {
      const stats = fileIndexService.getStats()
      
      expect(stats.totalFiles).toBe(3)
      expect(stats.totalWords).toBeGreaterThan(0)
      expect(stats.totalLinks).toBeGreaterThan(0)
      expect(stats.totalTags).toBeGreaterThan(0)
      expect(stats.totalTasks).toBeGreaterThan(0)
      expect(stats.lastIndexed).toBeGreaterThan(0)
    })
  })

  describe('getFile', () => {
    it('应该获取文件', () => {
      const file = fileIndexService.getFile('/workspace/note1.md')
      
      expect(file).toBeDefined()
      expect(file?.name).toBe('note1.md')
    })

    it('应该返回 undefined 如果文件不存在', () => {
      const file = fileIndexService.getFile('/nonexistent.md')
      
      expect(file).toBeUndefined()
    })
  })

  describe('getAllFiles', () => {
    it('应该返回所有文件', () => {
      const files = fileIndexService.getAllFiles()
      
      expect(files.length).toBe(3)
    })
  })

  describe('getTopTags', () => {
    it('应该返回热门标签', () => {
      const tags = fileIndexService.getTopTags()
      
      expect(tags.length).toBeGreaterThan(0)
      expect(tags[0].count).toBeGreaterThanOrEqual(tags[tags.length - 1].count)
    })

    it('应该限制结果数量', () => {
      const tags = fileIndexService.getTopTags(2)
      
      expect(tags.length).toBeLessThanOrEqual(2)
    })
  })

  describe('getRecentFiles', () => {
    it('应该返回最近文件', () => {
      const files = fileIndexService.getRecentFiles()
      
      expect(files.length).toBeGreaterThan(0)
    })

    it('应该限制结果数量', () => {
      const files = fileIndexService.getRecentFiles(2)
      
      expect(files.length).toBeLessThanOrEqual(2)
    })
  })

  describe('getFilesWithPendingTasks', () => {
    it('应该返回有待办任务的文件', () => {
      const files = fileIndexService.getFilesWithPendingTasks()
      
      expect(files.length).toBeGreaterThan(0)
      expect(files.every(f => f.tasks.some(t => !t.completed))).toBe(true)
    })

    it('应该按待办数量排序', () => {
      const files = fileIndexService.getFilesWithPendingTasks()
      
      for (let i = 1; i < files.length; i++) {
        const prevPending = files[i - 1].tasks.filter(t => !t.completed).length
        const currPending = files[i].tasks.filter(t => !t.completed).length
        expect(prevPending).toBeGreaterThanOrEqual(currPending)
      }
    })
  })
})
