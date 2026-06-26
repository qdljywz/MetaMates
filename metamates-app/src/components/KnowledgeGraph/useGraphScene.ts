import { useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface GraphNode {
  id: string
  name: string
  connections: string[]
  size: number
  color: string
  tags: string[]
  lastModified: number
}

interface GraphLink {
  source: string
  target: string
}

interface NodeObject {
  mesh: THREE.Mesh
  sprite: THREE.Sprite
  node: GraphNode
}

interface UseGraphSceneProps {
  containerRef: React.RefObject<HTMLDivElement>
  nodes: GraphNode[]
  links: GraphLink[]
  selectedNodeId: string | null
  hoveredNodeId: string | null
  onNodeClick?: (nodeId: string) => void
  onNodeHover?: (nodeId: string | null) => void
}

const SPHERE_RADIUS = 180

export function useGraphScene({
  containerRef,
  nodes,
  links,
  selectedNodeId,
  hoveredNodeId,
  onNodeClick,
  onNodeHover
}: UseGraphSceneProps) {
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const nodeObjectsRef = useRef<Map<string, NodeObject>>(new Map())
  const lineObjectsRef = useRef<THREE.Line[]>([])
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2())
  const animationIdRef = useRef<number | null>(null)

  const getRelatedNodeIds = useCallback((nodeId: string): Set<string> => {
    const related = new Set<string>([nodeId])
    links.forEach(link => {
      if (link.source === nodeId) related.add(link.target)
      if (link.target === nodeId) related.add(link.source)
    })
    return related
  }, [links])

  const createTextSprite = useCallback((text: string, _color: string): THREE.Sprite => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    canvas.width = 256
    canvas.height = 64
    
    context.fillStyle = 'transparent'
    context.fillRect(0, 0, canvas.width, canvas.height)
    
    context.font = 'bold 24px Arial'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    
    context.fillStyle = '#ffffff'
    context.fillText(text, canvas.width / 2, canvas.height / 2)
    
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    
    const material = new THREE.SpriteMaterial({ 
      map: texture, 
      transparent: true,
      depthTest: false,
      opacity: 0.35
    })
    
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(40, 10, 1)
    
    return sprite
  }, [])

  const initScene = useCallback(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000)
    camera.position.set(0, 0, 400)
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
    controls.minDistance = 100
    controls.maxDistance = 800
    controlsRef.current = controls

    const mainLight = new THREE.DirectionalLight(0xffffff, 1)
    mainLight.position.set(100, 100, 100)
    scene.add(mainLight)

    const rimLight = new THREE.DirectionalLight(0xf59e0b, 0.6)
    rimLight.position.set(-100, -100, 100)
    scene.add(rimLight)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    scene.add(ambientLight)

    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [containerRef])

  const updateNodes = useCallback(() => {
    if (!sceneRef.current) return

    nodeObjectsRef.current.forEach(obj => {
      sceneRef.current?.remove(obj.mesh)
      sceneRef.current?.remove(obj.sprite)
      obj.mesh.geometry.dispose()
      ;(obj.mesh.material as THREE.Material).dispose()
      obj.sprite.material.map?.dispose()
      obj.sprite.material.dispose()
    })
    nodeObjectsRef.current.clear()

    nodes.forEach((node, i) => {
      const phi = Math.acos(-1 + (2 * i) / nodes.length)
      const theta = Math.sqrt(nodes.length * Math.PI) * phi

      const x = SPHERE_RADIUS * Math.cos(theta) * Math.sin(phi)
      const y = SPHERE_RADIUS * Math.sin(theta) * Math.sin(phi)
      const z = SPHERE_RADIUS * Math.cos(phi)

      const geometry = new THREE.SphereGeometry(node.size / 4, 32, 32)
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(node.color),
        emissive: new THREE.Color(node.color),
        emissiveIntensity: 0.3,
        metalness: 0.8,
        roughness: 0.2,
        transparent: true,
        opacity: 1
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, y, z)
      mesh.userData = { nodeId: node.id }

      const sprite = createTextSprite(node.name, node.color)
      sprite.position.set(x, y, z + node.size / 3)

      sceneRef.current?.add(mesh)
      sceneRef.current?.add(sprite)

      nodeObjectsRef.current.set(node.id, { mesh, sprite, node })
    })
  }, [nodes, createTextSprite])

  const updateLinks = useCallback(() => {
    if (!sceneRef.current) return

    lineObjectsRef.current.forEach(line => {
      sceneRef.current?.remove(line)
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    })
    lineObjectsRef.current = []

    const nodePositions = new Map<string, THREE.Vector3>()
    nodeObjectsRef.current.forEach((obj, id) => {
      nodePositions.set(id, obj.mesh.position.clone())
    })

    links.forEach(link => {
      const sourcePos = nodePositions.get(link.source)
      const targetPos = nodePositions.get(link.target)

      if (sourcePos && targetPos) {
        const points = [sourcePos, targetPos]
        const geometry = new THREE.BufferGeometry().setFromPoints(points)
        const material = new THREE.LineBasicMaterial({ 
          color: 0x94a3b8,
          transparent: true,
          opacity: 0.5
        })
        const line = new THREE.Line(geometry, material)
        sceneRef.current?.add(line)
        lineObjectsRef.current.push(line)
      }
    })
  }, [links])

  const highlightNode = useCallback((nodeId: string | null) => {
    const relatedIds = nodeId ? getRelatedNodeIds(nodeId) : new Set()

    nodeObjectsRef.current.forEach((obj, id) => {
      const isRelated = relatedIds.has(id)

      if (isRelated) {
        obj.mesh.scale.setScalar(1.6)
        ;(obj.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5
        ;(obj.mesh.material as THREE.MeshStandardMaterial).opacity = 1
        obj.sprite.material.opacity = 1
      } else if (nodeId) {
        obj.mesh.scale.setScalar(0.3)
        ;(obj.mesh.material as THREE.MeshStandardMaterial).opacity = 0.02
        ;(obj.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.01
        obj.sprite.material.opacity = 0.01
      } else {
        obj.mesh.scale.setScalar(1)
        ;(obj.mesh.material as THREE.MeshStandardMaterial).opacity = 1
        ;(obj.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3
        obj.sprite.material.opacity = 0.35
      }
    })

    lineObjectsRef.current.forEach(line => {
      const sourceId = nodes.find(n => {
        const obj = nodeObjectsRef.current.get(n.id)
        const posArray = line.geometry.attributes.position.array as Float32Array
        return obj && obj.mesh.position.x === posArray[0] && obj.mesh.position.y === posArray[1] && obj.mesh.position.z === posArray[2]
      })?.id
      
      const isRelated = nodeId && relatedIds.has(sourceId || '')
      ;(line.material as THREE.LineBasicMaterial).opacity = isRelated || !nodeId ? 0.8 : 0.005
    })
  }, [getRelatedNodeIds, nodes])

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !rendererRef.current) return

    const rect = rendererRef.current.domElement.getBoundingClientRect()
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current)

    const meshes = Array.from(nodeObjectsRef.current.values()).map(obj => obj.mesh)
    const intersects = raycasterRef.current.intersectObjects(meshes)

    if (intersects.length > 0) {
      const nodeId = intersects[0].object.userData.nodeId as string
      onNodeHover?.(nodeId)
      rendererRef.current.domElement.style.cursor = 'pointer'
    } else {
      onNodeHover?.(null)
      rendererRef.current.domElement.style.cursor = 'grab'
    }
  }, [containerRef, onNodeHover])

  const handleClick = useCallback((event: MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !rendererRef.current) return

    const rect = rendererRef.current.domElement.getBoundingClientRect()
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current)

    const meshes = Array.from(nodeObjectsRef.current.values()).map(obj => obj.mesh)
    const intersects = raycasterRef.current.intersectObjects(meshes)

    if (intersects.length > 0) {
      const nodeId = intersects[0].object.userData.nodeId as string
      onNodeClick?.(nodeId)
    }
  }, [containerRef, onNodeClick])

  const animate = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !controlsRef.current) return

    controlsRef.current.update()
    rendererRef.current.render(sceneRef.current, cameraRef.current)
    animationIdRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    const cleanup = initScene()
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      cleanup?.()
    }
  }, [initScene])

  useEffect(() => {
    updateNodes()
    updateLinks()
  }, [updateNodes, updateLinks])

  useEffect(() => {
    highlightNode(selectedNodeId || hoveredNodeId)
  }, [selectedNodeId, hoveredNodeId, highlightNode])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('click', handleClick)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('click', handleClick)
    }
  }, [containerRef, handleMouseMove, handleClick])

  useEffect(() => {
    animate()
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
    }
  }, [animate])

  return {
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current
  }
}
