#!/usr/bin/env node
/**
 * 夜间持续验证：默认运行 6 小时，每轮 compile + 单元测试 + 功能测试
 * 用法: node scripts/overnight-verify.mjs [hours]
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const HOURS = parseFloat(process.argv[2] || '6')
const endAt = Date.now() + HOURS * 3600 * 1000
const logFile = path.join(ROOT, 'overnight-verify.log')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  fs.appendFileSync(logFile, line + '\n')
}

function runRound(n) {
  log(`=== Round ${n} start ===`)
  try {
    execSync('npm run verify:round', { cwd: ROOT, stdio: 'inherit', encoding: 'utf-8', shell: true })
    log(`=== Round ${n} PASS ===`)
    return true
  } catch (e) {
    log(`=== Round ${n} FAIL: ${e.message} ===`)
    return false
  }
}

async function main() {
  log(`Overnight verify started, duration ${HOURS}h, until ${new Date(endAt).toISOString()}`)
  let round = 0
  let passed = 0
  let failed = 0

  while (Date.now() < endAt) {
    round++
    if (runRound(round)) passed++
    else failed++
    if (Date.now() >= endAt) break
    log('Sleep 10 minutes before next round...')
    await sleep(10 * 60 * 1000)
  }

  const summary = { round, passed, failed, finishedAt: new Date().toISOString() }
  fs.writeFileSync(path.join(ROOT, 'overnight-verify-summary.json'), JSON.stringify(summary, null, 2))
  log(`Done. ${passed} passed, ${failed} failed, ${round} rounds`)
}

main().catch((e) => {
  log(`Fatal: ${e.message}`)
  process.exit(1)
})
