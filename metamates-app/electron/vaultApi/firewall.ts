import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const RULE_NAME = 'Metamates Vault API'

async function ruleExists(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('netsh', [
      'advfirewall',
      'firewall',
      'show',
      'rule',
      `name=${RULE_NAME}`,
    ])
    return stdout.includes(RULE_NAME)
  } catch {
    return false
  }
}

/** Best-effort inbound allow rule for Vault API on Windows. May require admin. */
export async function ensureWindowsFirewallRule(
  port: number
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (process.platform !== 'win32') {
    return { ok: true, skipped: true }
  }

  try {
    if (await ruleExists()) {
      return { ok: true }
    }

    await execFileAsync('netsh', [
      'advfirewall',
      'firewall',
      'add',
      'rule',
      `name=${RULE_NAME}`,
      'dir=in',
      'action=allow',
      'protocol=TCP',
      `localport=${port}`,
      'profile=private',
    ])
    return { ok: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[VaultAPI] Failed to add firewall rule:', message)
    return { ok: false, error: message }
  }
}
