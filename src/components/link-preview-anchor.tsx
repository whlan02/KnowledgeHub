import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import type { Note } from '@/lib/fs-notes'
import { extractMarkdownSection, splitHrefHash } from '@/lib/markdown-section'
import {
  computePreviewPosition,
  PREVIEW_CARD_WIDTH,
  PREVIEW_ESTIMATED_HEIGHT,
} from '@/lib/preview-position'
import { cn, resolveNoteLink } from '@/lib/utils'
import { MarkdownPreviewBody } from '@/components/markdown-preview-body'

const SHOW_DELAY_MS = 350
const HIDE_DELAY_MS = 180

type PreviewModel =
  | { kind: 'content'; title: string; subtitle: string; markdown: string }
  | { kind: 'missing'; title: string; subtitle: string; message: string }

type LinkPreviewAnchorProps = {
  href: string
  previewHref?: string
  notePath: string
  notes: Note[]
  className?: string
  children: ReactNode
  onNavigate?: (e: React.MouseEvent<HTMLAnchorElement>) => void
  missingInternal?: boolean
  title?: string
}

export function LinkPreviewAnchor({
  href,
  previewHref,
  notePath,
  notes,
  className,
  children,
  onNavigate,
  missingInternal,
  title,
}: LinkPreviewAnchorProps) {
  const { t } = useTranslation()
  const sourceHref = previewHref ?? href
  const pointerRef = useRef({ x: 0, y: 0 })
  const cardRef = useRef<HTMLDivElement>(null)
  const showTimerRef = useRef<number | undefined>(undefined)
  const hideTimerRef = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [preview, setPreview] = useState<PreviewModel | null>(null)

  const buildPreview = useCallback((): PreviewModel | null => {
    const { pathPart, hash } = splitHrefHash(sourceHref)

    // Same-page heading: `#section`
    if (!pathPart && hash) {
      const current = notes.find((n) => n.path === notePath)
      if (!current) return null
      const section = extractMarkdownSection(current.content, hash)
      if (!section) {
        return {
          kind: 'missing',
          title: `#${hash}`,
          subtitle: current.path,
          message: t('linkPreviewSectionMissing'),
        }
      }
      return {
        kind: 'content',
        title: section.split('\n')[0]?.replace(/^#+\s+/, '') || hash,
        subtitle: current.path,
        markdown: section,
      }
    }

    // Wiki / relative note link (optional `#section`)
    const resolved = resolveNoteLink(notePath, pathPart || sourceHref)
    if (!resolved) return null

    const note = notes.find((n) => n.path === resolved)
    if (!note || missingInternal) {
      return {
        kind: 'missing',
        title: resolved.split('/').pop()?.replace(/\.md$/i, '') ?? resolved,
        subtitle: resolved,
        message: t('linkPreviewMissing'),
      }
    }

    if (hash) {
      const section = extractMarkdownSection(note.content, hash)
      if (!section) {
        return {
          kind: 'missing',
          title: note.title,
          subtitle: `${note.path}#${hash}`,
          message: t('linkPreviewSectionMissing'),
        }
      }
      return {
        kind: 'content',
        title: section.split('\n')[0]?.replace(/^#+\s+/, '') || note.title,
        subtitle: `${note.path}#${hash}`,
        markdown: section,
      }
    }

    return {
      kind: 'content',
      title: note.title,
      subtitle: note.path,
      markdown: note.content,
    }
  }, [sourceHref, notePath, notes, missingInternal, t])

  const reposition = useCallback((clientX: number, clientY: number) => {
    const width = cardRef.current?.offsetWidth ?? PREVIEW_CARD_WIDTH
    const height = cardRef.current?.offsetHeight ?? PREVIEW_ESTIMATED_HEIGHT
    setPosition(computePreviewPosition(clientX, clientY, width, height))
  }, [])

  const cancelHide = () => {
    window.clearTimeout(hideTimerRef.current)
  }

  const scheduleHide = () => {
    cancelHide()
    hideTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      setPreview(null)
    }, HIDE_DELAY_MS)
  }

  const openPreview = useCallback(() => {
    const model = buildPreview()
    if (!model) return
    setPreview(model)
    setOpen(true)
    // Freeze around the pointer at open time; don't chase the cursor while reading.
    reposition(pointerRef.current.x, pointerRef.current.y)
  }, [buildPreview, reposition])

  const scheduleOpen = () => {
    cancelHide()
    window.clearTimeout(showTimerRef.current)
    showTimerRef.current = window.setTimeout(openPreview, SHOW_DELAY_MS)
  }

  const trackPointer = (clientX: number, clientY: number) => {
    pointerRef.current = { x: clientX, y: clientY }
  }

  useLayoutEffect(() => {
    if (!open) return
    reposition(pointerRef.current.x, pointerRef.current.y)
  }, [open, preview, reposition])

  useEffect(() => {
    if (!open) return
    const onResize = () => reposition(pointerRef.current.x, pointerRef.current.y)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, reposition])

  useEffect(() => {
    return () => {
      window.clearTimeout(showTimerRef.current)
      window.clearTimeout(hideTimerRef.current)
    }
  }, [])

  return (
    <>
      <a
        href={href}
        title={title}
        className={cn(className, 'link-preview-target')}
        onMouseEnter={(e) => {
          trackPointer(e.clientX, e.clientY)
          scheduleOpen()
        }}
        onMouseLeave={scheduleHide}
        onMouseMove={(e) => trackPointer(e.clientX, e.clientY)}
        onFocus={scheduleOpen}
        onBlur={scheduleHide}
        onClick={onNavigate}
      >
        {children}
      </a>
      {open &&
        preview &&
        createPortal(
          <div
            ref={cardRef}
            className="fixed z-[100] flex w-[min(28rem,calc(100vw-1.5rem))] max-h-[min(28rem,calc(100vh-1.5rem))] flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
            style={{ top: position.top, left: position.left }}
            role="dialog"
            aria-label={preview.title}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            <div className="flex shrink-0 items-start gap-2 border-b px-3 py-2.5">
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold leading-snug">{preview.title}</div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{preview.subtitle}</div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
              {preview.kind === 'missing' ? (
                <p className="py-2 text-xs text-amber-600 dark:text-amber-400">{preview.message}</p>
              ) : (
                <MarkdownPreviewBody content={preview.markdown} />
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
