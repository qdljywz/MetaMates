import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import type { ElectronApplication, Page } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const APP_ROOT = path.join(__dirname, '..')

export function prepareE2EWorkspace(root = path.join(APP_ROOT, 'e2e', '.workspace')): string {
  fs.mkdirSync(path.join(root, '01_日记与计划', 'Inbox'), { recursive: true })
  return root
}

export async function waitForHttp(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(url, { timeout: 3000 }, (res) => {
          res.resume()
          if (res.statusCode && res.statusCode < 500) resolve()
          else reject(new Error(`HTTP ${res.statusCode}`))
        })
        req.on('error', reject)
      })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`timeout waiting for ${url}`)
}

export async function ensureViteDevServer(): Promise<ChildProcess | null> {
  const url = 'http://127.0.0.1:3000/'
  try {
    await waitForHttp(url, 3000)
    return null
  } catch {
    const proc = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '3000', '--strictPort'], {
      cwd: APP_ROOT,
      stdio: 'ignore',
      shell: true,
      env: { ...process.env },
    })
    await waitForHttp(url, 90_000)
    return proc
  }
}

export async function launchMetaMatesApp(
  electron: { launch: (opts: Record<string, unknown>) => Promise<ElectronApplication> },
  workspacePath: string,
): Promise<{ app: ElectronApplication; page: Page; viteProc: ChildProcess | null }> {
  const viteProc = await ensureViteDevServer()
  const app = await electron.launch({
    args: ['.'],
    cwd: APP_ROOT,
    timeout: 120_000,
    env: {
      ...process.env,
      METAMATES_E2E: '1',
      METAMATES_WORKSPACE: workspacePath,
      NODE_ENV: 'development',
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 }).catch(() => {})
  await page.waitForSelector('[data-testid="agent-toolbar"]', { timeout: 120_000 })
  return { app, page, viteProc }
}

export async function waitForAgentConnected(page: Page, backend: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await page.evaluate(async (id) => {
      const api = window.electronAPI?.acp
      if (!api) return false
      const status = await api.getConnectionStatus?.(id)
      return status?.ready === true
    }, backend)
    if (ready) return
    await page.waitForTimeout(1500)
  }
  throw new Error(`Agent ${backend} not connected within ${timeoutMs}ms`)
}

export async function stopVite(proc: ChildProcess | null): Promise<void> {
  if (!proc || proc.killed) return
  proc.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 1500))
  if (!proc.killed) proc.kill('SIGKILL')
}
