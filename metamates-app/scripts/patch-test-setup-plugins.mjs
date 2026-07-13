#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const setupPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'test', 'setup.ts')
let s = fs.readFileSync(setupPath, 'utf8')
if (s.includes('getOfflineSpeechStatus')) {
  console.log('[patch] setup.ts already has offline speech mocks')
  process.exit(0)
}
s = s.replace(
  `    getDocumentImportStatus: vi.fn(async () => ({
      id: 'document-import',
      installed: false,
    })),
    listInstalled:`,
  `    getDocumentImportStatus: vi.fn(async () => ({
      id: 'document-import',
      installed: false,
    })),
    getOfflineSpeechStatus: vi.fn(async () => ({
      id: 'offline-speech',
      installed: false,
    })),
    listInstalled:`,
)
s = s.replace(
  `    installDocumentImport: vi.fn(async () => ({ success: false, error: 'mock' })),
    uninstall:`,
  `    installDocumentImport: vi.fn(async () => ({ success: false, error: 'mock' })),
    installOfflineSpeech: vi.fn(async () => ({ success: false, error: 'mock' })),
    uninstall:`,
)
fs.writeFileSync(setupPath, s)
console.log('[patch] setup.ts updated')
