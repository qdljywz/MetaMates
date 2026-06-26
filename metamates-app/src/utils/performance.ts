export class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics: Map<string, number[]> = new Map()

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  startMeasure(label: string): void {
    performance.mark(`${label}-start`)
  }

  endMeasure(label: string): number {
    performance.mark(`${label}-end`)
    performance.measure(label, `${label}-start`, `${label}-end`)
    
    const measure = performance.getEntriesByName(label, 'measure')
    const duration = measure[measure.length - 1]?.duration || 0
    
    this.recordMetric(label, duration)
    
    performance.clearMarks(`${label}-start`)
    performance.clearMarks(`${label}-end`)
    performance.clearMeasures(label)
    
    return duration
  }

  private recordMetric(label: string, value: number): void {
    if (!this.metrics.has(label)) {
      this.metrics.set(label, [])
    }
    this.metrics.get(label)!.push(value)
  }

  getAverageTime(label: string): number {
    const values = this.metrics.get(label) || []
    if (values.length === 0) return 0
    return values.reduce((a, b) => a + b, 0) / values.length
  }

  getMetrics(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const result: Record<string, { avg: number; min: number; max: number; count: number }> = {}
    
    this.metrics.forEach((values, label) => {
      result[label] = {
        avg: this.getAverageTime(label),
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length,
      }
    })
    
    return result
  }

  clearMetrics(): void {
    this.metrics.clear()
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance()

export function measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    performanceMonitor.startMeasure(label)
    fn()
      .then((result) => {
        performanceMonitor.endMeasure(label)
        resolve(result)
      })
      .catch((error) => {
        performanceMonitor.endMeasure(label)
        reject(error)
      })
  })
}

export function measureSync<T>(label: string, fn: () => T): T {
  performanceMonitor.startMeasure(label)
  const result = fn()
  performanceMonitor.endMeasure(label)
  return result
}
