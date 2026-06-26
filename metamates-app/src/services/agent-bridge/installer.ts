import type { AcpBackend, AcpBackendConfig } from './acpTypes'
import { ACP_BACKENDS } from './acpTypes'

export interface CliInstallStatus {
  backend: AcpBackend
  name: string
  installed: boolean
  installing: boolean
  installProgress?: string
  error?: string
}

export interface InstallProgress {
  stage: 'checking' | 'installing' | 'completed' | 'error'
  message: string
  percentage?: number
}

class CliInstaller {
  private installStatus: Map<AcpBackend, CliInstallStatus> = new Map()
  private progressCallbacks: Set<(backend: AcpBackend, progress: InstallProgress) => void> = new Set()

  async checkInstallation(backend: AcpBackend): Promise<boolean> {
    const config = ACP_BACKENDS[backend]
    if (!config || config.isBuiltIn) {
      return true
    }

    if (!config.cliCommand) {
      return false
    }

    try {
      const result = await window.electronAPI?.checkCliAvailable(config.cliCommand)
      return result?.available ?? false
    } catch {
      return false
    }
  }

  async checkAllInstallations(): Promise<Map<AcpBackend, CliInstallStatus>> {
    const detectedBackends = new Set<string>()
    try {
      const agents =
        (await window.electronAPI?.acp?.getAllInstalledAgents?.()) ||
        (await window.electronAPI?.acp?.detectAgents?.())
      agents?.forEach((a) => detectedBackends.add(a.backend))
    } catch {
      // fall back to per-cli checks
    }

    const results = new Map<AcpBackend, CliInstallStatus>()

    for (const [backend, config] of Object.entries(ACP_BACKENDS)) {
      let installed = detectedBackends.has(backend)
      if (!installed) {
        installed = await this.checkInstallation(backend as AcpBackend)
      }
      results.set(backend as AcpBackend, {
        backend: backend as AcpBackend,
        name: config.name,
        installed,
        installing: false,
      })
    }

    this.installStatus = results
    return results
  }

  async installCli(backend: AcpBackend): Promise<{ success: boolean; error?: string }> {
    const config = ACP_BACKENDS[backend]
    if (!config) {
      return { success: false, error: `Unknown backend: ${backend}` }
    }

    if (config.isBuiltIn) {
      return { success: true }
    }

    const commands = this.getInstallCommands(backend)
    if (commands.length === 0) {
      return { success: false, error: 'No install command available for this CLI' }
    }

    this.updateStatus(backend, { installing: true, installProgress: 'Starting installation...' })
    this.notifyProgress(backend, { stage: 'installing', message: 'Starting installation...' })

    try {
      for (const installCommand of commands) {
        this.notifyProgress(backend, { stage: 'installing', message: `Running: ${installCommand}` })
        const result = await window.electronAPI?.installCli(installCommand)
        if (!result?.success) {
          this.updateStatus(backend, { installing: false, error: result?.error })
          this.notifyProgress(backend, { stage: 'error', message: result?.error || 'Installation failed' })
          return { success: false, error: result?.error }
        }
      }

      this.updateStatus(backend, { installed: true, installing: false, installProgress: 'Installation completed' })
      this.notifyProgress(backend, { stage: 'completed', message: 'Installation completed successfully' })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.updateStatus(backend, { installing: false, error: errorMessage })
      this.notifyProgress(backend, { stage: 'error', message: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  async uninstallCli(backend: AcpBackend): Promise<{ success: boolean; error?: string }> {
    const config = ACP_BACKENDS[backend]
    if (!config || config.isBuiltIn) {
      return { success: false, error: 'Cannot uninstall built-in agent' }
    }

    if (!config.npmPackage) {
      return { success: false, error: 'No npm package to uninstall' }
    }

    try {
      const result = await window.electronAPI?.uninstallCli(config.npmPackage)

      if (result?.success) {
        this.updateStatus(backend, { installed: false, installing: false })
        return { success: true }
      }
      return { success: false, error: result?.error }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  getInstallStatus(backend: AcpBackend): CliInstallStatus | undefined {
    return this.installStatus.get(backend)
  }

  getAllInstallStatus(): Map<AcpBackend, CliInstallStatus> {
    return this.installStatus
  }

  onInstallProgress(callback: (backend: AcpBackend, progress: InstallProgress) => void): () => void {
    this.progressCallbacks.add(callback)
    return () => {
      this.progressCallbacks.delete(callback)
    }
  }

  private updateStatus(backend: AcpBackend, updates: Partial<CliInstallStatus>): void {
    const current = this.installStatus.get(backend) || {
      backend,
      name: ACP_BACKENDS[backend]?.name || backend,
      installed: false,
      installing: false,
    }
    this.installStatus.set(backend, { ...current, ...updates })
  }

  private notifyProgress(backend: AcpBackend, progress: InstallProgress): void {
    this.progressCallbacks.forEach((cb) => cb(backend, progress))
  }

  getInstallCommands(backend: AcpBackend): string[] {
    const config = ACP_BACKENDS[backend]
    if (!config) return []
    if (config.installCommands?.length) return [...config.installCommands]
    if (config.npmPackage) return [`npm install -g ${config.npmPackage}`]
    return []
  }

  getInstallCommand(backend: AcpBackend): string | undefined {
    return this.getInstallCommands(backend)[0]
  }

  canInstall(backend: AcpBackend): boolean {
    const config = ACP_BACKENDS[backend]
    if (!config || config.isBuiltIn) return false
    return this.getInstallCommands(backend).length > 0
  }

  getDefaultAgents(): AcpBackend[] {
    return Object.entries(ACP_BACKENDS)
      .filter(([_, config]) => config.isDefault)
      .map(([backend]) => backend as AcpBackend)
  }

  getBuiltInAgents(): AcpBackend[] {
    return Object.entries(ACP_BACKENDS)
      .filter(([_, config]) => config.isBuiltIn)
      .map(([backend]) => backend as AcpBackend)
  }
}

export const cliInstaller = new CliInstaller()
