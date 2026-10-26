import {
  getTodayDateString,
  openOrCreateDailyEntry,
  type WorkspaceLanguage,
} from '../../constants/paths'
import {
  appendPomodoroLineToMarkdown,
  formatPomodoroDiaryLine,
} from './appendPomodoroToDailyNote'

export interface WritePomodoroDiaryInput {
  workspacePath: string
  language: WorkspaceLanguage | string
  startedAt: Date
  endedAt: Date
  durationMin: number
  note: string
}

/**
 * Ensure today's daily note exists and append a pomodoro line under ## 番茄钟 / ## Pomodoro.
 * @returns Absolute path of the daily note, or null on failure
 */
export async function writePomodoroToDailyNote(
  input: WritePomodoroDiaryInput,
): Promise<string | null> {
  if (!window.electronAPI || !input.workspacePath) return null

  const language = (input.language === 'en' ? 'en' : 'zh') as WorkspaceLanguage
  const dateStr = getTodayDateString()
  const entry = await openOrCreateDailyEntry(input.workspacePath, dateStr, 'note', language)
  if (!entry) return null

  const existing = await window.electronAPI.readFile(entry.path)
  const content = existing.success && typeof existing.content === 'string' ? existing.content : ''
  const line = formatPomodoroDiaryLine({
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMin: input.durationMin,
    note: input.note,
    language,
  })
  const next = appendPomodoroLineToMarkdown(content, line, language)
  const write = await window.electronAPI.writeFile(entry.path, next)
  if (!write.success) return null
  return entry.path
}
