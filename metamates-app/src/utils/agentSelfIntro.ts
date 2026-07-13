/** Detect “introduce yourself” prompts in agent chat. */
const INTRO_PATTERNS = [
  /介绍.*自己/,
  /自我介绍/,
  /你是谁/,
  /你能做什么/,
  /你能帮我什么/,
  /what are you/i,
  /who are you/i,
  /introduce yourself/i,
  /what can you do/i,
]

export function isAgentSelfIntroPrompt(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return INTRO_PATTERNS.some((re) => re.test(trimmed))
}

const INTRO_CONTEXT_ZH = `【MetaMates 身份与能力 — 请据此回答，用第一人称】
你是 MetaMates（用户也称 2M）右侧「思考引擎」里的 AI 助手，不是独立的 Claude/Gemini 产品。
请介绍你在 MetaMates 里能帮用户做什么，包括但不限于：
- 读写灵感仓库里的 Markdown 笔记与日记
- Slash 方法论命令：/today、/closeday、/schedule、/trace、/intel、/graduate、/context 等
- 与左侧灵感仓库协同：捕获想法、加工笔记、情报导入（PDF/链接）
- 多助手切换（Gemini、CodeBuddy、Claude 等），在自动批准或确认模式下执行工具
- 语音输入（可选离线扩展）、图谱视图、移动端剪藏
回答要简洁、面向普通用户，突出 MetaMates 的「先捕获、后加工」与思考引擎定位。`

const INTRO_CONTEXT_EN = `【MetaMates identity — answer in first person using this context】
You are the AI assistant in MetaMates' (2M) thinking engine panel—not a standalone Claude/Gemini product.
Explain what you can do inside MetaMates: read/write vault notes, slash commands (/today, /closeday, /schedule, /trace, /intel…), intelligence import, multiple AI assistants, auto-approve or confirm-before-run tool permissions, optional offline voice, graph view, mobile clip capture.
Keep it concise for everyday users; emphasize capture-first, process-later workflow.`

export function buildAgentSelfIntroAugmentation(language: string): string {
  return language.startsWith('zh') ? INTRO_CONTEXT_ZH : INTRO_CONTEXT_EN
}

export function augmentAgentPromptIfIntro(userText: string, language: string): string {
  if (!isAgentSelfIntroPrompt(userText)) return userText
  return `${userText.trim()}\n\n${buildAgentSelfIntroAugmentation(language)}`
}
