import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Menu } from 'antd'
import type { MenuProps } from 'antd'
import { createPortal } from 'react-dom'

interface ContextMenuProps {
  visible: boolean
  x: number
  y: number
  items: MenuProps['items']
  onClose: () => void
}

const VIEWPORT_PADDING = 8

const ContextMenu: React.FC<ContextMenuProps> = ({ visible, x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })

  useEffect(() => {
    if (visible) {
      setPosition({ x, y })
    }
  }, [visible, x, y])

  useLayoutEffect(() => {
    if (!visible || !menuRef.current) return

    const rect = menuRef.current.getBoundingClientRect()
    const maxLeft = window.innerWidth - rect.width - VIEWPORT_PADDING
    const maxTop = window.innerHeight - rect.height - VIEWPORT_PADDING

    let left = x
    let top = y

    if (left > maxLeft) {
      left = Math.max(VIEWPORT_PADDING, maxLeft)
    }
    if (top > maxTop) {
      top = Math.max(VIEWPORT_PADDING, y - rect.height)
    }
    if (top < VIEWPORT_PADDING) {
      top = VIEWPORT_PADDING
    }

    setPosition((prev) => (prev.x === left && prev.y === top ? prev : { x: left, y: top }))
  }, [visible, x, y, items])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleScroll = () => {
      onClose()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('scroll', handleScroll, true)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [visible, onClose])

  if (!visible) return null

  return createPortal(
    <div
      ref={menuRef}
      className="metamates-context-menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
      }}
    >
      <Menu items={items} />
    </div>,
    document.body,
  )
}

export default ContextMenu
