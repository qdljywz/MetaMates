#!/usr/bin/env node
/**
 * Generate Windows .ico and macOS .icns from build/icon.png (run before electron-builder).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(ROOT, 'build')
const sourcePng = path.join(buildDir, 'icon.png')
const logoPng = path.join(ROOT, 'logo.png')

if (!fs.existsSync(sourcePng) && fs.existsSync(logoPng)) {
  fs.copyFileSync(logoPng, sourcePng)
  console.log('[icons] Copied logo.png -> build/icon.png')
}

if (!fs.existsSync(sourcePng)) {
  console.error('[icons] Missing build/icon.png (or logo.png).')
  process.exit(1)
}

const hasIco = fs.existsSync(path.join(buildDir, 'icon.ico'))
const hasIcns = fs.existsSync(path.join(buildDir, 'icon.icns'))

if (hasIco && hasIcns) {
  console.log('[icons] icon.ico and icon.icns already present')
} else {
  console.log('[icons] Generating platform icons from build/icon.png …')
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['icon-gen', '-i', sourcePng, '-o', buildDir, '--ico', '--icns', '--ico-name', 'icon', '--icns-name', 'icon'],
    { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
  )

  if (result.status !== 0) {
    if (!fs.existsSync(path.join(buildDir, 'icon.ico'))) {
      console.error('[icons] Failed and build/icon.ico is missing.')
      process.exit(result.status ?? 1)
    }
    console.warn('[icons] icon-gen partial failure — continuing if icon.ico exists')
  }

  if (!fs.existsSync(path.join(buildDir, 'icon.icns'))) {
    console.warn('[icons] build/icon.icns missing — macOS build must run icons step on macOS or commit icon.icns')
  }
}

console.log('[icons] OK')
