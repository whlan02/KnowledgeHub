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
  ensureReadPermission,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from '@/lib/idb-handles'

type NotesContextValue = {
  notes: Note[]
  folderLabel: string
  source: 'bundled' | 'folder'
  pickerSupported: boolean
  openFolder: () => Promise<void>
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

  const applyScanned = useCallback(
    async (dirHandle: FileSystemDirectoryHandle) => {
      const scanned = await scanDirectoryHandle(dirHandle)
      for (const url of blobCache.values()) URL.revokeObjectURL(url)
      blobCache.clear()
      setNotes(scanned.notes)
      setFileHandles(scanned.fileHandles)
      setFolderLabel(scanned.folderName)
      setSource('folder')
      await saveDirectoryHandle(dirHandle)
    },
    [blobCache],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isDirectoryPickerSupported()) return
      try {
        const handle = await loadDirectoryHandle()
        if (!handle || cancelled) return
        const ok = await ensureReadPermission(handle)
        if (!ok || cancelled) return
        await applyScanned(handle)
      } catch {
        // Ignore failures when restoring a previously granted folder handle.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyScanned])

  const openFolder = useCallback(async () => {
    if (!isDirectoryPickerSupported()) {
      throw new Error('Directory picker is not supported in this browser')
    }
    const handle = await window.showDirectoryPicker({ mode: 'read' })
    await applyScanned(handle)
  }, [applyScanned])

  const resetToBundled = useCallback(async () => {
    for (const url of blobCache.values()) URL.revokeObjectURL(url)
    blobCache.clear()
    setNotes(cloneBundledNotes())
    setFileHandles(new Map())
    setFolderLabel(bundledRoot)
    setSource('bundled')
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
      pickerSupported: isDirectoryPickerSupported(),
      openFolder,
      resetToBundled,
      resolveAssetUrl,
      notesPaths,
    }),
    [notes, folderLabel, source, openFolder, resetToBundled, resolveAssetUrl, notesPaths],
  )

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

export function useNotes() {
  const ctx = useContext(NotesContext)
  if (!ctx) throw new Error('useNotes must be used within NotesProvider')
  return ctx
}
