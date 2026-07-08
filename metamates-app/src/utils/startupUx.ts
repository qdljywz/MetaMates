/**
 * Startup / workspace-picker UX guardrails.
 * Keep policy here + unit tests so regressions are caught in CI, not by users.
 */

/** Splash must never block the shell longer than this (ms). */
export const STARTUP_FORCE_ENTER_MS = 4_000

/** Agent warmup runs during splash + panel mount; splash must not wait for CLI connect. */
export const STARTUP_SKIP_AGENT_WAIT = true

/** Minimum brand splash when agent wait is skipped (ms). */
export const STARTUP_MIN_WHEN_SKIP_AGENT_MS = 400

/** Playwright cold-start slack (Vite first paint + Electron bootstrap). */
export const STARTUP_E2E_SLACK_MS = 2_000

/** Max splash duration in E2E after splash becomes visible. */
export const STARTUP_SPLASH_E2E_BUDGET_MS = STARTUP_FORCE_ENTER_MS + STARTUP_E2E_SLACK_MS

export function waitStartupCapMs(ms: number = STARTUP_FORCE_ENTER_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function shouldOpenWorkspacePicker(
  needsWorkspacePicker: boolean,
  workspaceRestored: boolean,
): boolean {
  return needsWorkspacePicker && !workspaceRestored
}

export function shouldCloseWorkspacePicker(
  workspacePath: string | undefined,
  pathExists: boolean,
): boolean {
  return Boolean(workspacePath?.trim()) && pathExists
}

/** Active vault on disk — welcome wizard must not block returning users. */
export function shouldCloseWelcomeWizard(
  workspacePath: string | undefined,
  pathExists: boolean,
): boolean {
  return shouldCloseWorkspacePicker(workspacePath, pathExists)
}

export function hasOnboardingSettings(settings: {
  theme?: string
  fontSize?: number
}): boolean {
  return Boolean(settings.theme || settings.fontSize)
}

/**
 * Welcome wizard only for genuine first-time users with no saved workspace.
 * Returning users with workspacePath (even if invalid) use the workspace picker instead.
 */
export function shouldShowWelcomeWizard(params: {
  hasOnboardingSettings: boolean
  workspaceRestored: boolean
  workspacePath?: string
}): boolean {
  if (params.workspaceRestored) return false
  if (params.workspacePath?.trim()) return false
  return !params.hasOnboardingSettings
}
