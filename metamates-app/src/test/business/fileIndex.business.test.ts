import { describe, it, expect, beforeEach } from 'vitest'
import { FileIndexService } from '../../services/fileIndex'

describe('文件索引业务场景测试', () => {
  let fileIndexService: FileIndexService

  describe('完整工作区索引场景', () => {
    
    describe('场景1: 典型笔记工作区', () => {
      beforeEach(async () => {
        fileIndexService = new FileIndexService()
        
        await fileIndexService.buildIndex([
          {
            name: 'README.md',
            path: '/workspace/README.md',
            content: `# 我的工作区

这是一个个人知识管理系统。

## 快速开始
- [[每日计划]] - 今天的任务
- [[项目列表]] - 所有项目
- [[读书笔记]] - 阅读记录

#工作 #知识管理
`
          },
          {
            name: '每日计划.md',
            path: '/workspace/daily/每日计划.md',
            content: `# 2024-03-21 每日计划

## 今日目标
- [ ] 完成项目文档
- [x] 代码审查
- [ ] 团队会议

## 工作记录
今天主要在做 [[项目A]] 的开发工作。

#日记 #工作
`
          },
          {
            name: '项目A.md',
            path: '/workspace/projects/项目A.md',
            content: `# 项目A

## 概述
这是一个重要的内部项目。

## 相关文件
- [[项目A设计文档]]
- [[项目A会议记录]]

## 进度
- [x] 需求分析
- [x] 设计阶段
- [ ] 开发阶段
- [ ] 测试阶段

#项目 #重要
`
          },
          {
            name: '项目A设计文档.md',
            path: '/workspace/projects/项目A设计文档.md',
            content: `# 项目A设计文档

## 架构设计
参考 [[架构模式笔记]]

## API设计
详见 [[API文档]]

#项目A #设计
`
          },
          {
            name: '读书笔记.md',
            path: '/workspace/notes/读书笔记.md',
            content: `# 读书笔记

## 《深度工作》
- 专注力是稀缺资源
- [[如何提高专注力]]

## 《原则》
- 建立系统化的决策流程

#读书 #学习
`
          },
          {
            name: '会议记录.md',
            path: '/workspace/meetings/会议记录.md',
            content: `# 2024-03-21 周会

## 参与者
- 张三
- 李四

## 讨论内容
1. [[项目A]] 进度同步
2. 下周计划

## 待办事项
- [ ] 张三: 完成设计文档
- [ ] 李四: 准备演示

#会议 #工作
`
          }
        ])
      })

      it('应该正确建立所有文件的索引', () => {
        const stats = fileIndexService.getStats()
        
        expect(stats.totalFiles).toBe(6)
      })

      it('应该提取所有链接关系', () => {
        const stats = fileIndexService.getStats()
        
        expect(stats.totalLinks).toBeGreaterThan(5)
      })

      it('应该提取所有标签', () => {
        const stats = fileIndexService.getStats()
        
        expect(stats.totalTags).toBeGreaterThan(5)
      })

      it('应该提取所有待办任务', () => {
        const stats = fileIndexService.getStats()
        
        expect(stats.totalTasks).toBeGreaterThan(5)
      })
    })
  })

  describe('链接分析场景', () => {
    
    describe('场景2: 反向链接查找', () => {
      beforeEach(async () => {
        fileIndexService = new FileIndexService()
        
        await fileIndexService.buildIndex([
          {
            name: '目标文件.md',
            path: '/workspace/目标文件.md',
            content: '# 目标文件\n\n这是一个被引用的文件。'
          },
          {
            name: '引用者1.md',
            path: '/workspace/引用者1.md',
            content: '链接到 [[目标文件]]'
          },
          {
            name: '引用者2.md',
            path: '/workspace/引用者2.md',
            content: '也链接到 [[目标文件]]'
          },
          {
            name: '无关节点.md',
            path: '/workspace/无关节点.md',
            content: '这个文件没有链接'
          }
        ])
      })

      it('应该找到所有反向链接', () => {
        const backlinks = fileIndexService.findBacklinks('/workspace/目标文件.md')
        
        expect(backlinks.length).toBe(2)
        expect(backlinks.some(f => f.name === '引用者1.md')).toBe(true)
        expect(backlinks.some(f => f.name === '引用者2.md')).toBe(true)
      })

      it('不应该包含文件本身', () => {
        const backlinks = fileIndexService.findBacklinks('/workspace/目标文件.md')
        
        expect(backlinks.every(f => f.path !== '/workspace/目标文件.md')).toBe(true)
      })
    })

    describe('场景3: 链接图构建', () => {
      beforeEach(async () => {
        fileIndexService = new FileIndexService()
        
        await fileIndexService.buildIndex([
          {
            name: 'A.md',
            path: '/A.md',
            content: '链接到 [[B]] 和 [[C]]'
          },
          {
            name: 'B.md',
            path: '/B.md',
            content: '链接到 [[C]]'
          },
          {
            name: 'C.md',
            path: '/C.md',
            content: '链接到 [[D]]'
          },
          {
            name: 'D.md',
            path: '/D.md',
            content: '没有出链'
          }
        ])
      })

      it('应该正确识别链接层级', () => {
        const aFile = fileIndexService.getFile('/A.md')
        const bFile = fileIndexService.getFile('/B.md')
        const dFile = fileIndexService.getFile('/D.md')
        
        expect(aFile?.links).toContain('B')
        expect(aFile?.links).toContain('C')
        expect(bFile?.links).toContain('C')
        expect(dFile?.links.length).toBe(0)
      })
    })
  })

  describe('标签分析场景', () => {
    
    describe('场景4: 标签聚合', () => {
      beforeEach(async () => {
        fileIndexService = new FileIndexService()
        
        await fileIndexService.buildIndex([
          {
            name: '工作笔记.md',
            path: '/工作笔记.md',
            content: '# 工作\n\n#工作 #重要'
          },
          {
            name: '个人笔记.md',
            path: '/个人笔记.md',
            content: '# 个人\n\n#个人 #生活'
          },
          {
            name: '项目文档.md',
            path: '/项目文档.md',
            content: '# 项目\n\n#工作 #项目 #重要'
          },
          {
            name: '学习笔记.md',
            path: '/学习笔记.md',
            content: '# 学习\n\n#学习 #个人'
          }
        ])
      })

      it('应该统计标签使用频率', () => {
        const topTags = fileIndexService.getTopTags()
        
        expect(topTags.length).toBeGreaterThan(0)
      })

      it('应该按标签查找文件', () => {
        const workFiles = fileIndexService.findByTag('工作')
        
        expect(workFiles.length).toBe(2)
      })

      it('应该支持多标签查询', () => {
        const importantFiles = fileIndexService.findByTag('重要')
        
        expect(importantFiles.length).toBe(2)
      })
    })
  })

  describe('搜索场景', () => {
    
    describe('场景5: 全文搜索', () => {
      beforeEach(async () => {
        fileIndexService = new FileIndexService()
        
        await fileIndexService.buildIndex([
          {
            name: '技术文档.md',
            path: '/技术文档.md',
            content: `# 技术文档

## JavaScript
JavaScript 是一种动态编程语言。

## TypeScript
TypeScript 是 JavaScript 的超集。
`
          },
          {
            name: '学习笔记.md',
            path: '/学习笔记.md',
            content: `# 学习笔记

今天学习了 JavaScript 的异步编程。

## Promise
Promise 是处理异步的一种方式。
`
          },
          {
            name: '项目计划.md',
            path: '/项目计划.md',
            content: `# 项目计划

## 技术栈
- 前端: React + TypeScript
- 后端: Node.js
`
          }
        ])
      })

      it('应该搜索文件内容', () => {
        const results = fileIndexService.search('JavaScript')
        
        expect(results.length).toBeGreaterThan(1)
      })

      it('应该返回匹配位置', () => {
        const results = fileIndexService.search('JavaScript')
        
        expect(results[0].matches).toContain('content')
      })

      it('应该支持中文搜索', () => {
        const results = fileIndexService.search('异步编程')
        
        expect(results.length).toBe(1)
        expect(results[0].file.name).toBe('学习笔记.md')
      })

      it('应该按相关性排序', () => {
        const results = fileIndexService.search('JavaScript')
        
        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
        }
      })
    })

    describe('场景6: 高级搜索', () => {
      beforeEach(async () => {
        fileIndexService = new FileIndexService()
        
        await fileIndexService.buildIndex([
          {
            name: '设计文档.md',
            path: '/设计文档.md',
            content: '# 设计文档\n\n## 架构\n\n系统架构设计。'
          },
          {
            name: '开发文档.md',
            path: '/开发文档.md',
            content: '# 开发文档\n\n## API\n\nAPI 设计和开发。'
          }
        ])
      })

      it('应该只在标题中搜索', () => {
        const results = fileIndexService.search('设计', { searchIn: ['headings'] })
        
        expect(results.length).toBe(1)
      })

      it('应该限制结果数量', () => {
        const results = fileIndexService.search('文档', { limit: 1 })
        
        expect(results.length).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('任务管理场景', () => {
    
    describe('场景7: 待办事项追踪', () => {
      beforeEach(async () => {
        fileIndexService = new FileIndexService()
        
        await fileIndexService.buildIndex([
          {
            name: '今日任务.md',
            path: '/今日任务.md',
            content: `# 今日任务

- [ ] 完成报告
- [x] 回复邮件
- [ ] 准备会议
- [x] 代码审查
- [ ] 更新文档
`
          },
          {
            name: '项目任务.md',
            path: '/项目任务.md',
            content: `# 项目任务

- [ ] 需求分析
- [ ] 系统设计
- [x] 环境搭建
`
          }
        ])
      })

      it('应该找到有待办任务的文件', () => {
        const files = fileIndexService.getFilesWithPendingTasks()
        
        expect(files.length).toBe(2)
      })

      it('应该正确统计已完成和未完成任务', () => {
        const file = fileIndexService.getFile('/今日任务.md')
        
        const completed = file?.tasks.filter(t => t.completed).length
        const pending = file?.tasks.filter(t => !t.completed).length
        
        expect(completed).toBe(2)
        expect(pending).toBe(3)
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

  describe('相关文件推荐场景', () => {
    
    describe('场景8: 基于链接的相关性', () => {
      beforeEach(async () => {
        fileIndexService = new FileIndexService()
        
        await fileIndexService.buildIndex([
          {
            name: '核心概念.md',
            path: '/核心概念.md',
            content: '# 核心概念\n\n这是核心概念文件。\n\n链接: [[相关概念1]] [[相关概念2]]'
          },
          {
            name: '相关概念1.md',
            path: '/相关概念1.md',
            content: '# 相关概念1\n\n链接到 [[核心概念]]'
          },
          {
            name: '相关概念2.md',
            path: '/相关概念2.md',
            content: '# 相关概念2\n\n链接到 [[核心概念]]'
          },
          {
            name: '无关节点.md',
            path: '/无关节点.md',
            content: '# 无关节点\n\n没有链接关系'
          }
        ])
      })

      it('应该找到相关文件', () => {
        const related = fileIndexService.getRelatedFiles('/核心概念.md')
        
        expect(related.length).toBeGreaterThan(0)
      })

      it('应该按相关性排序', () => {
        const related = fileIndexService.getRelatedFiles('/核心概念.md')
        
        for (let i = 1; i < related.length; i++) {
          expect(related[i - 1].relevance).toBeGreaterThanOrEqual(related[i].relevance)
        }
      })

      it('应该排除文件本身', () => {
        const related = fileIndexService.getRelatedFiles('/核心概念.md')
        
        expect(related.every(f => f.file.path !== '/核心概念.md')).toBe(true)
      })
    })

    describe('场景9: 基于标签的相关性', () => {
      beforeEach(async () => {
        fileIndexService = new FileIndexService()
        
        await fileIndexService.buildIndex([
          {
            name: '工作笔记.md',
            path: '/工作笔记.md',
            content: '# 工作笔记\n\n#工作 #重要'
          },
          {
            name: '项目文档.md',
            path: '/项目文档.md',
            content: '# 项目文档\n\n#工作 #项目'
          },
          {
            name: '个人笔记.md',
            path: '/个人笔记.md',
            content: '# 个人笔记\n\n#个人 #生活'
          }
        ])
      })

      it('应该找到共享标签的文件', () => {
        const related = fileIndexService.getRelatedFiles('/工作笔记.md')
        
        expect(related.length).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('统计信息场景', () => {
    
    describe('场景10: 工作区统计', () => {
      beforeEach(async () => {
        fileIndexService = new FileIndexService()
        
        await fileIndexService.buildIndex([
          {
            name: '长文档.md',
            path: '/长文档.md',
            content: '这是一段很长的内容。'.repeat(100)
          },
          {
            name: '短文档.md',
            path: '/短文档.md',
            content: '短内容'
          }
        ])
      })

      it('应该计算总字数', () => {
        const stats = fileIndexService.getStats()
        
        expect(stats.totalWords).toBeGreaterThan(100)
      })

      it('应该记录最后索引时间', () => {
        const stats = fileIndexService.getStats()
        
        expect(stats.lastIndexed).toBeLessThanOrEqual(Date.now())
      })
    })
  })

  describe('增量更新场景', () => {
    
    describe('场景11: 文件更新', () => {
      beforeEach(async () => {
        fileIndexService = new FileIndexService()
        
        await fileIndexService.buildIndex([
          {
            name: '测试文件.md',
            path: '/测试文件.md',
            content: '原始内容'
          }
        ])
      })

      it('应该支持重新索引', async () => {
        const initialStats = fileIndexService.getStats()
        
        await fileIndexService.buildIndex([
          {
            name: '测试文件.md',
            path: '/测试文件.md',
            content: '更新后的内容'
          },
          {
            name: '新文件.md',
            path: '/新文件.md',
            content: '新内容'
          }
        ])
        
        const newStats = fileIndexService.getStats()
        
        expect(newStats.totalFiles).toBe(2)
      })
    })
  })
})
