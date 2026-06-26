const renderMarkdownCache = new Map<string, string>()

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(16)
}

export function getCachedMarkdown(content: string, renderFn: (text: string) => string): string {
  const cacheKey = `${content.length}-${simpleHash(content)}`
  const cached = renderMarkdownCache.get(cacheKey)
  if (cached) return cached

  const result = renderFn(content)
  if (renderMarkdownCache.size > 500) {
    const firstKey = renderMarkdownCache.keys().next().value
    if (firstKey) renderMarkdownCache.delete(firstKey)
  }
  renderMarkdownCache.set(cacheKey, result)
  return result
}
