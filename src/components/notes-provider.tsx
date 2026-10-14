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
import { useEntryOperations } from '@/components/use-entry-operations'
import { applyScan, useWorkspaceWatcher, type ChangeListener } from '@/components/use-workspace-watcher'
import type { Note } from '@/lib/fs-notes'
import {
  defaultWorkspace,
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

type NotesContextValue = {
  notes: Note[]
  /** Every folder in the workspace, including empty ones. */
  folders: string[]
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
  /** Create an untitled note in `dir`; resolves to its path. */
  createNote: (dir: string) => Promise<string>
  /** Create an untitled folder in `dir`; resolves to its path. */
  createFolder: (dir: string) => Promise<string>
  /** Rename a note (the `.md` is added if missing) or folder; resolves to its new path. */
  renameEntry: (path: string, newName: string) => Promise<string>
  /** Move a note or folder into `targetDir`; resolves to its new path. */
  moveEntry: (path: string, targetDir: string) => Promise<string>
  /** Move a note or folder to the system trash. */
  deleteEntry: (path: string) => Promise<void>
  /** Open editors register a function that saves pending edits, run before files are moved. */
  registerSaveFlusher: (flush: () => Promise<void>) => () => void
}

const NotesContext = createContext<NotesContextValue | null>(null)

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [folderLabel, setFolderLabel] = useState('')
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [defaultRoot, setDefaultRoot] = useState<string | null>(null)
  const [recentFolders, setRecentFolders] = useState<RecentFolderEntry[]>(() => loadRecentFolders())
  const [ready, setReady] = useState(false)
  const contentCacheRef = useRef(new Map<string, string>())
  const listenersRef = useRef(new Set<ChangeListener>())
  const flushersRef = useRef(new Set<() => Promise<void>>())
  const notesRef = useRef(notes)
  const foldersRef = useRef(folders)
  notesRef.current = notes
  foldersRef.current = folders

  const applyWorkspace = useCallback((info: WorkspaceInfo) => {
    contentCacheRef.current.clear()
    setNotes(info.notes)
    setFolders(info.folders)
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

  useWorkspaceWatcher({ contentCacheRef, listenersRef, setNotes, setFolders })

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

  const refresh = useCallback(async () => {
    applyScan(await scanWorkspace(), setNotes, setFolders)
  }, [])

  const registerSaveFlusher = useCallback((flush: () => Promise<void>) => {
    flushersRef.current.add(flush)
    return () => {
      flushersRef.current.delete(flush)
    }
  }, [])

  /** Save edits first, so a note that is about to move is not rewritten under its old name. */
  const prepareToChangeFiles = useCallback(async () => {
    await Promise.all([...flushersRef.current].map((flush) => flush()))
  }, [])

  const { createNote, createFolder, renameEntry, moveEntry, deleteEntry } = useEntryOperations({
    notesRef,
    foldersRef,
    contentCacheRef,
    prepareToChangeFiles,
    refresh,
  })

  const notesPaths = useMemo(() => new Set(notes.map((n) => n.path)), [notes])

  const value = useMemo<NotesContextValue>(
    () => ({
      notes,
      folders,
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
      createNote,
      createFolder,
      renameEntry,
      moveEntry,
      deleteEntry,
      registerSaveFlusher,
    }),
    [
      notes,
      folders,
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
      createNote,
      createFolder,
      renameEntry,
      moveEntry,
      deleteEntry,
      registerSaveFlusher,
    ],
  )

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

export function useNotes() {
  const ctx = useContext(NotesContext)
  if (!ctx) throw new Error('useNotes must be used within NotesProvider')
  return ctx
}
