---
date: <% tp.date.now("YYYY-MM-DD") %>
type: meeting
tags:
  - Meeting_Minutes
  - Decision_Log
---

# 🏥 Meeting Minutes: [Enter Meeting Topic Here]

- **Time**: <% tp.date.now("YYYY-MM-DD HH:mm") %>
- **Participants**: [Participant A], [Participant B]
- **Issue Status**: [In Discussion / Decided / Pending Follow-up]

---

## 🎯 Key Decisions
*In complex discussions, the most important thing is to record what final consensus was reached.*
1. [Decision A]
2. [Decision B]

## 📝 Key Discussion Points
- **[Point A]**: [Statement of core viewpoint]
- **[Point B]**: [Statement of core viewpoint]

## ⚡ Action Items
- [ ] **[Owner]**: [Task A Content] - [Deadline]
- [ ] **[Owner]**: [Task B Content] - [Deadline]

---

## 🤖 Gemini CLI Collaboration Area
- [ ] **Command Prompt**: Type `/closeday` to let Gemini CLI extract the above action items and automatically create/update them in the corresponding daily plan.
- [ ] **Command Prompt**: Type `/ghost` and ask: "Based on these decisions, how should I sync progress with investors/senior management?"
