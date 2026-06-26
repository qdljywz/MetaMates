---
name: ghost
description: Ghostwriting - Mimic your tone and values to draft documents or replies based on your knowledge base
---

Please perform the following tasks:

1. **Receive Question/Task**: User inputs the question to be answered or the content to be written.
2. **Analyze User Style**:
   - Read recent daily notes to understand linguistic style.
   - Identify common vocabulary and expressions.
   - Extract values and viewpoints.
3. **Search Relevant Knowledge**: Find relevant notes and quotes in the vault.
4. **Mimic User Tone**: Draft the reply in the user's style.

Output Format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👻 Ghostwriting
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Style Analysis
- Linguistic Style: [Formal/Casual/...]
- Common Expressions: [Example]
- Values/Viewpoints: [...]

📚 Reference Notes
- [Note 1]: [Relevant content summary]
- [Note 2]: [Relevant content summary]

✍️ Drafted Content
---
[Content drafted in your tone]
---

💡 Notes
- The above content is based on [X] of your notes.
- Viewpoints from [Specific Note] were referenced.
```

## Memory & vault boundary (Metamates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
