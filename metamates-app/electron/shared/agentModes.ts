/** Per-backend permission / execution modes (aligned with AionUi agentModes). */

export interface AgentModeOption {
  value: string
  /** i18n key under agent.modes.* */
  labelKey: string
}

const COMMON_YOLO: AgentModeOption = { value: 'yolo', labelKey: 'yolo' }
const COMMON_DEFAULT: AgentModeOption = { value: 'default', labelKey: 'default' }
const COMMON_PLAN: AgentModeOption = { value: 'plan', labelKey: 'plan' }

export const AGENT_MODE_OPTIONS: Record<string, AgentModeOption[]> = {
  claude: [
    COMMON_DEFAULT,
    { value: 'acceptEdits', labelKey: 'acceptEdits' },
    COMMON_PLAN,
    { value: 'yolo', labelKey: 'yolo' },
  ],
  gemini: [
    COMMON_DEFAULT,
    { value: 'autoEdit', labelKey: 'autoEdit' },
    COMMON_YOLO,
    COMMON_PLAN,
  ],
  codebuddy: [COMMON_DEFAULT, COMMON_YOLO, COMMON_PLAN],
  qwen: [COMMON_DEFAULT, COMMON_YOLO],
  codex: [
    { value: 'read-only', labelKey: 'readOnly' },
    COMMON_DEFAULT,
    { value: 'yolo', labelKey: 'fullAccess' },
  ],
  cursor: [
    { value: 'agent', labelKey: 'agent' },
    COMMON_PLAN,
    { value: 'ask', labelKey: 'ask' },
  ],
  opencode: [
    { value: 'build', labelKey: 'build' },
    COMMON_PLAN,
  ],
}

export const FALLBACK_MODE_OPTIONS: AgentModeOption[] = [
  COMMON_YOLO,
  COMMON_DEFAULT,
  COMMON_PLAN,
]

/** Map UI mode value → ACP session/set_mode value per backend. */
const UI_TO_BACKEND_MODE: Record<string, Record<string, string>> = {
  claude: {
    yolo: 'bypassPermissions',
    plan: 'plan',
    acceptEdits: 'acceptEdits',
    default: 'default',
  },
  gemini: { yolo: 'yolo', plan: 'plan', autoEdit: 'autoEdit', default: 'default' },
  codebuddy: { yolo: 'yolo', plan: 'plan', default: 'default' },
  qwen: { yolo: 'yolo', plan: 'plan', default: 'default' },
  codex: { yolo: 'full-access', default: 'default', 'read-only': 'read-only' },
  cursor: { agent: 'agent', plan: 'plan', ask: 'ask' },
  opencode: { build: 'build', plan: 'plan' },
}

export function getModeOptionsForBackend(backend: string | null | undefined): AgentModeOption[] {
  if (!backend) return FALLBACK_MODE_OPTIONS
  return AGENT_MODE_OPTIONS[backend] ?? FALLBACK_MODE_OPTIONS
}

export function mapUiModeToBackend(backend: string, uiMode: string): string {
  return UI_TO_BACKEND_MODE[backend]?.[uiMode] ?? uiMode
}
