---
name: graduate
description: Insight Upgrade - Extract insights from fragmented journals and transform them into standalone permanent notes
allowed-tools: Read, Glob, Grep, Write
---

# 🎓 Insight Upgrade (Graduate)

Please perform the following tasks:

1. **Scan Journals & Inbox**: Read `01_Log_and_Plan/` journals from the last 14 days, plus unprocessed captures in `01_Log_and_Plan/Inbox/` (skip `Inbox/processed/`).
2. **Identify Upgradable Insights**: Find fragmented thoughts in journals and Inbox worth expanding into standalone articles.
3. **Create Permanent Notes**: Create standalone Zettel notes in `03_Insights/`.
4. **Backlinking**: Add links to the new notes in the original journals.

## Output Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎓 Insight Upgrade Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Scan Range: Last 14 days

📋 Identified Upgradable Insights

1. [[New Note 1]] (Source: [[Journal A]])
   > [Insight Summary]

2. [[New Note 2]] (Source: [[Journal B]])
   > [Insight Summary]

✅ Created Permanent Notes
- `03_Insights/[Note Name].md`

🔗 Updated Original Journals
- [[Journal A]] - Added link → [[New Note 1]]
- [[Journal B]] - Added link → [[New Note 2]]

💡 Upgrade Principles
- Topic independence: can be understood without the original journal.
- Worth further exploration.
- Potential connections with other notes.
```

---
**Protocol Source**: MetaMates CODEBUDDY.md


> **Inbox archive**: List **full paths** for Inbox sources (for example `01_Log_and_Plan/Inbox/xxx.md`). After successful writeback, MetaMates auto-moves cited Inbox files to `Inbox/processed/`.

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
