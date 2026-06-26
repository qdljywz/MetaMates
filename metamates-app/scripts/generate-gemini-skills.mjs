#!/usr/bin/env node
/**
 * Generate `.gemini/skills/{name}/SKILL.md` from `.codebuddy/skills/{name}/SKILL.md`
 * in inits/zh and inits/en. Idempotent — safe to re-run after codebuddy skill updates.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INITS = path.join(__dirname, '..', 'inits')
const LANGS = ['zh', 'en']

const COMMAND_IDS = [
  'context', 'today', 'closeday', 'schedule',
  'trace', 'connect', 'challenge', 'ghost',
  'ideas', 'graduate', 'drift', 'emerge',
  'sync', 'soal', 'intel',
]

/**
 * @param {string} content
 * @returns {string}
 */
function toGeminiSkill(content) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\n---\n\*\*协议来源\*\*:.*$/s, '\n')
    .replace(/\n---\n\*\*Protocol source\*\*:.*$/s, '\n')
    .trimEnd() + '\n'
}

let created = 0
let updated = 0

for (const lang of LANGS) {
  const langRoot = path.join(INITS, lang)
  for (const name of COMMAND_IDS) {
    const src = path.join(langRoot, '.codebuddy', 'skills', name, 'SKILL.md')
    const destDir = path.join(langRoot, '.gemini', 'skills', name)
    const dest = path.join(destDir, 'SKILL.md')

    if (!fs.existsSync(src)) {
      console.warn(`SKIP ${lang}/${name}: missing ${src}`)
      continue
    }

    const next = toGeminiSkill(fs.readFileSync(src, 'utf-8'))
    fs.mkdirSync(destDir, { recursive: true })

    if (!fs.existsSync(dest)) {
      fs.writeFileSync(dest, next, 'utf-8')
      created++
      console.log(`CREATE ${lang}/.gemini/skills/${name}/SKILL.md`)
    } else if (fs.readFileSync(dest, 'utf-8') !== next) {
      fs.writeFileSync(dest, next, 'utf-8')
      updated++
      console.log(`UPDATE ${lang}/.gemini/skills/${name}/SKILL.md`)
    } else {
      console.log(`OK    ${lang}/.gemini/skills/${name}/SKILL.md`)
    }
  }
}

console.log(`\nDone: ${created} created, ${updated} updated`)
