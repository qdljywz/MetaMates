import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../hooks/useTheme'

interface GraphNode {
  id: string
  name: string
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

interface NodeObject {
  mesh: THREE.Mesh
  sprite: THREE.Sprite
  glowMesh?: THREE.Mesh
  node: GraphNode
}

interface GraphView3DProps {
  nodes: GraphNode[]
  links: GraphLink[]
  onNodeClick?: (node: GraphNode) => void
  fileMap?: Map<string, string>
  onFileSelect?: (path: string) => void
  onClose?: () => void
}

const SPHERE_RADIUS = 200
const IDLE_AUTO_ROTATE_DELAY_MS = 1800
const AUTO_ROTATE_SPEED_RAD_PER_SEC = 0.08
const AUTO_ROTATE_AXIS = new THREE.Vector3(0.25, 1, 0.12).normalize()

function measureGraphContainer(container: HTMLElement): { width: number; height: number } {
  const rect = container.getBoundingClientRect()
  let width = rect.width
  let height = rect.height
  if (width < 2 || height < 2) {
    const parent = container.parentElement
    if (parent) {
      const parentRect = parent.getBoundingClientRect()
      width = Math.max(width, parentRect.width)
      height = Math.max(height, parentRect.height)
    }
  }
  return {
    width: Math.max(width, 320),
    height: Math.max(height, 480),
  }
}

const GraphView3D: React.FC<GraphView3DProps> = ({ nodes, links, onNodeClick, fileMap: _fileMap, onFileSelect: _onFileSelect, onClose: _onClose }) => {
  const { t } = useTranslation('graph')
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const nodeObjectsRef = useRef<Map<string, NodeObject>>(new Map())
  const lineObjectsRef = useRef<THREE.Line[]>([])
  const arrowObjectsRef = useRef<THREE.Mesh[]>([])
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2())
  const animationIdRef = useRef<number | null>(null)
  const selectedNodeIdRef = useRef<string | null>(null)
  const hoveredNodeIdRef = useRef<string | null>(null)
  const clockRef = useRef<THREE.Clock>(new THREE.Clock())
  const graphRootRef = useRef<THREE.Group | null>(null)
  const lastInteractionAtRef = useRef<number>(Date.now())

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)

  const { theme } = useTheme()
  const isDark = theme.mode === 'dark'

  const getRelatedNodeIds = useCallback((nodeId: string): Set<string> => {
    const related = new Set<string>([nodeId])
    links.forEach(link => {
      if (link.source === nodeId) related.add(link.target)
      if (link.target === nodeId) related.add(link.source)
    })
    return related
  }, [links])

  const createTextSprite = useCallback((text: string, isHighlighted: boolean = false, isSelected: boolean = false): THREE.Sprite => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    canvas.width = 720
    canvas.height = 160

    const padding = 20
    const borderRadius = 12

    if (isSelected) {
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, 'rgba(37, 99, 235, 0.98)')
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0.98)')
      context.fillStyle = gradient
    } else if (isHighlighted) {
      context.fillStyle = 'rgba(59, 130, 246, 0.92)'
    } else {
      context.fillStyle = 'rgba(15, 15, 26, 0.92)'
    }
    
    context.beginPath()
    context.roundRect(padding, padding, canvas.width - padding * 2, canvas.height - padding * 2, borderRadius)
    context.fill()

    if (isHighlighted || isSelected) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      context.lineWidth = 3
      context.stroke()
    } else {
      context.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      context.lineWidth = 1
      context.stroke()
    }

    const fontSize = isSelected ? 42 : (isHighlighted ? 36 : 32)
    context.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    
    context.shadowColor = 'rgba(0, 0, 0, 0.5)'
    context.shadowBlur = 4
    context.shadowOffsetX = 1
    context.shadowOffsetY = 1
    
    const maxWidth = canvas.width - padding * 4
    let displayText = text
    if (context.measureText(text).width > maxWidth) {
      while (context.measureText(displayText + '...').width > maxWidth && displayText.length > 0) {
        displayText = displayText.slice(0, -1)
      }
      displayText += '...'
    }
    
    context.fillText(displayText, canvas.width / 2, canvas.height / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: 1
    })

    const sprite = new THREE.Sprite(material)
    sprite.scale.set(90, 20, 1)

    return sprite
  }, [])

  const updateSpriteAppearance = useCallback((sprite: THREE.Sprite, text: string, isHighlighted: boolean, isSelected: boolean = false) => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    canvas.width = 720
    canvas.height = 160

    const padding = 20
    const borderRadius = 12

    if (isSelected) {
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, 'rgba(37, 99, 235, 0.98)')
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0.98)')
      context.fillStyle = gradient
    } else if (isHighlighted) {
      context.fillStyle = 'rgba(59, 130, 246, 0.92)'
    } else {
      context.fillStyle = 'rgba(15, 15, 26, 0.92)'
    }
    
    context.beginPath()
    context.roundRect(padding, padding, canvas.width - padding * 2, canvas.height - padding * 2, borderRadius)
    context.fill()

    if (isHighlighted || isSelected) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      context.lineWidth = 3
      context.stroke()
    } else {
      context.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      context.lineWidth = 1
      context.stroke()
    }

    const fontSize = isSelected ? 42 : (isHighlighted ? 36 : 32)
    context.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    
    context.shadowColor = 'rgba(0, 0, 0, 0.5)'
    context.shadowBlur = 4
    context.shadowOffsetX = 1
    context.shadowOffsetY = 1
    
    const maxWidth = canvas.width - padding * 4
    let displayText = text
    if (context.measureText(text).width > maxWidth) {
      while (context.measureText(displayText + '...').width > maxWidth && displayText.length > 0) {
        displayText = displayText.slice(0, -1)
      }
      displayText += '...'
    }
    
    context.fillText(displayText, canvas.width / 2, canvas.height / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    
    if (sprite.material.map) {
      sprite.material.map.dispose()
    }
    sprite.material.map = texture
    sprite.material.opacity = 1
    sprite.material.needsUpdate = true
    
    sprite.scale.set(90, 20, 1)
  }, [])

  const highlightNode = useCallback((nodeId: string | null, _isHover: boolean = false) => {
    if (!nodeId) {
      nodeObjectsRef.current.forEach((obj) => {
        obj.mesh.scale.setScalar(1)
        ;(obj.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3
        ;(obj.mesh.material as THREE.MeshStandardMaterial).opacity = 1
        updateSpriteAppearance(obj.sprite, obj.node.name, false, false)
        if (obj.glowMesh) {
          obj.glowMesh.visible = false
        }
      })

      lineObjectsRef.current.forEach(line => {
        ;(line.material as THREE.LineBasicMaterial).opacity = 0.4
        ;(line.material as THREE.LineBasicMaterial).color.setHex(0x94a3b8)
      })

      return
    }

    const relatedIds = getRelatedNodeIds(nodeId)

    nodeObjectsRef.current.forEach((obj, id) => {
      const isRelated = relatedIds.has(id)
      const isTarget = id === nodeId

      if (isTarget) {
        obj.mesh.scale.setScalar(2)
        ;(obj.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.5
        ;(obj.mesh.material as THREE.MeshStandardMaterial).opacity = 1
        updateSpriteAppearance(obj.sprite, obj.node.name, true, true)
        if (obj.glowMesh) {
          obj.glowMesh.visible = true
        }
      } else if (isRelated) {
        obj.mesh.scale.setScalar(1.4)
        ;(obj.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2
        ;(obj.mesh.material as THREE.MeshStandardMaterial).opacity = 1
        updateSpriteAppearance(obj.sprite, obj.node.name, true, false)
        if (obj.glowMesh) {
          obj.glowMesh.visible = false
        }
      } else {
        obj.mesh.scale.setScalar(0.5)
        ;(obj.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.05
        ;(obj.mesh.material as THREE.MeshStandardMaterial).opacity = 0.2
        obj.sprite.material.opacity = 0.15
        if (obj.glowMesh) {
          obj.glowMesh.visible = false
        }
      }
    })

    lineObjectsRef.current.forEach((line, index) => {
      const positions = line.geometry.attributes.position.array
      const sourcePos = new THREE.Vector3(positions[0], positions[1], positions[2])
      const targetPos = new THREE.Vector3(positions[3], positions[4], positions[5])

      let sourceId: string | null = null
      let targetId: string | null = null

      nodeObjectsRef.current.forEach((obj, id) => {
        if (obj.mesh.position.distanceTo(sourcePos) < 1) sourceId = id
        if (obj.mesh.position.distanceTo(targetPos) < 1) targetId = id
      })

      const sourceRelated = sourceId && relatedIds.has(sourceId)
      const targetRelated = targetId && relatedIds.has(targetId)
      const isRelated = sourceRelated || targetRelated
      const isTargetLine = (sourceId === nodeId) || (targetId === nodeId)
      
      if (isTargetLine) {
        ;(line.material as THREE.LineBasicMaterial).opacity = 1
        ;(line.material as THREE.LineBasicMaterial).color.setHex(0x2563eb)
        ;(line.material as THREE.LineBasicMaterial).linewidth = 2
      } else if (isRelated) {
        ;(line.material as THREE.LineBasicMaterial).opacity = 0.7
        ;(line.material as THREE.LineBasicMaterial).color.setHex(0x6366f1)
      } else {
        ;(line.material as THREE.LineBasicMaterial).opacity = 0.02
        ;(line.material as THREE.LineBasicMaterial).color.setHex(0x94a3b8)
      }
      
      const arrow = arrowObjectsRef.current[index]
      if (arrow) {
        if (isTargetLine) {
          ;(arrow.material as THREE.MeshBasicMaterial).opacity = 1
          ;(arrow.material as THREE.MeshBasicMaterial).color.setHex(0x2563eb)
        } else if (isRelated) {
          ;(arrow.material as THREE.MeshBasicMaterial).opacity = 0.7
          ;(arrow.material as THREE.MeshBasicMaterial).color.setHex(0x6366f1)
        } else {
          ;(arrow.material as THREE.MeshBasicMaterial).opacity = 0.02
          ;(arrow.material as THREE.MeshBasicMaterial).color.setHex(0x94a3b8)
        }
      }
    })
  }, [getRelatedNodeIds, updateSpriteAppearance])

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const { width, height } = measureGraphContainer(container)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(isDark ? 0x0f0f1a : 0xf0f0f5)
    sceneRef.current = scene

    const graphRoot = new THREE.Group()
    scene.add(graphRoot)
    graphRootRef.current = graphRoot

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000)
    camera.position.set(0, 0, 450)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.rotateSpeed = 0.5
    controls.zoomSpeed = 0.8
    controls.minDistance = 150
    controls.maxDistance = 600
    controlsRef.current = controls

    const markInteraction = () => {
      lastInteractionAtRef.current = Date.now()
    }
    controls.addEventListener('start', markInteraction)
    controls.addEventListener('change', markInteraction)
    renderer.domElement.addEventListener('pointerdown', markInteraction)
    renderer.domElement.addEventListener('wheel', markInteraction, { passive: true })

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2)
    mainLight.position.set(100, 100, 100)
    scene.add(mainLight)

    const rimLight = new THREE.DirectionalLight(0xf59e0b, 0.8)
    rimLight.position.set(-100, -100, 100)
    scene.add(rimLight)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)

    nodeObjectsRef.current.forEach(obj => {
      scene.remove(obj.mesh)
      scene.remove(obj.sprite)
      if (obj.glowMesh) scene.remove(obj.glowMesh)
      obj.mesh.geometry.dispose()
      ;(obj.mesh.material as THREE.Material).dispose()
      obj.sprite.material.map?.dispose()
      obj.sprite.material.dispose()
      if (obj.glowMesh) {
        obj.glowMesh.geometry.dispose()
        ;(obj.glowMesh.material as THREE.Material).dispose()
      }
    })
    nodeObjectsRef.current.clear()

    lineObjectsRef.current.forEach(line => {
      scene.remove(line)
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    })
    lineObjectsRef.current = []

    nodes.forEach((node, i) => {
      const phi = Math.acos(-1 + (2 * i) / nodes.length)
      const theta = Math.sqrt(nodes.length * Math.PI) * phi

      const x = SPHERE_RADIUS * Math.cos(theta) * Math.sin(phi)
      const y = SPHERE_RADIUS * Math.sin(theta) * Math.sin(phi)
      const z = SPHERE_RADIUS * Math.cos(phi)

      const nodeSize = Math.max(8, node.size / 3)
      const geometry = new THREE.SphereGeometry(nodeSize, 32, 32)
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(node.color),
        emissive: new THREE.Color(node.color),
        emissiveIntensity: 0.3,
        metalness: 0.7,
        roughness: 0.3,
        transparent: true,
        opacity: 1
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, y, z)
      mesh.userData = { nodeId: node.id }

      const glowGeometry = new THREE.SphereGeometry(nodeSize * 1.5, 32, 32)
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(node.color),
        transparent: true,
        opacity: 0.2,
        side: THREE.BackSide
      })
      const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial)
      glowMesh.position.set(x, y, z)
      glowMesh.visible = false

      const sprite = createTextSprite(node.name, false)
      sprite.position.set(x, y + nodeSize + 12, z)

      graphRoot.add(mesh)
      graphRoot.add(sprite)
      graphRoot.add(glowMesh)

      nodeObjectsRef.current.set(node.id, { mesh, sprite, glowMesh, node })
    })

    const nodePositions = new Map<string, THREE.Vector3>()
    nodeObjectsRef.current.forEach((obj, id) => {
      nodePositions.set(id, obj.mesh.position.clone())
    })

    links.filter((l) => l.kind !== 'semantic').forEach(link => {
      const sourcePos = nodePositions.get(link.source)
      const targetPos = nodePositions.get(link.target)

      if (sourcePos && targetPos) {
        const points = [sourcePos, targetPos]
        const geometry = new THREE.BufferGeometry().setFromPoints(points)
        const material = new THREE.LineBasicMaterial({
          color: 0x6366f1,
          transparent: true,
          opacity: 0.4,
          linewidth: 1
        })
        const line = new THREE.Line(geometry, material)
        graphRoot.add(line)
        lineObjectsRef.current.push(line)

        const direction = new THREE.Vector3().subVectors(targetPos, sourcePos).normalize()
        const arrowLength = 8
        const arrowPos = new THREE.Vector3().copy(targetPos).sub(direction.clone().multiplyScalar(15))
        
        const arrowGeometry = new THREE.ConeGeometry(3, arrowLength, 8)
        const arrowMaterial = new THREE.MeshBasicMaterial({
          color: 0x6366f1,
          transparent: true,
          opacity: 0.6
        })
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial)
        arrow.position.copy(arrowPos)
        
        const quaternion = new THREE.Quaternion()
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
        arrow.setRotationFromQuaternion(quaternion)
        
        graphRoot.add(arrow)
        arrowObjectsRef.current.push(arrow)
      }
    })

    links.filter((l) => l.kind === 'semantic').forEach(link => {
      const sourcePos = nodePositions.get(link.source)
      const targetPos = nodePositions.get(link.target)
      if (!sourcePos || !targetPos) return
      const points = [sourcePos, targetPos]
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const material = new THREE.LineDashedMaterial({
        color: 0xa78bfa,
        transparent: true,
        opacity: 0.6,
        dashSize: 8,
        gapSize: 5,
      })
      const line = new THREE.Line(geometry, material)
      line.computeLineDistances()
      graphRoot.add(line)
      lineObjectsRef.current.push(line)
    })

    clockRef.current = new THREE.Clock()

    const animate = () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !controlsRef.current) return

      controlsRef.current.update()

      const delta = clockRef.current.getDelta()
      const time = clockRef.current.elapsedTime
      const isIdle = Date.now() - lastInteractionAtRef.current >= IDLE_AUTO_ROTATE_DELAY_MS
      if (isIdle && graphRootRef.current) {
        graphRootRef.current.rotateOnAxis(AUTO_ROTATE_AXIS, AUTO_ROTATE_SPEED_RAD_PER_SEC * delta)
      }

      nodeObjectsRef.current.forEach((obj, id) => {
        if (id === selectedNodeIdRef.current && obj.glowMesh) {
          ;(obj.glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(time * 3) * 0.1
          obj.glowMesh.scale.setScalar(1.5 + Math.sin(time * 2) * 0.1)
        }
      })

      rendererRef.current.render(sceneRef.current, cameraRef.current)
      animationIdRef.current = requestAnimationFrame(animate)
    }

    animate()

    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return
      const { width: w, height: h } = measureGraphContainer(containerRef.current)
      if (w < 2 || h < 2) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    window.addEventListener('resize', handleResize)
    const resizeObserver = new ResizeObserver(() => handleResize())
    resizeObserver.observe(container)
    requestAnimationFrame(() => handleResize())

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      controls.removeEventListener('start', markInteraction)
      controls.removeEventListener('change', markInteraction)
      renderer.domElement.removeEventListener('pointerdown', markInteraction)
      renderer.domElement.removeEventListener('wheel', markInteraction)
      nodeObjectsRef.current.forEach(obj => {
        graphRoot.remove(obj.mesh)
        graphRoot.remove(obj.sprite)
        if (obj.glowMesh) graphRoot.remove(obj.glowMesh)
        obj.mesh.geometry.dispose()
        ;(obj.mesh.material as THREE.Material).dispose()
        obj.sprite.material.map?.dispose()
        obj.sprite.material.dispose()
        if (obj.glowMesh) {
          obj.glowMesh.geometry.dispose()
          ;(obj.glowMesh.material as THREE.Material).dispose()
        }
      })
      nodeObjectsRef.current.clear()
      
      lineObjectsRef.current.forEach(line => {
        graphRoot.remove(line)
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      })
      lineObjectsRef.current = []
      
      arrowObjectsRef.current.forEach(arrow => {
        graphRoot.remove(arrow)
        arrow.geometry.dispose()
        ;(arrow.material as THREE.Material).dispose()
      })
      arrowObjectsRef.current = []
      scene.remove(graphRoot)
      graphRootRef.current = null
      
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [nodes, links, isDark, createTextSprite])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseMove = (event: MouseEvent) => {
      if (!container || !cameraRef.current || !rendererRef.current) return

      const rect = rendererRef.current.domElement.getBoundingClientRect()
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current)

      const meshes = Array.from(nodeObjectsRef.current.values()).map(obj => obj.mesh)
      const intersects = raycasterRef.current.intersectObjects(meshes)

      if (intersects.length > 0) {
        const nodeId = intersects[0].object.userData.nodeId as string
        const nodeObj = nodeObjectsRef.current.get(nodeId)
        container.style.cursor = 'pointer'
        
        if (hoveredNodeIdRef.current !== nodeId && selectedNodeIdRef.current !== nodeId) {
          hoveredNodeIdRef.current = nodeId
          setHoveredNode(nodeObj?.node || null)
          if (!selectedNodeIdRef.current) {
            highlightNode(nodeId, true)
          }
        }
      } else {
        container.style.cursor = 'grab'
        if (hoveredNodeIdRef.current && !selectedNodeIdRef.current) {
          hoveredNodeIdRef.current = null
          setHoveredNode(null)
          highlightNode(null)
        }
      }
    }

    const handleClick = (event: MouseEvent) => {
      if (!container || !cameraRef.current || !rendererRef.current) return

      const rect = rendererRef.current.domElement.getBoundingClientRect()
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current)

      const meshes = Array.from(nodeObjectsRef.current.values()).map(obj => obj.mesh)
      const intersects = raycasterRef.current.intersectObjects(meshes)

      if (intersects.length > 0) {
        const nodeId = intersects[0].object.userData.nodeId as string
        const nodeObj = nodeObjectsRef.current.get(nodeId)

        if (selectedNodeIdRef.current === nodeId) {
          selectedNodeIdRef.current = null
          setSelectedNode(null)
          highlightNode(null)
        } else {
          selectedNodeIdRef.current = nodeId
          setSelectedNode(nodeObj?.node || null)
          highlightNode(nodeId)
        }
      } else {
        selectedNodeIdRef.current = null
        hoveredNodeIdRef.current = null
        setSelectedNode(null)
        setHoveredNode(null)
        highlightNode(null)
      }
    }

    const handleDoubleClick = (event: MouseEvent) => {
      if (!container || !cameraRef.current || !rendererRef.current) return

      const rect = rendererRef.current.domElement.getBoundingClientRect()
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current)

      const meshes = Array.from(nodeObjectsRef.current.values()).map(obj => obj.mesh)
      const intersects = raycasterRef.current.intersectObjects(meshes)

      if (intersects.length > 0) {
        const nodeId = intersects[0].object.userData.nodeId as string
        const nodeObj = nodeObjectsRef.current.get(nodeId)

        if (nodeObj && onNodeClick) {
          onNodeClick(nodeObj.node)
        }
      }
    }

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('click', handleClick)
    container.addEventListener('dblclick', handleDoubleClick)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('click', handleClick)
      container.removeEventListener('dblclick', handleDoubleClick)
    }
  }, [highlightNode, onNodeClick])

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString()
  }

  return (
    <div
      ref={containerRef}
      data-testid="graph-3d-canvas"
      style={{
        width: '100%',
        flex: 1,
        minHeight: 480,
        background: isDark ? '#0f0f1a' : '#f0f0f5',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        padding: '8px 12px',
        background: isDark ? 'rgba(30, 30, 46, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        borderRadius: 6,
        fontSize: 12,
        color: isDark ? '#a6adc8' : '#6b7280',
        pointerEvents: 'none',
        zIndex: 10
      }}>
        拖拽旋转 | 滚轮缩放 | 空闲自动缓转 | 单击选中 | 双击打开
      </div>

      {selectedNode && (
        <div style={{
          position: 'absolute',
          top: 12,
          right: 12,
          padding: '16px 20px',
          background: isDark 
            ? 'rgba(30, 30, 46, 0.95)' 
            : 'rgba(255, 255, 255, 0.95)',
          borderRadius: 12,
          boxShadow: isDark 
            ? '0 8px 32px rgba(0, 0, 0, 0.4)' 
            : '0 8px 32px rgba(0, 0, 0, 0.15)',
          minWidth: 280,
          maxWidth: 360,
          zIndex: 20,
          border: isDark 
            ? '1px solid rgba(255, 255, 255, 0.1)' 
            : '1px solid rgba(0, 0, 0, 0.08)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12
          }}>
            <div style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: selectedNode.color,
              boxShadow: `0 0 12px ${selectedNode.color}`
            }} />
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: isDark ? '#f0f0f5' : '#1f2937',
              wordBreak: 'break-all'
            }}>
              {selectedNode.name}
            </div>
          </div>
          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: 13,
            color: isDark ? '#a6adc8' : '#6b7280'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('importance')}</span>
              <span style={{ color: isDark ? '#f0f0f5' : '#1f2937' }}>
                {Math.round(selectedNode.importance)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('backlinkCount')}</span>
              <span style={{ color: isDark ? '#f0f0f5' : '#1f2937' }}>
                {selectedNode.inDegree}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('mentionCount')}</span>
              <span style={{ color: isDark ? '#f0f0f5' : '#1f2937' }}>
                {selectedNode.mentionCount}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('connections')}</span>
              <span style={{ color: isDark ? '#f0f0f5' : '#1f2937' }}>
                {selectedNode.outDegree}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('nodeSize')}</span>
              <span style={{ color: isDark ? '#f0f0f5' : '#1f2937' }}>
                {Math.round(selectedNode.size)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('lastModified')}</span>
              <span style={{ color: isDark ? '#f0f0f5' : '#1f2937', fontSize: 12 }}>
                {formatDate(selectedNode.lastModified)}
              </span>
            </div>
            {selectedNode.tags.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <span style={{ display: 'block', marginBottom: 6 }}>{t('tags')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedNode.tags.map((tag, i) => (
                    <span key={i} style={{
                      padding: '2px 8px',
                      background: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)',
                      color: isDark ? '#a5b4fc' : '#6366f1',
                      borderRadius: 4,
                      fontSize: 11
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
            fontSize: 11,
            color: isDark ? '#6b7094' : '#9ca3af',
            textAlign: 'center'
          }}>
            {t('doubleClickOpen')}
          </div>
        </div>
      )}
    </div>
  )
}

export default GraphView3D
