import { describe, it, expect } from 'vitest'
import { LinkParser } from '../services/linkParser'

describe('LinkParser', () => {
  describe('parse', () => {
    it('应该解析简单的 wiki link', () => {
      const content = '这是一个 [[2026-03-16 PLAN]] 链接'
      const result = LinkParser.parse(content)
      
      expect(result.links.length).toBe(1)
      expect(result.links[0].target).toBe('2026-03-16 PLAN')
      expect(result.links[0].text).toBe('2026-03-16 PLAN')
    })

    it('应该解析带别名的 wiki link', () => {
      const content = '这是一个 [[项目计划|我的项目]] 链接'
      const result = LinkParser.parse(content)
      
      expect(result.links.length).toBe(1)
      expect(result.links[0].target).toBe('项目计划')
      expect(result.links[0].text).toBe('我的项目')
    })

    it('应该解析多个 wiki link', () => {
      const content = '[[链接1]] 和 [[链接2|别名]] 和 [[链接3]]'
      const result = LinkParser.parse(content)
      
      expect(result.links.length).toBe(3)
      expect(result.links[0].target).toBe('链接1')
      expect(result.links[1].target).toBe('链接2')
      expect(result.links[1].text).toBe('别名')
      expect(result.links[2].target).toBe('链接3')
    })

    it('应该解析简单的标签', () => {
      const content = '这是一个 #工作 笔记'
      const result = LinkParser.parse(content)
      
      expect(result.tags.length).toBe(1)
      expect(result.tags[0].name).toBe('工作')
      expect(result.tags[0].text).toBe('#工作')
    })

    it('应该解析多个标签', () => {
      const content = '#工作 #重要 #项目A'
      const result = LinkParser.parse(content)
      
      expect(result.tags.length).toBe(3)
      expect(result.tags[0].name).toBe('工作')
      expect(result.tags[1].name).toBe('重要')
      expect(result.tags[2].name).toBe('项目A')
    })

    it('应该解析英文标签', () => {
      const content = 'This is a #work note with #important tag'
      const result = LinkParser.parse(content)
      
      expect(result.tags.length).toBe(2)
      expect(result.tags[0].name).toBe('work')
      expect(result.tags[1].name).toBe('important')
    })

    it('应该同时解析链接和标签', () => {
      const content = '这是一个 [[项目计划]] 笔记 #工作 #重要'
      const result = LinkParser.parse(content)
      
      expect(result.links.length).toBe(1)
      expect(result.tags.length).toBe(2)
    })

    it('应该正确记录位置信息', () => {
      const content = '开始 [[链接]] 结束'
      const result = LinkParser.parse(content)
      
      expect(result.links[0].start).toBe(3)
      expect(result.links[0].end).toBe(9)
    })

    it('应该忽略 wiki link 内部的标签', () => {
      const content = '[[文件#标题]]'
      const result = LinkParser.parse(content)
      
      expect(result.links.length).toBe(1)
      expect(result.tags.length).toBe(0)
    })

    it('应该忽略代码块中的标签', () => {
      const content = '`#代码中的标签`'
      const result = LinkParser.parse(content)
      
      expect(result.tags.length).toBe(0)
    })
  })

  describe('extractAllLinks', () => {
    it('应该从多个文件中提取所有链接', () => {
      const files = [
        { name: 'file1.md', content: '链接到 [[file2]] 和 [[file3]]' },
        { name: 'file2.md', content: '链接到 [[file1]]' },
        { name: 'file3.md', content: '没有链接' },
      ]
      
      const linkMap = LinkParser.extractAllLinks(files)
      
      expect(linkMap.get('file2')).toContain('file1.md')
      expect(linkMap.get('file3')).toContain('file1.md')
      expect(linkMap.get('file1')).toContain('file2.md')
      expect(linkMap.has('没有链接')).toBe(false)
    })

    it('应该去重相同的链接', () => {
      const files = [
        { name: 'file1.md', content: '[[target]] 和 [[target]]' },
      ]
      
      const linkMap = LinkParser.extractAllLinks(files)
      
      expect(linkMap.get('target')?.length).toBe(1)
    })

    it('应该处理空文件列表', () => {
      const linkMap = LinkParser.extractAllLinks([])
      expect(linkMap.size).toBe(0)
    })
  })

  describe('findBacklinks', () => {
    it('应该找到反向链接', () => {
      const files = [
        { name: 'target.md', content: '目标文件内容' },
        { name: 'source.md', content: '链接到 [[target]]' },
        { name: 'other.md', content: '没有链接' },
      ]
      
      const backlinks = LinkParser.findBacklinks('target.md', files)
      
      expect(backlinks.length).toBe(1)
      expect(backlinks[0].fileName).toBe('source.md')
    })

    it('应该返回上下文', () => {
      const files = [
        { name: 'source.md', content: '第一行\n链接到 [[target]]\n第三行' },
      ]
      
      const backlinks = LinkParser.findBacklinks('target.md', files)
      
      expect(backlinks[0].context).toContain('第一行')
      expect(backlinks[0].context).toContain('链接到 [[target]]')
      expect(backlinks[0].context).toContain('第三行')
    })

    it('应该排除目标文件本身', () => {
      const files = [
        { name: 'target.md', content: '链接到 [[target]]' },
      ]
      
      const backlinks = LinkParser.findBacklinks('target.md', files)
      
      expect(backlinks.length).toBe(0)
    })

    it('应该处理没有反向链接的情况', () => {
      const files = [
        { name: 'target.md', content: '目标文件' },
        { name: 'other.md', content: '没有链接' },
      ]
      
      const backlinks = LinkParser.findBacklinks('target.md', files)
      
      expect(backlinks.length).toBe(0)
    })

    it('应该处理带 .md 扩展名的目标文件', () => {
      const files = [
        { name: 'source.md', content: '链接到 [[my-note]]' },
      ]
      
      const backlinks = LinkParser.findBacklinks('my-note.md', files)
      
      expect(backlinks.length).toBe(1)
    })
  })

  describe('extractAllTags', () => {
    it('应该从多个文件中提取所有标签', () => {
      const files = [
        { name: 'file1.md', content: '#工作 #重要' },
        { name: 'file2.md', content: '#工作 #项目' },
        { name: 'file3.md', content: '#个人' },
      ]
      
      const tagMap = LinkParser.extractAllTags(files)
      
      expect(tagMap.get('工作')?.length).toBe(2)
      expect(tagMap.get('重要')).toContain('file1.md')
      expect(tagMap.get('项目')).toContain('file2.md')
      expect(tagMap.get('个人')).toContain('file3.md')
    })

    it('应该处理空文件列表', () => {
      const tagMap = LinkParser.extractAllTags([])
      expect(tagMap.size).toBe(0)
    })
  })

  describe('findFilesByTag', () => {
    it('应该根据标签查找文件', () => {
      const files = [
        { name: 'file1.md', content: '#工作 任务' },
        { name: 'file2.md', content: '#工作 项目' },
        { name: 'file3.md', content: '#个人' },
      ]
      
      const results = LinkParser.findFilesByTag('工作', files)
      
      expect(results.length).toBe(2)
      expect(results.find(r => r.fileName === 'file1.md')).toBeDefined()
      expect(results.find(r => r.fileName === 'file2.md')).toBeDefined()
    })

    it('应该返回匹配的标签文本', () => {
      const files = [
        { name: 'file1.md', content: '#工作 #工作' },
      ]
      
      const results = LinkParser.findFilesByTag('工作', files)
      
      expect(results[0].matches.length).toBe(2)
    })

    it('应该忽略大小写', () => {
      const files = [
        { name: 'file1.md', content: '#WORK' },
      ]
      
      const results = LinkParser.findFilesByTag('work', files)
      
      expect(results.length).toBe(1)
    })

    it('应该处理没有匹配的情况', () => {
      const files = [
        { name: 'file1.md', content: '#工作' },
      ]
      
      const results = LinkParser.findFilesByTag('不存在的标签', files)
      
      expect(results.length).toBe(0)
    })
  })

  describe('resolveLink', () => {
    const workspaceFiles = [
      '2026-03-16 PLAN.md',
      '2026-03-16.md',
      '项目计划.md',
      '会议记录.md',
      'Daily Note&Plan/2026-03-16.md',
    ]

    it('应该精确匹配文件名', () => {
      const result = LinkParser.resolveLink('2026-03-16 PLAN', workspaceFiles)
      expect(result).toBe('2026-03-16 PLAN.md')
    })

    it('应该匹配不带扩展名的文件', () => {
      const result = LinkParser.resolveLink('2026-03-16', workspaceFiles)
      expect(result).toBe('2026-03-16.md')
    })

    it('应该匹配中文文件名', () => {
      const result = LinkParser.resolveLink('项目计划', workspaceFiles)
      expect(result).toBe('项目计划.md')
    })

    it('应该返回 null 如果文件不存在', () => {
      const result = LinkParser.resolveLink('不存在的文件', workspaceFiles)
      expect(result).toBeNull()
    })

    it('应该忽略大小写', () => {
      const result = LinkParser.resolveLink('2026-03-16 plan', workspaceFiles)
      expect(result).toBe('2026-03-16 PLAN.md')
    })

    it('应该处理带 .md 扩展名的链接', () => {
      const result = LinkParser.resolveLink('项目计划.md', workspaceFiles)
      expect(result).toBe('项目计划.md')
    })

    it('应该模糊匹配部分文件名', () => {
      const result = LinkParser.resolveLink('会议', workspaceFiles)
      expect(result).toBe('会议记录.md')
    })
  })
})

describe('Wiki Link 正则表达式', () => {
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

  it('应该匹配简单的 wiki link', () => {
    const text = '这是一个 [[2026-03-16 PLAN]] 链接'
    const matches = [...text.matchAll(regex)]
    expect(matches.length).toBe(1)
    expect(matches[0][1]).toBe('2026-03-16 PLAN')
    expect(matches[0][2]).toBeUndefined()
  })

  it('应该匹配带别名的 wiki link', () => {
    const text = '这是一个 [[项目计划|项目]] 链接'
    const matches = [...text.matchAll(regex)]
    expect(matches.length).toBe(1)
    expect(matches[0][1]).toBe('项目计划')
    expect(matches[0][2]).toBe('项目')
  })

  it('应该匹配多个 wiki link', () => {
    const text = '[[链接1]] 和 [[链接2|别名]] 和 [[链接3]]'
    const matches = [...text.matchAll(regex)]
    expect(matches.length).toBe(3)
    expect(matches[0][1]).toBe('链接1')
    expect(matches[1][1]).toBe('链接2')
    expect(matches[1][2]).toBe('别名')
    expect(matches[2][1]).toBe('链接3')
  })

  it('应该匹配带空格的目标', () => {
    const text = '[[Daily Note/2026-03-16]]'
    const matches = [...text.matchAll(regex)]
    expect(matches.length).toBe(1)
    expect(matches[0][1]).toBe('Daily Note/2026-03-16')
  })

  it('应该匹配带特殊字符的目标', () => {
    const text = '[[文件-名称_测试]]'
    const matches = [...text.matchAll(regex)]
    expect(matches.length).toBe(1)
    expect(matches[0][1]).toBe('文件-名称_测试')
  })
})
