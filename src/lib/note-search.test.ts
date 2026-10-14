import { describe, expect, it } from 'vitest'
import { highlightParts, noteScore, rankNotes } from '@/lib/note-search'

const note = (path: string, title: string) => ({ id: path, path, title, folder: '' })

const NOTES = [
  note('KnowledgeHub.md', 'KnowledgeHub'),
  note('guides/linking.md', 'Linking notes'),
  note('daily/2026-08-04.md', '学习记录'),
  note('rust-notes.md', 'Rust ownership'),
]

describe('rankNotes', () => {
  it('puts an exact title first, then prefix, then substring matches', () => {
    const notes = [note('c.md', 'my rust'), note('b.md', 'rusty nail'), note('a.md', 'Rust')]
    expect(rankNotes(notes, 'rust').map((n) => n.path)).toEqual(['a.md', 'b.md', 'c.md'])
  })

  it('matches on the path when the title does not', () => {
    expect(rankNotes(NOTES, 'guides').map((n) => n.path)).toEqual(['guides/linking.md'])
  })

  it('matches loosely, like typing the first letters', () => {
    expect(rankNotes(NOTES, 'khb').map((n) => n.path)).toEqual(['KnowledgeHub.md'])
  })

  it('finds Chinese titles', () => {
    expect(rankNotes(NOTES, '学习').map((n) => n.path)).toEqual(['daily/2026-08-04.md'])
  })

  it('returns everything for an empty query, limited', () => {
    expect(rankNotes(NOTES, '').length).toBe(4)
    expect(rankNotes(NOTES, '  ', 2).length).toBe(2)
  })

  it('returns nothing when nothing matches', () => {
    expect(rankNotes(NOTES, 'zzzz')).toEqual([])
    expect(noteScore(NOTES[0], 'zzzz')).toBe(0)
  })
})

describe('highlightParts', () => {
  it('marks every occurrence, ignoring case', () => {
    expect(highlightParts('Rust and rust', 'RUST')).toEqual([
      { text: 'Rust', match: true },
      { text: ' and ', match: false },
      { text: 'rust', match: true },
    ])
  })

  it('returns the text unchanged without a query or a match', () => {
    expect(highlightParts('plain', '')).toEqual([{ text: 'plain', match: false }])
    expect(highlightParts('plain', 'x')).toEqual([{ text: 'plain', match: false }])
  })
})
