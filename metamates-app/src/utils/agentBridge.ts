/** Cross-panel bridge: editor empty state → Agent panel. */

export type RunSlashDetail = {
  name: string
  autoSend?: boolean
}

export type PrefillAgentDetail = {
  text: string
  focus?: boolean
}

export function focusAgentPanel(): void {
  window.dispatchEvent(new CustomEvent('metamates:focus-agent'))
}

export function prefillAgentPrompt(text: string, focus = true): void {
  window.dispatchEvent(
    new CustomEvent<PrefillAgentDetail>('metamates:prefill-agent', { detail: { text, focus } }),
  )
}

export function runSlashCommand(name: string, autoSend = false): void {
  window.dispatchEvent(
    new CustomEvent<RunSlashDetail>('metamates:run-slash', { detail: { name, autoSend } }),
  )
}

export function openWorkspacePicker(): void {
  window.dispatchEvent(new CustomEvent('metamates:open-workspace-picker'))
}

/** Open the full engine setup funnel (pick → install → sign in). */
export function openEngineSetup(): void {
  window.dispatchEvent(new CustomEvent('metamates:open-engine-setup'))
}

/** Open the CLI install panel (manage multiple assistants in settings). */
export function openCliInstall(): void {
  window.dispatchEvent(new CustomEvent('metamates:open-cli-install'))
}
