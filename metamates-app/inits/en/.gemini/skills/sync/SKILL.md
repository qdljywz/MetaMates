---
name: sync
description: System Sync - Scan the entire vault's progress, review the day, and automatically update Master_Control.md
allowed-tools: Read, Write, Glob, Grep
---

# 🔄 System Sync (Sync)

Please perform the following tasks:

1. **Scan Today's Activities**: Read today's daily journal and related files to understand today's progress.
2. **Read Master_Control**: Check the current status of `05_Templates_and_Config/Master_Control.md`.
3. **Identify Core Progress**: Summarize important work completed and ideas generated today.
4. **Update Master_Control**: Update the Master_Control.md file according to the MetaMates protocol.

## Update content should include:
- 📊 Progress on core goals
- ⏱️ Micro-time block records
- 🎯 Strategic reminders
- 📈 Global progress

## Output Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 System Sync Completed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Sync Time: [Date and Time]

📊 Today's Progress Summary
- [Progress 1]
- [Progress 2]

✅ Master_Control.md Updated
- New Content: [Description]
- Updated Content: [Description]
```

**Important**: After updating, Master_Control.md must be read to verify the changes are correct.

---
**Protocol Source**: MetaMates CODEBUDDY.md

## Memory & vault boundary (MetaMates required)

- Mirror user-facing long-term memory to `04_Intelligence/Memory_Index.md` (details under `04_Intelligence/Reference/`)
- **Never** write only to `~/.codebuddy`, CLI caches, or paths outside the vault
- When this command requires writeback: use Write/edit tools and **read back to verify** (Act & Verify)
