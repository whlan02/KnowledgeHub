import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { deleteBlocks, moveBlocks } from '@/lib/block-actions'
import {
  blockEnd,
  blockPosAt,
  flatBlocks,
  isList,
  selectionInside,
  siblingBlock,
  siblingRun,
  type BlockRef,
} from '@/lib/block-tree'

/** Selected blocks as the two ends of a sibling run (block start positions). */
type BlockSelection = { anchor: number; head: number } | null

const blockSelectionKey = new PluginKey<BlockSelection>('blockSelection')

/** The selected blocks, or null when the user is editing text. */
export function selectedBlocks(state: EditorState): BlockRef[] | null {
  const selection = blockSelectionKey.getState(state)
  return selection ? siblingRun(state.doc, selection.anchor, selection.head) : null
}

/** The blocks a command should act on: the selected blocks, else the block holding the cursor. */
export function targetBlocks(editor: Editor): BlockRef[] {
  const selected = selectedBlocks(editor.state)
  if (selected?.length) return selected
  const pos = blockPosAt(editor.state.selection.$from)
  const node = editor.state.doc.nodeAt(pos)
  return node ? [{ pos, node }] : []
}

/** Select the sibling run between two blocks; both ends are lifted to a common level. */
export function setBlockSelection(view: EditorView, anchor: number, head: number) {
  const run = siblingRun(view.state.doc, anchor, head)
  const first = run[0]
  const last = run.at(-1)
  if (!first || !last) return
  const next = anchor <= head ? { anchor: first.pos, head: last.pos } : { anchor: last.pos, head: first.pos }
  view.dispatch(view.state.tr.setMeta(blockSelectionKey, next))
}

export function clearBlockSelection(view: EditorView) {
  if (blockSelectionKey.getState(view.state)) {
    view.dispatch(view.state.tr.setMeta(blockSelectionKey, null))
  }
}

function blockAtCoords(view: EditorView, event: MouseEvent) {
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
  return hit ? blockPosAt(view.state.doc.resolve(hit.pos)) : null
}

/** Move the head one step; a neighbouring list counts as its first or last item. */
function stepHead(view: EditorView, head: number, direction: -1 | 1) {
  const neighbour = siblingBlock(view.state.doc, head, direction)
  if (!neighbour) return head
  if (!isList(neighbour.node)) return neighbour.pos
  const items = siblingRun(view.state.doc, neighbour.pos + 1, neighbour.pos + 1)
  return (direction === 1 ? items[0] : items.at(-1))?.pos ?? head
}

/** Up/Down without Shift: jump to the previous or next block in reading order. */
function neighbourInDocument(view: EditorView, run: BlockRef[], direction: -1 | 1) {
  const blocks = flatBlocks(view.state.doc)
  const edge = direction === 1 ? run.at(-1) : run[0]
  const index = blocks.findIndex((block) => block.pos === edge?.pos)
  return blocks[index + direction]?.pos ?? edge?.pos ?? null
}

function copyRangeOf(view: EditorView, run: BlockRef[]) {
  const last = run.at(-1)
  if (!run[0] || !last) return
  const { doc } = view.state
  const selection = TextSelection.between(doc.resolve(run[0].pos + 1), doc.resolve(blockEnd(last) - 1))
  view.dispatch(view.state.tr.setSelection(selection))
}

/** Keys while blocks are selected. Returns true when the key was handled. */
function handleSelectedKey(editor: Editor, event: KeyboardEvent, run: BlockRef[]) {
  const { view } = editor
  const selection = blockSelectionKey.getState(view.state)
  if (!selection) return false
  const mod = event.ctrlKey || event.metaKey
  const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
  const direction = event.key === 'ArrowUp' ? -1 : 1

  if (event.key === 'Escape') {
    clearBlockSelection(view)
  } else if (event.key === 'Enter' && !mod) {
    clearBlockSelection(view)
    view.dispatch(view.state.tr.setSelection(selectionInside(view.state.doc, run[0].pos)))
  } else if (event.key === 'Backspace' || event.key === 'Delete') {
    clearBlockSelection(view)
    deleteBlocks(editor, run)
  } else if (vertical && mod && event.shiftKey) {
    const delta = moveBlocks(editor, run, direction)
    if (delta !== null) setBlockSelection(view, selection.anchor + delta, selection.head + delta)
  } else if (vertical && event.shiftKey) {
    setBlockSelection(view, selection.anchor, stepHead(view, selection.head, direction))
  } else if (vertical && !mod) {
    const target = neighbourInDocument(view, run, direction)
    if (target !== null) setBlockSelection(view, target, target)
  } else if ((event.key === 'c' || event.key === 'x') && mod) {
    copyRangeOf(view, run)
    return false
  } else if (event.key.length === 1 && !mod) {
    // Typing while blocks are selected must not touch the hidden caret.
  } else {
    return false
  }
  event.preventDefault()
  return true
}

/** Keys while editing text: Esc selects the block, Ctrl+Shift+Up/Down moves it. */
function handleEditingKey(editor: Editor, event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey
  if (event.key === 'Escape' && !mod && !event.shiftKey) {
    const pos = blockPosAt(editor.state.selection.$from)
    setBlockSelection(editor.view, pos, pos)
  } else if (mod && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    moveBlocks(editor, targetBlocks(editor), event.key === 'ArrowUp' ? -1 : 1)
  } else {
    return false
  }
  event.preventDefault()
  return true
}

/**
 * Shift-click selects every block between the caret's block and the clicked one;
 * a plain click leaves block selection.
 */
function handleMouseDown(view: EditorView, event: MouseEvent) {
  const selection = blockSelectionKey.getState(view.state)
  if (!event.shiftKey) {
    if (selection) clearBlockSelection(view)
    return false
  }
  const clicked = blockAtCoords(view, event)
  if (clicked === null) return false
  const anchor = selection?.anchor ?? blockPosAt(view.state.selection.$from)
  if (!selection && anchor === clicked) return false
  setBlockSelection(view, anchor, clicked)
  event.preventDefault()
  return true
}

/** Notion-style block selection: Esc, Shift-click, arrows, Delete, Ctrl+Shift+Up/Down. */
export const BlockSelection = Extension.create({
  name: 'blockSelection',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<BlockSelection>({
        key: blockSelectionKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(blockSelectionKey) as BlockSelection | undefined
            if (meta !== undefined) return meta
            if (!value) return value
            if (tr.selectionSet) return null
            if (!tr.docChanged) return value
            return { anchor: tr.mapping.map(value.anchor), head: tr.mapping.map(value.head) }
          },
        },
        props: {
          attributes: (state): Record<string, string> =>
            blockSelectionKey.getState(state) ? { class: 'has-block-selection' } : {},
          decorations(state) {
            const run = selectedBlocks(state)
            if (!run) return null
            return DecorationSet.create(
              state.doc,
              run.map((block) => Decoration.node(block.pos, blockEnd(block), { class: 'block-selected' })),
            )
          },
          handleKeyDown(view, event) {
            const run = selectedBlocks(view.state)
            return run?.length ? handleSelectedKey(editor, event, run) : handleEditingKey(editor, event)
          },
          handleTextInput: (view) => Boolean(blockSelectionKey.getState(view.state)),
          handleDOMEvents: {
            mousedown: (view, event) => handleMouseDown(view, event),
          },
        },
      }),
    ]
  },
})
