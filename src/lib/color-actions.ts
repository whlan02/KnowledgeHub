import type { Editor } from '@tiptap/core'
import { COLOR_MARK_NAMES } from '@/lib/color-marks'
import { isList, type BlockRef } from '@/lib/block-tree'
import { saveLastColor, type ColorChoice, type ColorTarget } from '@/lib/colors'

type Range = { from: number; to: number }

/** Text of a block that belongs to it: its own lines, not the lists nested inside a list item. */
function textRanges(block: BlockRef): Range[] {
  const { pos, node } = block
  if (node.isTextblock) return [{ from: pos + 1, to: pos + node.nodeSize - 1 }]
  const ranges: Range[] = []
  node.descendants((child, offset) => {
    if (isList(child)) return false
    if (child.isTextblock && !child.type.spec.code) {
      const from = pos + 1 + offset + 1
      ranges.push({ from, to: from + child.content.size })
    }
    return !child.isTextblock
  })
  return ranges
}

function setColorOnRanges(editor: Editor, ranges: Range[], target: ColorTarget, color: ColorChoice) {
  const type = editor.schema.marks[COLOR_MARK_NAMES[target]]
  const { tr } = editor.state
  for (const { from, to } of ranges) {
    if (from >= to) continue
    if (color === 'default') tr.removeMark(from, to, type)
    else tr.addMark(from, to, type.create({ color }))
  }
  editor.view.dispatch(tr)
}

/** Colour the selected text. */
export function colorSelection(editor: Editor, target: ColorTarget, color: ColorChoice) {
  const { from, to } = editor.state.selection
  setColorOnRanges(editor, [{ from, to }], target, color)
  saveLastColor({ target, color })
  editor.commands.focus()
}

/** Colour all the text of whole blocks, which is what a block-level colour means in Markdown. */
export function colorBlocks(editor: Editor, blocks: BlockRef[], target: ColorTarget, color: ColorChoice) {
  setColorOnRanges(
    editor,
    blocks.flatMap((block) => textRanges(block)),
    target,
    color,
  )
  saveLastColor({ target, color })
  editor.commands.focus()
}
