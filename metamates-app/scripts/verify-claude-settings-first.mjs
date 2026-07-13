#!/usr/bin/env node
/**
 * Smoke test: Claude runtime follows ~/.claude/settings.json (no MetaMates override).
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

const distRoot = join(process.cwd(), 'dist-electron')
if (!existsSync(join(distRoot, 'agentCliConfig.cjs'))) {
  console.error('Run npm run electron:compile first')
  process.exit(1)
}

const { resolveAgentRuntime } = require(join(distRoot, 'agentCliConfig.cjs'))
const { readClaudeSettingsEnv } = require(join(distRoot, 'claudeAuth.cjs'))

const settingsPath = join(homedir(), '.claude', 'settings.json')
const settingsFileEnv = readClaudeSettingsEnv()
const runtime = resolveAgentRuntime('claude')

const report = {
  settingsPath,
  settingsExists: existsSync(settingsPath),
  settingsFileEnvKeys: Object.keys(settingsFileEnv),
  runtime: {
    source: runtime.source,
    effectiveModel: runtime.display.effectiveModel,
    effectiveBaseUrl: runtime.display.effectiveBaseUrl,
    authOk: runtime.display.authOk,
    canSwitchModel: runtime.capabilities.canSwitchModel,
    skipSessionResume: runtime.capabilities.skipSessionResume,
    provenanceModel: runtime.display.provenanceModel,
  },
}

console.log(JSON.stringify(report, null, 2))

let failed = false

if (settingsFileEnv.ANTHROPIC_MODEL) {
  if (runtime.display.effectiveModel !== settingsFileEnv.ANTHROPIC_MODEL.trim()) {
    console.error(`FAIL: effectiveModel ${runtime.display.effectiveModel} !== settings ${settingsFileEnv.ANTHROPIC_MODEL}`)
    failed = true
  }
  if (runtime.capabilities.canSwitchModel) {
    console.error('FAIL: canSwitchModel should be false when ANTHROPIC_MODEL is in settings.json')
    failed = true
  }
}

if (settingsFileEnv.ANTHROPIC_BASE_URL || settingsFileEnv.ANTHROPIC_AUTH_TOKEN || settingsFileEnv.ANTHROPIC_API_KEY) {
  if (!runtime.capabilities.skipSessionResume) {
    console.error('FAIL: skipSessionResume should be true for proxy/credential settings.json setups')
    failed = true
  }
}

if (Object.keys(settingsFileEnv).length > 0 && runtime.spawnEnv) {
  for (const key of ['ANTHROPIC_MODEL', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY']) {
    const expected = settingsFileEnv[key]
    if (expected && runtime.spawnEnv[key] !== expected.trim()) {
      console.error(`FAIL: spawnEnv.${key} mismatch`)
      failed = true
    }
  }
}

if (failed) {
  process.exit(1)
}

console.log('verify-claude-settings-first: OK')
