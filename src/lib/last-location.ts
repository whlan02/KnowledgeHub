import type { Note } from '@/lib/fs-notes'

const STORAGE_KEY = 'kh-last-location'

export type LastLocation = {
  source: 'bundled' | 'folder'
  folderId: string | null
  notePath: string
}

export function saveLastLocation(location: LastLocation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(location))
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function loadLastLocation(): LastLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LastLocation
    if (!parsed || typeof parsed.notePath !== 'string') return null
    if (parsed.source !== 'bundled' && parsed.source !== 'folder') return null
    if (parsed.folderId != null && typeof parsed.folderId !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function resolveHomeNotePath(
  notes: Note[],
  source: 'bundled' | 'folder',
  activeFolderId: string | null,
): string | null {
  const last = loadLastLocation()
  if (
    last &&
    last.source === source &&
    last.folderId === activeFolderId &&
    notes.some((n) => n.path === last.notePath)
  ) {
    return last.notePath
  }

  const preferred =
    notes.find((n) => n.path === 'README.md') ??
    notes.find((n) => n.path.endsWith('/README.md')) ??
    notes[0]

  return preferred?.path ?? null
}
