/**
 * Single source for agent logo URLs and fallback initials (renderer + main process).
 *
 * Layout contract (see resolveAgentAssetsDir in appPaths.ts):
 * - Source of truth: public/assets/{backendId}.svg (logos:agents)
 * - Renderer URL: ./assets/{backendId}.svg (relative to dist/index.html)
 * - Packaged main-process disk probe: agentLogosDisk.ts (main only)
 */
import { LOGO_COLORS, POTENTIAL_ACP_CLIS } from './acpRegistry'

export type AgentLogoInfo = {
  type: 'file' | 'initial'
  src?: string
  initial?: string
  bgColor?: string
}

/** Must ship real brand SVGs in public/assets/ — verified by verify-agent-logos + verify-agent-logo-resolution */
export const BRANDED_AGENT_LOGO_IDS = ['gemini', 'claude', 'codebuddy', 'qwen', 'codex'] as const

export function getAgentDisplayName(backendId: string): string {
  return POTENTIAL_ACP_CLIS.find((c) => c.backendId === backendId)?.name ?? backendId
}

export function getAgentLogoAssetSrc(backendId: string): string {
  return `./assets/${backendId}.svg`
}

export function getAgentLogoColor(backendId: string): string {
  return LOGO_COLORS[backendId] || '#6b7280'
}

export function getAgentInitial(backendId: string, name?: string): string {
  const display = name ?? getAgentDisplayName(backendId)
  return display ? display.charAt(0).toUpperCase() : '?'
}

export function buildAgentLogoInfo(
  backendId: string,
  options?: { name?: string; assetFileExists?: boolean },
): AgentLogoInfo {
  const name = options?.name ?? getAgentDisplayName(backendId)
  if (options?.assetFileExists !== false) {
    return { type: 'file', src: getAgentLogoAssetSrc(backendId) }
  }
  return {
    type: 'initial',
    initial: getAgentInitial(backendId, name),
    bgColor: getAgentLogoColor(backendId),
  }
}

/** All backends that should have a public/assets/{id}.svg after logos:agents */
export function getRuntimeLogoBackendIds(): string[] {
  const ids = POTENTIAL_ACP_CLIS.filter((c) => c.detectByDefault).map((c) => c.backendId)
  if (!ids.includes('ollama')) ids.push('ollama')
  return ids
}
