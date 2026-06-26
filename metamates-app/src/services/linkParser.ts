export interface WikiLink {
  text: string
  target: string
  start: number
  end: number
}

export interface Tag {
  text: string
  name: string
  start: number
  end: number
}

export interface ParsedContent {
  links: WikiLink[]
  tags: Tag[]
}

export class LinkParser {
  private static WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  private static TAG_REGEX = /#([\u4e00-\u9fa5\w]+)/g

  static parse(content: string): ParsedContent {
    const links: WikiLink[] = []
    const tags: Tag[] = []
    const linkRanges: { start: number; end: number }[] = []

    let linkMatch
    while ((linkMatch = this.WIKI_LINK_REGEX.exec(content)) !== null) {
      const target = linkMatch[1].trim()
      const displayText = linkMatch[2] || target
      
      links.push({
        text: displayText,
        target: target,
        start: linkMatch.index,
        end: linkMatch.index + linkMatch[0].length,
      })
      
      linkRanges.push({
        start: linkMatch.index,
        end: linkMatch.index + linkMatch[0].length,
      })
    }

    let tagMatch
    while ((tagMatch = this.TAG_REGEX.exec(content)) !== null) {
      const tagName = tagMatch[1].trim()
      
      const beforeIndex = tagMatch.index - 1
      if (beforeIndex >= 0) {
        const charBefore = content[beforeIndex]
        if (charBefore === '[' || charBefore === ']' || charBefore === '`') {
          continue
        }
      }
      
      const tagStart = tagMatch.index
      const tagEnd = tagMatch.index + tagMatch[0].length
      const isInsideLink = linkRanges.some(
        range => tagStart >= range.start && tagEnd <= range.end
      )
      if (isInsideLink) {
        continue
      }
      
      tags.push({
        text: tagMatch[0],
        name: tagName,
        start: tagMatch.index,
        end: tagMatch.index + tagMatch[0].length,
      })
    }

    return { links, tags }
  }

  static extractAllLinks(files: { name: string; content: string }[]): Map<string, string[]> {
    const linkMap = new Map<string, string[]>()
    
    for (const file of files) {
      const { links } = this.parse(file.content)
      
      for (const link of links) {
        const targetName = link.target.toLowerCase()
        const existing = linkMap.get(targetName) || []
        if (!existing.includes(file.name)) {
          existing.push(file.name)
        }
        linkMap.set(targetName, existing)
      }
    }
    
    return linkMap
  }

  static findBacklinks(
    targetFile: string,
    files: { name: string; content: string }[]
  ): { fileName: string; context: string }[] {
    const backlinks: { fileName: string; context: string }[] = []
    const targetName = targetFile.replace(/\.md$/i, '').toLowerCase()
    
    for (const file of files) {
      if (file.name.toLowerCase() === targetFile.toLowerCase()) continue
      
      const { links } = this.parse(file.content)
      const hasLink = links.some(
        link => link.target.toLowerCase() === targetName
      )
      
      if (hasLink) {
        const lines = file.content.split('\n')
        const contextLines: string[] = []
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(`[[${targetName}`)) {
            const start = Math.max(0, i - 1)
            const end = Math.min(lines.length - 1, i + 1)
            contextLines.push(lines.slice(start, end + 1).join('\n'))
          }
        }
        
        backlinks.push({
          fileName: file.name,
          context: contextLines.join('\n...\n'),
        })
      }
    }
    
    return backlinks
  }

  static extractAllTags(files: { name: string; content: string }[]): Map<string, string[]> {
    const tagMap = new Map<string, string[]>()
    
    for (const file of files) {
      const { tags } = this.parse(file.content)
      
      for (const tag of tags) {
        const existing = tagMap.get(tag.name) || []
        if (!existing.includes(file.name)) {
          existing.push(file.name)
        }
        tagMap.set(tag.name, existing)
      }
    }
    
    return tagMap
  }

  static findFilesByTag(
    tagName: string,
    files: { name: string; content: string }[]
  ): { fileName: string; matches: string[] }[] {
    const results: { fileName: string; matches: string[] }[] = []
    const normalizedTag = tagName.toLowerCase()
    
    for (const file of files) {
      const { tags } = this.parse(file.content)
      const matchingTags = tags.filter(
        tag => tag.name.toLowerCase() === normalizedTag
      )
      
      if (matchingTags.length > 0) {
        results.push({
          fileName: file.name,
          matches: matchingTags.map(t => t.text),
        })
      }
    }
    
    return results
  }

  static resolveLink(
    linkTarget: string,
    workspaceFiles: string[]
  ): string | null {
    const normalizedTarget = linkTarget.toLowerCase().replace(/\.md$/i, '')
    
    const exactMatch = workspaceFiles.find(
      f => f.toLowerCase() === `${normalizedTarget}.md`
    )
    if (exactMatch) return exactMatch
    
    const partialMatch = workspaceFiles.find(
      f => f.toLowerCase().replace(/\.md$/i, '') === normalizedTarget
    )
    if (partialMatch) return partialMatch
    
    const fuzzyMatch = workspaceFiles.find(
      f => f.toLowerCase().includes(normalizedTarget)
    )
    if (fuzzyMatch) return fuzzyMatch
    
    return null
  }
}

export const linkParser = new LinkParser()
