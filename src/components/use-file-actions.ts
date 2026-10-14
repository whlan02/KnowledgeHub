import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { confirmDialog } from '@/lib/backend'
import { fileErrorKey } from '@/lib/file-errors'
import { isInside, nameOf, remapPath } from '@/lib/path-ops'
import { decodeNotePath, encodeNotePath } from '@/lib/utils'
import { useNotes } from '@/components/notes-provider'

const NOTE_ROUTE = '/n/'

/** Create, rename, move and delete from the UI: runs the change, follows the open note, reports errors. */
export function useFileActions() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { createNote, createFolder, renameEntry, moveEntry, deleteEntry } = useNotes()
  const openPath = pathname.startsWith(NOTE_ROUTE) ? decodeNotePath(pathname.slice(NOTE_ROUTE.length)) : null

  const attempt = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | null> => {
      try {
        return await action()
      } catch (err) {
        console.error(err)
        window.alert(t(fileErrorKey(err)))
        return null
      }
    },
    [t],
  )

  /** Keep the editor on the same note after it, or its folder, got a new path. */
  const followOpenNote = useCallback(
    (from: string, to: string) => {
      if (openPath && isInside(openPath, from)) {
        navigate(`${NOTE_ROUTE}${encodeNotePath(remapPath(openPath, from, to))}`, { replace: true })
      }
    },
    [navigate, openPath],
  )

  const newNote = useCallback(
    async (dir: string) => {
      const path = await attempt(() => createNote(dir))
      if (path) navigate(`${NOTE_ROUTE}${encodeNotePath(path)}`)
      return path
    },
    [attempt, createNote, navigate],
  )

  const newFolder = useCallback((dir: string) => attempt(() => createFolder(dir)), [attempt, createFolder])

  const rename = useCallback(
    async (path: string, newName: string) => {
      const to = await attempt(() => renameEntry(path, newName))
      if (to) followOpenNote(path, to)
      return to
    },
    [attempt, followOpenNote, renameEntry],
  )

  const move = useCallback(
    async (path: string, targetDir: string) => {
      const to = await attempt(() => moveEntry(path, targetDir))
      if (to) followOpenNote(path, to)
      return to
    },
    [attempt, followOpenNote, moveEntry],
  )

  const remove = useCallback(
    async (path: string, isFolder: boolean) => {
      const name = nameOf(path)
      const message = t(isFolder ? 'fileDeleteConfirmFolder' : 'fileDeleteConfirm', { name })
      if (!(await confirmDialog(message, t('fileConfirm'), t('fileCancel')))) return
      await attempt(async () => {
        await deleteEntry(path)
        if (openPath && isInside(openPath, path)) navigate('/', { replace: true })
      })
    },
    [attempt, deleteEntry, navigate, openPath, t],
  )

  return { openPath, newNote, newFolder, rename, move, remove }
}
