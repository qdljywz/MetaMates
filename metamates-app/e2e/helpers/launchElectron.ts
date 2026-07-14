import fs from 'fs'
import os from 'os'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { STARTUP_SPLASH_E2E_BUDGET_MS } from '../../src/utils/startupUx'
import { resolveE2EWorkspacePath as resolveDefaultE2EWorkspace } from './e2eWorkspace'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Packaged Windows build (release/win-unpacked/MetaMates.exe). */
export function resolvePackagedExe(): string | null {
  const fromEnv = process.env.METAMATES_PACKAGED_EXE?.trim()
  const candidates = [
    fromEnv,
    path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'MetaMates.exe'),
    path.join(ROOT, 'release', 'unpacked-fix', 'win-unpacked', 'MetaMates.exe'),
    path.join(ROOT, 'release', 'win-unpacked', 'MetaMates.exe'),
  ].filter(Boolean) as string[]
  return candidates.find((p) => fs.existsSync(p)) ?? null
}

export function isPackagedE2E(): boolean {
  return process.env.METAMATES_PACKAGED === '1'
}

/** Reused E2E profile — keeps YOLO ack + settings across test runs; never the user's daily profile. */
const E2E_USER_DATA_DIR = path.join(os.tmpdir(), 'metamates-e2e-userdata')
const SINGLE_SESSION_LOCK = path.join(os.tmpdir(), 'metamates-e2e-single-session.lock')

const ephemeralUserDataByApp = new WeakMap<ElectronApplication, string>()

function sleepMs(ms: number): void {
  const end = Date.now() + ms
  while (Date.now() < end) {
    /* spin */
  }
}

function removeEphemeralUserDataDir(userDataDir: string): void {
  if (!userDataDir || !fs.existsSync(userDataDir)) return
  if (!userDataDir.includes(`${path.sep}metamates-e2e-fresh-`)) return
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
      if (!fs.existsSync(userDataDir)) {
        console.log(`[E2E] removed fresh userData ${userDataDir}`)
        return
      }
    } catch {
      if (attempt === 5) {
        console.warn(`[E2E] failed to remove fresh userData ${userDataDir}`)
        return
      }
      sleepMs(250)
    }
  }
}

let e2eLaunchCount = 0
let holdsSingleSessionLock = false

interface SingleSessionLock {
  ownerPid: number
  launchCount: number
  startedAt: number
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readSingleSessionLock(): SingleSessionLock | null {
  try {
    if (!fs.existsSync(SINGLE_SESSION_LOCK)) return null
    return JSON.parse(fs.readFileSync(SINGLE_SESSION_LOCK, 'utf8')) as SingleSessionLock
  } catch {
    return null
  }
}

function releaseSingleSessionLock(): void {
  if (!holdsSingleSessionLock) return
  const lock = readSingleSessionLock()
  if (lock?.ownerPid === process.pid) {
    try {
      fs.unlinkSync(SINGLE_SESSION_LOCK)
    } catch {
      // best-effort
    }
  }
  holdsSingleSessionLock = false
}

function acquireSingleSessionLock(): number {
  e2eLaunchCount += 1
  const launchNo = e2eLaunchCount

  if (process.env.E2E_SINGLE_SESSION !== '1') {
    console.log(`[E2E] Electron launch #${launchNo}`)
    return launchNo
  }

  if (launchNo > 1) {
    throw new Error(
      `E2E_SINGLE_SESSION: Electron launch #${launchNo} in the same Playwright worker — journey must call launchMetaMatesApp() only once.`,
    )
  }

  const existing = readSingleSessionLock()
  if (existing) {
    if (isProcessAlive(existing.ownerPid)) {
      throw new Error(
        `E2E_SINGLE_SESSION: another E2E run is already active (owner PID ${existing.ownerPid}, launch #${existing.launchCount}). ` +
          'Wait for it to finish or run `npm run stop` — will not start another Electron.',
      )
    }
    try {
      fs.unlinkSync(SINGLE_SESSION_LOCK)
    } catch {
      // stale lock from crashed run
    }
  }

  const payload: SingleSessionLock = {
    ownerPid: process.pid,
    launchCount: launchNo,
    startedAt: Date.now(),
  }
  fs.writeFileSync(SINGLE_SESSION_LOCK, JSON.stringify(payload), 'utf8')
  holdsSingleSessionLock = true
  console.log(`[E2E] Electron launch #${launchNo} (single-session lock PID ${process.pid})`)
  return launchNo
}

for (const signal of ['exit', 'SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => releaseSingleSessionLock())
}

function resolveE2EWorkspace(): string {
  return resolveDefaultE2EWorkspace()
}

export function getElectronRoot(): string {
  return ROOT
}

export function resolveE2EWorkspacePath(): string {
  return resolveE2EWorkspace()
}

/**
 * Measure splash dismiss after it becomes visible (not after resolveMainWindow — that already waited).
 * Returns elapsed ms from first splash paint to hidden.
 */
export async function expectSplashDismissedWithinBudget(app: ElectronApplication): Promise<number> {
  const deadline = Date.now() + 120_000
  let page: Page | null = null

  while (Date.now() < deadline) {
    for (const win of app.windows()) {
      const splash = win.locator('[data-testid="startup-splash"]')
      if (await splash.isVisible().catch(() => false)) {
        page = win
        break
      }
    }
    if (page) break
    await app.waitForEvent('window', { timeout: 2_000 }).catch(() => {})
  }

  if (!page) {
    page = await app.firstWindow({ timeout: 120_000 })
    const shellReady = page.locator('.status-bar')
    if (await shellReady.isVisible().catch(() => false)) return 0
    throw new Error('Startup splash never became visible and shell not ready')
  }

  await page.waitForLoadState('domcontentloaded')

  const splash = page.locator('[data-testid="startup-splash"]')
  const started = Date.now()
  await expect(splash).toBeHidden({ timeout: STARTUP_SPLASH_E2E_BUDGET_MS + 2_000 })
  const elapsed = Date.now() - started
  expect(elapsed).toBeLessThan(STARTUP_SPLASH_E2E_BUDGET_MS)
  return elapsed
}

/** Seed settings.json so E2E never shows first-run welcome / workspace picker. */
export function seedE2EUserProfile(
  userDataDir: string,
  workspace: string,
  extra: Record<string, unknown> = {},
): void {
  fs.mkdirSync(userDataDir, { recursive: true })
  const settingsPath = path.join(userDataDir, 'settings.json')
  const settings = {
    theme: 'dark',
    fontSize: 14,
    autoSave: true,
    language: 'zh',
    workspacePath: workspace,
    recentFiles: [],
    engineDisplayName: 'E2E副脑',
    /** Prevent engine-setup modal from blocking guardrails that relaunch Electron per test. */
    engineSetupStatus: 'ready',
    ...extra,
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
}

export function removeE2EPluginInstall(userDataDir: string, pluginId: string): void {
  fs.rmSync(path.join(userDataDir, 'plugins', pluginId), { recursive: true, force: true })
}

export function createE2EUserDataDir(): string {
  fs.mkdirSync(E2E_USER_DATA_DIR, { recursive: true })
  return E2E_USER_DATA_DIR
}

export function createFreshE2EUserDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-e2e-fresh-'))
}

/**
 * Best-effort wipe of renderer storage (may be locked on Windows if a prior Electron exited slowly).
 */
export function resetE2ERendererStorage(userDataDir: string): void {
  for (const sub of ['Local Storage', 'Session Storage', 'IndexedDB']) {
    try {
      fs.rmSync(path.join(userDataDir, sub), {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      })
    } catch {
      // Locked — waitForAppShell patches localStorage after the window opens.
    }
  }
}

/**
 * Launch MetaMates for E2E only.
 * - Uses isolated e2e/.workspace/vault (or METAMATES_WORKSPACE) for vault files
 * - Uses isolated userData under %TEMP% — never overwrites daily AppData settings
 * - Pre-seeds workspace + onboarding flags so no welcome wizard
 */
export async function launchMetaMatesApp(
  workspace = resolveE2EWorkspace(),
  options?: {
    noAgents?: boolean
    speechEngine?: 'auto' | 'whisper' | 'web' | 'native'
    noDevPlugins?: boolean
    /** Unique userData — triggers bundled plugin auto-install on packaged builds. */
    freshUserData?: boolean
    /**
     * Override seeded engineDisplayName (default E2E-only label).
     * Use a product-like name for README / docs screenshots.
     */
    engineDisplayName?: string
    /** UI / settings language for this launch (default zh via seed). */
    language?: 'zh' | 'en'
  },
): Promise<ElectronApplication> {
  acquireSingleSessionLock()

  const userDataDir = options?.freshUserData ? createFreshE2EUserDataDir() : createE2EUserDataDir()
  if (!options?.freshUserData) {
    resetE2ERendererStorage(userDataDir)
  }
  const profileExtra: Record<string, unknown> = {}
  if (options?.speechEngine) profileExtra.speechEngine = options.speechEngine
  if (options?.engineDisplayName) profileExtra.engineDisplayName = options.engineDisplayName
  if (options?.language) profileExtra.language = options.language
  seedE2EUserProfile(userDataDir, workspace, profileExtra)
  if (options?.noDevPlugins) {
    removeE2EPluginInstall(userDataDir, 'offline-speech')
    removeE2EPluginInstall(userDataDir, 'document-import')
  }

  const packagedExe = isPackagedE2E() ? resolvePackagedExe() : null
  if (process.env.METAMATES_PACKAGED === '1' && !packagedExe) {
    throw new Error('METAMATES_PACKAGED=1 but release/win-unpacked/MetaMates.exe not found — run npm run electron:build:win')
  }

  const launchEnv = {
    ...process.env,
    METAMATES_E2E: '1',
    METAMATES_WORKSPACE: workspace,
    ...(packagedExe ? {} : { NODE_ENV: 'development' }),
    ...(options?.noDevPlugins ? { METAMATES_E2E_NO_DEV_PLUGINS: '1' } : {}),
    ...(options?.freshUserData && packagedExe ? { METAMATES_E2E_ALLOW_BUNDLED_PLUGINS: '1' } : {}),
  }
  // Only force no-agents when requested; never inherit shell METAMATES_E2E_NO_AGENTS
  // (that caused Settings "ready" + main UI "not installed" in docs screenshots).
  if (options?.noAgents) {
    launchEnv.METAMATES_E2E_NO_AGENTS = '1'
  } else {
    delete launchEnv.METAMATES_E2E_NO_AGENTS
  }

  if (packagedExe) {
    console.log(`[E2E] Packaged launch: ${packagedExe}`)
    const launched = await electron.launch({
      executablePath: packagedExe,
      args: [`--user-data-dir=${userDataDir}`],
      timeout: 120_000,
      env: launchEnv,
    })
    if (options?.freshUserData) ephemeralUserDataByApp.set(launched, userDataDir)
    return launched
  }

  const launched = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: ROOT,
    timeout: 120_000,
    env: launchEnv,
  })
  if (options?.freshUserData) ephemeralUserDataByApp.set(launched, userDataDir)
  return launched
}

async function pickMainWindow(app: ElectronApplication, deadlineMs: number): Promise<Page> {
  const deadline = Date.now() + deadlineMs

  while (Date.now() < deadline) {
    const windows = app.windows()
    for (const win of windows) {
      try {
        const hasStatus = await win.locator('.status-bar').isVisible({ timeout: 1500 })
        if (hasStatus) return win
      } catch {
        // try next window
      }
    }

    await Promise.race([
      app.waitForEvent('window', { timeout: 3000 }).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ])
  }

  throw new Error('MetaMates main window not found (status bar never became visible)')
}

export async function waitForAppShell(page: Page): Promise<void> {
  await page.locator('[data-testid="startup-splash"]').waitFor({ state: 'hidden', timeout: 45_000 }).catch(() => {})

  await page.evaluate(() => {
    localStorage.setItem('metamates-yolo-ack-v1', '1')
    try {
      const storageKey = 'metamates-storage'
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const data = JSON.parse(raw) as { settings?: Record<string, unknown> }
        if (data.settings) {
          data.settings.engineSetupStatus = 'ready'
          localStorage.setItem(storageKey, JSON.stringify(data))
        }
      }
    } catch {
      // best-effort — seeded settings.json is authoritative after resetE2ERendererStorage
    }
  })

  const wizard = page.locator('[data-testid="welcome-wizard"]')
  await wizard.waitFor({ state: 'hidden', timeout: 30_000 }).catch(async () => {
    if (await wizard.isVisible().catch(() => false)) {
      throw new Error('Welcome wizard visible during E2E — onboarding should be skipped')
    }
  })

  const engineSetup = page.locator('[data-testid="engine-setup-flow"]')
  if (await engineSetup.isVisible({ timeout: 1500 }).catch(() => false)) {
    const vaultOnly = page.locator('[data-testid="engine-setup-vault-only"]')
    if (await vaultOnly.isVisible().catch(() => false)) {
      await vaultOnly.click()
    }
    await engineSetup.waitFor({ state: 'hidden', timeout: 15_000 }).catch(async () => {
      if (await engineSetup.isVisible().catch(() => false)) {
        throw new Error('Engine setup flow visible during E2E — dismiss or set engineSetupStatus in test boot')
      }
    })
  }

  const picker = page.locator('.ant-modal-wrap').filter({ hasText: /选择工作区|Select Workspace/i })
  if (await picker.isVisible({ timeout: 1500 }).catch(() => false)) {
    throw new Error('Workspace picker visible during E2E — check METAMATES_WORKSPACE / __METAMATES_E2E__')
  }

  const yoloConfirm = page.locator('[data-testid="yolo-warning-confirm"]')
  if (await yoloConfirm.isVisible({ timeout: 1500 }).catch(() => false)) {
    await yoloConfirm.click()
  }

  await page.locator('[data-testid="file-tree"] .ant-tree-title').first().waitFor({
    state: 'visible',
    timeout: 45_000,
  })
}

export async function resolveMainWindow(
  app: ElectronApplication,
  options: { requireChatInput?: boolean } = {},
): Promise<Page> {
  const { requireChatInput = true } = options
  const win = await pickMainWindow(app, 120_000)
  await win.waitForLoadState('domcontentloaded')

  await waitForAppShell(win)

  if (requireChatInput) {
    await win
      .locator(
        '[data-testid="chat-input"], [data-testid="agent-cli-install-guide"], [data-testid="agent-toolbar"]',
      )
      .first()
      .waitFor({ state: 'visible', timeout: 180_000 })
  }

  await win.waitForTimeout(800)
  return win
}

/** Wait until slash chips are enabled (ACP connected). Returns false on timeout. */
export async function waitForAgentSlashReady(page: Page, timeoutMs = 120_000): Promise<boolean> {
  const chip = page.locator('[data-testid="slash-chip-today"]')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await chip.isVisible().catch(() => false) && !(await chip.isDisabled())) {
      return true
    }
    await page.waitForTimeout(2_000)
  }
  return false
}

const E2E_AGENT_BACKEND = (process.env.E2E_AGENT_BACKEND || 'claude').trim()
const E2E_CONNECT_MS = Number.parseInt(process.env.E2E_CONNECT_MS || '180000', 10)

export interface AgentWarmupResult {
  ok: boolean
  reason: 'ready' | 'connected' | 'auth_required' | 'timeout' | 'skipped'
  detail: string
}

export async function dismissBlockingModals(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const yolo = page.locator('[data-testid="yolo-warning-modal"]')
    if (await yolo.isVisible().catch(() => false)) {
      await page.locator('[data-testid="yolo-warning-confirm"]').click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(300)
    }
    const closeBtn = page.locator('.ant-modal-close').first()
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(250)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
}

async function probeAgentConnection(page: Page, backend: string) {
  return page.evaluate((b) => {
    const pill = document.querySelector('[data-testid="acp-connection-status"]')
    const dataStatus = pill?.getAttribute('data-status') || null
    const btn = document.querySelector(`[data-testid="agent-sidebar-${b}"]`)
    const dot = btn?.querySelector('.agent-panel__status-dot')
    const dotBg = dot ? getComputedStyle(dot).backgroundColor : ''
    const dotGreen = /34,\s*197,\s*94|52,\s*211,\s*153|0,\s*212,\s*196/.test(dotBg)
    const chips = [...document.querySelectorAll('[data-testid^="slash-chip-"]')]
    const chipsEnabled = chips.length > 0 && chips.every((el) => !(el as HTMLButtonElement).disabled)
    return { dataStatus, dotGreen, chipsEnabled, slashChipCount: chips.length }
  }, backend)
}

/**
 * Actively connect an agent (default CodeBuddy): select backend, focus chat, wait for slash chips.
 * Passive polling alone fails because MetaMates uses lazy ACP warmup.
 */
export async function warmUpAgentConnection(
  page: Page,
  options: { backend?: string; workspace?: string; maxMs?: number } = {},
): Promise<AgentWarmupResult> {
  if (process.env.E2E_SKIP_AGENT_UI === '1') {
    return { ok: false, reason: 'skipped', detail: 'E2E_SKIP_AGENT_UI=1' }
  }

  const backend = options.backend ?? E2E_AGENT_BACKEND
  const maxMs = options.maxMs ?? E2E_CONNECT_MS

  await dismissBlockingModals(page)

  if (options.workspace) {
    await page
      .evaluate(async (ws) => {
        const api = window.electronAPI
        if (api?.acp?.setWorkspacePath) {
          await api.acp.setWorkspacePath(ws)
        } else if (api?.syncWorkspacePath) {
          await api.syncWorkspacePath(ws)
        }
      }, options.workspace)
      .catch(() => {})
    await page.waitForTimeout(1200)
  }

  const sidebarBtn = page.locator(`[data-testid="agent-sidebar-${backend}"]`)
  const switchBtn = page.locator(`[data-testid="switch-agent-${backend}"]`)
  if (await sidebarBtn.count()) {
    await sidebarBtn.click({ timeout: 10_000 }).catch(() => {})
  } else if (await switchBtn.count()) {
    await switchBtn.click({ timeout: 10_000 }).catch(() => {})
  }

  await page.locator('[data-testid="chat-input"]').click({ timeout: 10_000 }).catch(() => {})
  await dismissBlockingModals(page)

  const started = Date.now()
  let last: Awaited<ReturnType<typeof probeAgentConnection>> | null = null

  while (Date.now() - started < maxMs) {
    await dismissBlockingModals(page)
    last = await probeAgentConnection(page, backend)

    if (last.dataStatus === 'auth_required') {
      return { ok: false, reason: 'auth_required', detail: 'Agent requires auth' }
    }

    if (last.chipsEnabled || (last.dataStatus === 'connected' && last.dotGreen)) {
      console.log(
        `[E2E] Agent ${backend} ready: footer=${last.dataStatus} dot=${last.dotGreen ? 'green' : 'no'} chips=${last.chipsEnabled ? 'enabled' : 'disabled'}`,
      )
      return {
        ok: true,
        reason: last.chipsEnabled ? 'ready' : 'connected',
        detail: `footer=${last.dataStatus} chips=${last.chipsEnabled}`,
      }
    }

    await page.waitForTimeout(2_000)
  }

  return {
    ok: false,
    reason: 'timeout',
    detail: last
      ? `footer=${last.dataStatus ?? '?'} dot=${last.dotGreen ? 'green' : 'no'} chips=${last.chipsEnabled ? 'enabled' : 'disabled'} after ${Math.round(maxMs / 1000)}s`
      : `timeout ${Math.round(maxMs / 1000)}s`,
  }
}

/** Wait until the agent panel accepts a new prompt (no stream/tools/thinking). */
export async function waitForAgentTurnIdle(
  page: Page,
  timeoutMs = 180_000,
  options: { requireSlashChips?: boolean } = {},
): Promise<void> {
  const requireSlashChips = options.requireSlashChips ?? false
  const deadline = Date.now() + timeoutMs
  let stableIdleMs = 0
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="chat-input"]') as HTMLTextAreaElement | null
      const thinking = document.querySelector('[data-testid="agent-thinking-placeholder"]')
      const cancel = document.querySelector('[data-testid="cancel-prompt"]')
      const chip = document.querySelector('[data-testid="slash-chip-today"]') as HTMLButtonElement | null
      return {
        inputEnabled: input != null && !input.disabled,
        thinking: Boolean(thinking),
        cancel: Boolean(cancel),
        chipsReady: chip != null && !chip.disabled,
      }
    })
    const idle = state.inputEnabled && !state.thinking && !state.cancel
      && (!requireSlashChips || state.chipsReady)
    if (idle) {
      stableIdleMs += 1500
      if (stableIdleMs >= 3000) return
    } else {
      stableIdleMs = 0
    }
    await page.waitForTimeout(1500)
  }
  throw new Error(`Agent turn did not settle within ${timeoutMs}ms`)
}

export async function closeElectronApp(app: ElectronApplication | undefined | null): Promise<void> {
  if (!app) {
    releaseSingleSessionLock()
    return
  }

  let proc: ReturnType<ElectronApplication['process']> | null = null
  try {
    proc = app.process()
  } catch {
    releaseSingleSessionLock()
    return
  }
  const pid = proc?.pid

  try {
    for (const w of app.windows()) {
      await w.close().catch(() => {})
    }
  } catch {
    // windows() unavailable after crash
  }

  try {
    await Promise.race([
      app.close(),
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ])
  } catch {
    // best-effort graceful close
  }

  if (pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
      } else if (!proc?.killed) {
        proc.kill('SIGKILL')
      }
    } catch {
      // already exited
    }

    const deadline = Date.now() + 2_000
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0)
        await new Promise((r) => setTimeout(r, 100))
      } catch {
        break
      }
    }
  }

  const ephemeralUserData = ephemeralUserDataByApp.get(app)
  if (ephemeralUserData) {
    ephemeralUserDataByApp.delete(app)
    removeEphemeralUserDataDir(ephemeralUserData)
  }

  releaseSingleSessionLock()
}
