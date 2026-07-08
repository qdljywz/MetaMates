import { describe, expect, it } from 'vitest'
import {
  STARTUP_FORCE_ENTER_MS,
  STARTUP_SKIP_AGENT_WAIT,
  hasOnboardingSettings,
  shouldCloseWorkspacePicker,
  shouldOpenWorkspacePicker,
  shouldShowWelcomeWizard,
} from '../utils/startupUx'

describe('startup UX guardrails', () => {
  it('caps splash at 4 seconds', () => {
    expect(STARTUP_FORCE_ENTER_MS).toBe(4_000)
  })

  it('never blocks splash on agent warmup', () => {
    expect(STARTUP_SKIP_AGENT_WAIT).toBe(true)
  })

  it('opens workspace picker only when restore failed', () => {
    expect(shouldOpenWorkspacePicker(true, false)).toBe(true)
    expect(shouldOpenWorkspacePicker(true, true)).toBe(false)
    expect(shouldOpenWorkspacePicker(false, false)).toBe(false)
  })

  it('closes workspace picker when path exists on disk', () => {
    expect(shouldCloseWorkspacePicker('E:/vault', true)).toBe(true)
    expect(shouldCloseWorkspacePicker('E:/vault', false)).toBe(false)
    expect(shouldCloseWorkspacePicker('', true)).toBe(false)
    expect(shouldCloseWorkspacePicker(undefined, true)).toBe(false)
  })
})

describe('shouldShowWelcomeWizard', () => {
  it('skips wizard when workspace was restored', () => {
    expect(
      shouldShowWelcomeWizard({
        hasOnboardingSettings: false,
        workspaceRestored: true,
        workspacePath: 'E:\\MyM2',
      }),
    ).toBe(false)
  })

  it('skips wizard when workspacePath is saved even if not restored yet', () => {
    expect(
      shouldShowWelcomeWizard({
        hasOnboardingSettings: false,
        workspaceRestored: false,
        workspacePath: 'E:\\MyM2',
      }),
    ).toBe(false)
  })

  it('shows wizard only for brand-new users', () => {
    expect(
      shouldShowWelcomeWizard({
        hasOnboardingSettings: false,
        workspaceRestored: false,
        workspacePath: '',
      }),
    ).toBe(true)
  })

  it('hasOnboardingSettings detects completed onboarding', () => {
    expect(hasOnboardingSettings({ theme: 'dark' })).toBe(true)
    expect(hasOnboardingSettings({})).toBe(false)
  })
})
