#!/usr/bin/env node
/**
 * Verify slash prompt assembly for all 15 commands (read skill + path hints).
 * Does not call live CLI — validates the same paths AgentChatPanel uses.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const require = createRequire(import.meta.url)

const { resolveSkillPaths } = require(path.join(ROOT, 'dist-electron', 'shared', 'skillLayouts.cjs'))
const { buildWorkspacePathHints, normalizeSkillFilePaths } = require(path.join(ROOT, 'dist-electron', 'shared', 'skillPaths.cjs'))

// Write policy strings expected for required-write commands
const REQUIRED_WRITE = new Set(['today', 'closeday', 'schedule', 'graduate', 'sync', 'soal', 'intel'])

const BACKENDS = ['gemini', 'claude', 'codebuddy', 'qwen']
const COMMANDS = [
  'context', 'today', 'closeday', 'schedule',
  'trace', 'connect', 'challenge', 'ghost',
  'ideas', 'graduate', 'drift', 'emerge',
  'sync', 'soal', 'intel',
]

const workspace = process.argv.includes('--workspace')
  ? process.argv[process.argv.indexOf('--workspace') + 1]
  : path.join(ROOT, 'inits', 'zh')

let pass = 0
let fail = 0

/** @param {boolean} ok @param {string} msg */
function ok(ok, msg) {
  if (ok) { pass++; console.log(`OK   ${msg}`) }
  else { fail++; console.log(`FAIL ${msg}`) }
}

console.log(`=== Slash prompt assembly test ===`)
console.log(`Workspace: ${workspace}\n`)

if (!fs.existsSync(workspace)) {
  console.error('Workspace not found')
  process.exit(1)
}

for (const backend of BACKENDS) {
  for (const cmd of COMMANDS) {
    const paths = resolveSkillPaths(workspace, cmd, backend)
    const found = paths.find((p) => fs.existsSync(p))
    if (backend === 'qwen') {
      ok(!!found, `${backend} /${cmd} → fallback ${found ? path.basename(path.dirname(found)) : 'NONE'}`)
    } else {
      ok(!!found, `${backend} /${cmd} → ${found ? path.relative(workspace, found) : 'MISSING'}`)
    }
    if (found) {
      const raw = fs.readFileSync(found, 'utf-8')
      const content = normalizeSkillFilePaths(raw, 'zh')
      const hints = buildWorkspacePathHints('zh', workspace)
      const prompt = `${hints}\n\n${content}`.trim()
      ok(prompt.length > 50, `${backend} /${cmd} prompt length ${prompt.length}`)
      ok(hints.includes('Master_Control.md'), `${backend} /${cmd} path hints include Master_Control`)
      if (REQUIRED_WRITE.has(cmd) && (backend === 'gemini' || backend === 'codebuddy') && raw.includes('allowed-tools:')) {
        ok(raw.includes('Write'), `${backend} /${cmd} allowed-tools includes Write`)
      }
    }
  }
}

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`)
process.exit(fail > 0 ? 1 : 0)
