/** Shared design-token references — stay in sync with App.css :root tokens. */

export interface AgentPanelTheme {
  bg: string
  bgSecondary: string
  bgTertiary: string
  surface: string
  border: string
  text: string
  textSecondary: string
  primary: string
  primaryText: string
  primaryHover: string
  success: string
  warning: string
  error: string
  info: string
}

/** Agent inline styles that must follow light/dark + color-scheme from CSS. */
export const AGENT_PANEL_THEME: AgentPanelTheme = {
  bg: 'var(--canvas-surface)',
  bgSecondary: 'var(--canvas-surface)',
  bgTertiary: 'var(--canvas-base)',
  surface: 'var(--canvas-hover)',
  border: 'var(--divider-strong)',
  text: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  primary: 'var(--accent)',
  primaryText: '#ffffff',
  primaryHover: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
  info: 'var(--secondary-accent)',
}
