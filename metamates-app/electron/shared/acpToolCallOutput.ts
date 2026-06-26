/**
 * Sanitize ACP tool call payloads (ported from AionUi acpToolCallOutput.ts).
 */

export interface AcpRawOutput {
  result?: string
  saved_path?: string
  image?: { path?: string; mime_type?: string; source?: string }
  result_omitted?: boolean
  result_omitted_reason?: string
  result_bytes?: number
  raw_output?: AcpRawOutput
  rawOutput?: AcpRawOutput
}

export interface ToolCallUpdatePayload {
  sessionUpdate?: string
  toolCallId?: string
  tool_call_id?: string
  title?: string
  kind?: string
  status?: string
  content?: unknown
  rawInput?: unknown
  raw_input?: unknown
  rawOutput?: AcpRawOutput
  raw_output?: AcpRawOutput
}

const INLINE_IMAGE_RESULT_LIMIT = 64 * 1024
const IMAGE_PATH_EXTENSION_RE = /\.(?:png|jpe?g|webp|gif)$/i

function isProbablyInlineImageResult(value: string): boolean {
  return (
    value.length > INLINE_IMAGE_RESULT_LIMIT
    && (value.startsWith('iVBORw0KGgo')
      || value.startsWith('/9j/')
      || value.startsWith('UklGR')
      || value.startsWith('data:image/'))
  )
}

function sanitizeAcpRawOutput(rawOutput?: AcpRawOutput): AcpRawOutput | undefined {
  if (!rawOutput) return rawOutput
  const result = rawOutput.result
  const savedPath = rawOutput.saved_path
  if (typeof result !== 'string' || !isProbablyInlineImageResult(result)) {
    return rawOutput
  }
  const { result: _result, ...rest } = rawOutput
  const sanitized: AcpRawOutput = {
    ...rest,
    result_omitted: true,
    result_omitted_reason: rawOutput.result_omitted_reason || 'image_base64',
    result_bytes: rawOutput.result_bytes || result.length,
  }
  if (rawOutput.image || (typeof savedPath === 'string' && savedPath)) {
    const path = rawOutput.image?.path || savedPath
    sanitized.image = rawOutput.image || { path, mime_type: 'image/png', source: 'codex_image_generation' }
  }
  return sanitized
}

export function sanitizeAcpToolUpdate(update: ToolCallUpdatePayload): ToolCallUpdatePayload {
  return {
    ...update,
    rawOutput: sanitizeAcpRawOutput(update.rawOutput || update.raw_output),
    raw_output: sanitizeAcpRawOutput(update.raw_output || update.rawOutput),
  }
}

export function resolveToolCallId(update: Record<string, unknown>): string {
  const id = update.toolCallId ?? update.tool_call_id
  return typeof id === 'string' ? id : ''
}
