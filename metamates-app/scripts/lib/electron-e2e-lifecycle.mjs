/**
 * Shared Electron E2E lifecycle — isolated userData, no global taskkill, agent warmup gate.
 *
 * Env:
 *   E2E_FORCE_KILL=1     — kill all electron.exe before launch (CI only; destroys dev session)
 *   E2E_AGENT_BACKEND    — default codebuddy
 *   E2E_CONNECT_MS       — agent warmup timeout (default 180000)
 *   E2E_SKIP_AGENT_UI=1  — skip all agent-connection-dependent UI checks
 */
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

export const E2E_FORCE_KILL = process.env.E2E_FORCE_KILL === '1'
export const E2E_AGENT_BACKEND = (process.env.E2E_AGENT_BACKEND || 'codebuddy').trim()
export const E2E_CONNECT_MS = Number.parseInt(process.env.E2E_CONNECT_MS || '180000', 10)
export const E2E_SKIP_AGENT_UI = process.env.E2E_SKIP_AGENT_UI === '1'

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export function createIsolatedUserDataDir(prefix = 'mm-e2e-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

export async function maybeKillAllElectron() {
  if (!E2E_FORCE_KILL) {
    return { killed: false, reason: '保留用户 Electron（仅 E2E_FORCE_KILL=1 时全局 taskkill）' }
  }
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'ignore', shell: true })
      await sleep(1500)
      return { killed: true, reason: 'E2E_FORCE_KILL=1' }
    } catch {
      return { killed: false, reason: 'taskkill 无进程' }
    }
  }
  return { killed: false, reason: 'non-win32 skip' }
}

/**
 * Launch Playwright-managed Electron with isolated profile — does not touch dev userData.
 */
export async function launchElectronApp(electron, {
  cwd,
  workspace,
  userDataDir,
  e2e = true,
  extraEnv = {},
}) {
  await maybeKillAllElectron()

  const profileDir = userDataDir || createIsolatedUserDataDir()
  const args = ['.', `--user-data-dir=${profileDir}`]

  const app = await electron.launch({
    args,
    cwd,
    timeout: 180_000,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ...(e2e ? {
        METAMATES_E2E: '1',
        METAMATES_WORKSPACE: workspace,
      } : {}),
      ...extraEnv,
    },
  })

  const win = await app.firstWindow({ timeout: 120_000 })
  await win.waitForLoadState('domcontentloaded')
  await win.evaluate(() => {
    try {
      localStorage.setItem('metamates-yolo-ack-v1', '1')
    } catch {
      // isolated profile — best effort
    }
  }).catch(() => {})
  return { app, win, userDataDir: profileDir }
}

/** Open command palette via shortcut, falling back to activity bar click. */
export async function openCommandPaletteE2e(win) {
  await dismissBlockingModals(win)
  await win.evaluate(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) {
      active.blur()
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }))
  })
  await sleep(800)
  let open = await win
    .locator('.ant-modal-wrap')
    .filter({ has: win.locator('input[placeholder*="搜索"], input[placeholder*="Search"]') })
    .first()
    .isVisible()
    .catch(() => false)
  if (!open) {
    await dismissBlockingModals(win)
    const btn = win.locator('[data-testid="activity-commandPalette"]')
    if (await btn.count()) {
      await btn.click({ force: true, timeout: 8000 }).catch(() => {})
      await sleep(900)
      open = await win
        .locator('.ant-modal-wrap')
        .filter({ has: win.locator('input[placeholder*="搜索"], input[placeholder*="Search"]') })
        .first()
        .isVisible()
        .catch(() => false)
    }
  }
  return open
}

/** Close only the Playwright instance — never taskkill unrelated Electron windows. */
export async function closeElectronApp(app, { userDataDir, cleanupUserData = false } = {}) {
  if (app) {
    try {
      for (const w of app.windows()) {
        await w.close().catch(() => {})
      }
    } catch {
      // windows() unavailable — fall through to app.close()
    }
    await Promise.race([app.close().catch(() => {}), sleep(5000)])
  }
  if (cleanupUserData && userDataDir && fs.existsSync(userDataDir)) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch { /* ignore */ }
  }
}

export async function dismissBlockingModals(win) {
  for (let i = 0; i < 4; i++) {
    const yolo = win.locator('[data-testid="yolo-warning-modal"]')
    if (await yolo.isVisible().catch(() => false)) {
      await win.locator('[data-testid="yolo-warning-confirm"]').click({ timeout: 2000 }).catch(() => {})
      await sleep(300)
    }
    const closeBtn = win.locator('.ant-modal-close').first()
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ timeout: 2000 }).catch(() => {})
      await sleep(250)
    }
    await win.keyboard.press('Escape')
    await sleep(200)
  }
  await win.locator('.ant-modal-wrap').first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
}

export async function waitForAgentUi(win, maxMs = 120_000) {
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    const ready = await win.evaluate(() => ({
      toolbar: !!document.querySelector('[data-testid="agent-toolbar"]'),
      chat: !!document.querySelector('[data-testid="chat-input"]'),
      slashChips: document.querySelectorAll('[data-testid^="slash-chip-"]').length,
    }))
    if (ready.toolbar && ready.chat && ready.slashChips >= 15) return ready
    await sleep(2000)
  }
  return win.evaluate(() => ({
    slashChips: document.querySelectorAll('[data-testid^="slash-chip-"]').length,
  }))
}

export async function probeAgentConnection(win, backend = E2E_AGENT_BACKEND) {
  return win.evaluate((b) => {
    const pill = document.querySelector('[data-testid="acp-connection-status"]')
    const dataStatus = pill?.getAttribute('data-status') || null
    const sessionPill = pill?.getAttribute('data-session-pill') || null
    const pillText = pill?.textContent?.trim() || ''
    const btn = document.querySelector(`[data-testid="agent-sidebar-${b}"]`)
    const dot = btn?.querySelector('.agent-panel__status-dot')
    const dotBg = dot ? getComputedStyle(dot).backgroundColor : ''
    const dotGreen = /34,\s*197,\s*94|52,\s*211,\s*153|0,\s*212,\s*196/.test(dotBg)
    const chips = [...document.querySelectorAll('[data-testid^="slash-chip-"]')]
    const chipsEnabled = chips.length > 0 && chips.every((el) => !el.disabled)
    return { dataStatus, sessionPill, pillText, dotGreen, chipsEnabled, slashChipCount: chips.length }
  }, backend)
}

export async function syncWorkspaceViaIpc(win, workspace) {
  return win.evaluate(async (ws) => {
    const api = window.electronAPI
    if (api?.acp?.setWorkspacePath) {
      try {
        const res = await api.acp.setWorkspacePath(ws)
        return { ok: res?.success !== false, detail: 'acp.setWorkspacePath' }
      } catch (e) {
        return { ok: false, detail: String(e) }
      }
    }
    if (api?.syncWorkspacePath) {
      try {
        await api.syncWorkspacePath(ws)
        return { ok: true, detail: 'syncWorkspacePath' }
      } catch (e) {
        return { ok: false, detail: String(e) }
      }
    }
    return { ok: false, detail: 'no workspace ipc' }
  }, workspace)
}

export async function dismissWorkspacePickerIfPresent(win) {
  const dismissed = await win.evaluate(() => {
    const modals = [...document.querySelectorAll('.ant-modal')]
    const workspaceModal = modals.find((m) => /工作区|Workspace/i.test(m.textContent || ''))
    if (!workspaceModal) return false
    const close = workspaceModal.querySelector('.ant-modal-close')
    close?.click()
    return true
  })
  if (dismissed) await sleep(500)
  return dismissed
}

/**
 * Warm up agent: select backend, focus input, dismiss YOLO, wait until footer + dot agree.
 */
export async function warmUpAgentConnection(win, {
  backend = E2E_AGENT_BACKEND,
  workspace,
  maxMs = E2E_CONNECT_MS,
} = {}) {
  await dismissBlockingModals(win)
  await dismissWorkspacePickerIfPresent(win)
  if (workspace) {
    await syncWorkspaceViaIpc(win, workspace)
    await sleep(1200)
  }

  await win.locator(`[data-testid="agent-sidebar-${backend}"]`).click({ timeout: 10_000 }).catch(() => {})
  await win.locator('[data-testid="chat-input"]').click({ timeout: 10_000 }).catch(() => {})
  await dismissBlockingModals(win)

  const started = Date.now()
  let last = null

  while (Date.now() - started < maxMs) {
    await dismissBlockingModals(win)
    last = await probeAgentConnection(win, backend)

    if (last.dataStatus === 'auth_required') {
      return {
        ok: false,
        reason: 'auth_required',
        detail: '需要登录认证 — UI 实连项跳过（非产品回归失败）',
        probe: last,
      }
    }

    if (last.dataStatus === 'connected' && last.dotGreen && last.chipsEnabled) {
      return {
        ok: true,
        reason: 'ready',
        detail: `footer=${last.dataStatus} pill=${last.sessionPill} dot=green chips=enabled`,
        probe: last,
      }
    }

    if (last.dataStatus === 'connected' && last.dotGreen) {
      return {
        ok: true,
        reason: 'connected',
        detail: `footer=${last.dataStatus} dot=green (chips=${last.chipsEnabled ? 'enabled' : 'disabled'})`,
        probe: last,
      }
    }

    await sleep(2000)
  }

  return {
    ok: false,
    reason: 'timeout',
    detail: last
      ? `footer=${last.dataStatus || '?'} dot=${last.dotGreen ? 'green' : 'no'} chips=${last.chipsEnabled ? 'enabled' : 'disabled'} — 隔离 E2E 实例未在 ${Math.round(maxMs / 1000)}s 内连上 ${backend}（非用户手动会话）`
      : `timeout ${Math.round(maxMs / 1000)}s`,
    probe: last,
  }
}

export async function detectInstalledAgentBackends(root) {
  const detectorPath = path.join(root, 'dist-electron/acp/AcpDetector.cjs')
  if (!fs.existsSync(detectorPath)) {
    return { ok: false, backends: [], error: 'dist-electron 未编译 — 先 electron:compile' }
  }
  try {
    const mod = await import(pathToFileURL(detectorPath).href)
    await mod.acpDetector.initialize(true)
    const agents = mod.acpDetector.getDetectedAgents()
    return {
      ok: true,
      backends: agents.map((a) => a.backend),
      agents: agents.map((a) => ({ backend: a.backend, name: a.name })),
    }
  } catch (e) {
    return { ok: false, backends: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export function agentPreflight(root, backend = E2E_AGENT_BACKEND) {
  const detection = detectInstalledAgentBackends(root)
  return detection.then((result) => {
    if (!result.ok) return { ...result, backendAvailable: false }
    const available = result.backends.includes(backend)
    return {
      ...result,
      backendAvailable: available,
      targetBackend: backend,
      detail: available
        ? `${backend} CLI 已检测到`
        : `${backend} 未安装/未在 PATH — Agent UI 实连项将跳过`,
    }
  })
}

export async function waitForVoiceE2eHook(win, maxMs = 15_000) {
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    const ready = await win.evaluate(() => typeof window.__METAMATES_E2E__?.simulateVoiceTranscript === 'function')
    if (ready) return true
    await win.locator('[data-testid="chat-input"]').click({ timeout: 2000 }).catch(() => {})
    await sleep(500)
  }
  return false
}
