import * as http from 'http'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { listMarkdownFiles, searchMarkdownFiles, searchMarkdownSemantic } from '../workspaceMigrate'
import { getCalendarSummary } from '../calendar/index'
import { getOllamaStatus } from '../ollama/client'
import { detectWorkspaceLanguage, resolveInboxDir } from '../workspaceLayout'
import { isPathWithinRoot } from '../shared/pathSafety'

const DEFAULT_PORT = 17333
const MAX_BODY_BYTES = 5 * 1024 * 1024

export interface VaultApiStatus {
  running: boolean
  port: number
  workspacePath: string
  /** Present when LAN access is enabled — required for non-localhost API calls. */
  lanToken?: string
}

/**
 * 本地 Vault HTTP API，供 MCP 桥接脚本与外部 Agent 读取工作区
 */
export class VaultApiServer {
  private server: http.Server | null = null
  private workspacePath = ''
  private port = DEFAULT_PORT
  private calendarIcsPath = ''
  private bindLan = false
  private authToken = ''

  getStatus(): VaultApiStatus {
    return {
      running: this.server !== null,
      port: this.port,
      workspacePath: this.workspacePath,
      lanToken: this.bindLan && this.authToken ? this.authToken : undefined,
    }
  }

  start(
    workspacePath: string,
    port = DEFAULT_PORT,
    options?: { calendarIcsPath?: string; bindLan?: boolean }
  ): Promise<{ success: boolean; port: number; error?: string; lanToken?: string }> {
    return new Promise((resolve) => {
      const requestedCalendarPath = options?.calendarIcsPath || ''
      const requestedBindLan = !!options?.bindLan

      // Idempotent fast-path: same config should not restart server.
      if (
        this.server &&
        this.workspacePath === workspacePath &&
        this.port === port &&
        this.calendarIcsPath === requestedCalendarPath &&
        this.bindLan === requestedBindLan
      ) {
        resolve({ success: true, port: this.port, lanToken: this.bindLan ? this.authToken : undefined })
        return
      }

      const bind = () => {
        this.workspacePath = workspacePath
        this.port = port
        this.calendarIcsPath = requestedCalendarPath
        this.bindLan = requestedBindLan
        if (requestedBindLan) {
          this.authToken = crypto.randomBytes(24).toString('hex')
        } else {
          this.authToken = ''
        }

        this.server = http.createServer((req, res) => {
          this.handleRequest(req, res)
        })

        this.server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            resolve({ success: false, port, error: `Port ${port} is already in use` })
          } else {
            resolve({ success: false, port, error: err.message })
          }
          this.server = null
        })

        this.server.listen(port, requestedBindLan ? '0.0.0.0' : '127.0.0.1', () => {
          const host = requestedBindLan ? '0.0.0.0' : '127.0.0.1'
          console.log(`[VaultAPI] Listening on http://${host}:${port}`)
          resolve({
            success: true,
            port,
            lanToken: requestedBindLan ? this.authToken : undefined,
          })
        })
      }

      if (this.server) {
        this.server.close(() => {
          this.server = null
          bind()
        })
        return
      }

      bind()
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve()
        return
      }
      this.server.close(() => {
        this.server = null
        this.workspacePath = ''
        this.calendarIcsPath = ''
        this.bindLan = false
        this.authToken = ''
        console.log('[VaultAPI] Stopped')
        resolve()
      })
    })
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Vault-Token')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (!this.workspacePath) {
      this.sendJson(res, 503, { error: 'Vault API not configured' })
      return
    }

    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      this.sendJson(res, 200, {
        status: 'ok',
        port: this.port,
        lan: this.bindLan,
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/mobile') {
      const mobilePath = path.join(__dirname, 'mobile.html')
      if (!fs.existsSync(mobilePath)) {
        this.sendJson(res, 404, { error: 'Mobile reader not found' })
        return
      }
      const html = fs.readFileSync(mobilePath, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    if (!this.isAuthorized(req, url)) {
      this.sendJson(res, 401, { error: 'Unauthorized — scan the QR code in MetaMates settings for the access token' })
      return
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/ollama/status') {
        const baseUrl = url.searchParams.get('baseUrl') || 'http://127.0.0.1:11434'
        void getOllamaStatus(baseUrl)
          .then((status) => this.sendJson(res, 200, status))
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            this.sendJson(res, 500, { error: message })
          })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/list') {
        const recursive = url.searchParams.get('recursive') !== 'false'
        const files = listMarkdownFiles(this.workspacePath, recursive)
        this.sendJson(res, 200, { files: files.map((f) => ({ name: f.name, path: f.path })) })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/search') {
        const q = url.searchParams.get('q') || ''
        const limit = parseInt(url.searchParams.get('limit') || '20', 10)
        const results = searchMarkdownFiles(this.workspacePath, q, limit)
        this.sendJson(res, 200, { results })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/search/semantic') {
        const q = url.searchParams.get('q') || ''
        const limit = parseInt(url.searchParams.get('limit') || '20', 10)
        const results = searchMarkdownSemantic(this.workspacePath, q, limit)
        this.sendJson(res, 200, { results })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/calendar') {
        const dateParam = url.searchParams.get('date')
        const date = dateParam ? new Date(dateParam) : undefined
        const summary = getCalendarSummary(
          this.workspacePath,
          this.calendarIcsPath || undefined,
          date
        )
        this.sendJson(res, 200, summary)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/file') {
        const filePath = url.searchParams.get('path')
        if (!filePath) {
          this.sendJson(res, 400, { error: 'Missing path parameter' })
          return
        }
        const resolved = this.resolveSafePath(filePath)
        if (!resolved) {
          this.sendJson(res, 403, { error: 'Path outside workspace' })
          return
        }
        if (!fs.existsSync(resolved)) {
          this.sendJson(res, 404, { error: 'File not found' })
          return
        }
        const content = fs.readFileSync(resolved, 'utf-8')
        this.sendJson(res, 200, { path: resolved, content })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/capture') {
        void this.readBody(req).then((body) => {
          try {
            const data = JSON.parse(body) as { text?: string; title?: string; url?: string }
            const text = (data.text || '').trim()
            if (!text) {
              this.sendJson(res, 400, { error: 'Requires non-empty text' })
              return
            }
            const lang = detectWorkspaceLanguage(this.workspacePath)
            const inboxRel = resolveInboxDir(this.workspacePath, lang)
            const inboxDir = path.join(this.workspacePath, inboxRel)
            if (!fs.existsSync(inboxDir)) {
              fs.mkdirSync(inboxDir, { recursive: true })
            }
            const now = new Date()
            const pad = (n: number) => String(n).padStart(2, '0')
            const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
            const safeTitle = (data.title || '剪藏').replace(/[<>:"/\\|?*]/g, '_').slice(0, 40)
            const fileName = `${stamp}_${safeTitle}.md`
            const relPath = path.join(inboxRel, fileName).replace(/\\/g, '/')
            const resolved = this.resolveSafePath(relPath)
            if (!resolved) {
              this.sendJson(res, 403, { error: 'Invalid path' })
              return
            }
            const lines = [
              `# ${data.title || '剪藏'}`,
              '',
              `> 捕获于 ${now.toISOString()}`,
            ]
            if (data.url) lines.push(`> 来源: ${data.url}`)
            lines.push('', text, '')
            fs.writeFileSync(resolved, lines.join('\n'), 'utf-8')
            this.sendJson(res, 201, { success: true, path: relPath, file: fileName })
          } catch {
            this.sendJson(res, 400, { error: 'Invalid JSON body' })
          }
        }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          const status = message.includes('too large') ? 413 : 400
          this.sendJson(res, status, { error: message })
        })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/api/file') {
        void this.readBody(req).then((body) => {
          try {
            const data = JSON.parse(body)
            if (!data.path || typeof data.content !== 'string') {
              this.sendJson(res, 400, { error: 'Requires path and content' })
              return
            }
            const resolved = this.resolveSafePath(data.path)
            if (!resolved) {
              this.sendJson(res, 403, { error: 'Path outside workspace' })
              return
            }
            const dir = path.dirname(resolved)
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true })
            }
            fs.writeFileSync(resolved, data.content, 'utf-8')
            this.sendJson(res, 200, { success: true, path: resolved })
          } catch {
            this.sendJson(res, 400, { error: 'Invalid JSON body' })
          }
        }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          const status = message.includes('too large') ? 413 : 400
          this.sendJson(res, status, { error: message })
        })
        return
      }

      this.sendJson(res, 404, { error: 'Not found' })
    } catch (error: any) {
      this.sendJson(res, 500, { error: error.message })
    }
  }

  private resolveSafePath(inputPath: string): string | null {
    const resolved = path.resolve(this.workspacePath, inputPath)
    if (!isPathWithinRoot(this.workspacePath, resolved)) {
      return null
    }
    return resolved
  }

  private isLocalRequest(req: http.IncomingMessage): boolean {
    const addr = req.socket.remoteAddress || ''
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
  }

  private isAuthorized(req: http.IncomingMessage, url: URL): boolean {
    if (!this.bindLan || this.isLocalRequest(req)) return true
    const header = req.headers['x-vault-token']
    const fromHeader = Array.isArray(header) ? header[0] : header
    const fromQuery = url.searchParams.get('token')
    const token = (fromHeader || fromQuery || '').trim()
    return token.length > 0 && token === this.authToken
  }

  private sendJson(res: http.ServerResponse, status: number, data: object): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(data))
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let total = 0
      req.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > MAX_BODY_BYTES) {
          req.destroy()
          reject(new Error('Request body too large'))
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      req.on('error', reject)
    })
  }
}

export const vaultApiServer = new VaultApiServer()
