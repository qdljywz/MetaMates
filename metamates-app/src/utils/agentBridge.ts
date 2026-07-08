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

/** Open the CLI install panel (Agent sidebar or settings). */
export function openCliInstall(): void {
  window.dispatchEvent(new CustomEvent('metamates:open-cli-install'))
}
