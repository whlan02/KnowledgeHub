import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitChangesTab } from '@/components/git-changes-tab'
import { GitHistoryTab } from '@/components/git-history-tab'
import { cn } from '@/lib/utils'

type Tab = 'changes' | 'history'

/** Source-control view that takes the sidebar's place: changes (stage / commit) and history. */
export function GitPanel() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('changes')
  const [historyPath, setHistoryPath] = useState<string | null>(null)

  const showHistory = (path: string | null) => {
    setHistoryPath(path)
    setTab('history')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex border-b text-xs" role="tablist">
        {(['changes', 'history'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => (name === 'history' ? showHistory(null) : setTab(name))}
            className={cn(
              'px-4 py-2 text-muted-foreground hover:text-foreground',
              tab === name && 'border-b-2 border-primary font-medium text-foreground',
            )}
          >
            {t(name === 'changes' ? 'gitTabChanges' : 'gitTabHistory')}
          </button>
        ))}
      </div>
      {tab === 'changes' ? (
        <GitChangesTab onShowHistory={showHistory} />
      ) : (
        <GitHistoryTab path={historyPath} onClearPath={() => setHistoryPath(null)} />
      )}
    </div>
  )
}
