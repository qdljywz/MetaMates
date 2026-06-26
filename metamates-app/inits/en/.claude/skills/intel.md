# 📡 Intelligence Import (/intel)

## Task

The user runs `/intel` with a web URL or workspace document path. Metamates has already extracted content and created a draft intelligence note. Deepen that note:

1. Read the new `.md` under `04_Intelligence/` and `sources/` metadata
2. Add structured summary, key data, assumptions to verify
3. Add `#tags` and `[[wiki links]]` to related vault notes
4. List actionable follow-ups

## Writeback

- Update the generated intelligence note (preserve source metadata)
- Re-read the file to confirm

## User input

`{INPUT}` — URL or file path

## Memory & vault boundary (Metamates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
