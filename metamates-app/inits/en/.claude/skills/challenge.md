---
name: challenge
description: Challenge Perspective - Stress-test your viewpoints, looking for contradictions or potential false assumptions
---

Please perform the following tasks:

1. **Receive Topic**: User inputs the viewpoint/topic to be challenged.
2. **Collect Relevant Notes**: Search the vault for all discussions regarding this topic.
3. **Find Contradictions**: Identify contradictions between notes.
4. **Challenge Assumptions**: Find potential false assumptions or logical loopholes.
5. **Pose Questions**

Output Format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 Viewpoint Challenge: [Topic]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Your Viewpoint Summary
- [Point 1]
- [Point 2]
- [Point 3]

⚠️ Contradictions Found
- [Description]: In [Note A] you said X, but in [Note B] you said Y.

🔍 Potential False Assumptions
- [Assumption 1]: [Why this assumption might be problematic]
- [Assumption 2]: [...]

💪 Challenging Questions
- [Question 1]
- [Question 2]

💡 Suggestions for Improvement
- [How to refine this viewpoint]
```

## Memory & vault boundary (Metamates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
