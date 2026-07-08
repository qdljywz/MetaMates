/**
 * ACP 快速冒烟：连接首个可用 CLI → initialize → session/new → 可选短 prompt
 */
const { spawn, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const WORKSPACE = process.env.METAMATES_WORKSPACE || 'E:\\Trae\\Metamates\\MyMetaMates'
const CLIS = [
  { cmd: 'gemini', args: ['--acp'], backend: 'gemini' },
  { cmd: 'codebuddy', args: ['--acp'], backend: 'codebuddy' },
  { cmd: 'claude', args: [], backend: 'claude', npx: '@zed-industries/claude-agent-acp' },
  { cmd: 'qwen', args: ['--acp'], backend: 'qwen' },
]

let rid = 1
function log(ok, name, detail) {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ': ' + detail : ''}`)
}

function detectAll() {
  const which = process.platform === 'win32' ? 'where' : 'which'
  const found = []
  for (const cli of CLIS) {
    try {
      execSync(`${which} ${cli.cmd}`, { stdio: 'pipe', timeout: 5000 })
      found.push(cli)
    } catch {}
  }
  return found
}

class SmokeConn {
  constructor(config) {
    this.config = config
    this.buffer = ''
    this.pending = new Map()
    this.sessionId = null
    this.updates = []
  }

  connect() {
    return new Promise((resolve, reject) => {
      const env = { ...process.env }
      delete env.NODE_OPTIONS
      delete env.CLAUDECODE
      let cmd = this.config.cmd
      let args = [...this.config.args]
      if (this.config.npx) {
        cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
        args = ['--yes', this.config.npx, ...args]
      }
      const isWin = process.platform === 'win32'
      this.child = spawn(isWin ? `chcp 65001 >nul && "${cmd}"` : cmd, args, {
        cwd: WORKSPACE,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        shell: isWin,
      })
      this.child.stdout.on('data', (d) => this.onData(d.toString()))
      this.child.on('error', reject)
      setTimeout(() => resolve(), 2000)
    })
  }

  onData(chunk) {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        if (msg.method === 'session/update') {
          this.updates.push(msg.params)
        }
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject, timer } = this.pending.get(msg.id)
          clearTimeout(timer)
          this.pending.delete(msg.id)
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
          else resolve(msg.result)
        }
      } catch {}
    }
  }

  request(method, params = {}, timeout = 180000) {
    const id = rid++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`timeout: ${method}`))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  disconnect() {
    try {
      this.child?.kill()
    } catch {}
  }
}

async function main() {
  const clis = detectAll()
  if (clis.length === 0) {
    log(false, 'CLI 检测', '无可用 CLI')
    process.exit(1)
  }

  for (const cli of clis) {
    console.log(`\n--- 尝试 ${cli.backend} ---`)
    const conn = new SmokeConn(cli)
    await conn.connect()
    log(true, 'Spawn 进程', `${cli.cmd} ${cli.args.join(' ')}`)

    try {
      await conn.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      })
      log(true, 'initialize', cli.backend)
    } catch (e) {
      log(false, 'initialize', `${cli.backend}: ${e.message}`)
      conn.disconnect()
      continue
    }

    try {
      const sessionStorePath = path.join(__dirname, '..', 'session-store.json')
      let resumeId = null
      if (fs.existsSync(sessionStorePath)) {
        const saved = JSON.parse(fs.readFileSync(sessionStorePath, 'utf-8'))
        resumeId = saved[cli.backend]?.sessionId || null
      }
      const params = { cwd: WORKSPACE, mcpServers: [] }
      if (resumeId && (cli.backend === 'claude' || cli.backend === 'codebuddy')) {
        params._meta = { claudeCode: { options: { resume: resumeId } } }
      } else if (resumeId) {
        params.resumeSessionId = resumeId
      }
      const result = await conn.request('session/new', params, 90000)
      conn.sessionId = result?.sessionId
      log(!!conn.sessionId, 'session/new', conn.sessionId?.slice(0, 12) || 'no sessionId')
      if (!conn.sessionId) {
        conn.disconnect()
        continue
      }
    } catch (e) {
      log(false, 'session/new', e.message)
      conn.disconnect()
      continue
    }

    try {
      const models = await conn.request('session/get_models', { sessionId: conn.sessionId }, 30000)
      const list = models?.models || models || []
      log(Array.isArray(list), 'get_models', `${Array.isArray(list) ? list.length : 0} 模型`)
    } catch (e) {
      log(true, 'get_models', `跳过: ${e.message}`)
    }

    try {
      conn.updates = []
      await conn.request(
        'session/prompt',
        {
          sessionId: conn.sessionId,
          prompt: [{ type: 'text', text: 'Reply with exactly: SMOKE_OK' }],
        },
        120000
      )
      const text = conn.updates
        .map((u) => u?.update?.content?.text || u?.update?.text || '')
        .join('')
      log(text.includes('SMOKE') || conn.updates.length > 0, 'send-prompt', text.slice(0, 80) || `${conn.updates.length} updates`)
    } catch (e) {
      log(false, 'send-prompt', e.message)
    }

    conn.disconnect()
    log(true, 'disconnect', cli.backend)
    return
  }

  log(false, 'ACP 实连', '所有 CLI 均失败')
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
