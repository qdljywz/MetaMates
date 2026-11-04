/**
 * Shell environment for Electron main process.
 * Detection and ACP spawn share the same enhanced PATH (aligned with AionUi).
 *
 * Important: never call PowerShell / login-shell PATH probes synchronously on the
 * Electron main process. That freezes the whole UI (假死) for multiple seconds —
 * especially when Alt-Tab focus re-triggers forced CLI detection.
 */

import { execFile, execFileSync } from 'child_process'
import { existsSync } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export function mergePaths(path1?: string, path2?: string): string {
  const separator = process.platform === 'win32' ? ';' : ':'
  const paths1 = path1?.split(separator).filter(Boolean) || []
  const paths2 = path2?.split(separator).filter(Boolean) || []
  const seen = new Set<string>()
  const merged: string[] = []
  for (const p of [...paths1, ...paths2]) {
    const key = process.platform === 'win32' ? p.toLowerCase() : p
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(p)
    }
  }
  return merged.join(separator)
}

function getWindowsExtraToolPaths(): string[] {
  if (process.platform !== 'win32') return []

  const homeDir = os.homedir()
  const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming')
  const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local')
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

  return [
    path.join(appData, 'npm'),
    path.join(programFiles, 'nodejs'),
    process.env.NVM_HOME || path.join(appData, 'nvm'),
    process.env.NVM_SYMLINK || path.join(programFiles, 'nodejs'),
    ...(process.env.FNM_MULTISHELL_PATH ? [process.env.FNM_MULTISHELL_PATH] : []),
    path.join(localAppData, 'fnm_multishells'),
    path.join(homeDir, '.volta', 'bin'),
    process.env.SCOOP ? path.join(process.env.SCOOP, 'shims') : path.join(homeDir, 'scoop', 'shims'),
    path.join(localAppData, 'pnpm'),
    path.join(process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey', 'bin'),
    path.join(programFiles, 'Git', 'cmd'),
    path.join(programFiles, 'Git', 'bin'),
    path.join(programFiles, 'Git', 'usr', 'bin'),
    path.join(programFilesX86, 'Git', 'cmd'),
    path.join(programFilesX86, 'Git', 'bin'),
    path.join(programFilesX86, 'Git', 'usr', 'bin'),
    'C:\\cygwin64\\bin',
    'C:\\cygwin\\bin',
  ].filter((p) => existsSync(p))
}

function getUnixExtraToolPaths(): string[] {
  const home = os.homedir()
  return [
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
  ]
}

let cachedEnhancedEnv: Record<string, string> | null = null
let shellPathEnrichPromise: Promise<void> | null = null

export function invalidateEnhancedEnvCache(): void {
  cachedEnhancedEnv = null
}

/** Fast PATH: process.env + known tool dirs. Never spawns a shell. */
function buildFastPath(basePath: string): string {
  if (process.platform === 'win32') {
    return mergePaths(basePath, getWindowsExtraToolPaths().join(';'))
  }
  return mergePaths(basePath, getUnixExtraToolPaths().join(':'))
}

async function readShellPathSegments(): Promise<string> {
  if (process.platform === 'win32') {
    const [userResult, machineResult] = await Promise.all([
      execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "[System.Environment]::GetEnvironmentVariable('PATH', 'User')",
        ],
        { encoding: 'utf-8', timeout: 5000, windowsHide: true },
      ).catch(() => ({ stdout: '' })),
      execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "[System.Environment]::GetEnvironmentVariable('PATH', 'Machine')",
        ],
        { encoding: 'utf-8', timeout: 5000, windowsHide: true },
      ).catch(() => ({ stdout: '' })),
    ])
    return mergePaths(String(userResult.stdout || '').trim(), String(machineResult.stdout || '').trim())
  }

  const shell = process.env.SHELL || '/bin/bash'
  if (!path.isAbsolute(shell)) return ''
  try {
    const { stdout } = await execFileAsync(shell, ['-l', '-c', 'echo $PATH'], {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env, HOME: os.homedir() },
    })
    return String(stdout || '').trim()
  } catch {
    return ''
  }
}

/**
 * Async: merge User/Machine (or login-shell) PATH into the cache.
 * Call before forced CLI re-detection after install; never block the UI thread sync.
 */
export async function refreshEnhancedEnvFromShell(): Promise<Record<string, string>> {
  if (shellPathEnrichPromise) {
    await shellPathEnrichPromise
    return getEnhancedEnv()
  }

  shellPathEnrichPromise = (async () => {
    const shellPath = await readShellPathSegments()
    const mergedPath = buildFastPath(mergePaths(process.env.PATH || '', shellPath))
    const env = {
      ...process.env,
      PATH: mergedPath,
    } as Record<string, string>
    cachedEnhancedEnv = env
    process.env.PATH = env.PATH
  })()

  try {
    await shellPathEnrichPromise
  } finally {
    shellPathEnrichPromise = null
  }
  return getEnhancedEnv()
}

/**
 * Sync env for spawn/detect. Uses cache or a fast PATH rebuild — never PowerShell sync.
 */
export function getEnhancedEnv(customEnv?: Record<string, string>): Record<string, string> {
  if (!customEnv && cachedEnhancedEnv) {
    return { ...cachedEnhancedEnv }
  }

  const mergedPath = buildFastPath(process.env.PATH || '')
  const env = {
    ...process.env,
    ...customEnv,
    PATH: customEnv?.PATH ? mergePaths(mergedPath, customEnv.PATH) : mergedPath,
  } as Record<string, string>

  if (!customEnv) {
    cachedEnhancedEnv = env
    process.env.PATH = env.PATH
  }

  return env
}

/**
 * Resolve npx to an absolute path. On Windows, `where node` may list IDE-bundled
 * node (e.g. Cursor) before the real Node.js install — skip entries without npx.
 */
export function resolveNpxPath(env: Record<string, string | undefined>): string {
  const isWindows = process.platform === 'win32'
  const npxName = isWindows ? 'npx.cmd' : 'npx'
  try {
    const whichCmd = isWindows ? 'where' : 'which'
    const nodePaths = execFileSync(whichCmd, ['node'], {
      env: env as NodeJS.ProcessEnv,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: isWindows,
      windowsHide: true,
    })
      .trim()
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean)

    for (const nodePath of nodePaths) {
      const nodeDir = path.dirname(nodePath.trim())
      const npxCandidate = path.join(nodeDir, npxName)
      if (!existsSync(npxCandidate)) continue
      const bundledNpxCli = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npx-cli.js')
      if (!existsSync(bundledNpxCli)) continue
      return npxCandidate
    }
  } catch {
    // fallback
  }
  return npxName
}

/** Directory containing npx — safe spawn cwd so npm-prefix resolves bundled npm. */
export function resolveNpxSpawnCwd(npxPath: string): string {
  const isWindows = process.platform === 'win32'
  const npxName = isWindows ? 'npx.cmd' : 'npx'
  if (path.isAbsolute(npxPath) && existsSync(npxPath)) {
    return path.dirname(npxPath)
  }
  for (const dir of getWindowsExtraToolPaths()) {
    const candidate = path.join(dir, npxName)
    if (existsSync(candidate)) return dir
  }
  return os.homedir()
}

export function prepareCleanEnv(customEnv?: Record<string, string>): Record<string, string> {
  const cleanEnv = getEnhancedEnv(customEnv)
  delete cleanEnv.NODE_OPTIONS
  delete cleanEnv.NODE_INSPECT
  delete cleanEnv.CLAUDECODE
  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith('npm_')) delete cleanEnv[key]
  }
  return cleanEnv
}
