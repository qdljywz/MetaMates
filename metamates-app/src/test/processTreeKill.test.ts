import { describe, expect, it } from 'vitest'
import {
  isMetaMatesProcess,
  shouldKeepStaleProcess,
  shouldKillSiblingDevProcess,
  type MetaMatesProcessInfo,
} from '../../electron/shared/processTreeKill'

const APP_ROOT = 'C:/dev/MetaMates/metamates-app'

describe('processTreeKill helpers', () => {
  it('identifies metamates electron and vite processes', () => {
    expect(
      isMetaMatesProcess(
        'electron.exe',
        '"C:\\dev\\MetaMates\\metamates-app\\node_modules\\electron\\dist\\electron.exe" .',
        APP_ROOT,
      ),
    ).toBe(true)
    expect(
      isMetaMatesProcess(
        'node.exe',
        '"node" "C:\\dev\\MetaMates\\metamates-app\\node_modules\\vite\\bin\\vite.js"',
        APP_ROOT,
      ),
    ).toBe(true)
    expect(
      isMetaMatesProcess(
        'electron.exe',
        '"C:\\Users\\me\\AppData\\Local\\Programs\\cursor\\Cursor.exe"',
        APP_ROOT,
      ),
    ).toBe(false)
  })

  it('keeps current process, parent launcher, and sibling vite', () => {
    const siblingVite: MetaMatesProcessInfo = {
      pid: 200,
      parentPid: 100,
      name: 'node.exe',
      commandLine: `${APP_ROOT}/node_modules/vite/bin/vite.js`,
    }
    expect(shouldKeepStaleProcess(siblingVite, 300, 100)).toBe(true)
    expect(shouldKeepStaleProcess({ ...siblingVite, pid: 300 }, 300, 100)).toBe(true)
    expect(shouldKeepStaleProcess({ ...siblingVite, pid: 100 }, 300, 100)).toBe(true)
    expect(shouldKeepStaleProcess({ ...siblingVite, parentPid: 50 }, 300, 100)).toBe(false)
  })

  it('targets sibling dev processes for shutdown cleanup', () => {
    const siblingVite: MetaMatesProcessInfo = {
      pid: 200,
      parentPid: 100,
      name: 'node.exe',
      commandLine: `${APP_ROOT}/node_modules/vite/bin/vite.js`,
    }
    expect(shouldKillSiblingDevProcess(siblingVite, 300, 100, APP_ROOT)).toBe(true)
    expect(shouldKillSiblingDevProcess({ ...siblingVite, pid: 300 }, 300, 100, APP_ROOT)).toBe(false)
    expect(shouldKillSiblingDevProcess({ ...siblingVite, parentPid: 50 }, 300, 100, APP_ROOT)).toBe(false)
  })
})
