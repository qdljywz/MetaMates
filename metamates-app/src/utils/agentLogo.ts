import {
  buildAgentLogoInfo,
  getAgentInitial,
  getAgentLogoAssetSrc,
  getAgentLogoColor,
  getAgentDisplayName,
} from '@agent-logos'

export {
  buildAgentLogoInfo,
  getAgentInitial,
  getAgentLogoAssetSrc,
  getAgentLogoColor,
  getAgentDisplayName,
}

/** @deprecated Prefer buildAgentLogoInfo — kept for legacy AgentSelector */
export function getAgentLogo(backendId: string): string | null {
  return getAgentLogoAssetSrc(backendId)
}

export function getAgentColor(backendId: string): string {
  return getAgentLogoColor(backendId)
}

export type { AgentLogoInfo } from '@agent-logos'

export function getAgentLogoInfo(backendId: string): import('@agent-logos').AgentLogoInfo {
  return buildAgentLogoInfo(backendId)
}
