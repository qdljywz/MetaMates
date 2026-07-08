---
name: schedule
description: Time Scheduling - Suggest a time allocation plan for this week based on priorities and calendar, flagging potential conflicts
---

Please perform the following tasks:

1. **Read Master_Control**: Check core weekly goals in `05_Templates_and_Config/Master_Control.md`.
2. **Read Weekly Journals**: Check existing arrangements for this week in `01_Log_and_Plan/`.
3. **Analyze Priorities**: Identify current most important projects and tasks.
4. **Generate Time Allocation Suggestions**: Provide a time allocation plan for the week based on priorities and available time.
5. **Flag Conflicts**: Identify contradictions between "stated importance" and "actual time allocation."

Output Format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Weekly Schedule: [Week Number]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Priority-Based Time Allocation
- [Project/Task]: Suggested [X] hours, Priority: High/Medium/Low

⏰ Daily Time Block Suggestions
- Monday: [Plan]
- Tuesday: [Plan]
- ...

⚠️ Potential Conflict Warning
- [Conflict Description]: You emphasize [Goal X], but more time is allocated to [Task Y].

💡 Adjustment Suggestions
- [Suggestion 1]
- [Suggestion 2]
```

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
