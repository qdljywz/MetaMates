# 🤖 MetaMates: 15 Core Slash Commands (Prompt Collection)

This document provides 15 prompts to use directly from the MetaMates **thinking engine** and build automated workflows in your inspiration vault.

---

## 📂 1. Daily Management

### /context (Load Context)
*   **Function**: Have the AI read your recent projects, reflections, and priorities to quickly get into a working state.
*   **Prompt**:
    > "Read my vault and summarize my current context. Include active projects, recent reflections, and any priorities I've mentioned in the last 7 days."

### /today (Daily Plan)
*   **Function**: Generate a prioritized action plan for today based on your journal, calendar, and task list.
*   **Prompt**:
    > "Read my daily note, calendar, and task list. Generate a prioritized plan for today based on what I've said is important this week."

### /closeday (Daily Review)
*   **Function**: Summarize the day's progress, record new ideas, and list tasks that need to be carried over to tomorrow.
*   **Prompt**:
    > "Review what I worked on today. Summarize progress, capture any new ideas that came up, and note anything unfinished that should carry over to tomorrow."

### /schedule (Time Scheduling)
*   **Function**: Suggest a time allocation plan for this week based on priorities and calendar, flagging potential conflicts.
*   **Prompt**:
    > "Based on my current projects and priorities, suggest a schedule for this week. Flag any conflicts between what I say matters and how I'm spending time."

---

## 🧠 2. Deep Thinking

### /trace (Trace Idea)
*   **Function**: Track the evolution of a specific idea across the inspiration vault.
*   **Prompt**:
    > "Track how a specific idea has evolved over time across my inspiration vault. Take a topic as input, search for all mentions, follow backlinks, and output a timeline."

### /connect (Find Connections)
*   **Function**: Find unexpected connections between two seemingly unrelated topics.
*   **Prompt**:
    > "Find connections between [topic A] and [topic B] in my vault. Show me the notes that link them and any patterns you see."

### /challenge (Challenge Perspective)
*   **Function**: Stress-test your viewpoints, looking for contradictions or potential false assumptions.
*   **Prompt**:
    > "Review my notes on [topic]. Where am I contradicting myself? What assumptions am I making that might be wrong?"

### /ghost (Ghostwriting)
*   **Function**: Mimic your tone and values to draft documents or replies.
*   **Prompt**:
    > "Based on my vault, how would I answer this question: [question]? Use my voice and reference specific notes where relevant."

---

## 💡 3. Insight Discovery

### /ideas (Insight Report)
*   **Function**: Scan the vault for emerging patterns and generate a report including tools, connections, and writing topics.
*   **Prompt**:
    > "Scan my vault for emerging patterns. Generate ideas for: tools I should build, people I should reach out to, topics I should investigate, and things I should write."

### /graduate (Insight Upgrade)
*   **Function**: Extract insights from journals and unprocessed Inbox captures into permanent notes under `03_Insights/`; cite Inbox source paths in the report — MetaMates auto-archives them to `Inbox/processed/` after writeback.
*   **Prompt**:
    > "Scan my daily notes and unprocessed Inbox captures from the past 14 days. Upgrade ideas into standalone notes under 03_Insights/. In your report, cite full paths for any Inbox sources so the app can archive them after writeback."

### /drift (Subconscious Drift)
*   **Function**: Capture keywords or themes that recur across different notes but haven't yet taken shape.
*   **Prompt**:
    > "Scan my vault for recurring themes or phrases that appear across unrelated notes. What ideas am I drifting toward without realizing it?"

### /emerge (Project Emergence)
*   **Function**: Identify potential projects, essays, or product prototypes that are coalescing.
*   **Prompt**:
    > "Find clusters of related ideas in my vault that could become a project, essay, or product."

### /intel (Intelligence Import)
*   **Function**: Fetch web pages or workspace documents (PDF/Word/spreadsheets/images) into `04_Intelligence/` and deepen summaries with wiki links.
*   **Prompt**:
    > "Import external intelligence: URL or file path. After MetaMates creates a draft note under the intelligence folder, deepen the summary, add tags, [[wiki links]], and action items. Preserve source metadata."

---

## 🛰️ 4. Core Maintenance Commands

### /sync (System Sync)
*   **Function**: Core master control command. Scan the entire vault's progress, review the day, and automatically update Master_Control.md.
*   **Prompt**:
    > "Read my vault and summarize today's activities. Then, based on the MetaMates protocol in GEMINI.md, update the Master_Control.md file. Ensure it includes core goals, micro-time blocks, and strategic reminders derived from today's progress."

### /soal (Evolutionary Sync)
*   **Function**: Explicitly sync user habits, preferences, or lessons to 2M.md for permanent AI evolution.
*   **Prompt**:
    > "Take this feedback as a permanent evolution point: [User Input]. Read '05_Templates_and_Config/2M.md', categorize this insight into 'User DNA', 'Tactical Protocols', or 'Error Memory', and update the file. Ensure the 'Active Learning Log' is updated with today's date."

---
> **Core Motto**: "The quality of information that the agent has entirely determines what it can do for you. Your vault is that context."
