/** Notes kept in the "recently opened" list. */
export const MAX_RECENT_NOTES = 7

const STORAGE_KEY = 'kh-recent-notes'

/** `path` moves to the front (most recent first); the list never grows past `max`. */
export function pushRecent(list: string[], path: string, max = MAX_RECENT_NOTES) {
  return [path, ...list.filter((item) => item !== path)].slice(0, max)
}

/** Drop notes that no longer exist (renamed, moved or deleted). */
export function pruneRecent(list: string[], existing: Set<string>) {
  return list.filter((path) => existing.has(path))
}

type Stored = Record<string, string[]>

function loadAll(): Stored {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Stored) : {}
  } catch {
    return {}
  }
}

/** The recent list of one workspace (`folderId` is its root path). */
export function loadRecent(folderId: string): string[] {
  const list = loadAll()[folderId]
  return Array.isArray(list) ? list.filter((p) => typeof p === 'string').slice(0, MAX_RECENT_NOTES) : []
}

export function saveRecent(folderId: string, list: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadAll(), [folderId]: list }))
  } catch {
    // Ignore quota / private mode errors.
  }
}
