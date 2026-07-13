// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useAgentRuntime } from '../hooks/useAgentRuntime'

describe('useAgentRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.electronAPI = {
      ...(window.electronAPI as any),
      acp: {
        ...(window.electronAPI?.acp as any),
        getAgentRuntime: vi.fn(async () => ({
          backend: 'claude',
          cliInstalled: true,
          source: 'cli-settings',
          display: {
            effectiveModel: 'glm-5.2',
            effectiveBaseUrl: 'https://example.com',
            authOk: true,
            authMethod: 'env',
            authHint: '',
            provenanceModel: '~/.claude/settings.json env.ANTHROPIC_MODEL',
            provenanceAuth: null,
            provenanceBaseUrl: null,
            settingsPath: null,
          },
          capabilities: {
            canSwitchModel: false,
            canSwitchMode: true,
            skipSessionResume: true,
          },
        })),
        getModels: vi.fn(async () => ({
          models: [{ id: 'claude-sonnet-4-6', name: 'Sonnet' }],
        })),
        getMode: vi.fn(async () => ({ mode: 'default' })),
        setMode: vi.fn(async () => ({})),
        setModel: vi.fn(async () => ({})),
        getAvailableCommands: vi.fn(async () => []),
      },
    }
  })

  it('locks model display when runtime says CLI owns model', async () => {
    const { result } = renderHook(() => useAgentRuntime())
    const setModels = vi.fn()
    const setSelectedModel = vi.fn()
    const setSelectedMode = vi.fn()

    await act(async () => {
      await result.current.applyRuntimeMetadata({
        backend: 'claude',
        persistAcpPreference: vi.fn(async () => {}),
        setSelectedMode,
        setModels,
        setSelectedModel,
      })
    })

    expect(result.current.modelReadOnly).toBe(true)
    expect(result.current.modelProvenance).toContain('settings.json')
    expect(setSelectedModel).toHaveBeenCalledWith('glm-5.2')
    expect(window.electronAPI?.acp.setModel).toHaveBeenCalledWith('glm-5.2')
  })

  it('resets read-only state', () => {
    const { result } = renderHook(() => useAgentRuntime())
    act(() => {
      result.current.resetModelRuntime()
    })
    expect(result.current.modelReadOnly).toBe(false)
    expect(result.current.modelProvenance).toBeNull()
  })
})
