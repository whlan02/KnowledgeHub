import { describe, expect, it } from 'vitest'
import { imageFileName, insertImageBlock, isImageFile, markdownImageSrc } from '@/lib/image-upload'
import { createEditor, markdownOf } from '@/test/editor'

const file = (name: string, type: string) => new File(['x'], name, { type })
const AT = new Date(2026, 7, 4, 9, 5, 7)

describe('image upload helpers', () => {
  it('recognises image files by type', () => {
    expect(isImageFile(file('a.png', 'image/png'))).toBe(true)
    expect(isImageFile(file('a.svg', 'image/svg+xml'))).toBe(true)
    expect(isImageFile(file('a.pdf', 'application/pdf'))).toBe(false)
    expect(isImageFile(file('a.txt', ''))).toBe(false)
  })

  it('keeps the name of a real file', () => {
    expect(imageFileName(file('holiday photo.jpg', 'image/jpeg'), AT)).toBe('holiday photo.jpg')
  })

  it('gives a pasted screenshot a timestamped name with the right extension', () => {
    expect(imageFileName(file('image.png', 'image/png'), AT)).toBe('image-20260804-090507.png')
    expect(imageFileName(file('', 'image/jpeg'), AT)).toBe('image-20260804-090507.jpg')
    expect(imageFileName(file('image.webp', 'image/webp'), AT)).toBe('image-20260804-090507.webp')
  })

  it('percent-encodes each path segment for Markdown', () => {
    expect(markdownImageSrc('assets/my pic (1).png')).toBe('assets/my%20pic%20(1).png')
    expect(markdownImageSrc('assets/图片.png')).toBe('assets/%E5%9B%BE%E7%89%87.png')
  })
})

describe('insertImageBlock', () => {
  /** Insert an image where the caret would be right after `textBefore`. */
  const insert = (markdown: string, textBefore: string) => {
    const editor = createEditor(markdown)
    let pos = 0
    editor.state.doc.descendants((node, at) => {
      if (node.isText && node.text?.includes(textBefore)) {
        pos = at + node.text.indexOf(textBefore) + textBefore.length
      }
    })
    const image = editor.state.schema.nodes.image.create({ src: 'assets/p.png', alt: 'p' })
    insertImageBlock(editor.view, image, pos)
    return markdownOf(editor)
  }

  it('puts the image after the paragraph instead of splitting it', () => {
    expect(insert('before and after\n\nnext', 'before')).toBe(
      'before and after\n\n![p](assets/p.png)\n\nnext',
    )
  })

  it('does not split a heading either', () => {
    expect(insert('# Title\n\ntext', 'Ti')).toBe('# Title\n\n![p](assets/p.png)\n\ntext')
  })

  it('replaces an empty paragraph', () => {
    const editor = createEditor('one')
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'paragraph' })
    const emptyAt = editor.state.doc.content.size - 1
    const image = editor.state.schema.nodes.image.create({ src: 'assets/p.png', alt: 'p' })
    insertImageBlock(editor.view, image, emptyAt)
    expect(markdownOf(editor)).toBe('one\n\n![p](assets/p.png)')
  })
})
