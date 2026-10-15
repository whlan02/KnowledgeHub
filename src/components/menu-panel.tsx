import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const VIEWPORT_MARGIN = 8

/**
 * A popup menu at a fixed screen position. Closes on Esc or an outside click,
 * and keeps itself inside the window. `onClose` is told whether the user dismissed it.
 */
export function MenuPanel({
  x,
  y,
  onDismiss,
  className,
  children,
}: {
  x: number
  y: number
  onDismiss: () => void
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPosition({
      left: Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN)),
      top: Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN)),
    })
  }, [x, y])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onDismiss()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
        const current = items.indexOf(document.activeElement as HTMLElement)
        const step = e.key === 'ArrowDown' ? 1 : -1
        items[(current + step + items.length) % items.length]?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onDismiss])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className={cn(
        'fixed z-[110] min-w-[12rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        className,
      )}
      style={position}
      onMouseDown={(e) => {
        // Keep the editor's focus when a menu item is clicked, but let a search field take focus.
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

export function MenuItem({
  icon: Icon,
  label,
  hint,
  destructive,
  onSelect,
  trailing,
}: {
  icon?: LucideIcon
  label: string
  hint?: string
  destructive?: boolean
  onSelect: () => void
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent',
        destructive && 'text-red-600 dark:text-red-400',
      )}
      onClick={onSelect}
    >
      {Icon && <Icon className="size-4 shrink-0 opacity-70" />}
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {trailing}
    </button>
  )
}
