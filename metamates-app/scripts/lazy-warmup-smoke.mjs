#!/usr/bin/env node
/**
 * Smoke test for lazy ACP warmup — launches Electron and verifies startup behavior.
 */
import { _electron as electron } from '@playwright/test'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const results = []

function pass(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail })
  console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  console.log('\n═══ Lazy Warmup Smoke Test ═══\n')

  // Static checks
  const panel = await import('fs').then((fs) =>
    fs.readFileSync(path.join(ROOT, 'src/components/AgentChatPanel.tsx'), 'utf-8'),
  )
  if (panel.includes('warmupBackend') && panel.includes('scheduleWarmupOnFocus') && !panel.includes('for (let i = 1; i < agents.length')) {
    pass('源码：启动不连全部 Agent')
  } else {
    fail('源码：启动不连全部 Agent')
  }

  const ipc = await import('fs').then((fs) =>
    fs.readFileSync(path.join(ROOT, 'electron/acp/ipcHandlers.ts'), 'utf-8'),
  )
  if (ipc.includes('return detectedAgents') && ipc.includes('isGeminiAuthenticated()')) {
    pass('源码：检测缓存 + Gemini auth-first')
  } else {
    fail('源码：检测缓存 + Gemini auth-first')
  }

  const { isGeminiAuthenticated } = await import(pathToFileURL(path.join(ROOT, 'dist-electron/geminiAuth.cjs')).href)
  const geminiAuthed = isGeminiAuthenticated()
  pass('Gemini OAuth 探测', geminiAuthed ? '已登录' : '未登录（预期弹窗）')

  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: ROOT, timeout: 120_000 })
    const win = await app.waitForEvent('window', { timeout: 60_000 })
    await win.waitForLoadState('domcontentloaded')
    await new Promise((r) => setTimeout(r, 8000))

    const toolbar = win.locator('[data-testid="agent-toolbar"]')
    if (await toolbar.isVisible().catch(() => false)) {
      pass('UI：Agent 工具栏可见')
    } else {
      fail('UI：Agent 工具栏可见')
    }

    const agentCount = await win.locator('[data-testid^="agent-sidebar-"]').count()
    if (agentCount > 0) {
      pass('UI：检测到 Agent', `${agentCount} 个`)
    } else {
      fail('UI：检测到 Agent', '0 个')
    }

    const initialStatus = await win.locator('[data-testid="acp-connection-status"]').getAttribute('data-status')
    if (initialStatus === 'disconnected') {
      pass('启动：未自动连接', initialStatus)
    } else {
      fail('启动：未自动连接', `status=${initialStatus}`)
    }

    const inputEnabled = await win.locator('[data-testid="chat-input"]').isEnabled()
    if (inputEnabled) {
      pass('输入框：未连接时可用')
    } else {
      fail('输入框：未连接时可用')
    }

    await win.locator('[data-testid="chat-input"]').focus()
    await new Promise((r) => setTimeout(r, 2500))

    const afterFocus = await win.locator('[data-testid="acp-connection-status"]').getAttribute('data-status')
    if (['connecting', 'auth_required', 'connected'].includes(afterFocus || '')) {
      pass('Focus warmup 触发', afterFocus || '')
    } else {
      fail('Focus warmup 触发', afterFocus || 'unknown')
    }

    if (!geminiAuthed) {
      const modalCount = await win.getByText(/CLI 登录认证/).count()
      if (modalCount > 0 || afterFocus === 'auth_required') {
        pass('Gemini 未登录：认证引导', modalCount > 0 ? '弹窗' : 'auth_required')
      } else {
        fail('Gemini 未登录：认证引导', `status=${afterFocus}, modal=${modalCount}`)
      }
    } else {
      pass('Gemini 已登录：跳过 auth 弹窗检查')
    }
  } catch (e) {
    fail('Electron UI 测试', e instanceof Error ? e.message : String(e))
  } finally {
    if (app) await app.close().catch(() => {})
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n═══ 结果: ${results.length - failed.length}/${results.length} 通过 ═══\n`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main()
