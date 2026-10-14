import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, Search, TextSearch } from 'lucide-react'
import { searchNotes, type SearchHit } from '@/lib/backend'
import { highlightParts, rankNotes } from '@/lib/note-search'
import { cn, encodeNotePath } from '@/lib/utils'
import { useNotes } from '@/components/notes-provider'

/** Wait this long after typing before searching note text, which reads every file. */
const CONTENT_SEARCH_DELAY_MS = 200
const MIN_CONTENT_QUERY = 2

type Result =
  | { kind: 'note'; path: string; title: string }
  | { kind: 'text'; path: string; title: string; line: number; snippet: string }

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-yellow-200/70 text-foreground dark:bg-yellow-500/30">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}

/** Ctrl+P: jump to a note by title or path, and search the text of all notes. */
export function QuickOpen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { notes } = useNotes()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setHits([])
      setSelected(0)
    }
  }, [open])

  // Search note text a moment after typing stops; a slow answer for an old query is dropped.
  useEffect(() => {
    const text = query.trim()
    if (!open || text.length < MIN_CONTENT_QUERY) {
      setHits([])
      return
    }
    let stale = false
    const timer = window.setTimeout(() => {
      void searchNotes(text)
        .then((found) => {
          if (!stale) setHits(found)
        })
        .catch(() => {
          if (!stale) setHits([])
        })
    }, CONTENT_SEARCH_DELAY_MS)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [open, query])

  const results = useMemo<Result[]>(() => {
    const byName = rankNotes(notes, query).map((note): Result => ({ kind: 'note', path: note.path, title: note.title }))
    const byText = hits.map(
      (hit): Result => ({ kind: 'text', path: hit.path, title: hit.title, line: hit.line, snippet: hit.snippet }),
    )
    return [...byName, ...byText]
  }, [notes, query, hits])

  useEffect(() => setSelected(0), [query])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, results])

  if (!open) return null

  const choose = (result: Result | undefined) => {
    if (!result) return
    onClose()
    navigate(`/n/${encodeNotePath(result.path)}`)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length === 0) return
      setSelected((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(results[selected])
    }
  }

  const firstTextIndex = results.findIndex((result) => result.kind === 'text')

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-label={t('searchTitle')}
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            placeholder={t('searchPlaceholder')}
            className="h-11 flex-1 bg-transparent text-sm outline-none"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('searchNoResults')}</p>
          )}
          {results.map((result, index) => (
            <div key={`${result.kind}:${result.path}:${result.kind === 'text' ? result.line : ''}`}>
              {index === 0 && result.kind === 'note' && (
                <div className="px-3 pb-1 pt-2 text-xs text-muted-foreground">{t('searchNotes')}</div>
              )}
              {index === firstTextIndex && (
                <div className="px-3 pb-1 pt-2 text-xs text-muted-foreground">{t('searchText')}</div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={index === selected}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left text-sm',
                  index === selected && 'bg-accent',
                )}
                onMouseEnter={() => setSelected(index)}
                onClick={() => choose(result)}
              >
                {result.kind === 'note' ? (
                  <FileText className="mt-0.5 size-4 shrink-0 opacity-70" />
                ) : (
                  <TextSearch className="mt-0.5 size-4 shrink-0 opacity-70" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    <Highlighted text={result.title} query={result.kind === 'note' ? query : ''} />
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {result.kind === 'text' ? (
                      <Highlighted text={result.snippet} query={query} />
                    ) : (
                      result.path
                    )}
                  </span>
                </span>
                {result.kind === 'text' && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {result.path} : {result.line}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
