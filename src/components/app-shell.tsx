import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, ChevronDown, FilePlus, Files, FolderOpen, GitBranch, FolderPlus, Search, Languages, Moon, PanelLeft, RotateCcw, Sun, X } from 'lucide-react'
import i18n from '@/i18n'
import { useTheme } from '@/components/theme-provider'
import { useNotes } from '@/components/notes-provider'
import { FileTree } from '@/components/file-tree'
import { GitPanel } from '@/components/git-panel'
import { GitStatusBar } from '@/components/git-status-bar'
import { QuickOpen } from '@/components/quick-open'
import { RecentNotes } from '@/components/recent-notes'
import { useFileActions } from '@/components/use-file-actions'
import { WindowControls } from '@/components/window-controls'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { formatRecentOpenedAt } from '@/lib/format-recent'
import { parentOf } from '@/lib/path-ops'
import { cn } from '@/lib/utils'

export function AppShell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { resolved, setTheme } = useTheme()
  const {
    folderLabel,
    isDefaultWorkspace,
    recentFolders,
    activeFolderId,
    openFolder,
    openRecentFolder,
    removeRecentFolderEntry,
    clearRecentFolderHistory,
    openDefaultWorkspace,
  } = useNotes()
  const fileActions = useFileActions()
  const [renameRequest, setRenameRequest] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarMode, setSidebarMode] = useState<'files' | 'git'>('files')
  const [searchOpen, setSearchOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const setLang = (lng: 'zh' | 'en') => {
    localStorage.setItem('kh-lang', lng)
    void i18n.changeLanguage(lng)
  }

  // Ctrl+P opens the quick switcher and note search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'p') return
      event.preventDefault()
      setSearchOpen((open) => !open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Ctrl+N starts a note next to the one that is open.
  const { newNote, openPath } = fileActions
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'n') return
      event.preventDefault()
      void newNote(openPath ? parentOf(openPath) : '')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [newNote, openPath])

  const onOpenFolder = async () => {
    try {
      setBusy(true)
      await openFolder()
      navigate('/', { replace: true })
    } catch (err) {
      console.error(err)
      window.alert(t('folderPickFailed'))
    } finally {
      setBusy(false)
    }
  }

  const onOpenRecent = async (id: string) => {
    try {
      setBusy(true)
      await openRecentFolder(id)
      navigate('/', { replace: true })
    } catch (err) {
      const message = (err as Error)?.message
      if (message === 'RECENT_FOLDER_MISSING') {
        window.alert(t('recentFolderMissing'))
      } else {
        console.error(err)
        window.alert(t('folderPickFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const onRemoveRecent = async (id: string) => {
    try {
      setBusy(true)
      await removeRecentFolderEntry(id)
      if (activeFolderId === id) navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  const onClearRecent = async () => {
    try {
      setBusy(true)
      await clearRecentFolderHistory()
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  const onReset = async () => {
    setBusy(true)
    try {
      await openDefaultWorkspace()
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <header
        data-tauri-drag-region
        className="flex h-12 shrink-0 select-none items-center gap-2 border-b px-3"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? t('collapseSidebar') : t('expandSidebar')}
        >
          <PanelLeft />
        </Button>
        <div data-tauri-drag-region className="pointer-events-none flex items-center gap-2">
          <BookOpen className="size-4 text-muted-foreground" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">{t('appName')}</div>
            <div className="text-[11px] text-muted-foreground">{t('appSubtitle')}</div>
          </div>
        </div>
        <div data-tauri-drag-region className="flex-1 self-stretch" />
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <div className="flex items-center">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void onOpenFolder()}
                className="gap-1.5 rounded-r-none border-r-0 pr-2"
              >
                <FolderOpen className="size-3.5" />
                {t('openFolder')}
              </Button>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="rounded-l-none px-1.5"
                  aria-label={t('recentFolders')}
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </div>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onClick={() => void onOpenFolder()}>
                <FolderOpen className="mr-2 size-4 opacity-70" />
                {t('openFolderChoose')}
              </DropdownMenuItem>
              {recentFolders.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>{t('recentFolders')}</DropdownMenuLabel>
                  {recentFolders.map((entry) => (
                    <DropdownMenuItem
                      key={entry.id}
                      className="group flex items-center gap-2 pr-1"
                      onClick={() => void onOpenRecent(entry.id)}
                    >
                      <FolderOpen
                        className={cn(
                          'size-4 shrink-0 opacity-70',
                          entry.id === activeFolderId && 'text-primary',
                        )}
                      />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium leading-tight">{entry.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatRecentOpenedAt(entry.openedAt, i18n.language)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="rounded-sm p-1 opacity-0 transition-opacity hover:bg-muted group-focus-within:opacity-100 group-hover:opacity-100"
                          aria-label={t('removeFromRecent')}
                          title={t('removeFromRecent')}
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation()
                            void onRemoveRecent(entry.id)
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-muted-foreground"
                      onClick={() => void onClearRecent()}
                    >
                      {t('clearRecentFolders')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          {!isDefaultWorkspace && (
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              onClick={() => void onReset()}
              aria-label={t('resetFolder')}
              title={t('resetFolder')}
            >
              <RotateCcw />
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('language')}>
                <Languages />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setLang('zh')}>中文</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLang('en')}>English</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            aria-label={resolved === 'dark' ? t('themeLight') : t('themeDark')}
            title={resolved === 'dark' ? t('themeLight') : t('themeDark')}
            onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
          >
            {resolved === 'dark' ? <Moon /> : <Sun />}
          </Button>
        </div>
        <WindowControls />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'flex shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200',
            !sidebarOpen ? 'w-0 overflow-hidden border-r-0' : sidebarMode === 'git' ? 'w-[380px]' : 'w-[280px]',
          )}
        >
          <div className="flex shrink-0 gap-1 border-b px-2 py-1.5">
            {(
              [
                ['files', Files, t('files')],
                ['git', GitBranch, t('gitPanelTitle')],
              ] as const
            ).map(([mode, Icon, label]) => (
              <Button
                key={mode}
                variant={sidebarMode === mode ? 'secondary' : 'ghost'}
                size="icon"
                className="size-7"
                aria-label={label}
                title={label}
                onClick={() => setSidebarMode(mode)}
              >
                <Icon />
              </Button>
            ))}
          </div>
          {sidebarMode === 'git' ? (
            <GitPanel />
          ) : (
            <>
          <div className="flex items-center gap-1 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium tracking-wide text-muted-foreground">{t('files')}</div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground/80" title={folderLabel}>
                {folderLabel}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('searchTitle')}
              title={`${t('searchTitle')} (Ctrl+P)`}
              onClick={() => setSearchOpen(true)}
            >
              <Search />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('fileNewNote')}
              title={`${t('fileNewNote')} (Ctrl+N)`}
              onClick={() => void fileActions.newNote('')}
            >
              <FilePlus />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('fileNewFolder')}
              title={t('fileNewFolder')}
              onClick={() => void fileActions.newFolder('').then(setRenameRequest)}
            >
              <FolderPlus />
            </Button>
          </div>
          <Separator />
          <div className="min-h-0 flex-1">
            <FileTree renameRequest={renameRequest} />
          </div>
          <RecentNotes />
            </>
          )}
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <GitStatusBar
        onShowChanges={() => {
          setSidebarMode('git')
          setSidebarOpen(true)
        }}
      />
      <QuickOpen open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
