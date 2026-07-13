import type { AppAction } from '../store/appStore'
import { storageService } from './storage'
import { validateCustomEngineDisplayName } from '../utils/engineDisplayName'

type SettingsDispatch = (action: AppAction) => void

/**
 * Persist a user-chosen thinking-engine display name.
 */
export async function persistEngineDisplayName(
  raw: string,
  dispatch: SettingsDispatch,
): Promise<{ ok: true; name: string } | { ok: false; reason: 'empty' | 'tooLong' | 'invalid' | 'default' }> {
  const validated = validateCustomEngineDisplayName(raw)
  if (!validated.ok) return validated

  const payload = {
    engineDisplayName: validated.name,
    engineNamingSkippedAt: undefined as number | undefined,
  }

  await storageService.saveSettings(payload)
  dispatch({ type: 'UPDATE_SETTINGS', payload })
  notifyEngineNameChanged()
  return validated
}

/**
 * Record that the user skipped the engine-naming prompt.
 */
export async function skipEngineNamingPrompt(dispatch: SettingsDispatch): Promise<void> {
  const current = await storageService.getSettings()
  const now = Date.now()
  const payload = {
    engineNamingSkippedAt: now,
    engineNamingPromptCount: (current.engineNamingPromptCount ?? 0) + 1,
  }

  await storageService.saveSettings(payload)
  dispatch({ type: 'UPDATE_SETTINGS', payload })
  window.dispatchEvent(new CustomEvent('metamates:empty-state-force-refresh'))
}

function notifyEngineNameChanged(): void {
  window.dispatchEvent(new CustomEvent('metamates:engine-name-updated'))
  window.dispatchEvent(new CustomEvent('metamates:empty-state-force-refresh'))
}
