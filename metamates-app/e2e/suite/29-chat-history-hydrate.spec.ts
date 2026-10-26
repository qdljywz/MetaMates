import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeElectronApp, launchMetaMatesApp, resolveMainWindow, waitForAppShell } from '../helpers/launchElectron'
import { resolveE2EWorkspacePath } from '../helpers/e2eWorkspace'

/**
 * Failure mode: connect timeout leaves only an error bubble and vault chat
 * history never appears (wrong SQLite bind / error counted as cache).
 *
 * Seeds `{vault}/.metamates/conversations.sqlite` then asserts the message list
 * shows the seeded user bubble after shell ready (no live Agent required).
 */
function seedVaultHistory(workspacePath: string, text: string): void {
  const ws = path.resolve(workspacePath)
  const dbDir = path.join(ws, '.metamates')
  fs.mkdirSync(dbDir, { recursive: true })
  const dbPath = path.join(dbDir, 'conversations.sqlite')
  const backends = ['claude', 'codebuddy', 'gemini', 'codex']
  const py = `
import sqlite3, json, time
db = sqlite3.connect(${JSON.stringify(dbPath)})
c = db.cursor()
c.executescript('''
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
  updated_at INTEGER
);
''')
now = int(time.time() * 1000)
ws = ${JSON.stringify(ws)}
body = json.dumps({'content': ${JSON.stringify(text)}})
backends = ${JSON.stringify(backends)}
for backend in backends:
  cid = f'{backend}-e2e-history'
  c.execute('DELETE FROM messages WHERE conversation_id=?', (cid,))
  c.execute('DELETE FROM conversations WHERE id=?', (cid,))
  c.execute(
    'INSERT INTO conversations (id, backend, name, extra, created_at, updated_at, workspace_path) VALUES (?,?,?,?,?,?,?)',
    (cid, backend, backend, '{}', now, now, ws),
  )
  mid = f'e2e-hist-{backend}'
  c.execute(
    'INSERT INTO messages (id, conversation_id, type, content, position, status, msg_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    (mid, cid, 'text', body, 'right', 'finish', mid, now, now),
  )
db.commit()
db.close()
print('seeded', len(backends))
`
  execFileSync('python', ['-c', py], { stdio: 'pipe' })
}

test.describe.serial('@suite Chat history hydrate', () => {
  let app: ElectronApplication
  let page: Page
  const marker = `E2E_HISTORY_SEED_${Date.now()}`

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    const workspace = resolveE2EWorkspacePath()
    seedVaultHistory(workspace, marker)
    app = await launchMetaMatesApp(workspace)
    page = await resolveMainWindow(app)
    await waitForAppShell(page)
  })

  test.afterAll(async () => {
    if (app) await closeElectronApp(app)
  })

  test('vault conversation history appears in the message list', async () => {
    const messageList = page.locator('[data-testid="message-list"]')
    await expect(messageList).toBeVisible({ timeout: 60_000 })
    await expect
      .poll(async () => messageList.innerText(), { timeout: 45_000 })
      .toContain(marker)
  })
})
