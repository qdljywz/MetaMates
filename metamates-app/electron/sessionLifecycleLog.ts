/**
 * Append-only session lifecycle log for diagnosing unexpected MetaMates.exe exits.
 * File: %APPDATA%/MetaMates/session-lifecycle.jsonl (or Electron userData).
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { registerShutdownTask } from './processLifecycle'

const LOG_NAME = 'session-lifecycle.jsonl'
const GRACEFUL_EVENTS = new Set(['session_end_graceful', 'single_instance_denied'])

export type SessionLifecycleEvent =
  | 'session_start'
  | 'session_resume_after_unclean'
  | 'session_end_graceful'
  | 'before_quit'
  | 'shutdown_timeout'
  | 'window_all_closed'
  | 'second_instance'
  | 'single_instance_denied'
  | 'render_process_gone'
  | 'child_process_gone'
  | 'uncaught_exception'
  | 'unhandled_rejection'
  | 'main_window_closed'
  | 'window_watchdog_recreate'
  | 'window_watchdog_force_show'

export interface SessionLifecycleRecord {
  ts: string
  event: SessionLifecycleEvent
  pid: number
  packaged: boolean
  exe?: string
  detail?: string
  exitCode?: number
  reason?: string
}

function defaultUserDataDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'MetaMates')
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'MetaMates')
  }
  const config = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(config, 'MetaMates')
}

export function resolveSessionLifecycleLogPath(): string {
  try {
    if (app?.getPath) {
      return path.join(app.getPath('userData'), LOG_NAME)
    }
  } catch {
    // app not ready — fall through
  }
  return path.join(defaultUserDataDir(), LOG_NAME)
}

function readLastRecord(logPath: string): SessionLifecycleRecord | null {
  if (!fs.existsSync(logPath)) return null
  try {
    const raw = fs.readFileSync(logPath, 'utf8').trim()
    if (!raw) return null
    const lastLine = raw.split(/\r?\n/).filter(Boolean).pop()
    if (!lastLine) return null
    return JSON.parse(lastLine) as SessionLifecycleRecord
  } catch {
    return null
  }
}

export function appendSessionLifecycleEvent(
  event: SessionLifecycleEvent,
  extra: Partial<SessionLifecycleRecord> = {},
): void {
  try {
    const logPath = resolveSessionLifecycleLogPath()
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    const record: SessionLifecycleRecord = {
      ts: new Date().toISOString(),
      event,
      pid: process.pid,
      packaged: app.isPackaged,
      exe: process.execPath,
      ...extra,
    }
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, 'utf8')
    console.log(`[Lifecycle] ${event}${extra.detail ? ` — ${extra.detail}` : ''}`)
  } catch (err) {
    console.warn('[Lifecycle] failed to write session log:', err)
  }
}

/** Call once early in main process (after single-instance decision). */
export function installSessionLifecycleLog(): void {
  const logPath = resolveSessionLifecycleLogPath()
  const previous = readLastRecord(logPath)
  if (previous && !GRACEFUL_EVENTS.has(previous.event)) {
    appendSessionLifecycleEvent('session_resume_after_unclean', {
      detail: `previous=${previous.event} at ${previous.ts}`,
    })
  }

  appendSessionLifecycleEvent('session_start', {
    detail: `log=${logPath}`,
  })

  process.on('uncaughtException', (error) => {
    appendSessionLifecycleEvent('uncaught_exception', {
      detail: error?.message || String(error),
    })
  })

  process.on('unhandledRejection', (reason) => {
    appendSessionLifecycleEvent('unhandled_rejection', {
      detail: reason instanceof Error ? reason.message : String(reason),
    })
  })

  app.on('render-process-gone', (_event, webContents, details) => {
    appendSessionLifecycleEvent('render_process_gone', {
      reason: details.reason,
      exitCode: details.exitCode,
      detail: webContents.getURL(),
    })
  })

  app.on('child-process-gone', (_event, details) => {
    appendSessionLifecycleEvent('child_process_gone', {
      reason: details.reason,
      exitCode: details.exitCode,
      detail: details.type,
    })
  })

  registerShutdownTask(() => {
    appendSessionLifecycleEvent('session_end_graceful')
  })
}
