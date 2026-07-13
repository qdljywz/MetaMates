/** Message when terminal/legacy command path hits deprecated built-in AI. */
export function getAcpRedirectMessage(language?: string): string {
  const lang = language || (typeof localStorage !== 'undefined' ? localStorage.getItem('metamates-language') : null) || 'zh'
  if (lang.startsWith('en')) {
    return 'This command is handled by the thinking engine on the right (ACP). Use slash commands in that panel, e.g. /today, /context. Built-in Legacy AI has been removed.'
  }
  return '此命令已通过右侧思考引擎（ACP）处理。请在思考引擎面板输入 slash 命令，例如 /today、/context。内置 Legacy AI 已移除。'
}
