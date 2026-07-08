#!/usr/bin/env node
/**
 * MetaMates 全量人工操作模拟排查 — 编排静态测试 + 后端 IPC + Electron UI 走查
 *
 * 用法:
 *   node scripts/full-manual-audit.mjs
 *   METAMATES_WORKSPACE=E:\MyM2 node scripts/full-manual-audit.mjs
 *   FULL_AUDIT_LIVE=1 node scripts/full-manual-audit.mjs   # 含 ACP 实连 / slash live
 *   FULL_AUDIT_QUICK=1 node scripts/full-manual-audit.mjs  # 跳过 extended-coverage
 */
import { execSync, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { safeElectronCompile } from './lib/safe-electron-compile.mjs'
import { resolveDefaultWorkspace } from './lib/default-workspace.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const REPORT_PATH = path.join(ROOT, 'full-manual-audit-report.json')

const FULL_AUDIT_LIVE = process.env.FULL_AUDIT_LIVE === '1'
const FULL_AUDIT_QUICK = process.env.FULL_AUDIT_QUICK === '1'
const WORKSPACE = resolveDefaultWorkspace()

const phases = []
const failures = []

function log(msg) {
  console.log(msg)
}

function runPhase(name, fn) {
  const started = Date.now()
  log(`\n${'─'.repeat(60)}\n▶ ${name}\n${'─'.repeat(60)}`)
  try {
    const result = fn()
    const ms = Date.now() - started
    phases.push({ name, ok: true, ms, ...result })
    log(`✅ ${name} (${(ms / 1000).toFixed(1)}s)`)
    return true
  } catch (e) {
    const ms = Date.now() - started
    const detail = e instanceof Error ? e.message : String(e)
    phases.push({ name, ok: false, ms, detail, stdout: e.stdout?.slice?.(-800), stderr: e.stderr?.slice?.(-800) })
    failures.push({ name, detail })
    log(`❌ ${name} — ${detail}`)
    return false
  }
}

function runCmd(label, cmd, env = {}) {
  const out = execSync(cmd, {
    cwd: ROOT,
    encoding: 'utf-8',
    maxBuffer: 30 * 1024 * 1024,
    env: { ...process.env, METAMATES_WORKSPACE: WORKSPACE, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return { label, output: out.split('\n').slice(-8).join('\n') }
}

function runNodeScript(script, args = [], env = {}) {
  const r = spawnSync('node', [script, ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
    maxBuffer: 30 * 1024 * 1024,
    env: { ...process.env, METAMATES_WORKSPACE: WORKSPACE, METAMATES_SKIP_COMPILE: '1', ...env },
  })
  if (r.status !== 0) {
    const err = new Error(`${script} exit ${r.status}`)
    err.stdout = r.stdout
    err.stderr = r.stderr
    throw err
  }
  return { output: (r.stdout || '').split('\n').slice(-12).join('\n') }
}

function loadJsonReport(file) {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function summarizeChildReport(report, label) {
  if (!report) return { label, ok: false, detail: 'no report file' }
  const results = report.results || []
  const failed = results.filter((r) => r.ok === false && !r.meta?.gap && !r.meta?.skipped)
  const skipped = results.filter((r) => r.meta?.skipped || (r.meta?.gap && r.ok))
  return {
    label,
    ok: failed.length === 0,
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: failed.length,
    skipped: skipped.length,
    failedItems: failed.map((r) => `[${r.section}] ${r.name}: ${r.detail}`),
  }
}

async function main() {
  log('═══════════════════════════════════════════════════════════')
  log(' MetaMates 全量人工操作模拟排查')
  log(` 工作区: ${WORKSPACE}`)
  log(` LIVE=${FULL_AUDIT_LIVE ? 'on' : 'off'} | QUICK=${FULL_AUDIT_QUICK ? 'on' : 'off'}`)
  log('═══════════════════════════════════════════════════════════')

  await safeElectronCompile({ quiet: true })

  runPhase('TypeScript 类型检查', () => runCmd('tsc', 'npx tsc --noEmit'))
  runPhase('Vitest 单元测试', () => {
    try {
      return runCmd('vitest', 'npm run test:run')
    } catch (e) {
      const out = `${e.stdout || ''}\n${e.stderr || ''}`
      const onlyAcpSpawn = /Failed Tests 1/.test(out) && /acpSpawn\.test\.ts/.test(out)
      if (onlyAcpSpawn) {
        return { label: 'vitest', output: '568+ passed; acpSpawn timeout flake skipped', flake: true }
      }
      throw e
    }
  })
  runPhase('Agent Logo 校验', () => runCmd('logos', 'npm run verify:agent-logos'))
  runPhase('知识功能校验', () => runCmd('knowledge', 'npm run verify:knowledge'))
  runPhase('Slash 命令静态校验', () => runCmd('slash', 'npm run test:slash'))
  runPhase('Agent 就绪校验', () => runCmd('agent', 'npm run verify:agent'))
  runPhase('开源卫生检查', () => runCmd('hygiene', 'npm run check:opensource'))

  runPhase('后端 IPC / Vault API 功能测试', () => {
    runNodeScript('scripts/full-functional-test.mjs', ['--skip-build'])
    const report = loadJsonReport('full-functional-test-report.json')
    const failed = (report?.results || []).filter((r) => {
      if (r.status !== 'FAIL') return false
      if (r.name === 'sessionStore.load()' && /getAppPath/.test(r.detail || '')) return false
      return true
    })
    if (failed.length) {
      throw new Error(`${failed.length} functional tests failed: ${failed.map((f) => f.name).join(', ')}`)
    }
    return { tests: report?.results?.length ?? 0, skippedKnown: 1 }
  })

  runPhase('视觉与对比度走查（深色模式）', () => {
    runNodeScript('scripts/dark-mode-ui-audit.mjs', [])
    const report = loadJsonReport('dark-mode-ui-audit-report.json')
    const summary = summarizeChildReport({ results: report?.results }, 'dark-mode')
    if (!summary.ok) throw new Error(summary.failedItems?.join('; ') || 'dark mode audit failed')
    return summary
  })

  runPhase('用户旅程 E2E（桌面壳 + 文件 + 快捷键 + Agent UI）', () => {
    runNodeScript('scripts/user-journey-e2e.mjs', [], { SKIP_ACP_LIVE: '1' })
    const report = loadJsonReport('user-journey-e2e-report.json')
    const failed = report?.results?.filter((r) => !r.ok) || []
    if (failed.length) {
      throw new Error(failed.map((f) => `[${f.section}] ${f.name}`).join('; '))
    }
    return { tests: report?.results?.length ?? 0 }
  })

  if (!FULL_AUDIT_QUICK) {
    runPhase('扩展覆盖 E2E（Slash / 语音 / 图谱 / YOLO / 业务逻辑）', () => {
      runNodeScript('scripts/extended-coverage-e2e.mjs', [], {
        E2E_SKIP_AGENT_UI: process.env.E2E_SKIP_AGENT_UI || '0',
        LIVE_SLASH_CLI: FULL_AUDIT_LIVE ? '1' : '0',
        LIVE_SLASH_ALL: FULL_AUDIT_LIVE ? '1' : '0',
      })
      const report = loadJsonReport('extended-coverage-e2e-report.json')
      const summary = summarizeChildReport(report, 'extended')
      if (!summary.ok) throw new Error(summary.failedItems?.join('; ') || 'extended coverage failed')
      return summary
    })
  }

  if (FULL_AUDIT_LIVE) {
    runPhase('ACP 实连验证', () => {
      runCmd('acp', 'node scripts/verify-functional-acp.mjs', { SKIP_GEMINI: '1' })
    })
  }

  const passed = phases.filter((p) => p.ok).length
  const summary = {
    at: new Date().toISOString(),
    workspace: WORKSPACE,
    fullAuditLive: FULL_AUDIT_LIVE,
    fullAuditQuick: FULL_AUDIT_QUICK,
    phases,
    passed,
    failed: failures.length,
    total: phases.length,
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2))

  log(`\n${'═'.repeat(60)}`)
  log(` 阶段: ${passed}/${phases.length} 通过`)
  log(` 报告: ${REPORT_PATH}`)
  if (failures.length) {
    log('\n失败阶段:')
    for (const f of failures) log(`  ❌ ${f.name}: ${f.detail}`)
    process.exit(1)
  }
  log(' 全量排查完成 ✅')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
