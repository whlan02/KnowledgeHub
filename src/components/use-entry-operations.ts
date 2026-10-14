import { useCallback, type MutableRefObject } from 'react'
import i18n from '@/i18n'
import type { Note } from '@/lib/fs-notes'
import {
  createFolderEntry,
  createNoteFile,
  deleteEntry as deleteEntryFile,
  readNote,
  renameEntry as renameEntryFile,
  writeNote,
} from '@/lib/backend'
import { entryFileName, rewriteLinksAfterMove } from '@/lib/entry-operations'
import { isInside, joinPath, nameOf, parentOf, uniqueName } from '@/lib/path-ops'

type Deps = {
  notesRef: MutableRefObject<Note[]>
  foldersRef: MutableRefObject<string[]>
  contentCacheRef: MutableRefObject<Map<string, string>>
  /** Saves what open editors have pending, so a file that is about to move is not rewritten after. */
  prepareToChangeFiles: () => Promise<void>
  refresh: () => Promise<void>
}

/** Create, rename, move and delete notes and folders, keeping the note cache and links right. */
export function useEntryOperations({
  notesRef,
  foldersRef,
  contentCacheRef,
  prepareToChangeFiles,
  refresh,
}: Deps) {
  const forgetCachedPaths = useCallback(
    (path: string) => {
      for (const cached of [...contentCacheRef.current.keys()]) {
        if (isInside(cached, path)) contentCacheRef.current.delete(cached)
      }
    },
    [contentCacheRef],
  )

  const namesIn = useCallback(
    (dir: string) => {
      const all = [...notesRef.current.map((n) => n.path), ...foldersRef.current]
      return all.filter((path) => parentOf(path) === dir).map(nameOf)
    },
    [notesRef, foldersRef],
  )

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

  const moveTo = useCallback(
    async (from: string, to: string) => {
      if (from === to) return to
      await prepareToChangeFiles()
      const before = notesRef.current.map((n) => n.path)
      await renameEntryFile(from, to)
      forgetCachedPaths(from)
      const rewritten = await rewriteLinksAfterMove(before, from, to, { read: readNote, write: writeNote })
      rewritten.forEach((path) => contentCacheRef.current.delete(path))
      await refresh()
      return to
    },
    [contentCacheRef, forgetCachedPaths, notesRef, prepareToChangeFiles, refresh],
  )

  const renameEntry = useCallback(
    async (path: string, newName: string) => {
      const isNote = notesRef.current.some((n) => n.path === path)
      return moveTo(path, joinPath(parentOf(path), entryFileName(newName, isNote)))
    },
    [moveTo, notesRef],
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

  return { createNote, createFolder, renameEntry, moveEntry, deleteEntry }
}
