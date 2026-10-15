import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranchMenu } from '@/components/git-branch-menu'
import { GitPanel } from '@/components/git-panel'
import { useGit } from '@/components/git-provider'
import { useGitTask } from '@/components/use-git-task'
import { gitInit } from '@/lib/backend'

function InitRepositoryButton({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const { busy, error, run } = useGitTask()
  const init = async () => {
    const done = await run(async () => {
      await gitInit()
      return true
    })
    if (done) onDone()
  }
  return (
    <footer className="flex h-7 shrink-0 select-none items-center gap-3 border-t px-3 text-xs text-muted-foreground">
      <span>{t('gitNotRepo')}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void init()}
        className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {t('gitInit')}
      </button>
      {error && <span className="truncate text-destructive">{error}</span>}
    </footer>
  )
}

/** Bottom bar: branch menu, number of changed files, and the source-control panel. */
export function GitStatusBar() {
  const { t } = useTranslation()
  const { status, isNotRepo, refresh } = useGit()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  if (isNotRepo) return <InitRepositoryButton onDone={() => void refresh()} />
  if (!status) return null
  const count = status.changes.length

  return (
    <footer className="relative flex h-7 shrink-0 select-none items-center gap-3 border-t px-1.5 text-xs text-muted-foreground">
      <GitBranchMenu />
      <button
        type="button"
        data-git-toggle
        onClick={() => setOpen((v) => !v)}
        className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
      >
        {count === 0 ? t('gitClean') : t('gitChanges', { count })}
      </button>
      {open && <GitPanel onClose={close} />}
    </footer>
  )
}
