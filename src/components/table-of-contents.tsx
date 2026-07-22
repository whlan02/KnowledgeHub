import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { TocItem } from '@/lib/toc'
import { ScrollArea } from '@/components/ui/scroll-area'

function scrollToHeading(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(null, '', `#${id}`)
}

export function TableOfContents({
  items,
  scrollRoot,
}: {
  items: TocItem[]
  scrollRoot: HTMLElement | null
}) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string>('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!scrollRoot || items.length === 0) return

    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => !!el)

    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top > b.boundingClientRect.top ? 1 : -1))
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id)
        }
      },
      {
        root: scrollRoot,
        rootMargin: '-10% 0px -70% 0px',
        threshold: [0, 1],
      },
    )

    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [items, scrollRoot])

  if (items.length === 0) return null

  return (
    <aside
      className="fixed top-1/2 right-5 z-40 -translate-y-1/2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      {/* Collapsed marker rail; expands into a floating TOC on hover */}
      <div
        className="flex cursor-pointer items-center justify-end pr-1 pl-3"
        onClick={() => setOpen(true)}
      >
        <div
          className={cn(
            'flex flex-col items-end justify-center gap-[5px] py-3 transition-opacity duration-150',
            open && 'opacity-0',
          )}
          aria-hidden={open}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.text}
              aria-label={item.text}
              onClick={() => {
                setActiveId(item.id)
                scrollToHeading(item.id)
              }}
              className={cn(
                'h-[2px] rounded-full transition-all duration-150',
                item.level <= 1 && 'w-[18px]',
                item.level === 2 && 'w-3.5',
                item.level >= 3 && 'w-2.5',
                activeId === item.id
                  ? 'bg-foreground/55'
                  : 'bg-foreground/18 hover:bg-foreground/35',
              )}
            />
          ))}
        </div>
      </div>

      <div
        className={cn(
          'absolute top-1/2 right-0 w-[252px] -translate-y-1/2 overflow-hidden rounded-xl border bg-card/95 shadow-lg shadow-black/10 backdrop-blur transition-all duration-150 dark:shadow-black/40',
          open
            ? 'pointer-events-auto visible translate-x-0 opacity-100'
            : 'pointer-events-none invisible translate-x-1 opacity-0',
        )}
      >
        <div className="border-b px-3 py-2.5 text-xs font-medium tracking-wide text-muted-foreground">
          {t('onThisPage')}
        </div>
        <ScrollArea className="h-[min(70vh,560px)]">
          <nav className="space-y-0.5 p-2">
            {items.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  setActiveId(item.id)
                  scrollToHeading(item.id)
                }}
                className={cn(
                  'block rounded-md px-2 py-1.5 text-[12.5px] leading-snug text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                  activeId === item.id && 'bg-accent font-medium text-accent-foreground',
                )}
                style={{ paddingLeft: 8 + (item.level - 1) * 10 }}
              >
                {item.text}
              </a>
            ))}
          </nav>
        </ScrollArea>
      </div>
    </aside>
  )
}
