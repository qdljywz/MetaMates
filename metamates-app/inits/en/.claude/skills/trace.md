---
name: trace
description: Trace Idea - Track the evolution of a specific idea across the inspiration vault
---

Please perform the following tasks:

1. **Receive Topic**: User inputs a topic or keyword.
2. **Vault-wide Search**: Search for all mentions of the topic in the inspiration vault.
3. **Trace Timeline**: Organize the evolution of the idea in chronological order.
4. **Analyze Evolution**: Identify how the idea developed from one note to another.
5. **Output Trace Map**

Output Format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Idea Trace: [Topic]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Evolution Timeline
[Date] - [File Name]
├─ Content Summary: [Core content regarding this topic in the note]
└─ Link to: [Next related note]

[Date] - [File Name]
├─ Content Summary: [...]
└─ Link to: [...]

🧵 Idea Network
- Total number of relevant notes: [X]
- Time span: [Start] → [End]
- Core evolution path: [Path description]

💡 Insights
- [Observations about the evolution of this idea]
```

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
