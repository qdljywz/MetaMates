/**
 * Push updated inits/zh template files into an existing workspace.
 * Overwrites template/skill files; never touches Master_Control.md (personal).
 *
 * Usage: node scripts/sync-inits-to-workspace.mjs [workspacePath]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const initsZh = path.join(appRoot, 'inits', 'zh')
const workspaceArg = process.argv[2]?.trim()
if (!workspaceArg) {
  console.error('Usage: node scripts/sync-inits-to-workspace.mjs <workspacePath>')
  console.error('Example: node scripts/sync-inits-to-workspace.mjs E:\\MyM2')
  process.exit(1)
}
const workspace = path.resolve(workspaceArg)

const COMMAND_IDS = [
  'context', 'today', 'closeday', 'schedule',
  'trace', 'connect', 'challenge', 'ghost',
  'ideas', 'graduate', 'drift', 'emerge',
  'sync', 'soal', 'intel',
]

if (!fs.existsSync(workspace)) {
  console.error('Workspace not found:', workspace)
  process.exit(1)
}

/** Relative paths to copy verbatim from inits/zh → workspace */
const DOC_PATHS = [
  'README.md',
  'CODEBUDDY.md',
  'CLAUDE.md',
  'GEMINI.md',
  'AI_Commands_Prompt.md',
  '05_模板与配置/CodeBuddy.md',
  '05_模板与配置/Claude.md',
  '05_模板与配置/GEMINI.md',
  '05_模板与配置/AI_Commands_Prompt.md',
  '05_模板与配置/Master_Control_Template.md',
]

function skillPaths(name) {
  return [
    `.codebuddy/skills/${name}/SKILL.md`,
    `.codex/skills/${name}/SKILL.md`,
    `.gemini/skills/${name}/SKILL.md`,
    `.claude/skills/${name}.md`,
  ]
}

const COPY_PATHS = [
  ...DOC_PATHS,
  ...COMMAND_IDS.flatMap(skillPaths),
]

function copyOne(rel) {
  const src = path.join(initsZh, rel)
  const dest = path.join(workspace, rel)
  if (!fs.existsSync(src)) {
    console.warn('SKIP missing source:', rel)
    return false
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  console.log('copied:', rel)
  return true
}

function patch2mTimezone() {
  const rel = '05_模板与配置/2M.md'
  const dest = path.join(workspace, rel)
  if (!fs.existsSync(dest)) {
    return copyOne(rel)
  }
  const oldLine = '*   **时区偏好:** 北京时间 (CST/UTC+8).'
  const newLine = '*   **时区偏好:** IANA（MetaMates 设置，默认 `Asia/Shanghai`）。'
  let text = fs.readFileSync(dest, 'utf8')
  if (text.includes(oldLine)) {
    text = text.replace(oldLine, newLine)
    fs.writeFileSync(dest, text, 'utf8')
    console.log('patched timezone line:', rel)
    return true
  }
  if (text.includes(newLine)) {
    console.log('already patched:', rel)
    return true
  }
  console.warn('2M timezone line not found — left unchanged:', rel)
  return false
}

console.log('Regenerating inits gemini skills from codebuddy…')
const geminiGen = spawnSync('node', ['scripts/generate-gemini-skills.mjs'], {
  cwd: appRoot,
  stdio: 'inherit',
  shell: true,
})
if (geminiGen.status !== 0) process.exit(geminiGen.status ?? 1)

console.log('Source:', initsZh)
console.log('Target:', workspace)
console.log('---')

let n = 0
for (const rel of COPY_PATHS) {
  if (copyOne(rel)) n++
}
if (patch2mTimezone()) n++

console.log('---')
console.log(`Done. ${n} file(s) updated. Skipped Master_Control.md (personal content preserved).`)
