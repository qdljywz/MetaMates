import { expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { warmUpAgentConnection, waitForAgentTurnIdle } from './launchElectron'
import { selectAgentSidebar } from './agentSettings'
import { readVaultFileUtf8 } from './vaultAssert'
import {
  getDailyPlanPath,
  getLegacyDailyPlanPath,
  getTodayDateString,
} from '../../src/constants/paths'

export const CLAUDE_BACKEND = 'claude'

export async function isClaudeAgentAvailable(page: Page): Promise<boolean> {
  return (
    (await page.locator('[data-testid="agent-sidebar-claude"]').count()) > 0 ||
    (await page.locator('[data-testid="switch-agent-claude"]').count()) > 0
  )
}

export async function warmupClaudeAgent(
  page: Page,
  workspace: string,
  maxMs = 180_000,
) {
  const selected = await selectAgentSidebar(page, CLAUDE_BACKEND)
  if (!selected) {
    return { ok: false as const, reason: 'missing' as const, detail: 'Claude sidebar not found' }
  }
  const result = await warmUpAgentConnection(page, { backend: CLAUDE_BACKEND, workspace, maxMs })
  if (result.ok) {
    await ensureAgentYoloMode(page)
  }
  return result
}

/** Match app effective timezone when resolving today's PLAN path. */
export async function getEffectiveTodayFromApp(page: Page): Promise<string> {
  const timezone = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('metamates-storage')
      if (raw) {
        const parsed = JSON.parse(raw) as { settings?: { userTimezone?: string } }
        const tz = parsed.settings?.userTimezone?.trim()
        if (tz) return tz
      }
    } catch {
      // ignore parse errors
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  })
  return getTodayDateString(timezone)
}

export function buildPlanPathCandidates(workspace: string, today: string): string[] {
  return [...new Set([
    getDailyPlanPath(workspace, today, 'zh'),
    getDailyPlanPath(workspace, today, 'en'),
    getLegacyDailyPlanPath(workspace, today),
  ])]
}

export function detectPlanWrite(
  paths: string[],
  beforeMtime: Record<string, number>,
  beforeLength: Record<string, number>,
): boolean {
  for (const planPath of paths) {
    if (!fs.existsSync(planPath)) continue
    const mtime = fs.statSync(planPath).mtimeMs
    const content = readVaultFileUtf8(planPath)
    const prevMtime = beforeMtime[planPath] ?? 0
    const prevLen = beforeLength[planPath] ?? 0
    if (mtime > prevMtime || content.length > prevLen + 30) return true
  }
  return false
}

export async function ensureAgentYoloMode(page: Page): Promise<void> {
  const modeSelect = page.locator('[data-testid="agent-mode-select"]')
  if ((await modeSelect.count()) === 0) return

  const current = await modeSelect.inputValue().catch(() => '')
  if (current !== 'yolo') {
    await modeSelect.selectOption('yolo')
    const confirm = page.locator('[data-testid="yolo-warning-confirm"]')
    if (await confirm.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await confirm.click()
    }
  }

  await expect(modeSelect).toHaveValue('yolo', { timeout: 8_000 })
}

/** Send a one-token ping and wait until the marker appears in the message list. */
export async function sendAgentPingAndExpectMarker(
  page: Page,
  marker: string,
  timeoutMs = 180_000,
): Promise<void> {
  await waitForAgentTurnIdle(page, 60_000, { requireSlashChips: true }).catch(() => {})

  const chatInput = page.locator('[data-testid="chat-input"]')
  await chatInput.fill(`Reply with exactly this token and nothing else: ${marker}`)
  await expect(page.locator('[data-testid="send-button"]')).toBeEnabled({ timeout: 20_000 })
  await page.locator('[data-testid="send-button"]').click()

  const messageList = page.locator('[data-testid="message-list"]')
  const agentMessages = page.locator('[data-testid="agent-message"]')
  await expect.poll(async () => {
    await messageList.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    const count = await agentMessages.count()
    for (let i = 0; i < count; i += 1) {
      const text = (await agentMessages.nth(i).innerText()) ?? ''
      if (text.includes(marker)) return true
    }
    return false
  }, { timeout: timeoutMs, intervals: [2_000] }).toBe(true)

  await waitForAgentTurnIdle(page, 90_000, { requireSlashChips: false }).catch(() => {})
}

/** Assert agent reply bubbles do not contain rethink JSON leaks. */
export async function expectNoRethinkJsonInVisibleAgentReplies(page: Page): Promise<void> {
  const messages = page.locator('[data-testid="agent-message"]')
  const count = await messages.count()
  for (let i = 0; i < count; i += 1) {
    const text = (await messages.nth(i).innerText()).trim()
    expect(text.startsWith('{')).toBe(false)
    expect(/"questionText"/.test(text)).toBe(false)
  }
}

/** Best-effort: approve first ACP permission option when write tools need consent. */
export async function approveAcpPermissionIfVisible(page: Page): Promise<void> {
  const modal = page.locator('[data-testid="acp-permission-modal"]')
  if (!(await modal.isVisible().catch(() => false))) return

  for (const optionId of ['allow_once', 'allow', 'allow_always']) {
    const option = page.locator(`[data-testid="acp-permission-option-${optionId}"]`)
    if (await option.isVisible().catch(() => false)) {
      await option.click({ timeout: 5_000 }).catch(() => {})
      return
    }
  }

  const options = page.locator('[data-testid^="acp-permission-option-"]')
  const count = await options.count()
  for (let i = 0; i < count; i += 1) {
    const option = options.nth(i)
    const id = (await option.getAttribute('data-testid')) ?? ''
    if (/reject|deny|cancel/i.test(id)) continue
    await option.click({ timeout: 5_000 }).catch(() => {})
    return
  }
}

export function scanWorkspaceForMarker(workspace: string, marker: string, maxDepth = 4): boolean {
  const walk = (dir: string, depth: number): boolean => {
    if (depth > maxDepth || !fs.existsSync(dir)) return false
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return false
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isFile() && /\.md$/i.test(entry.name)) {
        try {
          if (fs.readFileSync(full, 'utf-8').includes(marker)) return true
        } catch {
          // ignore
        }
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        if (walk(full, depth + 1)) return true
      }
    }
    return false
  }
  return walk(workspace, 0)
}

export async function messageListShowsWritebackVerified(page: Page): Promise<boolean> {
  const messageList = page.locator('[data-testid="message-list"]')
  await messageList.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  }).catch(() => {})
  const body = (await messageList.innerText().catch(() => '')) ?? ''
  return /writeback verified|写回已验证/i.test(body) || (/Act & Verify/i.test(body) && /✅/.test(body))
}
