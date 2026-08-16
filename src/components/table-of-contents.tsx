import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TocItem } from '@/lib/toc'
import { ScrollArea } from '@/components/ui/scroll-area'

type TocNode = TocItem & { children: TocNode[] }

function buildTocTree(items: TocItem[]): TocNode[] {
  const roots: TocNode[] = []
  const stack: TocNode[] = []

  for (const item of items) {
    const node: TocNode = { ...item, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop()
    }
    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }
    stack.push(node)
  }

  return roots
}

/** Ancestor ids of the active heading — those folders stay open so the current item is visible. */
function ancestorIdsOf(nodes: TocNode[], targetId: string): Set<string> {
  const result = new Set<string>()
  if (!targetId) return result

  const walk = (list: TocNode[], trail: string[]): boolean => {
    for (const node of list) {
      if (node.id === targetId) {
        for (const id of trail) result.add(id)
        return true
      }
      if (walk(node.children, [...trail, node.id])) return true
    }
    return false
  }

  walk(nodes, [])
  return result
}

function scrollToHeading(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(null, '', `#${id}`)
}

const TOC_PIN_KEY = 'kh-toc-pinned'

function loadTocPinned() {
  try {
    return localStorage.getItem(TOC_PIN_KEY) === '1'
  } catch {
    return false
  }
}

function saveTocPinned(pinned: boolean) {
  try {
    localStorage.setItem(TOC_PIN_KEY, pinned ? '1' : '0')
  } catch {
    // Ignore quota / private mode errors.
  }
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
  const [pinned, setPinned] = useState(loadTocPinned)
  const panelOpen = pinned || open
  const [manualExpandedIds, setManualExpandedIds] = useState<Set<string>>(() => new Set())
  const [suppressedAutoIds, setSuppressedAutoIds] = useState<Set<string>>(() => new Set())
  const tree = useMemo(() => buildTocTree(items), [items])
  const autoExpandedIds = useMemo(() => ancestorIdsOf(tree, activeId), [tree, activeId])
  const expandedIds = useMemo(() => {
    const next = new Set<string>()
    for (const id of autoExpandedIds) {
      if (!suppressedAutoIds.has(id)) next.add(id)
    }
    for (const id of manualExpandedIds) next.add(id)
    return next
  }, [autoExpandedIds, manualExpandedIds, suppressedAutoIds])

  useEffect(() => {
    setManualExpandedIds(new Set())
    setSuppressedAutoIds(new Set())
  }, [items])

  useEffect(() => {
    setSuppressedAutoIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        if (autoExpandedIds.has(id)) next.add(id)
      }
      if (next.size === prev.size) {
        for (const id of prev) {
          if (!next.has(id)) return next
        }
        return prev
      }
      return next
    })
  }, [autoExpandedIds])

  const spySuspendedRef = useRef(false)
  const stopSpySuspendRef = useRef<(() => void) | null>(null)

  const beginSpySuspend = (root: HTMLElement) => {
    stopSpySuspendRef.current?.()

    spySuspendedRef.current = true
    let done = false
    let seenScroll = false
    let debounceId = 0

    const resume = () => {
      if (done) return
      done = true
      spySuspendedRef.current = false
      root.removeEventListener('scrollend', resume)
      root.removeEventListener('scroll', onScroll)
      window.clearTimeout(debounceId)
      window.clearTimeout(capId)
      stopSpySuspendRef.current = null
    }

    const onScroll = () => {
      seenScroll = true
      window.clearTimeout(debounceId)
      debounceId = window.setTimeout(resume, 160)
    }

    root.addEventListener('scrollend', resume)
    root.addEventListener('scroll', onScroll, { passive: true })
    debounceId = window.setTimeout(() => {
      if (!seenScroll) resume()
    }, 200)
    const capId = window.setTimeout(resume, 1500)
    stopSpySuspendRef.current = resume
  }

  useEffect(() => () => stopSpySuspendRef.current?.(), [])

  const jumpToHeading = (id: string) => {
    setActiveId(id)
    if (scrollRoot) beginSpySuspend(scrollRoot)
    scrollToHeading(id)
  }

  const toggleExpanded = (id: string, currentlyExpanded: boolean) => {
    if (currentlyExpanded) {
      setManualExpandedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setSuppressedAutoIds((prev) => new Set(prev).add(id))
      return
    }
    setSuppressedAutoIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setManualExpandedIds((prev) => new Set(prev).add(id))
  }

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
        if (spySuspendedRef.current) return
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
      onMouseLeave={() => {
        if (!pinned) setOpen(false)
      }}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(e) => {
        if (pinned) return
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
            panelOpen && 'opacity-0',
          )}
          aria-hidden={panelOpen}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.text}
              aria-label={item.text}
              onClick={() => jumpToHeading(item.id)}
              className={cn(
                'h-[2px] rounded-full transition-all duration-150',
                item.level <= 2 && 'w-[18px]',
                item.level === 3 && 'w-3.5',
                item.level >= 4 && 'w-2.5',
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
          panelOpen
            ? 'pointer-events-auto visible translate-x-0 opacity-100'
            : 'pointer-events-none invisible translate-x-1 opacity-0',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
          <div className="text-xs font-medium tracking-wide text-muted-foreground">
            {t('onThisPage')}
          </div>
          <button
            type="button"
            title={pinned ? t('unpinToc') : t('pinToc')}
            aria-label={pinned ? t('unpinToc') : t('pinToc')}
            aria-pressed={pinned}
            onClick={() => {
              const next = !pinned
              setPinned(next)
              saveTocPinned(next)
              if (next) setOpen(true)
            }}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              pinned && 'bg-accent text-accent-foreground',
            )}
          >
            <Pin className={cn('size-3.5', pinned && 'fill-current')} />
          </button>
        </div>
        <ScrollArea className="h-[min(70vh,560px)]">
          <nav className="p-2">
            {tree.map((node) => (
              <TocTreeItem
                key={node.id}
                node={node}
                depth={0}
                activeId={activeId}
                expandedIds={expandedIds}
                onToggleExpanded={toggleExpanded}
                onSelect={jumpToHeading}
              />
            ))}
          </nav>
        </ScrollArea>
      </div>
    </aside>
  )
}

function TocTreeItem({
  node,
  depth,
  activeId,
  expandedIds,
  onToggleExpanded,
  onSelect,
}: {
  node: TocNode
  depth: number
  activeId: string
  expandedIds: Set<string>
  onToggleExpanded: (id: string, currentlyExpanded: boolean) => void
  onSelect: (id: string) => void
}) {
  const hasChildren = node.children.length > 0
  const expanded = hasChildren && expandedIds.has(node.id)

  return (
    <div>
      <div
        className={cn(
          'flex items-start rounded-md text-[12.5px] leading-snug text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          activeId === node.id && 'bg-accent font-medium text-accent-foreground',
        )}
        style={{ paddingLeft: 4 + depth * 10 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleExpanded(node.id, expanded)
            }}
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-accent-foreground/10"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <a
          href={`#${node.id}`}
          onClick={(e) => {
            e.preventDefault()
            onSelect(node.id)
          }}
          className="min-w-0 flex-1 py-1.5 pr-2"
        >
          {node.text}
        </a>
      </div>
      {expanded &&
        node.children.map((child) => (
          <TocTreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            activeId={activeId}
            expandedIds={expandedIds}
            onToggleExpanded={onToggleExpanded}
            onSelect={onSelect}
          />
        ))}
    </div>
  )
}
