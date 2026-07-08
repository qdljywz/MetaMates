/**
 * Electron E2E: UI chat → Agent Write → file on disk.
 * Requires CodeBuddy CLI installed. Skips when unavailable.
 *
 * Run: RUN_AGENT_E2E=1 npm run test:e2e -- e2e/agent-write.e2e.ts
 */
import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  APP_ROOT,
  launchMetaMatesApp,
  prepareE2EWorkspace,
  stopVite,
  waitForAgentConnected,
} from './helpers/electron-app.js'

const BACKEND = process.env.METAMATES_E2E_BACKEND || 'codebuddy'
const WORKSPACE = prepareE2EWorkspace()

async function isBackendInstalled(): Promise<boolean> {
  const { pathToFileURL } = await import('url')
  const mod = await import(pathToFileURL(path.join(APP_ROOT, 'dist-electron/acp/AcpDetector.cjs')).href)
  await mod.acpDetector.initialize(true)
  return mod.acpDetector.getDetectedAgents().some((a: { backend: string }) => a.backend === BACKEND)
}

test.describe('Agent Write (Electron UI)', () => {
  test.beforeAll(async () => {
    if (process.env.RUN_AGENT_E2E !== '1') {
      test.skip()
    }
    const { execSync } = await import('child_process')
    execSync('npm run electron:compile', { cwd: APP_ROOT, stdio: 'pipe' })
    const installed = await isBackendInstalled()
    if (!installed) {
      test.skip(true, `${BACKEND} CLI not installed`)
    }
  })

  test('send prompt in UI and verify Write lands on disk', async () => {
    const marker = `E2E_WRITE_${Date.now()}`
    const relPath = `01_日记与计划/Inbox/_metamates_e2e_write.md`
    const absPath = path.join(WORKSPACE, relPath.replace(/\//g, path.sep))
    try { fs.unlinkSync(absPath) } catch {}

    let app: Awaited<ReturnType<typeof electron.launch>> | undefined
    let page
    let viteProc = null
    try {
      ;({ app, page, viteProc } = await launchMetaMatesApp(electron, WORKSPACE))

      await page.click(`[data-testid="agent-sidebar-${BACKEND}"]`)
      await waitForAgentConnected(page, BACKEND, 240_000)

      const prompt = [
        '请使用 Write 工具写入文件（只写一次）。',
        `相对路径：${relPath}`,
        `文件内容必须恰好一行：${marker}`,
        '写完后回复 DONE。',
      ].join('')

      await page.fill('[data-testid="chat-input"]', prompt)
      await page.click('[data-testid="send-button"]')

      const deadline = Date.now() + 360_000
      let content = ''
      while (Date.now() < deadline) {
        if (fs.existsSync(absPath)) {
          content = fs.readFileSync(absPath, 'utf-8').trim()
          if (content.includes(marker)) break
        }
        await page.waitForTimeout(2000)
      }

      expect(content, `Expected file at ${absPath}`).toContain(marker)
    } finally {
      if (app) await app.close().catch(() => {})
      await stopVite(viteProc)
      try { fs.unlinkSync(absPath) } catch {}
    }
  })
})
