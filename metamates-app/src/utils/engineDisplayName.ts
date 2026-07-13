import type { EmptyStateHistoryItem } from './emptyStatePlanner'

/** Default thinking-partner label before the user picks a personal name. */
export const ENGINE_DEFAULT_PARTNER_NAME = '2M'

/** Max length for a user-chosen thinking-engine display name. */
export const ENGINE_NAME_MAX_LEN = 12

/** Cooldown after skip before a gentle reminder may appear again. */
export const ENGINE_NAMING_SKIP_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

/** Minimum other empty-state turns before a naming reminder. */
export const ENGINE_NAMING_REMIND_INTERVAL = 3

/** Lifetime cap on how often we ask to name the engine. */
export const ENGINE_NAMING_MAX_PROMPTS = 4

export interface EngineNamingSettings {
  engineDisplayName?: string
  engineNamingSkippedAt?: number
  engineNamingPromptCount?: number
}

/**
 * Trim and collapse whitespace for engine display names.
 */
export function normalizeEngineDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * Whether the stored name is the factory default (2M), not a user pick.
 */
export function isDefaultPartnerName(raw: string): boolean {
  return normalizeEngineDisplayName(raw) === ENGINE_DEFAULT_PARTNER_NAME
}

/**
 * Resolved partner label for UI: custom name, else default 2M.
 */
export function resolvePartnerDisplayName(stored?: string): string {
  const normalized = normalizeEngineDisplayName(stored ?? '')
  if (!normalized || isDefaultPartnerName(normalized)) {
    return ENGINE_DEFAULT_PARTNER_NAME
  }
  return normalized
}

/**
 * Whether the user has chosen a personal name (anything other than empty / 2M).
 */
export function hasCustomEngineDisplayName(settings: EngineNamingSettings): boolean {
  const normalized = normalizeEngineDisplayName(settings.engineDisplayName ?? '')
  return !!normalized && !isDefaultPartnerName(normalized)
}

/**
 * @deprecated Use {@link hasCustomEngineDisplayName}.
 */
export function hasEngineDisplayName(settings: EngineNamingSettings): boolean {
  return hasCustomEngineDisplayName(settings)
}

/**
 * Validate a user-provided engine display name (syntax only).
 */
export function validateEngineDisplayName(
  raw: string,
): { ok: true; name: string } | { ok: false; reason: 'empty' | 'tooLong' | 'invalid' } {
  const name = normalizeEngineDisplayName(raw)
  if (!name) return { ok: false, reason: 'empty' }
  if (name.length > ENGINE_NAME_MAX_LEN) return { ok: false, reason: 'tooLong' }
  if (!/[\p{L}\p{N}]/u.test(name)) return { ok: false, reason: 'invalid' }
  return { ok: true, name }
}

/**
 * Validate a personal partner name — rejects the factory default 2M.
 */
export function validateCustomEngineDisplayName(
  raw: string,
): { ok: true; name: string } | { ok: false; reason: 'empty' | 'tooLong' | 'invalid' | 'default' } {
  const base = validateEngineDisplayName(raw)
  if (!base.ok) return base
  if (isDefaultPartnerName(base.name)) return { ok: false, reason: 'default' }
  return base
}

/**
 * Decide if the empty-state should surface the engine-naming question.
 */
export function shouldPromptEngineNaming(
  settings: EngineNamingSettings & { hasWorkspace: boolean; agentHint: string },
  history: EmptyStateHistoryItem[] = [],
  now = Date.now(),
): { show: boolean; firstTime: boolean } {
  if (!settings.hasWorkspace || hasCustomEngineDisplayName(settings)) {
    return { show: false, firstTime: false }
  }
  if (settings.agentHint === 'no_agent' || settings.agentHint === 'auth_required') {
    return { show: false, firstTime: false }
  }

  const lifetimeShows = history.filter((item) => item.questionId === 'name-engine').length
  if (lifetimeShows >= ENGINE_NAMING_MAX_PROMPTS) {
    return { show: false, firstTime: false }
  }

  const neverSkipped = !settings.engineNamingSkippedAt
  const neverShown = lifetimeShows === 0

  if (neverShown && neverSkipped) {
    return { show: true, firstTime: true }
  }

  if (!settings.engineNamingSkippedAt) {
    return { show: false, firstTime: false }
  }

  const sinceSkip = now - settings.engineNamingSkippedAt
  if (sinceSkip < ENGINE_NAMING_SKIP_COOLDOWN_MS) {
    return { show: false, firstTime: false }
  }

  const lastNameShow = history.find((item) => item.questionId === 'name-engine')
  const showsSinceLastName = lastNameShow
    ? history.filter(
      (item) => item.shownAt > lastNameShow.shownAt && item.questionId !== 'name-engine',
    ).length
    : history.filter((item) => item.questionId !== 'name-engine').length

  if (showsSinceLastName < ENGINE_NAMING_REMIND_INTERVAL) {
    return { show: false, firstTime: false }
  }

  if (
    lastNameShow
    && now - lastNameShow.shownAt < ENGINE_NAMING_SKIP_COOLDOWN_MS
  ) {
    return { show: false, firstTime: false }
  }

  return { show: true, firstTime: false }
}
