import type { BrowserWindow } from 'electron'
import { evaluateAgentReadiness, type AgentReadinessSnapshot } from './agentReadiness'
import type { BackendConnection } from './AcpConnection'

let statusWindow: BrowserWindow | null = null

export function setConnectionStatusWindow(win: BrowserWindow | null): void {
  statusWindow = win
}

export async function pushConnectionStatus(
  backendId: string,
  conn: BackendConnection | undefined,
): Promise<AgentReadinessSnapshot> {
  const snapshot = await evaluateAgentReadiness(backendId, conn)
  const win = statusWindow
  if (win && !win.isDestroyed()) {
    win.webContents.send('acp-connection-status', { backend: backendId, snapshot })
  }
  return snapshot
}

export function emitAgentLifecycle(
  backendId: string,
  status: AgentReadinessSnapshot['lifecycle'],
  detail?: { error?: string },
): void {
  const win = statusWindow
  if (!win || win.isDestroyed()) return
  win.webContents.send('agent-status', {
    backend: backendId,
    status,
    error: detail?.error,
  })
}
