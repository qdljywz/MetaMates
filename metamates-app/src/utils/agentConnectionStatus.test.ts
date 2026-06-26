import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_MODE,
  isAutoApproveMode,
  mapBackendSnapshotToStatus,
  normalizeAgentMode,
} from './agentConnectionStatus'

describe('agent mode defaults', () => {
  it('defaults to yolo for missing or legacy default mode', () => {
    expect(DEFAULT_AGENT_MODE).toBe('yolo')
    expect(normalizeAgentMode()).toBe('yolo')
    expect(normalizeAgentMode('default')).toBe('yolo')
    expect(normalizeAgentMode('plan')).toBe('plan')
  })

  it('treats yolo and bypassPermissions as auto-approve', () => {
    expect(isAutoApproveMode('yolo')).toBe(true)
    expect(isAutoApproveMode('bypassPermissions')).toBe(true)
    expect(isAutoApproveMode('default')).toBe(true)
    expect(isAutoApproveMode('plan')).toBe(false)
  })
})

describe('mapBackendSnapshotToStatus', () => {
  it('returns disconnected when process is not running', () => {
    expect(mapBackendSnapshotToStatus({ connected: false, hasSession: false })).toBe('disconnected')
    expect(mapBackendSnapshotToStatus(null)).toBe('disconnected')
  })

  it('returns connected only when backend reports ready', () => {
    expect(mapBackendSnapshotToStatus({ connected: true, hasSession: true, ready: true })).toBe('connected')
  })

  it('returns auth_required when OAuth/API key is missing', () => {
    expect(mapBackendSnapshotToStatus({
      connected: true,
      hasSession: true,
      ready: false,
      needsAuth: true,
    })).toBe('auth_required')
  })

  it('returns connecting when session exists but is not ready yet', () => {
    expect(mapBackendSnapshotToStatus({
      connected: true,
      hasSession: true,
      ready: false,
      needsAuth: false,
    })).toBe('connecting')
  })

  it('returns error when cloud API is unreachable despite local session', () => {
    expect(mapBackendSnapshotToStatus({
      connected: true,
      hasSession: true,
      ready: false,
      needsAuth: false,
      cloudReachable: false,
      lifecycle: 'error',
      error: '无法连接云端 API（请检查外网、代理或防火墙）',
    })).toBe('error')
  })
})
