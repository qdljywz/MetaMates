#!/usr/bin/env node
/** spawnSync vitest with timeout — avoids Windows hangs in verify scripts. */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const TIMEOUT_MS = Number(process.env.VITEST_TIMEOUT_MS) || 120_000

export function runVitest(testFiles, env = {}) {
  const args = ['vitest', 'run', ...testFiles]
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args,
    {
      cwd: ROOT,
      encoding: 'utf-8',
      shell: process.platform === 'win32',
      timeout: TIMEOUT_MS,
      env: { ...process.env, ...env },
    },
  )

  if (result.error?.code === 'ETIMEDOUT') {
    return { status: 1, stdout: '', stderr: `vitest timed out after ${TIMEOUT_MS}ms` }
  }

  return result
}
