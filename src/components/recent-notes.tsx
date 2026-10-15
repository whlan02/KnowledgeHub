import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import { useNotes } from '@/components/notes-provider'
import { loadRecent, pruneRecent, pushRecent, saveRecent } from '@/lib/recent-notes'
import { cn, decodeNotePath, encodeNotePath } from '@/lib/utils'

const NOTE_ROUTE = '/n/'

/** The note the address points at, or null on other pages. */
function openedNotePath(pathname: string) {
  if (!pathname.startsWith(NOTE_ROUTE)) return null
  try {
    return decodeNotePath(pathname.slice(NOTE_ROUTE.length))
  } catch {
    return null
  }
}

/** Notes opened lately in this workspace, newest first. */
function useRecentNotes() {
  const { notes, notesPaths, activeFolderId } = useNotes()
  const { pathname } = useLocation()
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    setRecent(activeFolderId ? loadRecent(activeFolderId) : [])
  }, [activeFolderId])

  const opened = openedNotePath(pathname)
  useEffect(() => {
    if (!activeFolderId || !opened || !notesPaths.has(opened)) return
    setRecent((previous) => {
      const next = pushRecent(previous, opened)
      saveRecent(activeFolderId, next)
      return next
    })
  }, [activeFolderId, opened, notesPaths])

  const titles = new Map(notes.map((n) => [n.path, n.title]))
  return pruneRecent(recent, notesPaths).map((path) => ({ path, title: titles.get(path) ?? path }))
}

/** Bottom of the sidebar: the last few notes opened, newest at the top. */
export function RecentNotes() {
  const { t } = useTranslation()
  const items = useRecentNotes()
  if (items.length === 0) return null

  return (
    <section className="shrink-0 border-t" aria-label={t('recentNotes')}>
      <div className="px-3 pb-1 pt-2 text-xs font-medium tracking-wide text-muted-foreground">
        {t('recentNotes')}
      </div>
      <div className="max-h-48 overflow-y-auto">
        <ul className="px-2 pb-2">
          {items.map((item) => (
            <li key={item.path}>
              <NavLink
                to={`${NOTE_ROUTE}${encodeNotePath(item.path)}`}
                title={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    isActive && 'bg-accent font-medium text-accent-foreground',
                  )
                }
              >
                <FileText className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">{item.title}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
