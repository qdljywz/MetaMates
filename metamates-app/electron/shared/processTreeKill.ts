/**
 * Cross-platform process-tree termination.
 * ACP CLIs spawn MCP bridge grandchildren; plain child.kill() leaves orphans on Windows.
 */

import { execSync, spawnSync } from 'child_process'

export type MetaMatesProcessInfo = {
  pid: number
  parentPid: number
  name: string
  commandLine: string
}

function listUnixChildPids(parentPid: number): number[] {
  try {
    const out = execSync(`pgrep -P ${parentPid}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (!out) return []
    return out
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0)
  } catch {
    return []
  }
}

function killUnixProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
  for (const childPid of listUnixChildPids(pid)) {
    killUnixProcessTree(childPid, signal)
  }
  try {
    process.kill(pid, signal)
  } catch {
    /* already exited or permission denied */
  }
}

/**
 * Terminate a process and its descendants (best effort).
 */
export function killProcessTree(pid: number | undefined | null, options?: { force?: boolean }): void {
  if (pid == null || !Number.isInteger(pid) || pid <= 0) return

  const force = options?.force ?? false

  try {
    if (process.platform === 'win32') {
      const args = force
        ? ['/PID', String(pid), '/T', '/F']
        : ['/PID', String(pid), '/T']
      spawnSync('taskkill', args, { windowsHide: true, stdio: 'ignore' })
      return
    }

    killUnixProcessTree(pid, force ? 'SIGKILL' : 'SIGTERM')
    if (force) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

/** True when this process clearly belongs to MetaMates (not Cursor / other Electron apps). */
export function isMetaMatesProcess(name: string, commandLine: string, appRoot: string): boolean {
  const exe = (name || '').toLowerCase()
  const cmd = normalizePath(commandLine || '')
  const root = normalizePath(appRoot)
  const rootWin = appRoot.replace(/\//g, '\\')

  if (/^metamates\.exe$/i.test(name || '')) return true

  const underAppRoot = cmd.includes(root) || commandLine.includes(rootWin)

  if (!underAppRoot) {
    if (/vault-mcp-bridge\.mjs/i.test(cmd) && cmd.includes('metamates-app')) return true
    if (/ollama-acp-bridge\.mjs/i.test(cmd) && cmd.includes('metamates-app')) return true
    if (/win-unpacked\/MetaMates/i.test(cmd)) return true
    return false
  }

  if (exe === 'electron.exe') {
    return (
      /dist-electron\/main\.cjs/i.test(cmd) ||
      /metamates-app[\\/]node_modules[\\/]electron/i.test(cmd) ||
      /metamates-app[\\/]\./i.test(cmd) ||
      /electron:dev/i.test(cmd) ||
      /win-unpacked/i.test(cmd)
    )
  }

  if (exe === 'node.exe') {
    return (
      /metamates-app\//i.test(cmd) &&
      (/vite/i.test(cmd) ||
        /concurrently/i.test(cmd) ||
        /wait-on/i.test(cmd) ||
        /electron/i.test(cmd) ||
        /vault-mcp-bridge/i.test(cmd) ||
        /ollama-acp-bridge/i.test(cmd) ||
        /compile-electron/i.test(cmd))
    )
  }

  return false
}

function isDevNodeSibling(proc: MetaMatesProcessInfo): boolean {
  const cmd = normalizePath(proc.commandLine)
  return proc.name.toLowerCase() === 'node.exe' && /vite|concurrently|wait-on/i.test(cmd)
}

function collectAncestorPids(pid: number, maxDepth = 24): ReadonlySet<number> {
  const ancestors = new Set<number>()
  let current: number | null = pid
  for (let depth = 0; depth < maxDepth && current != null; depth += 1) {
    const parent = getParentProcessId(current)
    if (parent == null) break
    ancestors.add(parent)
    current = parent
  }
  return ancestors
}

/**
 * Keep processes that belong to the current dev session (self, parent launcher, sibling Vite).
 * In npm/concurrently dev, Electron's parent is often wait-on, not concurrently — walk ancestors
 * so Vite started by the same concurrently instance is not killed on startup.
 */
export function shouldKeepStaleProcess(
  proc: MetaMatesProcessInfo,
  currentPid: number,
  currentParentPid: number | null,
  ancestorPids?: ReadonlySet<number>,
): boolean {
  if (proc.pid === currentPid) return true
  if (ancestorPids?.has(proc.pid)) return true
  if (currentParentPid != null && proc.pid === currentParentPid) return true
  if (
    currentParentPid != null &&
    proc.parentPid === currentParentPid &&
    isDevNodeSibling(proc)
  ) {
    return true
  }
  if (ancestorPids?.has(proc.parentPid) && isDevNodeSibling(proc)) {
    return true
  }
  return false
}

/** Dev-only: sibling Vite/concurrently nodes launched by the same npm parent. */
export function shouldKillSiblingDevProcess(
  proc: MetaMatesProcessInfo,
  currentPid: number,
  currentParentPid: number | null,
  appRoot: string,
): boolean {
  if (proc.pid === currentPid) return false
  if (currentParentPid == null || proc.parentPid !== currentParentPid) return false
  if (!isMetaMatesProcess(proc.name, proc.commandLine, appRoot)) return false
  return isDevNodeSibling(proc)
}

export function getParentProcessId(pid: number): number | null {
  if (!Number.isInteger(pid) || pid <= 0) return null
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId"`,
        { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim()
      const parent = Number(out)
      return Number.isInteger(parent) && parent > 0 ? parent : null
    }
    const out = execSync(`ps -o ppid= -p ${pid}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const parent = Number(out)
    return Number.isInteger(parent) && parent > 0 ? parent : null
  } catch {
    return null
  }
}

function listMetaMatesProcesses(appRoot: string): MetaMatesProcessInfo[] {
  try {
    if (process.platform === 'win32') {
      const escaped = normalizePath(appRoot).replace(/'/g, "''")
      const out = execSync(
        `powershell -NoProfile -NonInteractive -Command "$root='${escaped}'; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress"`,
        { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      ).trim()
      if (!out) return []
      const parsed = JSON.parse(out) as
        | { ProcessId: number; ParentProcessId: number; Name: string; CommandLine: string }
        | Array<{ ProcessId: number; ParentProcessId: number; Name: string; CommandLine: string }>
      const rows = Array.isArray(parsed) ? parsed : [parsed]
      return rows
        .map((row) => ({
          pid: Number(row.ProcessId),
          parentPid: Number(row.ParentProcessId),
          name: String(row.Name || ''),
          commandLine: String(row.CommandLine || ''),
        }))
        .filter((row) => Number.isInteger(row.pid) && row.pid > 0)
        .filter((row) => isMetaMatesProcess(row.name, row.commandLine, appRoot))
    }

    const out = execSync('ps -ax -o pid=,ppid=,command=', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const root = normalizePath(appRoot)
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/)
        if (!match) return null
        const pid = Number(match[1])
        const parentPid = Number(match[2])
        const commandLine = match[3] || ''
        const name = commandLine.split(/\s+/)[0]?.split('/').pop() || ''
        return { pid, parentPid, name, commandLine }
      })
      .filter((row): row is MetaMatesProcessInfo => row != null && Number.isInteger(row.pid) && row.pid > 0)
      .filter((row) => isMetaMatesProcess(row.name, row.commandLine, appRoot))
  } catch {
    return []
  }
}

/**
 * On startup, remove MetaMates processes left from a previous crash or unclean exit.
 * Keeps the current Electron process, its npm/concurrently parent, and sibling Vite.
 */
export function killStaleMetaMatesProcesses(appRoot: string, currentPid: number): number {
  const parentPid = getParentProcessId(currentPid)
  const ancestorPids = collectAncestorPids(currentPid)
  let killed = 0
  for (const proc of listMetaMatesProcesses(appRoot)) {
    if (shouldKeepStaleProcess(proc, currentPid, parentPid, ancestorPids)) continue
    killProcessTree(proc.pid, { force: true })
    killed += 1
  }
  if (killed > 0) {
    console.log(`[ProcessCleanup] Removed ${killed} stale MetaMates process(es) from previous session`)
  }
  return killed
}

/** Dev-only: stop sibling Vite/concurrently when Electron exits so port 3000 is released. */
export function killSiblingDevProcesses(appRoot: string, currentPid: number): void {
  const parentPid = getParentProcessId(currentPid)
  if (parentPid == null) return
  for (const proc of listMetaMatesProcesses(appRoot)) {
    if (!shouldKillSiblingDevProcess(proc, currentPid, parentPid, appRoot)) continue
    killProcessTree(proc.pid, { force: true })
  }
}

/**
 * Kill orphaned MetaMates helper processes (MCP bridges) by app root path.
 */
export function killOrphanMetaMatesHelpers(appRoot: string): void {
  const normalized = appRoot.replace(/\\/g, '/')
  if (!normalized) return

  const bridgeScripts = ['vault-mcp-bridge.mjs', 'ollama-acp-bridge.mjs']

  try {
    if (process.platform === 'win32') {
      const escaped = normalized.replace(/'/g, "''")
      const bridgeMatch = bridgeScripts.map((s) => `$_.CommandLine -like '*${s}*'`).join(' -or ')
      execSync(
        `powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*${escaped}*') -and (${bridgeMatch}) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
        { stdio: 'ignore', windowsHide: true },
      )
      return
    }

    for (const script of bridgeScripts) {
      execSync(`pkill -f "${normalized}.*${script}"`, { stdio: 'ignore' })
    }
  } catch {
    /* no matching processes */
  }
}
