import fs from 'fs'
import { expect } from '@playwright/test'

export function vaultFileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

export function readVaultFileUtf8(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8')
}

export function expectVaultFileContains(filePath: string, needle: string): void {
  expect(vaultFileExists(filePath)).toBe(true)
  expect(readVaultFileUtf8(filePath)).toContain(needle)
}

export function expectVaultFileMissing(filePath: string): void {
  expect(vaultFileExists(filePath)).toBe(false)
}
