import fs from 'fs'
import path from 'path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  closeElectronApp,
  launchMetaMatesApp,
  resolveMainWindow,
  waitForAppShell,
} from '../helpers/launchElectron'
import { ensureE2ESandbox, getE2EWorkspace } from '../helpers/myM2Fixtures'
import { readVaultFileUtf8, vaultFileExists } from '../helpers/vaultAssert'
import {
  getDailyNoteFileName,
  getDailyNotePath,
  getTodayDateString,
} from '../../src/constants/paths'

type SessionRow = {
  id: string
  kind: string
  status: string
  note: string
  plannedSec: number
  actualSec: number
  startedAt: string
  endedAt: string
  dailyNotePath?: string
}

async function forceCompletePomodoro(page: Page): Promise<void> {
  await page.evaluate(() => {
    const e2e = (window as unknown as { __METAMATES_E2E__?: { pomodoroForceComplete?: () => void } })
      .__METAMATES_E2E__
    e2e?.pomodoroForceComplete?.()
  })
}

function readSessions(sessionsPath: string): SessionRow[] {
  if (!vaultFileExists(sessionsPath)) return []
  const store = JSON.parse(readVaultFileUtf8(sessionsPath)) as { sessions: SessionRow[] }
  return store.sessions || []
}

function parseCountdownSec(label: string): number | null {
  const m = label.match(/(\d{2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

const DIARY_LINE_RE = /- \[x\] \d{2}:\d{2}–\d{2}:\d{2} \(\d+m\)/

/**
 * @suite Pomodoro — effectiveness: countdown, diary format, persist fields, skip/abort/break
 */
test.describe.serial('@suite Pomodoro status bar', () => {
  let app: ElectronApplication
  let page: Page
  const workspace = getE2EWorkspace()
  const today = getTodayDateString()
  const notePath = getDailyNotePath(workspace, today, 'zh')
  const sessionsPath = path.join(workspace, '.metamates', 'pomodoro-sessions.json')

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    ensureE2ESandbox(workspace)
    if (fs.existsSync(sessionsPath)) fs.unlinkSync(sessionsPath)
    if (fs.existsSync(notePath)) fs.unlinkSync(notePath)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app, { requireChatInput: false })
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('countdown ticks down while running (effective timer)', async () => {
    const control = page.locator('[data-testid="pomodoro-status"]')
    await expect(control).toBeVisible({ timeout: 30_000 })
    await expect(control).toHaveAttribute('data-phase', 'idle')

    const idleText = (await control.innerText()).replace(/\s+/g, ' ')
    const idleSec = parseCountdownSec(idleText)
    expect(idleSec).not.toBeNull()
    expect(idleSec!).toBeGreaterThanOrEqual(60)

    await control.click()
    await expect(control).toHaveAttribute('data-phase', 'running', { timeout: 5_000 })
    await expect(control).toHaveAttribute('data-kind', 'focus')

    const startSec = parseCountdownSec((await control.innerText()).replace(/\s+/g, ' '))
    expect(startSec).not.toBeNull()

    await page.waitForTimeout(1_400)
    const laterSec = parseCountdownSec((await control.innerText()).replace(/\s+/g, ' '))
    expect(laterSec).not.toBeNull()
    expect(laterSec!).toBeLessThan(startSec!)

    await control.click()
    await expect(control).toHaveAttribute('data-phase', 'paused', { timeout: 5_000 })
    const pausedSec = parseCountdownSec((await control.innerText()).replace(/\s+/g, ' '))
    await page.waitForTimeout(800)
    const stillPaused = parseCountdownSec((await control.innerText()).replace(/\s+/g, ' '))
    expect(stillPaused).toBe(pausedSec)

    await control.click()
    await expect(control).toHaveAttribute('data-phase', 'running', { timeout: 5_000 })
  })

  test('complete → diary line format + session record fields', async () => {
    const control = page.locator('[data-testid="pomodoro-status"]')
    await expect(control).toHaveAttribute('data-phase', 'running')

    await forceCompletePomodoro(page)

    const modal = page.locator('.pomodoro-reflect-modal-root .ant-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })

    const noteText = `E2E番茄写日记 ${Date.now()}`
    await page.locator('[data-testid="pomodoro-reflect-input"]').fill(noteText)
    await page.locator('[data-testid="pomodoro-reflect-write"]').click()

    await expect(modal).toBeHidden({ timeout: 15_000 })
    await expect(control).toHaveAttribute('data-phase', 'idle', { timeout: 5_000 })

    await expect.poll(() => vaultFileExists(notePath), { timeout: 15_000 }).toBe(true)
    const noteBody = readVaultFileUtf8(notePath)
    expect(noteBody).toMatch(/##\s*番茄钟/)
    expect(noteBody).toMatch(DIARY_LINE_RE)
    expect(noteBody).toContain(noteText)

    await expect.poll(() => vaultFileExists(sessionsPath), { timeout: 15_000 }).toBe(true)
    const row = readSessions(sessionsPath).find(
      (s) => s.kind === 'focus' && s.status === 'completed' && s.note === noteText,
    )
    expect(row).toBeTruthy()
    expect(row!.plannedSec).toBeGreaterThanOrEqual(60)
    expect(row!.actualSec).toBe(row!.plannedSec)
    expect(Number.isFinite(Date.parse(row!.startedAt))).toBe(true)
    expect(Number.isFinite(Date.parse(row!.endedAt))).toBe(true)
    expect(Date.parse(row!.endedAt)).toBeGreaterThanOrEqual(Date.parse(row!.startedAt))
    expect(row!.dailyNotePath?.replace(/\\/g, '/')).toContain(getDailyNoteFileName(today))
  })

  test('skip reflect persists completed empty note and does not require diary text', async () => {
    const control = page.locator('[data-testid="pomodoro-status"]')
    await expect(control).toHaveAttribute('data-phase', 'idle')
    const beforeDiary = vaultFileExists(notePath) ? readVaultFileUtf8(notePath) : ''
    const beforeCount = readSessions(sessionsPath).length

    await control.click()
    await expect(control).toHaveAttribute('data-phase', 'running', { timeout: 5_000 })
    await forceCompletePomodoro(page)

    const modal = page.locator('.pomodoro-reflect-modal-root .ant-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-testid="pomodoro-reflect-skip"]').click()
    await expect(modal).toBeHidden({ timeout: 15_000 })
    await expect(control).toHaveAttribute('data-phase', 'idle', { timeout: 5_000 })

    await expect
      .poll(() => readSessions(sessionsPath).length, { timeout: 15_000 })
      .toBeGreaterThan(beforeCount)

    const skipped = readSessions(sessionsPath).filter(
      (s) => s.kind === 'focus' && s.status === 'completed' && s.note === '',
    )
    expect(skipped.length).toBeGreaterThan(0)
    // Skip must not append a new unique note string; diary may stay unchanged.
    if (vaultFileExists(notePath)) {
      const after = readVaultFileUtf8(notePath)
      expect(after.includes('E2E跳过不应出现')).toBe(false)
      // At minimum skip path did not wipe prior written note
      if (beforeDiary.includes('E2E番茄写日记')) {
        expect(after).toContain('E2E番茄写日记')
      }
    }
  })

  test('abort mid-focus → aborted session, no reflect, diary unchanged', async () => {
    const control = page.locator('[data-testid="pomodoro-status"]')
    const diaryBefore = vaultFileExists(notePath) ? readVaultFileUtf8(notePath) : ''
    const before = readSessions(sessionsPath).length

    await control.click()
    await expect(control).toHaveAttribute('data-phase', 'running', { timeout: 5_000 })

    await page.locator('[data-testid="pomodoro-menu"]').click()
    await page.locator('[data-testid="pomodoro-menu-reset"]').click()

    await expect(control).toHaveAttribute('data-phase', 'idle', { timeout: 5_000 })
    await expect(page.locator('.pomodoro-reflect-modal-root .ant-modal')).toHaveCount(0)

    await expect
      .poll(() => readSessions(sessionsPath).length, { timeout: 15_000 })
      .toBeGreaterThan(before)

    const aborted = readSessions(sessionsPath).find((s) => s.kind === 'focus' && s.status === 'aborted')
    expect(aborted).toBeTruthy()
    expect(aborted!.actualSec).toBeGreaterThanOrEqual(0)
    expect(aborted!.actualSec).toBeLessThan(aborted!.plannedSec)

    const diaryAfter = vaultFileExists(notePath) ? readVaultFileUtf8(notePath) : ''
    expect(diaryAfter).toBe(diaryBefore)
  })

  test('break session completes without reflect and records kind=break', async () => {
    const control = page.locator('[data-testid="pomodoro-status"]')
    await expect(control).toHaveAttribute('data-phase', 'idle')
    const before = readSessions(sessionsPath).length

    await page.locator('[data-testid="pomodoro-menu"]').click()
    await page.locator('[data-testid="pomodoro-menu-break"]').click()

    await expect(control).toHaveAttribute('data-phase', 'running', { timeout: 5_000 })
    await expect(control).toHaveAttribute('data-kind', 'break')
    const breakLabel = (await control.innerText()).replace(/\s+/g, ' ')
    expect(breakLabel).toMatch(/休息|Break/i)

    const startSec = parseCountdownSec(breakLabel)
    expect(startSec).not.toBeNull()
    expect(startSec!).toBeLessThanOrEqual(5 * 60)
    expect(startSec!).toBeGreaterThan(0)

    await forceCompletePomodoro(page)

    await expect(control).toHaveAttribute('data-phase', 'idle', { timeout: 10_000 })
    await expect(page.locator('.pomodoro-reflect-modal-root .ant-modal')).toHaveCount(0)

    await expect
      .poll(() => readSessions(sessionsPath).length, { timeout: 15_000 })
      .toBeGreaterThan(before)

    const br = readSessions(sessionsPath).find((s) => s.kind === 'break' && s.status === 'completed')
    expect(br).toBeTruthy()
    expect(br!.plannedSec).toBeGreaterThanOrEqual(60)
    expect(br!.actualSec).toBe(br!.plannedSec)
  })

  test('settings shows durations + recent sessions reflecting completed work', async () => {
    await page.locator('[data-testid="pomodoro-menu"]').click()
    await page.locator('[data-testid="pomodoro-menu-settings"]').click()

    const settingsTab = page.locator('[data-testid="settings-tab-advanced"]')
    await expect(settingsTab).toBeVisible({ timeout: 10_000 })
    await settingsTab.click()

    await expect(page.locator('[data-testid="settings-pomodoro-focus"]')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.locator('[data-testid="settings-pomodoro-break"]')).toBeVisible()

    const recent = page.locator('[data-testid="settings-pomodoro-recent"]')
    await expect(recent).toBeVisible()
    const recentText = await recent.innerText()
    expect(recentText.length).toBeGreaterThan(10)
    // Should list at least one completed focus from earlier steps
    expect(recentText).toMatch(/专注|Focus|完成|Done|休息|Break/)

    await page.keyboard.press('Escape')
  })
})
