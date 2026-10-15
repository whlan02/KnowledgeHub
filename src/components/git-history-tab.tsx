import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, X } from 'lucide-react'
import { GitDiffView } from '@/components/git-diff-view'
import { GitKindBadge } from '@/components/git-kind-badge'
import { useGit } from '@/components/git-provider'
import { useGitTask } from '@/components/use-git-task'
import {
  confirmDialog,
  gitCommitDiff,
  gitCommitFiles,
  gitLog,
  gitRestoreVersion,
  type GitCommitFile,
  type GitCommitInfo,
} from '@/lib/backend'
import { errorMessage } from '@/lib/error-message'
import { formatRecentOpenedAt } from '@/lib/format-recent'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 100

/** Commits of the whole repository, or of one file when `path` is set. */
export function GitHistoryTab({ path, onClearPath }: { path: string | null; onClearPath: () => void }) {
  const { t, i18n } = useTranslation()
  const { status, refresh } = useGit()
  const { error, run } = useGitTask()
  const [commits, setCommits] = useState<GitCommitInfo[]>([])
  const [commit, setCommit] = useState<string | null>(null)
  const [files, setFiles] = useState<GitCommitFile[]>([])
  const [file, setFile] = useState<string | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [restored, setRestored] = useState<string | null>(null)

  useEffect(() => setCommit(null), [path])

  useEffect(() => {
    let isCurrent = true
    gitLog(path, PAGE_SIZE)
      .then((list) => isCurrent && setCommits(list))
      .catch(() => isCurrent && setCommits([]))
    return () => {
      isCurrent = false
    }
  }, [path, status])

  useEffect(() => {
    setFile(null)
    setDiff(null)
    setRestored(null)
    if (!commit) {
      setFiles([])
      return
    }
    let isCurrent = true
    gitCommitFiles(commit)
      .then((list) => {
        if (!isCurrent) return
        setFiles(list)
        const first = list.find((f) => f.path === path) ?? list[0]
        if (first) setFile(first.path)
      })
      .catch((err) => isCurrent && setDiffError(errorMessage(err)))
    return () => {
      isCurrent = false
    }
  }, [commit, path])

  useEffect(() => {
    if (!commit || !file) return
    let isCurrent = true
    setDiffError(null)
    gitCommitDiff(commit, file)
      .then((text) => isCurrent && setDiff(text))
      .catch((err) => isCurrent && setDiffError(errorMessage(err)))
    return () => {
      isCurrent = false
    }
  }, [commit, file])

  const restore = async () => {
    if (!commit || !file) return
    const ok = await confirmDialog(t('gitRestoreConfirm', { path: file }), t('gitRestore'), t('fileCancel'))
    if (!ok) return
    const done = await run(async () => {
      await gitRestoreVersion(commit, file)
      return true
    })
    if (done) {
      setRestored(file)
      void refresh()
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {path && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs">
          <span className="truncate text-muted-foreground">{t('gitFileHistory', { path })}</span>
          <button type="button" aria-label={t('gitAllHistory')} title={t('gitAllHistory')} onClick={onClearPath}>
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <ul className="min-h-24 flex-1 overflow-y-auto">
        {commits.length === 0 && <li className="px-3 py-4 text-xs text-muted-foreground">{t('gitNoCommits')}</li>}
        {commits.map((c) => (
          <li
            key={c.hash}
            onClick={() => setCommit(c.hash === commit ? null : c.hash)}
            className={cn('cursor-pointer px-3 py-1 text-xs hover:bg-muted', c.hash === commit && 'bg-muted')}
          >
            <div className="truncate">{c.summary}</div>
            <div className="flex gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">{c.short}</span>
              <span className="truncate">{c.author}</span>
              <span className="shrink-0">{formatRecentOpenedAt(c.time * 1000, i18n.language)}</span>
            </div>
          </li>
        ))}
      </ul>
      {commit && (
        <div className="shrink-0 border-t">
          <ul className="max-h-24 overflow-y-auto">
            {files.map((f) => (
              <li
                key={f.path}
                onClick={() => setFile(f.path)}
                className={cn('flex cursor-pointer items-center gap-2 px-3 py-0.5 text-xs hover:bg-muted', f.path === file && 'bg-muted')}
              >
                <GitKindBadge kind={f.kind} />
                <span className="truncate" title={f.path}>
                  {f.path}
                </span>
              </li>
            ))}
          </ul>
          <GitDiffView diff={diff} error={diffError} />
          {error && <p className="select-text whitespace-pre-wrap px-3 py-1 text-xs text-destructive">{error}</p>}
          {restored && <p className="px-3 py-1 text-xs text-muted-foreground">{t('gitRestored', { path: restored })}</p>}
          <div className="flex justify-end px-3 py-2">
            <button
              type="button"
              disabled={!file || files.find((f) => f.path === file)?.kind === 'deleted'}
              onClick={() => void restore()}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />
              {t('gitRestore')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
