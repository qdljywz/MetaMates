---
name: closeday
description: Daily Review - Summarize progress, sync Pomodoro sessions into the diary body, capture ideas, list carry-over tasks
---

Please perform the following tasks:

1. **Read Today's Journal**: Find today's daily note in `01_Log_and_Plan/` (`YYYY-MM-DD.md`).
2. **Scan Today's Activities**: Review work and learning completed today.
3. **Pomodoro → diary body sync** (required closed-loop rule)
   - Read all entries under `## Pomodoro` (or `## 番茄钟`) in today's note
   - MetaMates status-bar write format example: `- [x] 10:00–10:25 (25m) note text`
   - For each completed `[x]` pomodoro line:
     - Append under 「Completed Today / ✅」: `✅ **[note]**（🍅 [time range] · [duration]）`
     - If that section is missing, create `## ✅ Completed Today` then append
     - Skip duplicates (match on note text already present in ✅)
     - If marked participant-only / no output, append `· participant only, no deliverable` and do not invent outcomes
   - After sync:
     - Remove matching items from any 「Pending / 待执行」 list that the pomodoro completed
     - Update a 「Last updated」 timestamp if present
     - **Keep** the trailing `## Pomodoro` section intact (source of truth; do not delete)
4. **Extract New Ideas**: Identify new ideas and insights from today.
5. **Identify Unfinished Tasks**: Find tasks to carry over to tomorrow.
6. **Generate Review Report**

Output Format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌙 Daily Review: [Date]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Completed Today
- [Item 1]
- [Item 2]

🍅 Pomodoro sync
- [written / skipped duplicates]

💡 New Ideas/Insights
- [Idea 1]
- [Idea 2]

📝 Unfinished Tasks (Carry over to tomorrow)
- [ ] [Task 1]
- [ ] [Task 2]

🔄 Sync to Master_Control
- [Global information to be synced]
```

Finally, please sync the relevant information to `05_Templates_and_Config/Master_Control.md`.

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
