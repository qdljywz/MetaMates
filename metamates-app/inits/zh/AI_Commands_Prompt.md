# 🤖 MetaMates + Gemini CLI: 15 个核心自动化命令 (Prompt 集合)

本文档提供 15 个可以直接发送给 AI 助手（如 Gemini CLI）的提示词 (Prompt)，用于在您的 MetaMates 库中构建自动化工作流。

---

## 📂 1. 日常管理类 (Daily Management)

### /context (加载上下文)
*   **功能**: 让 AI 读取您最近的项目、反思和优先级，快速进入工作状态。
*   **Prompt**:
    > "Read my vault and summarize my current context. Include active projects, recent reflections, and any priorities I've mentioned in the last 7 days."

### /today (今日计划)
*   **功能**: 根据日记、日历和任务列表，生成一份按优先级排序的今日行动方案。
*   **Prompt**:
    > "Read my daily note, calendar, and task list. Generate a prioritized plan for today based on what I've said is important this week."

### /closeday (每日复盘)
*   **功能**: 总结当天进展，记录新想法，并列出需要结转到明天的任务。
*   **Prompt**:
    > "Review what I worked on today. Summarize progress, capture any new ideas that came up, and note anything unfinished that should carry over to tomorrow."

### /schedule (时间调度)
*   **功能**: 根据优先级和日历，建议本周的时间分配方案，标记潜在冲突。
*   **Prompt**:
    > "Based on my current projects and priorities, suggest a schedule for this week. Flag any conflicts between what I say matters and how I'm spending time."

---

## 🧠 2. 深度思考类 (Deep Thinking)

### /trace (溯源想法)
*   **功能**: 追踪某个特定想法在整个库中是如何演变的轨迹。
*   **Prompt**:
    > "Track how a specific idea has evolved over time across my MetaMates vault. Take a topic as input, search for all mentions, follow backlinks, and output a timeline."

### /connect (寻找连接)
*   **功能**: 寻找两个看似无关的主题之间的意外联系。
*   **Prompt**:
    > "Find connections between [topic A] and [topic B] in my vault. Show me the notes that link them and any patterns you see."

### /challenge (挑战观点)
*   **功能**: 压力测试您的观点，寻找矛盾点或潜在错误假设。
*   **Prompt**:
    > "Review my notes on [topic]. Where am I contradicting myself? What assumptions am I making that might be wrong?"

### /ghost (模拟代写)
*   **功能**: 模拟您的口吻和价值观来起草文档或回复。
*   **Prompt**:
    > "Based on my vault, how would I answer this question: [question]? Use my voice and reference specific notes where relevant."

---

## 💡 3. 灵感挖掘类 (Insight Discovery)

### /ideas (点子报告)
*   **功能**: 扫描库中新兴模式，生成包含工具、人脉和写作主题的报告。
*   **Prompt**:
    > "Scan my vault for emerging patterns. Generate ideas for: tools I should build, people I should reach out to, topics I should investigate, and things I should write."

### /graduate (灵感升级)
*   **功能**: 从日记与 Inbox 剪藏中提取灵感，升维为 `03_点滴积累/` 永久笔记；报告中须列出 Inbox 源路径，MetaMates 写回后自动归档到 `Inbox/processed/`。
*   **Prompt**:
    > "Scan my daily notes and unprocessed Inbox captures from the past 14 days. Upgrade ideas into standalone notes. In your report, cite full paths for any Inbox sources so the app can archive them after writeback."

### /drift (潜意识漂移)
*   **功能**: 捕捉在不同笔记中反复出现但尚未成形的关键词或主题。
*   **Prompt**:
    > "Scan my vault for recurring themes or phrases that appear across unrelated notes. What ideas am I drifting toward without realizing it?"

### /emerge (项目涌现)
*   **功能**: 识别正在聚合而成的潜在项目、文章或产品雏形。
*   **Prompt**:
    > "Find clusters of related ideas in my vault that could become a project, essay, or product."

### /intel (情报导入)
*   **功能**: 抓取网页或工作区文档（PDF/Word/表格/图片等），写入 `04_情报与连接/` 并深化摘要与双链。
*   **Prompt**:
    > "Import external intelligence: URL or file path. After MetaMates creates a draft note under the intelligence folder, deepen the summary, add tags, [[wiki links]], and action items. Preserve source metadata."

---

## 🛰️ 4. 核心维护指令 (Maintenance)

### /sync (系统同步)
*   **功能**: 核心主控指令。扫描全库进展，复盘今日并自动更新 Master_Control.md。
*   **Prompt**:
    > "Read my vault and summarize today's activities. Then, based on the MetaMates protocol in GEMINI.md, update the Master_Control.md file. Ensure it includes core goals, micro-time blocks, and strategic reminders derived from today's progress."

### /soal (进化同步)
*   **功能**: 显式同步用户的习惯、偏好或教训至 2M.md，实现 AI 的永久进化。
*   **Prompt**:
    > "Take this feedback as a permanent evolution point: [User Input]. Read '05_模板与配置/2M.md', categorize this insight into 'User DNA', 'Tactical Protocols', or 'Error Memory', and update the file. Ensure the 'Active Learning Log' is updated with today's date."

---
> **核心金句**: "The quality of information that the agent has entirely determines what it can do for you. Your vault is that context."
