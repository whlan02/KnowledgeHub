import { useTranslation } from 'react-i18next'
import { GitBranchMenu } from '@/components/git-branch-menu'
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

/** Bottom bar: branch menu and the number of changed files, which opens the source-control sidebar. */
export function GitStatusBar({ onShowChanges }: { onShowChanges: () => void }) {
  const { t } = useTranslation()
  const { status, isNotRepo, refresh } = useGit()

  if (isNotRepo) return <InitRepositoryButton onDone={() => void refresh()} />
  if (!status) return null
  const count = status.changes.length

  return (
    <footer className="flex h-7 shrink-0 select-none items-center gap-3 border-t px-1.5 text-xs text-muted-foreground">
      <GitBranchMenu />
      <button
        type="button"
        onClick={onShowChanges}
        className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
      >
        {count === 0 ? t('gitClean') : t('gitChanges', { count })}
      </button>
    </footer>
  )
}
