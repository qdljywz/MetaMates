/**
 * Unified ACP child-process spawn config (aligned with AionUi acpConnectors).
 */

import type { SpawnOptions } from 'child_process'
import * as os from 'os'
import * as path from 'path'
import { prepareCleanEnv, resolveNpxPath, resolveNpxSpawnCwd } from '../shellEnv'

/**
 * Prefer workspace cwd so CLIs (Claude/Codex via npx) inherit the vault path.
 * Only fall back to npx/node install dir when no workspace is open.
 */
function resolveSpawnCwd(workingDir: string, useNpx: boolean, npxPath?: string): string {
  const workspaceCwd = workingDir?.trim() ? path.resolve(workingDir.trim()) : ''
  if (workspaceCwd) return workspaceCwd

  if (useNpx) {
    const resolvedNpx = npxPath || resolveNpxPath(prepareCleanEnv())
    return resolveNpxSpawnCwd(resolvedNpx)
  }
  return os.homedir()
}

export function createGenericSpawnConfig(
  cliPath: string,
  workingDir: string,
  acpArgs?: string[],
  customEnv?: Record<string, string>,
): { command: string; args: string[]; options: SpawnOptions } {
  const isWindows = process.platform === 'win32'
  const env = prepareCleanEnv(customEnv)
  const effectiveAcpArgs = acpArgs === undefined ? ['--experimental-acp'] : acpArgs

  let spawnCommand: string
  let spawnArgs: string[]

  if (cliPath.startsWith('npx ') || cliPath.startsWith('npx.cmd ')) {
    const parts = cliPath.split(/\s+/).filter(Boolean)
    spawnCommand = resolveNpxPath(env)
    spawnArgs = ['--yes', ...parts.slice(1), ...effectiveAcpArgs]
  } else if (cliPath === 'npx' || cliPath === 'npx.cmd') {
    spawnCommand = resolveNpxPath(env)
    spawnArgs = effectiveAcpArgs
  } else if (isWindows) {
    spawnCommand = `chcp 65001 >nul && "${cliPath}"`
    spawnArgs = effectiveAcpArgs
  } else {
    const parts = cliPath.split(/\s+/).filter(Boolean)
    spawnCommand = parts[0]
    spawnArgs = [...parts.slice(1), ...effectiveAcpArgs]
  }

  const usesNpx =
    cliPath.startsWith('npx ') ||
    cliPath.startsWith('npx.cmd ') ||
    cliPath === 'npx' ||
    cliPath === 'npx.cmd'
  const resolvedNpx = usesNpx ? resolveNpxPath(env) : undefined

  return {
    command: spawnCommand,
    args: spawnArgs,
    options: {
      cwd: resolveSpawnCwd(workingDir, usesNpx, resolvedNpx),
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      shell: isWindows,
    },
  }
}

/** Build spawn config from resolved cliPath (may be npx.cmd) + acpArgs array. */
export function createSpawnConfigFromResolved(
  cliPath: string,
  acpArgs: string[],
  workingDir: string,
  spawnEnv?: Record<string, string>,
): { command: string; args: string[]; options: SpawnOptions } {
  const isWindows = process.platform === 'win32'
  const env = prepareCleanEnv(spawnEnv)
  const npxPath = resolveNpxPath(env)
  const isNpxShim = cliPath === 'npx' || cliPath === 'npx.cmd' || cliPath.endsWith('npx.cmd') || cliPath.endsWith('/npx')

  if (isNpxShim) {
    return {
      command: isWindows ? `chcp 65001 >nul && "${npxPath}"` : npxPath,
      args: acpArgs,
      options: {
        cwd: resolveSpawnCwd(workingDir, true, npxPath),
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        shell: isWindows,
      },
    }
  }

  return createGenericSpawnConfig(cliPath, workingDir, acpArgs, spawnEnv)
}
