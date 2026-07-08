/**
 * Reject ACP tool permissions that target paths outside the MetaMates vault.
 */

import { resolveToolFilePathFromUpdate } from './sessionUpdatePipeline'
import { sanitizeAcpToolUpdate, type ToolCallUpdatePayload } from './acpToolCallOutput'
import { isPathInsideWorkspace } from './pathSafety'

/** CLI-only caches — user content must stay in the vault. */
export const FORBIDDEN_EXTERNAL_SHELL_PATTERNS: RegExp[] = [
  /~[\\/]\.codebuddy/i,
  /\.codebuddy[\\/]+projects/i,
  /AppData[\\/]Roaming[\\/]\.codebuddy/i,
  /AppData[\\/]Local[\\/]\.codebuddy/i,
  /[\\/](Users|home)[\\/][^\\/\s"']+[\\/]\.codebuddy/i,
]

export interface VaultPermissionAssessment {
  allowed: boolean
  reason?: string
  blockedPaths?: string[]
}

function extractShellCommand(rawInput: unknown): string {
  if (typeof rawInput === 'string') return rawInput
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return ''
  const obj = rawInput as Record<string, unknown>
  for (const key of ['command', 'cmd', 'script', 'input', 'text']) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v
  }
  return JSON.stringify(rawInput)
}

function isExecuteLikeTool(toolCall: Record<string, unknown>): boolean {
  const kind = String(toolCall.kind ?? '').toLowerCase()
  const title = String(toolCall.title ?? toolCall.name ?? '').toLowerCase()
  if (kind === 'execute' || kind === 'shell' || kind === 'bash') return true
  return /\b(run|exec|shell|bash|terminal|command|powershell|cmd)\b/.test(title)
}

function matchesForbiddenShellPattern(command: string): boolean {
  if (!command.trim()) return false
  return FORBIDDEN_EXTERNAL_SHELL_PATTERNS.some((pattern) => pattern.test(command))
}

/**
 * Assess whether a permission request should be auto-rejected (vault boundary).
 */
export function assessVaultPermission(
  workspacePath: string,
  toolCall: Record<string, unknown> | undefined,
): VaultPermissionAssessment {
  if (!toolCall || !workspacePath?.trim()) {
    return { allowed: true }
  }

  const blockedPaths: string[] = []
  const filePath = resolveToolFilePathFromUpdate(
    sanitizeAcpToolUpdate(toolCall as ToolCallUpdatePayload),
  )

  if (filePath?.trim()) {
    if (!isPathInsideWorkspace(workspacePath, filePath.trim())) {
      blockedPaths.push(filePath.trim())
    }
  }

  if (isExecuteLikeTool(toolCall)) {
    const command = extractShellCommand(toolCall.rawInput ?? toolCall.raw_input)
    if (matchesForbiddenShellPattern(command)) {
      return {
        allowed: false,
        reason: 'Shell command targets CLI cache outside the vault',
        blockedPaths: blockedPaths.length ? blockedPaths : [command.slice(0, 120)],
      }
    }
  }

  if (blockedPaths.length > 0) {
    return {
      allowed: false,
      reason: 'Path is outside workspace',
      blockedPaths,
    }
  }

  return { allowed: true }
}
