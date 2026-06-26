---
name: challenge
description: Challenge Perspective - Stress-test your viewpoints, looking for contradictions or potential false assumptions
allowed-tools: Read, Glob, Grep
---

# ⚔️ Challenge Perspective (Challenge)

Please perform the following tasks:

1. **Receive Topic**: User inputs the viewpoint/topic to be challenged.
2. **Search Relevant Notes**: Find all records concerning this topic.
3. **Identify Contradictions**: Look for self-contradictions or inconsistent statements.
4. **Challenge Assumptions**: Uncover underlying implicit assumptions and question their validity.

## Output Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚔️ Viewpoint Challenge: [Topic]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Your Viewpoint Summary
- [Point 1]
- [Point 2]

⚠️ Contradictions Found
- [[Note A]] says: "..."
- [[Note B]] says: "..."
→ Contradiction Point: [Explanation]

🤔 Potential False Assumptions
1. [Assumption 1] - Why it might be wrong
2. [Assumption 2] - Why it might be wrong

💡 Challenging Questions
- What if [Condition] does not hold?
- What evidence refutes this viewpoint?

🔄 Suggested Corrections
- [Correction 1]
- [Correction 2]
```

---
**Protocol Source**: Metamates CODEBUDDY.md

## Memory & vault boundary (Metamates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
