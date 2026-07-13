import { describe, expect, it, vi } from 'vitest'
import {
  archiveProcessedInboxNotes,
  extractInboxMarkdownCandidates,
  isActiveInboxNotePath,
} from './graduateInboxArchive'

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

describe('isActiveInboxNotePath', () => {
  it('accepts direct inbox child and rejects processed subfolder', () => {
    const inbox = 'E:/Vault/01_日记与计划/Inbox'
    expect(isActiveInboxNotePath(inbox, 'E:/Vault/01_日记与计划/Inbox/clip.md')).toBe(true)
    expect(isActiveInboxNotePath(inbox, 'E:/Vault/01_日记与计划/Inbox/processed/clip.md')).toBe(false)
    expect(isActiveInboxNotePath(inbox, 'E:/Vault/01_日记与计划/Inbox/nested/clip.md')).toBe(false)
  })
})

describe('archiveProcessedInboxNotes', () => {
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

    const { archiveProcessedInboxNotes } = await import('./graduateInboxArchive')
    const result = await archiveProcessedInboxNotes({
      workspacePath: 'E:\\MyM2',
      language: 'zh',
      sourceTexts: ['来源：01_日记与计划/Inbox/test.md'],
    })

    expect(result.moved.length).toBe(1)
    expect(renamed.length).toBe(1)
    expect(renamed[0]?.to).toContain('processed')
  })

  it('moves explicit inbox path after /intel', async () => {
    const renamed: { from: string; to: string }[] = []
    vi.stubGlobal('window', {
      electronAPI: {
        path: {
          join: async (...parts: string[]) => parts.join('\\').replace(/\\+/g, '\\'),
        },
        createDirectory: async () => {},
        fileExists: async (p: string) => ({
          exists: /Inbox[\\/]clip\.md/i.test(p.replace(/\//g, '\\')) && !/processed/i.test(p),
        }),
        renameFile: async (from: string, to: string) => {
          renamed.push({ from, to })
          return { success: true }
        },
      },
    })

    const { archiveProcessedInboxNotes } = await import('./graduateInboxArchive')
    const result = await archiveProcessedInboxNotes({
      workspacePath: 'E:\\MyM2',
      language: 'zh',
      explicitPaths: ['E:/MyM2/01_日记与计划/Inbox/clip.md'],
    })

    expect(result.moved.length).toBe(1)
    expect(renamed[0]?.to).toContain('processed')
  })
})
