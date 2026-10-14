import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, GitCommitHorizontal } from 'lucide-react'
import { useNotes } from '@/components/notes-provider'
import { Button } from '@/components/ui/button'
import { gitCommit, gitStatus, type GitChange, type GitStatus } from '@/lib/backend'

const REFRESH_DELAY_MS = 600

/** `null` while unknown or when the workspace is not a Git repository. */
function useGitStatus() {
  const { activeFolderId, subscribeChanges } = useNotes()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const timerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await gitStatus())
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [activeFolderId, refresh])

  useEffect(
    () =>
      subscribeChanges(() => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => void refresh(), REFRESH_DELAY_MS)
      }),
    [subscribeChanges, refresh],
  )

  return { status, refresh }
}

function ChangeRow({ change }: { change: GitChange }) {
  const { t } = useTranslation()
  return (
    <li className="flex items-center gap-2 px-3 py-1 text-xs">
      <span className="w-14 shrink-0 text-muted-foreground">{t(`gitKind_${change.kind}`)}</span>
      <span className="truncate" title={change.path}>
        {change.path}
      </span>
    </li>
  )
}

function CommitPanel({
  changes,
  onCommitted,
  onClose,
}: {
  changes: GitChange[]
  onCommitted: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  const commit = async () => {
    setBusy(true)
    setError(null)
    try {
      await gitCommit(message)
      onCommitted()
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      ref={panelRef}
      className="absolute bottom-8 left-2 z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
      <ul className="max-h-60 overflow-y-auto py-1">
        {changes.map((change) => (
          <ChangeRow key={change.path} change={change} />
        ))}
      </ul>
      <div className="space-y-2 border-t p-3">
        <input
          autoFocus
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && message.trim() && !busy) void commit()
            if (e.key === 'Escape') onClose()
          }}
          placeholder={t('gitMessagePlaceholder')}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        {error && <p className="max-h-20 overflow-auto whitespace-pre-wrap text-xs text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{t('gitLocalOnly')}</span>
          <Button size="sm" disabled={busy || !message.trim()} onClick={() => void commit()}>
            <GitCommitHorizontal className="size-3.5" />
            {t('gitCommit')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Bottom bar: current branch, number of changed files, and a local commit panel. */
export function GitStatusBar() {
  const { t } = useTranslation()
  const { status, refresh } = useGitStatus()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  if (!status) return null
  const count = status.changes.length

  return (
    <footer className="relative flex h-7 shrink-0 select-none items-center gap-3 border-t px-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <GitBranch className="size-3.5" />
        {status.branch ?? t('gitDetached')}
      </span>
      <button
        type="button"
        disabled={count === 0}
        onClick={() => setOpen((v) => !v)}
        className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        {count === 0 ? t('gitClean') : t('gitChanges', { count })}
      </button>
      {open && count > 0 && (
        <CommitPanel
          changes={status.changes}
          onClose={close}
          onCommitted={() => {
            close()
            void refresh()
          }}
        />
      )}
    </footer>
  )
}
