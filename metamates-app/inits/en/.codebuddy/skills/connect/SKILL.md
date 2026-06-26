---
name: connect
description: Find Connections - Find unexpected links between two seemingly unrelated topics
allowed-tools: Read, Glob, Grep
---

# 🔗 Find Connections (Connect)

Please perform the following tasks:

1. **Receive Two Topics**: User provides Topic A and Topic B.
2. **Search Individually**: Search for relevant notes for both topics in the vault.
3. **Find Intersection**: Identify notes or concepts that connect the two topics.
4. **Analyze Patterns**: Showcase discovered links and potential patterns.

## Output Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 Topic Connection Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 Topic A: [Name]
Relevant Notes:
- [[Note 1]] - [Summary]
- [[Note 2]] - [Summary]

📌 Topic B: [Name]
Relevant Notes:
- [[Note 3]] - [Summary]
- [[Note 4]] - [Summary]

🔗 Connections Found
- [[Bridge Note]]: [How it connects the two]

💡 Potential Patterns
- [Pattern 1]: [Explanation]
- [Pattern 2]: [Explanation]

🎯 Inspirations
- [Inspiration 1]
- [Inspiration 2]
```

---
**Protocol Source**: Metamates CODEBUDDY.md

## Memory & vault boundary (Metamates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
