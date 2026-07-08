#!/usr/bin/env node
/**
 * Ollama ACP stdio 桥接：将 Ollama HTTP API 适配为 MetaMates ACP 子进程协议
 *
 * 环境变量：
 *   OLLAMA_BASE_URL - 默认 http://127.0.0.1:11434
 *   OLLAMA_MODEL    - 默认 llama3.2
 */

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2'

let sessionId = `ollama-${Date.now()}`
let currentModel = OLLAMA_MODEL

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

function sendChunk(text, sid) {
  send({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: sid,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text },
      },
    },
  })
}

async function ollamaChat(promptText) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: currentModel,
      stream: true,
      messages: [{ role: 'user', content: promptText }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Ollama ${res.status}: ${errText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const data = JSON.parse(line)
        const chunk = data.message?.content || ''
        if (chunk) sendChunk(chunk, sessionId)
      } catch {
        // skip malformed line
      }
    }
  }
}

async function handleRequest(msg) {
  const { id, method, params } = msg

  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: { protocolVersion: 1, agentCapabilities: {} } })
    return
  }

  if (method === 'session/new') {
    sessionId = `ollama-${Date.now()}`
    let models = []
    try {
      const tagsRes = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
      if (tagsRes.ok) {
        const tags = await tagsRes.json()
        models = (tags.models || []).map((m) => ({
          id: m.name,
          name: m.name,
        }))
      }
    } catch {
      models = [{ id: currentModel, name: currentModel }]
    }
    send({
      jsonrpc: '2.0',
      id,
      result: {
        sessionId,
        models: { models, availableModels: models },
      },
    })
    return
  }

  if (method === 'session/get_models') {
    send({ jsonrpc: '2.0', id, result: { models: [{ id: currentModel, name: currentModel }] } })
    return
  }

  if (method === 'session/set_model') {
    if (params?.modelId) currentModel = params.modelId
    send({ jsonrpc: '2.0', id, result: { success: true } })
    return
  }

  if (method === 'session/set_mode') {
    send({ jsonrpc: '2.0', id, result: { success: true } })
    return
  }

  if (method === 'session/prompt') {
    const promptParts = params?.prompt || []
    const text = promptParts
      .map((p) => (p?.type === 'text' ? p.text : ''))
      .filter(Boolean)
      .join('\n')
    try {
      await ollamaChat(text)
      send({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } })
    } catch (error) {
      sendChunk(`[Ollama Error] ${error.message}`, sessionId)
      send({ jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } })
    }
    return
  }

  send({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  })
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''
  for (const line of lines) {
    if (!line.trim()) continue
  void handleRequest(JSON.parse(line))
  }
})
