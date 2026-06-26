/** Normalize ACP model list shapes (Gemini uses availableModels + modelId). */
export interface NormalizedAcpModel {
  id: string
  name: string
}

export function normalizeAcpModels(raw: unknown): {
  models: NormalizedAcpModel[]
  currentModelId?: string
} {
  if (!raw || typeof raw !== 'object') return { models: [] }

  const data = raw as Record<string, unknown>

  if (Array.isArray(data.models) && data.models.length > 0) {
    const first = data.models[0] as Record<string, unknown>
    if (first && (typeof first.id === 'string' || typeof first.modelId === 'string')) {
      const models = (data.models as Record<string, unknown>[]).map((m) => ({
        id: String(m.id || m.modelId || ''),
        name: String(m.name || m.id || m.modelId || ''),
      })).filter((m) => m.id)
      const current = data.currentModelId ?? (data.currentModel as Record<string, unknown> | undefined)?.modelId
      return {
        models,
        currentModelId: typeof current === 'string' ? current : undefined,
      }
    }
  }

  if (Array.isArray(data.availableModels)) {
    const models = (data.availableModels as Record<string, unknown>[]).map((m) => ({
      id: String(m.modelId || m.id || ''),
      name: String(m.name || m.modelId || m.id || ''),
    })).filter((m) => m.id)
    const current = data.currentModelId ?? (data.currentModel as Record<string, unknown> | undefined)?.modelId
    return {
      models,
      currentModelId: typeof current === 'string' ? current : undefined,
    }
  }

  return { models: [] }
}

export function pickGeminiAutoModelId(models: NormalizedAcpModel[]): string | null {
  const auto = models.find((m) => /^auto$/i.test(m.id) || /^auto$/i.test(m.name))
  return auto?.id || null
}
