/**
 * Global ACP detector — startup detection, shared by IPC and spawn.
 * Aligned with AionUi AcpDetector + extended npm/npx fallback strategies.
 */

import { exec, execFile } from 'child_process'
import { existsSync } from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import {
  POTENTIAL_ACP_CLIS,
  getDetectionCommands,
  getDetectNpmPackages,
  resolveSpawnConfig,
  type AcpCliDefinition,
} from '../shared/acpRegistry'
import { getEnhancedEnv, invalidateEnhancedEnvCache } from '../shellEnv'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

export interface DetectedCliAgent {
  backend: string
  name: string
  cliPath: string
  acpArgs: string[]
  detectMethod?: 'path' | 'npm-global' | 'npx-package'
}

class AcpDetector {
  private detectedAgents: DetectedCliAgent[] = []
  private isDetected = false
  private detectPromise: Promise<void> | null = null
  private npmInstalledCache = new Map<string, boolean>()

  async initialize(force = false): Promise<void> {
    if (this.isDetected && !force) return
    if (this.detectPromise && !force) return this.detectPromise

    this.detectPromise = this.runDetection(force)
    await this.detectPromise
    this.detectPromise = null
  }

  private async runDetection(force: boolean): Promise<void> {
    if (force) {
      invalidateEnhancedEnvCache()
      this.isDetected = false
      this.npmInstalledCache.clear()
    }

    console.log('[ACP] Starting agent detection...')
    const startTime = Date.now()
    const env = getEnhancedEnv()

    const results = await Promise.all(
      POTENTIAL_ACP_CLIS.filter((c) => c.detectByDefault).map((def) => this.detectOne(def, env)),
    )

    this.detectedAgents = results.filter((r): r is DetectedCliAgent => r !== null)
    this.isDetected = true

    console.log(
      `[ACP] Detection completed in ${Date.now() - startTime}ms, found ${this.detectedAgents.length} agents: ${this.detectedAgents.map((a) => a.backend).join(', ') || 'none'}`,
    )
  }

  private async detectOne(def: AcpCliDefinition, env: NodeJS.ProcessEnv): Promise<DetectedCliAgent | null> {
    let method = await this.getDetectMethod(def, env)
    if (!method) return null

    // Prefer PATH binary over npm-global when both exist (keeps login state, avoids npx).
    if (method === 'npm-global') {
      const pathChecks = await Promise.all(
        getDetectionCommands(def).map((cmd) => this.isCliOnPath(cmd, env)),
      )
      if (pathChecks.some(Boolean)) {
        method = 'path'
      }
    }

    const { cliPath, acpArgs } = resolveSpawnConfig(def, method)
    console.log(`[DETECT] Found: ${def.name} (${method}) → ${cliPath}`)

    return {
      backend: def.backendId,
      name: def.name,
      cliPath,
      acpArgs,
      detectMethod: method,
    }
  }

  private async getDetectMethod(
    def: AcpCliDefinition,
    env: NodeJS.ProcessEnv,
  ): Promise<DetectedCliAgent['detectMethod'] | null> {
    const pathChecks = await Promise.all(getDetectionCommands(def).map((cmd) => this.isCliOnPath(cmd, env)))
    if (pathChecks.some(Boolean)) return 'path'

    if (getDetectionCommands(def).some((cmd) => this.isBinaryInNpmGlobalBin(cmd, env))) {
      return 'npm-global'
    }

    const packages = getDetectNpmPackages(def)
    if (packages.length > 0) {
      const npmChecks = await Promise.all(packages.map((pkg) => this.isNpmPackageInstalledGlobally(pkg, env)))
      if (npmChecks.some(Boolean)) return 'npm-global'
    }

    console.log(`[DETECT] Not found: ${def.name}`)
    return null
  }

  private async isCliOnPath(cliCommand: string, env: NodeJS.ProcessEnv): Promise<boolean> {
    const isWindows = process.platform === 'win32'
    const whichCommand = isWindows ? 'where.exe' : 'which'

    try {
      await execAsync(`${whichCommand} ${cliCommand}`, {
        encoding: 'utf-8',
        timeout: 1500,
        env,
        windowsHide: true,
      })
      return true
    } catch {
      if (!isWindows) return false
    }

    try {
      await execAsync(
        `powershell -NoProfile -NonInteractive -Command "Get-Command -All ${cliCommand} | Select-Object -First 1 | Out-Null"`,
        { encoding: 'utf-8', timeout: 1500, env, windowsHide: true },
      )
      return true
    } catch {
      return false
    }
  }

  private getNpmGlobalBinDirs(env: NodeJS.ProcessEnv): string[] {
    const dirs: string[] = []
    const pathSep = process.platform === 'win32' ? ';' : ':'
    for (const segment of (env.PATH || '').split(pathSep)) {
      if (
        segment &&
        existsSync(segment) &&
        (segment.toLowerCase().includes('npm') || segment.toLowerCase().includes('node_modules'))
      ) {
        dirs.push(segment)
      }
    }
    return [...new Set(dirs)]
  }

  private isBinaryInNpmGlobalBin(cmd: string, env: NodeJS.ProcessEnv): boolean {
    const extensions = process.platform === 'win32' ? ['', '.cmd', '.ps1', '.exe'] : ['']
    for (const dir of this.getNpmGlobalBinDirs(env)) {
      for (const ext of extensions) {
        if (existsSync(path.join(dir, cmd + ext))) return true
      }
    }
    return false
  }

  private async isNpmPackageInstalledGlobally(pkg: string, env: NodeJS.ProcessEnv): Promise<boolean> {
    if (this.npmInstalledCache.has(pkg)) {
      return this.npmInstalledCache.get(pkg)!
    }

    try {
      await execAsync(`npm list -g ${pkg} --depth=0`, {
        encoding: 'utf-8',
        timeout: 4000,
        env,
        windowsHide: true,
      })
      this.npmInstalledCache.set(pkg, true)
      return true
    } catch {
      this.npmInstalledCache.set(pkg, false)
      return false
    }
  }

  getDetectedAgents(): DetectedCliAgent[] {
    return this.detectedAgents
  }

  hasAgents(): boolean {
    return this.detectedAgents.length > 0
  }

  async refresh(): Promise<DetectedCliAgent[]> {
    await this.initialize(true)
    return this.detectedAgents
  }
}

export const acpDetector = new AcpDetector()
