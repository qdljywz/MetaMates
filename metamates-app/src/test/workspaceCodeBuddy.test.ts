import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  buildCodeBuddySpawnEnv,
  ensureWorkspaceCodeBuddyConfig,
} from '../../electron/workspaceCodeBuddy'
import { buildWorkspacePathHints } from '../../electron/shared/skillPaths'

describe('workspaceCodeBuddy', () => {
  it('buildCodeBuddySpawnEnv anchors project dir in vault', () => {
    const env = buildCodeBuddySpawnEnv('E:\\MyM2')
    expect(env.CODEBUDDY_PROJECT_DIR).toBe('E:\\MyM2')
    expect(env.CODEBUDDY_TEAM_MEMORY_ENABLED).toBe('1')
  })

  it('ensureWorkspaceCodeBuddyConfig enables team memory in workspace', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-codebuddy-'))
    const result = ensureWorkspaceCodeBuddyConfig(tmp)
    expect(result.success).toBe(true)
    expect(result.created).toBe(true)
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, '.codebuddy', 'settings.json'), 'utf-8'),
    ) as { memory?: { teamMemory?: { enabled?: boolean } } }
    expect(settings.memory?.teamMemory?.enabled).toBe(true)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('path hints prioritize workspace .codebuddy/skills over user dir', () => {
    const hints = buildWorkspacePathHints('zh', 'E:\\MyM2')
    expect(hints).toContain('.codebuddy/skills/')
    expect(hints).toContain('禁止用 shell 写到 ~/.codebuddy/projects/')
    expect(hints).toContain('04_情报与连接/记忆索引.md')
    expect(hints).toContain('04_情报与连接/参考/')
  })
})
