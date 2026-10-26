#!/usr/bin/env node
/**
 * Live proof: packaged portable-green + real E:\MyM2 vault chat history.
 * Writes JSON + screenshot under tmp-mym2-history-verify/.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXE = path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'MetaMates.exe')
const VAULT = process.env.METAMATES_WORKSPACE?.trim() || 'E:\\MyM2'
const OUT = path.join(ROOT, 'tmp-mym2-history-verify')

if (!fs.existsSync(EXE)) {
  console.error('[verify-history] missing exe', EXE)
  process.exit(1)
}
if (!fs.existsSync(path.join(VAULT, '.metamates', 'conversations.sqlite'))) {
  console.error('[verify-history] missing vault DB', path.join(VAULT, '.metamates', 'conversations.sqlite'))
  process.exit(1)
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-hist-verify-'))
fs.writeFileSync(
  path.join(userDataDir, 'settings.json'),
  JSON.stringify(
    {
      theme: 'light',
      fontSize: 14,
      autoSave: true,
      language: 'zh',
      workspacePath: VAULT,
      lastAgentBackend: 'claude',
      engineSetupStatus: 'ready',
      engineDisplayName: '小豆豆',
    },
    null,
    2,
  ),
  'utf8',
)

const report = {
  exe: EXE,
  asarMtime: fs.statSync(path.join(ROOT, 'release', 'portable-green', 'win-unpacked', 'resources', 'app.asar')).mtime.toISOString(),
  vault: VAULT,
  userDataDir,
  errors: [],
  ipc: null,
  ui: null,
  splash: null,
}

const t0 = Date.now()
const log = (m) => console.log(`[verify-history +${Date.now() - t0}ms] ${m}`)

let app
try {
  log(`launch ${EXE}`)
  app = await electron.launch({
    executablePath: EXE,
    args: [`--user-data-dir=${userDataDir}`],
    timeout: 120_000,
    env: {
      ...process.env,
      METAMATES_WORKSPACE: VAULT,
      // Allow agents so Claude tab exists; do not force NO_AGENTS.
    },
  })

  const page = await app.firstWindow({ timeout: 120_000 })
  page.on('pageerror', (e) => report.errors.push(String(e)))
  log('first-window')

  // Splash window: logo handoff
  const splashPhase = await page
    .waitForFunction(
      () => {
        const boot = !!document.getElementById('boot-splash')
        const react = !!document.querySelector('[data-testid="startup-splash"]')
        const shell = !!document.querySelector('.status-bar')
        return { boot, react, shell }
      },
      { timeout: 60_000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null)
  report.splash = splashPhase
  log(`splash phase ${JSON.stringify(splashPhase)}`)

  if (splashPhase?.react && !splashPhase?.boot) {
    const logoOk = await page
      .locator('[data-testid="startup-splash"] .startup-splash__logo-img')
      .evaluate((el) => el.naturalWidth > 0)
      .catch(() => false)
    report.splash = { ...splashPhase, logoNaturalWidthOk: logoOk }
    log(`logo naturalWidth ok=${logoOk}`)
    await page.screenshot({ path: path.join(OUT, '01-react-splash.png'), type: 'png' })
  }

  // Wait for shell
  await page.locator('.status-bar').waitFor({ state: 'visible', timeout: 90_000 })
  log('shell visible')

  // Wait until CLI detection finishes (skeleton uses same message-list testid).
  await page
    .waitForFunction(
      () => {
        const text = document.body?.innerText || ''
        if (text.includes('正在检测 AI 助手')) return false
        return (
          !!document.querySelector('[data-testid^="agent-sidebar-"]') ||
          text.includes('灵感仓库已就绪') ||
          text.includes('已连接') ||
          text.includes('待命') ||
          text.includes('未安装')
        )
      },
      { timeout: 120_000 },
    )
    .catch(() => null)
  log('agents UI settled')

  // Prefer Claude tab if present
  const claude = page.locator('[data-testid="agent-sidebar-claude"]')
  if (await claude.count()) {
    await claude.click().catch(() => {})
    log('clicked claude tab')
  }

  // Allow post-detect history force-reload (600ms+) to land.
  await page.waitForTimeout(3500)

  // Main-process IPC: conversation history
  const ipc = await page.evaluate(async () => {
    const api = window.electronAPI?.acp
    if (!api?.getConversationHistory) return { error: 'no getConversationHistory' }
    const backends = ['claude', 'codebuddy', 'gemini', 'codex']
    const out = {}
    for (const b of backends) {
      try {
        const r = await api.getConversationHistory(b, { limit: 20 })
        out[b] = {
          total: r?.total ?? 0,
          returned: r?.messages?.length ?? 0,
          unbound: !!r?.unbound,
          sample: r?.messages?.[0]
            ? {
                type: r.messages[0].type,
                position: r.messages[0].position,
                preview: String(
                  typeof r.messages[0].content === 'string'
                    ? r.messages[0].content
                    : r.messages[0].content?.content || '',
                ).slice(0, 80),
              }
            : null,
        }
      } catch (e) {
        out[b] = { error: String(e) }
      }
    }
    return out
  })
  report.ipc = ipc
  log(`ipc ${JSON.stringify(ipc)}`)

  const debugHistory = await page.evaluate(() => {
    return window.__METAMATES_DEBUG_HISTORY__ || null
  })
  report.debugHistory = debugHistory
  log(`debugHistory ${JSON.stringify(debugHistory)}`)

  const messageText = await page.locator('[data-testid="message-list"]').innerText().catch(() => '')
  const emptyReady = await page.getByText('灵感仓库已就绪').isVisible().catch(() => false)
  const detecting = await page.getByText('正在检测 AI 助手').isVisible().catch(() => false)
  const toolOrBubble = await page
    .locator(
      '[data-testid="message-list"] .agent-panel__bubble, [data-testid="message-list"] [class*="tool"], [data-testid="message-list"] .startup-splash__logo-img',
    )
    .count()
    .catch(() => 0)
  const msgCount = await page
    .locator('[data-testid="message-list"] > div, [data-testid="message-list"] [role="listitem"]')
    .count()
    .catch(() => 0)
  report.ui = {
    emptyReadyBanner: emptyReady,
    detecting,
    messageListChars: messageText.length,
    messageListPreview: messageText.slice(0, 280),
    approxChildren: msgCount,
    toolOrBubble,
  }
  log(`ui emptyBanner=${emptyReady} detecting=${detecting} chars=${messageText.length}`)

  await page.screenshot({ path: path.join(OUT, '02-shell-chat.png'), type: 'png', fullPage: true })

  const claudeTotal = ipc?.claude?.total ?? 0
  const historyVisible =
    !detecting &&
    !emptyReady &&
    (messageText.length > 80 || toolOrBubble > 0 || (debugHistory?.fetched ?? 0) > 0 && messageText.length > 40)
  const ok = claudeTotal > 0 && historyVisible
  report.ok = ok
  report.verdict = ok
    ? 'PASS: vault history in IPC and visible in message list'
    : claudeTotal > 0 && emptyReady
      ? 'FAIL: IPC has history but UI still empty-state'
      : claudeTotal > 0 && detecting
        ? 'FAIL: still detecting agents; UI never left skeleton'
        : claudeTotal === 0
          ? 'FAIL: IPC returned 0 claude messages for MyM2'
          : `FAIL: IPC ok (${claudeTotal}) but UI chars=${messageText.length} debug=${JSON.stringify(debugHistory)}`

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ ok, verdict: report.verdict, claudeTotal, emptyReady }, null, 2))
  process.exit(ok ? 0 : 2)
} catch (err) {
  report.errors.push(String(err?.stack || err))
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  console.error('[verify-history] FATAL', err)
  process.exit(1)
} finally {
  if (app) await app.close().catch(() => {})
}
