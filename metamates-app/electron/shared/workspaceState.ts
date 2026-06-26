/**
 * 主进程当前工作区路径（供 main / ACP / 文件 IPC 共享）
 */

let currentWorkspacePath = ''

/**
 * @returns 当前工作区绝对路径，未选择时为空字符串
 */
export function getCurrentWorkspacePath(): string {
  return currentWorkspacePath
}

/**
 * @param workspacePath - 新的工作区根目录
 */
export function setCurrentWorkspacePath(workspacePath: string): void {
  currentWorkspacePath = workspacePath
}
