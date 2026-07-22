import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import { useNavigate } from 'react-router-dom'
import type { Components } from 'react-markdown'
import { encodeNotePath, resolveNoteLink } from '@/lib/utils'
import { useNotes } from '@/components/notes-provider'

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
  const { notesPaths, resolveAssetUrl } = useNotes()

  const components = useMemo<Components>(
    () => ({
      a({ href = '', children, ...props }) {
        if (href.startsWith('#')) {
          return (
            <a href={href} {...props}>
              {children}
            </a>
          )
        }

        const resolved = resolveNoteLink(notePath, href)
        if (resolved) {
          const exists = notesPaths.has(resolved)
          return (
            <a
              {...props}
              href={`/n/${encodeNotePath(resolved)}`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (exists) {
                  navigate(`/n/${encodeNotePath(resolved)}`)
                }
              }}
              title={exists ? undefined : `Missing: ${resolved}`}
            >
              {children}
            </a>
          )
        }

        const isExternal = href.startsWith('http://') || href.startsWith('https://')
        return (
          <a
            {...props}
            href={href}
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
    [navigate, notePath, notesPaths, resolveAssetUrl],
  )

  return (
    <article className="markdown-body mx-auto max-w-3xl px-6 py-10 pb-24">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  )
}
