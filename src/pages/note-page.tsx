import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { decodeNotePath } from '@/lib/utils'
import { extractToc } from '@/lib/toc'
import { useNotes } from '@/components/notes-provider'
import { MarkdownView } from '@/components/markdown-view'
import { TableOfContents } from '@/components/table-of-contents'

export function NotePage() {
  const { t } = useTranslation()
  const { notes } = useNotes()
  const params = useParams()
  const splat = params['*'] ?? ''
  const notePath = decodeNotePath(splat)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

  const note = notes.find((n) => n.path === notePath)
  const toc = useMemo(() => (note ? extractToc(note.content) : []), [note])

  useEffect(() => {
    scrollEl?.scrollTo({ top: 0 })
    if (window.location.hash) {
      const id = decodeURIComponent(window.location.hash.slice(1))
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView()
      })
    }
  }, [notePath, scrollEl])

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

  return (
    <div className="relative flex min-h-0 flex-1">
      <div ref={setScrollEl} className="min-w-0 flex-1 overflow-y-auto">
        <MarkdownView content={note.content} notePath={note.path} />
      </div>
      <TableOfContents items={toc} scrollRoot={scrollEl} />
    </div>
  )
}
