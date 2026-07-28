import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import { useNavigate } from 'react-router-dom'
import type { Components } from 'react-markdown'
import { encodeNotePath, resolveNoteLink } from '@/lib/utils'
import { useNotes } from '@/components/notes-provider'
import { LinkPreviewAnchor } from '@/components/link-preview-anchor'

function MarkdownImage({
  src = '',
  alt = '',
  notePath,
  resolveAssetUrl,
  ...props
}: {
  src?: string
  alt?: string
  notePath: string
  resolveAssetUrl: (fromNotePath: string, src: string) => Promise<string | null>
} & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [url, setUrl] = useState(src)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const resolved = await resolveAssetUrl(notePath, src)
      if (!cancelled && resolved) setUrl(resolved)
    })()
    return () => {
      cancelled = true
    }
  }, [notePath, resolveAssetUrl, src])

  return <img src={url} alt={alt} loading="lazy" {...props} />
}

export function MarkdownView({
  content,
  notePath,
}: {
  content: string
  notePath: string
}) {
  const navigate = useNavigate()
  const { notes, notesPaths, resolveAssetUrl, loadNoteContent } = useNotes()

  const components = useMemo<Components>(
    () => ({
      a({ href = '', children, className, ...props }) {
        if (href.startsWith('#')) {
          return (
            <LinkPreviewAnchor
              href={href}
              notePath={notePath}
              notes={notes}
              loadNoteContent={loadNoteContent}
              className={className}
              {...props}
            >
              {children}
            </LinkPreviewAnchor>
          )
        }

        const resolved = resolveNoteLink(notePath, href)
        if (resolved) {
          const exists = notesPaths.has(resolved)
          return (
            <LinkPreviewAnchor
              {...props}
              href={`/n/${encodeNotePath(resolved)}`}
              previewHref={href}
              notePath={notePath}
              notes={notes}
              loadNoteContent={loadNoteContent}
              className={className}
              missingInternal={!exists}
              title={exists ? undefined : `Missing: ${resolved}`}
              onNavigate={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (exists) {
                  navigate(`/n/${encodeNotePath(resolved)}`)
                }
              }}
            >
              {children}
            </LinkPreviewAnchor>
          )
        }

        const isExternal = href.startsWith('http://') || href.startsWith('https://')
        return (
          <a
            {...props}
            href={href}
            className={className}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noreferrer' : undefined}
          >
            {children}
          </a>
        )
      },
      img(imgProps) {
        return (
          <MarkdownImage
            {...imgProps}
            notePath={notePath}
            resolveAssetUrl={resolveAssetUrl}
          />
        )
      },
    }),
    [navigate, notePath, notes, notesPaths, loadNoteContent, resolveAssetUrl],
  )

  return (
    <article className="markdown-body mx-auto max-w-3xl px-6 py-10 pb-24">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        skipHtml
        components={components}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}
