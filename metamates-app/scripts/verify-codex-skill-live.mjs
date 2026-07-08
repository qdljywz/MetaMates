#!/usr/bin/env node
/**
 * Live verification: detect Codex CLI and provision .codex/skills in a real workspace.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

import { resolveDefaultWorkspace } from './lib/default-workspace.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const require = createRequire(import.meta.url)

const WORKSPACE = process.argv[2] ? path.resolve(process.argv[2]) : resolveDefaultWorkspace('MM_TEST_WORKSPACE')

const { detectInstalledCliAgents } = require(path.join(ROOT, 'dist-electron', 'cliDetection.cjs'))
const {
  ensureSkillsForDetectedBackend,
  syncAllWorkspaceSkills,
} = require(path.join(ROOT, 'dist-electron', 'workspaceSkills.cjs'))
const { getWorkspaceSkillRelativePath } = require(path.join(ROOT, 'dist-electron', 'shared', 'skillLayouts.cjs'))

let pass = 0
let fail = 0

function ok(cond, msg) {
  if (cond) {
    pass++
    console.log(`OK   ${msg}`)
  } else {
    fail++
    console.log(`FAIL ${msg}`)
  }
}

console.log('=== Live Codex skill provision ===\n')
console.log(`Workspace: ${WORKSPACE}\n`)

if (!fs.existsSync(WORKSPACE)) {
  console.error(`Workspace not found: ${WORKSPACE}`)
  process.exit(1)
}

;(async () => {
  const agents = await detectInstalledCliAgents(undefined, true)
  const backends = agents.map((a) => a.backend)
  console.log(`Detected backends: ${backends.join(', ') || '(none)'}\n`)

  ok(backends.includes('codex'), 'Codex CLI detected')

  const codexTodayRel = getWorkspaceSkillRelativePath('codex', 'today')
  const codexTodayAbs = path.join(WORKSPACE, codexTodayRel)
  const hadBefore = fs.existsSync(codexTodayAbs)

  const r1 = ensureSkillsForDetectedBackend(WORKSPACE, 'zh', 'codex')
  ok(r1.success, `provision codex success (${r1.created.length} created, ${r1.skipped.length} skipped)`)

  ok(fs.existsSync(codexTodayAbs), `${codexTodayRel} exists`)

  const skillFiles = fs
    .readdirSync(path.join(WORKSPACE, '.codex', 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
  ok(skillFiles.length === 15, `15 skill folders under .codex/skills (got ${skillFiles.length})`)

  const r2 = syncAllWorkspaceSkills(WORKSPACE, 'zh', backends)
  ok(r2.success && r2.created.length === 0, `idempotent full sync (0 created, got ${r2.created.length})`)

  if (!hadBefore && r1.created.length > 0) {
    console.log('\nCreated on this run:')
    for (const rel of r1.created) console.log(`  + ${rel}`)
  } else if (hadBefore) {
    console.log('\n.codex/skills already present before this run — provision is idempotent.')
  }

  // Fresh workspace slice: prove creation from scratch
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-codex-live-'))
  try {
    const r3 = ensureSkillsForDetectedBackend(fresh, 'zh', 'codex')
    const freshToday = path.join(fresh, codexTodayRel)
    ok(r3.success && r3.created.length === 15, `fresh workspace creates 15 codex skills (got ${r3.created.length})`)
    ok(fs.existsSync(freshToday), 'fresh workspace has .codex/skills/today/SKILL.md')
    ok(!fs.existsSync(path.join(fresh, '.claude')), 'fresh codex-only workspace has no .claude')
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true })
  }

  console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`)
  process.exit(fail > 0 ? 1 : 0)
})()
