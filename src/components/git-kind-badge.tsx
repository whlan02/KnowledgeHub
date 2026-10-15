import { useTranslation } from 'react-i18next'
import type { GitChangeKind } from '@/lib/backend'
import { KIND_COLOR } from '@/lib/git-markers'
import { cn } from '@/lib/utils'

const LETTER: Record<GitChangeKind, string> = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R', untracked: 'U' }

/** One-letter status (M / A / D / R / U) coloured by kind, with the full word on hover. */
export function GitKindBadge({ kind }: { kind: GitChangeKind }) {
  const { t } = useTranslation()
  return (
    <span title={t(`gitKind_${kind}`)} className={cn('w-4 shrink-0 text-center text-[11px] font-semibold', KIND_COLOR[kind])}>
      {LETTER[kind]}
    </span>
  )
}
