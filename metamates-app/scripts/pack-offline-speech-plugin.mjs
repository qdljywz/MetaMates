#!/usr/bin/env node
/**
 * Pack offline-speech plugin for GitHub Releases.
 * Output: release/MetaMates-offline-speech-<version>-win-x64.zip
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_DIR = path.join(ROOT, 'plugins', 'offline-speech')
const MODEL_DIR = path.join(PLUGIN_DIR, 'models', 'whisper-tiny')
const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'manifest.json'), 'utf-8'))
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
const version = manifest.version || pkg.version || '0.1.0'

if (!fs.existsSync(path.join(PLUGIN_DIR, 'package.json'))) {
  console.error('[plugin-pack] Missing plugins/offline-speech/package.json')
  process.exit(1)
}

if (!fs.existsSync(path.join(MODEL_DIR, 'config.json'))) {
  console.error('[plugin-pack] Whisper model missing — run: npm run whisper:download-model')
  process.exit(1)
}

console.log('[plugin-pack] npm install in plugins/offline-speech …')
const install = spawnSync('npm', ['install', '--omit=dev'], {
  cwd: PLUGIN_DIR,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (install.status !== 0) process.exit(install.status ?? 1)

const staging = path.join(ROOT, 'release', `.plugin-staging-${Date.now()}`)
const bundleRoot = path.join(staging, 'offline-speech')
fs.mkdirSync(bundleRoot, { recursive: true })

for (const name of ['manifest.json', 'package.json', 'package-lock.json', 'transcribe.cjs']) {
  const src = path.join(PLUGIN_DIR, name)
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(bundleRoot, name))
}

function shouldSkipEntry(entry, from) {
  if (entry.isSymbolicLink?.()) return true
  if (entry.isJunction?.()) return true
  if (path.basename(from) === 'metamates-app') return true
  try {
    if (fs.lstatSync(from).isSymbolicLink()) return true
  } catch {
    return true
  }
  return false
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (shouldSkipEntry(entry, from)) continue
    if (entry.isDirectory()) {
      copyDir(from, to)
    } else {
      fs.copyFileSync(from, to)
    }
  }
}

copyDir(path.join(PLUGIN_DIR, 'node_modules'), path.join(bundleRoot, 'node_modules'))
copyDir(path.join(PLUGIN_DIR, 'models'), path.join(bundleRoot, 'models'))

const releaseDir = path.join(ROOT, 'release')
const buildZipDir = path.join(ROOT, 'build', 'plugin-zips')
fs.mkdirSync(releaseDir, { recursive: true })
fs.mkdirSync(buildZipDir, { recursive: true })
const zipName = `MetaMates-offline-speech-${version}-win-x64.zip`
const zipPath = path.join(releaseDir, zipName)
const buildZipPath = path.join(buildZipDir, zipName)

function assertBundleLayout() {
  const required = ['manifest.json', 'transcribe.cjs', 'node_modules', path.join('models', 'whisper-tiny', 'config.json')]
  for (const name of required) {
    const p = path.join(bundleRoot, name)
    if (!fs.existsSync(p)) {
      console.error(`[plugin-pack] Missing in bundle: ${name}`)
      process.exit(1)
    }
  }
}

assertBundleLayout()

if (process.platform === 'win32') {
  const ps = `Compress-Archive -Path '${bundleRoot.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`
  const zip = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
  if (zip.status !== 0) {
    console.error(zip.stderr || zip.stdout)
    process.exit(1)
  }
} else {
  const zip = spawnSync('zip', ['-r', zipPath, 'offline-speech'], { cwd: staging, encoding: 'utf8' })
  if (zip.status !== 0) {
    console.error(zip.stderr || zip.stdout)
    process.exit(1)
  }
}

fs.copyFileSync(zipPath, buildZipPath)

fs.rmSync(staging, { recursive: true, force: true })
const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)
console.log(`[plugin-pack] OK — ${zipPath} (${mb} MB)`)
