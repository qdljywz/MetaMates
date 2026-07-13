/**
 * Main-process only: probe agent logo files on disk.
 * Do not import from renderer — use agentLogos.ts for browser-safe helpers.
 */
import * as fs from 'fs'
import * as path from 'path'
import { buildAgentLogoInfo, type AgentLogoInfo } from './agentLogos'

export function resolveAgentLogoInfoFromDisk(
  backendId: string,
  assetsDir: string,
  options?: { name?: string },
): AgentLogoInfo {
  const logoPath = path.join(assetsDir, `${backendId}.svg`)
  try {
    if (fs.existsSync(logoPath)) {
      return buildAgentLogoInfo(backendId, { name: options?.name, assetFileExists: true })
    }
  } catch {
    // fall through to initial
  }
  return buildAgentLogoInfo(backendId, { name: options?.name, assetFileExists: false })
}
