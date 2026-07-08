# MetaMates Workspace

> **Personal inspiration vault** — a local Markdown folder read and written by the [MetaMates](https://github.com/qdljywz/MetaMates) desktop app. Capture fragments, journals, and clips here first; the **engine on the right** (AI chat + slash commands) reads the vault and writes plans and insights back into these files.

---

## Using this folder in MetaMates

1. **Open workspace**: Select this folder in MetaMates (the first-run wizard copies structure from `inits/en`).
2. **Start from the engine**: Pick an AI on the right, send a message or tap `/today` and other commands — **this is the main entry point**.
3. **Review output**: Files the engine writes back open in the center editor; the calendar opens today's journal / PLAN.
4. **Mobile capture**: With Vault API enabled, quick captures land in `01_Log_and_Plan/Inbox/`.
5. **Timezone**: Set your IANA timezone in MetaMates **Settings** (e.g. `Asia/Shanghai`) — journals, PLAN files, and agent dates follow it.
6. **Empty-state guidance**: With no editor tabs open, the center **Thinking Engine** asks context-aware questions from PLAN, calendar, Ideas, and Inbox backlog.

Each CLI keeps **one continuous thread**; switching agents preserves separate histories.

---

## Directory layout

### 📂 `01_Log_and_Plan`

| File | Purpose |
|------|---------|
| `Daily_Note.md` | Diary template (reflection, quick notes, sparks) |
| `Daily_Plan.md` | Daily plan template (P0, time blocks) |
| `YYYY-MM-DD.md` | Diary for that date |
| `YYYY-MM-DD PLAN.md` | Master plan for that date |
| `Inbox/` | Mobile capture & quick entries (empty at init; `/graduate` archives sources to `Inbox/processed/`) |

### 📂 `02_Project_and_Knowledge`

Long-running projects, PRDs, specs, and structured knowledge. Seed: `Project_Homepage.md`.

### 📂 `03_Insights`

Atomic notes and inspiration fragments. Seed: `Zettel_Note.md`.

### 📂 `04_Intelligence`

External intel, meetings, connections. See `Intelligence_Home.md`.

### 📂 `05_Templates_and_Config`

| File | Purpose |
|------|---------|
| `Master_Control.md` | Global strategic command tower (read first) |
| `2M.md` | Evolution layer: user DNA, protocols, learning log |
| `AI_Commands_Prompt.md` | Guide to 15 methodology slash commands |
| `GEMINI.md` / `Claude.md` / `CodeBuddy.md` | Per-CLI collaboration protocols |
| `.claude/skills/`, `.codebuddy/skills/`, `.gemini/skills/` | Skill files agents load |

---

## Methodology commands (15)

Use from the **Agent panel** on the right in MetaMates (no need to type full prompts manually):

- **Daily**: `/context` `/today` `/closeday` `/schedule` `/sync`
- **Thinking**: `/trace` `/connect` `/challenge` `/ghost`
- **Inspiration**: `/ideas` `/graduate` `/drift` `/emerge` `/intel`
- **Planning**: `/soal` → updates `2M.md` in this folder

> `/intel`: paste a URL or document path; the app extracts locally, then the Agent deepens the note into `04_Intelligence/`.

---

## Suggested workflow

1. Morning: open today's PLAN from the calendar, run `/today`
2. Daytime: journal in `01_…`, advance project notes in `02_…`
3. Evening: run `/closeday`, sync `Master_Control.md`
4. When habits or lessons should stick: run `/soal` to update `2M.md`

---

**Workspace template version**: 1.4 · synced with MetaMates desktop · 2026-07-07
