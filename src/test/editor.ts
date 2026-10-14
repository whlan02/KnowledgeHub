import { Editor } from '@tiptap/core'
import { documentExtensions } from '@/lib/document-extensions'
import { flatBlocks, type BlockRef } from '@/lib/block-tree'
import { toNoteMarkdown } from '@/lib/note-markdown'

/** A headless editor holding `markdown`, with the same schema and Markdown rules as the app. */
export function createEditor(markdown = '') {
  return new Editor({
    extensions: documentExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
}

/** What the app would save for the editor's current content, without the final newline. */
export function markdownOf(editor: Editor) {
  return toNoteMarkdown(editor).trimEnd()
}

/** Parse Markdown into the editor and serialise it back, as opening and saving a note does. */
export function roundTrip(markdown: string) {
  const editor = createEditor(markdown)
  const out = markdownOf(editor)
  editor.destroy()
  return out
}

/** The blocks of the document with their plain text, handy for asserting on structure. */
export function describeBlocks(editor: Editor) {
  return flatBlocks(editor.state.doc).map((block) => `${block.node.type.name}:${block.node.textContent}`)
}

export function blockByText(editor: Editor, text: string): BlockRef {
  const block = flatBlocks(editor.state.doc).find((candidate) => candidate.node.textContent.startsWith(text))
  if (!block) throw new Error(`no block starting with "${text}"`)
  return block
}
