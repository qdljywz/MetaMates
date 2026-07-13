#!/usr/bin/env node
/** Ensure e2e/.workspace/vault exists (copy from inits/zh). Pass --reset to re-seed. */
import { resolveDefaultWorkspace, getE2EWorkspaceDir } from './lib/default-workspace.mjs'

if (process.argv.includes('--reset')) {
  process.env.METAMATES_E2E_RESET_WORKSPACE = '1'
}

const workspace = resolveDefaultWorkspace()
console.log(`[e2e-workspace] ready: ${workspace}`)
console.log(`[e2e-workspace] relative: ${getE2EWorkspaceDir().replace(/\\/g, '/').split('/metamates-app/').pop() || 'e2e/.workspace/vault'}`)
