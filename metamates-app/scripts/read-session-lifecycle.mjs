#!/usr/bin/env node
/**
 * Show recent MetaMates session lifecycle events (unexpected exit diagnosis).
 *
 * Usage:
 *   npm run diag:session-log
 *   npm run diag:session-log -- 30
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const tail = Math.max(1, Number(process.argv[2]) || 20)

function defaultLogPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'MetaMates', 'session-lifecycle.jsonl')
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'MetaMates', 'session-lifecycle.jsonl')
  }
  const config = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(config, 'MetaMates', 'session-lifecycle.jsonl')
}

const logPath = process.env.METAMATES_SESSION_LOG || defaultLogPath()

console.log(`Session lifecycle log: ${logPath}`)
if (!fs.existsSync(logPath)) {
  console.log('(no log yet — run a build with session lifecycle tracking, then launch MetaMates once)')
  process.exit(0)
}

const lines = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/).filter(Boolean)
const recent = lines.slice(-tail)
console.log(`\nLast ${recent.length} event(s):\n`)
for (const line of recent) {
  try {
    const row = JSON.parse(line)
    const detail = row.detail ? ` — ${row.detail}` : ''
    const extra = row.reason ? ` [${row.reason}${row.exitCode != null ? `/${row.exitCode}` : ''}]` : ''
    console.log(`${row.ts}  ${row.event}${extra}${detail}`)
  } catch {
    console.log(line)
  }
}

const last = recent.length ? JSON.parse(recent[recent.length - 1]) : null
if (last && last.event === 'session_resume_after_unclean') {
  console.log('\n⚠️  Previous session did NOT end cleanly — see event above.')
} else if (last && last.event !== 'session_end_graceful' && last.event !== 'single_instance_denied') {
  console.log(`\n⚠️  Last recorded event was "${last.event}" (not a graceful shutdown marker).`)
} else if (last?.event === 'session_end_graceful') {
  console.log('\n✓ Last session ended gracefully.')
}
