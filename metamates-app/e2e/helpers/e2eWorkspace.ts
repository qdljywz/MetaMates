/**
 * Isolated E2E vault helpers.
 * Playwright ≥1.61 loads these as ESM — do not createRequire() .mjs files (SyntaxError).
 */
import {
  resolveDefaultWorkspace,
  E2E_WORKSPACE_REL,
} from '../../scripts/lib/default-workspace.mjs'

/** Relative path from metamates-app root (gitignored at runtime). */
export { E2E_WORKSPACE_REL }

/** Isolated E2E vault — copied from inits/zh on first use; never the live template or MyM2. */
export function resolveE2EWorkspacePath(): string {
  return resolveDefaultWorkspace()
}
