#!/usr/bin/env node
/**
 * Post-pack guard: renderer deps must not appear in app.asar (they live in dist/).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

const asarCandidates = [
  path.join(ROOT, 'release', 'win-unpacked', 'resources', 'app.asar'),
  path.join(ROOT, 'release', 'mac', 'MetaMates.app', 'Contents', 'Resources', 'app.asar'),
  path.join(ROOT, 'release', 'linux-unpacked', 'resources', 'app.asar'),
]

const asarPath = asarCandidates.find((p) => fs.existsSync(p))
if (!asarPath) {
  console.warn('[pack-asar] No app.asar found — skip (run electron:build first)')
  process.exit(0)
}

const { listPackage } = require('@electron/asar')
const entries = listPackage(asarPath).map((e) => e.replace(/\\/g, '/'))

const forbiddenPrefixes = [
  'node_modules/antd/',
  'node_modules/react/',
  'node_modules/react-dom/',
  'node_modules/three/',
  'node_modules/@ant-design/',
  'node_modules/codemirror/',
  'node_modules/@codemirror/',
]

const hits = forbiddenPrefixes.flatMap((prefix) => {
  const match = entries.find((e) => e.startsWith(prefix))
  return match ? [match] : []
})

if (hits.length > 0) {
  console.error('[pack-asar] Renderer deps leaked into app.asar:')
  for (const h of hits) console.error(`  - ${h}`)
  process.exit(1)
}

const nmEntries = entries.filter((e) => e.startsWith('node_modules/') && !e.slice('node_modules/'.length).includes('/'))
const nmRoots = [...new Set(entries.filter((e) => e.startsWith('node_modules/')).map((e) => e.split('/')[1]))]

const asarBytes = fs.statSync(asarPath).size
console.log(`[pack-asar] OK — app.asar ${(asarBytes / 1024 / 1024).toFixed(1)} MB, node_modules roots: ${nmRoots.sort().join(', ') || '(none)'}`)
