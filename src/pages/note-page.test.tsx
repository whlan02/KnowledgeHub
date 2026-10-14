import { act, cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotePage } from '@/pages/note-page'

const { state, editorCalls, pending } = vi.hoisted(() => ({
  state: {
    notes: [] as { id: string; path: string; title: string; folder: string }[],
    activeFolderId: null as string | null,
    loadNoteContent: (_path: string) => Promise.resolve<string | null>(null),
  },
  editorCalls: [] as { notePath: string; initialContent: string }[],
  pending: new Map<string, (text: string | null) => void>(),
}))

vi.mock('@/components/notes-provider', () => ({ useNotes: () => state }))
vi.mock('@/components/table-of-contents', () => ({ TableOfContents: () => null }))
vi.mock('@/components/note-editor', () => ({
  NoteEditor: (props: { notePath: string; initialContent: string }) => {
    editorCalls.push({ notePath: props.notePath, initialContent: props.initialContent })
    return (
      <div data-testid="editor">
        {props.notePath}|{props.initialContent}
      </div>
    )
  },
}))

const note = (path: string) => ({ id: path, path, title: path, folder: '' })

function openRouter(path: string) {
  const router = createMemoryRouter([{ path: 'n/*', element: <NotePage /> }], {
    initialEntries: [path],
  })
  render(<RouterProvider router={router} />)
  return router
}

/** Let the pending read for `path` finish with `text`. */
async function finishLoading(path: string, text: string | null) {
  await act(async () => {
    pending.get(path)?.(text)
  })
}

beforeEach(() => {
  editorCalls.length = 0
  pending.clear()
  state.notes = [note('a.md'), note('b.md')]
  state.activeFolderId = '/workspace-1'
  state.loadNoteContent = (path) => new Promise((resolve) => pending.set(path, resolve))
})

afterEach(cleanup)

describe('NotePage', () => {
  it('shows the editor with the note body once it has loaded', async () => {
    openRouter('/n/a.md')
    expect(screen.queryByTestId('editor')).toBeNull()
    await finishLoading('a.md', 'body of a')
    expect(screen.getByTestId('editor').textContent).toBe('a.md|body of a')
  })

  it('never gives the next note the previous note body while it loads', async () => {
    const router = openRouter('/n/a.md')
    await finishLoading('a.md', 'body of a')

    await act(async () => {
      await router.navigate('/n/b.md')
    })
    // b.md has not finished loading: the editor must not exist, rather than hold a.md's text.
    expect(screen.queryByTestId('editor')).toBeNull()
    expect(editorCalls).not.toContainEqual({ notePath: 'b.md', initialContent: 'body of a' })

    await finishLoading('b.md', 'body of b')
    expect(screen.getByTestId('editor').textContent).toBe('b.md|body of b')
    expect(editorCalls).not.toContainEqual({ notePath: 'b.md', initialContent: 'body of a' })
  })

  it('does not reuse a body from another workspace with the same note path', async () => {
    const router = openRouter('/n/a.md')
    await finishLoading('a.md', 'a from workspace 1')

    const rendersBefore = editorCalls.length
    state.activeFolderId = '/workspace-2'
    await act(async () => {
      await router.navigate('/n/a.md?refresh=1')
    })
    expect(editorCalls.slice(rendersBefore)).not.toContainEqual({
      notePath: 'a.md',
      initialContent: 'a from workspace 1',
    })
    expect(screen.queryByTestId('editor')).toBeNull()

    await finishLoading('a.md', 'a from workspace 2')
    expect(screen.getByTestId('editor').textContent).toBe('a.md|a from workspace 2')
  })

  it('ignores a slow read for a note the user already left', async () => {
    const router = openRouter('/n/a.md')
    await act(async () => {
      await router.navigate('/n/b.md')
    })
    await finishLoading('b.md', 'body of b')
    await finishLoading('a.md', 'late body of a')
    expect(screen.getByTestId('editor').textContent).toBe('b.md|body of b')
  })

  it('shows "not found" for an unknown note and for one that cannot be read', async () => {
    openRouter('/n/missing.md')
    expect(screen.queryByTestId('editor')).toBeNull()
    cleanup()

    openRouter('/n/a.md')
    await finishLoading('a.md', null)
    expect(screen.queryByTestId('editor')).toBeNull()
    expect(screen.getByText('noteNotFound')).toBeTruthy()
  })
})
