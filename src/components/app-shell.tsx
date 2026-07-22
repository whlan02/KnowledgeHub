import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, FolderOpen, Languages, Moon, PanelLeft, RotateCcw, Sun, SunMoon } from 'lucide-react'
import i18n from '@/i18n'
import { useTheme } from '@/components/theme-provider'
import { useNotes } from '@/components/notes-provider'
import { FileTree } from '@/components/file-tree'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function AppShell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const { notes, folderLabel, source, pickerSupported, openFolder, resetToBundled } = useNotes()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [busy, setBusy] = useState(false)

  const setLang = (lng: 'zh' | 'en') => {
    localStorage.setItem('kh-lang', lng)
    void i18n.changeLanguage(lng)
  }

  const onOpenFolder = async () => {
    try {
      setBusy(true)
      await openFolder()
      navigate('/', { replace: true })
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        console.error(err)
        window.alert(t('folderPickFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const onReset = async () => {
    setBusy(true)
    try {
      await resetToBundled()
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? t('collapseSidebar') : t('expandSidebar')}
        >
          <PanelLeft />
        </Button>
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-muted-foreground" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">{t('appName')}</div>
            <div className="text-[11px] text-muted-foreground">{t('appSubtitle')}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {pickerSupported && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onOpenFolder()}
              className="gap-1.5"
            >
              <FolderOpen className="size-3.5" />
              {t('openFolder')}
            </Button>
          )}
          {source === 'folder' && (
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('theme')}>
                {theme === 'dark' ? <Moon /> : theme === 'light' ? <Sun /> : <SunMoon />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme('light')}>{t('themeLight')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>{t('themeDark')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')}>{t('themeSystem')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'flex shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200',
            sidebarOpen ? 'w-[280px]' : 'w-0 overflow-hidden border-r-0',
          )}
        >
          <div className="px-3 py-2">
            <div className="text-xs font-medium tracking-wide text-muted-foreground">{t('files')}</div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground/80" title={folderLabel}>
              {folderLabel}
            </div>
          </div>
          <Separator />
          <div className="min-h-0 flex-1">
            <FileTree notes={notes} />
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
