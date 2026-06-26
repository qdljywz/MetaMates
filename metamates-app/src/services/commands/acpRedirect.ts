/** Message when terminal/legacy command path hits deprecated built-in AI. */
export function getAcpRedirectMessage(language?: string): string {
  const lang = language || (typeof localStorage !== 'undefined' ? localStorage.getItem('metamates-language') : null) || 'zh'
  if (lang.startsWith('en')) {
    return 'This command is handled by the Agent chat panel (ACP). Use slash commands in the right panel, e.g. /today, /context. Built-in Legacy AI has been removed.'
  }
  return '此命令已通过 Agent 聊天面板（ACP）处理。请使用右侧 Agent 面板输入 slash 命令，例如 /today、/context。内置 Legacy AI 已移除。'
}
