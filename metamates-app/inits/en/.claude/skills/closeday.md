---
name: closeday
description: Daily Review - Summarize the day's progress, record new ideas, and list tasks that need to be carried over to tomorrow
---

Please perform the following tasks:

1. **Read Today's Journal**: Find today's daily note in the `01_Log_and_Plan/` directory.
2. **Scan Today's Activities**: Review the work and learning completed today.
3. **Extract New Ideas**: Identify new ideas and insights generated today.
4. **Identify Unfinished Tasks**: Find tasks that need to be carried over to tomorrow.
5. **Generate Review Report**

Output Format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌙 Daily Review: [Date]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Completed Today
- [Item 1]
- [Item 2]

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

## Memory & vault boundary (Metamates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
