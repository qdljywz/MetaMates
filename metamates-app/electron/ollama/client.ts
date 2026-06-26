export interface OllamaModel {
  name: string
  size?: number
  modified_at?: string
}

export interface OllamaStatus {
  running: boolean
  baseUrl: string
  models: OllamaModel[]
  error?: string
}

export async function checkOllamaHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function listOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    throw new Error(`Ollama API ${res.status}`)
  }
  const data = (await res.json()) as { models?: OllamaModel[] }
  return data.models || []
}

export async function getOllamaStatus(baseUrl = 'http://127.0.0.1:11434'): Promise<OllamaStatus> {
  try {
    const models = await listOllamaModels(baseUrl)
    return { running: true, baseUrl, models }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { running: false, baseUrl, models: [], error: message }
  }
}
