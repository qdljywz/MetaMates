#!/usr/bin/env node
/**
 * Verify P0 agent readiness mapping + optional Gemini OAuth file probe.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function isGeminiAuthenticated() {
  if (process.env.GEMINI_API_KEY?.trim()) return true
  if (process.env.GOOGLE_API_KEY?.trim()) return true
  const oauthPath = join(homedir(), '.gemini', 'oauth_creds.json')
  if (!existsSync(oauthPath)) return false
  try {
    const creds = JSON.parse(readFileSync(oauthPath, 'utf-8'))
    return Boolean(creds.refresh_token || creds.access_token)
  } catch {
    return false
  }
}

function mapStatus(snapshot) {
  if (!snapshot?.connected) return 'disconnected'
  if (snapshot.needsAuth) return 'auth_required'
  if (snapshot.ready) return 'connected'
  if (!snapshot.hasSession) return 'connecting'
  return 'auth_required'
}

let failed = 0
function ok(label) {
  console.log(`  ✓ ${label}`)
}
function fail(label, detail = '') {
  failed += 1
  console.log(`  ✗ ${label}${detail ? `: ${detail}` : ''}`)
}

console.log('=== Agent readiness (P0) ===\n')

if (mapStatus({ connected: false, hasSession: false, ready: false, needsAuth: false }) !== 'disconnected') {
  fail('disconnected mapping')
} else ok('disconnected mapping')

if (mapStatus({ connected: true, hasSession: true, ready: true, needsAuth: false }) !== 'connected') {
  fail('connected mapping')
} else ok('connected mapping')

if (mapStatus({ connected: true, hasSession: true, ready: false, needsAuth: true }) !== 'auth_required') {
  fail('auth_required mapping')
} else ok('auth_required mapping')

const geminiAuth = isGeminiAuthenticated()
console.log(`\nGemini credentials on this machine: ${geminiAuth ? 'present' : 'missing'}`)
console.log('(UI should show orange dot for Gemini when missing, even if ACP session exists)\n')

if (failed > 0) {
  console.error(`FAILED: ${failed} check(s)`)
  process.exit(1)
}
console.log('All P0 readiness checks passed.')
