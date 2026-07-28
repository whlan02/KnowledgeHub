import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { decodeNotePath } from '@/lib/utils'
import { extractToc } from '@/lib/toc'
import { useNotes } from '@/components/notes-provider'
import { saveLastLocation } from '@/lib/last-location'
import { MarkdownView } from '@/components/markdown-view'
import { TableOfContents } from '@/components/table-of-contents'

export function NotePage() {
  const { t } = useTranslation()
  const { notes, source, activeFolderId, loadNoteContent } = useNotes()
  const params = useParams()
  const splat = params['*'] ?? ''
  const notePath = decodeNotePath(splat)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const note = notes.find((n) => n.path === notePath)
  const toc = useMemo(() => (content ? extractToc(content) : []), [content])

  useEffect(() => {
    let cancelled = false
    setContent(null)

    if (!note) {
      setLoading(false)
      return
    }

    setLoading(true)
    void loadNoteContent(notePath).then((text) => {
      if (cancelled) return
      setContent(text)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [note, notePath, loadNoteContent])

  useEffect(() => {
    scrollEl?.scrollTo({ top: 0 })
    if (window.location.hash) {
      const id = decodeURIComponent(window.location.hash.slice(1))
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView()
      })
    }
  }, [notePath, scrollEl, content])

  useEffect(() => {
    if (!note) return
    saveLastLocation({
      source,
      folderId: activeFolderId,
      notePath: note.path,
    })
  }, [note, source, activeFolderId])

  if (!note) {
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

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        {t('noteLoading')}
      </div>
    )
  }

  if (content === null) {
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

  return (
    <div className="relative flex min-h-0 flex-1">
      <div ref={setScrollEl} className="min-w-0 flex-1 overflow-y-auto">
        <MarkdownView content={content} notePath={note.path} />
      </div>
      <TableOfContents items={toc} scrollRoot={scrollEl} />
    </div>
  )
}
