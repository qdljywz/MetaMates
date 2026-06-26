import React, { useEffect, useRef } from 'react'
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

const ContextMenu: React.FC<ContextMenuProps> = ({ visible, x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleScroll = () => {
      onClose()
    }

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('scroll', handleScroll, true)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [visible, onClose])

  if (!visible) return null

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
    backgroundColor: '#fff',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    borderRadius: 4,
    minWidth: 160,
  }

  return createPortal(
    <div ref={menuRef} style={menuStyle}>
      <Menu items={items} style={{ border: 'none' }} />
    </div>,
    document.body
  )
}

export default ContextMenu
