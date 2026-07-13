#!/usr/bin/env node
/**
 * End-to-end: fresh userData + install both plugin zips from release/ (no dev plugin discovery).
 */
import electron from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { removeTempPath } from './lib/remove-temp-path.mjs'

const require = createRequire(import.meta.url)
const { app } = electron
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
  const version = pkg.version || '0.1.0'
  for (const name of [
    `MetaMates-document-import-${version}-win-x64.zip`,
    `MetaMates-offline-speech-${version}-win-x64.zip`,
  ]) {
    const zip = path.join(ROOT, 'release', name)
    if (!fs.existsSync(zip)) {
      console.error(`[zip-install] Missing ${zip} — run plugin packs first`)
      process.exit(1)
    }
  }

  const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metamates-zip-install-'))
  const freshUserData = path.join(freshRoot, 'MetaMates')
  fs.mkdirSync(freshUserData, { recursive: true })
  process.env.METAMATES_APP_ROOT = ROOT
  process.env.METAMATES_APP_DATA_DIR = freshUserData
  process.env.METAMATES_E2E_NO_DEV_PLUGINS = '1'
  console.log('[zip-install] Fresh userData:', freshUserData)

  try {
    await app.whenReady()

    const pkgVersion = pkg.version || '0.1.0'
    const { runPluginZipInstallProbe } = require('./lib/plugin-zip-install-probe.cjs')
    await runPluginZipInstallProbe(pkgVersion)

    console.log('[zip-install] PASS')
  } finally {
    removeTempPath(freshRoot, { label: 'zip-install' })
    app.quit()
  }
}

main().catch((err) => {
  console.error('[zip-install] FAIL:', err.message || err)
  process.exit(1)
})
