import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitStatusBar } from '@/components/git-status-bar'

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  commit: vi.fn(),
  listeners: new Set<(paths: string[]) => void>(),
}))

vi.mock('@/lib/backend', () => ({ gitStatus: mocks.status, gitCommit: mocks.commit }))
vi.mock('@/components/notes-provider', () => ({
  useNotes: () => ({
    activeFolderId: '/ws',
    subscribeChanges: (listener: (paths: string[]) => void) => {
      mocks.listeners.add(listener)
      return () => mocks.listeners.delete(listener)
    },
  }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (options?.count ? `${key}:${options.count}` : key),
  }),
}))

const dirty = { branch: 'master', changes: [{ path: 'a.md', kind: 'modified' }] }

beforeEach(() => {
  mocks.status.mockReset()
  mocks.commit.mockReset()
  mocks.listeners.clear()
})
afterEach(cleanup)

describe('GitStatusBar', () => {
  it('shows nothing outside a Git repository', async () => {
    mocks.status.mockRejectedValue(new Error('NOT_A_REPO'))
    const { container } = render(<GitStatusBar />)
    await act(async () => {})
    expect(container.innerHTML).toBe('')
  })

  it('shows the branch and the number of changed files', async () => {
    mocks.status.mockResolvedValue(dirty)
    render(<GitStatusBar />)
    expect(await screen.findByText('master')).toBeTruthy()
    expect(screen.getByText('gitChanges:1')).toBeTruthy()
  })

  it('commits with the typed message and then reloads the status', async () => {
    mocks.status.mockResolvedValueOnce(dirty).mockResolvedValue({ branch: 'master', changes: [] })
    mocks.commit.mockResolvedValue(undefined)
    render(<GitStatusBar />)
    fireEvent.click(await screen.findByText('gitChanges:1'))
    const input = screen.getByPlaceholderText('gitMessagePlaceholder')
    const commit = screen.getByRole('button', { name: 'gitCommit' })
    expect((commit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'save notes' } })
    await act(async () => fireEvent.click(commit))
    expect(mocks.commit).toHaveBeenCalledWith('save notes')
    expect(await screen.findByText('gitClean')).toBeTruthy()
  })

  it('shows the error when the commit fails and keeps the panel open', async () => {
    mocks.status.mockResolvedValue(dirty)
    mocks.commit.mockRejectedValue(new Error('Author identity unknown'))
    render(<GitStatusBar />)
    fireEvent.click(await screen.findByText('gitChanges:1'))
    fireEvent.change(screen.getByPlaceholderText('gitMessagePlaceholder'), { target: { value: 'x' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'gitCommit' })))
    expect(screen.getByText('Author identity unknown')).toBeTruthy()
  })

  it('closes the panel when the change count is clicked again', async () => {
    mocks.status.mockResolvedValue(dirty)
    render(<GitStatusBar />)
    const toggle = await screen.findByText('gitChanges:1')
    const press = () => {
      fireEvent.pointerDown(toggle)
      fireEvent.click(toggle)
    }
    press()
    expect(screen.queryByPlaceholderText('gitMessagePlaceholder')).not.toBeNull()
    press()
    expect(screen.queryByPlaceholderText('gitMessagePlaceholder')).toBeNull()
  })
})
