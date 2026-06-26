#!/usr/bin/env node
/**
 * Scenario 1: delete .codex → restart electron:dev → verify auto provision
 * Scenario 2: delete .codex while app up → Playwright clicks sync button → verify
 */
import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const WORKSPACE = process.env.MM_TEST_WORKSPACE || 'E:\\Trae\\Metamates\\Test\\test0407'
const CODEX_DIR = path.join(WORKSPACE, '.codex')
const CODEX_SKILLS = path.join(CODEX_DIR, 'skills')
const LOG_FILE = path.join(ROOT, 'codex-skill-scenario.log')

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n')
}

function countCodexSkills() {
  if (!fs.existsSync(CODEX_SKILLS)) return 0
  return fs.readdirSync(CODEX_SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory()).length
}

function removeCodex() {
  if (fs.existsSync(CODEX_DIR)) {
    fs.rmSync(CODEX_DIR, { recursive: true, force: true })
    log(`Deleted ${CODEX_DIR}`)
  } else {
    log(`.codex already absent`)
  }
}

function killElectronAndVite() {
  try {
    execSync(
      'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"',
      { stdio: 'pipe' },
    )
  } catch {
    // ignore
  }
}

function killElectronOnly() {
  try {
    execSync('powershell -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', {
      stdio: 'pipe',
    })
  } catch {
    // ignore
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForCodexSkills(timeoutMs, pollMs = 1000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const n = countCodexSkills()
    if (n === 15) return n
    await sleep(pollMs)
  }
  return countCodexSkills()
}

async function waitForLogPatterns(logPath, patterns, timeoutMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(logPath)) {
      const text = fs.readFileSync(logPath, 'utf8')
      if (patterns.every((p) => (typeof p === 'string' ? text.includes(p) : p.test(text)))) {
        return text
      }
    }
    await sleep(1000)
  }
  return fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''
}

async function scenario1() {
  log('\n========== Scenario 1: delete .codex → restart app ==========')
  killElectronAndVite()
  await sleep(2000)
  removeCodex()
  const afterDelete = countCodexSkills()
  log(`After delete: ${afterDelete} skill folders`)

  const out = fs.createWriteStream(path.join(ROOT, 'scenario1-electron.log'))
  const child = spawn('npm', ['run', 'electron:dev'], {
    cwd: ROOT,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.pipe(out)
  child.stderr?.pipe(out)

  const logPath = path.join(ROOT, 'scenario1-electron.log')
  await sleep(8000)
  const logText = await waitForLogPatterns(
    logPath,
    ['set-workspace-path', /codex/i, 'Detection completed'],
    120_000,
  )

  const skillsCount = await waitForCodexSkills(90_000)
  const hasSkillsLog = /\[SKILLS\].*codex|Provisioned on workspace open/i.test(logText)
  const hasWorkspace = logText.includes(WORKSPACE.replace(/\\/g, '\\\\')) || logText.includes(WORKSPACE)

  const pass =
    afterDelete === 0 &&
    skillsCount === 15 &&
    fs.existsSync(path.join(CODEX_SKILLS, 'today', 'SKILL.md'))

  log(`Scenario 1 result: ${pass ? 'PASS' : 'FAIL'}`)
  log(`  - skill folders: ${skillsCount}/15`)
  log(`  - workspace in log: ${hasWorkspace}`)
  log(`  - SKILLS log line: ${hasSkillsLog} (may be absent if provision happened during detect before log capture)`)

  return { pass, skillsCount, child, logPath }
}

async function scenario2(electronChild) {
  log('\n========== Scenario 2: delete .codex → click sync button ==========')
  removeCodex()
  await sleep(1000)
  const afterDelete = countCodexSkills()
  log(`After delete (app still running): ${afterDelete} skill folders`)

  // Keep vite; stop dev electron so Playwright can launch a single instance with same profile
  killElectronOnly()
  await sleep(3000)

  let playwrightExit = 1
  let playwrightOut = ''
  try {
    playwrightOut = execSync(
      `npx playwright test e2e/skill-sync-codex.spec.ts --reporter=line`,
      {
        cwd: ROOT,
        env: { ...process.env, MM_TEST_WORKSPACE: WORKSPACE },
        encoding: 'utf8',
        timeout: 240_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    playwrightExit = 0
  } catch (err) {
    playwrightOut = `${err.stdout || ''}\n${err.stderr || ''}\n${err.message || ''}`
    playwrightExit = err.status ?? 1
  }

  const skillsCount = countCodexSkills()
  const pass = afterDelete === 0 && playwrightExit === 0 && skillsCount === 15

  log(`Scenario 2 result: ${pass ? 'PASS' : 'FAIL'}`)
  log(`  - playwright exit: ${playwrightExit}`)
  log(`  - skill folders after sync: ${skillsCount}/15`)
  if (playwrightOut.trim()) log(`  - playwright output:\n${playwrightOut.trim()}`)

  try {
    electronChild.kill('SIGTERM')
  } catch {
    // ignore
  }
  killElectronAndVite()

  return { pass, skillsCount, playwrightExit }
}

fs.writeFileSync(LOG_FILE, '')
;(async () => {
  log(`Workspace: ${WORKSPACE}`)
  const s1 = await scenario1()
  const s2 = await scenario2(s1.child)

  log('\n========== SUMMARY ==========')
  log(`Scenario 1 (restart): ${s1.pass ? 'PASS' : 'FAIL'} — ${s1.skillsCount}/15 skills`)
  log(`Scenario 2 (sync btn): ${s2.pass ? 'PASS' : 'FAIL'} — ${s2.skillsCount}/15 skills`)

  process.exit(s1.pass && s2.pass ? 0 : 1)
})()
