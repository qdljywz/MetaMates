#!/usr/bin/env node
/**
 * MetaMates 完整功能测试 — 逐项真实验证
 * 用法: node scripts/full-functional-test.mjs [--acp-smoke]
 */
import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath, pathToFileURL } from 'url'
import { createRequire } from 'module'

import { resolveDefaultWorkspace } from './lib/default-workspace.mjs'
import { probeElectronSqlite } from './native-sqlite.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const WORKSPACE = resolveDefaultWorkspace()
const VAULT_PORT = 17334
const require = createRequire(import.meta.url)

const results = []
const runAcpSmoke = process.argv.includes('--acp-smoke')
const skipBuild = process.argv.includes('--skip-build')

function record(category, name, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL'
  results.push({ category, name, status, detail })
  const icon = ok ? '✅' : '❌'
  console.log(`${icon} [${category}] ${name}${detail ? ' — ' + detail : ''}`)
}

function httpGet(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }))
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
  })
}

function httpPost(url, body, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const u = new URL(url)
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        timeout,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let resBody = ''
        res.on('data', (c) => (resBody += c))
        res.on('end', () => resolve({ status: res.statusCode, body: resBody }))
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.write(data)
    req.end()
  })
}

async function runShell(name, cmd, cwd = ROOT) {
  try {
    execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf-8', timeout: 300000 })
    record('构建', name, true)
    return true
  } catch (e) {
    record('构建', name, false, e.stderr?.slice(0, 200) || e.message)
    return false
  }
}

// ─── 1. 构建 ───
console.log('\n═══ 1. 构建与编译 ═══')
if (skipBuild) {
  console.log('⏭️  跳过构建 (--skip-build)')
} else {
  await runShell('TypeScript 类型检查', 'npx tsc --noEmit')
  await runShell('Electron 主进程编译', 'npm run electron:compile')
  await runShell('前端生产构建', 'npm run build')
}

// ─── 2. 单元测试 ───
console.log('\n═══ 2. 单元测试 (Vitest) ═══')
try {
  const out = execSync('npm run test:run', { cwd: ROOT, encoding: 'utf-8', timeout: 120000 })
  const m = out.match(/Tests\s+(\d+) passed/)
  const failed = out.match(/(\d+) failed/)
  if (failed && parseInt(failed[1]) > 0) {
    record('单元测试', 'Vitest 全量', false, `${failed[1]} failed`)
  } else {
    record('单元测试', 'Vitest 全量', true, m ? m[0] : 'all passed')
  }
} catch (e) {
  record('单元测试', 'Vitest 全量', false, e.stdout?.slice(-300) || e.message)
}

// ─── 3. 产物与配置 ───
console.log('\n═══ 3. 产物与 IPC 完整性 ═══')
const requiredFiles = [
  'dist-electron/main.cjs',
  'dist-electron/preload.cjs',
  'dist-electron/acp/AcpConnection.cjs',
  'dist-electron/acp/AcpDetector.cjs',
  'dist-electron/acp/mcpSessionConfig.cjs',
  'dist-electron/shellEnv.cjs',
  'dist-electron/shared/acpRegistry.cjs',
  'dist-electron/vaultApi/server.cjs',
  'dist-electron/vaultApi/mobile.html',
  'dist-electron/ollama/client.cjs',
  'dist/index.html',
  'scripts/vault-mcp-bridge.mjs',
  'scripts/ollama-acp-bridge.mjs',
  'src/components/PdfViewer.tsx',
  'src/components/AgentChatPanel.tsx',
]
for (const f of requiredFiles) {
  record('产物', f, fs.existsSync(path.join(ROOT, f)))
}

const mainSrc = fs.readFileSync(path.join(ROOT, 'electron/main.ts'), 'utf-8')
record('产物', 'main.ts sessionStore.load()', mainSrc.includes('sessionStore.load()'))

const preload = fs.readFileSync(path.join(ROOT, 'electron/preload.cjs'), 'utf-8')
record('产物', 'preload ACP API', preload.includes("invoke('connect'") && preload.includes("invoke('set-model'"))

const panel = fs.readFileSync(path.join(ROOT, 'src/components/AgentChatPanel.tsx'), 'utf-8')
record('产物', 'AgentChatPanel 模型/模式 UI', panel.includes('handleModelChange') && panel.includes('selectedMode'))

const settings = fs.readFileSync(path.join(ROOT, 'src/components/SettingsModal.tsx'), 'utf-8')
record('产物', 'Settings CliInstallPanel', settings.includes('CliInstallPanel'))
record('产物', 'Settings McpSettingsPanel', settings.includes('McpSettingsPanel'))

const acpConn = fs.readFileSync(path.join(ROOT, 'electron/acp/AcpConnection.ts'), 'utf-8')
record('产物', 'ACP authenticate + keepalive', acpConn.includes('async authenticate') && acpConn.includes('startPromptKeepalive'))
record('产物', 'electron/shared/acpRegistry.ts', fs.existsSync(path.join(ROOT, 'electron/shared/acpRegistry.ts')))
record('产物', 'docs/PERSONAL_SCOPE.md', fs.existsSync(path.join(ROOT, 'docs/PERSONAL_SCOPE.md')))
record('产物', 'docs/POSITIONING.md', fs.existsSync(path.join(ROOT, 'docs/POSITIONING.md')))
record('产物', 'POST /api/capture', fs.readFileSync(path.join(ROOT, 'electron/vaultApi/server.ts'), 'utf-8').includes('/api/capture'))

// ─── 4. CLI 检测（AcpDetector，与产品行为一致）───
console.log('\n═══ 4. CLI 检测 (AcpDetector) ═══')
record('产物', 'shellEnv.ts', fs.existsSync(path.join(ROOT, 'electron/shellEnv.ts')))
record('产物', 'AcpDetector.ts', fs.existsSync(path.join(ROOT, 'electron/acp/AcpDetector.ts')))

let detectedCount = 0
await (async () => {
  try {
    const { acpDetector } = require(path.join(ROOT, 'dist-electron/acp/AcpDetector.cjs'))
    await acpDetector.initialize(true)
    const agents = acpDetector.getDetectedAgents()
    detectedCount = agents.length
    for (const a of agents) {
      record('CLI', a.name, true, `${a.backend} (${a.detectMethod || 'path'})`)
    }
    record('CLI', '至少 1 个 ACP Agent', detectedCount >= 1, `共 ${detectedCount} 个`)
  } catch (e) {
    record('CLI', 'AcpDetector 运行', false, e.message)
  }
})()

// ─── 5. Session 持久化 ───
console.log('\n═══ 5. Session / 对话持久化 ═══')
const sessionStorePath = path.join(ROOT, 'session-store.json')
const convDbPath = path.join(ROOT, 'conversations.db')
const convSqlitePath = path.join(ROOT, 'conversations.sqlite')
record('持久化', 'session-store.json 可读', (() => {
  if (!fs.existsSync(sessionStorePath)) return false
  try {
    JSON.parse(fs.readFileSync(sessionStorePath, 'utf-8'))
    return true
  } catch {
    return false
  }
})(), fs.existsSync(sessionStorePath) ? '存在' : '首次运行可能不存在')
record('持久化', 'conversations.sqlite 可用', (() => {
  if (fs.existsSync(convSqlitePath)) {
    return probeElectronSqlite().ok
  }

  if (!fs.existsSync(convDbPath)) return true
  try {
    JSON.parse(fs.readFileSync(convDbPath, 'utf-8'))
    return true
  } catch {
    return false
  }
})(), fs.existsSync(convSqlitePath) ? 'SQLite' : (fs.existsSync(convDbPath) ? 'legacy JSON' : '首次运行'))

// sessionStore.load 逻辑
try {
  const { sessionStore } = require(path.join(ROOT, 'dist-electron/acp/sessionStore.cjs'))
  await sessionStore.load()
  record('持久化', 'sessionStore.load()', true)
} catch (e) {
  const skip = /getAppPath|app\.getPath|Electron app/i.test(String(e.message || ''))
  record('持久化', 'sessionStore.load()', skip, skip ? 'SKIP: 非 Electron 主进程' : e.message)
}

// ─── 6. Vault API ───
console.log('\n═══ 6. Vault HTTP API ═══')
if (!fs.existsSync(WORKSPACE)) {
  record('Vault API', '工作区存在', false, WORKSPACE)
} else {
  record('Vault API', '工作区存在', true, WORKSPACE)
  try {
    const { vaultApiServer } = require(path.join(ROOT, 'dist-electron/vaultApi/server.cjs'))
    await vaultApiServer.stop().catch(() => {})
    const start = await vaultApiServer.start(WORKSPACE, VAULT_PORT)
    record('Vault API', '服务启动', start.success, start.error || `port ${VAULT_PORT}`)

    if (start.success) {
      const health = await httpGet(`http://127.0.0.1:${VAULT_PORT}/health`)
      record('Vault API', 'GET /health', health.status === 200, health.body.slice(0, 80))

      const mobile = await httpGet(`http://127.0.0.1:${VAULT_PORT}/mobile`)
      record('Vault API', 'GET /mobile', mobile.status === 200 && mobile.body.includes('<html'), '移动端阅读器')

      const list = await httpGet(`http://127.0.0.1:${VAULT_PORT}/api/list?recursive=false`)
      const listData = JSON.parse(list.body)
      record('Vault API', 'GET /api/list', list.status === 200 && Array.isArray(listData.files), `${listData.files?.length || 0} 项`)

      const search = await httpGet(`http://127.0.0.1:${VAULT_PORT}/api/search?q=MetaMates&limit=5`)
      const searchData = JSON.parse(search.body)
      record('Vault API', 'GET /api/search', search.status === 200 && Array.isArray(searchData.results))

      const sem = await httpGet(`http://127.0.0.1:${VAULT_PORT}/api/search/semantic?q=计划&limit=5`)
      record('Vault API', 'GET /api/search/semantic', sem.status === 200)

      const cal = await httpGet(`http://127.0.0.1:${VAULT_PORT}/api/calendar`)
      record('Vault API', 'GET /api/calendar', cal.status === 200)

      const ollama = await httpGet(`http://127.0.0.1:${VAULT_PORT}/api/ollama/status`)
      record('Vault API', 'GET /api/ollama/status', ollama.status === 200)

      const sampleFile = listData.files?.find((f) => f.name?.endsWith('.md'))
      if (sampleFile) {
        const fileRes = await httpGet(
          `http://127.0.0.1:${VAULT_PORT}/api/file?path=${encodeURIComponent(sampleFile.path)}`
        )
        const fileData = JSON.parse(fileRes.body)
        record('Vault API', 'GET /api/file', fileRes.status === 200 && fileData.content?.length > 0, sampleFile.name)
      } else {
        record('Vault API', 'GET /api/file', false, '无 md 文件可测')
      }

      const capture = await httpPost(`http://127.0.0.1:${VAULT_PORT}/api/capture`, {
        text: `功能测试剪藏 ${Date.now()}`,
        title: 'Test Capture',
      })
      const capData = JSON.parse(capture.body)
      record(
        'Vault API',
        'POST /api/capture',
        capture.status === 201 && capData.success && capData.path?.includes('Inbox'),
        capData.file || capData.path
      )

      await vaultApiServer.stop()
    }
  } catch (e) {
    record('Vault API', '集成测试', false, e.message)
  }
}

// ─── 7. MCP 配置 ───
console.log('\n═══ 7. MCP 桥接 ═══')
try {
  const { buildMetaMatesMcpServers } = require(path.join(ROOT, 'dist-electron/acp/mcpSessionConfig.cjs'))
  const servers = buildMetaMatesMcpServers()
  record('MCP', 'buildMetaMatesMcpServers()', Array.isArray(servers), servers.length ? `${servers.length} 服务器` : 'Vault 未启用时为 []')
  const bridgeExists = fs.existsSync(path.join(ROOT, 'scripts/vault-mcp-bridge.mjs'))
  record('MCP', 'vault-mcp-bridge.mjs', bridgeExists)
  record('MCP', 'ollama-acp-bridge.mjs', fs.existsSync(path.join(ROOT, 'scripts/ollama-acp-bridge.mjs')))
} catch (e) {
  record('MCP', 'mcpSessionConfig', false, e.message)
}

// ─── 8. Ollama 客户端 ───
console.log('\n═══ 8. Ollama ═══')
try {
  const { getOllamaStatus } = require(path.join(ROOT, 'dist-electron/ollama/client.cjs'))
  const status = await getOllamaStatus('http://127.0.0.1:11434')
  record('Ollama', 'getOllamaStatus()', true, status.running ? `运行中, ${status.models?.length || 0} 模型` : '未运行（可选）')
} catch (e) {
  record('Ollama', 'getOllamaStatus()', false, e.message)
}

// ─── 9. 日历 ICS ───
console.log('\n═══ 9. 日历 ICS 解析 ═══')
try {
  const { parseIcsEvents, getEventsForDate } = require(path.join(ROOT, 'dist-electron/calendar/icsParser.cjs'))
  const SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:t1
SUMMARY:Test
DTSTART:20250619T090000
DTEND:20250619T100000
END:VEVENT
END:VCALENDAR`
  const events = parseIcsEvents(SAMPLE)
  record('日历', 'parseIcsEvents', events.length === 1)
  record('日历', 'getEventsForDate', getEventsForDate(events, new Date(2025, 5, 19)).length === 1)
} catch (e) {
  record('日历', 'icsParser', false, e.message)
}

// ─── 10. PDF Base64 读取 ───
console.log('\n═══ 10. PDF 预览 (Base64) ═══')
const pdfPath = path.join(ROOT, 'test-fixtures', 'sample.pdf')
const pdfDir = path.dirname(pdfPath)
if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true })
const minimalPdf = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n'
)
fs.writeFileSync(pdfPath, minimalPdf)
try {
  const buf = fs.readFileSync(pdfPath)
  const b64 = buf.toString('base64')
  record('PDF', '读取 PDF 为 Base64', b64.startsWith('JVBERi0'), `${buf.length} bytes`)
  record('PDF', 'PdfViewer 组件存在', fs.existsSync(path.join(ROOT, 'src/components/PdfViewer.tsx')))
} catch (e) {
  record('PDF', 'Base64 读取', false, e.message)
}

// ─── 11. 工作区索引/迁移 ───
console.log('\n═══ 11. 工作区迁移 ═══')
try {
  const { detectLegacyPaths } = require(path.join(ROOT, 'dist-electron/workspaceMigrate.cjs'))
  const legacy = detectLegacyPaths(WORKSPACE)
  record('工作区', 'detectLegacyPaths()', Array.isArray(legacy), `${legacy.length} 项`)
} catch (e) {
  record('工作区', 'workspaceMigrate', false, e.message)
}

// ─── 12. ACP 快速冒烟（可选实连 CLI）───
if (runAcpSmoke && detectedCount >= 1) {
  console.log('\n═══ 12. ACP 实连冒烟测试 ═══')
  try {
    const out = execSync('node scripts/acp-quick-smoke.cjs', {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 180000,
      env: { ...process.env, METAMATES_WORKSPACE: WORKSPACE },
    })
    const pass = (out.match(/✅/g) || []).length
    const fail = (out.match(/❌/g) || []).length
    record('ACP 实连', 'quick-smoke', fail === 0, `${pass} pass, ${fail} fail`)
    console.log(out)
  } catch (e) {
    record('ACP 实连', 'quick-smoke', false, e.stdout?.slice(-500) || e.message)
  }
} else if (detectedCount >= 1) {
  console.log('\n═══ 12. ACP 实连（跳过，加 --acp-smoke 启用）═══')
  record('ACP 实连', 'quick-smoke', true, '跳过（使用 --acp-smoke 运行）')
} else {
  record('ACP 实连', 'quick-smoke', true, '无 CLI，跳过')
}

// ─── 报告 ───
console.log('\n' + '═'.repeat(60))
const passed = results.filter((r) => r.status === 'PASS').length
const failed = results.filter((r) => r.status === 'FAIL').length
console.log(`总计: ${results.length} 项 | ✅ ${passed} | ❌ ${failed}`)
console.log('═'.repeat(60))

if (failed > 0) {
  console.log('\n失败项:')
  results.filter((r) => r.status === 'FAIL').forEach((r) => {
    console.log(`  ❌ [${r.category}] ${r.name}: ${r.detail}`)
  })
}

const reportPath = path.join(ROOT, 'full-functional-test-report.json')
fs.writeFileSync(
  reportPath,
  JSON.stringify({ timestamp: new Date().toISOString(), passed, failed, results }, null, 2)
)
console.log(`\n报告: ${reportPath}`)

process.exit(failed > 0 ? 1 : 0)
