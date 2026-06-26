import { useEffect, useCallback, useRef } from 'react'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  action: () => void
  description: string
}

interface ShortcutHandler {
  shortcuts: KeyboardShortcut[]
  enabled: boolean
}

const globalShortcuts: ShortcutHandler = {
  shortcuts: [],
  enabled: true
}

export function registerShortcut(shortcut: KeyboardShortcut): () => void {
  globalShortcuts.shortcuts.push(shortcut)
  
  return () => {
    const index = globalShortcuts.shortcuts.indexOf(shortcut)
    if (index >= 0) {
      globalShortcuts.shortcuts.splice(index, 1)
    }
  }
}

export function setShortcutsEnabled(enabled: boolean): void {
  globalShortcuts.enabled = enabled
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  useEffect(() => {
    const unregisterFns = shortcuts.map(s => registerShortcut(s))
    
    return () => {
      unregisterFns.forEach(fn => fn())
    }
  }, [shortcuts])
}

export function useGlobalKeyboardHandler(): void {
  const handlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)
  
  useEffect(() => {
    handlerRef.current = (e: KeyboardEvent) => {
      if (!globalShortcuts.enabled) return
      
      const activeElement = document.activeElement
      const isInput = activeElement?.tagName === 'INPUT' || 
                      activeElement?.tagName === 'TEXTAREA' ||
                      (activeElement as HTMLElement)?.isContentEditable
      
      for (const shortcut of globalShortcuts.shortcuts) {
        const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey
        const altMatch = shortcut.alt ? e.altKey : !e.altKey
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase()
        
        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          if (isInput && !shortcut.ctrl && !shortcut.alt) {
            continue
          }
          
          e.preventDefault()
          shortcut.action()
          return
        }
      }
    }
    
    window.addEventListener('keydown', handlerRef.current)
    
    return () => {
      if (handlerRef.current) {
        window.removeEventListener('keydown', handlerRef.current)
      }
    }
  }, [])
}

export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'p', ctrl: true, action: () => {}, description: '打开命令面板' },
  { key: 's', ctrl: true, action: () => {}, description: '保存当前文件' },
  { key: 'n', ctrl: true, action: () => {}, description: '新建文件' },
  { key: 'f', ctrl: true, action: () => {}, description: '搜索' },
  { key: 'g', ctrl: true, action: () => {}, description: '打开图谱视图' },
  { key: '/', ctrl: true, action: () => {}, description: '打开全局搜索' },
  { key: 'b', ctrl: true, action: () => {}, description: '切换侧边栏' },
  { key: 'k', ctrl: true, action: () => {}, description: '插入双向链接' },
  { key: 't', ctrl: true, action: () => {}, description: '插入标签' },
  { key: 'd', ctrl: true, action: () => {}, description: '每日笔记' },
]

export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = []
  
  if (shortcut.ctrl) {
    parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')
  }
  if (shortcut.shift) {
    parts.push('⇧')
  }
  if (shortcut.alt) {
    parts.push(navigator.platform.includes('Mac') ? '⌥' : 'Alt')
  }
  
  const keyDisplay: Record<string, string> = {
    'arrowup': '↑',
    'arrowdown': '↓',
    'arrowleft': '←',
    'arrowright': '→',
    'enter': '↵',
    'escape': 'Esc',
    'backspace': '⌫',
    'delete': '⌦',
    'tab': '⇥',
    'space': '␣',
  }
  
  const key = shortcut.key.toLowerCase()
  parts.push(keyDisplay[key] || key.toUpperCase())
  
  return parts.join('+')
}
