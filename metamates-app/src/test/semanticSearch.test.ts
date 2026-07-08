import { describe, it, expect, beforeEach } from 'vitest'
import { tokenize, SemanticSearchEngine } from '../services/semanticSearch'

describe('semanticSearch', () => {
  describe('tokenize', () => {
    it('tokenizes English words', () => {
      const tokens = tokenize('Hello world testing')
      expect(tokens).toContain('hello')
      expect(tokens).toContain('world')
      expect(tokens).toContain('testing')
    })

    it('tokenizes Chinese text with bigrams', () => {
      const tokens = tokenize('知识管理笔记')
      expect(tokens).toContain('知识管理笔记')
      expect(tokens.some((t) => t.length === 2)).toBe(true)
    })

    it('filters English stop words', () => {
      const tokens = tokenize('the and is')
      expect(tokens).not.toContain('the')
      expect(tokens).not.toContain('and')
    })
  })

  describe('SemanticSearchEngine', () => {
    let engine: SemanticSearchEngine

    beforeEach(() => {
      engine = new SemanticSearchEngine()
    })

    it('ranks relevant documents higher', () => {
      engine.build([
        { id: 'a', text: 'project management agile scrum' },
        { id: 'b', text: 'cooking recipes pasta sauce' },
        { id: 'c', text: 'agile methodology team collaboration' },
      ])

      const results = engine.search('agile project', 5)
      expect(results.length).toBeGreaterThan(0)
      expect(['a', 'c']).toContain(results[0].id)
    })

    it('returns empty for empty query tokens', () => {
      engine.build([{ id: 'a', text: 'hello world' }])
      expect(engine.search('')).toEqual([])
    })

    it('clears index on rebuild', () => {
      engine.build([{ id: 'a', text: 'hello' }])
      engine.build([])
      expect(engine.getDocumentCount()).toBe(0)
    })
  })
})
