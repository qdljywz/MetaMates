/** User-facing product name (exe, shortcuts, UI). */
export const PRODUCT_NAME = 'MetaMates'

/**
 * Canonical i18n keys in the `common` namespace (`common.json` → `brand`).
 * All user-facing product copy should match these strings or reference them.
 */
export const BRAND_I18N = {
  sloganShort: 'brand.sloganShort',
  sloganFull: 'brand.sloganFull',
  thinkingEngine: 'brand.thinkingEngine',
  inspirationVault: 'brand.inspirationVault',
  installAssistant: 'brand.installAssistant',
  settingsAgentPath: 'brand.settingsAgentPath',
  noAssistantTitle: 'brand.noAssistantTitle',
  noAssistantBadge: 'brand.noAssistantBadge',
  noAssistantValue: 'brand.noAssistantValue',
  noAssistantHint: 'brand.noAssistantHint',
  noAssistantShort: 'brand.noAssistantShort',
  installStepsTitle: 'brand.installStepsTitle',
  installStep1: 'brand.installStep1',
  installStep2: 'brand.installStep2',
  installStep3: 'brand.installStep3',
  rescan: 'brand.rescan',
  rescanning: 'brand.rescanning',
} as const

export { ENGINE_DEFAULT_PARTNER_NAME } from '../utils/engineDisplayName'

export const GITHUB_REPO = 'https://github.com/qdljywz/MetaMates'
export const GITHUB_ISSUES = `${GITHUB_REPO}/issues`
export const GITHUB_RELEASES = `${GITHUB_REPO}/releases`
