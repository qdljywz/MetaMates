/**
 * Startup / workspace-picker UX guardrails.
 * Keep policy here + unit tests so regressions are caught in CI, not by users.
 *
 * LOCKED splash contract (do not change without design sign-off):
 * - Animation: exactly one 5s M-outline cycle (logoTrace STARTUP_SPLASH_CYCLE_S).
 * - Splash visibility: fixed wall-clock from first React splash mount → STARTUP_FORCE_ENTER_MS (5.5s).
 * - Preloads/agent warmup run in parallel but must NOT shorten splash (waitUntilSplashEnter).
 * - Last-used Agent CLI: settings.lastAgentBackend → splash preload + tab select (startupPreload / AgentChatPanel).
 */
import { STARTUP_SPLASH_CYCLE_S } from '../constants/logoTrace'

/** Brand splash animation cycle (ms) — must match logoTrace STARTUP_SPLASH_CYCLE_S. */
export const STARTUP_SPLASH_CYCLE_MS = STARTUP_SPLASH_CYCLE_S * 1000

/**
 * Minimum splash while preloads run in parallel (one full M draw cycle).
 * Agent connect is not awaited — see STARTUP_SKIP_AGENT_WAIT.
 */
export const STARTUP_MIN_WHEN_SKIP_AGENT_MS = STARTUP_SPLASH_CYCLE_MS

/** Fixed enter time: 5s animation + 500ms hold on completed frame. Not derived from preload/agent timing. */
export const STARTUP_FORCE_ENTER_MS = STARTUP_SPLASH_CYCLE_MS + 500

/** Set when App mounts StartupSplash — anchor for fixed-duration splash exit. */
let splashMountedAtMs: number | null = null

export function markSplashMounted(): void {
  splashMountedAtMs = Date.now()
}

/** Block until STARTUP_FORCE_ENTER_MS elapsed since markSplashMounted (never exit splash early). */
export async function waitUntilSplashEnter(
  forceEnterMs: number = STARTUP_FORCE_ENTER_MS,
): Promise<void> {
  const mounted = splashMountedAtMs ?? Date.now()
  const remain = Math.max(0, forceEnterMs - (Date.now() - mounted))
  if (remain > 0) await waitStartupCapMs(remain)
}

/** Agent warmup runs during splash + panel mount; splash must not wait for CLI connect. */
export const STARTUP_SKIP_AGENT_WAIT = true

/** Playwright cold-start slack (Vite first paint + Electron bootstrap). */
export const STARTUP_E2E_SLACK_MS = 2_000

/** Max splash duration in E2E after splash becomes visible (E2E boot uses faster minMs). */
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
