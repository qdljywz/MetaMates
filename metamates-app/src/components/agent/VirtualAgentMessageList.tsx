import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import {
  List,
  type ListImperativeAPI,
  type RowComponentProps,
  useDynamicRowHeight,
} from 'react-window'
import AgentMessageItem, { type AgentMessage, type AgentMessageTheme } from './AgentMessageItem'

const ROW_GAP = 8
const VIRTUALIZE_THRESHOLD = 12

export interface VirtualMessageListHandle {
  scrollToBottom: (force?: boolean) => void
  scrollToIndex: (index: number, align?: 'start' | 'end' | 'auto') => void
  getScrollElement: () => HTMLDivElement | null
}

interface MessageRowProps {
  messages: AgentMessage[]
  theme: AgentMessageTheme
  isDark: boolean
  workspacePath?: string
  renderMarkdown: (text: string) => string
  onOpenFile?: (filePath: string) => void
}

function MessageRow({
  index,
  style,
  ariaAttributes,
  messages,
  theme,
  isDark,
  workspacePath,
  renderMarkdown,
  onOpenFile,
}: RowComponentProps<MessageRowProps>) {
  const msg = messages[index]
  if (!msg) return null

  return (
    <div
      {...ariaAttributes}
      style={{
        ...style,
        width: '100%',
        boxSizing: 'border-box',
        padding: `0 var(--space-3) ${ROW_GAP}px`,
      }}
    >
      <AgentMessageItem
        msg={msg}
        theme={theme}
        isDark={isDark}
        workspacePath={workspacePath}
        renderMarkdown={renderMarkdown}
        onOpenFile={onOpenFile}
      />
    </div>
  )
}

interface VirtualAgentMessageListProps {
  listKey: string | number
  messages: AgentMessage[]
  theme: AgentMessageTheme
  isDark: boolean
  workspacePath?: string
  renderMarkdown: (text: string) => string
  onOpenFile?: (filePath: string) => void
  onUserScrollChange?: (userScrolled: boolean) => void
  header?: React.ReactNode
  footer?: React.ReactNode
}

const VirtualAgentMessageList = forwardRef<VirtualMessageListHandle, VirtualAgentMessageListProps>(
  function VirtualAgentMessageList(
    {
      listKey,
      messages,
      theme,
      isDark,
      workspacePath,
      renderMarkdown,
      onOpenFile,
      onUserScrollChange,
      header,
      footer,
    },
    ref,
  ) {
    const listRef = useRef<ListImperativeAPI | null>(null)
    const simpleScrollRef = useRef<HTMLDivElement>(null)
    const userScrolledRef = useRef(false)
    const rowHeight = useDynamicRowHeight({ defaultRowHeight: 88, key: listKey })
    const useVirtual = messages.length >= VIRTUALIZE_THRESHOLD

    const rowProps = useMemo<MessageRowProps>(() => ({
      messages,
      theme,
      isDark,
      workspacePath,
      renderMarkdown,
      onOpenFile,
    }), [messages, theme, isDark, workspacePath, renderMarkdown, onOpenFile])

    const attachScrollListener = useCallback((el: HTMLDivElement | null) => {
      if (!el) return () => {}
      const onScroll = () => {
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
        const next = !atBottom
        if (userScrolledRef.current !== next) {
          userScrolledRef.current = next
          onUserScrollChange?.(next)
        }
      }
      el.addEventListener('scroll', onScroll, { passive: true })
      return () => el.removeEventListener('scroll', onScroll)
    }, [onUserScrollChange])

    useEffect(() => {
      if (useVirtual) return
      return attachScrollListener(simpleScrollRef.current)
    }, [useVirtual, listKey, attachScrollListener, messages.length])

    useEffect(() => {
      if (!useVirtual) return
      const el = listRef.current?.element ?? null
      return attachScrollListener(el)
    }, [useVirtual, listKey, listRef, attachScrollListener, messages.length])

    useEffect(() => {
      userScrolledRef.current = false
      onUserScrollChange?.(false)
    }, [listKey, onUserScrollChange])

    const scrollToBottom = useCallback((force = false) => {
      if (!force && userScrolledRef.current) return

      if (useVirtual) {
        if (messages.length === 0) {
          const el = listRef.current?.element
          if (el) el.scrollTop = el.scrollHeight
          return
        }
        const api = listRef.current
        api?.scrollToRow({ index: messages.length - 1, align: 'end', behavior: 'instant' })
      } else {
        const el = simpleScrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      }
    }, [listRef, messages.length, useVirtual])

    const scrollToIndex = useCallback((index: number, align: 'start' | 'end' | 'auto' = 'start') => {
      if (useVirtual) {
        const api = listRef.current
        api?.scrollToRow({ index, align, behavior: 'instant' })
      } else {
        const el = simpleScrollRef.current
        const child = el?.children[index + (header ? 1 : 0)] as HTMLElement | undefined
        child?.scrollIntoView({ block: align === 'end' ? 'end' : 'start' })
      }
    }, [listRef, useVirtual, header])

    useImperativeHandle(ref, () => ({
      scrollToBottom,
      scrollToIndex,
      getScrollElement: () => {
        if (useVirtual) {
          return listRef.current?.element ?? null
        }
        return simpleScrollRef.current
      },
    }), [scrollToBottom, scrollToIndex, listRef, useVirtual])

    if (!useVirtual) {
      return (
        <div
          ref={simpleScrollRef}
          data-testid="message-list"
          data-message-list-root
          className="agent-panel__messages agent-panel__messages--enter"
        >
          {header}
          {messages.map((msg, index) => (
            <div key={msg.id || index} style={{ paddingBottom: ROW_GAP }}>
              <AgentMessageItem
                msg={msg}
                theme={theme}
                isDark={isDark}
                workspacePath={workspacePath}
                renderMarkdown={renderMarkdown}
                onOpenFile={onOpenFile}
              />
            </div>
          ))}
          {footer}
        </div>
      )
    }

    return (
      <div
        data-testid="message-list"
        data-message-list-root
        className="agent-panel__messages agent-panel__messages--virtual agent-panel__messages--enter"
      >
        {header && <div className="agent-panel__messages-header">{header}</div>}
        <List
          listRef={listRef}
          rowCount={messages.length}
          rowHeight={rowHeight}
          rowComponent={MessageRow}
          rowProps={rowProps}
          overscanCount={6}
          className="agent-panel__virtual-list"
          style={{ flex: 1, minHeight: 0, width: '100%' }}
        />
        {footer && <div className="agent-panel__messages-footer">{footer}</div>}
      </div>
    )
  },
)

export default memo(VirtualAgentMessageList)
