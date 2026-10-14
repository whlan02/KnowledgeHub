import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { decodeNotePath } from '@/lib/utils'
import { extractToc, scrollHeadingIntoView } from '@/lib/toc'
import { useNotes } from '@/components/notes-provider'
import { saveLastLocation } from '@/lib/last-location'
import { NoteEditor } from '@/components/note-editor'
import { TableOfContents } from '@/components/table-of-contents'

/** A note's body together with where it was read from (the same path can exist in two folders). */
type LoadedNote = { folderId: string | null; path: string; text: string | null }

export function NotePage() {
  const { t } = useTranslation()
  const { notes, activeFolderId, loadNoteContent } = useNotes()
  const params = useParams()
  const splat = params['*'] ?? ''
  const notePath = decodeNotePath(splat)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [loaded, setLoaded] = useState<LoadedNote | null>(null)
  const [liveContent, setLiveContent] = useState<string | null>(null)
  const onDraft = useCallback((text: string) => {
    setLiveContent(text)
  }, [])

  const note = notes.find((n) => n.path === notePath)
  const hasNote = Boolean(note)
  // The body only counts for the note it was read from; right after a route change it is stale.
  const isLoaded = loaded?.path === notePath && loaded.folderId === activeFolderId
  const content = isLoaded ? loaded.text : null
  const loading = hasNote && !isLoaded
  const toc = useMemo(() => {
    const sourceText = liveContent ?? content
    return sourceText ? extractToc(sourceText) : []
  }, [content, liveContent])

  // Load the body once per note. Later edits on disk are picked up by the editor itself.
  useEffect(() => {
    let cancelled = false
    setLiveContent(null)
    if (!hasNote) return

    void loadNoteContent(notePath).then((text) => {
      if (cancelled) return
      setLoaded({ folderId: activeFolderId, path: notePath, text })
      setLiveContent(text)
    })

    return () => {
      cancelled = true
    }
  }, [hasNote, notePath, activeFolderId, loadNoteContent])

  useEffect(() => {
    scrollEl?.scrollTo({ top: 0 })
  }, [notePath, scrollEl])

  useEffect(() => {
    if (!content || !window.location.hash) return
    const id = decodeURIComponent(window.location.hash.slice(1))
    requestAnimationFrame(() => {
      scrollHeadingIntoView(id, scrollEl)
    })
  }, [notePath, content, scrollEl])

  useEffect(() => {
    if (!note) return
    saveLastLocation({
      folderId: activeFolderId,
      notePath: note.path,
    })
  }, [note, activeFolderId])

  if (!note || (isLoaded && content === null)) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-muted-foreground">
        <div className="text-center">
          <p className="mb-3">{t('noteNotFound')}</p>
          <Link to="/" className="text-sm text-foreground underline-offset-4 hover:underline">
            README
          </Link>
        </div>
      </div>
    )
  }

  if (loading || content === null) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        {t('noteLoading')}
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <div ref={setScrollEl} data-note-scroll className="min-w-0 flex-1 overflow-y-auto">
        <NoteEditor key={note.path} notePath={note.path} initialContent={content} onDraft={onDraft} />
      </div>
      <TableOfContents items={toc} scrollRoot={scrollEl} />
    </div>
  )
}
