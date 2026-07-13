import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Modal, Spin, Empty, Input, Select, Space, Button, Tag, Divider, message, Switch, Tooltip, Segmented } from 'antd'
import { useTranslation } from 'react-i18next'
import { SearchOutlined, FilterOutlined, ReloadOutlined, ZoomInOutlined, ZoomOutOutlined, CopyOutlined } from '@ant-design/icons'
import { LinkParser } from '../services/linkParser'
import { buildSemanticGraphLinks, buildPlainMentionCountMap, computeGraphNodeImportance, importanceToNodeSize, normalizeNoteStem, resolveStemToNodeKey } from '../services/linkIntelligence'
import { fileIndexService } from '../services/fileIndex'
import { workspaceIndexService } from '../services/workspaceIndex'
import {
  detectWorkspaceLanguageFromPaths,
  getVaultNodeKey,
  isVaultContentFile,
} from '../services/vaultPaths'
import { useTheme } from '../hooks/useTheme'
import GraphView3D from './KnowledgeGraph/GraphView3D'
import {
  collectActivityNeighborhood,
  collectFocusNeighborhood,
  filterLinksForDisplay,
  filterLinksToNodeSet,
  getGraphFolderLegend,
  getGraphNodeColor,
  getGraphNodeFolder,
  isCrossFolderGraphLink,
  isOrphanGraphNode,
  layoutGraphCluster,
  layoutGraphFolderClusters,
  measureFolderClusterSeparation,
  usesGraphFolderIslandLayout,
  type FolderClusterCenter,
  type GraphViewMode,
} from '../utils/graphFocus'
import { drawGraphBackground, drawGraphFolderIslands, drawGraphLink, drawGraphNode, fitViewportToFolderClusters, fitViewportToNodes, sanitizeGraphNodePositions } from '../utils/graphCanvas2D'

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
  /** Current editor file — focus graph centers on this note when in focus mode. */
  focusFilePath?: string | null
  /** When opened from activity calendar: files edited on that day. */
  highlightPaths?: string[]
  activityDateLabel?: string
  initialViewMode?: GraphViewMode
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

const GRAPH_CACHE_VERSION = 7

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

const GraphView: React.FC<GraphViewProps> = ({
  visible,
  onClose,
  workspacePath,
  focusFilePath,
  highlightPaths,
  activityDateLabel,
  initialViewMode,
  onFileSelect,
}) => {
  const { t } = useTranslation('graph')
  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [allNodes, setAllNodes] = useState<GraphNode[]>([])
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [allLinks, setAllLinks] = useState<GraphLink[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [draggingNode, setDraggingNode] = useState<GraphNode | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [searchText, setSearchText] = useState('')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [allTags, setAllTags] = useState<string[]>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [is3DMode, setIs3DMode] = useState(false)
  const [showSemanticLinks, setShowSemanticLinks] = useState(false)
  const [viewMode, setViewMode] = useState<GraphViewMode>('focus')
  const [filterFolder, setFilterFolder] = useState<string | null>(null)
  const [workspaceLanguage, setWorkspaceLanguage] = useState<'zh' | 'en'>('zh')
  const [linkDebtRanking, setLinkDebtRanking] = useState<Array<{ path: string; name: string; score: number; stem: string }>>([])
  const simulationPausedRef = useRef(true)
  const simulationFrameRef = useRef(0)
  const frameTimeRef = useRef(0)
  const animationRef = useRef<number | undefined>(undefined)
  const scaleRef = useRef(scale)
  const offsetRef = useRef(offset)
  const draggingNodeRef = useRef<GraphNode | null>(null)
  const canvasLayoutRef = useRef({ cssWidth: 0, cssHeight: 0, dpr: 1 })
  const renderStateRef = useRef({
    nodes: [] as GraphNode[],
    visibleLinks: [] as GraphLink[],
    hoveredNode: null as GraphNode | null,
    selectedNode: null as GraphNode | null,
    isDark: false,
    viewMode: 'focus' as GraphViewMode,
    clusterCenters: new Map<string, FolderClusterCenter>(),
  })
  const interactionRef = useRef({
    draggingNode: null as GraphNode | null,
    hoveredNode: null as GraphNode | null,
    selectedNode: null as GraphNode | null,
  })
  const fileMapRef = useRef<Map<string, string>>(new Map())
  const isDraggingCanvas = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const hasDragged = useRef(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const lastClickTime = useRef(0)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingClickNode = useRef<GraphNode | null>(null)
  const loadGenerationRef = useRef(0)
  const didCenterFocusRef = useRef(false)
  const didFitViewRef = useRef(false)
  const clusterCentersRef = useRef<Map<string, FolderClusterCenter>>(new Map())
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode

  const focusNodeId = React.useMemo(() => {
    if (!focusFilePath || !workspacePath) return null
    return getVaultNodeKey(workspacePath, focusFilePath)
  }, [focusFilePath, workspacePath])

  const focusNeighborhood = React.useMemo(() => {
    if (viewMode !== 'focus' || !focusNodeId || allNodes.length === 0) return null
    if (!allNodes.some((n) => n.id === focusNodeId)) return null
    return collectFocusNeighborhood(focusNodeId, allLinks, 2)
  }, [viewMode, focusNodeId, allNodes, allLinks])

  const activityNeighborhood = React.useMemo(() => {
    if (viewMode !== 'activity' || !highlightPaths?.length || !workspacePath) return null
    return collectActivityNeighborhood(workspacePath, highlightPaths, allLinks)
  }, [viewMode, highlightPaths, workspacePath, allLinks])

  const resumeSimulation = useCallback(() => {
    simulationPausedRef.current = false
    simulationFrameRef.current = 0
    for (const node of allNodes) {
      node.vx = 0
      node.vy = 0
    }
  }, [allNodes])

  const nodeHitRadius = useCallback((node: GraphNode) => Math.max(node.size / 2 + 10, 18), [])

  const applyViewport = useCallback((nextScale: number, nextOffset: { x: number; y: number }) => {
    scaleRef.current = nextScale
    offsetRef.current = nextOffset
    setScale(nextScale)
    setOffset(nextOffset)
  }, [])

  const shouldCompactLayout = Boolean(focusNeighborhood || activityNeighborhood)

  const compactAnchorId = React.useMemo(() => {
    if (focusNeighborhood && focusNodeId) return focusNodeId
    if (activityNeighborhood && highlightPaths?.[0]) {
      return getVaultNodeKey(workspacePath, highlightPaths[0])
    }
    return null
  }, [focusNeighborhood, activityNeighborhood, focusNodeId, highlightPaths, workspacePath])

  const fitViewNow = useCallback(() => {
    const canvas = canvasRef.current
    const visibleNodes = nodesRef.current
    if (!canvas || visibleNodes.length === 0 || is3DMode) return false
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 10 || rect.height < 10) return false

    if (shouldCompactLayout) {
      layoutGraphCluster(visibleNodes, compactAnchorId)
      simulationPausedRef.current = true
    } else if (usesGraphFolderIslandLayout(viewMode)) {
      clusterCentersRef.current = layoutGraphFolderClusters(visibleNodes, workspaceLanguage)
      simulationPausedRef.current = false
      simulationFrameRef.current = 0
    } else {
      sanitizeGraphNodePositions(visibleNodes)
    }

    const focusId = viewMode === 'focus' ? focusNodeId : null
    let vp
    if (usesGraphFolderIslandLayout(viewMode) && clusterCentersRef.current.size > 0) {
      const folderCounts = new Map<string, number>()
      for (const node of visibleNodes) {
        const folder = getGraphNodeFolder(node.id)
        folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1)
      }
      vp = fitViewportToFolderClusters(clusterCentersRef.current, folderCounts, rect, 88)
    } else {
      vp = fitViewportToNodes(visibleNodes, rect, 56, focusId)
    }
    applyViewport(vp.scale, vp.offset)
    didFitViewRef.current = true
    return true
  }, [is3DMode, applyViewport, viewMode, focusNodeId, shouldCompactLayout, compactAnchorId, workspaceLanguage])

  const scheduleFitView = useCallback(() => {
    didFitViewRef.current = false
    let attempts = 0
    const tryFit = () => {
      attempts += 1
      if (fitViewNow()) return
      if (attempts < 36) requestAnimationFrame(tryFit)
    }
    requestAnimationFrame(tryFit)
    window.setTimeout(() => fitViewNow(), 400)
  }, [fitViewNow])

  useEffect(() => {
    scaleRef.current = scale
    offsetRef.current = offset
  }, [scale, offset])

  useEffect(() => {
    draggingNodeRef.current = draggingNode
  }, [draggingNode])

  const getWorldCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left - offsetRef.current.x) / scaleRef.current,
      y: (clientY - rect.top - offsetRef.current.y) / scaleRef.current,
    }
  }, [])

  const findNodeAtWorld = useCallback((worldX: number, worldY: number) => {
    return nodes.find((node) => {
      const dx = node.x - worldX
      const dy = node.y - worldY
      return Math.sqrt(dx * dx + dy * dy) < nodeHitRadius(node)
    }) ?? null
  }, [nodes, nodeHitRadius])

  const endPointerDrag = useCallback(() => {
    const wasPanning = isDraggingCanvas.current
    const draggedNode = draggingNodeRef.current

    setDraggingNode(null)
    draggingNodeRef.current = null
    isDraggingCanvas.current = false

    if (wasPanning) {
      setOffset({ ...offsetRef.current })
    } else if (draggedNode) {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === draggedNode.id ? { ...node, x: draggedNode.x, y: draggedNode.y } : node,
        ),
      )
    }

    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = 'grab'
  }, [])

  const bindWindowDragListeners = useCallback(() => {
    const onWindowMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPos.current.x
      const dy = e.clientY - dragStartPos.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        hasDragged.current = true
      }

      if (isDraggingCanvas.current) {
        offsetRef.current = {
          x: offsetRef.current.x + (e.clientX - lastMousePos.current.x),
          y: offsetRef.current.y + (e.clientY - lastMousePos.current.y),
        }
        lastMousePos.current = { x: e.clientX, y: e.clientY }
        return
      }

      const activeNode = draggingNodeRef.current
      if (!activeNode) return
      const world = getWorldCoords(e.clientX, e.clientY)
      if (!world) return
      activeNode.x = world.x
      activeNode.y = world.y
    }

    const onWindowMouseUp = () => {
      window.removeEventListener('mousemove', onWindowMouseMove)
      window.removeEventListener('mouseup', onWindowMouseUp)
      endPointerDrag()
    }

    window.addEventListener('mousemove', onWindowMouseMove, { passive: true })
    window.addEventListener('mouseup', onWindowMouseUp)
  }, [endPointerDrag, getWorldCoords])

  const visibleLinks = React.useMemo(() => {
    const nodeIds = new Set(nodes.map((n) => n.id))
    let pool = allLinks
    if (focusNeighborhood) {
      pool = filterLinksToNodeSet(allLinks, focusNeighborhood)
    }
    pool = pool.filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target))
    const activeId = selectedNode?.id ?? hoveredNode?.id ?? null
    return filterLinksForDisplay(pool, showSemanticLinks, activeId)
  }, [allLinks, nodes, focusNeighborhood, showSemanticLinks, selectedNode, hoveredNode])

  renderStateRef.current = {
    nodes,
    visibleLinks,
    hoveredNode,
    selectedNode,
    isDark,
    viewMode,
    clusterCenters: clusterCentersRef.current,
  }
  interactionRef.current = { draggingNode, hoveredNode, selectedNode }

  useEffect(() => {
    if (!visible) return
    if (initialViewMode) setViewMode(initialViewMode)
    else if (!highlightPaths?.length) setViewMode('focus')
  }, [visible, initialViewMode, highlightPaths])

  useEffect(() => {
    if (hoveredNode || draggingNode) {
      simulationPausedRef.current = true
    }
  }, [hoveredNode, draggingNode])

  const semanticSuggestions = React.useMemo(() => {
    if (!selectedNode) return []
    const wikiConnected = new Set(selectedNode.connections)
    const seen = new Set<string>()
    const suggestions: string[] = []
    for (const link of allLinks) {
      if (link.kind !== 'semantic') continue
      const otherId = link.source === selectedNode.id ? link.target : link.target === selectedNode.id ? link.source : null
      if (!otherId || otherId === selectedNode.id || wikiConnected.has(otherId) || seen.has(otherId)) continue
      seen.add(otherId)
      suggestions.push(otherId)
      if (suggestions.length >= 8) break
    }
    return suggestions
  }, [selectedNode, allLinks])

  const folderFilterOptions = React.useMemo(() => {
    const legend = getGraphFolderLegend(workspaceLanguage)
    return [
      { label: t('all'), value: null as string | null },
      ...legend.map((item) => ({
        label: item.label.split('_').pop() || item.label,
        value: item.label,
      })),
    ]
  }, [workspaceLanguage, t])

  const copyWikiLink = useCallback((nodeId: string) => {
    const name = nodeId.split('/').pop() || nodeId
    void navigator.clipboard.writeText(`[[${name}]]`)
    message.success(t('linkCopied'))
  }, [t])

  useEffect(() => {
    if (!visible) {
      canvasLayoutRef.current = { cssWidth: 0, cssHeight: 0, dpr: 0 }
      didFitViewRef.current = false
      didCenterFocusRef.current = false
      offsetRef.current = { x: 0, y: 0 }
      scaleRef.current = 1
      setScale(1)
      setOffset({ x: 0, y: 0 })
      setHoveredNode(null)
      setDraggingNode(null)
      isDraggingCanvas.current = false
    }
  }, [visible])

  useEffect(() => {
    if (visible && workspacePath) {
      didCenterFocusRef.current = false
      loadGraphData()
    }
  }, [visible, workspacePath])

  /** Reload when workspace index finishes — semantic edges need fileIndex. */
  useEffect(() => {
    if (!visible || !workspacePath) return
    const reload = () => {
      if (workspaceIndexService.isReady()) {
        loadGraphData(true)
      }
    }
    const unsubIndex = workspaceIndexService.subscribe(reload)
    const unsubVault = workspaceIndexService.onVaultChanged(reload)
    return () => {
      unsubIndex()
      unsubVault()
    }
  }, [visible, workspacePath])

  useEffect(() => {
    let pool = allNodes

    if (viewMode === 'orphans') {
      pool = pool.filter((node) => isOrphanGraphNode(node))
    } else if (focusNeighborhood) {
      pool = pool.filter((node) => focusNeighborhood.has(node.id))
    } else if (activityNeighborhood) {
      pool = pool.filter((node) => activityNeighborhood.has(node.id))
    }

    if (filterFolder) {
      const prefix = `${filterFolder}/`
      pool = pool.filter((node) => node.id === filterFolder || node.id.startsWith(prefix))
    }

    const filtered = pool.filter((node) => {
      const matchesSearch = !searchText ||
        node.name.toLowerCase().includes(searchText.toLowerCase()) ||
        node.id.toLowerCase().includes(searchText.toLowerCase())
      const matchesTag = !filterTag || node.tags.includes(filterTag)
      return matchesSearch && matchesTag
    })

    const needsCompactLayout = Boolean(focusNeighborhood || activityNeighborhood)
    const folderIslandLayout = usesGraphFolderIslandLayout(viewMode)
    const visibleNodes = (needsCompactLayout || folderIslandLayout)
      ? filtered.map((node) => ({ ...node, vx: 0, vy: 0 }))
      : filtered

    if (needsCompactLayout) {
      simulationPausedRef.current = true
    } else if (folderIslandLayout) {
      clusterCentersRef.current = layoutGraphFolderClusters(visibleNodes, workspaceLanguage)
      simulationPausedRef.current = false
      simulationFrameRef.current = 0
    } else if (viewMode === 'orphans') {
      resumeSimulation()
    }

    setNodes(visibleNodes)
  }, [searchText, filterTag, allNodes, focusNeighborhood, activityNeighborhood, viewMode, filterFolder, resumeSimulation, workspaceLanguage])

  useEffect(() => {
    if (!selectedNode) return
    if (!nodes.some((node) => node.id === selectedNode.id)) {
      setSelectedNode(nodes[0] ?? null)
    }
  }, [nodes, selectedNode])

  useEffect(() => {
    if (!visible || !focusNodeId || nodes.length === 0) return
    const focusNode = nodes.find((n) => n.id === focusNodeId)
    if (focusNode && viewMode === 'focus') {
      setSelectedNode(focusNode)
    }
  }, [visible, focusNodeId, nodes, viewMode])

  useEffect(() => {
    if (!visible || loading || is3DMode || nodes.length === 0) return
    scheduleFitView()
  }, [visible, loading, is3DMode, nodes, focusNodeId, viewMode, focusNeighborhood, activityNeighborhood, scheduleFitView])

  useEffect(() => {
    if (!visible || is3DMode || loading) return
    const canvas = canvasRef.current
    if (!canvas) return

    let resizeTimer: number | undefined
    const observer = new ResizeObserver(() => {
      if (nodesRef.current.length === 0 || didFitViewRef.current) return
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => scheduleFitView(), 80)
    })
    observer.observe(canvas)
    return () => {
      window.clearTimeout(resizeTimer)
      observer.disconnect()
    }
  }, [visible, is3DMode, loading, scheduleFitView])

  const loadGraphData = async (forceRefresh = false) => {
    if (!window.electronAPI) return
    const generation = ++loadGenerationRef.current
    
    if (!forceRefresh) {
      const cached = graphCache.get(workspacePath)
      if (cached && cached.version === GRAPH_CACHE_VERSION && Date.now() - cached.timestamp < CACHE_TTL) {
        setAllNodes(cached.nodes)
        setAllLinks(cached.links)
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
        setWorkspaceLanguage(workspaceLanguage)
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
                color: getGraphNodeColor(nodeKey, workspaceLanguage),
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

        const appendSemanticLinks = () => {
          if (!workspaceIndexService.isReady()) return
          const files = fileIndexService.getAllFiles()
          if (files.length < 2) return
          const semanticMap = fileIndexService.buildSemanticNeighborMap(3)
          const semanticEdges = buildSemanticGraphLinks(files, semanticMap, 3, 3)
          const nodeKeys = nodeMap.keys()
          const existing = new Set(
            linkList.map((link) => `${link.source}\0${link.target}\0${link.kind ?? 'wiki'}`),
          )
          for (const edge of semanticEdges) {
            const sourceKey = resolveStemToNodeKey(edge.source, stemToNodeKey, nodeKeys)
            const targetKey = resolveStemToNodeKey(edge.target, stemToNodeKey, nodeKeys)
            if (!sourceKey || !targetKey || sourceKey === targetKey) continue
            const dedupeKey = `${sourceKey}\0${targetKey}\0semantic`
            if (existing.has(dedupeKey)) continue
            existing.add(dedupeKey)
            linkList.push({ source: sourceKey, target: targetKey, kind: 'semantic' })
          }
        }

        appendSemanticLinks()

        if (generation !== loadGenerationRef.current) return

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
        
        if (generation !== loadGenerationRef.current) return

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
        setAllLinks(linkList)
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
    const { nodes: simNodes, visibleLinks: simLinks } = renderStateRef.current
    const mode = viewModeRef.current
    const clusterCenters = clusterCentersRef.current
    const { draggingNode: dragNode, hoveredNode: hoverNode } = interactionRef.current
    if (simNodes.length === 0) return
    if (isDraggingCanvas.current || dragNode || hoverNode) return
    if (simulationPausedRef.current) return

    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    const viewScale = scaleRef.current || 1
    const viewOffset = offsetRef.current
    const centerX = rect ? (rect.width / 2 - viewOffset.x) / viewScale : 350
    const centerY = rect ? (rect.height / 2 - viewOffset.y) / viewScale : 250
    const clusterMode = usesGraphFolderIslandLayout(mode)

    let energy = 0

    simNodes.forEach(node => {
      let fx = 0, fy = 0
      const nodeFolder = clusterMode ? getGraphNodeFolder(node.id) : null

      simNodes.forEach(other => {
        if (node.id === other.id) return
        if (clusterMode && getGraphNodeFolder(other.id) !== nodeFolder) return
        const dx = node.x - other.x
        const dy = node.y - other.y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 36)
        const repulsion = clusterMode ? 520 : 800
        const force = repulsion / (dist * dist)
        fx += (dx / dist) * force
        fy += (dy / dist) * force
      })

      simLinks.forEach(link => {
        if (link.kind === 'semantic') return
        if (clusterMode && isCrossFolderGraphLink(link.source, link.target)) return
        if (link.source === node.id || link.target === node.id) {
          const otherId = link.source === node.id ? link.target : link.source
          const other = simNodes.find(n => n.id === otherId)
          if (other) {
            const dx = other.x - node.x
            const dy = other.y - node.y
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
            const force = (dist - 96) * 0.014
            fx += (dx / dist) * force
            fy += (dy / dist) * force
          }
        }
      })

      if (clusterMode) {
        const cluster = clusterCenters.get(nodeFolder ?? '')
        if (cluster) {
          fx += (cluster.x - node.x) * 0.028
          fy += (cluster.y - node.y) * 0.028
        }
      } else {
        const dx = centerX - node.x
        const dy = centerY - node.y
        fx += dx * 0.0008
        fy += dy * 0.0008
      }

      node.vx = (node.vx + fx) * 0.86
      node.vy = (node.vy + fy) * 0.86
      node.x += node.vx
      node.y += node.vy
      energy += node.vx * node.vx + node.vy * node.vy
    })

    simulationFrameRef.current += 1
    const maxFrames = clusterMode ? 200 : 360
    if (simulationFrameRef.current > maxFrames || energy < 0.2) {
      simulationPausedRef.current = true
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { nodes: drawNodes, visibleLinks: drawLinks, hoveredNode: hoverNode, selectedNode: selectNode, isDark: dark, viewMode: drawMode } = renderStateRef.current
    const folderIslandLayout = usesGraphFolderIslandLayout(drawMode)
    const clusterCenters = folderIslandLayout ? clusterCentersRef.current : new Map<string, FolderClusterCenter>()
    const viewScale = scaleRef.current
    const viewOffset = offsetRef.current
    
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return

    const dpr = window.devicePixelRatio || 1
    const expectedWidth = Math.round(rect.width * dpr)
    const expectedHeight = Math.round(rect.height * dpr)
    if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
      canvas.width = expectedWidth
      canvas.height = expectedHeight
      canvasLayoutRef.current = { cssWidth: rect.width, cssHeight: rect.height, dpr }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, rect.width, rect.height)

    const time = frameTimeRef.current
    const focusActive = Boolean(hoverNode || selectNode)
    const relatedIds = new Set<string>()
    if (selectNode) {
      relatedIds.add(selectNode.id)
      selectNode.connections.forEach((id) => relatedIds.add(id))
    }
    if (hoverNode) {
      relatedIds.add(hoverNode.id)
      hoverNode.connections.forEach((id) => relatedIds.add(id))
    }

    drawGraphBackground(ctx, rect.width, rect.height, viewOffset.x, viewOffset.y, viewScale, time, dark)

    ctx.save()
    ctx.translate(viewOffset.x, viewOffset.y)
    ctx.scale(viewScale, viewScale)

    if (folderIslandLayout && clusterCenters.size > 0) {
      drawGraphFolderIslands(ctx, drawNodes, clusterCenters, viewScale, dark)
    }

    const hideDistantBridges = folderIslandLayout && viewScale < 0.82 && !focusActive
    const hideIntraClusterLinks = folderIslandLayout && viewScale < 0.72 && !focusActive
    const compactNodes = folderIslandLayout && viewScale < 0.85 && !focusActive
    
    drawLinks.forEach(link => {
      const source = drawNodes.find(n => n.id === link.source)
      const target = drawNodes.find(n => n.id === link.target)
      if (!source || !target) return

      const isCrossCluster = folderIslandLayout && isCrossFolderGraphLink(link.source, link.target)
      const isHighlighted = Boolean(hoverNode && (hoverNode.id === link.source || hoverNode.id === link.target))
      const isSelected = Boolean(selectNode && (selectNode.id === link.source || selectNode.id === link.target))
      if (hideDistantBridges && isCrossCluster && !isHighlighted && !isSelected) return
      if (hideIntraClusterLinks && !isCrossCluster && !isHighlighted && !isSelected) return

      const isDimmed = focusActive && !isHighlighted && !isSelected
        && !relatedIds.has(link.source) && !relatedIds.has(link.target)

      drawGraphLink(ctx, source, target, link, viewScale, time, isHighlighted, isSelected, isDimmed, isCrossCluster)
    })

    const showNodeLabels = !folderIslandLayout || viewScale >= 0.78 || focusActive
    
    drawNodes.forEach(node => {
      const isHovered = hoverNode?.id === node.id
      const isSelected = selectNode?.id === node.id
      const isConnected = Boolean(
        (hoverNode && (hoverNode.connections.includes(node.id) || node.connections.includes(hoverNode.id)))
        || (selectNode && (selectNode.connections.includes(node.id) || node.connections.includes(selectNode.id))),
      )
      const isDimmed = focusActive && !isHovered && !isSelected && !isConnected

      drawGraphNode(ctx, node, viewScale, time, {
        isHovered,
        isSelected,
        isConnected,
        isDimmed,
        isDark: dark,
        showLabel: showNodeLabels || isHovered || isSelected || isConnected,
        reduceMotion: folderIslandLayout,
        compact: compactNodes && !isHovered && !isSelected,
      })
    })
    
    ctx.restore()
  }, [])

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
        screenX: rect.left + offsetRef.current.x + n.x * scaleRef.current,
        screenY: rect.top + offsetRef.current.y + n.y * scaleRef.current,
      }))
    }
    ;(window as unknown as {
      __METAMATES_GRAPH_E2E__?: {
        getNodesScreenCoords: () => ReturnType<typeof getNodesScreenCoords>
        getGraphAudit: () => {
          nodeCount: number
          is3DMode: boolean
          viewMode: GraphViewMode
          clusterSeparation: number | null
          simulationPaused: boolean
        }
      }
    }).__METAMATES_GRAPH_E2E__ = {
      getNodesScreenCoords,
      getGraphAudit: () => ({
        nodeCount: nodesRef.current.length,
        is3DMode,
        viewMode: viewModeRef.current,
        clusterSeparation: usesGraphFolderIslandLayout(viewModeRef.current)
          ? measureFolderClusterSeparation(nodesRef.current)
          : null,
        simulationPaused: simulationPausedRef.current,
      }),
    }
  }, [visible, nodes, is3DMode, viewMode])

  useEffect(() => {
    if (!visible || is3DMode || loading) return

    const animate = (now: number) => {
      frameTimeRef.current = now * 0.001
      simulate()
      draw()
      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [visible, is3DMode, loading, simulate, draw])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingCanvas.current || draggingNodeRef.current) return

    const canvas = canvasRef.current
    if (!canvas) return
    
    const world = getWorldCoords(e.clientX, e.clientY)
    if (!world) return

    const hovered = findNodeAtWorld(world.x, world.y)
    setHoveredNode(hovered)
    canvas.style.cursor = hovered ? 'pointer' : 'grab'
  }, [getWorldCoords, findNodeAtWorld])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return

    hasDragged.current = false
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    lastClickTime.current = Date.now()
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const world = getWorldCoords(e.clientX, e.clientY)
    if (!world) return

    const clickedNode = findNodeAtWorld(world.x, world.y)
    
    if (clickedNode) {
      simulationPausedRef.current = true
      draggingNodeRef.current = clickedNode
      setDraggingNode(clickedNode)
      canvas.style.cursor = 'grabbing'
    } else {
      isDraggingCanvas.current = true
      lastMousePos.current = { x: e.clientX, y: e.clientY }
      canvas.style.cursor = 'grabbing'
    }
    bindWindowDragListeners()
  }, [getWorldCoords, findNodeAtWorld, bindWindowDragListeners])

  const handleMouseUp = useCallback(() => {
    endPointerDrag()
  }, [endPointerDrag])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hasDragged.current) return
    
    const world = getWorldCoords(e.clientX, e.clientY)
    if (!world) return

    const clickedNode = findNodeAtWorld(world.x, world.y)
    
    if (clickedNode) {
      simulationPausedRef.current = true
      setSelectedNode(clickedNode)
    } else {
      setSelectedNode(null)
    }
  }, [getWorldCoords, findNodeAtWorld])

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    const world = getWorldCoords(e.clientX, e.clientY)
    if (!world) return

    const clickedNode = findNodeAtWorld(world.x, world.y)
    
    if (clickedNode) {
      const filePath = fileMapRef.current.get(clickedNode.id)
      if (filePath) {
        onFileSelect(filePath)
        onClose()
      } else {
        message.warning(t('fileNotFound'))
      }
    }
  }, [getWorldCoords, findNodeAtWorld, onFileSelect, onClose, t])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.3, Math.min(3, scaleRef.current * delta))
    
    const worldX = (mouseX - offsetRef.current.x) / scaleRef.current
    const worldY = (mouseY - offsetRef.current.y) / scaleRef.current
    
    const newOffsetX = mouseX - worldX * newScale
    const newOffsetY = mouseY - worldY * newScale
    
    applyViewport(newScale, { x: newOffsetX, y: newOffsetY })
  }, [applyViewport])
  
  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    
    let centerX: number, centerY: number
    if (selectedNode) {
      centerX = selectedNode.x * scaleRef.current + offsetRef.current.x
      centerY = selectedNode.y * scaleRef.current + offsetRef.current.y
    } else {
      centerX = rect.width / 2
      centerY = rect.height / 2
    }
    
    const newScale = Math.min(3, scaleRef.current * 1.2)
    const worldX = (centerX - offsetRef.current.x) / scaleRef.current
    const worldY = (centerY - offsetRef.current.y) / scaleRef.current
    
    applyViewport(newScale, {
      x: centerX - worldX * newScale,
      y: centerY - worldY * newScale,
    })
  }, [applyViewport, selectedNode])
  
  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    
    let centerX: number, centerY: number
    if (selectedNode) {
      centerX = selectedNode.x * scaleRef.current + offsetRef.current.x
      centerY = selectedNode.y * scaleRef.current + offsetRef.current.y
    } else {
      centerX = rect.width / 2
      centerY = rect.height / 2
    }
    
    const newScale = Math.max(0.3, scaleRef.current / 1.2)
    const worldX = (centerX - offsetRef.current.x) / scaleRef.current
    const worldY = (centerY - offsetRef.current.y) / scaleRef.current
    
    applyViewport(newScale, {
      x: centerX - worldX * newScale,
      y: centerY - worldY * newScale,
    })
  }, [applyViewport, selectedNode])
  const handleReset = () => {
    setSelectedNode(null)
    if (usesGraphFolderIslandLayout(viewMode)) {
      clusterCentersRef.current = layoutGraphFolderClusters(nodesRef.current, workspaceLanguage)
      resumeSimulation()
    } else {
      simulationPausedRef.current = true
    }
    scheduleFitView()
  }

  return (
    <Modal
      title={t('title')}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1000}
      centered
      destroyOnClose
      wrapClassName="graph-modal"
      afterOpenChange={(open) => {
        if (open) window.setTimeout(() => scheduleFitView(), 280)
      }}
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
          <Select
            placeholder={t('filterByFolder')}
            value={filterFolder}
            onChange={(value) => setFilterFolder(value)}
            style={{ width: 140 }}
            allowClear
            options={folderFilterOptions}
          />
          <Button icon={<ReloadOutlined />} onClick={() => {
            didFitViewRef.current = false
            if (usesGraphFolderIslandLayout(viewMode)) resumeSimulation()
            loadGraphData(true)
          }}>
            {t('refresh')}
          </Button>
          <Button.Group>
            <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} />
            <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} />
            <Button onClick={handleReset}>{t('reset')}</Button>
          </Button.Group>
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as GraphViewMode)}
            options={[
              { label: t('viewMode.focus'), value: 'focus' },
              { label: t('viewMode.full'), value: 'full' },
              { label: t('viewMode.orphans'), value: 'orphans' },
              ...(highlightPaths?.length
                ? [{ label: t('viewMode.activity'), value: 'activity' as const }]
                : []),
            ]}
          />
          {activityDateLabel && viewMode === 'activity' && (
            <Tag className="mm-tag mm-tag--accent">{t('activityDay', { date: activityDateLabel })}</Tag>
          )}
          <Segmented
            data-testid="graph-dimension-switch"
            value={is3DMode ? '3d' : '2d'}
            onChange={(value) => setIs3DMode(value === '3d')}
            options={[
              { label: '2D', value: '2d' },
              { label: '3D', value: '3d' },
            ]}
          />
          <Tooltip title={t('semanticLinksToggle')}>
            <Switch
              checked={showSemanticLinks}
              onChange={setShowSemanticLinks}
              checkedChildren={t('semanticOn')}
              unCheckedChildren={t('semanticOff')}
            />
          </Tooltip>
          <Tag className="mm-tag mm-tag--accent">{t('stats.wikiLinks')}: {visibleLinks.filter((l) => l.kind !== 'semantic').length}</Tag>
          <Tag className="mm-tag mm-tag--teal">{t('stats.semanticLinks')}: {visibleLinks.filter((l) => l.kind === 'semantic').length}</Tag>
        </Space>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {getGraphFolderLegend(workspaceLanguage).map((item) => (
            <Tag
              key={item.label}
              style={{
                margin: 0,
                border: `1px solid ${item.color}`,
                background: `${item.color}26`,
                color: item.color,
                fontWeight: 600,
              }}
            >
              {item.label.split('_').pop()}
            </Tag>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="graph-canvas-placeholder">
          <Spin size="large" tip={t('loading')} />
        </div>
      ) : nodes.length === 0 ? (
        <div className="graph-canvas-placeholder">
          <Empty description={t('noNodes')} />
        </div>
      ) : is3DMode ? (
        <div className="graph-canvas-placeholder graph-canvas-placeholder--fill">
          <GraphView3D
            nodes={nodes}
            links={visibleLinks}
            layoutMode={usesGraphFolderIslandLayout(viewMode) ? 'folders' : 'sphere'}
            workspaceLanguage={workspaceLanguage}
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
        >
          <canvas
            ref={canvasRef}
            data-testid="graph-2d-canvas"
            className="graph-2d-canvas"
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
          />
          
          {selectedNode && (
            <div className="graph-detail-panel">
              <div className="graph-detail-panel__title">
                {selectedNode.name}
              </div>
              <Divider style={{ margin: '8px 0' }} />
              <div className="graph-detail-panel__row">
                <span className="graph-detail-panel__label">{t('importance')}: </span>
                <span className="graph-detail-panel__value">{Math.round(selectedNode.importance)}</span>
              </div>
              <div className="graph-detail-panel__row">
                <span className="graph-detail-panel__label">{t('backlinkCount')}: </span>
                <span className="graph-detail-panel__value">{selectedNode.inDegree}</span>
              </div>
              <div className="graph-detail-panel__row">
                <span className="graph-detail-panel__label">{t('mentionCount')}: </span>
                <span className="graph-detail-panel__value">{selectedNode.mentionCount}</span>
              </div>
              <div className="graph-detail-panel__row">
                <span className="graph-detail-panel__label">{t('connections')}: </span>
                <span className="graph-detail-panel__value">{selectedNode.outDegree}</span>
              </div>
              {selectedNode.tags.length > 0 && (
                <div className="graph-detail-panel__row">
                  <div className="graph-detail-panel__section-label">{t('tags')}:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {selectedNode.tags.map(tag => (
                      <Tag key={tag} color="orange">#{tag}</Tag>
                    ))}
                  </div>
                </div>
              )}
              {semanticSuggestions.length > 0 && (
                <div className="graph-detail-panel__row">
                  <div className="graph-detail-panel__section-label">{t('semanticSuggestions')}:</div>
                  <div className="graph-detail-panel__scroll--short">
                    {semanticSuggestions.map((neighborId) => (
                      <div
                        key={neighborId}
                        className="graph-detail-panel__semantic-row"
                      >
                        <span
                          className="graph-detail-panel__semantic-link"
                          onClick={() => {
                            const node = allNodes.find((n) => n.id === neighborId)
                            if (node) {
                              simulationPausedRef.current = true
                              setSelectedNode(node)
                            }
                          }}
                        >
                          {neighborId.split('/').pop()}
                        </span>
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          title={t('copyLink')}
                          onClick={() => copyWikiLink(neighborId)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedNode.connections.length > 0 && (
                <div>
                  <div className="graph-detail-panel__section-label">{t('connectedTo')}:</div>
                  <div className="graph-detail-panel__scroll">
                    {selectedNode.connections.map(conn => (
                      <div 
                        key={conn}
                        className="graph-connection-item"
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
        <div className="graph-link-debt">
          <div className="graph-link-debt__title">
            {t('linkDebtTitle')}
          </div>
          {linkDebtRanking.slice(0, 5).map((item) => (
            <div
              key={item.path}
              className="graph-link-debt__item"
              onClick={() => {
                onFileSelect(item.path)
                onClose()
              }}
            >
              <span>{item.stem}</span>
              <Tag className={
                item.score >= 8 ? 'mm-tag mm-tag--error' : item.score >= 4 ? 'mm-tag mm-tag--accent' : 'mm-tag mm-tag--muted'
              }>{item.score}</Tag>
            </div>
          ))}
        </div>
      )}
      
      <div className="graph-footer">
        <Space split={<Divider type="vertical" />}>
          <span>{t('stats.nodes')}: {nodes.length}</span>
            <span>{t('stats.links')}: {visibleLinks.length}</span>
          <span>{t('tips')}</span>
          <span>{t('nodeSizeHint')}</span>
        </Space>
      </div>
    </Modal>
  )
}

export default GraphView
