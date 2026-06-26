import { ChildProcess, spawn } from 'child_process'
import path from 'path'
import { applyGeminiChildEnvOverrides } from '../../geminiAuth'

export interface GeminiCLIProcess {
  process: ChildProcess | null
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'error'
  pid: number | null
  isRunning(): boolean
}

export interface GeminiCLIConfig {
  geminiPath: string
  workspacePath: string
}

export class GeminiCLIManager {
  private _process: ChildProcess | null = null
  private _status: 'idle' | 'starting' | 'running' | 'stopping' | 'error' = 'idle'
  private _pid: number | null = null

  constructor(private config: GeminiCLIConfig) {}

  get process(): GeminiCLIProcess {
    return {
      process: this._process,
      status: this._status,
      pid: this._pid,
      isRunning: () => this._status === 'running',
    }
  }

  get status(): 'idle' | 'starting' | 'running' | 'stopping' | 'error' {
    return this._status
  }

  start(): Promise<boolean> {
    if (this._process || this._status === 'running') {
      console.warn('[GeminiCLIManager] Gemini CLI is already running')
      return Promise.resolve(false)
    }

    return new Promise((resolve, reject) => {
      // Try to find gemini in common locations
      const possiblePaths = [
        'gemini',
        path.join(process.env.APPDATA || '', 'npm', 'gemini.cmd'),
        path.join(process.env.APPDATA || '', 'npm', 'gemini'),
      ]
      
      let geminiCmd = 'npx'
      let cmdArgs = ['@google/gemini-cli']
      
      // Check if we can use gemini directly
      for (const p of possiblePaths) {
        try {
          require('fs').accessSync(p, require('fs').constants.X_OK)
          geminiCmd = p
          cmdArgs = []
          break
        } catch {
          // Continue to next option
        }
      }
      
      console.log('[GeminiCLIManager] Using command:', geminiCmd, cmdArgs)
      
      this._process = spawn(geminiCmd, cmdArgs, {
        cwd: this.config.workspacePath,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        env: applyGeminiChildEnvOverrides({
          ...process.env,
          PATH: `${process.env.PATH};${process.env.APPDATA}\\npm`,
        }),
      })

      this._status = 'starting'
      this._pid = this._process?.pid || null

      console.log('[GeminiCLIManager] Starting Gemini CLI:', {
        pid: this._pid,
        cmdArgs,
      })

      this._process?.stdout?.on('data', (data) => {
        console.log('[GeminiCLIManager] STDOUT:', data.toString())
      })

      this._process?.stderr?.on('data', (data) => {
        console.error('[GeminiCLIManager] STDERR:', data.toString())
      })

      this._process?.on('close', (code) => {
        console.log('[GeminiCLIManager] Process closed with code:', code)
        
        if (code === 0) {
          this._status = 'idle'
          this._process = null
          this._pid = null
          resolve(true)
        } else {
          this._status = 'error'
          this._process = null
          this._pid = null
          reject(new Error(`Gemini CLI exited with code ${code}`))
        }
      })

      this._process?.on('error', (error: Error) => {
        console.error('[GeminiCLIManager] Process error:', error)
        this._status = 'error'
        this._process = null
        this._pid = null
        reject(error)
      })
    })
  }

  stop(): Promise<boolean> {
    if (!this._process) {
      console.warn('[GeminiCLIManager] No process to stop')
      return Promise.resolve(false)
    }

    return new Promise((resolve) => {
      console.log('[GeminiCLIManager] Stopping Gemini CLI...')
      this._status = 'stopping'

      this._process?.kill('SIGTERM')

      const timeout = setTimeout(() => {
        if (this._status === 'stopping') {
          console.warn('[GeminiCLIManager] Force killing Gemini CLI...')
          this._process?.kill('SIGKILL')
        }
      }, 5000)

      this._process?.on('close', () => {
        clearTimeout(timeout)
        this._status = 'idle'
        this._process = null
        this._pid = null
        resolve(true)
      })
    })
  }

  sendCommand(command: string, args?: Record<string, any>): Promise<void> {
    if (this._status !== 'idle' || !this._process) {
      console.warn('[GeminiCLIManager] Cannot send command: CLI not ready')
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      console.log('[GeminiCLIManager] Sending command:', {
        command,
        args,
      })

      try {
        this._process?.stdin?.write(JSON.stringify({
          type: 'command',
          command,
          args: args || {},
        }))
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  getStatus(): GeminiCLIProcess {
    return {
      process: this._process,
      status: this._status,
      pid: this._pid,
      isRunning: () => this._status === 'running',
    }
  }

  isRunning(): boolean {
    return this._status === 'running'
  }
}
