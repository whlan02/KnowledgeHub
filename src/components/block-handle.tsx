import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import { defaultRules, type DragHandleRule } from '@tiptap/extension-drag-handle'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { GripVertical, Plus } from 'lucide-react'
import { restoreCursor } from '@/lib/block-actions'
import { blockAtPos, blockPosAt } from '@/lib/block-tree'
import { selectedBlocks, targetBlocks } from '@/lib/block-selection'
import { OPEN_BLOCK_MENU_EVENT } from '@/lib/editor-events'
import { BlockMenu, type BlockMenuState } from '@/components/block-menu'

const handleButtonClass =
  'flex size-6 items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted hover:text-foreground'

const HANDLE_GAP_PX = 4

/** Quotes, callouts and toggles are one block: what sits inside them is passed over. */
const keepContainersWhole: DragHandleRule = {
  id: 'keepContainersWhole',
  evaluate: ({ node, parent }) => {
    const inContainer = parent && ['blockquote', 'callout', 'details'].includes(parent.type.name)
    return inContainer || ['detailsSummary', 'detailsContent'].includes(node.type.name) ? 1000 : 0
  },
}

const NESTED_BLOCKS = { rules: [...defaultRules, keepContainersWhole] }

/**
 * Where the handle should sit for a block. A list item's marker is drawn in the list's left
 * padding, outside the item's own box, so the handle has to clear that padding as well.
 */
function handleAnchorRect(block: HTMLElement) {
  const rect = block.getBoundingClientRect()
  const list = block.matches('li') ? block.parentElement : null
  const markerSpace = list ? parseFloat(getComputedStyle(list).paddingLeft) || 0 : 0
  return new DOMRect(rect.x - markerSpace - HANDLE_GAP_PX, rect.y, rect.width, rect.height)
}

/** Keep the handle where it is while a menu is open (the drag-handle plugin reads this transaction meta). */
function setHandleLocked(editor: Editor, locked: boolean) {
  editor.view.dispatch(editor.state.tr.setMeta('lockDragHandle', locked))
}

/** Notion-style handle left of each block: `+` inserts below, the grip drags and opens the block menu. */
export function BlockHandle({ editor, notePath }: { editor: Editor; notePath: string }) {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<BlockMenuState | null>(null)
  const hoveredPosRef = useRef(-1)

  const onNodeChange = useCallback(({ pos }: { pos: number }) => {
    hoveredPosRef.current = pos
  }, [])

  // The plugin reports the hovered block through onNodeChange right before it asks for this anchor.
  const getHandleAnchor = useCallback(() => {
    if (hoveredPosRef.current < 0) return null
    const block = editor.view.nodeDOM(hoveredPosRef.current) as HTMLElement | null
    return block ? { getBoundingClientRect: () => handleAnchorRect(block) } : null
  }, [editor])

  const openFromHandle = (kind: BlockMenuState['kind'], button: HTMLElement) => {
    const hovered = blockAtPos(editor.state.doc, hoveredPosRef.current)
    if (!hovered) return
    // Acting on a block inside the selection means acting on the whole selection.
    const selected = selectedBlocks(editor.state)
    const blocks = selected?.some((block) => block.pos === hovered.pos) ? selected : [hovered]
    const rect = button.getBoundingClientRect()
    setHandleLocked(editor, true)
    setMenu({ kind, x: rect.right + 4, y: rect.top, blocks })
  }

  const closeMenu = useCallback(
    (restore: boolean) => {
      setHandleLocked(editor, false)
      setMenu((current) => {
        if (current && restore) restoreCursor(editor, current.blocks[0].pos)
        return null
      })
    },
    [editor],
  )

  // Ctrl+/ opens the menu for the block under the cursor.
  useEffect(() => {
    const dom = editor.view.dom
    const open = () => {
      const caret = editor.view.coordsAtPos(editor.state.selection.from)
      setHandleLocked(editor, true)
      setMenu({ kind: 'block', x: caret.left, y: caret.bottom + 4, blocks: targetBlocks(editor) })
    }
    dom.addEventListener(OPEN_BLOCK_MENU_EVENT, open)
    return () => dom.removeEventListener(OPEN_BLOCK_MENU_EVENT, open)
  }, [editor])

  // Right-click opens the block menu, with clipboard actions, where the pointer is.
  useEffect(() => {
    const dom = editor.view.dom
    const onContextMenu = (event: MouseEvent) => {
      const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!hit) return
      event.preventDefault()
      const block = blockAtPos(editor.state.doc, blockPosAt(editor.state.doc.resolve(hit.pos)))
      if (!block) return
      const selected = selectedBlocks(editor.state)
      const blocks = selected?.some((item) => item.pos === block.pos) ? selected : [block]
      setHandleLocked(editor, true)
      setMenu({ kind: 'context', x: event.clientX, y: event.clientY, blocks })
    }
    dom.addEventListener('contextmenu', onContextMenu)
    return () => dom.removeEventListener('contextmenu', onContextMenu)
  }, [editor])

  // Mark the block the menu is about, like Notion's selected-block tint.
  useEffect(() => {
    if (!menu) return
    const elements = menu.blocks.map((block) => editor.view.nodeDOM(block.pos) as HTMLElement | null)
    for (const el of elements) el?.classList.add('block-menu-target')
    return () => {
      for (const el of elements) el?.classList.remove('block-menu-target')
    }
  }, [editor, menu])

  return (
    <>
      <DragHandle
        editor={editor}
        nested={NESTED_BLOCKS}
        onNodeChange={onNodeChange}
        getReferencedVirtualElement={getHandleAnchor}
      >
        <div className="flex items-center">
          <div
            role="button"
            className={handleButtonClass}
            title={t('blockAddBelow')}
            onClick={(e) => openFromHandle('insert', e.currentTarget)}
          >
            <Plus className="size-4" />
          </div>
          <div
            role="button"
            className={`${handleButtonClass} cursor-grab`}
            title={t('blockDragHint')}
            onClick={(e) => openFromHandle('block', e.currentTarget)}
          >
            <GripVertical className="size-4" />
          </div>
        </div>
      </DragHandle>
      {menu && <BlockMenu editor={editor} menu={menu} notePath={notePath} onClose={closeMenu} />}
    </>
  )
}
