import { describe, expect, it } from 'vitest'
import { normalizeAcpModels, pickGeminiAutoModelId } from '../../electron/shared/acpModels'

describe('acpModels', () => {
  it('normalizes Gemini availableModels shape', () => {
    const result = normalizeAcpModels({
      availableModels: [
        { modelId: 'auto', name: 'Auto' },
        { modelId: 'gemini-2.5-pro', name: 'gemini-2.5-pro' },
      ],
      currentModelId: 'gemini-2.5-pro',
    })
    expect(result.models).toHaveLength(2)
    expect(result.models[0]).toEqual({ id: 'auto', name: 'Auto' })
    expect(result.currentModelId).toBe('gemini-2.5-pro')
    expect(pickGeminiAutoModelId(result.models)).toBe('auto')
  })

  it('passes through standard models array', () => {
    const result = normalizeAcpModels({
      models: [{ id: 'claude-sonnet', name: 'Sonnet' }],
    })
    expect(result.models[0].id).toBe('claude-sonnet')
  })
})
