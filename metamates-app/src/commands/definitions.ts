export interface Command {
  id: string
  name: string
  description: string
  shortcut?: string
  category: 'daily' | 'thinking' | 'inspiration' | 'planning'
  prompt: string
  requiresContext?: boolean
  executeDirectly?: boolean
  outputFormat?: 'report' | 'plan' | 'analysis' | 'file'
  outputFileName?: string
}

export const COMMANDS: Command[] = [
  {
    id: '/context',
    name: '加载上下文',
    description: '读取最近的项目、反思和优先级，快速进入工作状态',
    shortcut: 'Ctrl+L',
    category: 'daily',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'report',
    prompt: `Read my vault and summarize my current context. Include active projects, recent reflections, and any priorities I've mentioned in the last 7 days.`,
  },
  {
    id: '/today',
    name: '今日计划',
    description: '根据日记、日历和任务列表，生成一份按优先级排序的今日行动方案',
    shortcut: 'Ctrl+T',
    category: 'daily',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'plan',
    prompt: `Read my daily note, calendar, and task list. Generate a prioritized plan for today based on what I've said is important this week.`,
  },
  {
    id: '/closeday',
    name: '每日复盘',
    description: '总结当天进展，记录新想法，并列出需要结转到明天的任务',
    shortcut: 'Ctrl+D',
    category: 'daily',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'report',
    prompt: `Review what I worked on today. Summarize progress, capture any new ideas that came up, and note anything unfinished that should carry over to tomorrow.`,
  },
  {
    id: '/schedule',
    name: '时间调度',
    description: '根据优先级和日历，建议本周的时间分配方案',
    shortcut: 'Ctrl+S',
    category: 'daily',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'plan',
    prompt: `Based on my current projects and priorities, suggest a schedule for this week. Flag any conflicts between what I say matters and how I'm spending time.`,
  },
  {
    id: '/trace',
    name: '溯源想法',
    description: '追踪某个特定想法在整个库中是如何演变的轨迹',
    shortcut: 'Ctrl+Shift+T',
    category: 'thinking',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'analysis',
    prompt: `Track how a specific idea has evolved over time across my MetaMates vault. Take a topic as input, search for all mentions, follow backlinks, and output a timeline.`,
  },
  {
    id: '/connect',
    name: '寻找连接',
    description: '寻找两个看似无关的主题之间的意外联系',
    shortcut: 'Ctrl+Shift+C',
    category: 'thinking',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'analysis',
    prompt: `Find connections between [topic A] and [topic B] in my vault. Show me the notes that link them and any patterns you see.`,
  },
  {
    id: '/challenge',
    name: '挑战观点',
    description: '压力测试观点，寻找矛盾点或潜在错误假设',
    shortcut: 'Ctrl+Shift+H',
    category: 'thinking',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'analysis',
    prompt: `Review my notes on [topic]. Where am I contradicting myself? What assumptions am I making that might be wrong?`,
  },
  {
    id: '/ghost',
    name: '模拟代写',
    description: '模拟用户的口吻和价值观来起草文档或回复',
    shortcut: 'Ctrl+Shift+G',
    category: 'thinking',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'file',
    prompt: `Based on my vault, how would I answer this question: [question]? Use my voice and reference specific notes where relevant.`,
  },
  {
    id: '/ideas',
    name: '点子报告',
    description: '扫描库中新兴模式，生成包含工具、人脉和写作主题的报告',
    shortcut: 'Ctrl+I',
    category: 'inspiration',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'report',
    prompt: `Scan my vault for emerging patterns. Generate ideas for: tools I should build, people I should reach out to, topics I should investigate, and things I should write.`,
  },
  {
    id: '/graduate',
    name: '灵感升级',
    description: '从碎片化日记中提取灵感，转化为独立的永久笔记',
    shortcut: 'Ctrl+G',
    category: 'inspiration',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'file',
    prompt: `Scan my daily notes from the past 14 days. Find ideas that deserve their own note and create standalone files for them.`,
  },
  {
    id: '/drift',
    name: '潜意识漂移',
    description: '捕捉在不同笔记中反复出现但尚未成形的关键词或主题',
    shortcut: 'Ctrl+Shift+D',
    category: 'inspiration',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'analysis',
    prompt: `Scan my vault for recurring themes or phrases that appear across unrelated notes. What ideas am I drifting toward without realizing it?`,
  },
  {
    id: '/emerge',
    name: '项目涌现',
    description: '识别正在聚合而成的潜在项目、文章或产品雏形',
    shortcut: 'Ctrl+E',
    category: 'inspiration',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'report',
    prompt: `Find clusters of related ideas in my vault that could become a project, essay, or product.`,
  },
  {
    id: '/sync',
    name: '规划基础',
    description: '总结最新资讯和进展，同步到 Master Control，为后续规划提供依据',
    shortcut: 'Ctrl+Shift+S',
    category: 'planning',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'report',
    prompt: `Read my vault and summarize today's activities. Then update Master_Control.md in your workspace templates folder with core goals, micro-time blocks, and strategic reminders derived from today's progress.`,
  },
  {
    id: '/soal',
    name: '进化固化',
    description: '将习惯或教训永久固化到 2M.md 核心进化层',
    shortcut: 'Ctrl+Shift+O',
    category: 'planning',
    requiresContext: true,
    executeDirectly: true,
    outputFormat: 'file',
    prompt: `Integrate user feedback into 2M.md core evolution layer in the templates folder.`,
  },
  {
    id: '/intel',
    name: '情报导入',
    description: '抓取网页或文档，生成情报笔记并由 Agent 深化摘要与关联',
    category: 'inspiration',
    requiresContext: false,
    executeDirectly: false,
    outputFormat: 'file',
    prompt: `The user provides a web URL or a workspace file path (PDF, image, docx, xlsx, etc.). MetaMates has already extracted text and created a draft intelligence note under the intelligence folder. Deepen that note: structured summary, key data, suggested tags, [[wiki links]] to related vault notes, and actionable follow-ups. Preserve source metadata in the note.`,
  },
]

export function getCommandById(id: string): Command | undefined {
  return COMMANDS.find(cmd => cmd.id === id)
}

export function getCommandsByCategory(category: Command['category']): Command[] {
  return COMMANDS.filter(cmd => cmd.category === category)
}

export function searchCommands(query: string): Command[] {
  const lowerQuery = query.toLowerCase()
  return COMMANDS.filter(cmd => 
    cmd.name.toLowerCase().includes(lowerQuery) ||
    cmd.description.toLowerCase().includes(lowerQuery) ||
    cmd.id.toLowerCase().includes(lowerQuery)
  )
}
