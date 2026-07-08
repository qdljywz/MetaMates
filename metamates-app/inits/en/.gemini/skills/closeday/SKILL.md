---
name: closeday
description: Daily Review - Summarize the day's progress, record new ideas, and list carry-over tasks
allowed-tools: Read, Write, Glob, Grep
---

# 🌙 Daily Review (Closeday)

Please perform the following tasks:

1. **Review Today's Work**: Scan tasks and progress completed today.
2. **Summarize Progress**: Distill core achievements and milestones.
3. **Capture New Ideas**: Record new ideas or inspirations generated today.
4. **List Carry-over Tasks**: Mark unfinished items to be continued tomorrow.
5. **Update Master_Control**: Sync the daily review results.

## Output Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌙 Daily Review Completed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Review Date: [Effective timezone from MetaMates prompt]

✅ Completed Today
- [ ] [Task 1]
- [ ] [Task 2]

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
