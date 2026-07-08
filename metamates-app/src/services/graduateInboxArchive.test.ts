import { describe, expect, it, vi } from 'vitest'
import { extractInboxMarkdownCandidates } from './graduateInboxArchive'

describe('extractInboxMarkdownCandidates', () => {
  it('extracts inbox markdown paths from assistant output', () => {
    const text = `
      已处理以下条目：
      - 01_日记与计划/Inbox/idea-a.md
      - [[01_日记与计划/Inbox/idea-b.md]]
      - E:/Vault/01_日记与计划/Inbox/idea-c.md
    `
    expect(extractInboxMarkdownCandidates(text)).toEqual([
      '01_日记与计划/Inbox/idea-a.md',
      '01_日记与计划/Inbox/idea-b.md',
      'E:/Vault/01_日记与计划/Inbox/idea-c.md',
    ])
  })

  it('returns empty list when no inbox candidates', () => {
    expect(extractInboxMarkdownCandidates('no paths')).toEqual([])
  })

  it('strips 来源 prefix from cited paths', () => {
    expect(extractInboxMarkdownCandidates('来源：01_日记与计划/Inbox/test.md')).toEqual([
      '01_日记与计划/Inbox/test.md',
    ])
  })
})

describe('archiveGraduatedInboxNotes', () => {
  it('moves cited relative inbox path to processed', async () => {
    const renamed: { from: string; to: string }[] = []
    vi.stubGlobal('window', {
      electronAPI: {
        path: {
          join: async (...parts: string[]) => parts.join('\\').replace(/\\+/g, '\\'),
        },
        createDirectory: async () => {},
        fileExists: async (p: string) => ({
          exists: /Inbox[\\/]test\.md/i.test(p.replace(/\//g, '\\')) && !/processed/i.test(p),
        }),
        renameFile: async (from: string, to: string) => {
          renamed.push({ from, to })
          return { success: true }
        },
      },
    })

    const { archiveGraduatedInboxNotes } = await import('./graduateInboxArchive')
    const result = await archiveGraduatedInboxNotes({
      workspacePath: 'E:\\MyM2',
      language: 'zh',
      sourceTexts: ['来源：01_日记与计划/Inbox/test.md'],
    })

    expect(result.moved.length).toBe(1)
    expect(renamed.length).toBe(1)
    expect(renamed[0]?.to).toContain('processed')
  })
})
