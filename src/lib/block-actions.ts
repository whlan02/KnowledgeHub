import type { Editor } from '@tiptap/core'
import type { Node as ProseNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import {
  blockPosAt,
  runSpan,
  selectionInside,
  type BlockRef,
} from '@/lib/block-tree'
import {
  isContainerBlock,
  turnIntoToggle,
  unwrapContainer,
  wrapInCallout,
} from '@/lib/block-containers'

export type BlockTypeId =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'todo'
  | 'bullet'
  | 'ordered'
  | 'toggle'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'

export type BlockType = {
  id: BlockTypeId
  labelKey: string
  /** Digit of the Ctrl+Shift+<digit> shortcut Notion uses for this type. */
  shortcutDigit?: number
  /** Extra words the slash menu matches, besides the translated label. */
  keywords: string[]
}

export const BLOCK_TYPES: BlockType[] = [
  { id: 'paragraph', labelKey: 'blockText', shortcutDigit: 0, keywords: ['text','paragraph','p','正文','文本'] },
  { id: 'h1', labelKey: 'blockHeading1', shortcutDigit: 1, keywords: ['h1','heading1','title','标题'] },
  { id: 'h2', labelKey: 'blockHeading2', shortcutDigit: 2, keywords: ['h2','heading2','标题'] },
  { id: 'h3', labelKey: 'blockHeading3', shortcutDigit: 3, keywords: ['h3','heading3','标题'] },
  { id: 'todo', labelKey: 'blockTodo', shortcutDigit: 4, keywords: ['todo','task','checkbox','check','待办','任务'] },
  { id: 'bullet', labelKey: 'blockBullet', shortcutDigit: 5, keywords: ['bullet','ul','list','unordered','无序','列表'] },
  { id: 'ordered', labelKey: 'blockOrdered', shortcutDigit: 6, keywords: ['numbered','ol','list','ordered','有序','列表'] },
  { id: 'toggle', labelKey: 'blockToggle', shortcutDigit: 7, keywords: ['toggle','details','collapse','fold','折叠','展开'] },
  { id: 'quote', labelKey: 'blockQuote', keywords: ['quote','blockquote','引用'] },
  { id: 'callout', labelKey: 'blockCallout', keywords: ['callout','note','alert','admonition','提示','注意'] },
  { id: 'code', labelKey: 'blockCode', shortcutDigit: 8, keywords: ['code','codeblock','代码'] },
  { id: 'divider', labelKey: 'blockDivider', keywords: ['divider','hr','line','rule','分隔','分割线'] },
]

const LIST_ITEM_NODES = ['listItem', 'taskItem']
const LIST_NODES = ['bulletList', 'orderedList', 'taskList']
const TEXT_LIKE_NODES = LIST_ITEM_NODES

/** True for blocks whose type can be switched (not tables, images or dividers). */
export function canTurnInto(node: ProseNode) {
  return node.isTextblock || isContainerBlock(node) || TEXT_LIKE_NODES.includes(node.type.name)
}

function selectInside(editor: Editor, pos: number) {
  editor.view.dispatch(editor.state.tr.setSelection(selectionInside(editor.state.doc, pos)))
}

function liftOutOfLists(editor: Editor) {
  for (let depth = 0; depth < 6 && LIST_NODES.some((name) => editor.isActive(name)); depth += 1) {
    const item = editor.isActive('taskList') ? 'taskItem' : 'listItem'
    if (!editor.commands.liftListItem(item)) break
  }
}

function alreadyIs(editor: Editor, type: BlockTypeId) {
  switch (type) {
    case 'bullet':
      return editor.isActive('bulletList')
    case 'ordered':
      return editor.isActive('orderedList')
    case 'todo':
      return editor.isActive('taskList')
    default:
      return false
  }
}

/** The block is already a quote, callout or toggle and `type` asks for the same. */
function alreadyContainer(node: ProseNode, type: BlockTypeId) {
  const containers: Partial<Record<BlockTypeId, string>> = {
    quote: 'blockquote',
    callout: 'callout',
    toggle: 'details',
  }
  return containers[type] === node.type.name
}

/** Convert the block at `pos` to another type, the way Notion's "Turn into" does. */
export function turnInto(editor: Editor, pos: number, type: BlockTypeId) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || alreadyContainer(node, type)) return

  selectInside(editor, unwrapContainer(editor, pos))
  if (alreadyIs(editor, type)) return

  liftOutOfLists(editor)

  const commands = editor.commands
  switch (type) {
    case 'paragraph':
      commands.setParagraph()
      break
    case 'h1':
    case 'h2':
    case 'h3':
      commands.setHeading({ level: Number(type.slice(1)) as 1 | 2 | 3 })
      break
    case 'code':
      commands.setCodeBlock()
      break
    case 'quote':
      commands.setParagraph()
      commands.toggleBlockquote()
      break
    case 'callout':
      wrapInCallout(editor)
      break
    case 'toggle':
      turnIntoToggle(editor)
      break
    case 'bullet':
      commands.setParagraph()
      commands.toggleBulletList()
      break
    case 'ordered':
      commands.setParagraph()
      commands.toggleOrderedList()
      break
    case 'todo':
      commands.setParagraph()
      commands.toggleTaskList()
      break
    case 'divider':
      break
  }
  editor.commands.focus()
}

/** Insert a new block of `type` right after the block at `pos` and put the cursor in it. */
export function insertBelow(editor: Editor, pos: number, type: BlockTypeId) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  const end = pos + node.nodeSize

  if (type === 'divider') {
    editor.chain().insertContentAt(end, { type: 'horizontalRule' }).focus().run()
    return
  }

  const isListItem = LIST_ITEM_NODES.includes(node.type.name)
  const empty = isListItem
    ? { type: node.type.name, content: [{ type: 'paragraph' }] }
    : { type: 'paragraph' }
  editor.chain().insertContentAt(end, empty).run()
  turnInto(editor, end, type)
}

/** Turn every block into `type`. Later blocks go first so earlier positions stay valid. */
export function turnIntoBlocks(editor: Editor, blocks: BlockRef[], type: BlockTypeId) {
  for (const block of [...blocks].reverse()) turnInto(editor, block.pos, type)
}

/** Copy a run of sibling blocks and insert the copy right after it. */
export function duplicateBlocks(editor: Editor, blocks: BlockRef[]) {
  const span = runSpan(editor.state.doc, blocks)
  if (!span) return
  const copy = editor.state.doc.slice(span.start, span.end).content.toJSON()
  editor.chain().insertContentAt(span.end, copy).focus().run()
}

/** Delete a run of sibling blocks; a list or document left empty goes away or gets a blank line. */
export function deleteBlocks(editor: Editor, blocks: BlockRef[]) {
  const { doc, tr } = editor.state
  const span = runSpan(doc, blocks)
  if (!span) return
  if (span.coversParent && span.parentDepth === 0) {
    tr.replaceWith(0, doc.content.size, editor.schema.nodes.paragraph.create())
  } else if (span.coversParent) {
    tr.delete(span.parentStart, span.parentEnd)
  } else {
    tr.delete(span.start, span.end)
  }
  editor.view.dispatch(tr)
  editor.commands.focus()
}

/**
 * Swap a run of sibling blocks with the block above or below it. Returns how far the run moved,
 * or null when it is already at the edge.
 */
export function moveBlocks(editor: Editor, blocks: BlockRef[], direction: -1 | 1) {
  const { doc, tr, selection } = editor.state
  const span = runSpan(doc, blocks)
  const neighbour = direction === -1 ? span?.previous : span?.next
  if (!span || !neighbour) return null
  const size = neighbour.node.nodeSize
  const cursorOffset = selection.from - span.start

  tr.delete(neighbour.pos, neighbour.pos + size)
  tr.insert(direction === -1 ? span.end - size : span.start, neighbour.node)
  const delta = direction * size
  const caret = Math.min(span.start + delta + cursorOffset, tr.doc.content.size)
  editor.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(caret), 1)))
  return delta
}

/** Markdown link to a heading in this note, or null if the block is not a heading with an id. */
export function headingLink(editor: Editor, pos: number, notePath: string) {
  const node = editor.state.doc.nodeAt(pos)
  if (node?.type.name !== 'heading') return null
  const id = (editor.view.nodeDOM(pos) as HTMLElement | null)?.id
  if (!id) return null
  const fileName = notePath.split('/').pop() ?? notePath
  return `[${node.textContent}](${fileName}#${id})`
}

/** Move the cursor back into the block after a menu closes. */
export function restoreCursor(editor: Editor, pos: number) {
  if (pos < 0 || pos > editor.state.doc.content.size) return
  selectInside(editor, pos)
  editor.commands.focus()
}

/** Position of the block the cursor is in: the innermost list item, else the top-level block. */
export function currentBlockPos(editor: Editor) {
  return blockPosAt(editor.state.selection.$from)
}
