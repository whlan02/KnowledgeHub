import type { Editor } from '@tiptap/core'
import { Fragment, type Node as ProseNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { CalloutType } from '@/lib/callout'

/** Blocks that hold other blocks: quotes, callouts and toggles. */
const CONTAINER_NODES = ['blockquote', 'callout', 'details']

export const isContainerBlock = (node: ProseNode) => CONTAINER_NODES.includes(node.type.name)

/** Replace a quote, callout or toggle by what is inside it; returns where the first block now is. */
export function unwrapContainer(editor: Editor, pos: number) {
  const { doc, tr, schema } = editor.state
  const node = doc.nodeAt(pos)
  if (!node || !isContainerBlock(node)) return pos

  let content: Fragment = node.content
  if (node.type.name === 'details') {
    const title = schema.nodes.paragraph.create(null, node.child(0).content)
    content = Fragment.from(title).append(node.child(1).content)
  }
  editor.view.dispatch(tr.replaceWith(pos, pos + node.nodeSize, content))
  return pos
}

export function wrapInCallout(editor: Editor, type: CalloutType = 'note') {
  editor.commands.wrapIn('callout', { type })
}

/** Turn the text block holding the caret into a toggle whose title is that text, then open it. */
export function turnIntoToggle(editor: Editor) {
  const { selection, tr, schema } = editor.state
  const { $from } = selection
  const block = $from.parent
  if (!block.isTextblock || block.type.name === 'detailsSummary') return

  const from = $from.before()
  const toggle = schema.nodes.details.create(null, [
    schema.nodes.detailsSummary.create(null, block.content),
    schema.nodes.detailsContent.create(null, schema.nodes.paragraph.create()),
  ])
  tr.replaceWith(from, $from.after(), toggle)
  const endOfTitle = from + 2 + block.content.size
  editor.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(endOfTitle))))
  const dom = editor.view.nodeDOM(from)
  if (dom instanceof HTMLElement) dom.querySelector<HTMLButtonElement>(':scope > button')?.click()
}

export function setCalloutType(editor: Editor, pos: number, type: CalloutType) {
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { type }))
}

/** Change the type of the callout around the caret. */
export function setCalloutTypeAtCaret(editor: Editor, type: CalloutType) {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    if ($from.node(depth).type.name === 'callout') {
      setCalloutType(editor, $from.before(depth), type)
      return
    }
  }
}
