/**
 * CLI detection facade — delegates to AcpDetector singleton.
 */

import { acpDetector, type DetectedCliAgent } from './acp/AcpDetector'
import { getEnhancedEnv, invalidateEnhancedEnvCache } from './shellEnv'
import { POTENTIAL_ACP_CLIS } from './shared/acpRegistry'
import { resolveBundledScript } from './shared/appPaths'
import { execSync } from 'child_process'

export type { DetectedCliAgent }

export function refreshPathEnv(): NodeJS.ProcessEnv {
  invalidateEnhancedEnvCache()
  return getEnhancedEnv()
}

export function invalidateDetectionEnvCache(): void {
  invalidateEnhancedEnvCache()
}

function isCliOnPath(cliName: string): boolean {
  const env = getEnhancedEnv()
  const isWindows = process.platform === 'win32'
  const whichCommand = isWindows ? 'where.exe' : 'which'
  try {
    execSync(`${whichCommand} ${cliName}`, { encoding: 'utf-8', stdio: 'pipe', timeout: 1000, env })
    return true
  } catch {
    if (!isWindows) return false
    try {
      execSync(
        `powershell -NoProfile -NonInteractive -Command "Get-Command -All ${cliName} | Select-Object -First 1 | Out-Null"`,
        { encoding: 'utf-8', stdio: 'pipe', timeout: 1000, env },
      )
      return true
    } catch {
      return false
    }
  }
}

export function isCliCommandAvailable(cliName: string): boolean {
  return isCliOnPath(cliName)
}

export function isBackendCliAvailable(backendId: string): boolean {
  return acpDetector.getDetectedAgents().some((a) => a.backend === backendId) || isCliOnPath(backendId)
}

export function runInstallCommand(installCommand: string): { success: boolean; error?: string } {
  refreshPathEnv()
  try {
    execSync(installCommand, {
      stdio: 'pipe',
      timeout: 600_000,
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh',
    })
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

export function runUninstallPackage(npmPackage: string): { success: boolean; error?: string } {
  refreshPathEnv()
  try {
    execSync(`npm uninstall -g ${npmPackage}`, {
      stdio: 'pipe',
      timeout: 300_000,
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh',
    })
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

export async function detectInstalledCliAgents(
  getLogoInfo?: (backendId: string, name: string) => unknown,
  force = false,
): Promise<DetectedCliAgent[]> {
  await acpDetector.initialize(force)
  const detected = acpDetector.getDetectedAgents()
  if (getLogoInfo) {
    for (const agent of detected) {
      getLogoInfo(agent.backend, agent.name)
    }
  }
  return detected
}

/** Synchronous access after initialize() — used by IPC after startup warmup. */
export function getCachedDetectedCliAgents(): DetectedCliAgent[] {
  return acpDetector.getDetectedAgents()
}

export function resolveOllamaBridgePath(): string | null {
  return resolveBundledScript('ollama-acp-bridge.mjs')
}

// Re-export registry for install panel
export { POTENTIAL_ACP_CLIS }
