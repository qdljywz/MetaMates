import { useAppContext } from '../store/AppContext'
import {
  ENGINE_DEFAULT_PARTNER_NAME,
  hasCustomEngineDisplayName,
  resolvePartnerDisplayName,
} from '../utils/engineDisplayName'

/**
 * Resolved thinking-partner label: custom name, else default 2M.
 */
export function useEngineName(): {
  displayName: string
  hasCustomName: boolean
  defaultName: string
} {
  const { state } = useAppContext()

  return {
    displayName: resolvePartnerDisplayName(state.settings.engineDisplayName),
    hasCustomName: hasCustomEngineDisplayName(state.settings),
    defaultName: ENGINE_DEFAULT_PARTNER_NAME,
  }
}
