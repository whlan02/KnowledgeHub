import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import bundledNotes, { notesRoot as bundledRoot } from 'virtual:notes'
import type { Note } from '@/lib/fs-notes'
import { isDirectoryPickerSupported, scanDirectoryHandle } from '@/lib/fs-notes'
import {
  clearDirectoryHandle,
  clearRecentFolders,
  ensureReadPermission,
  getRecentFolderHandle,
  listRecentFolders,
  loadDirectoryHandle,
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
  resolveAssetUrl: (fromNotePath: string, src: string) => Promise<string | null>
  notesPaths: Set<string>
}

const NotesContext = createContext<NotesContextValue | null>(null)

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
  const [ready, setReady] = useState(false)

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
      setNotes(scanned.notes)
      setFileHandles(scanned.fileHandles)
      setFolderLabel(scanned.folderName)
      setSource('folder')
      const id = await saveDirectoryHandle(dirHandle)
      setActiveFolderId(id)
      await refreshRecentFolders()
    },
    [blobCache, refreshRecentFolders],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!isDirectoryPickerSupported()) return
        await refreshRecentFolders()
        const handle = await loadDirectoryHandle()
        if (!handle || cancelled) return
        const ok = await ensureReadPermission(handle)
        if (!ok || cancelled) return
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

  const openFolder = useCallback(async () => {
    if (!isDirectoryPickerSupported()) {
      throw new Error('Directory picker is not supported in this browser')
    }
    const handle = await window.showDirectoryPicker({ mode: 'read' })
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
      const ok = await ensureReadPermission(handle)
      if (!ok) throw new Error('RECENT_FOLDER_DENIED')
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
        setNotes(cloneBundledNotes())
        setFileHandles(new Map())
        setFolderLabel(bundledRoot)
        setSource('bundled')
        setActiveFolderId(null)
      }
      await refreshRecentFolders()
    },
    [activeFolderId, blobCache, refreshRecentFolders],
  )

  const clearRecentFolderHistory = useCallback(async () => {
    await clearRecentFolders()
    if (source === 'folder') {
      for (const url of blobCache.values()) URL.revokeObjectURL(url)
      blobCache.clear()
      setNotes(cloneBundledNotes())
      setFileHandles(new Map())
      setFolderLabel(bundledRoot)
      setSource('bundled')
    }
    setActiveFolderId(null)
    await refreshRecentFolders()
  }, [blobCache, refreshRecentFolders, source])

  const resetToBundled = useCallback(async () => {
    for (const url of blobCache.values()) URL.revokeObjectURL(url)
    blobCache.clear()
    setNotes(cloneBundledNotes())
    setFileHandles(new Map())
    setFolderLabel(bundledRoot)
    setSource('bundled')
    setActiveFolderId(null)
    await clearDirectoryHandle()
  }, [blobCache])

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
      resolveAssetUrl,
      notesPaths,
    }),
    [notes, folderLabel, source, ready, openFolder, openRecentFolder, removeRecentFolderEntry, clearRecentFolderHistory, resetToBundled, resolveAssetUrl, notesPaths, recentFolders, activeFolderId],
  )

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

export function useNotes() {
  const ctx = useContext(NotesContext)
  if (!ctx) throw new Error('useNotes must be used within NotesProvider')
  return ctx
}
