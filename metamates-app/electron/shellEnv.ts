/**
 * Shell environment for Electron main process.
 * Detection and ACP spawn share the same enhanced PATH (aligned with AionUi).
 */

import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import * as os from 'os'
import * as path from 'path'

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

let cachedEnhancedEnv: Record<string, string> | null = null

export function invalidateEnhancedEnvCache(): void {
  cachedEnhancedEnv = null
}

export function getEnhancedEnv(customEnv?: Record<string, string>): Record<string, string> {
  if (!customEnv && cachedEnhancedEnv) {
    return { ...cachedEnhancedEnv }
  }

  let mergedPath = process.env.PATH || ''

  if (process.platform === 'win32') {
    try {
      const userPath = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', "[System.Environment]::GetEnvironmentVariable('PATH', 'User')"],
        { encoding: 'utf-8', timeout: 5000 },
      ).trim()
      const machinePath = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', "[System.Environment]::GetEnvironmentVariable('PATH', 'Machine')"],
        { encoding: 'utf-8', timeout: 5000 },
      ).trim()
      mergedPath = mergePaths(mergedPath, mergePaths(userPath, machinePath))
    } catch {
      // best-effort
    }
    mergedPath = mergePaths(mergedPath, getWindowsExtraToolPaths().join(';'))
  } else {
    try {
      const shell = process.env.SHELL || '/bin/bash'
      if (path.isAbsolute(shell)) {
        const output = execFileSync(shell, ['-l', '-c', 'echo $PATH'], {
          encoding: 'utf-8',
          timeout: 5000,
          env: { ...process.env, HOME: os.homedir() },
        }).trim()
        mergedPath = mergePaths(mergedPath, output)
      }
    } catch {
      // best-effort
    }
    const home = os.homedir()
    mergedPath = mergePaths(
      mergedPath,
      [
        path.join(home, '.local', 'bin'),
        path.join(home, '.npm-global', 'bin'),
        path.join(home, '.volta', 'bin'),
      ].join(':'),
    )
  }

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
