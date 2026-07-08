#!/usr/bin/env node
/**
 * Fail if files that should stay private are tracked by git.
 * Usage: node scripts/check-open-source-hygiene.mjs
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @returns {string} */
function gitRoot() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: APP_ROOT,
    encoding: 'utf8',
  })
  return result.status === 0 ? result.stdout.trim() : APP_ROOT
}

const REPO_ROOT = gitRoot()

const forbiddenPatterns = [
  /^\.env$/,
  /^\.env\.local$/,
  /\/\.env$/,
  /\/\.env\.local$/,
  /conversations\.(db|sqlite)/,
  /session-store\.json$/,
  /settings\.local\.json$/,
  /\/config\/ai-config\.json$/,
  /\/config\/api-keys\//,
  /-report\.json$/,
  /business-logic-report\.json$/,
  /^MyMetaMates\//,
  /^Test\//,
  /\/MyM2\//,
  /^PLAN\.md$/,
  /^VERSION\.md$/,
  /^project_rules\.md$/,
  /^功能确认\.md$/,
  /^错误记录\.md$/,
  /\/Inbox\/(?!\.gitkeep)[^/]+$/,
  /\/release\//,
  /\/release-build\//,
  /\/dist\//,
  /\/dist-electron\//,
  /\/node_modules\//,
  /\.pfx$/,
  /\.p12$/,
  /\.pem$/,
  /\/\.trae\//,
]

function gitTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8' })
  if (result.status !== 0) {
    console.warn('[hygiene] git ls-files failed — run inside a git repository')
    return []
  }
  return result.stdout.split('\0').filter(Boolean)
}

const tracked = gitTrackedFiles()
const violations = tracked.filter((file) =>
  forbiddenPatterns.some((re) => re.test(file.replace(/\\/g, '/'))),
)

if (violations.length === 0) {
  console.log(`[hygiene] OK — ${tracked.length} tracked file(s), no forbidden patterns`)
  process.exit(0)
}

console.error(`[hygiene] ${violations.length} file(s) should not be public:`)
for (const file of violations) {
  console.error(`  - ${file}`)
}
console.error('\nFix: git rm --cached <path>  then commit. See docs/OPEN_SOURCE.md §四.')
process.exit(1)
