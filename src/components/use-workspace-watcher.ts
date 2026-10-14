import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { Note } from '@/lib/fs-notes'
import { onWorkspaceChanged, scanWorkspace, type WorkspaceScan } from '@/lib/backend'

export type ChangeListener = (paths: string[]) => void

type Setters = {
  setNotes: Dispatch<SetStateAction<Note[]>>
  setFolders: Dispatch<SetStateAction<string[]>>
}

/** Wait this long after the last file event before rescanning, so a burst becomes one scan. */
const CHANGE_DEBOUNCE_MS = 200

function sameNotes(a: Note[], b: Note[]) {
  return a.length === b.length && a.every((n, i) => n.path === b[i].path && n.title === b[i].title)
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, i) => item === b[i])
}

/** Put a scan into state, keeping the old arrays when nothing changed so views do not re-render. */
export function applyScan(next: WorkspaceScan, setNotes: Setters['setNotes'], setFolders: Setters['setFolders']) {
  setNotes((prev) => (sameNotes(prev, next.notes) ? prev : next.notes))
  setFolders((prev) => (sameList(prev, next.folders) ? prev : next.folders))
}

/** Follow changes on disk: rescan the file list and tell open notes which paths changed. */
export function useWorkspaceWatcher({
  contentCacheRef,
  listenersRef,
  setNotes,
  setFolders,
}: Setters & {
  contentCacheRef: MutableRefObject<Map<string, string>>
  listenersRef: MutableRefObject<Set<ChangeListener>>
}) {
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
        if (!disposed) applyScan(next, setNotes, setFolders)
        else return
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
  }, [contentCacheRef, listenersRef, setNotes, setFolders])
}
