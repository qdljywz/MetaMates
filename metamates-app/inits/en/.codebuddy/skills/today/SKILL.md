---
name: today
description: Generate a prioritized action plan for today based on your journal, calendar, and task list
allowed-tools: Read, Write, Glob, Grep
---

# 📅 Daily Plan (Today)

Please perform the following tasks:

1. **Read Today's Journal & Plan**: In `01_Log_and_Plan/`, read today's journal (`YYYY-MM-DD.md`) and daily plan (`YYYY-MM-DD PLAN.md` — space, not underscore). Use dates from the MetaMates prompt (`Today`, `Effective timezone`).
2. **Read Calendar and Tasks**: Find relevant task lists and calendar arrangements.
3. **Read Master_Control**: Check core weekly goals and priorities in `05_Templates_and_Config/Master_Control.md`.
4. **Generate Today's Plan**: Based on the above information, generate a prioritized action plan for today.

## Output Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Today's Plan: [Date]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Core Goals
- [Goal 1]
- [Goal 2]

⏰ Schedule
- [Time] - [Task] (Priority: High/Medium/Low)

📋 To-Do List
- [ ] [Task 1]
- [ ] [Task 2]

💡 Today's Reminder
- [Reminder Items]
```

---
**Protocol Source**: MetaMates CODEBUDDY.md

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
