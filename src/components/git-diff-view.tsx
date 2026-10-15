import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { parseDiff } from '@/lib/git-diff'
import { cn } from '@/lib/utils'

const LINE_STYLE = {
  hunk: 'bg-muted text-muted-foreground',
  add: 'bg-green-500/15',
  del: 'bg-red-500/15',
  context: '',
} as const

const LINE_SIGN = { hunk: '', add: '+', del: '−', context: ' ' } as const

/** Inline (single-column) view of a unified diff. */
export function GitDiffView({ diff, error }: { diff: string | null; error?: string | null }) {
  const { t } = useTranslation()
  const lines = useMemo(() => parseDiff(diff ?? ''), [diff])

  if (error) return <p className="whitespace-pre-wrap p-3 text-xs text-destructive">{error}</p>
  if (diff === null) return null
  if (lines.length === 0) return <p className="p-3 text-xs text-muted-foreground">{t('gitNoDiff')}</p>

  return (
    <pre className="max-h-[40vh] overflow-auto py-1 font-mono text-[11px] leading-5">
      {lines.map((line, i) => (
        <div key={i} className={cn('whitespace-pre-wrap break-all px-3', LINE_STYLE[line.kind])}>
          <span className="mr-2 inline-block w-2 select-none text-muted-foreground">{LINE_SIGN[line.kind]}</span>
          {line.kind === 'hunk' ? line.text : line.text || ' '}
        </div>
      ))}
    </pre>
  )
}
