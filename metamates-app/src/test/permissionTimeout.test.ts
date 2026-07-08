import { describe, expect, it } from 'vitest'
import { ACP_PERMISSION_TIMEOUT_MS } from '../../electron/shared/permissionTimeout'

describe('permissionTimeout', () => {
  it('matches AionUi PRD F-PERM-01 (30 minutes)', () => {
    expect(ACP_PERMISSION_TIMEOUT_MS).toBe(30 * 60 * 1000)
  })
})
