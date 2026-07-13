import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(fileURLToPath(import.meta.url))
const { resolveDefaultWorkspace, E2E_WORKSPACE_REL } = require(
  '../../scripts/lib/default-workspace.mjs',
) as {
  resolveDefaultWorkspace: (envVar?: string) => string
  E2E_WORKSPACE_REL: string
}

/** Relative path from metamates-app root (gitignored at runtime). */
export { E2E_WORKSPACE_REL }

/** Isolated E2E vault — copied from inits/zh on first use; never the live template or MyM2. */
export function resolveE2EWorkspacePath(): string {
  return resolveDefaultWorkspace()
}
