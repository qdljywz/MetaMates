import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(root, '..', 'conversations.sqlite')
const db = new Database(dbPath)

const rows = db.prepare(`
  SELECT id, type, content, created_at
  FROM messages
  WHERE type = 'acp_tool_call'
  ORDER BY created_at DESC
  LIMIT 5
`).all()

for (const [i, row] of rows.entries()) {
  const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content
  const update = content?.update || content
  console.log(`\n=== tool call ${i} @ ${row.created_at} ===`)
  console.log('title:', update?.title)
  console.log('kind:', update?.kind)
  console.log('status:', update?.status)
  console.log('toolFilePath:', update?.toolFilePath)
  console.log('rawInput:', JSON.stringify(update?.rawInput ?? update?.raw_input)?.slice(0, 400))
  const c = update?.content
  if (Array.isArray(c)) {
    console.log('content[0]:', JSON.stringify(c[0])?.slice(0, 400))
  } else if (typeof c === 'string') {
    console.log('content text:', c.slice(0, 400))
  }
}

db.close()
