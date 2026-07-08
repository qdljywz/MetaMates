import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { writeFileAtomic } from './shared/atomicWrite'

export function readAppSettings(): Record<string, unknown> {
  let settingsPath: string
  try {
    settingsPath = path.join(app.getPath('userData'), 'settings.json')
  } catch {
    settingsPath = path.join(process.cwd(), 'metamates-settings.json')
  }
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return {}
}

export function writeAppSettings(partial: Record<string, unknown>): Record<string, unknown> {
  let settingsPath: string
  try {
    settingsPath = path.join(app.getPath('userData'), 'settings.json')
  } catch {
    settingsPath = path.join(process.cwd(), 'metamates-settings.json')
  }
  const existing = readAppSettings()
  const merged = { ...existing, ...partial }
  writeFileAtomic(settingsPath, JSON.stringify(merged, null, 2))
  return merged
}
