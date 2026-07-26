import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import type { Components } from 'react-markdown'
import { cn } from '@/lib/utils'

/** Compact Markdown render for hover preview windows (no nested link previews). */
export function MarkdownPreviewBody({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const components = useMemo<Components>(
    () => ({
      a({ href = '', children, ...props }) {
        const external = href.startsWith('http://') || href.startsWith('https://')
        return (
          <a
            {...props}
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noreferrer' : undefined}
            onClick={(e) => {
              // Keep preview interaction local; don't navigate the main page from inside the card.
              if (!external && !href.startsWith('#')) e.preventDefault()
            }}
          >
            {children}
          </a>
        )
      },
    }),
    [],
  )

  return (
    <div className={cn('markdown-body markdown-preview-body', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} skipHtml components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
