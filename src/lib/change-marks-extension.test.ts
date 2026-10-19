import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { diffBlocks, topLevelMarkdown } from '@/lib/change-marks'
import { ChangeMarksExtension, setChangeMarks } from '@/lib/change-marks-extension'
import { documentExtensions } from '@/lib/document-extensions'

let editor: Editor

function open(markdown: string) {
  editor = new Editor({
    extensions: [...documentExtensions(), ChangeMarksExtension],
    content: markdown,
    contentType: 'markdown',
  })
  return editor
}

const marked = (name: string) => [...editor.view.dom.querySelectorAll(`.kh-change-${name}`)]

afterEach(() => editor.destroy())

describe('change marks in the editor', () => {
  it('classes added and modified blocks and puts a marker where a block was deleted', () => {
    open('one\n\nTWO\n\nthree\n\nnew\n')
    setChangeMarks(editor, diffBlocks(['one', 'two', 'three'], topLevelMarkdown(editor)))
    expect(marked('modified').map((el) => el.textContent)).toEqual(['TWO'])
    expect(marked('added').map((el) => el.textContent)).toEqual(['new'])
    expect(marked('deleted')).toHaveLength(0)

    setChangeMarks(editor, diffBlocks(['one', 'TWO', 'gone', 'three', 'new'], topLevelMarkdown(editor)))
    expect(marked('deleted')).toHaveLength(1)
  })

  it('shows nothing when cleared or when the marks belong to an older document', () => {
    open('one\n\ntwo\n')
    setChangeMarks(editor, { statuses: ['added', 'added'], deletions: [] })
    expect(marked('added')).toHaveLength(2)
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'paragraph' })
    expect(marked('added')).toHaveLength(0)
    setChangeMarks(editor, null)
    expect(marked('added')).toHaveLength(0)
  })
})
