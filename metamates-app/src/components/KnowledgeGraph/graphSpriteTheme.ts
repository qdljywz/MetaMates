function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.replace('#', '').trim()
  const full = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

export function cssColorToRgba(color: string, alpha: number): string {
  const rgb = hexToRgb(color)
  if (rgb) return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (match) return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`
  return color
}

export interface GraphLabelSpritePalette {
  defaultFill: string
  defaultStroke: string
  defaultText: string
  highlightFill: string
  selectedStops: [string, string]
  activeStroke: string
  idleStroke: string
  shadow: string
}

export function getGraphLabelSpritePalette(isDark: boolean): GraphLabelSpritePalette {
  const accent = readCssVar('--accent', isDark ? '#ff8c28' : '#ff7a00')
  const secondary = readCssVar('--secondary-accent', isDark ? '#00d4c4' : '#00b4a6')

  return {
    defaultFill: isDark ? 'rgba(28, 28, 31, 0.92)' : 'rgba(255, 255, 255, 0.94)',
    defaultStroke: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
    defaultText: isDark ? '#fafafa' : '#09090b',
    highlightFill: cssColorToRgba(accent, 0.92),
    selectedStops: [cssColorToRgba(accent, 0.98), cssColorToRgba(secondary, 0.98)],
    activeStroke: 'rgba(255, 255, 255, 0.5)',
    idleStroke: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
    shadow: isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.2)',
  }
}

export function paintGraphLabelSprite(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
  isHighlighted: boolean,
  isSelected: boolean,
  palette: GraphLabelSpritePalette,
): void {
  const padding = 20
  const borderRadius = 12

  if (isSelected) {
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, palette.selectedStops[0])
    gradient.addColorStop(1, palette.selectedStops[1])
    context.fillStyle = gradient
  } else if (isHighlighted) {
    context.fillStyle = palette.highlightFill
  } else {
    context.fillStyle = palette.defaultFill
  }

  context.beginPath()
  context.roundRect(padding, padding, canvas.width - padding * 2, canvas.height - padding * 2, borderRadius)
  context.fill()

  if (isHighlighted || isSelected) {
    context.strokeStyle = palette.activeStroke
    context.lineWidth = 3
    context.stroke()
  } else {
    context.strokeStyle = palette.idleStroke
    context.lineWidth = 1
    context.stroke()
  }

  const fontSize = isSelected ? 42 : (isHighlighted ? 36 : 32)
  context.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`
  context.fillStyle = isSelected || isHighlighted ? '#ffffff' : palette.defaultText
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  context.shadowColor = palette.shadow
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
  context.shadowColor = 'transparent'
  context.shadowBlur = 0
  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
}
