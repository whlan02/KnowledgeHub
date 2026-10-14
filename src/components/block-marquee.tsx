import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { setBlockSelection } from '@/lib/block-selection'
import { flatBlocks } from '@/lib/block-tree'

/** Pixels the pointer must travel before a press in the margin becomes a drag selection. */
const DRAG_THRESHOLD_PX = 4

type Point = { x: number; y: number }

/** Where a margin drag may start: empty page space, not a control or the text itself. */
function startsInMargin(editor: Editor, target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (editor.view.dom.contains(target)) return false
  return !target.closest('button, input, [role="button"], [role="menu"], .drag-handle')
}

/** Blocks whose rows overlap the vertical band between two y coordinates. */
function blocksInBand(editor: Editor, top: number, bottom: number) {
  return flatBlocks(editor.state.doc).filter((block) => {
    const el = editor.view.nodeDOM(block.pos)
    if (!(el instanceof HTMLElement)) return false
    const rect = el.getBoundingClientRect()
    return rect.bottom >= top && rect.top <= bottom
  })
}

/** Dragging from the page margin draws a box and selects the blocks it touches, like Notion. */
export function BlockMarquee({ editor }: { editor: Editor }) {
  const [box, setBox] = useState<{ start: Point; end: Point } | null>(null)

  useEffect(() => {
    const root = editor.view.dom.closest<HTMLElement>('[data-note-scroll]')
    if (!root) return

    let start: Point | null = null
    let dragging = false

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !startsInMargin(editor, event.target)) return
      start = { x: event.clientX, y: event.clientY }
      dragging = false
      event.preventDefault()
      editor.view.focus()
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!start) return
      const end = { x: event.clientX, y: event.clientY }
      if (!dragging && Math.hypot(end.x - start.x, end.y - start.y) < DRAG_THRESHOLD_PX) return
      dragging = true
      setBox({ start, end })
      const hit = blocksInBand(editor, Math.min(start.y, end.y), Math.max(start.y, end.y))
      const first = hit[0]
      const last = hit.at(-1)
      if (first && last) setBlockSelection(editor.view, first.pos, last.pos)
    }

    const onPointerUp = () => {
      start = null
      dragging = false
      setBox(null)
    }

    root.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      root.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [editor])

  if (!box) return null
  return (
    <div
      className="pointer-events-none fixed z-50 border border-[#2383e2]/50 bg-[#2383e2]/10"
      style={{
        left: Math.min(box.start.x, box.end.x),
        top: Math.min(box.start.y, box.end.y),
        width: Math.abs(box.end.x - box.start.x),
        height: Math.abs(box.end.y - box.start.y),
      }}
    />
  )
}
