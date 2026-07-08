/**
 * Central app shutdown: runs registered cleanup tasks once before exit.
 */

type ShutdownTask = () => void | Promise<void>

const shutdownTasks: ShutdownTask[] = []
let shutdownPromise: Promise<void> | null = null
let shutdownDone = false
let immediateQuitAllowed = false

/** Skip graceful shutdown (e.g. electron-updater quitAndInstall). */
export function allowImmediateQuit(): void {
  immediateQuitAllowed = true
}

export function isImmediateQuitAllowed(): boolean {
  return immediateQuitAllowed
}

export function registerShutdownTask(task: ShutdownTask): void {
  shutdownTasks.push(task)
}

export function isAppShuttingDown(): boolean {
  return shutdownDone || shutdownPromise !== null
}

/**
 * Run all shutdown hooks (LIFO). Safe to call multiple times; runs once.
 */
export function runAppShutdown(): Promise<void> {
  if (shutdownDone) return Promise.resolve()
  if (shutdownPromise) return shutdownPromise

  shutdownPromise = (async () => {
    for (let i = shutdownTasks.length - 1; i >= 0; i--) {
      try {
        await shutdownTasks[i]()
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[Shutdown] task ${shutdownTasks.length - i} failed:`, message)
      }
    }
    shutdownDone = true
  })()

  return shutdownPromise
}
