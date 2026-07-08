---
name: context
description: Load Context - Read recent projects, reflections, and priorities to quickly get into a working state
---

Please perform the following tasks:

1. **Read Recent Journals**: Check daily notes from the last 7 days in the `01_Log_and_Plan/` directory.
2. **Read Master_Control**: Check current goals and priorities in `05_Templates_and_Config/Master_Control.md`.
3. **Scan Project Knowledge Base**: Browse active projects in `02_Project_and_Knowledge/`.
4. **Identify Key Reflections**: Extract important reflections and insights from recent daily notes.

Output Format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 Current Context Loaded Successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Time Range: [Last 7 Days]

🎯 Core Goals (From Master_Control)
- [Goal 1]
- [Goal 2]

🚀 Active Projects
- [Project 1] - [Status]
- [Project 2] - [Status]

💡 Recent Reflections
- [Reflection 1]
- [Reflection 2]

📋 Current Priorities
1. [Priority 1]
2. [Priority 2]
```

**Use Case**: Use before starting work to quickly establish a global view.

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
