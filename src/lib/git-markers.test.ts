import { describe, expect, it } from 'vitest'
import { changeMarkers } from '@/lib/git-markers'

describe('changeMarkers', () => {
  it('marks changed files and every folder above them', () => {
    const markers = changeMarkers([
      { path: 'a/b/c.md', kind: 'untracked', staged: null, unstaged: 'untracked' },
      { path: 'top.md', kind: 'deleted', staged: null, unstaged: 'deleted' },
    ])
    expect(markers.get('a/b/c.md')).toBe('untracked')
    expect(markers.get('a/b')).toBe('modified')
    expect(markers.get('a')).toBe('modified')
    expect(markers.get('top.md')).toBe('deleted')
    expect(markers.has('b')).toBe(false)
  })

  it('has nothing to mark for a clean repository', () => {
    expect(changeMarkers([]).size).toBe(0)
  })
})
