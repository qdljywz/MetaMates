import GeminiLogo from '../assets/logos/ai-major/gemini.svg'
import ClaudeLogo from '../assets/logos/ai-major/claude.svg'
import QwenLogo from '../assets/logos/ai-major/qwen.svg'
import CodeBuddyLogo from '../assets/logos/tools/coding/codebuddy.svg'
import CodexLogo from '../assets/logos/tools/coding/codex.svg'

const AGENT_LOGO_MAP: Record<string, string> = {
  gemini: GeminiLogo,
  claude: ClaudeLogo,
  qwen: QwenLogo,
  codebuddy: CodeBuddyLogo,
  codex: CodexLogo,
}

const AGENT_COLORS: Record<string, string> = {
  gemini: '#4285f4',
  claude: '#d97706',
  qwen: '#8b5cf6',
  codebuddy: '#00d4aa',
  codex: '#10a37f',
}

const AGENT_NAMES: Record<string, string> = {
  gemini: 'Gemini CLI',
  claude: 'Claude Code',
  qwen: 'Qwen Code',
  codebuddy: 'CodeBuddy',
  codex: 'Codex',
}

export function getAgentLogo(backendId: string): string | null {
  return AGENT_LOGO_MAP[backendId] || null
}

export function getAgentColor(backendId: string): string {
  return AGENT_COLORS[backendId] || '#6b7280'
}

export function getAgentInitial(backendIdOrName: string): string {
  const name = AGENT_NAMES[backendIdOrName] || backendIdOrName
  return name ? name.charAt(0).toUpperCase() : '?'
}

export interface AgentLogoInfo {
  type: 'file' | 'initial'
  src?: string
  initial?: string
  bgColor?: string
}

export function getAgentLogoInfo(backendId: string): AgentLogoInfo {
  const logoSrc = AGENT_LOGO_MAP[backendId]
  if (logoSrc) {
    return { type: 'file', src: logoSrc }
  }
  
  const name = AGENT_NAMES[backendId] || backendId
  const initial = name.charAt(0).toUpperCase()
  const bgColor = AGENT_COLORS[backendId] || '#6b7280'
  
  return { type: 'initial', initial, bgColor }
}
