---
name: intel
description: Intelligence import — fetch web or documents into 04_Intelligence and deepen summaries
allowed-tools: Read, Write, Glob, Grep
---

# 📡 Intelligence Import (/intel)

## Workflow

MetaMates desktop app performs **local extraction** first (web pages, PDF, Word, Excel, image OCR, etc.), creates a draft note under `04_Intelligence/` with originals in `sources/`. Your job is to **deepen** that note:

1. **Read** the draft `.md` and source metadata (URL or `sources/` path)
2. **Add** structured summary: core thesis, key data, assumptions to verify
3. **Connect**: `#tags` and `[[wiki links]]` to related vault notes
4. **Actions**: list follow-ups in an “Action items” section

## User input

- Web URL (http/https)
- Or workspace-relative path to PDF / image / docx / xlsx / csv / md

## Writeback

- Target: `04_Intelligence/` (update existing draft `.md`; do not duplicate)
- Preserve source metadata in frontmatter
- Re-read the file after writing to confirm success

## Output format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Intelligence deep-dive: [title]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 Core summary
(3–5 sentences)

🔑 Key points
- …

📊 Key data (if any)
- …

🔗 Vault links
- [[related note]]

✅ Action items
- …
```

---
**Protocol source**: MetaMates CODEBUDDY.md

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
