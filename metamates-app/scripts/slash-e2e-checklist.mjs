#!/usr/bin/env node
/**
 * Pre-flight check before manual slash E2E: CLIs on PATH, workspace skills present.
 *
 * Usage:
 *   node scripts/slash-e2e-checklist.mjs
 *   node scripts/slash-e2e-checklist.mjs --workspace E:/path/to/vault
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const INITS = path.join(ROOT, 'inits')

const COMMAND_IDS = [
  'context', 'today', 'closeday', 'schedule',
  'trace', 'connect', 'challenge', 'ghost',
  'ideas', 'graduate', 'drift', 'emerge',
  'sync', 'soal', 'intel',
]

const CLIS = ['gemini', 'claude', 'codebuddy', 'qwen', 'codex']

/**
 * @param {string} cmd
 */
function onPath(cmd) {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} workspace
 * @param {'zh'|'en'} lang
 */
function checkWorkspaceSkills(workspace, lang) {
  const layouts = [
    (n) => path.join(workspace, '.claude', 'skills', `${n}.md`),
    (n) => path.join(workspace, '.codebuddy', 'skills', n, 'SKILL.md'),
    (n) => path.join(workspace, '.gemini', 'skills', n, 'SKILL.md'),
  ]
  let missing = 0
  for (const name of COMMAND_IDS) {
    const ok = layouts.some((resolve) => fs.existsSync(resolve(name)))
    if (!ok) {
      console.log(`  MISSING (any backend) /${name}`)
      missing++
    }
  }
  const templates = lang === 'en' ? '05_Templates_and_Config' : '05_模板与配置'
  const mc = path.join(workspace, templates, 'Master_Control.md')
  const tm = path.join(workspace, templates, '2M.md')
  if (!fs.existsSync(mc)) console.log(`  MISSING ${templates}/Master_Control.md`)
  if (!fs.existsSync(tm)) console.log(`  MISSING ${templates}/2M.md`)
  return missing
}

const args = process.argv.slice(2)
let workspace = ''
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--workspace' && args[i + 1]) workspace = args[++i]
}

console.log('=== Slash E2E readiness ===\n')

console.log('## Inits template (source of truth)')
for (const lang of ['zh', 'en']) {
  let fail = 0
  for (const name of COMMAND_IDS) {
    const p = path.join(INITS, lang, '.gemini', 'skills', name, 'SKILL.md')
    if (!fs.existsSync(p)) {
      console.log(`  FAIL inits/${lang}/.gemini/skills/${name}/SKILL.md`)
      fail++
    }
  }
  console.log(fail === 0 ? `  OK   inits/${lang} gemini skills (15/15)` : `  WARN inits/${lang} missing ${fail} gemini skills`)
}

console.log('\n## CLIs on PATH')
const found = CLIS.filter(onPath)
if (found.length === 0) {
  console.log('  WARN No CLI detected — manual E2E needs at least one connected Agent')
} else {
  for (const c of found) console.log(`  OK   ${c}`)
}

if (workspace) {
  console.log(`\n## Workspace: ${workspace}`)
  if (!fs.existsSync(workspace)) {
    console.log('  FAIL path does not exist')
  } else {
    const lang = fs.existsSync(path.join(workspace, '01_Log_and_Plan')) ? 'en' : 'zh'
    const missing = checkWorkspaceSkills(workspace, lang)
    console.log(missing === 0 ? '  OK   all 15 skills reachable' : `  WARN ${missing} commands missing skill files`)
    console.log('  TIP  Open MetaMates or run reinit-workspace to auto-provision missing skills')
  }
} else {
  console.log('\n## Workspace')
  console.log('  SKIP Pass --workspace E:/your/vault to verify live workspace skills')
}

console.log('\n## Manual checklist')
console.log(`  See ${path.join(ROOT, 'docs', 'E2E_SLASH_COMMANDS.md')}`)
console.log('\nDone.')
