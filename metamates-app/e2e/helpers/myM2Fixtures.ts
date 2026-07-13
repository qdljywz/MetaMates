import fs from 'fs'
import path from 'path'
import { WORKSPACE_LAYOUT } from '../../src/constants/paths'
import { resolveE2EWorkspacePath } from './launchElectron'

/** Dedicated sandbox under the E2E vault — tests only touch files here. */

/**
 * Default E2E workspace: e2e/.workspace/vault (seeded from inits/zh), or METAMATES_WORKSPACE override.
 * Never uses the developer's private vault or mutates inits/zh directly.
 */
export const E2E_SANDBOX_DIR_NAME = '_MetaMates_E2E'

export const E2E_NOTE_PREFIX = 'e2e-note-'

export const E2E_LINK_SEED_FILE = 'e2e-link-seed.md'

export const E2E_LINK_TARGET_FILE = 'e2e-link-target.md'

export const E2E_DRAG_SUB_DIR = 'e2e-drag-sub'

export const E2E_DRAG_ITEM_FILE = 'e2e-drag-item.md'

/**
 * Default E2E workspace: e2e/.workspace/vault (seeded from inits/zh), or METAMATES_WORKSPACE override.
 * Never uses the developer's private vault or mutates inits/zh directly.
 */
export function getE2EWorkspace(): string {
  return resolveE2EWorkspacePath()
}

/** Ensure `02_项目与知识/_MetaMates_E2E` exists; returns absolute sandbox path. */
export function ensureE2ESandbox(workspace = getE2EWorkspace()): string {
  const sandbox = path.join(workspace, WORKSPACE_LAYOUT.zh.PROJECTS, E2E_SANDBOX_DIR_NAME)
  fs.mkdirSync(sandbox, { recursive: true })
  return sandbox
}

/** Small seed note for editor/link tests (created once, kept across runs). */
export function ensureE2ELinkSeed(workspace = getE2EWorkspace()): string {
  const sandbox = ensureE2ESandbox(workspace)
  const seedPath = path.join(sandbox, E2E_LINK_SEED_FILE)
  if (!fs.existsSync(seedPath)) {
    fs.writeFileSync(seedPath, '# E2E link seed\n\nAutomated test fixture — safe to ignore.\n', 'utf8')
  }
  return seedPath
}

/** Remove only a single file the test created (never the vault or folders). */
export function removeE2EFile(filePath: string): void {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch {
    // best-effort cleanup
  }
}

export function buildE2ENotePath(workspace: string, noteName: string): string {
  return path.join(ensureE2ESandbox(workspace), `${noteName}.md`)
}

export function ensureE2ELinkTarget(workspace = getE2EWorkspace()): string {
  const sandbox = ensureE2ESandbox(workspace)
  const targetPath = path.join(sandbox, E2E_LINK_TARGET_FILE)
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, '# E2E link target\n\nNavigated via wiki link in preview.\n', 'utf8')
  }
  return targetPath
}
