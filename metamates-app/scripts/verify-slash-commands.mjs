#!/usr/bin/env node
/**
 * Verify slash commands ↔ inits skill files ↔ prompt registry.
 * Usage: node scripts/verify-slash-commands.mjs
 */
import fs from 'fs'
import path from 'path'
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

const LANGS = ['zh', 'en']
const BACKENDS = [
  { id: 'claude', required: true, resolve: (langRoot, name) => path.join(langRoot, '.claude', 'skills', `${name}.md`) },
  { id: 'codebuddy', required: true, resolve: (langRoot, name) => path.join(langRoot, '.codebuddy', 'skills', name, 'SKILL.md') },
  { id: 'gemini', required: true, resolve: (langRoot, name) => path.join(langRoot, '.gemini', 'skills', name, 'SKILL.md') },
]

const REQUIRED_DIRS = [
  '01_日记与计划', '02_项目与知识', '03_点滴积累', '04_情报与连接', '05_模板与配置',
]
const REQUIRED_DIRS_EN = [
  '01_Log_and_Plan', '02_Project_and_Knowledge', '03_Insights', '04_Intelligence', '05_Templates_and_Config',
]

let pass = 0
let fail = 0

function ok(label, detail = '') {
  pass++
  console.log(`OK  ${label}${detail ? ` — ${detail}` : ''}`)
}

function bad(label, detail = '') {
  fail++
  console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
}

function exists(p) {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

console.log('=== Slash command registry (inits skill files) ===\n')

for (const lang of LANGS) {
  const langRoot = path.join(INITS, lang)
  if (!exists(langRoot)) {
    bad(`inits/${lang}`, 'missing')
    continue
  }
  ok(`inits/${lang}`)

  const dirs = lang === 'zh' ? REQUIRED_DIRS : REQUIRED_DIRS_EN
  for (const dir of dirs) {
    const p = path.join(langRoot, dir)
    if (exists(p)) ok(`${lang}/${dir}`)
    else bad(`${lang}/${dir}`, 'missing folder')
  }

  for (const name of COMMAND_IDS) {
    for (const backend of BACKENDS) {
      const skillPath = backend.resolve(langRoot, name)
      if (exists(skillPath)) {
        const size = fs.statSync(skillPath).size
        ok(`${lang} ${backend.id} /${name}`, `${size} bytes`)
      } else if (backend.required) {
        bad(`${lang} ${backend.id} /${name}`, skillPath)
      }
    }
  }

  for (const file of ['Master_Control.md', '2M.md', 'AI_Commands_Prompt.md', 'README.md']) {
    const templatesDir = lang === 'zh' ? '05_模板与配置' : '05_Templates_and_Config'
    const p = path.join(langRoot, templatesDir, file)
    if (file === 'README.md') {
      const rootReadme = path.join(langRoot, 'README.md')
      if (exists(rootReadme)) ok(`${lang}/README.md`)
      else bad(`${lang}/README.md`)
      continue
    }
    if (exists(p)) ok(`${lang}/${templatesDir}/${file}`)
    else bad(`${lang}/${templatesDir}/${file}`)
  }
}

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`)
process.exit(fail > 0 ? 1 : 0)
