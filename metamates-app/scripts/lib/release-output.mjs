/**
 * Single electron-builder output directory for MetaMates.
 * Must stay in sync with electron-builder.yml → directories.output
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
export const APP_ROOT = path.join(LIB_DIR, '../..')

/** Official pack output folder (never use timestamped release-* variants). */
export const RELEASE_DIR_NAME = 'release'

/** electron-builder CLI override — pin output so scripts never fork new folders. */
export const RELEASE_OUTPUT_FLAG = `-c.directories.output=${RELEASE_DIR_NAME}`

/** Legacy dirs from old manual builds — delete only, never write. */
export const LEGACY_RELEASE_DIR_PATTERN = /^(release-build|release-local|release2|dist-release)(-|$)/

/** Stale subfolders inside release/ from ad-hoc or superseded portable builds. */
export const STALE_RELEASE_SUBDIR_PATTERN =
  /^(?:\.plugin-staging-|fresh-unpacked|pack-out|portable-green-fresh|unpacked-|unpacked-fix|release-build-)/

export function getReleaseRoot(appRoot = APP_ROOT) {
  return path.join(appRoot, RELEASE_DIR_NAME)
}

export function getPackagedExePath(appRoot = APP_ROOT) {
  return path.join(getReleaseRoot(appRoot), 'win-unpacked', 'MetaMates.exe')
}

export function listLegacyReleaseDirs(appRoot = APP_ROOT) {
  if (!fs.existsSync(appRoot)) return []
  return fs
    .readdirSync(appRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && LEGACY_RELEASE_DIR_PATTERN.test(d.name))
    .map((d) => path.join(appRoot, d.name))
}
