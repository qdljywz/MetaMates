import { storageService } from './storage'
import type { EmptyStateContext } from '../utils/editorEmptyState'

interface BackgroundRethinkResult {
  questionText?: string
  contextLineText?: string
}

function isRethinkDebugAllowed(): boolean {
  const isE2E = (window as Window & { __METAMATES_E2E__?: { enabled?: boolean } }).__METAMATES_E2E__?.enabled
  if (isE2E) return true
  const host = window.location?.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

function setRethinkDebug(reason: string): void {
  if (!isRethinkDebugAllowed()) return
  try {
    localStorage.setItem('metamates-empty-state-rethink-debug', reason)
  } catch {
    // ignore
  }
}

function extractTextFromData(data: unknown): string {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const value = data as Record<string, unknown>
    const direct = value.content ?? value.text ?? value.message
    if (typeof direct === 'string') return direct
    if (direct && typeof direct === 'object') {
      const nested = direct as Record<string, unknown>
      if (typeof nested.content === 'string') return nested.content
      if (typeof nested.text === 'string') return nested.text
    }
    if (Array.isArray(value.content)) {
      return value.content
        .map((item) => (item && typeof item === 'object' ? String((item as Record<string, unknown>).text ?? '') : ''))
        .join('\n')
        .trim()
    }
  }
  return ''
}

function extractHistoryMessageText(msg: { type?: string; position?: string; content?: unknown }): string {
  if (msg.position !== 'left' && msg.type !== 'text') return ''
  const content = msg.content
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>
    if (typeof record.content === 'string') return record.content
    if (typeof record.display === 'string') return record.display
  }
  return ''
}

async function fetchRethinkFromHistory(
  backend: string,
  sinceMs: number,
): Promise<BackgroundRethinkResult | null> {
  const api = window.electronAPI?.acp
  if (!api?.getConversationHistory) return null
  try {
    const hist = await api.getConversationHistory(backend, { limit: 40 })
    const messages = (hist?.messages ?? []) as Array<{
      type?: string
      position?: string
      content?: unknown
      created_at?: number
    }>
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]!
      if (msg.created_at != null && msg.created_at < sinceMs - 3000) continue
      const text = extractHistoryMessageText(msg)
      if (!text.trim() || text.includes('[background-empty-state]')) continue
      const parsed = extractRethinkResult(text)
      if (parsed?.questionText?.trim()) return parsed
    }
  } catch {
    // ignore
  }
  return null
}

function safeJsonParse<T>(text: string): T | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  const raw = fenced?.[1] ?? text
  const objectMatch = raw.match(/\{[\s\S]*\}/)
  if (!objectMatch) return null
  try {
    return JSON.parse(objectMatch[0]) as T
  } catch {
    return null
  }
}

function unescapeJsonString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\n/g, '\n').trim()
}

/** Accept strict JSON and common agent typos (e.g. `"questionText点 …"` keys). */
export function extractRethinkResult(text: string): BackgroundRethinkResult | null {
  const parsed = safeJsonParse<BackgroundRethinkResult>(text)
  if (parsed?.questionText?.trim()) {
    return {
      questionText: parsed.questionText.trim(),
      contextLineText: parsed.contextLineText?.trim(),
    }
  }

  const questionMatch = text.match(/"questionText[^"]*"\s*:\s*"((?:[^"\\]|\\.)*)"/i)
  if (questionMatch?.[1]) {
    const contextMatch = text.match(/"contextLineText[^"]*"\s*:\s*"((?:[^"\\]|\\.)*)"/i)
    return {
      questionText: unescapeJsonString(questionMatch[1]),
      contextLineText: contextMatch?.[1] ? unescapeJsonString(contextMatch[1]) : undefined,
    }
  }

  const fallback = extractFallbackQuestion(text)
  return fallback ? { questionText: fallback } : null
}

function extractFallbackQuestion(text: string): string {
  const withoutFence = text.replace(/```[\s\S]*?```/g, ' ').trim()
  const quoted = withoutFence.match(/"([^"]{12,120})"/g)
  if (quoted?.length) {
    const candidate = quoted
      .map((part) => part.slice(1, -1).trim())
      .find((part) => !part.startsWith('questionText') && !part.startsWith('contextLineText'))
    if (candidate) return candidate.slice(0, 80)
  }

  const cleaned = withoutFence
    .replace(/\{[\s\S]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  const firstSentence = cleaned.split(/[。！？!?]/)[0]?.trim() || cleaned
  return firstSentence.slice(0, 80)
}

function getRethinkTimeoutMs(): number {
  const isE2E = (window as Window & { __METAMATES_E2E__?: { enabled?: boolean } }).__METAMATES_E2E__?.enabled
  return isE2E ? 120_000 : 45_000
}

function isAgentIdleForBackground(): boolean {
  const thinking = document.querySelector('[data-testid="agent-thinking-placeholder"]') as HTMLElement | null
  const cancel = document.querySelector('[data-testid="cancel-prompt"]') as HTMLElement | null
  const thinkingVisible = !!thinking && getComputedStyle(thinking).display !== 'none' && thinking.offsetParent !== null
  const cancelVisible = !!cancel && getComputedStyle(cancel).display !== 'none' && cancel.offsetParent !== null
  if (thinkingVisible || cancelVisible) return false

  const chatInput = document.querySelector('[data-testid="chat-input"]') as HTMLTextAreaElement | null
  if (!chatInput || chatInput.disabled) return false
  return true
}

function buildRethinkPrompt(ctx: EmptyStateContext): string {
  const recent = (ctx.recentFocusLabel
    ?? ctx.recentFiles.slice(0, 4).map((f) => f.name).join(', '))
    || 'none'
  const planLine = ctx.todayPlanExists
    ? `openTasks=${ctx.planUncheckedCount}, doneTasks=${ctx.planCheckedCount}, firstOpen="${ctx.planFirstOpenTask ?? 'n/a'}"`
    : 'no plan file today'
  const scheduleLine = ctx.scheduleTodayCount > 0
    ? `${ctx.scheduleTodayCount} events; next="${`${ctx.scheduleNextTime ?? ''} ${ctx.scheduleNextSummary ?? ''}`.trim()}"`
    : 'no calendar events today'
  const ideasLine = ctx.recentIdeasLabel ?? 'none'

  return [
    '你是 MetaMates 空态引导后台判断器。请基于用户当前处境，产出一个“真问题”。',
    '要求：',
    '1) 不要泛泛建议，不要功能清单，不要总盯着 inbox 条数。',
    '2) 优先围绕：今日 PLAN 未完成任务、日历日程、最近专注的项目/笔记、Ideas 报告。',
    '3) 如果 inbox 很多但用户已有 PLAN 或日程，问“焦点/取舍/阻力”，而不是“去整理 inbox”。',
    '4) 语气简洁、具体，20-45字，像懂用户处境的朋友。',
    '5) 只返回 JSON：{"questionText":"...","contextLineText":"..."}',
    '',
    '当前上下文：',
    `- hour: ${ctx.hour}`,
    `- inboxCount: ${ctx.inboxCount} (background only — do not make this the main angle unless it is the real blocker)`,
    `- plan: ${planLine}`,
    `- schedule: ${scheduleLine}`,
    `- recentFocus: ${recent}`,
    `- ideasReport: ${ideasLine}`,
    `- todayNoteExists: ${ctx.todayNoteExists}`,
    `- agentHint: ${ctx.agentHint}`,
  ].join('\n')
}

/**
 * Run a low-priority agent rethink in background.
 * This only runs when agent panel is idle to avoid interrupting active conversations.
 */
export async function runBackgroundEmptyStateRethink(
  ctx: EmptyStateContext,
): Promise<BackgroundRethinkResult | null> {
  const api = window.electronAPI?.acp
  if (!api?.sendPrompt || !api?.onAcpStreamMessage || !api?.onEndTurn || !api?.getConnectionStatus) {
    setRethinkDebug('skip:no-acp-api')
    return null
  }
  if (!isAgentIdleForBackground()) {
    setRethinkDebug('skip:agent-busy')
    return null
  }

  const settings = await storageService.getSettings().catch(() => null)
  const backend = settings?.lastAgentBackend || 'codebuddy'
  const status = await api.getConnectionStatus(backend).catch(() => null)
  if (!status?.connected || status.needsAuth) {
    setRethinkDebug(`skip:backend-not-ready:${backend}`)
    return null
  }

  const prompt = buildRethinkPrompt(ctx)
  const promptSentAt = Date.now()
  let collected = ''
  let resolved = false

  return await new Promise<BackgroundRethinkResult | null>((resolve) => {
    let parseCheckTimer: number | null = null
    let historyPollTimer: number | null = null
    const cleanup = () => {
      offStream?.()
      offEnd?.()
      if (parseCheckTimer) window.clearTimeout(parseCheckTimer)
      if (historyPollTimer) window.clearInterval(historyPollTimer)
    }
    const finish = (value: BackgroundRethinkResult | null, reason?: string) => {
      if (resolved) return
      resolved = true
      cleanup()
      if (value?.questionText?.trim()) {
        setRethinkDebug(`ok:${backend}`)
      } else if (reason) {
        setRethinkDebug(reason)
      }
      resolve(value)
    }

    const resolveCollected = async (): Promise<BackgroundRethinkResult | null> => {
      const fromStream = extractRethinkResult(collected)
      if (fromStream?.questionText?.trim()) return fromStream
      return fetchRethinkFromHistory(backend, promptSentAt)
    }

    const scheduleParseCheck = () => {
      if (parseCheckTimer) window.clearTimeout(parseCheckTimer)
      parseCheckTimer = window.setTimeout(() => {
        void resolveCollected().then((parsed) => {
          if (parsed?.questionText?.trim()) finish(parsed)
        })
      }, 350)
    }

    const offStream = api.onAcpStreamMessage(({ backend: b, message }) => {
      if (b !== backend) return
      if (message.type === 'finish') {
        window.setTimeout(() => {
          void resolveCollected().then((parsed) => {
            if (parsed?.questionText?.trim()) finish(parsed)
          })
        }, 400)
        return
      }
      if (message.type !== 'text' && message.type !== 'content') return
      collected += `\n${extractTextFromData(message.data)}`
      scheduleParseCheck()
    })
    const offEnd = api.onEndTurn(({ backend: b }) => {
      if (b !== backend) return
      void resolveCollected().then((parsed) => {
        finish(parsed, parsed?.questionText ? undefined : `empty:${backend}`)
      })
    })

    historyPollTimer = window.setInterval(() => {
      if (resolved) return
      void fetchRethinkFromHistory(backend, promptSentAt).then((parsed) => {
        if (parsed?.questionText?.trim()) finish(parsed)
      })
    }, 4000)

    window.setTimeout(() => {
      void resolveCollected().then((late) => {
        if (late?.questionText?.trim()) {
          finish(late)
          return
        }
        finish(null, `timeout:${backend}`)
      })
    }, getRethinkTimeoutMs())

    void api.sendPrompt(prompt, null, [], '[background-empty-state]')
      .then((result) => {
        if (result && result.success === false) {
          setRethinkDebug(`send-failed:${backend}`)
          finish(null)
        }
      })
      .catch(() => {
        setRethinkDebug(`send-error:${backend}`)
        finish(null)
      })
  })
}
