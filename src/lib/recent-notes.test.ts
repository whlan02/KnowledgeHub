import { beforeEach, describe, expect, it } from 'vitest'
import { loadRecent, pruneRecent, pushRecent, saveRecent } from '@/lib/recent-notes'

describe('recent notes', () => {
  beforeEach(() => localStorage.clear())

  it('puts the newest note first and does not repeat a note', () => {
    expect(pushRecent(['a.md', 'b.md'], 'b.md')).toEqual(['b.md', 'a.md'])
    expect(pushRecent(['a.md'], 'c.md')).toEqual(['c.md', 'a.md'])
  })

  it('keeps at most the limit, dropping the oldest', () => {
    const list = ['1', '2', '3']
    expect(pushRecent(list, '4', 3)).toEqual(['4', '1', '2'])
  })

  it('forgets notes that no longer exist', () => {
    expect(pruneRecent(['a.md', 'gone.md'], new Set(['a.md']))).toEqual(['a.md'])
  })

  it('stores one list per workspace', () => {
    saveRecent('/one', ['a.md'])
    saveRecent('/two', ['b.md'])
    expect(loadRecent('/one')).toEqual(['a.md'])
    expect(loadRecent('/two')).toEqual(['b.md'])
    expect(loadRecent('/three')).toEqual([])
  })
})
