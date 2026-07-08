/**
 * Default workspace for scripts / E2E when METAMATES_WORKSPACE is unset.
 * Uses bundled template inits/zh (portable, no author-specific paths).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function resolveDefaultWorkspace(envVar = 'METAMATES_WORKSPACE') {
  const fromEnv = process.env[envVar]?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(APP_ROOT, 'inits', 'zh')
}

export function getAppRoot() {
  return APP_ROOT
}
