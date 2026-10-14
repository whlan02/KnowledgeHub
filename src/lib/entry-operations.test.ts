import { describe, expect, it, vi } from 'vitest'
import { entryFileName, rewriteLinksAfterMove } from '@/lib/entry-operations'

/** In-memory notes keyed by their path after the move. */
function memoryIo(files: Record<string, string>, failOn?: string) {
  return {
    files,
    read: async (path: string) => {
      if (path === failOn) throw new Error('unreadable')
      return files[path]
    },
    write: async (path: string, text: string) => {
      files[path] = text
    },
  }
}

describe('rewriteLinksAfterMove', () => {
  it('rewrites only the notes that link to what moved and reports them', async () => {
    const io = memoryIo({ 'a.md': '[b](old.md)', 'c.md': 'no links' })
    const rewritten = await rewriteLinksAfterMove(['a.md', 'c.md'], 'old.md', 'new.md', io)
    expect(rewritten).toEqual(['a.md'])
    expect(io.files['a.md']).toBe('[b](new.md)')
  })

  it('reads moved notes from their new path', async () => {
    const io = memoryIo({ 'sub/x.md': '[b](b.md)' })
    const rewritten = await rewriteLinksAfterMove(['x.md'], 'x.md', 'sub/x.md', io)
    expect(rewritten).toEqual(['sub/x.md'])
    expect(io.files['sub/x.md']).toBe('[b](../b.md)')
  })

  it('skips a note it cannot read and carries on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const io = memoryIo({ 'a.md': '[t](old.md)', 'b.md': '[t](old.md)' }, 'a.md')
    expect(await rewriteLinksAfterMove(['a.md', 'b.md'], 'old.md', 'new.md', io)).toEqual(['b.md'])
  })
})

describe('entryFileName', () => {
  it('adds .md to note names only', () => {
    expect(entryFileName('Plan', true)).toBe('Plan.md')
    expect(entryFileName('Plan.MD', true)).toBe('Plan.MD')
    expect(entryFileName('Plan', false)).toBe('Plan')
  })
})
