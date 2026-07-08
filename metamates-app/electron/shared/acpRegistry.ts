/**
 * Canonical ACP CLI definitions for MetaMates (personal edition).
 * Electron spawn + renderer install/detection should stay aligned with this file.
 */

export const CODEX_ACP_BRIDGE_VERSION = '0.9.5'
export const CODEX_ACP_NPX_PACKAGE = `@zed-industries/codex-acp@${CODEX_ACP_BRIDGE_VERSION}`
export const CLAUDE_ACP_NPX_PACKAGE = '@zed-industries/claude-agent-acp'
export const CODEBUDDY_ACP_NPX_PACKAGE = '@tencent-ai/codebuddy-code'

export interface AcpCliDefinition {
  cmd: string
  /** Override command used for PATH detection (e.g. qoder → qodercli) */
  detectCmd?: string
  /** Other binary names that satisfy detection */
  detectAlternates?: string[]
  args: string[]
  name: string
  backendId: string
  /** When cmd is on PATH, spawn via npx bridge (Claude) */
  useNpx?: string
  /** Always spawn via this path when detected (e.g. codex → npx codex-acp) */
  spawnCliPath?: string
  /** Included in personal runtime detection */
  detectByDefault?: boolean
  npmPackage?: string
  extraNpmPackages?: string[]
  /** Global npm packages that count as installed even when binary not on PATH */
  detectNpmPackages?: string[]
  description?: string
  isDefault?: boolean
  installUrl?: string
}

/** CLIs MetaMates spawns via ACP — aligned with AionUi ACP_BACKENDS_ALL. */
export const POTENTIAL_ACP_CLIS: AcpCliDefinition[] = [
  {
    cmd: 'gemini',
    args: ['--acp'],
    name: 'Gemini CLI',
    backendId: 'gemini',
    detectByDefault: true,
    npmPackage: '@google/gemini-cli',
    detectNpmPackages: ['@google/gemini-cli'],
    description: 'Google Gemini CLI agent (ACP)',
    isDefault: true,
    installUrl: 'https://github.com/google-gemini/gemini-cli',
  },
  {
    cmd: 'codebuddy',
    args: ['--acp'],
    name: 'CodeBuddy',
    backendId: 'codebuddy',
    spawnCliPath: `npx ${CODEBUDDY_ACP_NPX_PACKAGE}`,
    detectByDefault: true,
    npmPackage: CODEBUDDY_ACP_NPX_PACKAGE,
    detectNpmPackages: [CODEBUDDY_ACP_NPX_PACKAGE],
    description: 'Tencent CodeBuddy CLI agent',
    isDefault: true,
    installUrl: 'https://www.codebuddy.ai',
  },
  {
    cmd: 'claude',
    args: [],
    name: 'Claude Code',
    backendId: 'claude',
    useNpx: CLAUDE_ACP_NPX_PACKAGE,
    detectByDefault: true,
    npmPackage: '@anthropic-ai/claude-code',
    extraNpmPackages: [CLAUDE_ACP_NPX_PACKAGE],
    detectNpmPackages: ['@anthropic-ai/claude-code', CLAUDE_ACP_NPX_PACKAGE],
    description: 'Anthropic Claude CLI agent (via claude-agent-acp)',
    installUrl: 'https://github.com/anthropics/claude-code',
  },
  {
    cmd: 'qwen',
    args: ['--acp'],
    name: 'Qwen Code',
    backendId: 'qwen',
    detectByDefault: true,
    npmPackage: '@qwen-code/qwen-code',
    detectNpmPackages: ['@qwen-code/qwen-code'],
    description: 'Alibaba Qwen CLI agent',
    installUrl: 'https://github.com/QwenLM/qwen-code',
  },
  {
    cmd: 'codex',
    args: [],
    name: 'Codex',
    backendId: 'codex',
    spawnCliPath: `npx ${CODEX_ACP_NPX_PACKAGE}`,
    detectByDefault: true,
    npmPackage: '@openai/codex',
    extraNpmPackages: [CODEX_ACP_NPX_PACKAGE],
    detectNpmPackages: ['@openai/codex', CODEX_ACP_NPX_PACKAGE],
    description: 'OpenAI Codex via codex-acp bridge',
    installUrl: 'https://github.com/openai/codex',
  },
  {
    cmd: 'iflow',
    args: ['--experimental-acp'],
    name: 'iFlow CLI',
    backendId: 'iflow',
    detectByDefault: true,
    description: 'iFlow CLI agent',
  },
  {
    cmd: 'goose',
    args: ['acp'],
    name: 'Goose',
    backendId: 'goose',
    detectByDefault: true,
    description: "Block's Goose CLI agent",
    installUrl: 'https://github.com/block/goose',
  },
  {
    cmd: 'auggie',
    args: ['--acp'],
    name: 'Augment Code',
    backendId: 'auggie',
    detectByDefault: true,
    description: 'Augment Code CLI agent',
    installUrl: 'https://github.com/augment-code/auggie',
  },
  {
    cmd: 'kimi',
    args: ['acp'],
    name: 'Kimi CLI',
    backendId: 'kimi',
    detectByDefault: true,
    description: 'Moonshot Kimi CLI agent',
    installUrl: 'https://github.com/moonshot-ai/kimi',
  },
  {
    cmd: 'opencode',
    args: ['acp'],
    name: 'OpenCode',
    backendId: 'opencode',
    detectByDefault: true,
    description: 'OpenCode CLI agent',
    installUrl: 'https://github.com/opencode-ai/opencode',
  },
  {
    cmd: 'droid',
    args: ['exec', '--output-format', 'acp'],
    name: 'Factory Droid',
    backendId: 'droid',
    detectByDefault: true,
    description: 'Factory Droid CLI agent',
    installUrl: 'https://factory.ai',
  },
  {
    cmd: 'copilot',
    args: ['--acp', '--stdio'],
    name: 'GitHub Copilot',
    backendId: 'copilot',
    detectByDefault: true,
    description: 'GitHub Copilot CLI agent',
    installUrl: 'https://github.com/features/copilot',
  },
  {
    cmd: 'qodercli',
    detectCmd: 'qodercli',
    args: ['--acp'],
    name: 'Qoder CLI',
    backendId: 'qoder',
    detectByDefault: true,
    description: 'Qoder CLI agent',
  },
  {
    cmd: 'vibe-acp',
    args: [],
    name: 'Mistral Vibe',
    backendId: 'vibe',
    detectByDefault: true,
    description: 'Mistral Vibe CLI agent',
  },
  {
    cmd: 'nanobot',
    args: ['--experimental-acp'],
    name: 'Nano Bot',
    backendId: 'nanobot',
    detectByDefault: true,
    description: 'Nano Bot CLI agent',
  },
  {
    cmd: 'agent',
    args: ['acp'],
    name: 'Cursor Agent',
    backendId: 'cursor',
    detectByDefault: true,
    description: 'Cursor AI Agent CLI (command name: agent)',
    installUrl: 'https://cursor.com',
  },
]

export const LOGO_COLORS: Record<string, string> = {
  gemini: '#4285f4',
  codebuddy: '#00d4aa',
  claude: '#d97706',
  qwen: '#8b5cf6',
  codex: '#10a37f',
  iflow: '#6366f1',
  goose: '#f59e0b',
  auggie: '#3b82f6',
  kimi: '#ec4899',
  opencode: '#14b8a6',
  droid: '#64748b',
  copilot: '#24292f',
  qoder: '#7c3aed',
  vibe: '#f97316',
  nanobot: '#22c55e',
  cursor: '#0ea5e9',
  ollama: '#111827',
}

export function getDetectionCommand(def: AcpCliDefinition): string {
  return def.detectCmd || def.cmd
}

export function getDetectionCommands(def: AcpCliDefinition): string[] {
  const primary = getDetectionCommand(def)
  const alternates = def.detectAlternates || []
  return [...new Set([primary, def.cmd, ...alternates])]
}

export function getDetectNpmPackages(def: AcpCliDefinition): string[] {
  const pkgs = new Set<string>()
  if (def.npmPackage) pkgs.add(def.npmPackage)
  if (def.extraNpmPackages) def.extraNpmPackages.forEach((p) => pkgs.add(p))
  if (def.detectNpmPackages) def.detectNpmPackages.forEach((p) => pkgs.add(p))
  if (def.useNpx) pkgs.add(def.useNpx)
  if (def.spawnCliPath?.startsWith('npx ')) {
    const pkg = def.spawnCliPath.slice(4).trim().split(/\s+/)[0]
    if (pkg) pkgs.add(pkg)
  }
  return [...pkgs]
}

export function getAcpArgsForBackend(backendId: string): string[] {
  const def = POTENTIAL_ACP_CLIS.find((c) => c.backendId === backendId)
  return def?.args ?? ['--acp']
}

export const PERSONAL_RUNTIME_BACKENDS = POTENTIAL_ACP_CLIS
  .filter((c) => c.detectByDefault)
  .map((c) => c.backendId)

export function getRegistryCli(backendId: string): AcpCliDefinition | undefined {
  return POTENTIAL_ACP_CLIS.find((c) => c.backendId === backendId)
}

/** Resolve cliPath + acpArgs for ACP spawn from registry definition. */
export function resolveSpawnConfig(
  def: AcpCliDefinition,
  detectMethod?: 'path' | 'npm-global' | 'npx-package',
): { cliPath: string; acpArgs: string[] } {
  const isWindows = process.platform === 'win32'
  const acpArgs = def.args ?? []

  const mustUseSpawnPath = def.backendId === 'codex'
  const preferDirect = detectMethod === 'path' && !mustUseSpawnPath
  // claude on PATH is the interactive CLI — ACP always needs the npx bridge package.
  const needsNpxBridge = def.useNpx && (def.backendId === 'claude' || !preferDirect)

  if (needsNpxBridge) {
    const npx = isWindows ? 'npx.cmd' : 'npx'
    return { cliPath: npx, acpArgs: ['--yes', def.useNpx!, ...acpArgs] }
  }

  // Codex must use npx bridge; other CLIs prefer local binary when on PATH (keeps login).

  if (def.spawnCliPath && !preferDirect) {
    const path = def.spawnCliPath.trim()
    if (path.startsWith('npx ')) {
      const npx = isWindows ? 'npx.cmd' : 'npx'
      const parts = path.split(/\s+/).filter(Boolean)
      return { cliPath: npx, acpArgs: ['--yes', ...parts.slice(1), ...acpArgs] }
    }
    return { cliPath: path, acpArgs }
  }

  return { cliPath: def.cmd, acpArgs }
}

/** npm install -g commands aligned with spawn/detection rules. */
export function getInstallCommandsForBackend(backendId: string): string[] {
  const def = getRegistryCli(backendId)
  if (!def) return []
  const commands: string[] = []
  if (def.npmPackage) commands.push(`npm install -g ${def.npmPackage}`)
  if (def.extraNpmPackages) {
    for (const pkg of def.extraNpmPackages) {
      if (!commands.some((c) => c.includes(pkg))) {
        commands.push(`npm install -g ${pkg}`)
      }
    }
  }
  return commands
}

export function getUninstallPackageForBackend(backendId: string): string | undefined {
  return getRegistryCli(backendId)?.npmPackage
}
