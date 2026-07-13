/**
 * Best-effort delete of a temp directory (Windows file locks after Electron exit).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function sleepMs(ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    /* spin */
  }
}

export function removeTempPath(target, { label = 'cleanup', retries = 5, retryDelayMs = 250 } = {}) {
  if (!target || !fs.existsSync(target)) return true
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      if (!fs.existsSync(target)) {
        console.log(`[${label}] removed ${target}`)
        return true
      }
    } catch (err) {
      if (attempt === retries) {
        console.warn(`[${label}] failed to remove ${target}: ${err?.message ?? err}`)
        return false
      }
      sleepMs(retryDelayMs)
    }
  }
  return false
}

/** Remove stale MetaMates / mm-e2e folders under the OS temp directory. */
export function removeStaleMetamatesTemp({ label = 'clean:temp' } = {}) {
  const tmp = os.tmpdir()
  let removed = 0
  let bytes = 0
  for (const ent of fs.readdirSync(tmp, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue
    if (!/^(metamates-|mm-e2e-)/.test(ent.name)) continue
    const full = path.join(tmp, ent.name)
    try {
      const size = dirSize(full)
      if (removeTempPath(full, { label })) {
        removed++
        bytes += size
      }
    } catch {
      // skip unreadable entries
    }
  }
  if (removed > 0) {
    console.log(`[${label}] removed ${removed} temp dir(s), ~${(bytes / 1024 / 1024).toFixed(1)} MB`)
  }
  return { removed, bytes }
}

function dirSize(root) {
  let total = 0
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    for (const ent of fs.readdirSync(current, { withFileTypes: true })) {
      const p = path.join(current, ent.name)
      if (ent.isDirectory()) stack.push(p)
      else {
        try {
          total += fs.statSync(p).size
        } catch {
          // ignore
        }
      }
    }
  }
  return total
}
