import path from 'path'
import { fileURLToPath } from 'url'
import { resolveE2EWorkspacePath } from './e2eWorkspace'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function resolveE2EWorkspace(): string {
  return resolveE2EWorkspacePath()
}

/** Shared launch options so every spec opens the same vault with E2E bootstrap. */
export function electronLaunchOptions(overrides: Record<string, unknown> = {}) {
  const { env: envOverride, ...rest } = overrides as { env?: NodeJS.ProcessEnv }
  return {
    args: ['.'],
    cwd: ROOT,
    timeout: 120_000,
    env: {
      ...process.env,
      METAMATES_E2E: '1',
      METAMATES_WORKSPACE: resolveE2EWorkspace(),
      NODE_ENV: 'development',
      ...envOverride,
    },
    ...rest,
  }
}
