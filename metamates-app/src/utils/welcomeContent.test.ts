import { describe, expect, it } from 'vitest'
import { buildEditorWelcomeContent, isEditorWelcomeContent } from './welcomeContent'

const t = ((key: string) => key) as Parameters<typeof buildEditorWelcomeContent>[0]

describe('welcomeContent', () => {
  it('detects built-in welcome pages', () => {
    expect(isEditorWelcomeContent('# 欢迎使用 Metamates\n\nhello')).toBe(true)
    expect(isEditorWelcomeContent('# Welcome to Metamates\n\nhello')).toBe(true)
    expect(isEditorWelcomeContent('# My note')).toBe(false)
  })

  it('uses setup steps when no workspace', () => {
    const md = buildEditorWelcomeContent(t)
    expect(md).toContain('welcome.stepSetup1')
    expect(md).not.toContain('welcome.stepReady1')
  })

  it('uses ready steps when workspace is open', () => {
    const md = buildEditorWelcomeContent(t, 'E:/vault/MyM2')
    expect(md).toContain('welcome.stepReady1')
    expect(md).toContain('welcome.stepReady2')
    expect(md).not.toContain('welcome.stepSetup1')
  })

  it('shows auth steps when agent needs authentication', () => {
    const md = buildEditorWelcomeContent(t, 'E:/vault/MyM2', 'auth_required')
    expect(md).toContain('welcome.agentNeedsAuth')
    expect(md).toContain('welcome.stepAuth1')
    expect(md).not.toContain('welcome.stepReady1')
  })

  it('shows no-agent steps when no agent is enabled', () => {
    const md = buildEditorWelcomeContent(t, 'E:/vault/MyM2', 'no_agent')
    expect(md).toContain('welcome.agentNoAgent')
    expect(md).toContain('welcome.stepNoAgent1')
  })
})
