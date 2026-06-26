export class Cache<T> {
  private cache: Map<string, { value: T; expires: number }> = new Map()
  private defaultTTL: number

  constructor(defaultTTL: number = 5 * 60 * 1000) {
    this.defaultTTL = defaultTTL
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key)
    if (!item) return undefined
    
    if (Date.now() > item.expires) {
      this.cache.delete(key)
      return undefined
    }
    
    return item.value
  }

  set(key: string, value: T, ttl?: number): void {
    this.cache.set(key, {
      value,
      expires: Date.now() + (ttl || this.defaultTTL),
    })
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    this.cleanup()
    return this.cache.size
  }

  private cleanup(): void {
    const now = Date.now()
    this.cache.forEach((item, key) => {
      if (now > item.expires) {
        this.cache.delete(key)
      }
    })
  }
}

export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>()
  
  return ((...args: Parameters<T>) => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args)
    
    if (cache.has(key)) {
      return cache.get(key)
    }
    
    const result = fn(...args)
    cache.set(key, result)
    
    return result
  }) as T
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    
    timeoutId = setTimeout(() => {
      fn(...args)
      timeoutId = null
    }, delay)
  }
}

export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}
