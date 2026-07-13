import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  BRANDED_AGENT_LOGO_IDS,
  buildAgentLogoInfo,
  getAgentLogoAssetSrc,
} from '../../electron/shared/agentLogos'
import { resolveAgentLogoInfoFromDisk } from '../../electron/shared/agentLogosDisk'
import { resolveAgentAssetsDir } from '../../electron/shared/appPaths'

describe('agent logo resolution', () => {
  it('renderer src is relative to dist/index.html', () => {
    expect(getAgentLogoAssetSrc('claude')).toBe('./assets/claude.svg')
  })

  it('resolveAgentAssetsDir uses public in dev and dist in packaged', () => {
    const root = '/app'
    expect(resolveAgentAssetsDir({ appRoot: root, packaged: false })).toBe(
      path.join(root, 'public', 'assets'),
    )
    expect(resolveAgentAssetsDir({ appRoot: root, packaged: true })).toBe(
      path.join(root, 'dist', 'assets'),
    )
  })

  it('resolveAgentLogoInfoFromDisk returns file when svg exists', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-logos-'))
    const assetsDir = path.join(tmp, 'assets')
    fs.mkdirSync(assetsDir)
    fs.writeFileSync(path.join(assetsDir, 'claude.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')

    const info = resolveAgentLogoInfoFromDisk('claude', assetsDir)
    expect(info).toEqual({ type: 'file', src: './assets/claude.svg' })
  })

  it('resolveAgentLogoInfoFromDisk falls back to initial when svg missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-logos-miss-'))
    const info = resolveAgentLogoInfoFromDisk('claude', path.join(tmp, 'empty'))
    expect(info.type).toBe('initial')
    expect(info.initial).toBe('C')
  })

  it('branded agents must not silently use initial when assetFileExists is true', () => {
    for (const backendId of BRANDED_AGENT_LOGO_IDS) {
      const info = buildAgentLogoInfo(backendId, { assetFileExists: true })
      expect(info.type, backendId).toBe('file')
    }
  })
})
