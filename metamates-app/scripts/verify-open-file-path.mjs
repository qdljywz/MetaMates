#!/usr/bin/env node
/**
 * Verify open-file path resolution end-to-end (structured sources only).
 * Run after: npm run electron:compile && npx vitest run src/test/toolOpenFilePath.test.ts
 */
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { spawn } from 'child_process'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const WORKSPACE = process.env.METAMATES_WORKSPACE || 'E:\\MyM2'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function load(rel) {
  return import(pathToFileURL(path.join(ROOT, 'dist-electron', rel)).href)
}

async function runVitest() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      'src/test/toolOpenFilePath.test.ts',
      'src/test/mergeToolCallBubble.test.ts',
      'src/test/acpStreamReducer.test.ts',
    ], { cwd: ROOT, stdio: 'inherit', shell: false })
    child.on('exit', (code) => resolve(code === 0))
  })
}

async function main() {
  const pipeline = await load('shared/sessionUpdatePipeline.cjs')

  const noGuess = pipeline.resolveToolFilePathFromUpdate({
    kind: 'edit',
    content: 'Master_Control.md and 2026-06-23.md in plain text',
  })
  record('pipeline: no path from plain text only', !noGuess, noGuess || 'null')

  const fromRaw = pipeline.resolveToolFilePathFromUpdate({
    kind: 'edit',
    rawInput: { file_path: `${WORKSPACE}\\01_日记与计划\\2026-06-23 PLAN.md` },
  })
  record(
    'pipeline: rawInput.file_path wins',
    fromRaw?.includes('2026-06-23 PLAN.md') === true,
    fromRaw,
  )

  const planPath = path.join(WORKSPACE, '01_日记与计划', '2026-06-23 PLAN.md')
  record('workspace: PLAN file exists', fs.existsSync(planPath), planPath)

  const vitestOk = await runVitest()
  record('vitest: tool open file tests', vitestOk)

  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.error('\nFailed checks:', failed.map((f) => f.name).join(', '))
    process.exit(1)
  }
  console.log('\nAll open-file path checks passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
