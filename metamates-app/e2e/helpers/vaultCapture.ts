import { expect, type Page } from '@playwright/test'

export const E2E_VAULT_API_PORT = 17333

export interface VaultCaptureResult {
  status: number
  data: { success?: boolean; path?: string; file?: string; error?: string }
}

/** Start Vault API on the default E2E port (idempotent if already running). */
export async function ensureVaultApiRunning(
  page: Page,
  workspace: string,
  port = E2E_VAULT_API_PORT,
): Promise<number> {
  const startedPort = await page.evaluate(
    async ({ ws, port: p }) => {
      const api = window.electronAPI?.vaultApi
      if (!api?.start) throw new Error('vaultApi IPC missing')
      const status = await api.getStatus?.()
      if (status?.running && status.port === p) return p
      const result = await api.start(ws, p, undefined, false)
      if (!result?.success) throw new Error(result?.error || 'Vault API start failed')
      return result.port ?? p
    },
    { ws: workspace, port },
  )

  await expect
    .poll(
      async () =>
        page.evaluate(async (p) => {
          const res = await fetch(`http://127.0.0.1:${p}/health`)
          return res.ok
        }, startedPort),
      { timeout: 15_000 },
    )
    .toBe(true)

  return startedPort
}

export async function postVaultCapture(
  page: Page,
  port: number,
  body: { text: string; title?: string; url?: string },
): Promise<VaultCaptureResult> {
  return page.evaluate(
    async ({ p, payload }) => {
      const res = await fetch(`http://127.0.0.1:${p}/api/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      return { status: res.status, data }
    },
    { p: port, payload: body },
  )
}
