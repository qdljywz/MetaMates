import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  buildPermissionAllowResponse,
  pickAllowPermissionOption,
  pickRejectPermissionOption,
} from '../../electron/shared/acpPermission'
import { normalizeAcpModels, pickGeminiAutoModelId } from '../../electron/shared/acpModels'

const FIXTURES = path.join(__dirname, '../../fixtures/acp')

function loadFixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf-8')) as T
}

describe('ACP golden fixtures (AionUi parity)', () => {
  it('CodeBuddy permission: respond with optionId allow, never allow_once literal', () => {
    const fx = loadFixture<{
      options: unknown[]
      expectedAllowOptionId: string
    }>('codebuddy-permission-request.json')

    expect(pickAllowPermissionOption(fx.options)).toBe(fx.expectedAllowOptionId)

    const response = buildPermissionAllowResponse(42, fx.options)
    expect(response.result.outcome.optionId).toBe('allow')
    expect(response.result.outcome.outcome).toBe('selected')
    expect(response.id).toBe(42)
  })

  it('Claude permission: option_id snake_case from AionUi acpTypes', () => {
    const fx = loadFixture<{
      options: unknown[]
      expectedAllowOptionId: string
    }>('claude-permission-options.json')

    expect(pickAllowPermissionOption(fx.options)).toBe(fx.expectedAllowOptionId)
    expect(pickRejectPermissionOption(fx.options)).toBe('reject_once')
  })

  it('Gemini session/new: normalize availableModels + modelId', () => {
    const fx = loadFixture<{
      raw: unknown
      expectedModelIds: string[]
      expectedAutoModelId: string
    }>('gemini-session-new-models.json')

    const { models, currentModelId } = normalizeAcpModels(fx.raw)
    expect(models.map((m) => m.id)).toEqual(fx.expectedModelIds)
    expect(currentModelId).toBe('gemini-2.5-pro')
    expect(pickGeminiAutoModelId(models)).toBe(fx.expectedAutoModelId)
  })
})
