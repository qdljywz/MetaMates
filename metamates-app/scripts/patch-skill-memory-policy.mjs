#!/usr/bin/env node
/**
 * Append memory/vault policy block to inits skill files (zh + en).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const INITS = path.join(ROOT, 'inits')

const MARKER_ZH = '## 记忆与 Vault 边界（Metamates 强制）'
const MARKER_EN = '## Memory & vault boundary (Metamates required)'

const BLOCK_ZH = `
## 记忆与 Vault 边界（Metamates 强制）

- 用户可读的长期记忆须镜像到 \`04_情报与连接/记忆索引.md\`（详细条目放 \`04_情报与连接/参考/\`）
- **禁止**只写入 \`~/.codebuddy\`、CLI 项目缓存或其它 Vault 外路径
- 本命令若要求写回：必须使用 Write/编辑工具落盘，并在写后 **Read 验证**（Act & Verify）
`.trim()

const BLOCK_EN = `
## Memory & vault boundary (Metamates required)

- Mirror user-facing long-term memory to \`04_Intelligence/Memory_Index.md\` (details under \`04_Intelligence/Reference/\`)
- **Never** write only to \`~/.codebuddy\`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
`.trim()

function collectSkillFiles(langDir) {
  const lang = langDir.endsWith(`${path.sep}en`) || langDir.endsWith('/en') ? 'en' : 'zh'
  const files = []

  const claudeDir = path.join(langDir, '.claude', 'skills')
  if (fs.existsSync(claudeDir)) {
    for (const name of fs.readdirSync(claudeDir)) {
      if (name.endsWith('.md')) files.push({ file: path.join(claudeDir, name), lang })
    }
  }

  for (const provider of ['.codebuddy', '.gemini']) {
    const skillsRoot = path.join(langDir, provider, 'skills')
    if (!fs.existsSync(skillsRoot)) continue
    for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const skillFile = path.join(skillsRoot, entry.name, 'SKILL.md')
      if (fs.existsSync(skillFile)) files.push({ file: skillFile, lang })
    }
  }

  return files
}

function patchFile(filePath, lang) {
  const marker = lang === 'en' ? MARKER_EN : MARKER_ZH
  const block = lang === 'en' ? BLOCK_EN : BLOCK_ZH
  const content = fs.readFileSync(filePath, 'utf8')
  if (content.includes(marker)) return false
  fs.writeFileSync(filePath, `${content.trimEnd()}\n\n${block}\n`, 'utf8')
  return true
}

let patched = 0
let skipped = 0

for (const langName of ['zh', 'en']) {
  const langDir = path.join(INITS, langName)
  if (!fs.existsSync(langDir)) continue
  for (const { file, lang } of collectSkillFiles(langDir)) {
    if (patchFile(file, lang)) {
      patched += 1
      console.log('patched', path.relative(ROOT, file))
    } else {
      skipped += 1
    }
  }
}

console.log(`\nDone: ${patched} patched, ${skipped} already had policy block.`)
