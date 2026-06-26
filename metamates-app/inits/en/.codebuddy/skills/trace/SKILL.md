---
name: trace
description: Trace Idea - Track the evolution of a specific idea across the entire vault
allowed-tools: Read, Glob, Grep
---

# 🔍 Trace Idea (Trace)

Please perform the following tasks:

1. **Receive Topic Input**: User specifies the topic or keyword to be traced.
2. **Vault-wide Search**: Search for all mentions of the topic in all notes.
3. **Trace Backlinks**: Look for relevant backlinks and references.
4. **Generate Timeline**: Display the evolution of the idea in chronological order.

## Output Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Idea Trace: [Topic]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Evolution Timeline

[Date 1] - [File 1]
> [Relevant content summary]

[Date 2] - [File 2]
> [Relevant content summary]

[Date 3] - [File 3]
> [Relevant content summary]

📊 Evolution Analysis
- Origin: [Initial idea]
- Evolution: [Changes in between]
- Status Quo: [Current understanding]

🔗 Related Links
- [[File 1]]
- [[File 2]]
```

---
**Protocol Source**: Metamates CODEBUDDY.md

## Memory & vault boundary (Metamates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
