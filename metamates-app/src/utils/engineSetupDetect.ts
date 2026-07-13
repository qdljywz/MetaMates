/**
 * Detect whether an installed assistant is enabled for the thinking engine.
 */
export async function detectHasUsableAgent(
  cliAgentEnabled?: Record<string, boolean>,
): Promise<boolean> {
  if (!window.electronAPI?.acp?.detectAgents) return false
  try {
    const agents = await window.electronAPI.acp.detectAgents()
    if (!agents?.length) return false
    return agents.some((a) => {
      if (cliAgentEnabled && a.backend in cliAgentEnabled && cliAgentEnabled[a.backend] === false) {
        return false
      }
      return true
    })
  } catch {
    return false
  }
}

/**
 * Check auth for the selected backend via runtime snapshot.
 */
export async function detectBackendAuthOk(backend: string): Promise<boolean> {
  try {
    const list = await window.electronAPI?.acp?.getAllAgentRuntimes?.()
    const runtime = list?.find((r) => r.backend === backend)
    if (!runtime) return false
    return runtime.cliInstalled && runtime.display.authOk
  } catch {
    return false
  }
}

/**
 * Connect assistant after setup.
 */
export async function connectEngineBackend(backend: string): Promise<boolean> {
  if (!window.electronAPI?.acp) return false
  try {
    await window.electronAPI.acp.connect(backend, { autoStart: true })
    await window.electronAPI.acp.newSession(backend)
    return true
  } catch {
    return false
  }
}
