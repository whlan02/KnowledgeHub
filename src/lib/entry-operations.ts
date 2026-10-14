import { rewriteLinks } from '@/lib/link-rewrite'
import { remapPath } from '@/lib/path-ops'

export type NoteIo = {
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
}

/**
 * After `from` was renamed or moved to `to`, re-point the links of every note in `oldPaths` (their
 * paths before the move) so they still reach the same files. Resolves to the notes that were
 * rewritten, by their new paths. A note that cannot be read or written is skipped, so the move
 * itself never fails because of one broken note.
 */
export async function rewriteLinksAfterMove(oldPaths: string[], from: string, to: string, io: NoteIo) {
  const rewritten: string[] = []
  for (const oldPath of oldPaths) {
    const newPath = remapPath(oldPath, from, to)
    try {
      const text = await io.read(newPath)
      const next = rewriteLinks(text, oldPath, newPath, from, to)
      if (next === text) continue
      await io.write(newPath, next)
      rewritten.push(newPath)
    } catch (err) {
      console.error(err)
    }
  }
  return rewritten
}

/** A note's file name always ends in `.md`; folders keep the name as typed. */
export function entryFileName(newName: string, isNote: boolean) {
  return isNote && !newName.toLowerCase().endsWith('.md') ? `${newName}.md` : newName
}
