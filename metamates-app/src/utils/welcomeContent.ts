import type { TFunction } from 'i18next'

/** Agent readiness hint for the editor welcome screen. */
export type WelcomeAgentHint =
  | 'idle'
  | 'no_agent'
  | 'auth_required'
  | 'connecting'
  | 'ready'

/** Detect built-in editor welcome (not a user note). */
export function isEditorWelcomeContent(content: string): boolean {
  return (
    content.includes('欢迎使用 Metamates') ||
    content.includes('Welcome to Metamates')
  )
}

const AGENT_HINT_KEYS: Record<Exclude<WelcomeAgentHint, 'idle'>, string> = {
  no_agent: 'welcome.agentNoAgent',
  auth_required: 'welcome.agentNeedsAuth',
  connecting: 'welcome.agentConnecting',
  ready: 'welcome.agentReady',
}

function pickSteps(
  t: TFunction<'editor'>,
  hasWorkspace: boolean,
  agentHint: WelcomeAgentHint,
): string[] {
  if (!hasWorkspace) {
    return [t('welcome.stepSetup1'), t('welcome.stepSetup2'), t('welcome.stepSetup3')]
  }

  switch (agentHint) {
    case 'auth_required':
      return [t('welcome.stepAuth1'), t('welcome.stepAuth2'), t('welcome.stepAuth3')]
    case 'no_agent':
      return [t('welcome.stepNoAgent1'), t('welcome.stepNoAgent2'), t('welcome.stepNoAgent3')]
    case 'connecting':
      return [t('welcome.stepConnecting1'), t('welcome.stepConnecting2'), t('welcome.stepConnecting3')]
    case 'ready':
      return [t('welcome.stepReady1'), t('welcome.stepReady2'), t('welcome.stepReady3')]
    default:
      return [t('welcome.stepReady1'), t('welcome.stepReady2'), t('welcome.stepReady3')]
  }
}

/**
 * Build the empty-editor welcome document.
 * @param t - i18n namespace `editor`
 * @param workspacePath - Current workspace root, if any
 * @param agentHint - ACP readiness from {@link useWelcomeAgentHint}
 */
export function buildEditorWelcomeContent(
  t: TFunction<'editor'>,
  workspacePath?: string,
  agentHint: WelcomeAgentHint = 'idle',
): string {
  const hasWorkspace = Boolean(workspacePath?.trim())
  const intro = hasWorkspace ? t('welcome.introReady') : t('welcome.introNoWorkspace')
  const steps = pickSteps(t, hasWorkspace, agentHint)
  const stepLines = steps.map((line, i) => `${i + 1}. ${line}`).join('\n')

  const agentBlock =
    hasWorkspace && agentHint !== 'idle'
      ? `\n## ${t('welcome.agentTitle')}\n\n${t(AGENT_HINT_KEYS[agentHint])}\n`
      : ''

  return `# ${t('welcome.title')}

${t('welcome.tagline')}

${intro}
${agentBlock}
## ${t('welcome.nextTitle')}

${stepLines}

## ${t('welcome.commandsTitle')}

${t('welcome.commandsBody')}

## ${t('welcome.tipsTitle')}

${t('welcome.tipsBody')}`
}
