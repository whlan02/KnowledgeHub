import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import bundledNotes, { notesRoot as bundledRoot } from 'virtual:notes'
import type { Note } from '@/lib/fs-notes'
import {
  fingerprintDirectoryHandle,
  isDirectoryPickerSupported,
  readFileHandleText,
  scanDirectoryHandle,
  titleFromContent,
  writeFileHandleText,
} from '@/lib/fs-notes'
import {
  clearDirectoryHandle,
  clearRecentFolders,
  ensureDirectoryPermission,
  ensureReadPermission,
  getRecentFolderHandle,
  listRecentFolders,
  loadDirectoryHandle,
  queryDirectoryPermission,
  removeRecentFolder,
  saveDirectoryHandle,
  type RecentFolderEntry,
} from '@/lib/idb-handles'

type NotesContextValue = {
  notes: Note[]
  folderLabel: string
  source: 'bundled' | 'folder'
  /** False until the initial folder restore attempt finishes (avoids wrong home redirect). */
  ready: boolean
  pickerSupported: boolean
  recentFolders: RecentFolderEntry[]
  activeFolderId: string | null
  openFolder: () => Promise<void>
  openRecentFolder: (id: string) => Promise<void>
  removeRecentFolderEntry: (id: string) => Promise<void>
  clearRecentFolderHistory: () => Promise<void>
  resetToBundled: () => Promise<void>
  /** Load markdown body for a note path (cached after first read). */
  loadNoteContent: (notePath: string) => Promise<string | null>
  /** True when this note is a file in the opened folder (sample notes are not). */
  noteCanSave: (notePath: string) => boolean
  /** Current folder already has readwrite permission. */
  folderWritable: boolean
  /** Ask for readwrite on the open folder. Call from a click or focus. */
  requestFolderWriteAccess: () => Promise<boolean>
  /** Write markdown back to disk and refresh the change-detection baseline. */
  saveNoteContent: (notePath: string, text: string) => Promise<void>
  /** Skip folder polling until released. Use while a note has unsaved edits. */
  holdFolderSync: () => () => void
  /** Bumps when an opened folder is rescanned from disk. */
  folderRevision: number
  resolveAssetUrl: (fromNotePath: string, src: string) => Promise<string | null>
  notesPaths: Set<string>
}

const NotesContext = createContext<NotesContextValue | null>(null)

/** How often to check an opened local folder for file changes. */
const FOLDER_POLL_MS = 1500

function cloneBundledNotes(): Note[] {
  return bundledNotes.map((n) => ({ ...n }))
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>(() => cloneBundledNotes())
  const [folderLabel, setFolderLabel] = useState(bundledRoot)
  const [source, setSource] = useState<'bundled' | 'folder'>('bundled')
  const [fileHandles, setFileHandles] = useState<Map<string, FileSystemFileHandle>>(new Map())
  const [blobCache] = useState(() => new Map<string, string>())
  const [recentFolders, setRecentFolders] = useState<RecentFolderEntry[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [folderWritable, setFolderWritable] = useState(false)
  const [folderRevision, setFolderRevision] = useState(0)
  const [ready, setReady] = useState(false)
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null)
  const syncHoldRef = useRef(0)
  const folderFingerprintRef = useRef('')
  const sourceRef = useRef(source)
  const notesRef = useRef(notes)
  const fileHandlesRef = useRef(fileHandles)
  const contentCacheRef = useRef(new Map<string, string>())
  sourceRef.current = source
  notesRef.current = notes
  fileHandlesRef.current = fileHandles

  const clearContentCache = useCallback(() => {
    contentCacheRef.current.clear()
  }, [])

  const refreshRecentFolders = useCallback(async () => {
    if (!isDirectoryPickerSupported()) return
    try {
      const list = await listRecentFolders()
      setRecentFolders(list)
    } catch {
      setRecentFolders([])
    }
  }, [])

  const applyScanned = useCallback(
    async (dirHandle: FileSystemDirectoryHandle) => {
      const scanned = await scanDirectoryHandle(dirHandle)
      for (const url of blobCache.values()) URL.revokeObjectURL(url)
      blobCache.clear()
      clearContentCache()
      setNotes(scanned.notes)
      setFileHandles(scanned.fileHandles)
      setFolderLabel(scanned.folderName)
      setSource('folder')
      dirHandleRef.current = scanned.dirHandle
      folderFingerprintRef.current = await fingerprintDirectoryHandle(scanned.dirHandle)
      setFolderRevision((revision) => revision + 1)
      const id = await saveDirectoryHandle(dirHandle)
      setActiveFolderId(id)
      await refreshRecentFolders()
    },
    [blobCache, clearContentCache, refreshRecentFolders],
  )

  const resyncOpenFolder = useCallback(async () => {
    if (syncHoldRef.current > 0) return
    const handle = dirHandleRef.current
    if (!handle || sourceRef.current !== 'folder') return
    try {
      const nextFp = await fingerprintDirectoryHandle(handle)
      if (nextFp === folderFingerprintRef.current) return
      folderFingerprintRef.current = nextFp
      const scanned = await scanDirectoryHandle(handle)
      for (const url of blobCache.values()) URL.revokeObjectURL(url)
      blobCache.clear()
      clearContentCache()
      setNotes(scanned.notes)
      setFileHandles(scanned.fileHandles)
      setFolderLabel(scanned.folderName)
      dirHandleRef.current = scanned.dirHandle
      setFolderRevision((revision) => revision + 1)
    } catch {
      // Ignore transient read errors while files are being saved.
    }
  }, [blobCache, clearContentCache])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!isDirectoryPickerSupported()) return
        await refreshRecentFolders()
        const handle = await loadDirectoryHandle()
        if (!handle || cancelled) return
        const writeOk = await queryDirectoryPermission(handle, 'readwrite')
        if (cancelled) return
        if (!writeOk) {
          const ok = await ensureReadPermission(handle)
          if (!ok || cancelled) return
        }
        if (cancelled) return
        setFolderWritable(writeOk)
        await applyScanned(handle)
      } catch {
        // Ignore failures when restoring a previously granted folder handle.
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyScanned, refreshRecentFolders])

  useEffect(() => {
    if (source !== 'folder' || !dirHandleRef.current) return

    const tick = () => {
      if (document.visibilityState === 'hidden') return
      void resyncOpenFolder()
    }

    const id = window.setInterval(tick, FOLDER_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void resyncOpenFolder()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [source, activeFolderId, resyncOpenFolder])

  useEffect(() => {
    if (!import.meta.hot) return

    const onBundledNotesUpdate = async () => {
      if (sourceRef.current !== 'bundled') return
      const mod = await import('virtual:notes')
      clearContentCache()
      setNotes(mod.default.map((n) => ({ ...n })))
      setFolderLabel(mod.notesRoot)
      setFolderRevision((revision) => revision + 1)
    }

    import.meta.hot.on('knowledgehub:notes-update', onBundledNotesUpdate)
    return () => {
      import.meta.hot?.off('knowledgehub:notes-update', onBundledNotesUpdate)
    }
  }, [clearContentCache])

  const openFolder = useCallback(async () => {
    if (!isDirectoryPickerSupported()) {
      throw new Error('Directory picker is not supported in this browser')
    }
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    setFolderWritable(true)
    await applyScanned(handle)
  }, [applyScanned])

  const openRecentFolder = useCallback(
    async (id: string) => {
      const handle = await getRecentFolderHandle(id)
      if (!handle) {
        await removeRecentFolder(id)
        await refreshRecentFolders()
        throw new Error('RECENT_FOLDER_MISSING')
      }
      const writeOk = await ensureDirectoryPermission(handle, 'readwrite')
      if (!writeOk) {
        const readOk = await ensureReadPermission(handle)
        if (!readOk) throw new Error('RECENT_FOLDER_DENIED')
      }
      setFolderWritable(writeOk)
      await applyScanned(handle)
    },
    [applyScanned, refreshRecentFolders],
  )

  const removeRecentFolderEntry = useCallback(
    async (id: string) => {
      await removeRecentFolder(id)
      if (activeFolderId === id) {
        for (const url of blobCache.values()) URL.revokeObjectURL(url)
        blobCache.clear()
        clearContentCache()
        setNotes(cloneBundledNotes())
        setFileHandles(new Map())
        setFolderLabel(bundledRoot)
        setSource('bundled')
        setActiveFolderId(null)
        setFolderWritable(false)
        dirHandleRef.current = null
        folderFingerprintRef.current = ''
      }
      await refreshRecentFolders()
    },
    [activeFolderId, blobCache, clearContentCache, refreshRecentFolders],
  )

  const clearRecentFolderHistory = useCallback(async () => {
    await clearRecentFolders()
    if (source === 'folder') {
      for (const url of blobCache.values()) URL.revokeObjectURL(url)
      blobCache.clear()
      clearContentCache()
      setNotes(cloneBundledNotes())
      setFileHandles(new Map())
      setFolderLabel(bundledRoot)
      setSource('bundled')
      setFolderWritable(false)
      dirHandleRef.current = null
      folderFingerprintRef.current = ''
    }
    setActiveFolderId(null)
    await refreshRecentFolders()
  }, [blobCache, clearContentCache, refreshRecentFolders, source])

  const resetToBundled = useCallback(async () => {
    for (const url of blobCache.values()) URL.revokeObjectURL(url)
    blobCache.clear()
    clearContentCache()
    setNotes(cloneBundledNotes())
    setFileHandles(new Map())
    setFolderLabel(bundledRoot)
    setSource('bundled')
    setActiveFolderId(null)
    setFolderWritable(false)
    dirHandleRef.current = null
    folderFingerprintRef.current = ''
    await clearDirectoryHandle()
  }, [blobCache, clearContentCache])

  const loadNoteContent = useCallback(async (notePath: string): Promise<string | null> => {
    const cached = contentCacheRef.current.get(notePath)
    if (cached !== undefined) return cached

    const note = notesRef.current.find((n) => n.path === notePath)
    if (note?.content !== undefined) {
      contentCacheRef.current.set(notePath, note.content)
      return note.content
    }

    const handle = fileHandlesRef.current.get(notePath)
    if (!handle) return null

    const text = await readFileHandleText(handle)
    contentCacheRef.current.set(notePath, text)
    return text
  }, [])

  const noteCanSave = useCallback((notePath: string) => {
    return sourceRef.current === 'folder' && fileHandlesRef.current.has(notePath)
  }, [])

  const requestFolderWriteAccess = useCallback(async () => {
    const dir = dirHandleRef.current
    if (!dir || sourceRef.current !== 'folder') return false
    const ok = await ensureDirectoryPermission(dir, 'readwrite')
    setFolderWritable(ok)
    return ok
  }, [])

  const holdFolderSync = useCallback(() => {
    syncHoldRef.current += 1
    let released = false
    return () => {
      if (released) return
      released = true
      syncHoldRef.current = Math.max(0, syncHoldRef.current - 1)
    }
  }, [])

  const saveNoteContent = useCallback(async (notePath: string, text: string) => {
    syncHoldRef.current += 1
    try {
      const handle = fileHandlesRef.current.get(notePath)
      const dir = dirHandleRef.current
      if (!handle || !dir || sourceRef.current !== 'folder') {
        throw new Error('NOTE_READONLY')
      }
      const permitted = await queryDirectoryPermission(dir, 'readwrite')
      if (!permitted) throw new Error('WRITE_DENIED')

      await writeFileHandleText(handle, text)
      contentCacheRef.current.set(notePath, text)
      const base = notePath.split('/').pop()?.replace(/\.md$/i, '') ?? notePath
      const title = titleFromContent(text, base)
      setNotes((prev) => prev.map((n) => (n.path === notePath ? { ...n, title } : n)))
      folderFingerprintRef.current = await fingerprintDirectoryHandle(dir)
    } finally {
      syncHoldRef.current -= 1
    }
  }, [])

  const resolveAssetUrl = useCallback(
    async (fromNotePath: string, src: string) => {
      if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')) {
        return src
      }

      const fromDir = fromNotePath.includes('/')
        ? fromNotePath.slice(0, fromNotePath.lastIndexOf('/'))
        : ''
      const joined = src.startsWith('/')
        ? src.slice(1)
        : [fromDir, src].filter(Boolean).join('/')
      const parts: string[] = []
      for (const part of joined.split('/')) {
        if (!part || part === '.') continue
        if (part === '..') {
          parts.pop()
          continue
        }
        try {
          parts.push(decodeURIComponent(part))
        } catch {
          parts.push(part)
        }
      }
      const rel = parts.join('/')

      if (source === 'bundled') {
        return `/@notes/${parts.map(encodeURIComponent).join('/')}`
      }

      if (blobCache.has(rel)) return blobCache.get(rel)!
      const handle = fileHandles.get(rel)
      if (!handle) return null
      const file = await handle.getFile()
      const url = URL.createObjectURL(file)
      blobCache.set(rel, url)
      return url
    },
    [blobCache, fileHandles, source],
  )

  const notesPaths = useMemo(() => new Set(notes.map((n) => n.path)), [notes])

  const value = useMemo<NotesContextValue>(
    () => ({
      notes,
      folderLabel,
      source,
      ready,
      pickerSupported: isDirectoryPickerSupported(),
      recentFolders,
      activeFolderId,
      openFolder,
      openRecentFolder,
      removeRecentFolderEntry,
      clearRecentFolderHistory,
      resetToBundled,
      loadNoteContent,
      noteCanSave,
      folderWritable,
      requestFolderWriteAccess,
      saveNoteContent,
      holdFolderSync,
      folderRevision,
      resolveAssetUrl,
      notesPaths,
    }),
    [
      notes,
      folderLabel,
      source,
      ready,
      openFolder,
      openRecentFolder,
      removeRecentFolderEntry,
      clearRecentFolderHistory,
      resetToBundled,
      loadNoteContent,
      noteCanSave,
      folderWritable,
      requestFolderWriteAccess,
      saveNoteContent,
      holdFolderSync,
      folderRevision,
      resolveAssetUrl,
      notesPaths,
      recentFolders,
      activeFolderId,
    ],
  )

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

export function useNotes() {
  const ctx = useContext(NotesContext)
  if (!ctx) throw new Error('useNotes must be used within NotesProvider')
  return ctx
}
