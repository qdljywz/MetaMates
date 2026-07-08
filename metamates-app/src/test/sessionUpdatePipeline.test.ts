import { describe, expect, it } from 'vitest'
import {
  buildTurnFinishMessage,
  buildTurnStartMessage,
  processSessionUpdate,
  type SessionPipelineContext,
} from '../../electron/shared/sessionUpdatePipeline'

function makeCtx(overrides: Partial<SessionPipelineContext> = {}): SessionPipelineContext {
  return {
    backend: 'codebuddy',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    agentMsgId: null,
    assignAgentMsgId: () => 'agent-msg-1',
    clearAgentMsgId: () => {},
    ...overrides,
  }
}

describe('sessionUpdatePipeline', () => {
  it('emits start/finish control messages', () => {
    const ctx = makeCtx()
    expect(buildTurnStartMessage(ctx).type).toBe('start')
    expect(buildTurnFinishMessage(ctx).type).toBe('finish')
  })

  it('sanitizes leaked write_file JSON in agent_message_chunk', () => {
    const payload = JSON.stringify({
      content: '# Plan\\n\\n- [ ] task',
      file_path: 'E:\\\\vault\\\\PLAN.md',
    })
    const { stream, db } = processSessionUpdate(
      {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: payload },
      },
      makeCtx(),
    )
    expect(stream).toHaveLength(1)
    expect(stream[0].type).toBe('text')
    expect((stream[0].data as { content: string }).content).toBe('# Plan\n\n- [ ] task')
    expect(db).toHaveLength(1)
    expect(db[0].kind).toBe('accumulate_text')
  })

  it('maps tool_call to acp_tool_call stream + db insert', () => {
    const { stream, db } = processSessionUpdate(
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'tc-1',
        title: 'write_file',
        status: 'in_progress',
      },
      makeCtx(),
    )
    expect(stream[0].type).toBe('acp_tool_call')
    expect(db[0].kind).toBe('insert_tool')
  })

  it('emits finish on turn end (via buildTurnFinishMessage)', () => {
    const finish = buildTurnFinishMessage(makeCtx())
    expect(finish.type).toBe('finish')
    expect(finish.msg_id).toBe('turn-1')
  })
})
