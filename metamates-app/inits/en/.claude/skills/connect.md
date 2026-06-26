---
name: connect
description: Find Connections - Find unexpected connections between two seemingly unrelated topics
---

Please perform the following tasks:

1. **Receive Two Topics**: User inputs Topic A and Topic B.
2. **Search Individually**: Search for all mentions of these two topics in the vault.
3. **Find Connection Points**: Identify notes that mention both or are indirectly related.
4. **Analyze Patterns**: Uncover potential links between the two topics.
5. **Output Connection Map**

Output Format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 Topic Connection Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 Topic A: [Name]
- Number of relevant notes: [X]
- Core concepts: [...]

📌 Topic B: [Name]
- Number of relevant notes: [X]
- Core concepts: [...]

🔗 Connections Found
Direct Connections:
- [Note Name]: Mentions both topics; the link is [...]

Indirect Connections:
- [Note 1] → [Note 2]: Connected via [Intermediate Concept]

💡 Insights
- [Unexpected discovery about the relationship between these two topics]
- [Potential new research directions]
```

## Memory & vault boundary (Metamates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
