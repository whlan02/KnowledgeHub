import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCommitHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGitTask } from '@/components/use-git-task'
import { gitCommit, gitLog } from '@/lib/backend'
import { composeCommitMessage, SUMMARY_LIMIT, summaryOverflow } from '@/lib/git-diff'

/** Summary + description, amend toggle; commits what is staged and never pushes. */
export function GitCommitBox({ stagedCount, onCommitted }: { stagedCount: number; onCommitted: () => void }) {
  const { t } = useTranslation()
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [amend, setAmend] = useState(false)
  const { busy, error, run } = useGitTask()

  const canCommit = !busy && summary.trim() !== '' && (stagedCount > 0 || amend)
  const overflow = summaryOverflow(summary)

  const commit = async () => {
    if (!canCommit) return
    const done = await run(async () => {
      await gitCommit(composeCommitMessage(summary, description), amend)
      return true
    })
    if (!done) return
    setSummary('')
    setDescription('')
    setAmend(false)
    onCommitted()
  }

  const toggleAmend = async (next: boolean) => {
    setAmend(next)
    if (!next || summary) return
    const [last] = await gitLog(null, 1).catch(() => [])
    if (last) setSummary(last.summary)
  }

  return (
    <div className="space-y-2 border-t p-3">
      <div className="relative">
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void commit()
          }}
          placeholder={t('gitSummaryPlaceholder')}
          className="w-full rounded-md border bg-background py-1.5 pl-2 pr-14 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <span
          className={`absolute right-2 top-1/2 -translate-y-1/2 text-[11px] ${overflow ? 'text-destructive' : 'text-muted-foreground'}`}
          title={t('gitSummaryLimit', { count: SUMMARY_LIMIT })}
        >
          {summary.length}/{SUMMARY_LIMIT}
        </span>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void commit()
        }}
        rows={2}
        placeholder={t('gitDescriptionPlaceholder')}
        className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      {error && <p className="max-h-20 select-text overflow-auto whitespace-pre-wrap text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={amend} onChange={(e) => void toggleAmend(e.target.checked)} />
          {t('gitAmend')}
        </label>
        <Button size="sm" disabled={!canCommit} onClick={() => void commit()} title="Ctrl+Enter">
          <GitCommitHorizontal className="size-3.5" />
          {t('gitCommit')} ({stagedCount})
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('gitLocalOnly')}</p>
    </div>
  )
}
