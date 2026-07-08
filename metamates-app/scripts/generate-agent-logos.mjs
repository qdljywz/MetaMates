#!/usr/bin/env node
/**
 * Ensure public/assets/{backendId}.svg exists for every runtime CLI.
 * - Syncs branded SVGs from src/assets/logos/
 * - Generates monogram placeholders for the rest (never overwrites branded files)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS_DIR = path.join(ROOT, 'public', 'assets')

const BRANDED_SYNC = [
  ['src/assets/logos/ai-major/gemini.svg', 'gemini.svg'],
  ['src/assets/logos/ai-major/claude.svg', 'claude.svg'],
  ['src/assets/logos/ai-major/qwen.svg', 'qwen.svg'],
  ['src/assets/logos/tools/coding/codebuddy.svg', 'codebuddy.svg'],
  ['src/assets/logos/tools/coding/codex.svg', 'codex.svg'],
]

const MONogram_MARKER = '<!-- metamates-monogram -->'

function writeMonogramSvg(backendId, name, color) {
  const letter = (name || backendId).charAt(0).toUpperCase()
  return `${MONogram_MARKER}
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="${name}">
  <circle cx="16" cy="16" r="16" fill="${color}"/>
  <text x="16" y="21" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="700" font-family="Segoe UI, system-ui, sans-serif">${letter}</text>
</svg>
`
}

function syncBranded() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true })
  for (const [relSrc, fileName] of BRANDED_SYNC) {
    const src = path.join(ROOT, relSrc)
    const dest = path.join(ASSETS_DIR, fileName)
    if (!fs.existsSync(src)) {
      console.warn(`[logos:agents] skip missing branded source: ${relSrc}`)
      continue
    }
    fs.copyFileSync(src, dest)
    console.log(`[logos:agents] synced ${fileName}`)
  }
}

async function ensureRuntimeIcons() {
  const mod = await import(pathToFileURL(path.join(ROOT, 'electron/shared/acpRegistry.ts')).href)
  const ids = mod.POTENTIAL_ACP_CLIS.filter((c) => c.detectByDefault).map((c) => c.backendId)
  ids.push('ollama')

  for (const backendId of ids) {
    const dest = path.join(ASSETS_DIR, `${backendId}.svg`)
    if (fs.existsSync(dest) && !fs.readFileSync(dest, 'utf8').includes(MONogram_MARKER)) {
      continue
    }
    const def = mod.POTENTIAL_ACP_CLIS.find((c) => c.backendId === backendId)
    const name = backendId === 'ollama' ? 'Ollama (Local)' : def?.name ?? backendId
    const color = mod.LOGO_COLORS[backendId] || '#6b7280'
    fs.writeFileSync(dest, writeMonogramSvg(backendId, name, color), 'utf8')
    console.log(`[logos:agents] generated monogram ${backendId}.svg`)
  }
}

syncBranded()
await ensureRuntimeIcons()
console.log('[logos:agents] OK')
