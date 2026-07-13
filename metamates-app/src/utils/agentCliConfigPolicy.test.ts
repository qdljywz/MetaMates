import { describe, expect, it } from 'vitest'

import {
  hasAnthropicCredentialInRecord,
  isClaudeModelCliLocked,
  isClaudeModelPickerLocked,
  isValidAnthropicCredential,
  maskSecret,
  pickClaudeConfigSource,
  shouldSkipClaudeSessionResume,
  summarizeClaudeProvenance,
} from '../../electron/shared/agentCliConfigPolicy'

describe('agentCliConfigPolicy', () => {
  it('locks Claude model when ANTHROPIC_MODEL is in settings.json env', () => {
    const env = { ANTHROPIC_MODEL: 'glm-5.2' }
    expect(isClaudeModelCliLocked(env)).toBe(true)
    expect(shouldSkipClaudeSessionResume(env)).toBe(true)
  })

  it('skips resume for proxy base URL without explicit model', () => {
    const env = {
      ANTHROPIC_BASE_URL: 'https://dashscope.aliyuncs.com/apps/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'sk-test-token-12345678',
    }
    expect(isClaudeModelCliLocked(env)).toBe(false)
    expect(isClaudeModelPickerLocked(env)).toBe(true)
    expect(shouldSkipClaudeSessionResume(env)).toBe(true)
  })

  it('summarizes provenance from settings env', () => {
    const env = {
      ANTHROPIC_MODEL: 'glm-5.2',
      ANTHROPIC_BASE_URL: 'https://dashscope.aliyuncs.com/apps/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'sk-test-token-12345678',
    }
    expect(summarizeClaudeProvenance(env)).toEqual({
      model: '~/.claude/settings.json env.ANTHROPIC_MODEL',
      auth: '~/.claude/settings.json env.ANTHROPIC_AUTH_TOKEN',
      baseUrl: '~/.claude/settings.json env.ANTHROPIC_BASE_URL',
    })
  })

  it('picks cli-settings when settings file has credentials', () => {
    expect(
      pickClaudeConfigSource({
        settingsFileEnv: { ANTHROPIC_AUTH_TOKEN: 'sk-test-token-12345678' },
        oauthLoggedIn: false,
        processEnvHasCredential: false,
      }),
    ).toBe('cli-settings')
  })

  it('picks cli-oauth when only oauth is available', () => {
    expect(
      pickClaudeConfigSource({
        settingsFileEnv: {},
        oauthLoggedIn: true,
        processEnvHasCredential: false,
      }),
    ).toBe('cli-oauth')
  })

  it('validates anthropic credentials', () => {
    expect(isValidAnthropicCredential('short')).toBe(false)
    expect(isValidAnthropicCredential('sk-test-token-12345678')).toBe(true)
    expect(hasAnthropicCredentialInRecord({ ANTHROPIC_AUTH_TOKEN: 'sk-test-token-12345678' })).toBe(true)
  })

  it('masks secrets for display', () => {
    expect(maskSecret('sk-test-token-12345678')).toBe('********5678')
    expect(maskSecret('')).toBeNull()
  })
})
