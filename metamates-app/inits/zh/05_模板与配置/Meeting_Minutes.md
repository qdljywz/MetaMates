---
date: <% tp.date.now("YYYY-MM-DD") %>
type: meeting
tags:
  - Meeting_Minutes
  - Decision_Log
---

# 🏥 会议纪要: [在此输入会议议题]

- **时间**: <% tp.date.now("YYYY-MM-DD HH:mm") %>
- **参与人**: [参与人 A], [参与人 B]
- **议题状态**: [讨论中/已决策/待跟进]

---

## 🎯 核心决策 (Key Decisions)
*在复杂的讨论中，最重要的是记下最终达成了什么共识。*
1. [决策事项 A]
2. [决策事项 B]

## 📝 讨论要点 (Key Discussion Points)
- **[要点 A]**: [核心观点陈述]
- **[要点 B]**: [核心观点陈述]

## ⚡ 待办事项 (Action Items)
- [ ] **[责任人]**: [任务 A 内容] - [截止日期]
- [ ] **[责任人]**: [任务 B 内容] - [截止日期]

---

## 🤖 Gemini CLI 协作区
- [ ] **指令提示**: 输入 `/closeday`，让 Gemini CLI 提取上述待办事项，并自动创建/更新至对应的每日计划中。
- [ ] **指令提示**: 输入 `/ghost`，并提问：“基于这些决策，我该如何向投资人/高层同步进展？”
