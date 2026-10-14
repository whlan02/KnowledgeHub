import type { Node as ProseNode, ResolvedPos } from '@tiptap/pm/model'
import { Selection } from '@tiptap/pm/state'

/**
 * What the editor treats as a "block": every top-level node except lists, and every list item
 * (nested ones too). A list item owns its nested lists, so selecting it selects them as well.
 */
export type BlockRef = { pos: number; node: ProseNode }

const LIST_NODES = ['bulletList', 'orderedList', 'taskList']
const LIST_ITEM_NODES = ['listItem', 'taskItem']

export const isList = (node: ProseNode) => LIST_NODES.includes(node.type.name)
export const isListItem = (node: ProseNode) => LIST_ITEM_NODES.includes(node.type.name)

export const blockEnd = (block: BlockRef) => block.pos + block.node.nodeSize

/** Start position of the innermost block around `$pos`. */
export function blockPosAt($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    if (isListItem($pos.node(depth))) return $pos.before(depth)
  }
  return $pos.depth >= 1 ? $pos.before(1) : $pos.pos
}

export function blockAtPos(doc: ProseNode, pos: number): BlockRef | null {
  const node = doc.nodeAt(pos)
  return node ? { pos, node } : null
}

/** Every block in document order. */
export function flatBlocks(doc: ProseNode): BlockRef[] {
  const out: BlockRef[] = []
  const visit = (node: ProseNode, pos: number) => {
    if (isList(node)) {
      node.forEach((item, offset) => visit(item, pos + 1 + offset))
    } else if (isListItem(node)) {
      out.push({ pos, node })
      node.forEach((child, offset) => {
        if (isList(child)) visit(child, pos + 1 + offset)
      })
    } else {
      out.push({ pos, node })
    }
  }
  doc.forEach((child, offset) => visit(child, offset))
  return out
}

/** Children of the node around `$pos` as blocks; lists are replaced by their items. */
function expandChildren(parent: ProseNode, parentStart: number, from: number, to: number) {
  const blocks: BlockRef[] = []
  let pos = parentStart
  parent.forEach((child, _offset, index) => {
    if (index >= from && index <= to) {
      if (isList(child)) {
        child.forEach((item, itemOffset) => blocks.push({ pos: pos + 1 + itemOffset, node: item }))
      } else {
        blocks.push({ pos, node: child })
      }
    }
    pos += child.nodeSize
  })
  return blocks
}

/**
 * The run of sibling blocks from block `a` to block `b`. When they have different parents the
 * run is lifted to their closest common level, like Notion's shift-click.
 */
export function siblingRun(doc: ProseNode, a: number, b: number): BlockRef[] {
  const $a = doc.resolve(a)
  const $b = doc.resolve(b)
  const depth = $a.sharedDepth(b)
  const first = Math.min($a.index(depth), $b.index(depth))
  const last = Math.max($a.index(depth), $b.index(depth))
  return expandChildren($a.node(depth), $a.start(depth), first, last)
}

/**
 * The whole-node extent of a run of blocks: for a run that mixes a heading and a list's items,
 * the heading and the entire list. This is what moving, copying and deleting operate on.
 */
export type RunSpan = {
  start: number
  end: number
  previous: BlockRef | null
  next: BlockRef | null
  /** Depth of the node holding the run (0 is the document). */
  parentDepth: number
  /** The run is every child of its parent. */
  coversParent: boolean
  /** Position just before the run's parent node, when it has one. */
  parentStart: number
  parentEnd: number
}

export function runSpan(doc: ProseNode, blocks: BlockRef[]): RunSpan | null {
  const first = blocks[0]
  const last = blocks.at(-1)
  if (!first || !last) return null
  const $first = doc.resolve(first.pos)
  const $last = doc.resolve(last.pos)
  const depth = $first.sharedDepth(last.pos)
  const from = Math.min($first.index(depth), $last.index(depth))
  const to = Math.max($first.index(depth), $last.index(depth))
  const parent = $first.node(depth)

  const span: RunSpan = {
    start: 0,
    end: 0,
    previous: null,
    next: null,
    parentDepth: depth,
    coversParent: from === 0 && to === parent.childCount - 1,
    parentStart: depth > 0 ? $first.before(depth) : 0,
    parentEnd: depth > 0 ? $first.after(depth) : doc.content.size,
  }
  let pos = $first.start(depth)
  parent.forEach((child, _offset, index) => {
    if (index === from - 1) span.previous = { pos, node: child }
    if (index === from) span.start = pos
    if (index === to) span.end = pos + child.nodeSize
    if (index === to + 1) span.next = { pos, node: child }
    pos += child.nodeSize
  })
  return span
}

/** The block before or after the one at `pos`, inside the same parent. */
export function siblingBlock(doc: ProseNode, pos: number, direction: -1 | 1): BlockRef | null {
  const $pos = doc.resolve(pos)
  const target = $pos.index() + direction
  if (target < 0 || target >= $pos.parent.childCount) return null
  let childPos = $pos.start()
  for (let i = 0; i < target; i += 1) childPos += $pos.parent.child(i).nodeSize
  return { pos: childPos, node: $pos.parent.child(target) }
}

/** Caret position just inside the block at `pos`. */
export function selectionInside(doc: ProseNode, pos: number) {
  return Selection.near(doc.resolve(Math.min(pos + 1, doc.content.size)), 1)
}
