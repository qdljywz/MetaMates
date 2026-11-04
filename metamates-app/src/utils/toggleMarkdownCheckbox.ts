/** Match task-list lines the markdown preview renders as checkboxes. */
const CHECKBOX_LINE = /^(- \[)([ xX])(\]\s.*)$/

/**
 * Toggle `- [ ]` / `- [x]` at a 0-based line index in full markdown source.
 * Preserves `\r\n` vs `\n`. Returns null if the line is not a checkbox task.
 */
export function toggleMarkdownCheckboxAtLine(content: string, lineIndex: number): string | null {
  if (lineIndex < 0 || !Number.isInteger(lineIndex)) return null
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  if (lineIndex >= lines.length) return null
  const line = lines[lineIndex]
  const match = CHECKBOX_LINE.exec(line)
  if (!match) return null
  const nextMark = match[2].toLowerCase() === 'x' ? ' ' : 'x'
  lines[lineIndex] = `${match[1]}${nextMark}${match[3]}`
  return lines.join(eol)
}
