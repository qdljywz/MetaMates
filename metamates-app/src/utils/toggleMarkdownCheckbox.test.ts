import { describe, expect, it } from 'vitest'
import { toggleMarkdownCheckboxAtLine } from './toggleMarkdownCheckbox'

describe('toggleMarkdownCheckboxAtLine', () => {
  it('checks an unchecked task line', () => {
    const src = '# Plan\n\n- [ ] write report\n- [ ] other\n'
    expect(toggleMarkdownCheckboxAtLine(src, 2)).toBe('# Plan\n\n- [x] write report\n- [ ] other\n')
  })

  it('unchecks a checked task line (X or x)', () => {
    expect(toggleMarkdownCheckboxAtLine('- [x] done\n', 0)).toBe('- [ ] done\n')
    expect(toggleMarkdownCheckboxAtLine('- [X] done\n', 0)).toBe('- [ ] done\n')
  })

  it('preserves CRLF', () => {
    const src = '- [ ] a\r\n- [ ] b\r\n'
    expect(toggleMarkdownCheckboxAtLine(src, 0)).toBe('- [x] a\r\n- [ ] b\r\n')
  })

  it('returns null for non-checkbox or out-of-range lines', () => {
    expect(toggleMarkdownCheckboxAtLine('- plain\n', 0)).toBeNull()
    expect(toggleMarkdownCheckboxAtLine('* [ ] star\n', 0)).toBeNull()
    expect(toggleMarkdownCheckboxAtLine('- [ ] a\n', 3)).toBeNull()
    expect(toggleMarkdownCheckboxAtLine('- [ ] a\n', -1)).toBeNull()
  })

  it('toggles through frontmatter offset lines', () => {
    const src = '---\ntitle: t\n---\n\n- [ ] task\n'
    expect(toggleMarkdownCheckboxAtLine(src, 4)).toBe('---\ntitle: t\n---\n\n- [x] task\n')
  })
})
