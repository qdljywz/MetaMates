#!/usr/bin/env node
/**
 * Overnight Windows release pipeline — run before handoff; writes morning report.
 * Usage: node scripts/overnight-release.mjs
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPackagedExePath } from './lib/release-output.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
const version = pkg.version || '0.1.0'
const reportMd = path.join(ROOT, 'docs', 'OVERNIGHT-RELEASE-REPORT.md')
const log = []

function note(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  log.push(line)
}

function run(name, cmd, args = [], env = {}) {
  note(`START ${name}`)
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  })
  if (result.status !== 0) {
    note(`FAIL ${name} (exit ${result.status ?? 1})`)
    writeReport(false, name)
    process.exit(result.status ?? 1)
  }
  note(`PASS ${name}`)
}

function artifact(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

function writeReport(passed, failedStep = '') {
  const exe = path.join('release', 'win-unpacked', 'MetaMates.exe')
  const installer = path.join('release', `MetaMates-${version}-win-x64.exe`)
  const docZip = path.join('release', `MetaMates-document-import-${version}-win-x64.zip`)
  const speechZip = path.join('release', `MetaMates-offline-speech-${version}-win-x64.zip`)

  const body = `# MetaMates Windows 夜间发布报告

生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

## 状态: ${passed ? '✅ 可用' : '❌ 需人工检查'}

${failedStep ? `失败步骤: **${failedStep}**\n` : ''}

## 产物

| 文件 | 存在 |
|------|------|
| \`${installer}\` | ${artifact(installer) ? '✅' : '❌'} |
| \`${exe}\` | ${artifact(exe) ? '✅' : '❌'} |
| \`${docZip}\` | ${artifact(docZip) ? '✅' : '❌'} |
| \`${speechZip}\` | ${artifact(speechZip) ? '✅' : '❌'} |

## 安装（新用户）

1. 双击 \`MetaMates-${version}-win-x64.exe\` 安装
2. 首次启动选择或打开灵感仓库（inits/zh 模板已内置）
3. 设置 → AI 助手 → 扩展 → 从 GitHub 安装 document-import / offline-speech（或本地 zip）

## 验证命令

\`\`\`bash
cd metamates-app
npm run verify:release-ready    # 完整发布门禁
npm run test:e2e:packaged       # 打包版冒烟 E2E
npm run test:e2e:claude-agent-live  # Claude 实连（消耗 quota）
\`\`\`

## 日志

\`\`\`
${log.join('\n')}
\`\`\`
`
  fs.mkdirSync(path.dirname(reportMd), { recursive: true })
  fs.writeFileSync(reportMd, body, 'utf8')
  note(`Report written: ${reportMd}`)
}

note('Overnight release pipeline start')

run('stop dev processes', 'npm', ['run', 'stop'])

const exePath = getPackagedExePath(ROOT)
if (!fs.existsSync(exePath)) {
  note('Missing release/win-unpacked — running npm run electron:build:win')
  run('electron build win', 'npm', ['run', 'electron:build:win'])
}

if (!artifact(path.join('release', `MetaMates-document-import-${version}-win-x64.zip`))) {
  run('pack document-import', 'npm', ['run', 'plugin:document-import:pack'])
}
if (!artifact(path.join('release', `MetaMates-offline-speech-${version}-win-x64.zip`))) {
  run('pack offline-speech', 'npm', ['run', 'plugin:offline-speech:pack'])
}

run('release-ready gate', 'npm', ['run', 'verify:release-ready'])

writeReport(true)
note('Overnight release pipeline DONE')
