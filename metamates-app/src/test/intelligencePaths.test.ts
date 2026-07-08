import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  ensureIntelligenceMemoryLayout,
  getIntelligenceReferenceDirRelative,
  getUserMemoryIndexRelative,
} from '../../electron/shared/intelligencePaths'

describe('intelligencePaths', () => {
  it('returns zh vault paths for user memory', () => {
    expect(getUserMemoryIndexRelative('zh')).toBe('04_情报与连接/记忆索引.md')
    expect(getIntelligenceReferenceDirRelative('zh')).toBe('04_情报与连接/参考/')
  })

  it('ensures memory index and reference dir in workspace', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-intel-'))
    const result = ensureIntelligenceMemoryLayout(tmp, 'zh')
    expect(result.success).toBe(true)
    expect(result.created).toContain('04_情报与连接/记忆索引.md')

    const indexPath = path.join(tmp, '04_情报与连接', '记忆索引.md')
    expect(fs.existsSync(indexPath)).toBe(true)
    expect(fs.readFileSync(indexPath, 'utf-8')).toContain('记忆索引')

    const refDir = path.join(tmp, '04_情报与连接', '参考')
    expect(fs.statSync(refDir).isDirectory()).toBe(true)

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
