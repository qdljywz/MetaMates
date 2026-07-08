/**
 * Agent-live E2E consumes real CLI quota (session init + prompts).
 * Default journey skips these steps — opt in with E2E_AGENT_LIVE=1.
 */
export const E2E_AGENT_LIVE = process.env.E2E_AGENT_LIVE === '1'

export const SKIP_AGENT_LIVE_REASON =
  'Agent-live steps skipped (set E2E_AGENT_LIVE=1 to run CodeBuddy ping / /today writeback)'
