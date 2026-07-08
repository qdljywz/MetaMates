import { describe, expect, it } from 'vitest'
import { parseFrontmatter, setFrontmatterProperty, updateFrontmatter } from '../services/frontmatter'
import { extractBlockContent, extractHeadingContent, stripFrontmatter, findHeadingLine, findBlockLine, parseLinkTarget } from '../services/embedResolver'

describe('frontmatter', () => {
  it('parses yaml properties', () => {
    const parsed = parseFrontmatter('---\ntitle: Note\nstatus: true\n---\n# Body')
    expect(parsed.properties.title).toBe('Note')
    expect(parsed.properties.status).toBe(true)
    expect(parsed.body.startsWith('# Body')).toBe(true)
  })

  it('updates a property', () => {
    const next = setFrontmatterProperty('---\ntitle: Old\n---\nBody', 'title', 'New')
    expect(next).toContain('title: New')
    expect(next).toContain('Body')
  })

  it('removes frontmatter when empty', () => {
    const next = updateFrontmatter('---\ntitle: Old\n---\nBody', {})
    expect(next).toBe('Body')
  })
})

describe('embedResolver', () => {
  it('extracts block content by id', () => {
    const content = [
      '# Heading',
      'First block ^abc123',
      'continued line',
      '',
      'Second block',
    ].join('\n')

    expect(extractBlockContent(content, 'abc123')).toContain('First block')
    expect(extractBlockContent(content, 'abc123')).toContain('continued line')
  })

  it('strips frontmatter before preview', () => {
    expect(stripFrontmatter('---\ntitle: x\n---\n# Hello')).toBe('# Hello')
  })

  it('finds heading and block line numbers', () => {
    const content = [
      '# Intro',
      '## Tasks',
      'Do something ^task1',
      'More under tasks',
      '## Next',
    ].join('\n')

    expect(findHeadingLine(content, 'Tasks')).toBe(2)
    expect(findBlockLine(content, 'task1')).toBe(3)
    expect(extractHeadingContent(content, 'Tasks')).toContain('Do something')
    expect(parseLinkTarget('Note#Tasks').heading).toBe('Tasks')
    expect(parseLinkTarget('Note#^task1').blockId).toBe('task1')
  })
})
