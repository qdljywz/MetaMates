/**
 * 工作区路径沙箱：防止读写逃逸到工作区外
 * Node entry re-exports browser-safe core (main process + tests).
 */

export {
  assertWithinWorkspace,
  isPathInsideWorkspace,
  isPathWithinRoot,
  pathAssertError,
  pathAssertResolved,
  toWorkspaceRelativePath,
  type PathAssertResult,
} from './pathSafetyCore'
