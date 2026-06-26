import React, { useEffect, useRef, useState, useCallback } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { drawSelection } from '@codemirror/view'
import { StateEffect, StateField } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { keymap, KeyBinding, ViewPlugin, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view'
import { syntaxTree, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { message, Button, Tooltip, Divider, Tabs, Tag, List, Empty, Modal, Input } from 'antd'
import { useTranslation } from 'react-i18next'
import { 
  BoldOutlined, 
  ItalicOutlined, 
  UnorderedListOutlined, 
  OrderedListOutlined,
  CheckSquareOutlined,
  LinkOutlined,
  CodeOutlined,
  FontSizeOutlined,
  MessageOutlined,
  AppstoreOutlined,
  MinusOutlined,
  LinkOutlined as LinkIcon,
  StrikethroughOutlined,
  HighlightOutlined,
  EyeOutlined,
  EditOutlined,
  ColumnWidthOutlined,
} from '@ant-design/icons'
import { LinkParser, type Tag as ParsedTag, type WikiLink } from '../services/linkParser'
import type { LinkDebtScore, PotentialLink } from '../services/linkIntelligence'
import { useAppContext } from '../store/AppContext'
import { workspaceIndexService } from '../services/workspaceIndex'
import { createWikiLinkAutocomplete } from '../codemirror/wikiLinkAutocomplete'
import { useTheme } from '../hooks/useTheme'
import MarkdownPreview from './MarkdownPreview'
import FrontmatterPanel from './editor/FrontmatterPanel'
import { extractBlockContent, extractHeadingContent, stripFrontmatter, parseLinkTarget, findHeadingLine, findBlockLine } from '../services/embedResolver'
import { getWorkspaceLanguage, resolveInboxDirPath } from '../constants/paths'
import { buildEditorWelcomeContent, isEditorWelcomeContent } from '../utils/welcomeContent'
import { useWelcomeAgentHint } from '../hooks/useWelcomeAgentHint'

interface EditorProps {
  filePath?: string
}

const HIDDEN_MARK_NAMES = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrongEmphasisMark',
  'StrikethroughMark',
  'HighlightMark',
  'ProcessInstruction',
  'CodeMark',
  'LinkMark',
  'URL',
  'QuoteMark',
  'ListMark',
  'HorizontalRule',
])

const hideMarksPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view)
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const decorations: any[] = []
    const cursorPos = view.state.selection.main.head
    const cursorLine = view.state.doc.lineAt(cursorPos).number
    
    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from,
        to,
        enter: (node) => {
          const nodeLine = view.state.doc.lineAt(node.from).number
          
          if (nodeLine === cursorLine) {
            return
          }
          
          if (HIDDEN_MARK_NAMES.has(node.name)) {
            decorations.push(
              Decoration.mark({ class: 'cm-hidden-mark' }).range(node.from, node.to)
            )
          }
        },
      })
    }
    
    return Decoration.set(decorations)
  }
}, {
  decorations: (v) => v.decorations,
})

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, class: 'cm-header-1' },
  { tag: tags.heading2, class: 'cm-header-2' },
  { tag: tags.heading3, class: 'cm-header-3' },
  { tag: tags.heading4, class: 'cm-header-4' },
  { tag: tags.heading5, class: 'cm-header-5' },
  { tag: tags.heading6, class: 'cm-header-6' },
  { tag: tags.strong, class: 'cm-strong' },
  { tag: tags.emphasis, class: 'cm-emphasis' },
  { tag: tags.strikethrough, class: 'cm-strikethrough' },
  { tag: tags.monospace, class: 'cm-monospace' },
  { tag: tags.link, class: 'cm-link' },
])

const createWikiLinkPlugin = (onLinkClick: (target: string) => void) => {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet
    
    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }
    
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }
    
    buildDecorations(view: EditorView): DecorationSet {
      const decorations: any[] = []
      const cursorPos = view.state.selection.main.head
      const cursorLine = view.state.doc.lineAt(cursorPos).number
      
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to)
        const wikiLinkRegex = /\[\[([^\]|]+?)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g
        let match
        while ((match = wikiLinkRegex.exec(text)) !== null) {
          const linkStart = from + match.index
          const linkEnd = linkStart + match[0].length
          const linkTarget = match[2] ? `${match[1]}#${match[2]}` : match[1]
          const linkLine = view.state.doc.lineAt(linkStart).number
          
          if (linkLine !== cursorLine) {
            decorations.push(
              Decoration.mark({ class: 'cm-hidden-mark' }).range(linkStart, linkStart + 2),
              Decoration.mark({ class: 'cm-hidden-mark' }).range(linkEnd - 2, linkEnd)
            )
          }
          
          const linkTextStart = linkStart + 2
          const linkTextEnd = linkEnd - 2
          decorations.push(
            Decoration.mark({
              class: 'cm-wiki-link',
              attributes: {
                'data-link-target': linkTarget,
              },
            }).range(linkTextStart, linkTextEnd)
          )
        }
      }
      
      return Decoration.set(decorations.sort((a, b) => a.from - b.from))
    }
  }, {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click: (e, _view) => {
        let target = e.target as HTMLElement | null
        while (target && target !== _view.dom) {
          if (target.classList && target.classList.contains('cm-wiki-link')) {
            const linkTarget = target.getAttribute('data-link-target')
            if (linkTarget) {
              onLinkClick(linkTarget)
              return
            }
          }
          target = target.parentElement
        }
      }
    }
  })
}

const createTagPlugin = (onTagClick: (tagName: string) => void) => {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet
    
    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }
    
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }
    
    buildDecorations(view: EditorView): DecorationSet {
      const decorations: any[] = []
      
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to)
        const tagRegex = /#([\u4e00-\u9fa5\w]+)/g
        let match
        while ((match = tagRegex.exec(text)) !== null) {
          const tagStart = from + match.index
          const tagEnd = tagStart + match[0].length
          const tagName = match[1]
          
          const beforeIndex = match.index - 1
          if (beforeIndex >= 0) {
            const charBefore = text[beforeIndex]
            if (charBefore === '[' || charBefore === ']' || charBefore === '`') {
              continue
            }
          }
          
          decorations.push(
            Decoration.mark({
              class: 'cm-tag',
              attributes: {
                'data-tag-name': tagName,
              },
            }).range(tagStart, tagEnd)
          )
        }
      }
      
      return Decoration.set(decorations.sort((a, b) => a.from - b.from))
    }
  }, {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click: (e, _view) => {
        let target = e.target as HTMLElement | null
        while (target && target !== _view.dom) {
          if (target.classList && target.classList.contains('cm-tag')) {
            const tagName = target.getAttribute('data-tag-name')
            if (tagName) {
              onTagClick(tagName)
              return
            }
          }
          target = target.parentElement
        }
      }
    }
  })
}

const hideMarksTheme = EditorView.baseTheme({
  '.cm-hidden-mark': {
    color: 'transparent',
    fontSize: '0.01px',
    letterSpacing: '-0.5em',
  },
  '.cm-jump-highlight': {
    backgroundColor: 'rgba(255, 122, 0, 0.22)',
  },
})

const setJumpHighlight = StateEffect.define<number | null>()

const jumpHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(setJumpHighlight)) {
        if (effect.value == null) return Decoration.none
        const line = tr.state.doc.line(Math.min(effect.value, tr.state.doc.lines))
        return Decoration.set([Decoration.line({ class: 'cm-jump-highlight' }).range(line.from)])
      }
    }
    return decorations
  },
  provide: (field) => EditorView.decorations.from(field),
})

const Editor: React.FC<EditorProps> = ({ filePath }) => {
  const { t, i18n } = useTranslation('editor')
  const { t: tCommon } = useTranslation('common')
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [currentFile, setCurrentFile] = useState<string>('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [showRightPanel, setShowRightPanel] = useState(false)
  const [activeSidebarTab, setActiveSidebarTab] = useState<'links' | 'tags' | 'properties'>('links')
  const [currentTags, setCurrentTags] = useState<ParsedTag[]>([])
  const [currentLinks, setCurrentLinks] = useState<WikiLink[]>([])
  const [backlinks, setBacklinks] = useState<{ fileName: string; context: string }[]>([])
  const [potentialLinks, setPotentialLinks] = useState<PotentialLink[]>([])
  const [linkDebt, setLinkDebt] = useState<LinkDebtScore | null>(null)
  const noteStemsRef = useRef<string[]>([])
  const [allTags, setAllTags] = useState<Map<string, { name: string; path: string }[]>>(new Map())
  const { state, dispatch } = useAppContext()
  const agentWelcomeHint = useWelcomeAgentHint(state.workspacePath)
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [filePickerFiles, setFilePickerFiles] = useState<{ name: string; path: string }[]>([])
  const [filePickerSearch, setFilePickerSearch] = useState('')
  const [_pendingLinkInsert, _setPendingLinkInsert] = useState<(() => void) | null>(null)
  const currentFileRef = useRef<string>('')
  const saveFileRef = useRef<() => Promise<void>>(async () => {})
  const isLoadingFile = useRef<boolean>(false)
  const handleLinkClickRef = useRef<(target: string) => void>(() => {})
  const handleTagClickRef = useRef<(name: string) => void>(() => {})
  const [editorReady, setEditorReady] = useState(false)
  const [showTagFiles, setShowTagFiles] = useState(false)
  const [selectedTagName, setSelectedTagName] = useState('')
  const [tagFiles, setTagFiles] = useState<{ name: string; path: string }[]>([])
  const jumpTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastNavTokenRef = useRef<number>(0)
  const [editorViewMode, setEditorViewMode] = useState<'edit' | 'preview' | 'split'>('edit')
  const [previewContent, setPreviewContent] = useState('')

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const theme = document.documentElement.getAttribute('data-theme')
    return theme === 'dark' || theme === null
  })

  const { theme: appTheme } = useTheme()
  
  useEffect(() => {
    if (state.editorSidebarTab) {
      setShowRightPanel(true)
      setActiveSidebarTab(state.editorSidebarTab)
    }
  }, [state.editorSidebarTab])

  useEffect(() => {
    setIsDarkMode(appTheme.mode === 'dark')
  }, [appTheme.mode])

  useEffect(() => {
    currentFileRef.current = currentFile
  }, [currentFile])

  const autoSaveEnabled = state.settings.autoSave !== false

  const saveFile = useCallback(async () => {
    const file = currentFileRef.current
    if (!window.electronAPI || !file || isSaving) {
      return
    }

    setIsSaving(true)
    try {
      const content = viewRef.current?.state.doc.toString() || ''
      const result = await window.electronAPI.writeFile(file, content)
      if (result.success) {
        setHasUnsavedChanges(false)
        setLastSaved(new Date())
        dispatch({
          type: 'UPDATE_TAB_DIRTY',
          payload: { path: file, isDirty: false },
        })
      } else {
        message.error(`${t('saveFailed')}: ${result.error}`)
      }
    } finally {
      setIsSaving(false)
    }
  }, [dispatch, isSaving, t])

  saveFileRef.current = saveFile

  const triggerAutoSave = useCallback(() => {
    if (!autoSaveEnabled) return
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (currentFileRef.current) {
        saveFileRef.current()
      }
    }, 1500)
  }, [autoSaveEnabled])

  const parseContent = useCallback((content: string) => {
    const parsed = LinkParser.parse(content)
    setCurrentTags(parsed.tags)
    setCurrentLinks(parsed.links)

    const filePath = currentFileRef.current
    if (filePath && workspaceIndexService.isReady()) {
      const analysis = workspaceIndexService.analyzePotentialLinksForFile(filePath, content)
      setPotentialLinks(analysis.potential)
      setLinkDebt(analysis.debt)
    }
  }, [])

  const loadFile = useCallback(async (path: string) => {
    if (!window.electronAPI) {
      message.warning(t('electronOnly'))
      return
    }
    
    if (!viewRef.current) {
      return
    }
    
    isLoadingFile.current = true
    
    const result = await window.electronAPI.readFile(path)
    if (result.success && result.content) {
      setCurrentFile(path)
      setHasUnsavedChanges(false)
      setLastSaved(new Date())
      if (viewRef.current) {
        viewRef.current.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: result.content },
        })
        setPreviewContent(result.content)
        parseContent(result.content)
      }
    } else {
      message.error(`${t('readFailed')}: ${result.error}`)
    }
    
    setTimeout(() => {
      isLoadingFile.current = false
    }, 100)
  }, [parseContent, t])

  const loadBacklinksAndTags = useCallback(async () => {
    if (!state.workspacePath || !window.electronAPI) return

    if (workspaceIndexService.isReady()) {
      const fileName = currentFile ? currentFile.split(/[/\\]/).pop() : ''
      if (fileName) {
        setBacklinks(workspaceIndexService.getBacklinksForFile(currentFile))
      }
      setAllTags(workspaceIndexService.getTagIndex())
      noteStemsRef.current = workspaceIndexService.getNoteStemsForAutocomplete()
      if (currentFile && viewRef.current) {
        const analysis = workspaceIndexService.analyzePotentialLinksForFile(
          currentFile,
          viewRef.current.state.doc.toString(),
        )
        setPotentialLinks(analysis.potential)
        setLinkDebt(analysis.debt)
      }
      return
    }

    const listResult = await window.electronAPI.listFiles(state.workspacePath, true)
    if (listResult.success && listResult.files) {
      const markdownFiles = listResult.files.filter(f => !f.isDirectory && f.name.endsWith('.md'))
      const fileContents: { name: string; content: string; path: string }[] = []
      
      for (const file of markdownFiles) {
        try {
          const readResult = await window.electronAPI.readFile(file.path)
          if (readResult.success && readResult.content) {
            fileContents.push({
              name: file.name,
              content: readResult.content,
              path: file.path,
            })
          }
        } catch (error) {
          console.log('Failed to read file:', file.name)
        }
      }
      
      const fileName = currentFile ? currentFile.split(/[/\\]/).pop() : ''
      if (fileName) {
        const backlinksResult = LinkParser.findBacklinks(fileName, fileContents)
        setBacklinks(backlinksResult)
      }
      
      const allTagsMap = new Map<string, { name: string; path: string }[]>()
      for (const file of fileContents) {
        const { tags } = LinkParser.parse(file.content)
        for (const tag of tags) {
          const existing = allTagsMap.get(tag.name) || []
          if (!existing.find(f => f.path === file.path)) {
            existing.push({ name: file.name, path: file.path })
          }
          allTagsMap.set(tag.name, existing)
        }
      }
      setAllTags(allTagsMap)
    }
  }, [state.workspacePath, currentFile])

  const insertText = useCallback((before: string, after: string = '') => {
    if (!viewRef.current) return
    
    const { state } = viewRef.current
    const { from, to } = state.selection.main
    const selectedText = state.doc.sliceString(from, to)
    
    viewRef.current.dispatch({
      changes: { from, to, insert: before + selectedText + after },
      selection: { anchor: from + before.length, head: from + before.length + selectedText.length },
    })
    
    viewRef.current.focus()
    setHasUnsavedChanges(true)
    triggerAutoSave()
  }, [triggerAutoSave])

  const insertAtLineStart = useCallback((prefix: string) => {
    if (!viewRef.current) return
    
    const { state } = viewRef.current
    const { from } = state.selection.main
    const line = state.doc.lineAt(from)
    
    viewRef.current.dispatch({
      changes: { from: line.from, to: line.from, insert: prefix },
      selection: { anchor: line.from + prefix.length },
    })
    
    viewRef.current.focus()
    setHasUnsavedChanges(true)
    triggerAutoSave()
  }, [triggerAutoSave])

  const formatBold = () => insertText('**', '**')
  const formatItalic = () => insertText('*', '*')
  const formatCode = () => insertText('`', '`')
  const formatLink = () => insertText('[', '](url)')
  const formatStrikethrough = () => insertText('~~', '~~')
  const formatHighlight = () => insertText('==', '==')
  const formatTag = () => insertText('#', '')
  const formatHeading = () => insertAtLineStart('## ')
  const formatQuote = () => insertAtLineStart('> ')
  const formatBulletList = () => insertAtLineStart('- ')
  const formatNumberedList = () => insertAtLineStart('1. ')
  const formatCheckbox = () => insertAtLineStart('- [ ] ')
  const formatHorizontalRule = () => insertText('\n---\n')
  const formatTable = () => {
    const col = t('table.column')
    const content = t('table.content')
    insertText(`
| ${col}1 | ${col}2 | ${col}3 |
|-----|-----|-----|
| ${content} | ${content} | ${content} |
| ${content} | ${content} | ${content} |
`)
  }
  
  const insertWikiLink = useCallback((stem: string) => {
    insertText(`[[${stem}]]`, '')
  }, [insertText])

  const formatWikiLink = useCallback(async () => {
    if (!state.workspacePath || !window.electronAPI) {
      insertText('[[', ']]')
      return
    }
    
    const result = await window.electronAPI.listFiles(state.workspacePath, true)
    if (result.success && result.files) {
      const mdFiles = result.files
        .filter((f: any) => !f.isDirectory && f.name.endsWith('.md'))
        .map((f: any) => ({ name: f.name, path: f.path }))
      setFilePickerFiles(mdFiles)
      setFilePickerSearch('')
      setShowFilePicker(true)
    } else {
      insertText('[[', ']]')
    }
  }, [state.workspacePath])
  
  const handleFilePickerSelect = useCallback((fileName: string) => {
    setShowFilePicker(false)
    const linkName = fileName.replace(/\.md$/, '')
    insertText(`[[${linkName}]]`, '')
  }, [insertText])
  
  const handleFilePickerCreate = useCallback(() => {
    setShowFilePicker(false)
    const linkName = filePickerSearch.trim() || t('wikiLink.defaultNoteName')
    insertText(`[[${linkName}]]`, '')
  }, [filePickerSearch, t, insertText])

  const createNoteFromLink = useCallback(async (linkTarget: string) => {
    if (!state.workspacePath || !window.electronAPI) {
      message.warning(tCommon('appShell.openWorkspaceFirst'))
      return
    }

    const stem = linkTarget.trim().replace(/\.md$/i, '')
    if (!stem) return

    const fileName = `${stem}.md`
    let dirPath: string
    if (currentFileRef.current) {
      dirPath = await window.electronAPI.path.dirname(currentFileRef.current)
    } else {
      dirPath = await resolveInboxDirPath(
        state.workspacePath,
        getWorkspaceLanguage(i18n.language)
      )
    }
    const targetPath = await window.electronAPI.path.join(dirPath, fileName)

    const existsResult = await window.electronAPI.fileExists(targetPath)
    if (existsResult.exists) {
      dispatch({
        type: 'ADD_TAB',
        payload: { path: targetPath, name: fileName, isDirty: false },
      })
      return
    }

    const heading = stem.replace(/_/g, ' ')
    const result = await window.electronAPI.writeFile(targetPath, `# ${heading}\n\n`)
    if (result.success) {
      dispatch({
        type: 'ADD_TAB',
        payload: { path: targetPath, name: fileName, isDirty: false },
      })
      message.success(t('wikiLink.createdAndOpened', { name: fileName }))
    } else {
      message.error(`${t('saveFailed')}: ${result.error}`)
    }
  }, [state.workspacePath, i18n.language, dispatch, t, tCommon])

  const applyEditorContent = useCallback((nextContent: string) => {
    if (!viewRef.current) return
    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: nextContent },
    })
    setPreviewContent(nextContent)
    setHasUnsavedChanges(true)
  }, [])

  const resolveNoteEmbed = useCallback(async (
    note: string,
    options?: { heading?: string; blockId?: string }
  ) => {
    if (!state.workspacePath || !window.electronAPI) return null
    const result = await window.electronAPI.listFiles(state.workspacePath, true)
    if (!result.success || !result.files) return null
    const fileNames = result.files.map((file) => file.name)
    const resolved = LinkParser.resolveLink(note, fileNames)
    if (!resolved) return null
    const file = result.files.find((item) => item.name === resolved)
    if (!file) return null
    const read = await window.electronAPI.readFile(file.path)
    if (!read.success || !read.content) return null
    const body = stripFrontmatter(read.content)
    if (options?.blockId) {
      return extractBlockContent(body, options.blockId)
    }
    if (options?.heading) {
      return extractHeadingContent(body, options.heading)
    }
    return body.slice(0, 4000)
  }, [state.workspacePath])

  const handleLinkClick = useCallback((linkTarget: string) => {
    if (!state.workspacePath || !window.electronAPI) {
      message.warning(tCommon('appShell.openWorkspaceFirst'))
      return
    }

    const { note, heading, blockId } = parseLinkTarget(linkTarget)

    window.electronAPI.listFiles(state.workspacePath, true).then(async (result) => {
      if (!result.success || !result.files) return

      const fileNames = result.files.map((file) => file.name)
      const resolved = LinkParser.resolveLink(note, fileNames)

      if (resolved) {
        const file = result.files.find((item) => item.name === resolved)
        if (!file) return

        let line: number | undefined
        if (heading || blockId) {
          const read = await window.electronAPI!.readFile(file.path)
          if (read.success && read.content) {
            if (blockId) line = findBlockLine(read.content, blockId) ?? undefined
            else if (heading) line = findHeadingLine(read.content, heading) ?? undefined
          }
        }

        dispatch({
          type: 'OPEN_EDITOR_AT',
          payload: { path: file.path, name: file.name, line },
        })
        return
      }

      Modal.confirm({
        title: t('wikiLink.notFound'),
        content: t('wikiLink.createPrompt', { name: note }),
        okText: t('wikiLink.createConfirm'),
        cancelText: tCommon('actions.cancel'),
        onOk: () => createNoteFromLink(note),
      })
    }).catch(() => {
      message.error(t('parseLinkFailed'))
    })
  }, [state.workspacePath, dispatch, createNoteFromLink, t, tCommon])

  useEffect(() => {
    handleLinkClickRef.current = handleLinkClick
  }, [handleLinkClick])

  const handleTagClick = useCallback((tagName: string) => {
    const filesWithTag = allTags.get(tagName) || []
    if (filesWithTag.length > 0) {
      setTagFiles(filesWithTag)
      setSelectedTagName(tagName)
      setShowTagFiles(true)
    } else {
      message.info(t('tag.noFiles', { name: tagName }))
    }
  }, [allTags, t])

  const handleTagFileSelect = useCallback((fileName: string) => {
    setShowTagFiles(false)
    const file = tagFiles.find(f => f.name === fileName)
    if (file) {
      dispatch({ 
        type: 'ADD_TAB', 
        payload: { path: file.path, name: file.name, isDirty: false }
      })
    }
  }, [tagFiles, dispatch])

  useEffect(() => {
    handleTagClickRef.current = handleTagClick
  }, [handleTagClick])

  const wikiLinkTheme = EditorView.baseTheme({
    '.cm-wiki-link': {
      color: isDarkMode ? '#ff8c28' : '#ff7a00',
      cursor: 'pointer',
      textDecoration: 'underline',
      backgroundColor: isDarkMode ? 'rgba(255, 140, 40, 0.12)' : 'rgba(255, 122, 0, 0.1)',
      padding: '0 2px',
      borderRadius: '3px',
    },
    '.cm-wiki-link:hover': {
      color: isDarkMode ? '#ffa050' : '#e66a00',
      backgroundColor: isDarkMode ? 'rgba(255, 140, 40, 0.2)' : 'rgba(255, 122, 0, 0.18)',
    },
  })

  const tagTheme = EditorView.baseTheme({
    '.cm-tag': {
      color: isDarkMode ? '#00d4c4' : '#00b4a6',
      cursor: 'pointer',
      backgroundColor: isDarkMode ? 'rgba(0, 212, 196, 0.12)' : 'rgba(0, 180, 166, 0.1)',
      padding: '0 2px',
      borderRadius: '3px',
    },
    '.cm-tag:hover': {
      color: isDarkMode ? '#20e8d8' : '#009080',
      backgroundColor: isDarkMode ? 'rgba(0, 212, 196, 0.2)' : 'rgba(0, 180, 166, 0.18)',
    },
  })

  useEffect(() => {
    if (editorRef.current) {
      const welcomeContent = buildEditorWelcomeContent(t, state.workspacePath, agentWelcomeHint)

      const currentContent = viewRef.current?.state.doc.toString()
      const isWelcomePage = currentContent && isEditorWelcomeContent(currentContent)
      const savedContent = (currentContent && !isWelcomePage) ? currentContent : welcomeContent
      
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
      
      const wikiLinkPlugin = createWikiLinkPlugin((target) => handleLinkClickRef.current(target))
      const tagPlugin = createTagPlugin((name) => handleTagClickRef.current(name))
      const wikiLinkAutocomplete = createWikiLinkAutocomplete(() => noteStemsRef.current)
      viewRef.current = new EditorView({
        doc: savedContent,
        extensions: [
          basicSetup,
          drawSelection(),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(markdownHighlightStyle),
          wikiLinkAutocomplete,
          keymap.of([
            { key: 'Mod-s', run: () => { saveFile(); return true } },
            { key: 'Mod-b', run: () => { formatBold(); return true } },
            { key: 'Mod-i', run: () => { formatItalic(); return true } },
            { key: 'Mod-k', run: () => { formatWikiLink(); return true } },
          ] as KeyBinding[]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isLoadingFile.current) {
              setHasUnsavedChanges(true)
              dispatch({ 
                type: 'UPDATE_TAB_DIRTY', 
                payload: { path: currentFileRef.current, isDirty: true } 
              })
              triggerAutoSave()
              const content = update.state.doc.toString()
              setPreviewContent(content)
              parseContent(content)
            }
          }),
          hideMarksPlugin,
          jumpHighlightField,
          hideMarksTheme,
          wikiLinkPlugin,
          wikiLinkTheme,
          tagPlugin,
          tagTheme,
          EditorView.lineWrapping,
          EditorView.theme({
            '&': { height: '100%', width: '100%', backgroundColor: isDarkMode ? '#1e1e2e' : '#fafafa', fontSize: '16px' },
            '.cm-scroller': { 
              overflow: 'auto', 
              backgroundColor: isDarkMode ? '#1e1e2e' : '#fafafa',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              fontSize: '16px',
            },
            '.cm-content': { 
              padding: '32px 48px', 
              backgroundColor: isDarkMode ? '#1e1e2e' : '#fafafa', 
              color: isDarkMode ? '#e6e6e6' : '#1f2937',
              width: '100%',
              maxWidth: '800px',
              margin: '0 auto',
              boxSizing: 'border-box',
              fontSize: '16px',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            },
            '.cm-line': { 
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              color: isDarkMode ? '#e6e6e6' : '#1f2937',
              lineHeight: '1.75',
              padding: '1px 0',
              fontSize: '16px',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            },
            '.cm-header-1': { 
              fontSize: '2.1875em', 
              fontWeight: '700', 
              color: isDarkMode ? '#cdd6f4' : '#1a1a2e',
              marginTop: '24px',
              marginBottom: '12px',
              lineHeight: '1.3',
              borderBottom: `2px solid ${isDarkMode ? '#cdd6f4' : '#1a1a2e'}`,
              paddingBottom: '8px',
            },
            '.cm-header-2': { 
              fontSize: '1.75em', 
              fontWeight: '600', 
              color: isDarkMode ? '#bac2de' : '#16213e',
              marginTop: '20px',
              marginBottom: '10px',
              lineHeight: '1.35',
              borderBottom: `1px solid ${isDarkMode ? '#bac2de' : '#16213e'}`,
              paddingBottom: '6px',
            },
            '.cm-header-3': { 
              fontSize: '1.4375em', 
              fontWeight: '600', 
              color: isDarkMode ? '#a6adc8' : '#0f3460',
              marginTop: '16px',
              marginBottom: '8px',
              lineHeight: '1.4',
            },
            '.cm-header-4': { 
              fontSize: '1.1875em', 
              fontWeight: '600', 
              color: isDarkMode ? '#f38ba8' : '#be185d',
              marginTop: '14px',
              marginBottom: '6px',
              lineHeight: '1.45',
            },
            '.cm-header-5': { 
              fontSize: '1em', 
              fontWeight: '600', 
              color: isDarkMode ? '#cba6f7' : '#7c3aed',
              marginTop: '12px',
              marginBottom: '4px',
              lineHeight: '1.5',
            },
            '.cm-header-6': { 
              fontSize: '0.875em', 
              fontWeight: '600', 
              color: isDarkMode ? '#a6e3a1' : '#059669',
              marginTop: '10px',
              marginBottom: '4px',
              lineHeight: '1.5',
            },
            '.cm-strong': { 
              fontWeight: '700', 
              color: isDarkMode ? '#cdd6f4' : '#111827',
            },
            '.cm-emphasis': { 
              fontStyle: 'italic', 
              color: isDarkMode ? '#a6adc8' : '#4b5563',
            },
            '.cm-strikethrough': {
              textDecoration: 'line-through',
              color: isDarkMode ? '#6c7086' : '#9ca3af',
            },
            '.cm-highlight': {
              backgroundColor: isDarkMode ? '#45475a' : '#fef08a',
              padding: '0 2px',
              borderRadius: '2px',
            },
            '.cm-link, .cm-url': { 
              color: isDarkMode ? '#89b4fa' : '#2563eb', 
              textDecoration: 'underline',
            },
            '.cm-quote': { 
              color: isDarkMode ? '#a6adc8' : '#6b7280', 
              fontStyle: 'italic', 
              borderLeft: `4px solid ${isDarkMode ? '#45475a' : '#d1d5db'}`, 
              paddingLeft: '16px',
              marginLeft: '0',
              backgroundColor: isDarkMode ? '#181825' : '#f3f4f6',
              padding: '8px 16px',
              borderRadius: '0 8px 8px 0',
            },
            '.cm-list': { 
              color: isDarkMode ? '#f9e2af' : '#d97706',
              fontWeight: '500',
            },
            '.cm-hr': {
              borderTop: `2px solid ${isDarkMode ? '#45475a' : '#e5e7eb'}`,
              margin: '24px 0',
            },
            '.cm-cursor': { 
              borderLeftColor: isDarkMode ? '#89b4fa' : '#2563eb',
              borderLeftWidth: '2px',
            },
            '.cm-selectionBackground': { 
              backgroundColor: isDarkMode ? 'rgba(56, 189, 248, 0.35)' : 'rgba(37, 99, 235, 0.3)',
            },
            '.cm-focused .cm-selectionBackground': { 
              backgroundColor: isDarkMode ? 'rgba(56, 189, 248, 0.45)' : 'rgba(37, 99, 235, 0.4)',
            },
            '.cm-selectionLayer': {
              zIndex: 1,
            },
          }),
        ],
        parent: editorRef.current,
      })
      
      const initialContent = viewRef.current.state.doc.toString()
      setPreviewContent(initialContent)
      parseContent(initialContent)
      
      setEditorReady(true)
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [isDarkMode, t, i18n.language])

  /** Refresh welcome copy when workspace becomes available (avoid stale "open folder" steps). */
  useEffect(() => {
    if (!viewRef.current || !editorReady || filePath) return
    const current = viewRef.current.state.doc.toString()
    if (!isEditorWelcomeContent(current)) return
    const next = buildEditorWelcomeContent(t, state.workspacePath, agentWelcomeHint)
    if (next === current) return
    viewRef.current.dispatch({
      changes: { from: 0, to: current.length, insert: next },
    })
    setPreviewContent(next)
    parseContent(next)
  }, [state.workspacePath, agentWelcomeHint, editorReady, filePath, t, i18n.language, parseContent])

  useEffect(() => {
    if (filePath && editorReady) {
      loadFile(filePath)
    }
  }, [filePath, editorReady, loadFile])

  useEffect(() => {
    loadBacklinksAndTags()
  }, [loadBacklinksAndTags])

  useEffect(() => {
    return workspaceIndexService.onVaultChanged(() => {
      noteStemsRef.current = workspaceIndexService.getNoteStemsForAutocomplete()
      if (currentFileRef.current && viewRef.current) {
        const analysis = workspaceIndexService.analyzePotentialLinksForFile(
          currentFileRef.current,
          viewRef.current.state.doc.toString(),
        )
        setPotentialLinks(analysis.potential)
        setLinkDebt(analysis.debt)
      }
      void loadBacklinksAndTags()
    })
  }, [loadBacklinksAndTags])

  useEffect(() => {
    const nav = state.editorNavigation
    if (!nav || !filePath || nav.path !== filePath || !viewRef.current || !editorReady) return
    if (nav.token === lastNavTokenRef.current) return
    lastNavTokenRef.current = nav.token

    const view = viewRef.current
    const lineNumber = nav.line && nav.line > 0
      ? Math.min(nav.line, view.state.doc.lines)
      : 1
    const line = view.state.doc.line(lineNumber)

    view.dispatch({
      effects: [
        EditorView.scrollIntoView(line.from, { y: 'center' }),
        setJumpHighlight.of(lineNumber),
      ],
      selection: { anchor: line.from },
    })

    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current)
    jumpTimerRef.current = setTimeout(() => {
      viewRef.current?.dispatch({ effects: setJumpHighlight.of(null) })
    }, 2400)
  }, [state.editorNavigation, filePath, editorReady])

  useEffect(() => {
    if (!state.workspacePath) return
    return workspaceIndexService.subscribe(() => {
      loadBacklinksAndTags()
    })
  }, [state.workspacePath, loadBacklinksAndTags])

  const handleManualSave = async () => {
    await saveFile()
    message.success(t('saveSuccess'))
  }

  const formatSavedTime = (date: Date) =>
    date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })

  const fileName = currentFile ? currentFile.split(/[/\\]/).pop() : null

  const tagArray = Array.from(allTags.entries())

  const bgColor = isDarkMode ? '#1e1e2e' : '#fafafa'
  const surfaceColor = isDarkMode ? '#181825' : '#ffffff'
  const borderColor = isDarkMode ? '#313244' : '#e5e7eb'
  const textColor = isDarkMode ? '#e6e6e6' : '#1f2937'
  const secondaryColor = isDarkMode ? '#a6adc8' : '#6b7280'
  const accentColor = isDarkMode ? '#cba6f7' : '#7c3aed'
  const tagColor = isDarkMode ? '#f9e2af' : '#d97706'
  const successColor = isDarkMode ? '#a6e3a1' : '#059669'
  const dividerColor = isDarkMode ? '#45475a' : '#d1d5db'

  return (
    <div style={{ height: '100%', width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '4px 12px',
          background: surfaceColor,
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <Tooltip title={t('toolbar.heading')}>
          <Button size="small" type="text" icon={<FontSizeOutlined />} onClick={formatHeading} />
        </Tooltip>
        <Divider type="vertical" style={{ background: dividerColor, margin: '0 4px' }} />
        <Tooltip title={t('toolbar.bold')}>
          <Button size="small" type="text" icon={<BoldOutlined />} onClick={formatBold} />
        </Tooltip>
        <Tooltip title={t('toolbar.italic')}>
          <Button size="small" type="text" icon={<ItalicOutlined />} onClick={formatItalic} />
        </Tooltip>
        <Tooltip title={t('toolbar.strikethrough')}>
          <Button size="small" type="text" icon={<StrikethroughOutlined />} onClick={formatStrikethrough} />
        </Tooltip>
        <Tooltip title={t('toolbar.highlight')}>
          <Button size="small" type="text" icon={<HighlightOutlined />} onClick={formatHighlight} />
        </Tooltip>
        <Tooltip title={t('toolbar.code')}>
          <Button size="small" type="text" icon={<CodeOutlined />} onClick={formatCode} />
        </Tooltip>
        <Tooltip title={t('toolbar.link')}>
          <Button size="small" type="text" icon={<LinkOutlined />} onClick={formatLink} />
        </Tooltip>
        <Tooltip title={t('toolbar.wikiLink')}>
          <Button size="small" type="text" style={{ color: accentColor }} onClick={formatWikiLink}>
            [[ ]]
          </Button>
        </Tooltip>
        <Tooltip title={t('toolbar.tag')}>
          <Button size="small" type="text" style={{ color: tagColor }} onClick={formatTag}>
            #
          </Button>
        </Tooltip>
        <Divider type="vertical" style={{ background: dividerColor, margin: '0 4px' }} />
        <Tooltip title={t('toolbar.bulletList')}>
          <Button size="small" type="text" icon={<UnorderedListOutlined />} onClick={formatBulletList} />
        </Tooltip>
        <Tooltip title={t('toolbar.numberedList')}>
          <Button size="small" type="text" icon={<OrderedListOutlined />} onClick={formatNumberedList} />
        </Tooltip>
        <Tooltip title={t('toolbar.checkbox')}>
          <Button size="small" type="text" icon={<CheckSquareOutlined />} onClick={formatCheckbox} />
        </Tooltip>
        <Tooltip title={t('toolbar.quote')}>
          <Button size="small" type="text" icon={<MessageOutlined />} onClick={formatQuote} />
        </Tooltip>
        <Divider type="vertical" style={{ background: dividerColor, margin: '0 4px' }} />
        <Tooltip title={t('toolbar.table')}>
          <Button size="small" type="text" icon={<AppstoreOutlined />} onClick={formatTable} />
        </Tooltip>
        <Tooltip title={t('toolbar.horizontalRule')}>
          <Button size="small" type="text" icon={<MinusOutlined />} onClick={formatHorizontalRule} />
        </Tooltip>

        {fileName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8 }}>
            <Tooltip title={t('editMode')}>
              <Button
                size="small"
                type={editorViewMode === 'edit' ? 'primary' : 'text'}
                icon={<EditOutlined />}
                onClick={() => setEditorViewMode('edit')}
              />
            </Tooltip>
            <Tooltip title={t('preview')}>
              <Button
                size="small"
                type={editorViewMode === 'preview' ? 'primary' : 'text'}
                icon={<EyeOutlined />}
                onClick={() => setEditorViewMode('preview')}
              />
            </Tooltip>
            <Tooltip title={t('splitView')}>
              <Button
                size="small"
                type={editorViewMode === 'split' ? 'primary' : 'text'}
                icon={<ColumnWidthOutlined />}
                onClick={() => setEditorViewMode('split')}
              />
            </Tooltip>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {fileName && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: secondaryColor,
              marginRight: 4,
            }}
          >
            {isSaving ? (
              <span style={{ color: accentColor }}>{t('saving')}</span>
            ) : hasUnsavedChanges ? (
              <span style={{ color: tagColor }}>{t('unsaved')}</span>
            ) : lastSaved ? (
              <span style={{ color: successColor }}>
                {t('savedAt', { time: formatSavedTime(lastSaved) })}
              </span>
            ) : (
              <span style={{ color: successColor }}>{t('saved')}</span>
            )}
            {(!autoSaveEnabled || hasUnsavedChanges) && !isSaving && (
              <Button size="small" type="link" onClick={handleManualSave} style={{ padding: 0, height: 'auto' }}>
                {tCommon('actions.save')}
              </Button>
            )}
          </div>
        )}
      </div>
      
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minWidth: 0 }}>
        <div
          ref={editorRef}
          style={{
            flex: editorViewMode === 'split' ? 1 : 1,
            width: editorViewMode === 'split' ? '50%' : '100%',
            minWidth: 0,
            overflow: 'hidden',
            display: editorViewMode === 'preview' ? 'none' : 'block',
          }}
        />

        {(editorViewMode === 'preview' || editorViewMode === 'split') && (
          <div
            style={{
              flex: 1,
              width: editorViewMode === 'split' ? '50%' : '100%',
              overflow: 'auto',
              borderLeft: editorViewMode === 'split' ? `1px solid ${borderColor}` : undefined,
              background: bgColor,
              padding: '24px 32px',
            }}
          >
            <MarkdownPreview
              content={previewContent}
              onLinkClick={handleLinkClick}
              onTagClick={handleTagClick}
              resolveNoteEmbed={resolveNoteEmbed}
            />
          </div>
        )}
        
        <Tooltip title={showRightPanel ? t('hidePanel') : t('linksTags')} placement="left">
          <Button
            type="primary"
            icon={<LinkIcon />}
            size="small"
            onClick={() => setShowRightPanel(!showRightPanel)}
            style={{
              position: 'absolute',
              right: showRightPanel ? 316 : 16,
              top: 16,
              zIndex: 100,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          />
        </Tooltip>
        
        {showRightPanel && (
          <div
            style={{
              width: 300,
              borderLeft: `1px solid ${borderColor}`,
              background: surfaceColor,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Tabs
              activeKey={activeSidebarTab}
              onChange={(key) => setActiveSidebarTab(key as 'links' | 'tags' | 'properties')}
              size="small"
              style={{ padding: '0 8px' }}
              items={[
                {
                  key: 'properties',
                  label: t('properties.title'),
                  children: (
                    <FrontmatterPanel
                      content={previewContent}
                      onChange={applyEditorContent}
                      isDark={isDarkMode}
                      borderColor={borderColor}
                      secondaryColor={secondaryColor}
                    />
                  ),
                },
                {
                  key: 'links',
                  label: t('links.title'),
                  children: (
                    <div style={{ padding: '8px', overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ color: secondaryColor, fontSize: 12, marginBottom: 8 }}>
                          {t('links.linkDebt')}
                          {linkDebt ? ` (${linkDebt.score})` : ''}
                        </div>
                        {linkDebt && linkDebt.score > 0 ? (
                          <div style={{ fontSize: 11, color: secondaryColor, marginBottom: 8, lineHeight: 1.5 }}>
                            {t('links.linkDebtDetail', {
                              unlinked: linkDebt.unlinkedMentions,
                              semantic: linkDebt.semanticNeighborsWithoutLink,
                              orphan: linkDebt.isOrphan ? t('links.orphanYes') : t('links.orphanNo'),
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: secondaryColor }}>{t('links.linkDebtClear')}</div>
                        )}
                      </div>

                      <div style={{ marginBottom: 16 }}>
                        <div style={{ color: secondaryColor, fontSize: 12, marginBottom: 8 }}>
                          {t('links.potentialLinks')} ({potentialLinks.length})
                        </div>
                        {potentialLinks.length > 0 ? (
                          <List
                            size="small"
                            dataSource={potentialLinks}
                            renderItem={(item) => (
                              <List.Item
                                style={{ padding: '6px 0', border: 'none', flexDirection: 'column', alignItems: 'flex-start' }}
                                actions={[
                                  <Button key="insert" type="link" size="small" onClick={() => insertWikiLink(item.targetStem)}>
                                    {t('links.insertLink')}
                                  </Button>,
                                ]}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Tag color={item.reason === 'unlinked_mention' ? 'orange' : 'purple'} style={{ margin: 0 }}>
                                    {item.reason === 'unlinked_mention' ? t('links.unlinkedMention') : t('links.semanticNeighbor')}
                                  </Tag>
                                  <span
                                    style={{ color: accentColor, cursor: 'pointer' }}
                                    onClick={() => dispatch({ type: 'ADD_TAB', payload: { path: item.targetPath, name: item.targetName, isDirty: false } })}
                                  >
                                    [[{item.targetStem}]]
                                  </span>
                                </div>
                                {item.context && (
                                  <div style={{ color: secondaryColor, fontSize: 11, marginTop: 4 }}>{item.context}</div>
                                )}
                              </List.Item>
                            )}
                          />
                        ) : (
                          <Empty description={t('links.noPotentialLinks')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                      </div>

                      <div style={{ marginBottom: 16 }}>
                        <div style={{ color: secondaryColor, fontSize: 12, marginBottom: 8 }}>{t('links.currentFileLinks')} ({currentLinks.length})</div>
                        {currentLinks.length > 0 ? (
                          <List
                            size="small"
                            dataSource={currentLinks}
                            renderItem={(link) => (
                              <List.Item style={{ padding: '4px 0', border: 'none' }}>
                                <a
                                  onClick={() => handleLinkClick(link.target)}
                                  style={{ color: accentColor, cursor: 'pointer' }}
                                >
                                  [[{link.text}]]
                                </a>
                              </List.Item>
                            )}
                          />
                        ) : (
                          <Empty description={t('links.noLinks')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                      </div>
                      
                      <div>
                        <div style={{ color: secondaryColor, fontSize: 12, marginBottom: 8 }}>{t('links.backlinks')} ({backlinks.length})</div>
                        {backlinks.length > 0 ? (
                          <List
                            size="small"
                            dataSource={backlinks}
                            renderItem={(item) => (
                              <List.Item style={{ padding: '4px 0', border: 'none', flexDirection: 'column', alignItems: 'flex-start' }}>
                                <div style={{ color: accentColor, marginBottom: 4 }}>{item.fileName}</div>
                                <div style={{ color: secondaryColor, fontSize: 11, background: isDarkMode ? '#11111b' : '#ffffff', padding: 4, borderRadius: 4, border: `1px solid ${borderColor}` }}>
                                  {item.context.slice(0, 100)}...
                                </div>
                              </List.Item>
                            )}
                          />
                        ) : (
                          <Empty description={t('links.noBacklinks')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'tags',
                  label: t('tag.title'),
                  children: (
                    <div style={{ padding: '8px', overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ color: secondaryColor, fontSize: 12, marginBottom: 8 }}>{t('tags.currentFileTags')} ({currentTags.length})</div>
                        {currentTags.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {currentTags.map((tag, index) => (
                              <Tag
                                key={index}
                                color="orange"
                                style={{ cursor: 'pointer' }}
                                onClick={() => handleTagClick(tag.name)}
                              >
                                #{tag.name}
                              </Tag>
                            ))}
                          </div>
                        ) : (
                          <Empty description={t('tags.noTags')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                      </div>
                      
                      <div>
                        <div style={{ color: secondaryColor, fontSize: 12, marginBottom: 8 }}>{t('tags.allTags')} ({tagArray.length})</div>
                        {tagArray.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {tagArray.map(([name, files]) => (
                              <Tooltip key={name} title={`${files.length} ${t('tags.files')}`}>
                                <Tag
                                  color="blue"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => handleTagClick(name)}
                                >
                                  #{name} ({files.length})
                                </Tag>
                              </Tooltip>
                            ))}
                          </div>
                        ) : (
                          <Empty description={t('tags.noTags')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>
      
      <Modal
        title={t('wikiLink.selectOrCreate')}
        open={showFilePicker}
        onCancel={() => setShowFilePicker(false)}
        footer={null}
        width={500}
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder={t('wikiLink.inputPlaceholder')}
            value={filePickerSearch}
            onChange={(e) => setFilePickerSearch(e.target.value)}
            autoFocus
          />
        </div>
        
        {filePickerSearch && (
          <div style={{ marginBottom: 16 }}>
            <Button type="primary" onClick={handleFilePickerCreate}>
              {t('wikiLink.createButton', {
                name: filePickerSearch.trim() || t('wikiLink.defaultNoteName'),
              })}
            </Button>
          </div>
        )}
        
        <div style={{ maxHeight: 300, overflow: 'auto' }}>
          <div style={{ color: secondaryColor, fontSize: 12, marginBottom: 8 }}>{t('wikiLink.existingFiles')}</div>
          <List
            size="small"
            dataSource={filePickerFiles.filter(f => 
              f.name.toLowerCase().includes(filePickerSearch.toLowerCase())
            )}
            renderItem={(item) => (
              <List.Item 
                style={{ cursor: 'pointer', padding: '8px 12px' }}
                onClick={() => handleFilePickerSelect(item.name)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDarkMode ? '#313244' : '#f3f4f6'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ color: accentColor }}>[[{item.name.replace(/\.md$/, '')}]]</span>
                <span style={{ color: secondaryColor, fontSize: 12, marginLeft: 8 }}>{item.name}</span>
              </List.Item>
            )}
            locale={{ emptyText: t('wikiLink.noMatch') }}
          />
        </div>
      </Modal>

      <Modal
        title={t('tag.filesTitle', { name: selectedTagName })}
        open={showTagFiles}
        onCancel={() => setShowTagFiles(false)}
        footer={null}
        width={500}
      >
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          <div style={{ color: secondaryColor, fontSize: 12, marginBottom: 8 }}>
            {t('tag.filesCount', { name: selectedTagName, count: tagFiles.length })}
          </div>
          <List
            size="small"
            dataSource={tagFiles}
            renderItem={(item) => (
              <List.Item 
                style={{ cursor: 'pointer', padding: '8px 12px' }}
                onClick={() => handleTagFileSelect(item.name)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDarkMode ? '#313244' : '#f3f4f6'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ color: tagColor }}>#{selectedTagName}</span>
                <span style={{ color: textColor, marginLeft: 12 }}>{item.name.replace(/\.md$/, '')}</span>
              </List.Item>
            )}
            locale={{ emptyText: t('tag.noFilesEmpty') }}
          />
        </div>
      </Modal>
    </div>
  )
}

export default Editor
