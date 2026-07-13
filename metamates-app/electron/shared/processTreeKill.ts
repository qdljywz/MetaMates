/**
 * Cross-platform process-tree termination.
 * ACP CLIs spawn MCP bridge grandchildren; plain child.kill() leaves orphans on Windows.
 */

import { execSync, spawnSync } from 'child_process'
import * as path from 'path'

export type MetaMatesProcessInfo = {
  pid: number
  parentPid: number
  name: string
  commandLine: string
}

/** PIDs spawned by MetaMates main (ACP, speech, auth terminals) — always killed on quit. */
const managedPids = new Set<number>()

/**
 * Register a child PID for guaranteed cleanup on app exit.
 * @param pid - OS process id
 */
export function trackManagedProcess(pid: number | undefined | null): void {
  if (pid == null || !Number.isInteger(pid) || pid <= 0) return
  managedPids.add(pid)
}

/** @param pid - OS process id to drop from the managed set */
export function untrackManagedProcess(pid: number | undefined | null): void {
  if (pid == null) return
  managedPids.delete(pid)
}

/** Force-kill every tracked managed child (ACP, speech, auth shells). */
export function killAllTrackedManagedProcesses(): number {
  let killed = 0
  for (const pid of [...managedPids]) {
    killProcessTree(pid, { force: true })
    managedPids.delete(pid)
    killed += 1
  }
  return killed
}

/**
 * List every process with a command line (platform-specific).
 * @internal Used for descendant walks — not filtered to MetaMates-only.
 */
export function listAllProcesses(): MetaMatesProcessInfo[] {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress"`,
        { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
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
    }

    const out = execSync('ps -ax -o pid=,ppid=,command=', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
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
  } catch {
    return []
  }
}

/**
 * Collect all descendant PIDs under `rootPid` (BFS over the process tree).
 */
export function collectDescendantPids(
  rootPid: number,
  processes: MetaMatesProcessInfo[] = listAllProcesses(),
): number[] {
  const childrenByParent = new Map<number, number[]>()
  for (const proc of processes) {
    const siblings = childrenByParent.get(proc.parentPid) ?? []
    siblings.push(proc.pid)
    childrenByParent.set(proc.parentPid, siblings)
  }

  const descendants: number[] = []
  const queue = [...(childrenByParent.get(rootPid) ?? [])]
  while (queue.length > 0) {
    const pid = queue.shift()!
    descendants.push(pid)
    queue.push(...(childrenByParent.get(pid) ?? []))
  }
  return descendants
}

/**
 * Force-kill every descendant of `rootPid` (deepest children first).
 * Catches Agent CLI / cmd / conhost orphans that path-based filters miss.
 */
export function killAllDescendantProcesses(
  rootPid: number,
  options?: { excludePids?: ReadonlySet<number>; force?: boolean },
): number {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return 0

  const descendants = collectDescendantPids(rootPid)
  const exclude = options?.excludePids ?? new Set<number>()
  const force = options?.force ?? true
  let killed = 0

  for (const pid of descendants.reverse()) {
    if (exclude.has(pid)) continue
    killProcessTree(pid, { force })
    killed += 1
  }
  return killed
}

/**
 * Full session child teardown on app quit — tracked PIDs, process-tree sweep, MCP bridges.
 * @param appRoot - Resources / install root for path-based orphan detection
 * @param rootPid - Main Electron process pid
 */
export function killAllSessionChildProcesses(appRoot: string, rootPid: number): {
  tracked: number
  descendants: number
  orphans: number
} {
  const tracked = killAllTrackedManagedProcesses()
  const descendants = killAllDescendantProcesses(rootPid, { force: true })
  const orphans = killOrphanMetaMatesHelpers(appRoot) + killOrphanAcpAgentProcesses()
  return { tracked, descendants, orphans }
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

/** Packaged exe dir (…/win-unpacked) for the current process, if applicable. */
function getCurrentWinUnpackedDir(): string | null {
  try {
    const dir = normalizePath(path.dirname(process.execPath || '')).toLowerCase()
    return dir.includes('/win-unpacked') ? dir : null
  } catch {
    return null
  }
}

function getProcessWinUnpackedDir(commandLine: string): string | null {
  const match = normalizePath(commandLine).toLowerCase().match(/(.*\/win-unpacked)\/metamates\.exe/)
  return match?.[1] ?? null
}

/** Do not kill MetaMates.exe from a different portable build folder. */
function isSamePortableBuild(proc: MetaMatesProcessInfo): boolean {
  const mine = getCurrentWinUnpackedDir()
  if (!mine) return true
  if (!/^metamates\.exe$/i.test(proc.name || '')) return true
  const theirs = getProcessWinUnpackedDir(proc.commandLine)
  if (!theirs) return false
  return theirs === mine
}

/** True when this process clearly belongs to MetaMates (not Cursor / other Electron apps). */
export function isMetaMatesProcess(name: string, commandLine: string, appRoot: string): boolean {
  const exe = (name || '').toLowerCase()
  const cmd = normalizePath(commandLine || '')
  const root = normalizePath(appRoot)
  const rootWin = appRoot.replace(/\//g, '\\')

  const installDir = normalizePath(path.join(appRoot, '..'))
  const installDirWin = installDir.replace(/\//g, '\\')

  if (/^metamates\.exe$/i.test(name || '')) {
    return (
      cmd.includes(root) ||
      commandLine.includes(rootWin) ||
      cmd.includes(installDir) ||
      commandLine.includes(installDirWin)
    )
  }

  const underAppRoot = cmd.includes(root) || commandLine.includes(rootWin)

  if (!underAppRoot) {
    if (/vault-mcp-bridge\.mjs/i.test(cmd) || /ollama-acp-bridge\.mjs/i.test(cmd)) {
      return (
        cmd.includes('metamates-app') ||
        /win-unpacked[/\\]MetaMates/i.test(cmd) ||
        /MetaMates[/\\]resources/i.test(cmd) ||
        cmd.includes(root)
      )
    }
    if (/win-unpacked[/\\]MetaMates/i.test(cmd)) return true
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
  descendantPids?: ReadonlySet<number>,
): boolean {
  if (proc.pid === currentPid) return true
  // Packaged Electron spawns GPU/renderer/utility MetaMates.exe children — never treat as stale.
  if (descendantPids?.has(proc.pid)) return true
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
  return listAllProcesses().filter((row) => isMetaMatesProcess(row.name, row.commandLine, appRoot))
}

/**
 * On startup, remove MetaMates processes left from a previous crash or unclean exit.
 * Keeps the current Electron process, its npm/concurrently parent, and sibling Vite.
 */
export function killStaleMetaMatesProcesses(appRoot: string, currentPid: number): number {
  const allProcesses = listAllProcesses()
  const parentPid = getParentProcessId(currentPid)
  const ancestorPids = collectAncestorPids(currentPid)
  const descendantPids = new Set(collectDescendantPids(currentPid, allProcesses))
  let killed = 0
  for (const proc of allProcesses.filter((row) => isMetaMatesProcess(row.name, row.commandLine, appRoot))) {
    if (!isSamePortableBuild(proc)) continue
    if (shouldKeepStaleProcess(proc, currentPid, parentPid, ancestorPids, descendantPids)) continue
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
 * Kill orphaned ACP agent CLIs (npx cache paths — not under appRoot).
 * MetaMates spawns these during warmup; they may outlive Electron if shutdown is interrupted.
 */
export function killOrphanAcpAgentProcesses(): number {
  let killed = 0
  const seen = new Set<number>()

  for (const proc of listAllProcesses()) {
    const cmd = normalizePath(proc.commandLine || '')
    if (!cmd) continue

    const isClaudeAcp = /claude-agent-acp/i.test(cmd)
    const isCodebuddyAcp = /codebuddy/i.test(cmd) && /--acp/i.test(cmd)
    if (!isClaudeAcp && !isCodebuddyAcp) continue
    if (seen.has(proc.pid)) continue

    killProcessTree(proc.pid, { force: true })
    seen.add(proc.pid)
    killed += 1
  }

  return killed
}

/**
 * Kill orphaned MetaMates helper processes (MCP bridges) by app root path.
 * @returns Number of processes targeted
 */
export function killOrphanMetaMatesHelpers(appRoot: string): number {
  const normalized = appRoot.replace(/\\/g, '/')
  if (!normalized) return 0

  const bridgeScripts = ['vault-mcp-bridge.mjs', 'ollama-acp-bridge.mjs']
  let killed = 0

  try {
    if (process.platform === 'win32') {
      const escaped = normalized.replace(/'/g, "''")
      const bridgeMatch = bridgeScripts.map((s) => `$_.CommandLine -like '*${s}*'`).join(' -or ')
      const out = execSync(
        `powershell -NoProfile -NonInteractive -Command "$targets = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and (($_.CommandLine -like '*${escaped}*') -or ($_.CommandLine -like '*win-unpacked*MetaMates*') -or ($_.CommandLine -like '*MetaMates*resources*')) -and (${bridgeMatch}); $targets | ForEach-Object { $_.ProcessId }"`,
        { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      ).trim()
      const pids = out.split(/\r?\n/).map((line) => Number(line.trim())).filter((pid) => pid > 0)
      for (const pid of pids) {
        killProcessTree(pid, { force: true })
        killed += 1
      }
      return killed
    }

    for (const script of bridgeScripts) {
      try {
        execSync(`pkill -f "${normalized}.*${script}"`, { stdio: 'ignore' })
        killed += 1
      } catch {
        /* no match */
      }
    }
  } catch {
    /* no matching processes */
  }
  return killed
}
