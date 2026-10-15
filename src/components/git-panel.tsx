import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitChangesTab } from '@/components/git-changes-tab'
import { GitHistoryTab } from '@/components/git-history-tab'
import { cn } from '@/lib/utils'

type Tab = 'changes' | 'history'

/** Source-control popover above the status bar: changes (stage / commit) and history. */
export function GitPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('changes')
  const [historyPath, setHistoryPath] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element
      if (!panelRef.current?.contains(target) && !target.closest('[data-git-toggle]')) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const showHistory = (path: string | null) => {
    setHistoryPath(path)
    setTab('history')
  }

  return (
    <div
      ref={panelRef}
      className="absolute bottom-8 left-2 z-50 flex max-h-[75vh] w-[560px] max-w-[calc(100vw-1rem)] flex-col rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {tab === 'changes' ? (
          <GitChangesTab onShowHistory={showHistory} />
        ) : (
          <GitHistoryTab path={historyPath} onClearPath={() => setHistoryPath(null)} />
        )}
      </div>
    </div>
  )
}
