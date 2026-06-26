#!/usr/bin/env node
/**
 * Integration test: init-workspace + reinit-workspace file copy (pure fs, no Electron).
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const INITS = path.join(ROOT, 'inits', 'en')
const REQUIRED_DIRS = [
  '01_Log_and_Plan',
  '02_Project_and_Knowledge',
  '03_Insights',
  '04_Intelligence',
  '05_Templates_and_Config',
]

const REQUIRED_FILES = ['README.md', 'CLAUDE.md', 'CODEBUDDY.md', 'GEMINI.md']

const COMMAND_IDS = [
  'context', 'today', 'closeday', 'schedule',
  'trace', 'connect', 'challenge', 'ghost',
  'ideas', 'graduate', 'drift', 'emerge',
  'sync', 'soal',
]

let pass = 0
let fail = 0

/** @param {boolean} ok @param {string} label @param {string} [detail] */
function assert(ok, label, detail = '') {
  if (ok) {
    pass++
    console.log(`OK   ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** @param {string} workspacePath @param {string} name */
function skillExists(workspacePath, name) {
  return (
    fs.existsSync(path.join(workspacePath, '.claude', 'skills', `${name}.md`)) ||
    fs.existsSync(path.join(workspacePath, '.codebuddy', 'skills', name, 'SKILL.md')) ||
    fs.existsSync(path.join(workspacePath, '.gemini', 'skills', name, 'SKILL.md'))
  )
}

/** @param {string} workspacePath */
function copyInitsToWorkspace(workspacePath) {
  for (const entry of fs.readdirSync(INITS, { withFileTypes: true })) {
    const src = path.join(INITS, entry.name)
    const dest = path.join(workspacePath, entry.name)
    if (entry.isDirectory()) {
      if (!fs.existsSync(dest)) fs.cpSync(src, dest, { recursive: true })
    } else if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest)
    }
  }
}

/** @param {string} workspacePath — reinit: only copy missing files */
function reinitWorkspace(workspacePath) {
  const created = []
  function syncDir(srcDir, destDir, rel = '') {
    for (const item of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const srcItem = path.join(srcDir, item.name)
      const destItem = path.join(destDir, item.name)
      const itemRel = rel ? `${rel}/${item.name}` : item.name
      if (item.isDirectory()) {
        if (!fs.existsSync(destItem)) fs.mkdirSync(destItem, { recursive: true })
        syncDir(srcItem, destItem, itemRel)
      } else if (!fs.existsSync(destItem)) {
        fs.copyFileSync(srcItem, destItem)
        created.push(itemRel)
      }
    }
  }
  for (const entry of fs.readdirSync(INITS, { withFileTypes: true })) {
    const src = path.join(INITS, entry.name)
    const dest = path.join(workspacePath, entry.name)
    if (entry.isDirectory()) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
      syncDir(src, dest, entry.name)
    } else if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest)
      created.push(entry.name)
    }
  }
  return created
}

console.log('=== Workspace init / reinit integration test ===\n')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-init-test-'))
console.log(`Temp: ${tmpRoot}\n`)

try {
  copyInitsToWorkspace(tmpRoot)

  for (const dir of REQUIRED_DIRS) {
    assert(fs.existsSync(path.join(tmpRoot, dir)), `init: folder ${dir}`)
  }
  for (const file of REQUIRED_FILES) {
    assert(fs.existsSync(path.join(tmpRoot, file)), `init: file ${file}`)
  }
  for (const name of COMMAND_IDS) {
    assert(skillExists(tmpRoot, name), `init: skill /${name}`)
  }

  const geminiToday = path.join(tmpRoot, '.gemini', 'skills', 'today', 'SKILL.md')
  assert(fs.existsSync(geminiToday), 'init: gemini /today SKILL.md')

  const countBefore = fs.readdirSync(tmpRoot).length
  copyInitsToWorkspace(tmpRoot)
  assert(fs.readdirSync(tmpRoot).length === countBefore, 'init idempotent (no duplicate top-level entries)')

  fs.rmSync(geminiToday, { force: true })
  assert(!fs.existsSync(geminiToday), 'setup: removed gemini /today')

  const created = reinitWorkspace(tmpRoot)
  assert(fs.existsSync(geminiToday), 'reinit: restored gemini /today')
  assert(created.some((p) => p.includes('today')), 'reinit: reported created item', created.filter((p) => p.includes('today')).join(', '))

  const hasStructure = fs.readdirSync(tmpRoot).some((n) => n.startsWith('01_'))
  assert(hasStructure, 'workspace has 01_* structure (wizard would skip full init on existing vault)')

  console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`)
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}

process.exit(fail > 0 ? 1 : 0)
