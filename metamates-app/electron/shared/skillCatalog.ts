/**
 * Canonical list of slash-command skill names and inits path helpers.
 */

export const COMMAND_SKILL_NAMES = [
  'context',
  'today',
  'closeday',
  'schedule',
  'trace',
  'connect',
  'challenge',
  'ghost',
  'ideas',
  'graduate',
  'drift',
  'emerge',
  'sync',
  'soal',
  'intel',
] as const

export type CommandSkillName = (typeof COMMAND_SKILL_NAMES)[number]

export {
  BACKEND_SKILL_LAYOUTS,
  getInitsSkillRelativePath,
  getWorkspaceSkillRelativePath,
  INITS_SKILL_BACKENDS,
  resolveSkillPaths,
  SKILL_DOT_FOLDERS,
} from './skillLayouts'
