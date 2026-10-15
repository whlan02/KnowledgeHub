import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { RecentNotes } from '@/components/recent-notes'

const state = vi.hoisted(() => ({
  notes: [] as { path: string; title: string }[],
  notesPaths: new Set<string>(),
  activeFolderId: '/ws',
}))
vi.mock('@/components/notes-provider', () => ({ useNotes: () => state }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

let go: (to: string) => void = () => {}
function Harness() {
  const navigate = useNavigate()
  go = navigate
  return <RecentNotes />
}

const open = (to: string) => act(async () => go(to))
const titles = () => screen.queryAllByRole('link').map((a) => a.textContent)

beforeEach(() => {
  localStorage.clear()
  const paths = Array.from({ length: 9 }, (_, i) => `n${i}.md`)
  state.notes = paths.map((path) => ({ path, title: `Note ${path}` }))
  state.notesPaths = new Set(paths)
})
afterEach(cleanup)

describe('RecentNotes', () => {
  it('lists opened notes newest first, without repeats, at most seven', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(titles()).toEqual([])
    for (let i = 0; i < 9; i += 1) await open(`/n/n${i}.md`)
    await open('/n/n5.md')
    expect(titles()).toEqual(['Note n5.md', 'Note n8.md', 'Note n7.md', 'Note n6.md', 'Note n4.md', 'Note n3.md', 'Note n2.md'])
  })
})
