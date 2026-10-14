const STORAGE_KEY = 'kh-recent-folders'
const ACTIVE_KEY = 'kh-active-workspace'

/** Max recent folders kept (MRU list). */
export const MAX_RECENT_FOLDERS = 12

export type RecentFolderEntry = {
  /** The folder's absolute path doubles as its id. */
  id: string
  name: string
  openedAt: number
}

export function loadRecentFolders(): RecentFolderEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentFolderEntry[]
    return Array.isArray(parsed)
      ? parsed.filter((e) => typeof e?.id === 'string' && typeof e?.name === 'string')
      : []
  } catch {
    return []
  }
}

function saveRecentFolders(list: RecentFolderEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function touchRecentFolder(id: string, name: string): RecentFolderEntry[] {
  const next = [
    { id, name, openedAt: Date.now() },
    ...loadRecentFolders().filter((e) => e.id !== id),
  ].slice(0, MAX_RECENT_FOLDERS)
  saveRecentFolders(next)
  return next
}

export function removeRecentFolder(id: string): RecentFolderEntry[] {
  const next = loadRecentFolders().filter((e) => e.id !== id)
  saveRecentFolders(next)
  return next
}

export function clearRecentFolders(): RecentFolderEntry[] {
  saveRecentFolders([])
  return []
}

export function loadActiveWorkspace(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

export function saveActiveWorkspace(path: string | null) {
  try {
    if (path) localStorage.setItem(ACTIVE_KEY, path)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // Ignore quota / private mode errors.
  }
}
