import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNotes } from '@/components/notes-provider'
import { gitStatus, type GitChangeKind, type GitStatus } from '@/lib/backend'
import { errorMessage } from '@/lib/error-message'
import { changeMarkers } from '@/lib/git-markers'

const REFRESH_DELAY_MS = 600
const NOT_A_REPO = 'NOT_A_REPO'

type GitState = {
  /** `null` while unknown or when the workspace is not a Git repository. */
  status: GitStatus | null
  isNotRepo: boolean
  markers: Map<string, GitChangeKind>
  refresh: () => Promise<void>
}

const NO_GIT: GitState = { status: null, isNotRepo: false, markers: new Map(), refresh: async () => {} }

const GitContext = createContext<GitState>(NO_GIT)

export function useGit() {
  return useContext(GitContext)
}

export function GitProvider({ children }: { children: ReactNode }) {
  const { activeFolderId, subscribeChanges } = useNotes()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [isNotRepo, setIsNotRepo] = useState(false)
  const timerRef = useRef<number | null>(null)
  const latestRef = useRef(0)

  const refresh = useCallback(async () => {
    const ticket = ++latestRef.current
    let next: GitStatus | null = null
    let notRepo = false
    try {
      next = await gitStatus()
    } catch (err) {
      notRepo = errorMessage(err) === NOT_A_REPO
    }
    if (ticket !== latestRef.current) return
    setStatus(next)
    setIsNotRepo(notRepo)
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

  // Commits and checkouts made elsewhere only touch .git, which the file watcher ignores.
  useEffect(() => {
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const markers = useMemo(() => changeMarkers(status?.changes ?? []), [status])
  const value = useMemo(() => ({ status, isNotRepo, markers, refresh }), [status, isNotRepo, markers, refresh])
  return <GitContext.Provider value={value}>{children}</GitContext.Provider>
}
