import { useState, useCallback, useRef } from 'react'
import type { ThinkingStep } from '../components/AgentThinking'
import { createThinkingStep, updateStepStatus } from '../components/AgentThinking'
import type { ToolExecution } from '../components/ToolExecution'
import { createToolExecution, updateExecutionStatus } from '../components/ToolExecution'
import type { MemoryContextData, MemoryItem } from '../components/MemoryContext'
import { longTermMemoryService } from '../services/memory/longTermMemory'

export interface AgentState {
  isThinking: boolean
  thinkingSteps: ThinkingStep[]
  toolExecutions: ToolExecution[]
  memoryContext: MemoryContextData | null
  currentPhase: 'idle' | 'planning' | 'executing' | 'reflecting'
}

export const useAgentState = () => {
  const [state, setState] = useState<AgentState>({
    isThinking: false,
    thinkingSteps: [],
    toolExecutions: [],
    memoryContext: null,
    currentPhase: 'idle',
  })

  const stateRef = useRef(state)
  stateRef.current = state

  const startThinking = useCallback(() => {
    setState(prev => ({
      ...prev,
      isThinking: true,
      thinkingSteps: [],
      toolExecutions: [],
      currentPhase: 'planning',
    }))
  }, [])

  const stopThinking = useCallback(() => {
    setState(prev => ({
      ...prev,
      isThinking: false,
      currentPhase: 'idle',
    }))
  }, [])

  const addThinkingStep = useCallback((type: ThinkingStep['type'], title: string, description?: string) => {
    const step = createThinkingStep(type, title, description)
    setState(prev => ({
      ...prev,
      thinkingSteps: [...prev.thinkingSteps, step],
    }))
    return step.id
  }, [])

  const updateThinkingStep = useCallback((stepId: string, status: ThinkingStep['status'], details?: string) => {
    setState(prev => ({
      ...prev,
      thinkingSteps: updateStepStatus(prev.thinkingSteps, stepId, status, details),
    }))
  }, [])

  const addToolExecution = useCallback((tool: string, args: Record<string, unknown>) => {
    const execution = createToolExecution(tool, args)
    setState(prev => ({
      ...prev,
      toolExecutions: [...prev.toolExecutions, execution],
    }))
    return execution.id
  }, [])

  const updateToolExecution = useCallback((
    execId: string, 
    status: ToolExecution['status'], 
    result?: unknown, 
    error?: string
  ) => {
    setState(prev => ({
      ...prev,
      toolExecutions: updateExecutionStatus(prev.toolExecutions, execId, status, result, error),
    }))
  }, [])

  const loadMemoryContext = useCallback((query?: string) => {
    try {
      const memory = longTermMemoryService['memory']
      const stats = longTermMemoryService.getStats()
      
      const relevantMemories: MemoryItem[] = query 
        ? longTermMemoryService.getRelevantContext(query, 5).map((content, index) => ({
            id: `relevant_${index}`,
            type: 'fact' as const,
            content,
            importance: 5,
            source: 'memory',
            timestamp: Date.now(),
          }))
        : []

      const memoryContext: MemoryContextData = {
        userProfile: {
          name: memory.userProfile.name,
          preferences: memory.userProfile.preferences,
        },
        projectContext: memory.projectContext.name ? {
          name: memory.projectContext.name,
          description: memory.projectContext.description,
        } : undefined,
        relevantMemories,
        conversationSummaries: memory.conversationSummaries.slice(0, 3).map(s => ({
          sessionId: s.sessionId,
          summary: s.summary,
          keyPoints: s.keyPoints,
        })),
        stats: {
          totalEntries: stats.totalEntries,
          totalSummaries: stats.totalSummaries,
          oldestEntry: stats.oldestEntry ?? undefined,
          newestEntry: stats.newestEntry ?? undefined,
        },
      }

      setState(prev => ({
        ...prev,
        memoryContext,
      }))

      return memoryContext
    } catch (error) {
      console.error('Failed to load memory context:', error)
      return null
    }
  }, [])

  const setCurrentPhase = useCallback((phase: AgentState['currentPhase']) => {
    setState(prev => ({
      ...prev,
      currentPhase: phase,
    }))
  }, [])

  const reset = useCallback(() => {
    setState({
      isThinking: false,
      thinkingSteps: [],
      toolExecutions: [],
      memoryContext: null,
      currentPhase: 'idle',
    })
  }, [])

  const executeWithThinking = useCallback(async <T,>(
    task: string,
    executor: () => Promise<T>,
    options?: {
      onPlanning?: () => void
      onExecuting?: () => void
      onReflecting?: () => void
    }
  ): Promise<T> => {
    startThinking()

    const planningStepId = addThinkingStep('planning', '分析请求', `正在分析: ${task}`)
    updateThinkingStep(planningStepId, 'running')
    
    await new Promise(resolve => setTimeout(resolve, 300))
    updateThinkingStep(planningStepId, 'completed', '已识别用户意图和相关上下文')

    options?.onPlanning?.()
    setCurrentPhase('executing')

    const executingStepId = addThinkingStep('executing', '执行任务', '正在执行操作...')
    updateThinkingStep(executingStepId, 'running')

    try {
      const result = await executor()
      updateThinkingStep(executingStepId, 'completed', '任务执行成功')
      
      options?.onExecuting?.()
      setCurrentPhase('reflecting')

      const reflectingStepId = addThinkingStep('reflecting', '反思结果', '正在总结执行结果...')
      updateThinkingStep(reflectingStepId, 'running')
      
      await new Promise(resolve => setTimeout(resolve, 200))
      updateThinkingStep(reflectingStepId, 'completed', '已完成结果反思')

      options?.onReflecting?.()
      stopThinking()

      return result
    } catch (error: any) {
      updateThinkingStep(executingStepId, 'failed', `执行失败: ${error.message}`)
      stopThinking()
      throw error
    }
  }, [startThinking, stopThinking, addThinkingStep, updateThinkingStep, setCurrentPhase])

  return {
    ...state,
    startThinking,
    stopThinking,
    addThinkingStep,
    updateThinkingStep,
    addToolExecution,
    updateToolExecution,
    loadMemoryContext,
    setCurrentPhase,
    reset,
    executeWithThinking,
  }
}

export default useAgentState
