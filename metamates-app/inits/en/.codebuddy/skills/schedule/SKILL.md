---
name: schedule
description: Time Scheduling - Suggest a weekly time allocation plan and flag potential conflicts based on priorities and calendar
allowed-tools: Read, Write, Glob, Grep
---

# ⏰ Time Scheduling (Schedule)

Please perform the following tasks:

1. **Read Current Projects**: Scan `02_Project_and_Knowledge/` to find active projects.
2. **Read Priorities**: Check current weekly goals in Master_Control.md.
3. **Read Calendar Schedule**: Check time arrangements in `01_Log_and_Plan/`.
4. **Generate Time Allocation Plan**: Suggest time allocation for the week based on priorities; flag conflicts.

## Output Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Weekly Schedule
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Period: [Start Date] - [End Date]

🎯 Weekly Core (By Priority)
1. [Task 1] - Est. Time: [X hours]
2. [Task 2] - Est. Time: [X hours]

📊 Time Allocation Suggestions
| Time Block | Task | Priority |
|------------|------|----------|
| [Slot]     | [Task]| High/Med/Low |

⚠️ Potential Conflicts
- [Conflict 1]: [Explanation]
- [Conflict 2]: [Explanation]

💡 Optimization Suggestions
- [Suggestion 1]
- [Suggestion 2]
```

---
**Protocol Source**: MetaMates CODEBUDDY.md

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
