/** Per-backend permission modes for renderer (mirrors electron/shared/agentModes.ts). */

export interface AgentModeOption {
  value: string
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
    COMMON_YOLO,
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

export function getModeOptionsForBackend(backend: string | null | undefined): AgentModeOption[] {
  if (!backend) return FALLBACK_MODE_OPTIONS
  return AGENT_MODE_OPTIONS[backend] ?? FALLBACK_MODE_OPTIONS
}
