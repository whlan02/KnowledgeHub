import type { GitChange, GitChangeKind } from '@/lib/backend'

/** Kind to show per path; every folder holding a changed file counts as modified. */
export function changeMarkers(changes: GitChange[]): Map<string, GitChangeKind> {
  const markers = new Map<string, GitChangeKind>()
  for (const change of changes) {
    markers.set(change.path, change.kind)
    const parts = change.path.split('/').slice(0, -1)
    parts.forEach((_, i) => {
      const folder = parts.slice(0, i + 1).join('/')
      if (!markers.has(folder)) markers.set(folder, 'modified')
    })
  }
  return markers
}

export const KIND_COLOR: Record<GitChangeKind, string> = {
  added: 'text-green-600 dark:text-green-400',
  modified: 'text-amber-600 dark:text-amber-400',
  deleted: 'text-red-600 dark:text-red-400',
  renamed: 'text-blue-600 dark:text-blue-400',
  untracked: 'text-green-600 dark:text-green-400',
}
