import { describe, expect, it } from 'vitest'
import { pickAllowPermissionOption } from '../../electron/shared/acpPermission'

describe('pickAllowPermissionOption', () => {
  it('picks CodeBuddy allow option (optionId allow, not allow_once)', () => {
    const options = [
      { kind: 'allow_always', name: 'Always Allow', optionId: 'allow_always' },
      { kind: 'allow_once', name: 'Allow', optionId: 'allow' },
      { kind: 'reject_once', name: 'Reject', optionId: 'reject' },
    ]
    expect(pickAllowPermissionOption(options)).toBe('allow')
  })

  it('falls back to option_id snake_case', () => {
    expect(pickAllowPermissionOption([{ option_id: 'allow_once', kind: 'allow_once' }])).toBe('allow_once')
  })
})
