import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntryOperations } from '@/components/use-entry-operations'

const backend = vi.hoisted(() => ({
  files: {} as Record<string, string>,
  calls: [] as string[],
}))

vi.mock('@/lib/backend', () => ({
  createNoteFile: vi.fn(async (path: string) => void backend.calls.push(`create ${path}`)),
  createFolderEntry: vi.fn(async (path: string) => void backend.calls.push(`mkdir ${path}`)),
  deleteEntry: vi.fn(async (path: string) => void backend.calls.push(`delete ${path}`)),
  renameEntry: vi.fn(async (from: string, to: string) => {
    backend.calls.push(`rename ${from} ${to}`)
    for (const path of Object.keys(backend.files)) {
      if (path === from) {
        backend.files[to] = backend.files[path]
        delete backend.files[path]
      }
    }
  }),
  readNote: vi.fn(async (path: string) => backend.files[path]),
  writeNote: vi.fn(async (path: string, text: string) => {
    backend.files[path] = text
  }),
}))

const note = (path: string) => ({ id: path, path, title: path, folder: '' })

function setup() {
  const refresh = vi.fn(async () => {})
  const prepareToChangeFiles = vi.fn(async () => void backend.calls.push('flush'))
  const contentCacheRef = { current: new Map([['a.md', 'cached a'], ['b.md', 'cached b']]) }
  const { result } = renderHook(() =>
    useEntryOperations({
      notesRef: { current: [note('a.md'), note('b.md')] },
      foldersRef: { current: [] },
      contentCacheRef,
      prepareToChangeFiles,
      refresh,
    }),
  )
  return { ops: result.current, refresh, contentCacheRef }
}

beforeEach(() => {
  backend.calls.length = 0
  backend.files = { 'a.md': '# A', 'b.md': 'see [a](a.md#top)' }
})

describe('useEntryOperations', () => {
  it('renaming a note saves editors first, then rewrites links to it without asking', async () => {
    const { ops, refresh, contentCacheRef } = setup()
    await expect(ops.renameEntry('a.md', 'Alpha')).resolves.toBe('Alpha.md')
    expect(backend.calls).toEqual(['flush', 'rename a.md Alpha.md'])
    expect(backend.files['b.md']).toBe('see [a](Alpha.md#top)')
    expect(contentCacheRef.current.has('b.md')).toBe(false)
    expect(contentCacheRef.current.has('a.md')).toBe(false)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does nothing when the path stays the same', async () => {
    const { ops, refresh } = setup()
    await ops.moveEntry('a.md', '')
    expect(backend.calls).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
  })

  it('creates untitled notes with a free name', async () => {
    const { ops } = setup()
    await expect(ops.createNote('')).resolves.toBe('无标题.md')
    expect(backend.calls).toEqual(['create 无标题.md'])
  })
})
