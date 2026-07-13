#!/usr/bin/env node
/**
 * Verify agent logo resolution for dev AND packaged layouts.
 * Catches: wrong assets dir in main process, stale dist/assets after logos:agents, silent initial fallback.
 *
 * Requires: npm run build && npm run electron:compile && npm run logos:agents
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST_ASSETS = path.join(ROOT, 'dist', 'assets')
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets')

function requireCompiled() {
  const marker = path.join(ROOT, 'dist-electron', 'shared', 'agentLogos.cjs')
  if (!fs.existsSync(marker)) {
    console.error('[logo-resolution] Missing dist-electron — run npm run electron:compile')
    process.exit(1)
  }
}

async function loadModules() {
  const appPaths = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/shared/appPaths.cjs')).href
  )
  const agentLogos = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/shared/agentLogos.cjs')).href
  )
  const agentLogosDisk = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/shared/agentLogosDisk.cjs')).href
  )
  const { POTENTIAL_ACP_CLIS } = await import(
    pathToFileURL(path.join(ROOT, 'dist-electron/shared/acpRegistry.cjs')).href
  )
  return { appPaths, agentLogos, agentLogosDisk, POTENTIAL_ACP_CLIS }
}

function assertSvgOnDisk(label, dir, backendId) {
  const filePath = path.join(dir, `${backendId}.svg`)
  if (!fs.existsSync(filePath)) {
    console.error(`[logo-resolution] MISSING ${label}: ${backendId}.svg`)
    return false
  }
  const size = fs.statSync(filePath).size
  if (size < 40) {
    console.error(`[logo-resolution] EMPTY ${label}: ${backendId}.svg`)
    return false
  }
  return true
}

async function main() {
  requireCompiled()
  const { appPaths, agentLogos, agentLogosDisk, POTENTIAL_ACP_CLIS } = await loadModules()
  const { BRANDED_AGENT_LOGO_IDS, getRuntimeLogoBackendIds } = agentLogos
  const { resolveAgentLogoInfoFromDisk } = agentLogosDisk
  const runtimeIds =
    typeof getRuntimeLogoBackendIds === 'function'
      ? getRuntimeLogoBackendIds()
      : [
          ...POTENTIAL_ACP_CLIS.filter((c) => c.detectByDefault).map((c) => c.backendId),
          'ollama',
        ]

  let failed = false

  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.error('[logo-resolution] dist/index.html missing — run npm run build')
    process.exit(1)
  }

  for (const backendId of runtimeIds) {
    if (!assertSvgOnDisk('public/assets', PUBLIC_ASSETS, backendId)) failed = true
    if (!assertSvgOnDisk('dist/assets', DIST_ASSETS, backendId)) failed = true
  }

  // Dev main-process probe (public/assets)
  process.env.METAMATES_APP_ROOT = ROOT
  process.env.METAMATES_PACKAGED = '0'
  const devDir = appPaths.resolveAgentAssetsDir({ appRoot: ROOT, packaged: false })
  for (const backendId of BRANDED_AGENT_LOGO_IDS) {
    const info = resolveAgentLogoInfoFromDisk(backendId, devDir)
    if (info.type !== 'file') {
      console.error(`[logo-resolution] dev probe ${backendId}: expected type=file, got ${info.type}`)
      failed = true
    } else {
      console.log(`[logo-resolution] dev probe OK ${backendId} → ${info.src}`)
    }
  }

  // Packaged main-process probe (dist/assets inside app.asar root)
  process.env.METAMATES_PACKAGED = '1'
  const packagedDir = appPaths.resolveAgentAssetsDir({ appRoot: ROOT, packaged: true })
  if (packagedDir !== DIST_ASSETS) {
    console.error(`[logo-resolution] packaged dir mismatch: ${packagedDir}`)
    failed = true
  }
  for (const backendId of BRANDED_AGENT_LOGO_IDS) {
    const info = resolveAgentLogoInfoFromDisk(backendId, packagedDir)
    if (info.type !== 'file') {
      console.error(
        `[logo-resolution] packaged probe ${backendId}: expected type=file, got ${info.type} (would show letter initial in UI)`,
      )
      failed = true
    } else {
      console.log(`[logo-resolution] packaged probe OK ${backendId} → ${info.src}`)
    }
  }

  if (failed) {
    console.error(
      '[logo-resolution] FAIL — ensure icons run before build, or re-run: npm run logos:agents && npm run build',
    )
    process.exit(1)
  }
  console.log(`[logo-resolution] All ${runtimeIds.length} runtime icons resolve in dev + packaged layouts`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
