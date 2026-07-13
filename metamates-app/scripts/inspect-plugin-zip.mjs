#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function inspectZip(label, zipPath) {
  const dest = path.join(os.tmpdir(), `zip-inspect-${Date.now()}`)
  fs.mkdirSync(dest, { recursive: true })
  const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
  console.log(`\n=== ${label} ===`)
  console.log('zip', zipPath, fs.statSync(zipPath).size)
  if (r.status !== 0) {
    console.log('expand failed', r.stderr || r.stdout)
    return
  }
  function walk(dir, prefix = '') {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) walk(path.join(dir, e.name), rel)
      else if (e.name === 'manifest.json') console.log('manifest at', rel)
    }
  }
  walk(dest)
  console.log('top-level', fs.readdirSync(dest))
  fs.rmSync(dest, { recursive: true, force: true })
}

inspectZip('build', path.join(ROOT, 'build/plugin-zips/MetaMates-document-import-0.1.0-win-x64.zip'))
inspectZip('release', path.join(ROOT, 'release/MetaMates-document-import-0.1.0-win-x64.zip'))
inspectZip('bundled', path.join(ROOT, 'release/portable-green/win-unpacked/resources/plugin-zips/MetaMates-document-import-0.1.0-win-x64.zip'))
