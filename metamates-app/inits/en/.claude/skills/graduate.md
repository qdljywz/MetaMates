---
name: graduate
description: Insight Upgrade - Extract insights from fragmented journals and transform them into standalone permanent notes
---

Please perform the following tasks:

1. **Scan Journals & Inbox**: Read daily notes from the past 14 days plus unprocessed captures in `01_Log_and_Plan/Inbox/` (skip `processed/`).
2. **Identify Valuable Ideas**: Find inspiration fragments in journals and Inbox worth preserving, developing, or deepening.
3. **Assess Independence**: Determine which ideas are significant enough to become standalone notes.
4. **Create Permanent Notes**: Create standalone note files for each idea.
5. **Update Index**: Ensure new notes can be found in subsequent searches.

Output Format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎓 Insight Upgrade Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Scan Range: Past 14 Days

🌟 Valuable Ideas Found
1. [Idea Title]
   - Source: [Daily Note Date]
   - Original Excerpt: [Excerpt]
   - Value: [Why it is important]

📁 Created Permanent Notes
✅ [Note 1].md → [Path]
✅ [Note 2].md → [Path]

📊 Upgrade Statistics
- Daily notes scanned: [X] files
- Ideas found: [Y] items
- Notes created: [Z] files
- Upgrade rate: [Z/Y]%

🔗 Connection Update
- New notes added to relevant indices.
```

**Note**: Executing this will actually create new note files.


> **Inbox archive**: List **full paths** for Inbox sources (for example `01_Log_and_Plan/Inbox/xxx.md`). After successful writeback, MetaMates auto-moves cited Inbox files to `Inbox/processed/`.

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
