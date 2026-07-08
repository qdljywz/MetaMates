#!/usr/bin/env node
/**
 * Verify MetaMates desktop shell (not browser): electronAPI + real UI.
 */
import { _electron as electron } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import http from 'http'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function httpOk(url) {
  return new Promise((resolve) => {
    http.get(url, { timeout: 5000 }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    }).on('error', () => resolve(false))
  })
}

async function main() {
  const viteUp = await httpOk('http://127.0.0.1:3000')
  if (!viteUp) {
    console.error('❌ Vite 未运行 — 请先 npm run dev')
    process.exit(1)
  }
  console.log('✅ Vite 在 127.0.0.1:3000 可访问')

  let app
  try {
    app = await electron.launch({
      args: ['.'],
      cwd: ROOT,
      timeout: 120_000,
      env: { ...process.env, METAMATES_SMOKE_TEST: '1' },
    })

    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForTimeout(12_000)

    const checks = await win.evaluate(() => ({
      hasElectronAPI: typeof window.electronAPI !== 'undefined',
      userAgent: navigator.userAgent,
      title: document.title,
      desktopGate: !!document.body?.innerText?.includes('请使用 MetaMates 桌面版')
        || !!document.body?.innerText?.includes('Use the MetaMates desktop app'),
      preloadFail: !!document.body?.innerText?.includes('桌面壳加载失败'),
      hasTitleBar: !!document.querySelector('[class*="title"]'),
      hasAgentToolbar: !!document.querySelector('[data-testid="agent-toolbar"]'),
      hasFileTree: !!document.querySelector('[data-testid="file-tree"]'),
      hasChatInput: !!document.querySelector('[data-testid="chat-input"]'),
    }))

    console.log('--- Renderer 探测 ---')
    console.log('electronAPI:', checks.hasElectronAPI ? '✅ 有' : '❌ 无')
    console.log('User-Agent 含 Electron:', /Electron/i.test(checks.userAgent) ? '✅' : '❌')
    console.log('浏览器 fallback 页:', checks.desktopGate ? '❌ 误显示' : '✅ 未显示')
    console.log('preload 失败页:', checks.preloadFail ? '❌ 显示' : '✅ 未显示')
    console.log('Agent 工具栏:', checks.hasAgentToolbar ? '✅' : '❌')
    console.log('文件树:', checks.hasFileTree ? '✅' : '（可能未选工作区）')
    console.log('聊天输入框:', checks.hasChatInput ? '✅' : '❌')

    const ok = checks.hasElectronAPI
      && !checks.desktopGate
      && !checks.preloadFail
      && checks.hasAgentToolbar
      && checks.hasChatInput

    console.log(ok ? '\n✅ 桌面版验证通过' : '\n❌ 桌面版验证失败')
    process.exit(ok ? 0 : 1)
  } catch (e) {
    console.error('❌ Electron 启动失败:', e instanceof Error ? e.message : e)
    process.exit(1)
  } finally {
    if (app) await app.close().catch(() => {})
  }
}

main()
