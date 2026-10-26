---
name: closeday
description: Daily Review - Summarize progress, sync Pomodoro into diary body, record ideas, list carry-over tasks
allowed-tools: Read, Write, Glob, Grep
---

# 🌙 Daily Review (Closeday)

Please perform the following tasks:

1. **Review Today's Work**: Scan today's progress; read `01_Log_and_Plan/YYYY-MM-DD.md`.
2. **Pomodoro → diary body sync** (required closed-loop rule)
   - Read `## Pomodoro` / `## 番茄钟`; MetaMates format: `- [x] 10:00–10:25 (25m) note text`
   - For each completed `[x]`: append under ✅ Completed Today: `✅ **[note]**（🍅 [range] · [duration]）` (create section if missing); dedupe; participant-only → no invented output
   - Remove matching Pending items; update Last-updated if present; **keep** `## Pomodoro` ledger intact
3. **Summarize Progress**: Distill achievements (including synced pomodoros).
4. **Capture New Ideas**: Record new ideas or inspirations generated today.
5. **List Carry-over Tasks**: Mark unfinished items to be continued tomorrow.
6. **Update Master_Control**: Sync the daily review results.

## Output Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌙 Daily Review Completed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Review Date: [Effective timezone from MetaMates prompt]

✅ Completed Today
- [ ] [Task 1]
- [ ] [Task 2]

🍅 Pomodoro sync
- [written / skipped duplicates]

💡 New Ideas
- [Idea 1]
- [Idea 2]

⏭️ Carry over to Tomorrow
- [ ] [Task 1]
- [ ] [Task 2]

📊 Today's Status Assessment
- Efficiency: ⭐⭐⭐⭐⭐
- Focus: ⭐⭐⭐⭐⭐
- Satisfaction: ⭐⭐⭐⭐⭐
```

**Important**: It is recommended to run `/sync` after the review to update Master_Control.

---
**Protocol Source**: MetaMates CODEBUDDY.md

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
