/** Wall-clock remaining time for an in-flight session/prompt request. */
export function computePromptTimeoutRemaining(
  promptOriginTime: number,
  timeoutMs: number,
  now = Date.now(),
): number {
  return Math.max(0, timeoutMs - (now - promptOriginTime))
}
