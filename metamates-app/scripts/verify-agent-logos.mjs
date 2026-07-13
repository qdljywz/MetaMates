#!/usr/bin/env node
/**
 * Verify source SVGs in public/assets/ (dev + Vite public dir).
 * Packaged main-process resolution is covered by verify-agent-logo-resolution.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS_DIR = path.join(ROOT, 'public', 'assets')
const MONogram_MARKER = '<!-- metamates-monogram -->'
const BRANDED_AGENT_LOGO_IDS = ['gemini', 'claude', 'codebuddy', 'qwen', 'codex']

async function main() {
  const { POTENTIAL_ACP_CLIS } = await import(
    pathToFileURL(path.join(ROOT, 'electron/shared/acpRegistry.ts')).href
  )
  const runtimeIds = POTENTIAL_ACP_CLIS.filter((c) => c.detectByDefault).map((c) => c.backendId)
  runtimeIds.push('ollama')
  const branded = new Set(BRANDED_AGENT_LOGO_IDS)

  let failed = false

  for (const backendId of runtimeIds) {
    const filePath = path.join(ASSETS_DIR, `${backendId}.svg`)
    if (!fs.existsSync(filePath)) {
      console.error(`[agent-logos] MISSING ${backendId}.svg — run npm run logos:agents`)
      failed = true
      continue
    }
    const content = fs.readFileSync(filePath, 'utf8')
    if (content.length < 40) {
      console.error(`[agent-logos] EMPTY ${backendId}.svg`)
      failed = true
      continue
    }
    if (branded.has(backendId) && content.includes(MONogram_MARKER)) {
      console.error(`[agent-logos] ${backendId}.svg is monogram placeholder — sync branded SVG from src/assets/logos`)
      failed = true
      continue
    }
    console.log(`[agent-logos] OK ${backendId}.svg`)
  }

  if (failed) process.exit(1)
  console.log(`[agent-logos] All ${runtimeIds.length} runtime agent icons present`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
