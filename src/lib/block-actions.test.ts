import { describe, expect, it } from 'vitest'
import {
  deleteBlocks,
  duplicateBlocks,
  moveBlocks,
  turnInto,
  turnIntoBlocks,
} from '@/lib/block-actions'
import { runSpan, siblingRun } from '@/lib/block-tree'
import { blockByText, createEditor, describeBlocks, markdownOf } from '@/test/editor'

const DOC = [
  '# Title',
  '',
  'intro',
  '',
  '## Section',
  '',
  '- alpha',
  '- beta',
  '- gamma',
  '',
  '## Next',
  '',
  'outro',
].join('\n')

describe('turnInto', () => {
  it('turns a paragraph into a heading', () => {
    const editor = createEditor(DOC)
    turnInto(editor, blockByText(editor, 'intro').pos, 'h2')
    expect(markdownOf(editor)).toContain('## intro')
  })

  it('lifts a list item out of its list when it becomes a heading', () => {
    const editor = createEditor(DOC)
    turnInto(editor, blockByText(editor, 'beta').pos, 'h3')
    const markdown = markdownOf(editor)
    expect(markdown).toContain('### beta')
    expect(markdown).toContain('- alpha')
    expect(markdown).toContain('- gamma')
  })

  it('wraps a paragraph in a callout and unwraps it again', () => {
    const editor = createEditor(DOC)
    turnInto(editor, blockByText(editor, 'intro').pos, 'callout')
    expect(markdownOf(editor)).toContain('> [!NOTE]\n> intro')
    turnInto(editor, blockByText(editor, 'intro').pos, 'paragraph')
    expect(markdownOf(editor)).not.toContain('[!NOTE]')
    expect(describeBlocks(editor)).toContain('paragraph:intro')
  })

  it('keeps everything inside a callout when turning it into text', () => {
    const editor = createEditor('> [!TIP]\n> first\n>\n> second')
    turnInto(editor, 0, 'paragraph')
    expect(describeBlocks(editor)).toEqual(['paragraph:first', 'paragraph:second'])
  })

  it('turns a paragraph into a toggle whose title is its text', () => {
    const editor = createEditor(DOC)
    turnInto(editor, blockByText(editor, 'outro').pos, 'toggle')
    expect(markdownOf(editor)).toContain('<details>\n<summary>outro</summary>')
  })

  it('turns a toggle back into plain blocks', () => {
    const editor = createEditor('<details>\n<summary>Title</summary>\n\nbody\n\n</details>')
    turnInto(editor, 0, 'paragraph')
    expect(describeBlocks(editor)).toEqual(['paragraph:Title', 'paragraph:body'])
  })

  it('does nothing when the block already has that type', () => {
    const editor = createEditor('> [!NOTE]\n> text')
    const before = markdownOf(editor)
    turnInto(editor, 0, 'callout')
    expect(markdownOf(editor)).toBe(before)
  })

  it('applies to every block of a selection', () => {
    const editor = createEditor('one\n\ntwo\n\nthree')
    const blocks = [blockByText(editor, 'one'), blockByText(editor, 'two')]
    turnIntoBlocks(editor, blocks, 'h2')
    expect(markdownOf(editor)).toBe('## one\n\n## two\n\nthree')
  })
})

describe('deleteBlocks', () => {
  it('removes a block', () => {
    const editor = createEditor(DOC)
    deleteBlocks(editor, [blockByText(editor, 'intro')])
    expect(describeBlocks(editor)).not.toContain('paragraph:intro')
  })

  it('removes the whole list when its only item is deleted', () => {
    const editor = createEditor('before\n\n- only\n\nafter')
    deleteBlocks(editor, [blockByText(editor, 'only')])
    expect(markdownOf(editor)).toBe('before\n\nafter')
  })

  it('keeps the rest of a list when one item is deleted', () => {
    const editor = createEditor(DOC)
    deleteBlocks(editor, [blockByText(editor, 'beta')])
    expect(markdownOf(editor)).toContain('- alpha\n- gamma')
  })

  it('leaves one empty paragraph when everything is deleted', () => {
    const editor = createEditor('one\n\ntwo')
    deleteBlocks(editor, [blockByText(editor, 'one'), blockByText(editor, 'two')])
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph')
    expect(editor.state.doc.textContent).toBe('')
  })
})

describe('duplicateBlocks', () => {
  it('inserts a copy right after a block', () => {
    const editor = createEditor('one\n\ntwo')
    duplicateBlocks(editor, [blockByText(editor, 'one')])
    expect(markdownOf(editor)).toBe('one\n\none\n\ntwo')
  })

  it('copies a heading together with the list below it as one unit', () => {
    const editor = createEditor('## Head\n\n- a\n- b\n\nend')
    const run = siblingRun(editor.state.doc, blockByText(editor, 'Head').pos, blockByText(editor, 'b').pos)
    duplicateBlocks(editor, run)
    expect(markdownOf(editor)).toBe('## Head\n\n- a\n- b\n\n## Head\n\n- a\n- b\n\nend')
  })

  it('copies a list item inside its list', () => {
    const editor = createEditor('- a\n- b')
    duplicateBlocks(editor, [blockByText(editor, 'a')])
    expect(markdownOf(editor)).toBe('- a\n- a\n- b')
  })
})

describe('moveBlocks', () => {
  it('moves a block down past its neighbour', () => {
    const editor = createEditor('one\n\ntwo\n\nthree')
    expect(moveBlocks(editor, [blockByText(editor, 'one')], 1)).not.toBeNull()
    expect(markdownOf(editor)).toBe('two\n\none\n\nthree')
  })

  it('moves a block up', () => {
    const editor = createEditor('one\n\ntwo\n\nthree')
    moveBlocks(editor, [blockByText(editor, 'three')], -1)
    expect(markdownOf(editor)).toBe('one\n\nthree\n\ntwo')
  })

  it('does not move past the edge of the document', () => {
    const editor = createEditor('one\n\ntwo')
    expect(moveBlocks(editor, [blockByText(editor, 'one')], -1)).toBeNull()
    expect(moveBlocks(editor, [blockByText(editor, 'two')], 1)).toBeNull()
    expect(markdownOf(editor)).toBe('one\n\ntwo')
  })

  it('reorders items inside a list', () => {
    const editor = createEditor('- a\n- b\n- c')
    moveBlocks(editor, [blockByText(editor, 'a')], 1)
    expect(markdownOf(editor)).toBe('- b\n- a\n- c')
  })

  it('does not move a list item out of its list', () => {
    const editor = createEditor('before\n\n- a\n- b')
    expect(moveBlocks(editor, [blockByText(editor, 'a')], -1)).toBeNull()
  })

  it('moves a run that mixes a heading and a whole list', () => {
    const editor = createEditor('first\n\n## Head\n\n- a\n- b\n\nlast')
    const run = siblingRun(editor.state.doc, blockByText(editor, 'Head').pos, blockByText(editor, 'b').pos)
    moveBlocks(editor, run, 1)
    expect(markdownOf(editor)).toBe('first\n\nlast\n\n## Head\n\n- a\n- b')
    const moved = siblingRun(editor.state.doc, blockByText(editor, 'Head').pos, blockByText(editor, 'b').pos)
    moveBlocks(editor, moved, -1)
    expect(markdownOf(editor)).toBe('first\n\n## Head\n\n- a\n- b\n\nlast')
  })
})

describe('block tree', () => {
  it('lifts a run across different parents to their common level', () => {
    const editor = createEditor(DOC)
    const run = siblingRun(editor.state.doc, blockByText(editor, 'intro').pos, blockByText(editor, 'beta').pos)
    expect(run.map((block) => block.node.textContent)).toEqual(['intro', 'Section', 'alpha', 'beta', 'gamma'])
  })

  it('reports whether a run covers its whole parent', () => {
    const editor = createEditor('- a\n- b\n\nend')
    const both = [blockByText(editor, 'a'), blockByText(editor, 'b')]
    expect(runSpan(editor.state.doc, both)?.coversParent).toBe(true)
    expect(runSpan(editor.state.doc, [both[0]])?.coversParent).toBe(false)
  })
})
