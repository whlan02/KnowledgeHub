import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, GitBranch, Plus } from 'lucide-react'
import { useGit } from '@/components/git-provider'
import { useGitTask } from '@/components/use-git-task'
import { confirmDialog, gitBranches, gitCheckout, gitCreateBranch, type GitBranch as Branch } from '@/lib/backend'

/** Branch name in the status bar; click to search, switch or create. */
export function GitBranchMenu() {
  const { t } = useTranslation()
  const { status, refresh } = useGit()
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [query, setQuery] = useState('')
  const { error, run, clearError } = useGitTask()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    gitBranches().then(setBranches).catch(() => setBranches([]))
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const name = query.trim()
  const visible = branches.filter((b) => b.name.toLowerCase().includes(name.toLowerCase()))
  const canCreate = name !== '' && !branches.some((b) => b.name === name)
  const hasChanges = (status?.changes.length ?? 0) > 0

  const finish = async (task: () => Promise<unknown>) => {
    const done = await run(async () => {
      await task()
      return true
    })
    await refresh()
    if (!done) return
    setOpen(false)
    setQuery('')
  }

  const switchTo = async (branch: string) => {
    if (hasChanges && !(await confirmDialog(t('gitSwitchDirty', { branch }), t('gitSwitch'), t('fileCancel')))) return
    await finish(() => gitCheckout(branch))
  }

  const create = async () => {
    if (hasChanges && !(await confirmDialog(t('gitSwitchDirty', { branch: name }), t('gitCreateBranch'), t('fileCancel')))) return
    await finish(() => gitCreateBranch(name))
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => {
          clearError()
          setOpen((v) => !v)
        }}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
      >
        <GitBranch className="size-3.5" />
        {status?.branch ?? t('gitDetached')}
      </button>
      {open && (
        <div className="absolute bottom-7 left-0 z-50 w-64 rounded-lg border bg-popover text-popover-foreground shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              if (visible.length > 0) {
                if (!visible[0].current) void switchTo(visible[0].name)
              } else if (canCreate) void create()
            }}
            placeholder={t('gitBranchPlaceholder')}
            className="w-full rounded-t-lg border-b bg-transparent px-3 py-2 text-xs outline-none"
          />
          <ul className="max-h-52 overflow-y-auto py-1">
            {visible.map((b) => (
              <li key={b.name}>
                <button
                  type="button"
                  disabled={b.current}
                  onClick={() => void switchTo(b.name)}
                  className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <Check className={b.current ? 'size-3.5' : 'size-3.5 opacity-0'} />
                  <span className="truncate">{b.name}</span>
                </button>
              </li>
            ))}
            {canCreate && (
              <li>
                <button
                  type="button"
                  onClick={() => void create()}
                  className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-muted"
                >
                  <Plus className="size-3.5" />
                  <span className="truncate">{t('gitCreateBranchNamed', { name })}</span>
                </button>
              </li>
            )}
          </ul>
          {error && <p className="select-text whitespace-pre-wrap border-t px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  )
}
