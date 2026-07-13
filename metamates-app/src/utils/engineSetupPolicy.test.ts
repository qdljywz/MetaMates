import { describe, expect, it } from 'vitest'
import {
  buildCliEnabledPatch,
  getRecommendedEngineBackend,
  shouldShowEngineSetup,
  shouldShowVaultOnlyReminder,
} from './engineSetupPolicy'

describe('engineSetupPolicy', () => {
  it('recommends CodeBuddy for Chinese', () => {
    expect(getRecommendedEngineBackend('zh')).toBe('codebuddy')
    expect(getRecommendedEngineBackend('zh-CN')).toBe('codebuddy')
  })

  it('recommends Gemini for English', () => {
    expect(getRecommendedEngineBackend('en')).toBe('gemini')
  })

  it('shows setup when pending and no agent', () => {
    expect(
      shouldShowEngineSetup({
        workspacePath: 'E:/vault',
        engineSetupStatus: 'pending',
        hasUsableAgent: false,
      }),
    ).toBe(true)
  })

  it('hides setup for vault_only or ready', () => {
    expect(
      shouldShowEngineSetup({
        workspacePath: 'E:/vault',
        engineSetupStatus: 'vault_only',
        hasUsableAgent: false,
      }),
    ).toBe(false)
    expect(
      shouldShowEngineSetup({
        workspacePath: 'E:/vault',
        engineSetupStatus: 'ready',
        hasUsableAgent: false,
      }),
    ).toBe(false)
  })

  it('hides when agent already usable', () => {
    expect(
      shouldShowEngineSetup({
        workspacePath: 'E:/vault',
        engineSetupStatus: 'pending',
        hasUsableAgent: true,
      }),
    ).toBe(false)
  })

  it('buildCliEnabledPatch enables only selected backend', () => {
    expect(buildCliEnabledPatch('codebuddy', { gemini: true, codebuddy: false })).toEqual({
      gemini: false,
      codebuddy: true,
    })
  })
})

describe('shouldShowVaultOnlyReminder', () => {
  it('shows for vault_only without agent', () => {
    expect(
      shouldShowVaultOnlyReminder({
        engineSetupStatus: 'vault_only',
        hasUsableAgent: false,
      }),
    ).toBe(true)
  })

  it('hides when dismissed or agent available', () => {
    expect(
      shouldShowVaultOnlyReminder({
        engineSetupStatus: 'vault_only',
        hasUsableAgent: false,
        dismissedThisSession: true,
      }),
    ).toBe(false)
    expect(
      shouldShowVaultOnlyReminder({
        engineSetupStatus: 'vault_only',
        hasUsableAgent: true,
      }),
    ).toBe(false)
  })
})
