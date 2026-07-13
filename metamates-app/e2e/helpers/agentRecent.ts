import { expect, type Page } from '@playwright/test'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'
import type { AgentRuntimeSnapshot } from '../../src/types/electron'
import {
  openSettingsAgentTab,
  selectAgentSidebar,
  waitForConnectionStatus,
} from './agentSettings'

export const LOG_AND_PLAN_DIR = WORKSPACE_LAYOUT.zh.LOG_AND_PLAN

/** E2E prefers stable CLIs — avoid Gemini/Codex connection flakes. */
export const PREFERRED_E2E_AGENT_BACKENDS = ['claude', 'codebuddy'] as const

const RETHINK_JSON_LEAK = /"questionText"/

export function pickPreferredBackends(installed: string[]): string[] {
  return PREFERRED_E2E_AGENT_BACKENDS.filter((b) => installed.includes(b))
}

/** Rethink backend order: CodeBuddy first (stable background), then Claude. */
export function rethinkBackendCandidates(installed: string[]): string[] {
  const order = ['codebuddy', 'claude'] as const
  return order.filter((b) => installed.includes(b))
}

/** Pick first installed preferred backend (claude → codebuddy). */
export function primaryPreferredBackend(installed: string[]): string | null {
  return pickPreferredBackends(installed)[0] ?? null
}

/** Secondary preferred backend for switch tests (codebuddy when both exist). */
export function secondaryPreferredBackend(installed: string[]): string | null {
  const preferred = pickPreferredBackends(installed)
  return preferred.length > 1 ? preferred[1]! : null
}

export async function setLastAgentBackend(page: Page, backend: string): Promise<void> {
  await page.evaluate(async (b) => {
    const api = window.electronAPI
    if (!api?.getSettings || !api?.saveSettings) return
    const settings = await api.getSettings()
    await api.saveSettings({ ...settings, lastAgentBackend: b })
  }, backend)
}

/**
 * Select claude then codebuddy; focus chat and wait for a non-error status.
 */
export async function selectAndWarmupPreferred(
  page: Page,
  installed: string[],
): Promise<{ backend: string; status: string | null } | null> {
  for (const backend of pickPreferredBackends(installed)) {
    const ok = await selectAgentSidebar(page, backend)
    if (!ok) continue
    await page.locator('[data-testid="chat-input"]').focus()
    const status = await waitForConnectionStatus(
      page,
      ['auth_required', 'connected', 'connecting', 'disconnected', 'error'],
      45_000,
    )
    if (status && status !== 'error') {
      return { backend, status }
    }
  }
  return null
}

/** Installed agent backends from sidebar buttons. */
export async function listDetectedAgentBackends(page: Page): Promise<string[]> {
  const buttons = page.locator('[data-testid^="agent-sidebar-"]')
  const count = await buttons.count()
  const backends: string[] = []
  for (let i = 0; i < count; i += 1) {
    const testId = await buttons.nth(i).getAttribute('data-testid')
    const match = testId?.match(/^agent-sidebar-(.+)$/)
    if (match?.[1]) backends.push(match[1])
  }
  return backends
}

export async function fetchAgentRuntime(
  page: Page,
  backend: string,
): Promise<AgentRuntimeSnapshot | null> {
  return page.evaluate(async (b) => {
    const api = window.electronAPI?.acp
    if (!api?.getAgentRuntime) return null
    try {
      return await api.getAgentRuntime(b)
    } catch {
      return null
    }
  }, backend)
}

export async function fetchAllAgentRuntimes(page: Page): Promise<AgentRuntimeSnapshot[]> {
  return page.evaluate(async () => {
    const api = window.electronAPI?.acp
    if (!api?.getAllAgentRuntimes) return []
    try {
      return (await api.getAllAgentRuntimes()) ?? []
    } catch {
      return []
    }
  })
}

/** Agent bubbles that leaked empty-state rethink JSON into chat. */
export async function countRethinkJsonLeaksInChat(page: Page): Promise<number> {
  const messages = page.locator('[data-testid="agent-message"]')
  const count = await messages.count()
  let leaks = 0
  for (let i = 0; i < count; i += 1) {
    const text = (await messages.nth(i).innerText()).trim()
    if (RETHINK_JSON_LEAK.test(text)) leaks += 1
  }
  return leaks
}

export async function expectNoRethinkJsonInAgentChat(page: Page): Promise<void> {
  await expect(async () => {
    expect(await countRethinkJsonLeaksInChat(page)).toBe(0)
  }).toPass({ timeout: 5_000, intervals: [300] })
}

export async function expectEmptyStateQuestionNotRawJson(page: Page): Promise<void> {
  const question = page.locator('[data-testid="editor-empty-state-question"]')
  if (!(await question.count())) return
  const text = (await question.innerText()).trim()
  expect(text.length).toBeGreaterThan(0)
  expect(RETHINK_JSON_LEAK.test(text)).toBe(false)
  expect(text.startsWith('{')).toBe(false)
}

/**
 * Force a full empty-state rethink (significant fingerprint bump + vault marker).
 * Returns poll token: ok-debug | ok-cache | ok-ui | pending.
 */
export async function forceEmptyStateRethink(
  page: Page,
  workspace: string,
  beforeQuestion: string,
  timeoutMs = 150_000,
  options?: { requireComplete?: boolean },
): Promise<string> {
  await page.evaluate(async ({ ws, dir }) => {
    localStorage.removeItem('metamates-empty-state-rethink-debug')
    const api = window.electronAPI
    if (!api?.path?.join || !api.writeFile || !api.createDirectory) return
    const key = ws.replace(/\\/g, '/').toLowerCase()
    const raw = localStorage.getItem('metamates-empty-state-v1')
    if (raw) {
      const store = JSON.parse(raw) as Record<string, unknown>
      const entry = store[key] as Record<string, unknown> | undefined
      if (entry) {
        entry.significantFingerprint = '__force-full-rethink__'
        localStorage.setItem('metamates-empty-state-v1', JSON.stringify(store))
      }
    }
    const markerDir = await api.path.join(ws, dir, 'Inbox')
    await api.createDirectory(markerDir)
    const markerPath = await api.path.join(markerDir, `_e2e_rethink_${Date.now()}.md`)
    await api.writeFile(markerPath, '# e2e agent recent rethink marker')
    window.dispatchEvent(new CustomEvent('metamates:empty-state-force-refresh'))
  }, { ws: workspace, dir: LOG_AND_PLAN_DIR })

  let last = 'pending'
  try {
    await expect.poll(async () => {
      last = await page.evaluate(({ ws, before }) => {
        const debug = localStorage.getItem('metamates-empty-state-rethink-debug') || ''
        if (/^ok:/.test(debug)) return 'ok-debug'
        const key = ws.replace(/\\/g, '/').toLowerCase()
        const raw = localStorage.getItem('metamates-empty-state-v1')
        if (raw) {
          const store = JSON.parse(raw) as Record<string, Record<string, unknown>>
          const entry = store[key]
          const qt = typeof entry?.questionText === 'string' ? entry.questionText.trim() : ''
          if (qt && qt !== before && !/"questionText"/.test(qt)) return 'ok-cache'
        }
        const ui = document.querySelector('[data-testid="editor-empty-state-question"]')?.textContent?.trim() || ''
        if (ui && ui !== before && !/"questionText"/.test(ui) && !ui.startsWith('{')) return 'ok-ui'
        return debug || 'pending'
      }, { ws: workspace, before: beforeQuestion })
      return last
    }, { timeout: timeoutMs }).toMatch(/^ok-/)
  } catch {
    if (options?.requireComplete !== false) throw new Error(`empty-state rethink did not complete (${last})`)
  }
  return last
}

export async function exerciseLazyAuthOnSend(page: Page, backend: string): Promise<'modal' | 'banner' | 'skipped'> {
  const ok = await selectAgentSidebar(page, backend)
  if (!ok) return 'skipped'

  await page.locator('[data-testid="chat-input"]').focus()
  const status = await waitForConnectionStatus(
    page,
    ['auth_required', 'connected', 'connecting', 'error'],
    45_000,
  )
  if (status !== 'auth_required') return 'skipped'

  const authModal = page.locator('[data-testid="acp-auth-modal"]')
  await expect(authModal).toBeHidden({ timeout: 5_000 })
  await expect(page.locator('[data-testid="acp-auth-banner"]')).toBeVisible({ timeout: 10_000 })

  await page.locator('[data-testid="chat-input"]').fill('ping')
  await page.locator('[data-testid="send-button"]').click()

  let outcome: 'modal' | 'banner' = 'banner'
  await expect(async () => {
    const modalVisible = await authModal.isVisible()
    const bannerSignIn = page.locator('[data-testid="acp-auth-banner-sign-in"]')
    const hasBannerAction = (await bannerSignIn.count()) > 0
    expect(modalVisible || hasBannerAction).toBeTruthy()
    outcome = modalVisible ? 'modal' : 'banner'
  }).toPass({ timeout: 20_000, intervals: [500] })

  if (await authModal.isVisible()) {
    await page.keyboard.press('Escape')
  }
  return outcome
}

export async function exerciseLazyAuthOnPreferred(
  page: Page,
  installed: string[],
): Promise<{ backend: string; outcome: 'modal' | 'banner' } | { outcome: 'skipped' }> {
  for (const backend of pickPreferredBackends(installed)) {
    const result = await exerciseLazyAuthOnSend(page, backend)
    if (result !== 'skipped') {
      return { backend, outcome: result }
    }
  }
  return { outcome: 'skipped' }
}

export { openSettingsAgentTab, selectAgentSidebar, waitForConnectionStatus }
