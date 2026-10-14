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
import type { Note } from '@/lib/fs-notes'
import {
  defaultWorkspace,
  onWorkspaceChanged,
  openWorkspace,
  pickFolder,
  readNote,
  scanWorkspace,
  workspaceFileUrl,
  writeNote,
  type WorkspaceInfo,
} from '@/lib/backend'
import {
  clearRecentFolders,
  loadActiveWorkspace,
  loadRecentFolders,
  removeRecentFolder,
  saveActiveWorkspace,
  touchRecentFolder,
  type RecentFolderEntry,
} from '@/lib/recent-folders'
import { resolveAssetPath } from '@/lib/utils'

type ChangeListener = (paths: string[]) => void

type NotesContextValue = {
  notes: Note[]
  folderLabel: string
  /** Absolute path of the open workspace; also used as its id. */
  activeFolderId: string | null
  /** True while the open workspace is the built-in `Documents/KnowledgeHub` one. */
  isDefaultWorkspace: boolean
  /** False until the initial workspace is open (avoids wrong home redirect). */
  ready: boolean
  recentFolders: RecentFolderEntry[]
  openFolder: () => Promise<void>
  openRecentFolder: (id: string) => Promise<void>
  removeRecentFolderEntry: (id: string) => Promise<void>
  clearRecentFolderHistory: () => Promise<void>
  openDefaultWorkspace: () => Promise<void>
  /** Markdown body of a note (cached after first read). */
  loadNoteContent: (notePath: string) => Promise<string | null>
  /** Write markdown back to disk. */
  saveNoteContent: (notePath: string, text: string) => Promise<void>
  /** Read straight from disk, bypassing the cache. */
  readNoteFromDisk: (notePath: string) => Promise<string | null>
  /** Called with the changed note paths whenever files change under the workspace. */
  subscribeChanges: (listener: ChangeListener) => () => void
  resolveAssetUrl: (fromNotePath: string, src: string) => string
  notesPaths: Set<string>
}

const NotesContext = createContext<NotesContextValue | null>(null)

/** Wait this long after the last file event before rescanning, so a burst becomes one scan. */
const CHANGE_DEBOUNCE_MS = 200

function sameNotes(a: Note[], b: Note[]) {
  return (
    a.length === b.length &&
    a.every((n, i) => n.path === b[i].path && n.title === b[i].title)
  )
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [folderLabel, setFolderLabel] = useState('')
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [defaultRoot, setDefaultRoot] = useState<string | null>(null)
  const [recentFolders, setRecentFolders] = useState<RecentFolderEntry[]>(() => loadRecentFolders())
  const [ready, setReady] = useState(false)
  const contentCacheRef = useRef(new Map<string, string>())
  const listenersRef = useRef(new Set<ChangeListener>())

  const applyWorkspace = useCallback((info: WorkspaceInfo) => {
    contentCacheRef.current.clear()
    setNotes(info.notes)
    setFolderLabel(info.name)
    setActiveFolderId(info.root)
    saveActiveWorkspace(info.root)
    setRecentFolders(touchRecentFolder(info.root, info.name))
  }, [])

  const openDefaultWorkspace = useCallback(async () => {
    const root = await defaultWorkspace()
    setDefaultRoot(root)
    applyWorkspace(await openWorkspace(root))
  }, [applyWorkspace])

  // Restore the last workspace, falling back to the default one.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const root = await defaultWorkspace()
        if (cancelled) return
        setDefaultRoot(root)
        const saved = loadActiveWorkspace()
        let info: WorkspaceInfo | null = null
        if (saved) {
          try {
            info = await openWorkspace(saved)
          } catch {
            saveActiveWorkspace(null)
          }
        }
        info ??= await openWorkspace(root)
        if (!cancelled) applyWorkspace(info)
      } catch (err) {
        console.error(err)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyWorkspace])

  // Follow changes on disk: rescan the file list and tell open notes which paths changed.
  useEffect(() => {
    let timer: number | undefined
    let disposed = false
    let unlisten: (() => void) | undefined
    const pending = new Set<string>()

    const flush = async () => {
      timer = undefined
      const paths = [...pending]
      pending.clear()
      for (const path of paths) contentCacheRef.current.delete(path)
      try {
        const next = await scanWorkspace()
        if (disposed) return
        setNotes((prev) => (sameNotes(prev, next) ? prev : next))
      } catch {
        // The workspace may be mid-switch; the next event will retry.
      }
      for (const listener of listenersRef.current) listener(paths)
    }

    void onWorkspaceChanged((paths) => {
      for (const path of paths) pending.add(path)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void flush(), CHANGE_DEBOUNCE_MS)
    }).then((fn) => {
      if (disposed) fn()
      else unlisten = fn
    })

    return () => {
      disposed = true
      window.clearTimeout(timer)
      unlisten?.()
    }
  }, [])

  const openFolder = useCallback(async () => {
    const picked = await pickFolder()
    if (!picked) return
    applyWorkspace(await openWorkspace(picked))
  }, [applyWorkspace])

  const openRecentFolder = useCallback(
    async (id: string) => {
      try {
        applyWorkspace(await openWorkspace(id))
      } catch {
        setRecentFolders(removeRecentFolder(id))
        throw new Error('RECENT_FOLDER_MISSING')
      }
    },
    [applyWorkspace],
  )

  const removeRecentFolderEntry = useCallback(async (id: string) => {
    setRecentFolders(removeRecentFolder(id))
  }, [])

  const clearRecentFolderHistory = useCallback(async () => {
    setRecentFolders(clearRecentFolders())
  }, [])

  const readNoteFromDisk = useCallback(async (notePath: string): Promise<string | null> => {
    try {
      const text = await readNote(notePath)
      contentCacheRef.current.set(notePath, text)
      return text
    } catch {
      return null
    }
  }, [])

  const loadNoteContent = useCallback(
    async (notePath: string): Promise<string | null> => {
      const cached = contentCacheRef.current.get(notePath)
      if (cached !== undefined) return cached
      return readNoteFromDisk(notePath)
    },
    [readNoteFromDisk],
  )

  const saveNoteContent = useCallback(async (notePath: string, text: string) => {
    await writeNote(notePath, text)
    contentCacheRef.current.set(notePath, text)
  }, [])

  const subscribeChanges = useCallback((listener: ChangeListener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const resolveAssetUrl = useCallback((fromNotePath: string, src: string) => {
    const rel = resolveAssetPath(fromNotePath, src)
    return rel ? workspaceFileUrl(rel) : src
  }, [])

  const notesPaths = useMemo(() => new Set(notes.map((n) => n.path)), [notes])

  const value = useMemo<NotesContextValue>(
    () => ({
      notes,
      folderLabel,
      activeFolderId,
      isDefaultWorkspace: activeFolderId !== null && activeFolderId === defaultRoot,
      ready,
      recentFolders,
      openFolder,
      openRecentFolder,
      removeRecentFolderEntry,
      clearRecentFolderHistory,
      openDefaultWorkspace,
      loadNoteContent,
      saveNoteContent,
      readNoteFromDisk,
      subscribeChanges,
      resolveAssetUrl,
      notesPaths,
    }),
    [
      notes,
      folderLabel,
      activeFolderId,
      defaultRoot,
      ready,
      recentFolders,
      openFolder,
      openRecentFolder,
      removeRecentFolderEntry,
      clearRecentFolderHistory,
      openDefaultWorkspace,
      loadNoteContent,
      saveNoteContent,
      readNoteFromDisk,
      subscribeChanges,
      resolveAssetUrl,
      notesPaths,
    ],
  )

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

export function useNotes() {
  const ctx = useContext(NotesContext)
  if (!ctx) throw new Error('useNotes must be used within NotesProvider')
  return ctx
}
