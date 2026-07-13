import { COMMANDS } from './definitions'
import {
  getTemplatesDir,
  getWorkspaceLanguage,
  WORKSPACE_FILES,
  type WorkspaceLanguage,
} from '../constants/paths'

export interface AgentSlashCommand {
  id: string
  name: string
  category: 'daily' | 'thinking' | 'inspiration' | 'planning'
  prompt: string
  inputMode?: 'none' | 'optional' | 'required'
  requiresInput?: boolean
  inputPlaceholder?: string
  /** 由应用本地处理，不走 skill prompt 组装 */
  localHandler?: 'intelligence'
}

const COMMANDS_REQUIRING_INPUT = new Set(['/trace', '/connect', '/challenge', '/ghost', '/soal'])
const COMMANDS_ACCEPTING_OPTIONAL_INPUT = new Set([
  '/today',
  '/closeday',
  '/schedule',
  '/sync',
  '/intel',
  '/graduate',
])

const INPUT_PLACEHOLDERS: Record<string, Record<WorkspaceLanguage, string>> = {
  '/today': {
    zh: '可选补充：今天必须纳入计划的会议、约束或临时优先级…',
    en: 'Optional: meetings, constraints, or priorities to force into today’s plan…',
  },
  '/closeday': {
    zh: '可选补充：今天要特别复盘的事件、情绪、成果或问题…',
    en: 'Optional: events, emotions, wins, or problems to emphasize in today’s review…',
  },
  '/schedule': {
    zh: '可选补充：本周固定安排、不可移动时段或新的优先级…',
    en: 'Optional: fixed blocks, immovable meetings, or new priorities for this week…',
  },
  '/sync': {
    zh: '可选补充：这次同步特别要写进 Master_Control 的结论、进展或提醒…',
    en: 'Optional: conclusions, progress, or reminders that must be written into Master_Control…',
  },
  '/trace': {
    zh: '输入要溯源的主题…',
    en: 'Enter the topic to trace…',
  },
  '/connect': {
    zh: '输入两个要连接的主题…',
    en: 'Enter the two topics to connect…',
  },
  '/challenge': {
    zh: '输入要挑战的观点…',
    en: 'Enter the idea to challenge…',
  },
  '/ghost': {
    zh: '输入要模拟代写的问题或场景…',
    en: 'Enter the question or scenario to ghostwrite…',
  },
  '/soal': {
    zh: '输入要永久固化的习惯、偏好或教训…',
    en: 'Enter the habit, preference, or lesson to encode permanently…',
  },
  '/intel': {
    zh: '粘贴链接/路径/摘录文字，或用 @ 附加 PDF、图片、文档…',
    en: 'Paste a URL, path, or text excerpt — or @-attach PDFs, images, docs…',
  },
  '/graduate': {
    zh: '可选补充：指定要升级的 Inbox 条目、目标文件夹或优先级…',
    en: 'Optional: which Inbox item to graduate, target folder, or priority…',
  },
}

function buildSyncPrompt(lang: WorkspaceLanguage): string {
  const templatesDir = getTemplatesDir(lang)
  const masterControl = `${templatesDir}/${WORKSPACE_FILES.MASTER_CONTROL}`
  if (lang === 'en') {
    return `Read my vault and summarize today's activities. Then update ${masterControl} with core goals, micro-time blocks, and strategic reminders derived from today's progress. If the user supplied extra guidance, merge it into the writeback as a higher-priority instruction.\nUser input: {INPUT}`
  }
  return `读取我的工作区并总结今天的活动。然后把核心目标、微时间块和战略提醒写回 ${masterControl}。如果用户补充了额外说明，请把它当作更高优先级的写回要求一并合并。\n用户补充：{INPUT}`
}

function buildSoalPrompt(lang: WorkspaceLanguage): string {
  const secondMind = `${getTemplatesDir(lang)}/${WORKSPACE_FILES.SECOND_MIND}`
  if (lang === 'en') {
    return `Permanently integrate the following user feedback, habit, or lesson into MetaMates core evolution layer (${secondMind}). Steps: 1) Read ${secondMind}; 2) If personal preference → "User DNA", if technical habit → "Tactical Protocol", if correction → "Error Memory & Fixes"; 3) Append dated entry to "Active Learning Log"; 4) Confirm completion. User input: {INPUT}`
  }
  return `将以下用户反馈、习惯或新教训永久固化到 MetaMates 核心进化层（${secondMind}）。请执行：1. 读取 ${secondMind}；2. 个人偏好更新至「用户 DNA」，技术习惯更新至「战术协议」，纠错更新至「错误记忆与修正」；3. 在「主动学习日志」追加当前日期与条目；4. 反馈确认已永久固化。用户输入：{INPUT}`
}

function buildTracePrompt(): string {
  return 'Track how a specific idea has evolved over time across my vault. Take a topic as input, search for all mentions, follow backlinks, and output a timeline. Topic: {INPUT}'
}

function buildConnectPrompt(): string {
  return 'Find connections between two topics in my vault. Show me the notes that link them and any patterns you see. Topics: {INPUT}'
}

function buildChallengePrompt(): string {
  return 'Review my notes on this topic. Where am I contradicting myself? What assumptions am I making that might be wrong? Topic: {INPUT}'
}

function buildGhostPrompt(): string {
  return 'Based on my vault, how would I answer this question: {INPUT}? Use my voice and reference specific notes where relevant.'
}

function buildTodayPrompt(lang: WorkspaceLanguage): string {
  if (lang === 'en') {
    return `Read my daily note, calendar, and task list. Generate a prioritized plan for today and write it back to today's PLAN file. If the user supplied extra guidance, incorporate it into the plan.\nUser input: {INPUT}`
  }
  return '读取今日日记、日历和任务列表，生成今天的优先级计划，并写回今天的 PLAN 文件。如果用户补充了额外说明，请把它纳入计划。\n用户补充：{INPUT}'
}

function buildClosedayPrompt(lang: WorkspaceLanguage): string {
  if (lang === 'en') {
    return `Review what I worked on today, summarize progress, capture new ideas, and note anything unfinished that should carry over to tomorrow. Write the result back to today's daily note or review section. If the user supplied extra guidance, emphasize it in the writeback.\nUser input: {INPUT}`
  }
  return '复盘今天做了什么，总结进展，记录新想法，并列出需要结转到明天的事项。将结果写回今日日记或复盘区块。如果用户补充了额外说明，请在写回时重点体现。\n用户补充：{INPUT}'
}

function buildSchedulePrompt(lang: WorkspaceLanguage): string {
  if (lang === 'en') {
    return `Based on my current projects and priorities, suggest a schedule for this week and write the structured result back to the appropriate planning file. If the user supplied extra guidance, treat it as a hard scheduling constraint.\nUser input: {INPUT}`
  }
  return '基于当前项目和优先级，为本周生成时间安排，并将结构化结果写回合适的规划文件。如果用户补充了额外说明，请把它视为硬性排期约束。\n用户补充：{INPUT}'
}

function buildGraduatePrompt(lang: WorkspaceLanguage): string {
  if (lang === 'en') {
    return `Scan my daily notes from the past 14 days. Find ideas that deserve their own note and create standalone files for them. If the user supplied extra guidance, use it to bias which ideas to promote, where to save them, or how to prioritize the output.\nUser input: {INPUT}`
  }
  return '扫描我过去 14 天的日记，找出值得升级为独立笔记的想法并创建对应文件。如果用户提供了额外说明，请用它来偏置筛选哪些想法、保存到哪里，或如何排序输出。\n用户输入：{INPUT}'
}
function resolvePrompt(cmdId: string, basePrompt: string, lang: WorkspaceLanguage): string {
  switch (cmdId) {
    case '/today':
      return buildTodayPrompt(lang)
    case '/closeday':
      return buildClosedayPrompt(lang)
    case '/schedule':
      return buildSchedulePrompt(lang)
    case '/graduate':
      return buildGraduatePrompt(lang)
    case '/sync':
      return buildSyncPrompt(lang)
    case '/soal':
      return buildSoalPrompt(lang)
    case '/trace':
      return buildTracePrompt()
    case '/connect':
      return buildConnectPrompt()
    case '/challenge':
      return buildChallengePrompt()
    case '/ghost':
      return buildGhostPrompt()
    default:
      return basePrompt
  }
}

/** Agent panel slash commands — single source built from definitions + locale-aware paths. */
export function getAgentSlashCommands(locale?: string): AgentSlashCommand[] {
  const lang = getWorkspaceLanguage(locale)

  const fromDefinitions: AgentSlashCommand[] = COMMANDS.map((cmd) => {
    const name = cmd.id.replace(/^\//, '')
    const inputMode: AgentSlashCommand['inputMode'] = COMMANDS_REQUIRING_INPUT.has(cmd.id)
      ? 'required'
      : COMMANDS_ACCEPTING_OPTIONAL_INPUT.has(cmd.id)
        ? 'optional'
        : 'none'
    const requiresInput = inputMode === 'required'
    return {
      id: cmd.id,
      name,
      category: cmd.category,
      prompt: resolvePrompt(cmd.id, cmd.prompt, lang),
      inputMode,
      requiresInput,
      inputPlaceholder: inputMode === 'none' ? undefined : INPUT_PLACEHOLDERS[cmd.id]?.[lang],
      localHandler: cmd.id === '/intel' ? 'intelligence' : undefined,
    }
  })

  if (!fromDefinitions.some((c) => c.id === '/soal')) {
    fromDefinitions.push({
      id: '/soal',
      name: 'soal',
      category: 'planning',
      prompt: buildSoalPrompt(lang),
      inputMode: 'required',
      requiresInput: true,
      inputPlaceholder: INPUT_PLACEHOLDERS['/soal'][lang],
    })
  }

  return fromDefinitions
}
