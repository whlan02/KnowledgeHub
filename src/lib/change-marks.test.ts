import { describe, expect, it } from 'vitest'
import { diffBlocks, markdownBlocks, topLevelMarkdown } from '@/lib/change-marks'
import { createEditor } from '@/test/editor'

describe('diffBlocks', () => {
  it('marks nothing when nothing changed', () => {
    expect(diffBlocks(['a', 'b'], ['a', 'b'])).toEqual({ statuses: ['same', 'same'], deletions: [] })
  })

  it('marks an inserted block as added', () => {
    expect(diffBlocks(['a', 'c'], ['a', 'b', 'c'])).toEqual({ statuses: ['same', 'added', 'same'], deletions: [] })
  })

  it('marks an edited block as modified', () => {
    expect(diffBlocks(['a', 'b', 'c'], ['a', 'B', 'c'])).toEqual({ statuses: ['same', 'modified', 'same'], deletions: [] })
  })

  it('puts a deletion marker before the block that follows the removed one', () => {
    expect(diffBlocks(['a', 'b', 'c'], ['a', 'c'])).toEqual({ statuses: ['same', 'same'], deletions: [1] })
  })

  it('puts a deletion marker at the end when the last block was removed', () => {
    expect(diffBlocks(['a', 'b'], ['a'])).toEqual({ statuses: ['same'], deletions: [1] })
  })

  it('treats a replaced run as modified plus the surplus as added or deleted', () => {
    expect(diffBlocks(['x', 'a', 'b', 'y'], ['x', 'A', 'y'])).toEqual({
      statuses: ['same', 'modified', 'same'],
      deletions: [2],
    })
    expect(diffBlocks(['x', 'a', 'y'], ['x', 'A', 'B', 'y'])).toEqual({
      statuses: ['same', 'modified', 'added', 'same'],
      deletions: [],
    })
  })

  it('shows a brand-new file as all added, and an emptied one as one deletion', () => {
    expect(diffBlocks([], ['a', 'b']).statuses).toEqual(['added', 'added'])
    expect(diffBlocks(['a', 'b'], [])).toEqual({ statuses: [], deletions: [0] })
  })

  it('skips huge comparisons instead of freezing', () => {
    const many = Array.from({ length: 3000 }, (_, i) => `block ${i}`)
    expect(diffBlocks(many, [...many].reverse()).statuses.every((s) => s === 'same')).toBe(true)
  })
})

describe('markdown blocks', () => {
  it('splits a note into one entry per top-level block', () => {
    expect(markdownBlocks('# Title\n\nText here\n\n- a\n- b\n')).toEqual(['# Title', 'Text here', '- a\n- b'])
  })

  it('ignores formatting differences that parse to the same blocks', () => {
    expect(markdownBlocks('* a\n* b\n\nSay _hi_\n')).toEqual(markdownBlocks('- a\n- b\n\nSay *hi*\n'))
  })

  it('matches what the live editor yields for the same text', () => {
    const editor = createEditor('# Title\n\nText *here*\n')
    expect(topLevelMarkdown(editor)).toEqual(markdownBlocks('# Title\n\nText *here*\n'))
    editor.destroy()
  })
})
