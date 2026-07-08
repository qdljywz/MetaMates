#!/usr/bin/env node
/**
 * Ensure app-bundled slash skills match inits/zh (source of truth).
 * Fix drift: npm run sync:inits-to-app
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const initsZh = path.join(appRoot, 'inits', 'zh')

const COMMAND_IDS = [
  'context', 'today', 'closeday', 'schedule',
  'trace', 'connect', 'challenge', 'ghost',
  'ideas', 'graduate', 'drift', 'emerge',
  'sync', 'soal', 'intel',
]

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function pairsFor(name) {
  return [
    [`.codebuddy/skills/${name}/SKILL.md`, `.codebuddy/skills/${name}/SKILL.md`],
    [`.codex/skills/${name}/SKILL.md`, `.codex/skills/${name}/SKILL.md`],
    [`.gemini/skills/${name}/SKILL.md`, `.gemini/skills/${name}/SKILL.md`],
    [`.claude/skills/${name}.md`, `.claude/skills/${name}.md`],
  ]
}

let drift = 0

for (const name of COMMAND_IDS) {
  for (const [srcRel, destRel] of pairsFor(name)) {
    const src = path.join(initsZh, srcRel)
    const dest = path.join(appRoot, destRel)
    if (!fs.existsSync(src)) {
      console.error(`[inits-sync] MISSING source: inits/zh/${srcRel}`)
      drift++
      continue
    }
    if (!fs.existsSync(dest)) {
      console.error(`[inits-sync] MISSING bundled: ${destRel} — run npm run sync:inits-to-app`)
      drift++
      continue
    }
    if (hashFile(src) !== hashFile(dest)) {
      console.error(`[inits-sync] DRIFT: ${destRel} ≠ inits/zh/${srcRel} — run npm run sync:inits-to-app`)
      drift++
    }
  }
}

if (drift > 0) {
  console.error(`[inits-sync] FAIL — ${drift} mismatch(es)`)
  process.exit(1)
}

console.log(`[inits-sync] PASS — ${COMMAND_IDS.length} commands × 4 layouts match inits/zh`)
