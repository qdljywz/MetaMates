---
name: context
description: Load Context - Read recent projects, reflections, and priorities to quickly get into a working state
allowed-tools: Read, Glob, Grep
---

# 🧠 Load Context (Context)

Please perform the following tasks:

1. **Read Master_Control**: Check `05_Templates_and_Config/Master_Control.md` for the global strategy.
2. **Read Recent Journals**: Scan `01_Log_and_Plan/` for records from the last 7 days.
3. **Read Project Status**: Review project progress under `02_Project_and_Knowledge/`.
4. **Generate Context Summary**: Summarize the current status, active projects, recent reflections, and priorities.

## Output Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 Context Loaded Successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Current Date: [Effective timezone from MetaMates prompt]

🎯 Core Goals (This Week)
- [Goal 1]
- [Goal 2]

📂 Active Projects
- [Project 1]: [Status]
- [Project 2]: [Status]

💭 Recent Reflections
- [Reflection 1]
- [Reflection 2]

⚡ Priorities
1. [Task 1]
2. [Task 2]
```

---
**Protocol Source**: MetaMates CODEBUDDY.md

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
