import type { AcpBackend, AcpDetectedAgent } from './acpTypes'
import { ACP_BACKENDS } from './acpTypes'

class AgentDetector {
  private detectedAgents: AcpDetectedAgent[] = []
  private detectionPromise: Promise<AcpDetectedAgent[]> | null = null

  async detectAgents(): Promise<AcpDetectedAgent[]> {
    if (this.detectionPromise) {
      return this.detectionPromise
    }
    this.detectionPromise = this.doDetection()
    return this.detectionPromise
  }

  private async doDetection(): Promise<AcpDetectedAgent[]> {
    if (window.electronAPI?.acp?.detectAgents) {
      try {
        const agents = await window.electronAPI.acp.detectAgents()
        if (agents?.length) {
          this.detectedAgents = agents.map((a) => ({
            backend: a.backend as AcpBackend,
            name: a.name,
            cliPath: a.cliPath,
            acpArgs: a.acpArgs,
            available: true,
          }))
          return this.detectedAgents
        }
      } catch {
        // fall through to local checks
      }
    }

    const detected: AcpDetectedAgent[] = []
    const potentialClis = this.getPotentialAcpClis()
    for (const cli of potentialClis) {
      const isAvailable = await this.checkCliAvailable(cli.cmd)
      detected.push({
        backend: cli.backendId,
        name: cli.name,
        cliPath: cli.cmd,
        acpArgs: cli.args,
        available: isAvailable,
      })
    }
    this.detectedAgents = detected
    return detected
  }

  private getPotentialAcpClis() {
    return Object.entries(ACP_BACKENDS)
      .filter(([id, config]) => config.cliCommand && config.enabled && id !== 'custom')
      .map(([id, config]) => ({
        cmd: config.cliCommand!,
        args: config.acpArgs || ['--experimental-acp'],
        name: config.name,
        backendId: id as AcpBackend,
      }))
  }

  private async checkCliAvailable(command: string): Promise<boolean> {
    try {
      if (window.electronAPI?.checkCliAvailable) {
        const result = await window.electronAPI.checkCliAvailable(command)
        return result.available
      }
      return false
    } catch {
      return false
    }
  }

  getDetectedAgents(): AcpDetectedAgent[] {
    return this.detectedAgents
  }

  getAgentByBackend(backend: AcpBackend): AcpDetectedAgent | undefined {
    return this.detectedAgents.find(a => a.backend === backend)
  }

  isAgentAvailable(backend: AcpBackend): boolean {
    const agent = this.getAgentByBackend(backend)
    return agent?.available ?? false
  }

  clearCache(): void {
    this.detectedAgents = []
    this.detectionPromise = null
  }
}

export const agentDetector = new AgentDetector()
