#!/usr/bin/env node
/** Restore dev index.html after vite build (vite rewrites the root entry in place). */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const template = path.join(root, 'index.template.html')
const target = path.join(root, 'index.html')

if (!fs.existsSync(template)) {
  console.error('[restore-index-html] Missing index.template.html')
  process.exit(1)
}

fs.copyFileSync(template, target)
console.log('[restore-index-html] Restored index.html from index.template.html')
