import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Minus, Plus, Undo2 } from 'lucide-react'
import { GitCommitBox } from '@/components/git-commit-box'
import { GitDiffView } from '@/components/git-diff-view'
import { GitKindBadge } from '@/components/git-kind-badge'
import { useGit } from '@/components/git-provider'
import { useGitTask } from '@/components/use-git-task'
import {
  confirmDialog,
  gitDiff,
  gitDiscard,
  gitStage,
  gitUnstage,
  type GitChange,
  type GitChangeKind,
} from '@/lib/backend'
import { errorMessage } from '@/lib/error-message'
import { cn } from '@/lib/utils'

type Selection = { path: string; staged: boolean }

function RowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
    >
      {children}
    </button>
  )
}

type GroupProps = {
  title: string
  entries: { change: GitChange; kind: GitChangeKind }[]
  isStaged: boolean
  selected: Selection | null
  bulkLabel: string
  onBulk: () => void
  onSelect: (selection: Selection) => void
  onToggleStage: (change: GitChange) => void
  onDiscard: (change: GitChange) => void
  onHistory: (path: string) => void
}

function ChangeGroup(props: GroupProps) {
  const { t } = useTranslation()
  const { title, entries, isStaged, selected, bulkLabel, onBulk } = props
  if (entries.length === 0) return null
  return (
    <section>
      <div className="flex items-center justify-between px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>
          {title} ({entries.length})
        </span>
        <RowButton label={bulkLabel} onClick={onBulk}>
          {isStaged ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
        </RowButton>
      </div>
      <ul>
        {entries.map(({ change, kind }) => {
          const isSelected = selected?.path === change.path && selected.staged === isStaged
          return (
            <li
              key={change.path}
              onClick={() => props.onSelect({ path: change.path, staged: isStaged })}
              className={cn(
                'group flex cursor-pointer items-center gap-2 px-3 py-1 text-xs hover:bg-muted',
                isSelected && 'bg-muted',
              )}
            >
              <GitKindBadge kind={kind} />
              <span className="min-w-0 flex-1 truncate" title={change.path}>
                {change.path}
              </span>
              <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                <RowButton label={t('gitHistory')} onClick={() => props.onHistory(change.path)}>
                  <History className="size-3.5" />
                </RowButton>
                {!isStaged && (
                  <RowButton label={t('gitDiscard')} onClick={() => props.onDiscard(change)}>
                    <Undo2 className="size-3.5" />
                  </RowButton>
                )}
                <RowButton
                  label={isStaged ? t('gitUnstage') : t('gitStage')}
                  onClick={() => props.onToggleStage(change)}
                >
                  {isStaged ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
                </RowButton>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Staged / unstaged lists with per-file actions, an inline diff, and the commit box. */
export function GitChangesTab({ onShowHistory }: { onShowHistory: (path: string) => void }) {
  const { t } = useTranslation()
  const { status, refresh } = useGit()
  const { error, run } = useGitTask()
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Selection | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)

  const allChanges = status?.changes ?? []
  const changes = allChanges.filter((c) => c.path.toLowerCase().includes(filter.trim().toLowerCase()))
  const staged = changes.flatMap((change) => (change.staged ? [{ change, kind: change.staged }] : []))
  const unstaged = changes.flatMap((change) => (change.unstaged ? [{ change, kind: change.unstaged }] : []))

  const selectedChange = selected ? status?.changes.find((c) => c.path === selected.path) : undefined
  const selectedKind = selected?.staged ? selectedChange?.staged : selectedChange?.unstaged

  useEffect(() => {
    if (!selected || !selectedKind) {
      setDiff(null)
      return
    }
    let isCurrent = true
    setDiffError(null)
    gitDiff(selected.path, selected.staged, selectedKind === 'untracked')
      .then((text) => isCurrent && setDiff(text))
      .catch((err) => isCurrent && setDiffError(errorMessage(err)))
    return () => {
      isCurrent = false
    }
  }, [selected, selectedKind, status])

  const change = (task: () => Promise<unknown>) => run(task).then(refresh)

  const discard = async (target: GitChange) => {
    const ok = await confirmDialog(t('gitDiscardConfirm', { path: target.path }), t('gitDiscard'), t('fileCancel'))
    if (ok) await change(() => gitDiscard(target.path))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 py-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('gitFilterPlaceholder')}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="max-h-52 overflow-y-auto">
        <ChangeGroup
          title={t('gitStaged')}
          entries={staged}
          isStaged
          selected={selected}
          bulkLabel={t('gitUnstageAll')}
          onBulk={() => void change(() => gitUnstage(allChanges.filter((c) => c.staged).map((c) => c.path)))}
          onSelect={setSelected}
          onToggleStage={(c) => void change(() => gitUnstage([c.path]))}
          onDiscard={(c) => void discard(c)}
          onHistory={onShowHistory}
        />
        <ChangeGroup
          title={t('gitUnstaged')}
          entries={unstaged}
          isStaged={false}
          selected={selected}
          bulkLabel={t('gitStageAll')}
          onBulk={() => void change(() => gitStage(allChanges.filter((c) => c.unstaged).map((c) => c.path)))}
          onSelect={setSelected}
          onToggleStage={(c) => void change(() => gitStage([c.path]))}
          onDiscard={(c) => void discard(c)}
          onHistory={onShowHistory}
        />
        {changes.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">{t('gitClean')}</p>}
      </div>
      {error && <p className="select-text whitespace-pre-wrap px-3 py-1 text-xs text-destructive">{error}</p>}
      {selected && (
        <div className="border-t">
          <GitDiffView diff={diff} error={diffError} />
        </div>
      )}
      <GitCommitBox stagedCount={allChanges.filter((c) => c.staged).length} onCommitted={() => void refresh()} />
    </div>
  )
}
