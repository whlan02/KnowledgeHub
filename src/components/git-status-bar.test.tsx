import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitProvider } from '@/components/git-provider'
import { GitStatusBar } from '@/components/git-status-bar'

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  commit: vi.fn(),
  init: vi.fn(),
  stage: vi.fn(),
  unstage: vi.fn(),
  discard: vi.fn(),
  diff: vi.fn(),
  log: vi.fn(),
  branches: vi.fn(),
  checkout: vi.fn(),
  createBranch: vi.fn(),
  confirm: vi.fn(),
  listeners: new Set<(paths: string[]) => void>(),
}))

vi.mock('@/lib/backend', () => ({
  gitStatus: mocks.status,
  gitCommit: mocks.commit,
  gitInit: mocks.init,
  gitStage: mocks.stage,
  gitUnstage: mocks.unstage,
  gitDiscard: mocks.discard,
  gitDiff: mocks.diff,
  gitLog: mocks.log,
  gitBranches: mocks.branches,
  gitCheckout: mocks.checkout,
  gitCreateBranch: mocks.createBranch,
  confirmDialog: mocks.confirm,
}))
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
    i18n: { language: 'en' },
  }),
}))

const modified = { path: 'a.md', kind: 'modified', staged: null, unstaged: 'modified' }
const stagedFile = { path: 'a.md', kind: 'modified', staged: 'modified', unstaged: null }
const dirty = { branch: 'master', changes: [modified] }

function renderBar() {
  return render(
    <GitProvider>
      <GitStatusBar />
    </GitProvider>,
  )
}

async function openPanel() {
  fireEvent.click(await screen.findByText('gitChanges:1'))
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) if ('mockReset' in mock) mock.mockReset()
  mocks.listeners.clear()
  mocks.diff.mockResolvedValue('@@ -1 +1 @@\n-old\n+new\n')
  mocks.log.mockResolvedValue([])
  mocks.branches.mockResolvedValue([{ name: 'master', current: true }, { name: 'draft', current: false }])
})
afterEach(cleanup)

describe('GitStatusBar', () => {
  it('shows nothing while the status is unknown', async () => {
    mocks.status.mockRejectedValue(new Error('boom'))
    const { container } = renderBar()
    await act(async () => {})
    expect(container.innerHTML).toBe('')
  })

  it('offers to initialize a repository when the folder is not one', async () => {
    mocks.status.mockRejectedValueOnce(new Error('NOT_A_REPO')).mockResolvedValue({ branch: 'master', changes: [] })
    mocks.init.mockResolvedValue(undefined)
    renderBar()
    const init = await screen.findByText('gitInit')
    await act(async () => fireEvent.click(init))
    expect(mocks.init).toHaveBeenCalled()
    expect(await screen.findByText('gitClean')).toBeTruthy()
  })

  it('shows the branch and the number of changed files', async () => {
    mocks.status.mockResolvedValue(dirty)
    renderBar()
    expect(await screen.findByText('master')).toBeTruthy()
    expect(screen.getByText('gitChanges:1')).toBeTruthy()
  })

  it('lists unstaged changes and stages one, then reloads the status', async () => {
    mocks.status.mockResolvedValueOnce(dirty).mockResolvedValue({ branch: 'master', changes: [stagedFile] })
    mocks.stage.mockResolvedValue(undefined)
    renderBar()
    await openPanel()
    expect(screen.getByText('gitUnstaged (1)')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'gitStage' })))
    expect(mocks.stage).toHaveBeenCalledWith(['a.md'])
    expect(await screen.findByText('gitStaged (1)')).toBeTruthy()
  })

  it('shows the diff of a selected file', async () => {
    mocks.status.mockResolvedValue(dirty)
    renderBar()
    await openPanel()
    await act(async () => fireEvent.click(screen.getByText('a.md')))
    expect(mocks.diff).toHaveBeenCalledWith('a.md', false, false)
    expect(await screen.findByText('new')).toBeTruthy()
  })

  it('discards only after the user confirms', async () => {
    mocks.status.mockResolvedValue(dirty)
    mocks.discard.mockResolvedValue(undefined)
    mocks.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    renderBar()
    await openPanel()
    const discard = screen.getByRole('button', { name: 'gitDiscard' })
    await act(async () => fireEvent.click(discard))
    expect(mocks.discard).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(discard))
    expect(mocks.discard).toHaveBeenCalledWith('a.md')
  })

  it('commits the staged files with summary and description, then reloads', async () => {
    mocks.status.mockResolvedValueOnce({ branch: 'master', changes: [stagedFile] }).mockResolvedValue({ branch: 'master', changes: [] })
    mocks.commit.mockResolvedValue(undefined)
    renderBar()
    await openPanel()
    const commit = screen.getByRole('button', { name: /gitCommit/ })
    expect((commit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('gitSummaryPlaceholder'), { target: { value: 'save notes' } })
    fireEvent.change(screen.getByPlaceholderText('gitDescriptionPlaceholder'), { target: { value: 'details' } })
    await act(async () => fireEvent.click(commit))
    expect(mocks.commit).toHaveBeenCalledWith('save notes\n\ndetails', false)
    expect((await screen.findAllByText('gitClean')).length).toBeGreaterThan(0)
  })

  it('cannot commit with nothing staged unless amending', async () => {
    mocks.status.mockResolvedValue(dirty)
    mocks.log.mockResolvedValue([{ hash: 'abc', short: 'abc', author: 'me', time: 0, summary: 'last one' }])
    renderBar()
    await openPanel()
    fireEvent.change(screen.getByPlaceholderText('gitSummaryPlaceholder'), { target: { value: 'x' } })
    const commit = screen.getByRole('button', { name: /gitCommit/ }) as HTMLButtonElement
    expect(commit.disabled).toBe(true)
    await act(async () => fireEvent.click(screen.getByLabelText('gitAmend')))
    expect(commit.disabled).toBe(false)
  })

  it('shows the error when the commit fails and keeps the panel open', async () => {
    mocks.status.mockResolvedValue({ branch: 'master', changes: [stagedFile] })
    mocks.commit.mockRejectedValue(new Error('Author identity unknown'))
    renderBar()
    await openPanel()
    fireEvent.change(screen.getByPlaceholderText('gitSummaryPlaceholder'), { target: { value: 'x' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /gitCommit/ })))
    expect(screen.getByText('Author identity unknown')).toBeTruthy()
  })

  it('closes the panel when the change count is clicked again', async () => {
    mocks.status.mockResolvedValue(dirty)
    renderBar()
    const toggle = await screen.findByText('gitChanges:1')
    const press = () => {
      fireEvent.pointerDown(toggle)
      fireEvent.click(toggle)
    }
    press()
    expect(screen.queryByPlaceholderText('gitSummaryPlaceholder')).not.toBeNull()
    press()
    expect(screen.queryByPlaceholderText('gitSummaryPlaceholder')).toBeNull()
  })

  it('switches branch after confirming because changes are uncommitted', async () => {
    mocks.status.mockResolvedValue(dirty)
    mocks.checkout.mockResolvedValue(undefined)
    mocks.confirm.mockResolvedValue(true)
    renderBar()
    fireEvent.click(await screen.findByText('master'))
    const draft = await screen.findByText('draft')
    await act(async () => fireEvent.click(draft))
    expect(mocks.confirm).toHaveBeenCalled()
    expect(mocks.checkout).toHaveBeenCalledWith('draft')
  })

  it('creates a branch from a name that does not exist yet', async () => {
    mocks.status.mockResolvedValue({ branch: 'master', changes: [] })
    mocks.createBranch.mockResolvedValue(undefined)
    renderBar()
    fireEvent.click(await screen.findByText('master'))
    fireEvent.change(await screen.findByPlaceholderText('gitBranchPlaceholder'), { target: { value: 'ideas' } })
    await act(async () => fireEvent.click(screen.getByText('gitCreateBranchNamed')))
    expect(mocks.createBranch).toHaveBeenCalledWith('ideas')
  })
})
