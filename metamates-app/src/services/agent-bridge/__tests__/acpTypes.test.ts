import { describe, it, expect } from 'vitest'
import { ACP_BACKENDS, getPotentialAcpClis } from '../acpTypes'
import { getAcpArgsForBackend, PERSONAL_RUNTIME_BACKENDS, POTENTIAL_ACP_CLIS } from '@acp-registry'

describe('acpTypes', () => {
  describe('ACP_BACKENDS', () => {
    it('should align personal runtime backends with electron registry', () => {
      for (const backendId of PERSONAL_RUNTIME_BACKENDS) {
        const config = ACP_BACKENDS[backendId as keyof typeof ACP_BACKENDS]
        expect(config).toBeDefined()
        expect(config.enabled).toBe(true)
        expect(config.acpArgs).toEqual(getAcpArgsForBackend(backendId))
      }
    })

    it('should include all detectable CLIs from registry', () => {
      const detectable = POTENTIAL_ACP_CLIS.filter((d) => d.detectByDefault)
      expect(PERSONAL_RUNTIME_BACKENDS.length).toBe(detectable.length)
      expect(detectable.length).toBeGreaterThanOrEqual(15)
    })
  })

  describe('getPotentialAcpClis', () => {
    it('should include enabled CLI agents including gemini', () => {
      const clis = getPotentialAcpClis()
      expect(clis.find(c => c.backendId === 'gemini')).toBeDefined()
      expect(clis.find(c => c.backendId === 'claude')).toBeDefined()
      expect(clis.find(c => c.backendId === 'codex')).toBeDefined()
      expect(clis.find(c => c.backendId === 'custom')).toBeUndefined()
    })

    it('should use --acp for gemini and codebuddy', () => {
      const clis = getPotentialAcpClis()
      expect(clis.find(c => c.backendId === 'gemini')?.args).toContain('--acp')
      expect(clis.find(c => c.backendId === 'codebuddy')?.args).toContain('--acp')
    })

    it('should use acp subcommand for goose and opencode', () => {
      const clis = getPotentialAcpClis()
      expect(clis.find(c => c.backendId === 'goose')?.args).toEqual(['acp'])
      expect(clis.find(c => c.backendId === 'opencode')?.args).toEqual(['acp'])
    })
  })
})
