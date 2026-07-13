#!/usr/bin/env node
/**
 * Green portable win-unpacked: require bundled plugin zips before electron-builder.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const zipDir = path.join(ROOT, 'build', 'plugin-zips')

const required = [
  'MetaMates-document-import-',
  'MetaMates-offline-speech-',
]

if (!fs.existsSync(zipDir)) {
  console.error('[portable-pack] Missing build/plugin-zips — run plugin:document-import:pack and plugin:offline-speech:pack first')
  process.exit(1)
}

const zips = fs.readdirSync(zipDir).filter((f) => f.endsWith('.zip'))
let ok = true
for (const prefix of required) {
  const match = zips.find((z) => z.startsWith(prefix))
  if (!match) {
    console.error(`[portable-pack] MISSING zip matching ${prefix}* in build/plugin-zips/`)
    ok = false
    continue
  }
  const mb = (fs.statSync(path.join(zipDir, match)).size / (1024 * 1024)).toFixed(1)
  console.log(`[portable-pack] OK ${match} (${mb} MB)`)
}

if (!ok) process.exit(1)
console.log('[portable-pack] Bundled plugin zips ready for green portable build')
