/**
 * Default workspace for E2E and local verify scripts when METAMATES_WORKSPACE is unset.
 *
 * Uses an isolated vault under e2e/.workspace/vault (gitignored), seeded once from inits/zh.
 *
 * IMPORTANT:
 * - Never run tests against inits/zh directly — it is the bundled initializer/template.
 * - Never default to a developer's private vault (e.g. E:\MyM2).
 * - Set METAMATES_WORKSPACE to override; METAMATES_E2E_RESET_WORKSPACE=1 to re-copy from inits/zh.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Gitignored runtime copy — safe for tests to mutate under _MetaMates_E2E/. */
export const E2E_WORKSPACE_REL = 'e2e/.workspace/vault'

export function getE2EWorkspaceDir() {
  return path.join(APP_ROOT, ...E2E_WORKSPACE_REL.split('/'))
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function copyDir(src, dest) {
  ensureDir(dest)
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(from, to)
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to)
    }
  }
}

export function seedE2EWorkspaceFromInits(force = false) {
  const template = path.join(APP_ROOT, 'inits', 'zh')
  const workspace = getE2EWorkspaceDir()
  const stamp = path.join(workspace, '.metamates-e2e-vault-stamp')

  if (!fs.existsSync(template)) {
    throw new Error(`[e2e-workspace] Missing template: ${template}`)
  }

  if (force && fs.existsSync(workspace)) {
    fs.rmSync(workspace, { recursive: true, force: true })
  }

  if (!fs.existsSync(workspace)) {
    ensureDir(path.dirname(workspace))
    copyDir(template, workspace)
    fs.writeFileSync(
      stamp,
      `seeded-from: inits/zh\nat: ${new Date().toISOString()}\n`,
      'utf8',
    )
  }

  return workspace
}

export function resolveDefaultWorkspace(envVar = 'METAMATES_WORKSPACE') {
  const fromEnv = process.env[envVar]?.trim()
  if (fromEnv) return path.resolve(fromEnv)

  const reset = process.env.METAMATES_E2E_RESET_WORKSPACE === '1'
  return seedE2EWorkspaceFromInits(reset)
}

export function getAppRoot() {
  return APP_ROOT
}
