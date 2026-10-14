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
import i18n from '@/i18n'
import type { Note } from '@/lib/fs-notes'
import {
  createFolderEntry,
  createNoteFile,
  defaultWorkspace,
  deleteEntry as deleteEntryFile,
  onWorkspaceChanged,
  openWorkspace,
  pickFolder,
  readNote,
  renameEntry as renameEntryFile,
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
import { rewriteLinks } from '@/lib/link-rewrite'
import { isInside, joinPath, nameOf, parentOf, remapPath, uniqueName } from '@/lib/path-ops'
import { resolveAssetPath } from '@/lib/utils'

type ChangeListener = (paths: string[]) => void

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

/** Wait this long after the last file event before rescanning, so a burst becomes one scan. */
const CHANGE_DEBOUNCE_MS = 200

function sameNotes(a: Note[], b: Note[]) {
  return (
    a.length === b.length &&
    a.every((n, i) => n.path === b[i].path && n.title === b[i].title)
  )
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, i) => item === b[i])
}

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
        setNotes((prev) => (sameNotes(prev, next.notes) ? prev : next.notes))
        setFolders((prev) => (sameList(prev, next.folders) ? prev : next.folders))
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

  const refresh = useCallback(async () => {
    const next = await scanWorkspace()
    setNotes((prev) => (sameNotes(prev, next.notes) ? prev : next.notes))
    setFolders((prev) => (sameList(prev, next.folders) ? prev : next.folders))
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

  const forgetCachedPaths = useCallback((path: string) => {
    for (const cached of [...contentCacheRef.current.keys()]) {
      if (isInside(cached, path)) contentCacheRef.current.delete(cached)
    }
  }, [])

  const namesIn = useCallback((dir: string) => {
    const all = [...notesRef.current.map((n) => n.path), ...foldersRef.current]
    return all.filter((path) => parentOf(path) === dir).map(nameOf)
  }, [])

  const createNote = useCallback(
    async (dir: string) => {
      const title = i18n.t('untitledNote')
      const path = joinPath(dir, uniqueName(title, '.md', namesIn(dir)))
      await createNoteFile(path, `# ${title}\n\n`)
      await refresh()
      return path
    },
    [namesIn, refresh],
  )

  const createFolder = useCallback(
    async (dir: string) => {
      const path = joinPath(dir, uniqueName(i18n.t('untitledFolder'), '', namesIn(dir)))
      await createFolderEntry(path)
      await refresh()
      return path
    },
    [namesIn, refresh],
  )

  /** Re-point links in every note so they still reach what was renamed or moved. */
  const rewriteLinksAfterMove = useCallback(async (oldPaths: string[], from: string, to: string) => {
    for (const oldPath of oldPaths) {
      const newPath = remapPath(oldPath, from, to)
      try {
        const text = await readNote(newPath)
        const next = rewriteLinks(text, oldPath, newPath, from, to)
        if (next !== text) await writeNote(newPath, next)
        contentCacheRef.current.delete(newPath)
      } catch (err) {
        console.error(err)
      }
    }
  }, [])

  const moveTo = useCallback(
    async (from: string, to: string) => {
      if (from === to) return to
      await prepareToChangeFiles()
      const before = notesRef.current.map((n) => n.path)
      await renameEntryFile(from, to)
      forgetCachedPaths(from)
      await rewriteLinksAfterMove(before, from, to)
      await refresh()
      return to
    },
    [forgetCachedPaths, prepareToChangeFiles, refresh, rewriteLinksAfterMove],
  )

  const renameEntry = useCallback(
    async (path: string, newName: string) => {
      const isNote = notesRef.current.some((n) => n.path === path)
      const name = isNote && !newName.toLowerCase().endsWith('.md') ? `${newName}.md` : newName
      return moveTo(path, joinPath(parentOf(path), name))
    },
    [moveTo],
  )

  const moveEntry = useCallback(
    (path: string, targetDir: string) => moveTo(path, joinPath(targetDir, nameOf(path))),
    [moveTo],
  )

  const deleteEntry = useCallback(
    async (path: string) => {
      await prepareToChangeFiles()
      await deleteEntryFile(path)
      forgetCachedPaths(path)
      await refresh()
    },
    [forgetCachedPaths, prepareToChangeFiles, refresh],
  )

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
