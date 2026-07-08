#!/usr/bin/env node
/**
 * Sync slash-command skills from inits/zh → app-root bundled copies
 * (.codebuddy, .codex, .claude, .gemini). Source of truth: inits/.
 *
 * Run after editing inits skills:
 *   npm run sync:inits-to-app
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const initsZh = path.join(appRoot, 'inits', 'zh')

const COMMAND_IDS = [
  'context', 'today', 'closeday', 'schedule',
  'trace', 'connect', 'challenge', 'ghost',
  'ideas', 'graduate', 'drift', 'emerge',
  'sync', 'soal', 'intel',
]

function copyFile(src, dest) {
  if (!fs.existsSync(src)) return false
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  return true
}

console.log('Regenerating inits gemini skills from codebuddy…')
const geminiGen = spawnSync('node', ['scripts/generate-gemini-skills.mjs'], {
  cwd: appRoot,
  stdio: 'inherit',
  shell: true,
})
if (geminiGen.status !== 0) process.exit(geminiGen.status ?? 1)

let copied = 0
let missing = 0

for (const name of COMMAND_IDS) {
  const pairs = [
    [
      path.join(initsZh, '.codebuddy', 'skills', name, 'SKILL.md'),
      path.join(appRoot, '.codebuddy', 'skills', name, 'SKILL.md'),
    ],
    [
      path.join(initsZh, '.codex', 'skills', name, 'SKILL.md'),
      path.join(appRoot, '.codex', 'skills', name, 'SKILL.md'),
    ],
    [
      path.join(initsZh, '.gemini', 'skills', name, 'SKILL.md'),
      path.join(appRoot, '.gemini', 'skills', name, 'SKILL.md'),
    ],
    [
      path.join(initsZh, '.claude', 'skills', `${name}.md`),
      path.join(appRoot, '.claude', 'skills', `${name}.md`),
    ],
  ]

  for (const [src, dest] of pairs) {
    if (copyFile(src, dest)) {
      copied++
      console.log('copied:', path.relative(appRoot, dest))
    } else {
      missing++
      console.warn('SKIP missing:', path.relative(initsZh, src))
    }
  }
}

console.log('---')
console.log(`Done. ${copied} file(s) copied, ${missing} missing source(s).`)
