import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Modal, Spin, Empty, Input, Select, Space, Button, Tag, Divider, message, Switch, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import { SearchOutlined, FilterOutlined, ReloadOutlined, ZoomInOutlined, ZoomOutOutlined, BulbOutlined } from '@ant-design/icons'
import { LinkParser } from '../services/linkParser'
import { buildSemanticGraphLinks, buildPlainMentionCountMap, computeGraphNodeImportance, importanceToNodeSize, normalizeNoteStem } from '../services/linkIntelligence'
import { fileIndexService } from '../services/fileIndex'
import { workspaceIndexService } from '../services/workspaceIndex'
import {
  detectWorkspaceLanguageFromPaths,
  getVaultNodeKey,
  isVaultContentFile,
} from '../services/vaultPaths'
import { useTheme } from '../hooks/useTheme'
import GraphView3D from './KnowledgeGraph/GraphView3D'

interface GraphNode {
  id: string
  name: string
  x: number
  y: number
  vx: number
  vy: number
  connections: string[]
  size: number
  color: string
  tags: string[]
  lastModified: number
  inDegree: number
  outDegree: number
  mentionCount: number
  importance: number
}

interface GraphLink {
  source: string
  target: string
  kind?: 'wiki' | 'semantic'
}

interface GraphViewProps {
  visible: boolean
  onClose: () => void
  workspacePath: string
  onFileSelect: (path: string) => void
}

interface GraphCache {
  nodes: GraphNode[]
  links: GraphLink[]
  fileMap: Map<string, string>
  tags: string[]
  linkDebtRanking: Array<{ path: string; name: string; score: number; stem: string }>
  version: number
  timestamp: number
}

const GRAPH_CACHE_VERSION = 4

const colors = [
  '#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', 
  '#0891b2', '#c026d3', '#ea580c', '#16a34a', '#8b5cf6'
]

const graphCache = new Map<string, GraphCache>()
const CACHE_TTL = 5 * 60 * 1000

function extractAllLinks(content: string): string[] {
  const links: string[] = []
  
  const wikiLinkRegex = /!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g
  let wikiMatch
  while ((wikiMatch = wikiLinkRegex.exec(content)) !== null) {
    let link = wikiMatch[1].trim()
    link = link.replace(/\.md$/, '')
    const lastSlash = Math.max(link.lastIndexOf('/'), link.lastIndexOf('\\'))
    if (lastSlash >= 0) {
      link = link.substring(lastSlash + 1)
    }
    links.push(link)
  }
  
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g
  let mdMatch
  while ((mdMatch = mdLinkRegex.exec(content)) !== null) {
    let link = mdMatch[2].trim()
    link = link.replace(/\.md$/, '')
    const lastSlash = Math.max(link.lastIndexOf('/'), link.lastIndexOf('\\'))
    if (lastSlash >= 0) {
      link = link.substring(lastSlash + 1)
    }
    links.push(link)
  }
  
  return links
}

const GraphView: React.FC<GraphViewProps> = ({ visible, onClose, workspacePath, onFileSelect }) => {
  const { t } = useTranslation('graph')
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [allNodes, setAllNodes] = useState<GraphNode[]>([])
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [links, setLinks] = useState<GraphLink[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [draggingNode, setDraggingNode] = useState<GraphNode | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [searchText, setSearchText] = useState('')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [allTags, setAllTags] = useState<string[]>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [is3DMode, setIs3DMode] = useState(true)
  const [showSemanticLinks, setShowSemanticLinks] = useState(true)
  const [linkDebtRanking, setLinkDebtRanking] = useState<Array<{ path: string; name: string; score: number; stem: string }>>([])
  const animationRef = useRef<number | undefined>(undefined)
  const fileMapRef = useRef<Map<string, string>>(new Map())
  const isDraggingCanvas = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const hasDragged = useRef(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const lastClickTime = useRef(0)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingClickNode = useRef<GraphNode | null>(null)

  useEffect(() => {
    if (visible && workspacePath) {
      loadGraphData()
    }
  }, [visible, workspacePath])

  /** Reload when workspace index finishes — semantic edges need fileIndex. */
  useEffect(() => {
    if (!visible || !workspacePath) return
    const unsubscribe = workspaceIndexService.subscribe(() => {
      if (workspaceIndexService.isReady()) {
        loadGraphData(true)
      }
    })
    return unsubscribe
  }, [visible, workspacePath])

  useEffect(() => {
    if (!searchText && !filterTag) {
      setNodes(allNodes)
      return
    }

    const filtered = allNodes.filter(node => {
      const matchesSearch = !searchText || 
        node.name.toLowerCase().includes(searchText.toLowerCase())
      const matchesTag = !filterTag || 
        node.tags.includes(filterTag)
      return matchesSearch && matchesTag
    })
    setNodes(filtered)
  }, [searchText, filterTag, allNodes])

  const loadGraphData = async (forceRefresh = false) => {
    if (!window.electronAPI) return
    
    if (!forceRefresh) {
      const cached = graphCache.get(workspacePath)
      if (cached && cached.version === GRAPH_CACHE_VERSION && Date.now() - cached.timestamp < CACHE_TTL) {
        setAllNodes(cached.nodes)
        setNodes(cached.nodes)
        setLinks(cached.links)
        fileMapRef.current = cached.fileMap
        setAllTags(cached.tags)
        setLinkDebtRanking(cached.linkDebtRanking || [])
        setLoading(false)
        return
      }
    }
    
    setLoading(true)
    try {
      const result = await window.electronAPI.listFiles(workspacePath, true)
      if (result.success && result.files) {
        const workspaceLanguage = detectWorkspaceLanguageFromPaths(
          workspacePath,
          result.files.map((f: { path: string }) => f.path),
        )
        const mdFiles = result.files.filter((f: any) =>
          !f.isDirectory &&
          f.name.endsWith('.md') &&
          isVaultContentFile(workspacePath, f.path, workspaceLanguage),
        )
        const nodeMap = new Map<string, GraphNode>()
        const linkList: GraphLink[] = []
        const fileMap = new Map<string, string>()
        const tagSet = new Set<string>()
        const stemToNodeKey = new Map<string, string>()

        for (const file of mdFiles) {
          const nodeKey = getVaultNodeKey(workspacePath, file.path)
          const stem = file.name.replace(/\.md$/i, '')
          stemToNodeKey.set(stem, nodeKey)
          stemToNodeKey.set(normalizeNoteStem(file.name), nodeKey)
          fileMap.set(nodeKey, file.path)
        }

        for (const file of mdFiles) {
          const nodeKey = getVaultNodeKey(workspacePath, file.path)
          const displayName = nodeKey.split('/').pop() || nodeKey
          const readResult = await window.electronAPI.readFile(file.path)
          if (readResult.success && readResult.content) {
            const content = readResult.content
            const parsed = LinkParser.parse(content)
            const allLinks = extractAllLinks(content)

            parsed.tags.forEach(t => tagSet.add(t.name))

            if (!nodeMap.has(nodeKey)) {
              nodeMap.set(nodeKey, {
                id: nodeKey,
                name: displayName,
                x: Math.random() * 600 + 100,
                y: Math.random() * 400 + 100,
                vx: 0,
                vy: 0,
                connections: [],
                size: 14,
                color: colors[Math.floor(Math.random() * colors.length)],
                tags: parsed.tags.map(t => t.name),
                lastModified: Date.now(),
                inDegree: 0,
                outDegree: 0,
                mentionCount: 0,
                importance: 0,
              })
            }

            for (const targetStem of allLinks) {
              const targetKey = stemToNodeKey.get(targetStem)
              if (!targetKey) {
                continue
              }

              linkList.push({ source: nodeKey, target: targetKey, kind: 'wiki' })

              const node = nodeMap.get(nodeKey)!
              if (!node.connections.includes(targetKey)) {
                node.connections.push(targetKey)
              }
            }
          }
        }

        const linkDebtRanking = workspaceIndexService.isReady()
          ? workspaceIndexService.getLinkDebtRanking(10)
          : []

        if (workspaceIndexService.isReady()) {
          const files = fileIndexService.getAllFiles()
          const semanticMap = fileIndexService.buildSemanticNeighborMap(2)
          const semanticEdges = buildSemanticGraphLinks(files, semanticMap, 2, 5)
          for (const edge of semanticEdges) {
            const sourceKey = stemToNodeKey.get(edge.source)
            const targetKey = stemToNodeKey.get(edge.target)
            if (!sourceKey || !targetKey) continue
            linkList.push({ source: sourceKey, target: targetKey, kind: 'semantic' })
          }
        }

        const inDegreeMap = new Map<string, number>()
        for (const link of linkList.filter((l) => l.kind !== 'semantic')) {
          inDegreeMap.set(link.target, (inDegreeMap.get(link.target) || 0) + 1)
        }

        let mentionCountMap = new Map<string, number>()
        if (workspaceIndexService.isReady()) {
          const files = fileIndexService.getAllFiles()
          mentionCountMap = buildPlainMentionCountMap(files)
          for (const file of files) {
            const nodeKey = getVaultNodeKey(workspacePath, file.path)
            const backlinks = fileIndexService.countBacklinks(file.path)
            inDegreeMap.set(nodeKey, Math.max(inDegreeMap.get(nodeKey) || 0, backlinks))
            const stem = normalizeNoteStem(file.name)
            const mentionCount = mentionCountMap.get(stem) || 0
            if (mentionCount > 0) {
              mentionCountMap.set(nodeKey, Math.max(mentionCountMap.get(nodeKey) || 0, mentionCount))
            }
          }
        }

        for (const node of nodeMap.values()) {
          const inDegree = inDegreeMap.get(node.id) || 0
          const outDegree = node.connections.length
          const mentionCount = mentionCountMap.get(node.id) || 0
          const importance = computeGraphNodeImportance({ inDegree, outDegree, mentionCount })
          node.inDegree = inDegree
          node.outDegree = outDegree
          node.mentionCount = mentionCount
          node.importance = importance
          node.size = importanceToNodeSize(importance)
        }

        fileMapRef.current = fileMap
        const nodesArray = Array.from(nodeMap.values())
        const tagsArray = Array.from(tagSet)
        
        graphCache.set(workspacePath, {
          nodes: nodesArray,
          links: linkList,
          fileMap: fileMap,
          tags: tagsArray,
          linkDebtRanking,
          version: GRAPH_CACHE_VERSION,
          timestamp: Date.now(),
        })
        
        setAllNodes(nodesArray)
        setNodes(nodesArray)
        setLinks(linkList)
        setAllTags(tagsArray)
        setLinkDebtRanking(linkDebtRanking)
      }
    } catch (error) {
      console.error('Failed to load graph data:', error)
    } finally {
      setLoading(false)
    }
  }

  const simulate = useCallback(() => {
    if (nodes.length === 0) return
    
    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    const centerX = rect ? rect.width / 2 : 350
    const centerY = rect ? rect.height / 2 : 250
    
    nodes.forEach(node => {
      let fx = 0, fy = 0
      
      nodes.forEach(other => {
        if (node.id === other.id) return
        const dx = node.x - other.x
        const dy = node.y - other.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = 1000 / (dist * dist)
        fx += (dx / dist) * force
        fy += (dy / dist) * force
      })
      
      links.filter((l) => showSemanticLinks || l.kind !== 'semantic').forEach(link => {
        if (link.source === node.id || link.target === node.id) {
          const otherId = link.source === node.id ? link.target : link.source
          const other = nodes.find(n => n.id === otherId)
          if (other) {
            const dx = other.x - node.x
            const dy = other.y - node.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const forceMultiplier = link.kind === 'semantic' ? 0.35 : 1
            const force = (dist - 100) * 0.01 * forceMultiplier
            fx += (dx / dist) * force
            fy += (dy / dist) * force
          }
        }
      })
      
      const dx = centerX - node.x
      const dy = centerY - node.y
      fx += dx * 0.001
      fy += dy * 0.001
      
      if (draggingNode?.id !== node.id) {
        node.vx = (node.vx + fx) * 0.9
        node.vy = (node.vy + fy) * 0.9
        node.x += node.vx
        node.y += node.vy
      }
    })
  }, [nodes, links, draggingNode, showSemanticLinks])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.scale(scale, scale)
    
    const visibleLinks = showSemanticLinks ? links : links.filter((l) => l.kind !== 'semantic')

    visibleLinks.forEach(link => {
      const source = nodes.find(n => n.id === link.source)
      const target = nodes.find(n => n.id === link.target)
      if (source && target) {
        const isHighlighted = hoveredNode && (
          hoveredNode.id === link.source || 
          hoveredNode.id === link.target
        )
        const isSelected = selectedNode && (
          selectedNode.id === link.source || 
          selectedNode.id === link.target
        )
        
        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        
        if (isHighlighted || isSelected) {
          ctx.strokeStyle = '#7c3aed'
          ctx.lineWidth = 3 / scale
          ctx.setLineDash([])
        } else if (link.kind === 'semantic') {
          ctx.strokeStyle = 'rgba(167, 139, 250, 0.55)'
          ctx.lineWidth = 1 / scale
          ctx.setLineDash([6 / scale, 4 / scale])
        } else {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'
          ctx.lineWidth = 1.5 / scale
          ctx.setLineDash([])
        }
        ctx.stroke()
        ctx.setLineDash([])
        
        if (link.kind === 'semantic') {
          return
        }
        
        const angle = Math.atan2(target.y - source.y, target.x - source.x)
        const midX = (source.x + target.x) / 2
        const midY = (source.y + target.y) / 2
        
        ctx.beginPath()
        ctx.moveTo(midX, midY)
        ctx.lineTo(
          midX - 6 * Math.cos(angle - Math.PI / 6),
          midY - 6 * Math.sin(angle - Math.PI / 6)
        )
        ctx.moveTo(midX, midY)
        ctx.lineTo(
          midX - 6 * Math.cos(angle + Math.PI / 6),
          midY - 6 * Math.sin(angle + Math.PI / 6)
        )
        ctx.strokeStyle = isHighlighted || isSelected ? '#7c3aed' : 'rgba(148, 163, 184, 0.5)'
        ctx.lineWidth = 1.5 / scale
        ctx.stroke()
      }
    })
    
    nodes.forEach(node => {
      const isHovered = hoveredNode?.id === node.id
      const isSelected = selectedNode?.id === node.id
      const isConnected = hoveredNode && (
        hoveredNode.connections.includes(node.id) || 
        node.connections.includes(hoveredNode.id)
      )
      
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.size / 2, 0, Math.PI * 2)
      
      if (isHovered || isSelected) {
        ctx.fillStyle = node.color
        ctx.shadowColor = node.color
        ctx.shadowBlur = 20
      } else if (isConnected) {
        ctx.fillStyle = node.color
        ctx.shadowBlur = 10
      } else if (hoveredNode || selectedNode) {
        ctx.fillStyle = '#e5e7eb'
        ctx.shadowBlur = 0
      } else {
        ctx.fillStyle = node.color
        ctx.shadowBlur = 0
      }
      
      ctx.fill()
      ctx.shadowBlur = 0
      
      ctx.fillStyle = isHovered || isSelected ? '#1f2937' : '#374151'
      ctx.font = `${isHovered || isSelected ? 13 : 11}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(node.name, node.x, node.y + node.size / 2 + 15)
    })
    
    ctx.restore()
  }, [nodes, links, hoveredNode, selectedNode, scale, offset, showSemanticLinks])

  useEffect(() => {
    if (!visible || nodes.length === 0 || is3DMode) return
    const getNodesScreenCoords = () => {
      const canvas = canvasRef.current
      if (!canvas) return []
      const rect = canvas.getBoundingClientRect()
      return nodes.map((n) => ({
        id: n.id,
        name: n.name,
        x: n.x,
        y: n.y,
        size: n.size,
        screenX: rect.left + offset.x + n.x * scale,
        screenY: rect.top + offset.y + n.y * scale,
      }))
    }
    ;(window as unknown as {
      __METAMATES_GRAPH_E2E__?: {
        getNodesScreenCoords: () => ReturnType<typeof getNodesScreenCoords>
        nodeCount: number
        is3DMode: boolean
      }
    }).__METAMATES_GRAPH_E2E__ = {
      getNodesScreenCoords,
      nodeCount: nodes.length,
      is3DMode,
    }
  }, [visible, nodes, scale, offset, is3DMode])

  useEffect(() => {
    if (!visible || nodes.length === 0 || is3DMode) return

    const animate = () => {
      simulate()
      draw()
      animationRef.current = requestAnimationFrame(animate)
    }
    animate()
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [visible, nodes, links, simulate, draw, is3DMode])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - offset.x) / scale
    const y = (e.clientY - rect.top - offset.y) / scale
    
    const dx = e.clientX - dragStartPos.current.x
    const dy = e.clientY - dragStartPos.current.y
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      hasDragged.current = true
    }
    
    if (isDraggingCanvas.current) {
      setOffset(prev => ({
        x: prev.x + (e.clientX - lastMousePos.current.x),
        y: prev.y + (e.clientY - lastMousePos.current.y)
      }))
      lastMousePos.current = { x: e.clientX, y: e.clientY }
      return
    }
    
    if (draggingNode) {
      setNodes(prevNodes => prevNodes.map(node => 
        node.id === draggingNode.id 
          ? { ...node, x, y }
          : node
      ))
      draggingNode.x = x
      draggingNode.y = y
      return
    }
    
    const hovered = nodes.find(node => {
      const nodeDx = node.x - x
      const nodeDy = node.y - y
      return Math.sqrt(nodeDx * nodeDx + nodeDy * nodeDy) < node.size / 2
    })
    
    setHoveredNode(hovered || null)
    canvas.style.cursor = hovered ? 'pointer' : 'default'
  }, [nodes, draggingNode, scale, offset])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    hasDragged.current = false
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    lastClickTime.current = Date.now()
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - offset.x) / scale
    const y = (e.clientY - rect.top - offset.y) / scale
    
    const clickedNode = nodes.find(node => {
      const dx = node.x - x
      const dy = node.y - y
      return Math.sqrt(dx * dx + dy * dy) < node.size / 2
    })
    
    if (e.button === 0 && clickedNode) {
      setDraggingNode(clickedNode)
    } else if (e.button === 0) {
      isDraggingCanvas.current = true
      lastMousePos.current = { x: e.clientX, y: e.clientY }
    }
  }, [nodes, scale, offset])

  const handleMouseUp = useCallback(() => {
    setDraggingNode(null)
    isDraggingCanvas.current = false
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hasDragged.current) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - offset.x) / scale
    const y = (e.clientY - rect.top - offset.y) / scale
    
    const clickedNode = nodes.find(node => {
      const dx = node.x - x
      const dy = node.y - y
      return Math.sqrt(dx * dx + dy * dy) < node.size / 2
    })
    
    if (clickedNode) {
      setSelectedNode(clickedNode)
    } else {
      setSelectedNode(null)
    }
  }, [nodes, offset, scale])

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - offset.x) / scale
    const y = (e.clientY - rect.top - offset.y) / scale
    
    const clickedNode = nodes.find(node => {
      const dx = node.x - x
      const dy = node.y - y
      return Math.sqrt(dx * dx + dy * dy) < node.size / 2
    })
    
    if (clickedNode) {
      const filePath = fileMapRef.current.get(clickedNode.id)
      if (filePath) {
        onFileSelect(filePath)
        onClose()
      } else {
        message.warning(t('fileNotFound'))
      }
    }
  }, [nodes, offset, scale, onFileSelect, onClose])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.3, Math.min(3, scale * delta))
    
    const worldX = (mouseX - offset.x) / scale
    const worldY = (mouseY - offset.y) / scale
    
    const newOffsetX = mouseX - worldX * newScale
    const newOffsetY = mouseY - worldY * newScale
    
    setScale(newScale)
    setOffset({ x: newOffsetX, y: newOffsetY })
  }, [scale, offset])
  
  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    
    let centerX: number, centerY: number
    if (selectedNode) {
      centerX = selectedNode.x * scale + offset.x
      centerY = selectedNode.y * scale + offset.y
    } else {
      centerX = rect.width / 2
      centerY = rect.height / 2
    }
    
    const newScale = Math.min(3, scale * 1.2)
    const worldX = (centerX - offset.x) / scale
    const worldY = (centerY - offset.y) / scale
    
    setScale(newScale)
    setOffset({
      x: centerX - worldX * newScale,
      y: centerY - worldY * newScale
    })
  }, [scale, offset, selectedNode])
  
  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    
    let centerX: number, centerY: number
    if (selectedNode) {
      centerX = selectedNode.x * scale + offset.x
      centerY = selectedNode.y * scale + offset.y
    } else {
      centerX = rect.width / 2
      centerY = rect.height / 2
    }
    
    const newScale = Math.max(0.3, scale / 1.2)
    const worldX = (centerX - offset.x) / scale
    const worldY = (centerY - offset.y) / scale
    
    setScale(newScale)
    setOffset({
      x: centerX - worldX * newScale,
      y: centerY - worldY * newScale
    })
  }, [scale, offset, selectedNode])
  const handleReset = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setSelectedNode(null)
  }

  return (
    <Modal
      title={t('title')}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1000}
      centered
      wrapClassName="graph-modal"
    >
      <div 
        className="graph-modal-content"
        style={{ marginBottom: 12 }}
      >
        <Space wrap>
          <Input
            placeholder={t('searchPlaceholder')}
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder={t('filterByTag')}
            value={filterTag}
            onChange={(value) => setFilterTag(value)}
            style={{ width: 150 }}
            allowClear
            options={[
              { label: t('all'), value: null },
              ...allTags.map(t => ({ label: `#${t}`, value: t }))
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => loadGraphData(true)}>
            {t('refresh')}
          </Button>
          <Button.Group>
            <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} />
            <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} />
            <Button onClick={handleReset}>{t('reset')}</Button>
          </Button.Group>
          <Tooltip title={is3DMode ? t('switchTo2D') : t('switchTo3D')}>
            <Switch
              data-testid="graph-3d-switch"
              checkedChildren={<BulbOutlined />}
              unCheckedChildren={<BulbOutlined />}
              checked={is3DMode}
              onChange={setIs3DMode}
            />
          </Tooltip>
          <Tooltip title={t('semanticLinksToggle')}>
            <Switch
              checked={showSemanticLinks}
              onChange={setShowSemanticLinks}
              checkedChildren={t('semanticOn')}
              unCheckedChildren={t('semanticOff')}
            />
          </Tooltip>
          <Tag color="blue">{t('stats.wikiLinks')}: {links.filter((l) => l.kind !== 'semantic').length}</Tag>
          <Tag color="purple">{t('stats.semanticLinks')}: {links.filter((l) => l.kind === 'semantic').length}</Tag>
        </Space>
      </div>

      {loading ? (
        <div style={{ height: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" tip={t('loading')} />
        </div>
      ) : nodes.length === 0 ? (
        <div style={{ height: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description={t('noNodes')} />
        </div>
      ) : is3DMode ? (
        <div style={{ height: 500, border: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden' }}>
          <GraphView3D
            nodes={nodes}
            links={showSemanticLinks ? links : links.filter((l) => l.kind !== 'semantic')}
            onNodeClick={(node) => {
              const filePath = fileMapRef.current.get(node.id)
              if (filePath) {
                onFileSelect(filePath)
                onClose()
              }
            }}
          />
        </div>
      ) : (
        <div 
          className="graph-canvas-container"
          style={{ display: 'flex', gap: 12 }}
        >
          <canvas
            ref={canvasRef}
            data-testid="graph-2d-canvas"
            style={{
              width: '100%',
              height: 500,
              border: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`, 
              borderRadius: 8,
              background: isDark ? '#1e1e2e' : '#fafafa',
              flex: 1
            }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
          />
          
          {selectedNode && (
            <div style={{ 
              width: 250, 
              border: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`, 
              borderRadius: 8, 
              padding: 12,
              background: isDark ? '#1e1e2e' : '#fff',
              color: isDark ? '#e6e6e6' : '#1f2937'
            }}>
              <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 8 }}>
                {selectedNode.name}
              </div>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: isDark ? '#a6adc8' : '#6b7280' }}>{t('importance')}: </span>
                <span style={{ fontWeight: 500 }}>{Math.round(selectedNode.importance)}</span>
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: isDark ? '#a6adc8' : '#6b7280' }}>{t('backlinkCount')}: </span>
                <span style={{ fontWeight: 500 }}>{selectedNode.inDegree}</span>
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: isDark ? '#a6adc8' : '#6b7280' }}>{t('mentionCount')}: </span>
                <span style={{ fontWeight: 500 }}>{selectedNode.mentionCount}</span>
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: isDark ? '#a6adc8' : '#6b7280' }}>{t('connections')}: </span>
                <span style={{ fontWeight: 500 }}>{selectedNode.outDegree}</span>
              </div>
              {selectedNode.tags.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: isDark ? '#a6adc8' : '#6b7280', marginBottom: 4 }}>{t('tags')}:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {selectedNode.tags.map(tag => (
                      <Tag key={tag} color="orange">#{tag}</Tag>
                    ))}
                  </div>
                </div>
              )}
              {selectedNode.connections.length > 0 && (
                <div>
                  <div style={{ color: isDark ? '#a6adc8' : '#6b7280', marginBottom: 4 }}>{t('connectedTo')}:</div>
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {selectedNode.connections.map(conn => (
                      <div 
                        key={conn}
                        style={{ 
                          padding: '4px 8px', 
                          cursor: 'pointer',
                          borderRadius: 4,
                          marginBottom: 2
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = isDark ? '#313244' : '#f3f4f6'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                        onClick={() => {
                          const filePath = fileMapRef.current.get(conn)
                          if (filePath) {
                            onFileSelect(filePath)
                            onClose()
                          }
                        }}
                      >
                        [[{conn}]]
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Divider style={{ margin: '12px 0' }} />
              <Button 
                type="primary" 
                block
                onClick={() => {
                  const filePath = fileMapRef.current.get(selectedNode.id)
                  if (filePath) {
                    onFileSelect(filePath)
                    onClose()
                  } else {
                    message.warning(t('fileNotFound'))
                  }
                }}
              >
                {t('openFile')}
              </Button>
            </div>
          )}
        </div>
      )}

      {linkDebtRanking.length > 0 && (
        <div style={{
          marginTop: 12,
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${isDark ? '#313244' : '#e5e7eb'}`,
          background: isDark ? '#181825' : '#fafafa',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: isDark ? '#cdd6f4' : '#1f2937' }}>
            {t('linkDebtTitle')}
          </div>
          {linkDebtRanking.slice(0, 5).map((item) => (
            <div
              key={item.path}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                padding: '4px 0',
                cursor: 'pointer',
                color: isDark ? '#a6adc8' : '#4b5563',
              }}
              onClick={() => {
                onFileSelect(item.path)
                onClose()
              }}
            >
              <span>{item.stem}</span>
              <Tag color={item.score >= 8 ? 'red' : item.score >= 4 ? 'orange' : 'default'}>{item.score}</Tag>
            </div>
          ))}
        </div>
      )}
      
      <div 
        className="graph-footer"
        style={{ 
          marginTop: 8, 
          padding: '8px 12px', 
          background: isDark ? '#181825' : '#f9fafb', 
          borderRadius: 6,
          fontSize: 12,
          color: isDark ? '#a6adc8' : '#6b7280'
        }}
      >
        <Space split={<Divider type="vertical" />}>
          <span>{t('stats.nodes')}: {nodes.length}</span>
            <span>{t('stats.links')}: {links.length}</span>
          <span>{t('tips')}</span>
          <span>{t('nodeSizeHint')}</span>
        </Space>
      </div>
    </Modal>
  )
}

export default GraphView
