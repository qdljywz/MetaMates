---
name: ghost
description: Ghostwriting - Mimic your tone and values to draft documents or replies
allowed-tools: Read, Glob, Grep, Write
---

# 👻 Ghostwriting (Ghost)

Please perform the following tasks:

1. **Understand User Style**: Learn the user's writing style and common expressions from historical notes.
2. **Understand Values**: Extract core values from Master_Control and reflection notes.
3. **Receive Writing Task**: User provides the question or document type to be drafted.
4. **Ghostwriting Output**: Generate content in the user's tone and values.

## Output Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👻 Ghostwriting Output
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Task: [Question/Document Type]

---

[Generated Ghostwriting Content]

---

📊 Evidence of Style
- Reference Notes: [[Note 1]], [[Note 2]]
- Core Values: [Value 1], [Value 2]
- Writing Characteristics: [Description]
```

---
**Protocol Source**: Metamates CODEBUDDY.md

## Memory & vault boundary (Metamates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
