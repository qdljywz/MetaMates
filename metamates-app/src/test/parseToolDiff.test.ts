import { describe, expect, it } from 'vitest'
import { extractToolDiff } from '../services/agent-bridge/parseToolDiff'

describe('extractToolDiff', () => {
  it('parses unified diff content', () => {
    const diff = extractToolDiff(undefined, [
      '--- a/notes/daily.md',
      '+++ b/notes/daily.md',
      '@@ -1,2 +1,3 @@',
      ' line',
      '-removed',
      '+added',
    ].join('\n'))

    expect(diff?.fileName).toBe('daily.md')
    expect(diff?.insertions).toBe(1)
    expect(diff?.deletions).toBe(1)
  })

  it('builds diff from old/new json fields', () => {
    const diff = extractToolDiff(JSON.stringify({
      path: 'src/App.tsx',
      old_string: 'alpha',
      new_string: 'beta',
    }))

    expect(diff?.insertions).toBeGreaterThan(0)
    expect(diff?.deletions).toBeGreaterThan(0)
    expect(diff?.unifiedDiff).toContain('-alpha')
    expect(diff?.unifiedDiff).toContain('+beta')
  })
})
