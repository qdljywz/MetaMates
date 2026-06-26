#!/usr/bin/env node
/**
 * Integration check: provision per-CLI skill paths into a temp workspace.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const require = createRequire(import.meta.url)

const {
  syncAllWorkspaceSkills,
  ensureSkillsForDetectedBackend,
} = require(path.join(ROOT, 'dist-electron', 'workspaceSkills.cjs'))
const {
  getWorkspaceSkillRelativePath,
  resolveSkillPaths,
} = require(path.join(ROOT, 'dist-electron', 'shared', 'skillLayouts.cjs'))

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-skills-'))
console.log(`=== Skill provision integration ===\nTemp workspace: ${tmp}\n`)

try {
  const r1 = ensureSkillsForDetectedBackend(tmp, 'zh', 'qwen')
  const qwenToday = path.join(tmp, getWorkspaceSkillRelativePath('qwen', 'today'))
  ok(r1.success, 'qwen provision success')
  ok(fs.existsSync(qwenToday), 'qwen today SKILL.md exists')
  ok(r1.created.length === 15, `qwen created exactly 15 skills (got ${r1.created.length})`)
  ok(!fs.existsSync(path.join(tmp, '.claude')), 'no .claude when only qwen provisioned')
  ok(!fs.existsSync(path.join(tmp, '.gemini')), 'no .gemini when only qwen provisioned')

  const r2 = syncAllWorkspaceSkills(tmp, 'zh', ['qwen', 'codex', 'claude'])
  const codexSync = path.join(tmp, getWorkspaceSkillRelativePath('codex', 'sync'))
  const claudeToday = path.join(tmp, getWorkspaceSkillRelativePath('claude', 'today'))
  ok(r2.success, 'sync all success')
  ok(fs.existsSync(codexSync), 'codex sync SKILL.md exists')
  ok(fs.existsSync(claudeToday), 'claude today.md exists')

  const r3 = syncAllWorkspaceSkills(tmp, 'zh', ['qwen', 'codex'])
  ok(r3.success && r3.created.length === 0, 'idempotent second sync (0 created)')

  const paths = resolveSkillPaths(tmp, 'today', 'qwen')
  ok(paths[0] === qwenToday, 'resolveSkillPaths prefers qwen native path')

  const content = fs.readFileSync(qwenToday, 'utf8')
  ok(content.includes('---'), 'qwen skill has YAML frontmatter')
  ok(/今日|计划|today/i.test(content), 'qwen skill has expected body')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`)
process.exit(fail > 0 ? 1 : 0)
