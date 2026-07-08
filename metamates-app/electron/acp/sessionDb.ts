import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'
import { composeChatMessages, type ComposeChatMessage } from '../shared/chatCompose'
import { getWritableAppDataDir } from '../shared/appPaths'

function resolveSqlitePath(): string {
  return process.env.SESSION_DB_SQLITE_PATH || path.join(getWritableAppDataDir(), 'conversations.sqlite')
}

function resolveJsonLegacyPath(): string {
  return process.env.SESSION_DB_JSON_PATH || path.join(getWritableAppDataDir(), 'conversations.db')
}

export interface Conversation {
  id: string
  backend: string
  name: string
  extra: Record<string, any>
  created_at: number
  updated_at: number
  workspace_path?: string
}

/** Normalize workspace paths so Windows/Electron comparisons stay stable. */
export function normalizeWorkspacePath(workspacePath: string): string {
  if (!workspacePath?.trim()) return ''
  return path.resolve(workspacePath.trim())
}

export interface Message {
  id: string
  conversation_id: string
  type: string
  content: any
  position?: string
  status?: string
  msg_id?: string
  created_at?: number
  updated_at?: number
}

interface LegacyDatabase {
  conversations?: Record<string, Conversation>
  messages?: Record<string, Record<string, Message>>
}

let sqlite: Database.Database | null = null
let sqliteLoadError: string | null = null
const messageQueues = new Map<string, Message[]>()
const messageTimers = new Map<string, NodeJS.Timeout>()

const insertConversationStmt = () => getSqlite().prepare(`
  INSERT INTO conversations (id, backend, name, extra, created_at, updated_at, workspace_path)
  VALUES (@id, @backend, @name, @extra, @created_at, @updated_at, @workspace_path)
`)

const updateConversationExtraStmt = () => getSqlite().prepare(`
  UPDATE conversations
  SET extra = @extra, updated_at = @updated_at
  WHERE id = @id
`)

const touchConversationStmt = () => getSqlite().prepare(`
  UPDATE conversations SET updated_at = @updated_at WHERE id = @id
`)

const upsertMessageStmt = () => getSqlite().prepare(`
  INSERT INTO messages (id, conversation_id, type, content, position, status, msg_id, created_at, updated_at)
  VALUES (@id, @conversation_id, @type, @content, @position, @status, @msg_id, @created_at, @updated_at)
  ON CONFLICT(id) DO UPDATE SET
    content = excluded.content,
    position = excluded.position,
    status = excluded.status,
    msg_id = excluded.msg_id,
    updated_at = excluded.updated_at
`)

function markSqliteUnavailable(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  if (!sqliteLoadError) {
    sqliteLoadError = message
    console.error(
      '[Database] SQLite unavailable (chat history disabled). Run: npm run rebuild:native —',
      message,
    )
  }
}

export function isDatabaseAvailable(): boolean {
  if (sqlite) return true
  if (sqliteLoadError) return false
  try {
    getSqlite()
    return true
  } catch {
    return false
  }
}

function getSqlite(): Database.Database {
  if (sqliteLoadError) {
    throw new Error(sqliteLoadError)
  }
  if (!sqlite) {
    try {
      const dbPath = resolveSqlitePath()
      fs.mkdirSync(path.dirname(dbPath), { recursive: true })
      sqlite = new Database(dbPath)
      sqlite.pragma('journal_mode = WAL')
      sqlite.pragma('foreign_keys = ON')
      initSchema(sqlite)
      migrateSchema(sqlite)
      migrateFromJsonIfNeeded(sqlite)
    } catch (err: unknown) {
      markSqliteUnavailable(err)
      throw err
    }
  }
  return sqlite
}

function tryGetSqlite(): Database.Database | null {
  try {
    return getSqlite()
  } catch {
    return null
  }
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      backend TEXT NOT NULL,
      name TEXT NOT NULL,
      extra TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      workspace_path TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      position TEXT,
      status TEXT,
      msg_id TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
      ON messages(conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_conversations_backend_updated
      ON conversations(backend, updated_at DESC);
  `)
}

function migrateSchema(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(conversations)').all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'workspace_path')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN workspace_path TEXT NOT NULL DEFAULT ''`)
    console.log('[Database] Migrated conversations table: added workspace_path column')
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_backend_workspace_updated
      ON conversations(backend, workspace_path, updated_at DESC)
  `)
}

function getMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setMeta(db: Database.Database, key: string, value: string): void {
  db.prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    backend: String(row.backend),
    name: String(row.name),
    extra: JSON.parse(String(row.extra || '{}')),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    workspace_path: row.workspace_path != null ? String(row.workspace_path) : '',
  }
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    type: String(row.type),
    content: JSON.parse(String(row.content || 'null')),
    position: row.position ? String(row.position) : undefined,
    status: row.status ? String(row.status) : undefined,
    msg_id: row.msg_id ? String(row.msg_id) : undefined,
    created_at: row.created_at != null ? Number(row.created_at) : undefined,
    updated_at: row.updated_at != null ? Number(row.updated_at) : undefined,
  }
}

function serializeMessage(message: Message): Record<string, unknown> {
  return {
    id: message.id,
    conversation_id: message.conversation_id,
    type: message.type,
    content: JSON.stringify(message.content ?? null),
    position: message.position ?? 'left',
    status: message.status ?? 'finish',
    msg_id: message.msg_id ?? message.id,
    created_at: message.created_at ?? Date.now(),
    updated_at: message.updated_at ?? null,
  }
}

function migrateFromJsonIfNeeded(db: Database.Database): void {
  if (getMeta(db, 'json_migrated') === '1') return

  const conversationCount = db.prepare('SELECT COUNT(*) AS count FROM conversations').get() as { count: number }
  if (conversationCount.count > 0) {
    setMeta(db, 'json_migrated', '1')
    return
  }

  const legacyPath = resolveJsonLegacyPath()
  if (!fs.existsSync(legacyPath)) {
    setMeta(db, 'json_migrated', '1')
    return
  }

  let parsed: LegacyDatabase
  try {
    parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'))
  } catch (error: any) {
    console.warn('[Database] Legacy JSON unreadable, skipping migration:', error.message)
    setMeta(db, 'json_migrated', '1')
    return
  }

  const importTx = db.transaction(() => {
    for (const conversation of Object.values(parsed.conversations || {})) {
      insertConversationStmt().run({
        id: conversation.id,
        backend: conversation.backend,
        name: conversation.name,
        extra: JSON.stringify(conversation.extra || {}),
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        workspace_path: '',
      })
    }

    for (const [conversationId, messageMap] of Object.entries(parsed.messages || {})) {
      for (const message of Object.values(messageMap)) {
        upsertMessageStmt().run(serializeMessage({
          ...message,
          conversation_id: message.conversation_id || conversationId,
        }))
      }
    }
  })

  importTx()
  setMeta(db, 'json_migrated', '1')

  const backupPath = `${legacyPath}.bak`
  try {
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath)
    fs.renameSync(legacyPath, backupPath)
    console.log(`[Database] Migrated legacy JSON to SQLite, backup: ${backupPath}`)
  } catch (error: any) {
    console.warn('[Database] SQLite migration complete, but legacy backup failed:', error.message)
  }
}

export function warmupDatabase(): void {
  try {
    getSqlite()
  } catch {
    // markSqliteUnavailable already logged
  }
}

export function flushAllPendingMessages(): void {
  for (const convId of [...messageQueues.keys()]) {
    flushMessageQueue(convId)
  }
}

export function closeDatabase(): void {
  flushAllPendingMessages()
  for (const [convId, timer] of messageTimers) {
    clearTimeout(timer)
    flushMessageQueue(convId)
  }

  if (sqlite) {
    sqlite.close()
    sqlite = null
  }
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function createConversation(
  id: string,
  backend: string,
  name = 'New Conversation',
  extra: Record<string, any> = {},
  workspacePath = '',
): Conversation {
  const now = Date.now()
  const normalizedWorkspace = normalizeWorkspacePath(workspacePath)
  const conversation: Conversation = {
    id,
    backend,
    name,
    extra,
    created_at: now,
    updated_at: now,
    workspace_path: normalizedWorkspace,
  }

  if (!tryGetSqlite()) {
    return conversation
  }

  insertConversationStmt().run({
    id,
    backend,
    name,
    extra: JSON.stringify(extra),
    created_at: now,
    updated_at: now,
    workspace_path: normalizedWorkspace,
  })

  console.log(`[Database] Created conversation: ${id} for backend: ${backend} workspace: ${normalizedWorkspace || '(none)'}`)
  return conversation
}

export function getConversation(id: string): Conversation | null {
  const db = tryGetSqlite()
  if (!db) return null
  const row = db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined
  return row ? rowToConversation(row) : null
}

export function getConversationByBackend(backend: string, workspacePath = ''): Conversation | null {
  const db = tryGetSqlite()
  if (!db) return null
  const normalizedWorkspace = normalizeWorkspacePath(workspacePath)
  const row = db
    .prepare(`
      SELECT * FROM conversations
      WHERE backend = ? AND workspace_path = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `)
    .get(backend, normalizedWorkspace) as Record<string, unknown> | undefined
  return row ? rowToConversation(row) : null
}

export function getLatestConversationByBackend(backend: string, workspacePath = ''): Conversation | null {
  return getConversationByBackend(backend, workspacePath)
}

export function updateConversationExtra(id: string, extra: Record<string, any>): void {
  if (!tryGetSqlite()) return
  const existing = getConversation(id)
  if (!existing) return

  const mergedExtra = { ...existing.extra, ...extra }
  const updatedAt = Date.now()
  updateConversationExtraStmt().run({
    id,
    extra: JSON.stringify(mergedExtra),
    updated_at: updatedAt,
  })
}

type MessageCallback = (type: 'insert' | 'update', message: Message) => void

export function composeMessage(
  newMessage: Message,
  existingMessages: Message[] | null,
  callback?: MessageCallback
): Message[] {
  const before = existingMessages ? [...existingMessages] : []
  const merged = composeChatMessages(before, newMessage as ComposeChatMessage) as Message[]

  if (callback) {
    if (before.length === 0 && merged.length === 1) {
      callback('insert', merged[0])
    } else if (merged.length > before.length) {
      callback('insert', merged[merged.length - 1])
    } else {
      for (let i = 0; i < merged.length; i++) {
        const prev = before[i]
        const next = merged[i]
        if (!prev) {
          callback('insert', next)
        } else if (JSON.stringify(prev) !== JSON.stringify(next)) {
          callback('update', next)
        }
      }
    }
  }

  return merged
}

function queueMessage(conversationId: string, message: Message): void {
  if (!messageQueues.has(conversationId)) {
    messageQueues.set(conversationId, [])
  }

  messageQueues.get(conversationId)!.push(message)

  const existingTimer = messageTimers.get(conversationId)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  messageTimers.set(conversationId, setTimeout(() => {
    flushMessageQueue(conversationId)
  }, 2000))
}

function flushMessageQueue(conversationId: string): void {
  const queue = messageQueues.get(conversationId)
  if (!queue || queue.length === 0) return
  if (!tryGetSqlite()) {
    messageQueues.set(conversationId, [])
    return
  }

  messageQueues.set(conversationId, [])

  let existingMessages = getAllMessages(conversationId)
  for (const message of queue) {
    existingMessages = composeMessage(message, existingMessages, (type, msg) => {
      if (type === 'insert' || type === 'update') {
        upsertMessageStmt().run(serializeMessage(msg))
      }
    })
  }

  touchConversationStmt().run({ id: conversationId, updated_at: Date.now() })
  console.log(`[Database] Flushed ${queue.length} messages for conversation: ${conversationId}`)
}

export function insertMessage(
  message: Partial<Message> & { conversation_id: string },
  immediate = false
): Message | null {
  const id = message.id || generateId()
  const conversationId = message.conversation_id

  if (!conversationId) {
    console.error('[Database] insertMessage: missing conversation_id')
    return null
  }
  if (!tryGetSqlite()) return null

  const stored: Message = {
    id,
    conversation_id: conversationId,
    type: message.type || 'text',
    content: message.content,
    position: message.position || 'left',
    status: message.status || 'finish',
    msg_id: message.msg_id || id,
    created_at: message.created_at || Date.now(),
  }

  upsertMessageStmt().run(serializeMessage(stored))
  touchConversationStmt().run({ id: conversationId, updated_at: Date.now() })

  if (immediate) {
    tryGetSqlite()?.pragma('wal_checkpoint(PASSIVE)')
  }

  console.log(`[Database] Inserted message: ${id} type: ${message.type}`)
  return stored
}

export function accumulateMessage(message: Partial<Message> & { conversation_id: string }): void {
  const conversationId = message.conversation_id
  if (!conversationId) {
    console.error('[Database] accumulateMessage: missing conversation_id')
    return
  }
  if (!tryGetSqlite()) return

  if (!message.id) {
    message.id = generateId()
  }

  queueMessage(conversationId, message as Message)
}

export function updateMessage(id: string, content: Record<string, any>): boolean {
  const db = tryGetSqlite()
  if (!db) return false
  const row = db
    .prepare('SELECT * FROM messages WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined

  if (!row) return false

  const existing = rowToMessage(row)
  const mergedContent = {
    ...(existing.content && typeof existing.content === 'object' ? existing.content : {}),
    ...content,
  }
  const updatedAt = Date.now()

  upsertMessageStmt().run(serializeMessage({
    ...existing,
    content: mergedContent,
    updated_at: updatedAt,
  }))

  touchConversationStmt().run({ id: existing.conversation_id, updated_at: updatedAt })
  return true
}

export function getConversationMessagesBefore(
  conversationId: string,
  beforeCreatedAt: number,
  limit = 50,
): Message[] {
  const db = tryGetSqlite()
  if (!db) return []
  const rows = db
    .prepare(`
      SELECT * FROM (
        SELECT * FROM messages
        WHERE conversation_id = ? AND created_at < ?
        ORDER BY created_at DESC
        LIMIT ?
      ) ORDER BY created_at ASC
    `)
    .all(conversationId, beforeCreatedAt, limit) as Record<string, unknown>[]

  return rows.map(rowToMessage)
}

export function countConversationMessagesBefore(conversationId: string, beforeCreatedAt: number): number {
  const db = tryGetSqlite()
  if (!db) return 0
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND created_at < ?')
    .get(conversationId, beforeCreatedAt) as { count: number } | undefined
  return row?.count ?? 0
}

export function getRecentConversationMessages(conversationId: string, limit = 50): Message[] {
  const db = tryGetSqlite()
  if (!db) return []
  const rows = db
    .prepare(`
      SELECT * FROM (
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      ) ORDER BY created_at ASC
    `)
    .all(conversationId, limit) as Record<string, unknown>[]

  return rows.map(rowToMessage)
}

export function getConversationMessageCount(conversationId: string): number {
  const db = tryGetSqlite()
  if (!db) return 0
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?')
    .get(conversationId) as { count: number } | undefined
  return row?.count ?? 0
}

export function getConversationMessages(conversationId: string, limit = 1000, offset = 0): Message[] {
  const db = tryGetSqlite()
  if (!db) return []
  const rows = db
    .prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `)
    .all(conversationId, limit, offset) as Record<string, unknown>[]

  return rows.map(rowToMessage)
}

export function getAllMessages(conversationId: string): Message[] {
  const db = tryGetSqlite()
  if (!db) return []
  const rows = db
    .prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `)
    .all(conversationId) as Record<string, unknown>[]

  return rows.map(rowToMessage)
}

export function getAllConversationMessages(conversationId: string): Message[] {
  return getAllMessages(conversationId)
}

export function deleteConversation(id: string): void {
  const db = tryGetSqlite()
  if (!db) return
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  messageQueues.delete(id)

  const timer = messageTimers.get(id)
  if (timer) {
    clearTimeout(timer)
  }
  messageTimers.delete(id)
}

export function clearAllConversations(): void {
  const db = tryGetSqlite()
  if (!db) return
  db.exec('DELETE FROM messages; DELETE FROM conversations;')
  messageQueues.clear()

  for (const timer of messageTimers.values()) {
    clearTimeout(timer)
  }
  messageTimers.clear()
}
