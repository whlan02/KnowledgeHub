import type { Editor } from '@tiptap/core'

/**
 * The Markdown that gets saved for a note: no trailing blank lines (TipTap adds an empty
 * paragraph after a final list) and exactly one newline at the end, as Git expects.
 */
export function toNoteMarkdown(editor: Editor) {
  const markdown = editor.getMarkdown().trimEnd()
  return markdown ? `${markdown}\n` : ''
}
