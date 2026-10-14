import type { Note } from '@/lib/fs-notes'

/** Every character of `needle` appears in `text` in order, like "kh" in "KnowledgeHub". */
function isSubsequence(needle: string, text: string) {
  let at = 0
  for (const char of text) {
    if (char === needle[at]) at += 1
    if (at === needle.length) return true
  }
  return needle.length === 0
}

/** How well `note` matches `query` (0 means not at all): title beats path, start beats middle. */
export function noteScore(note: Note, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const title = note.title.toLowerCase()
  const path = note.path.toLowerCase()
  if (title === q) return 100
  if (title.startsWith(q)) return 80
  if (title.includes(q)) return 60
  if (path.includes(q)) return 40
  if (isSubsequence(q, title)) return 20
  if (isSubsequence(q, path)) return 10
  return 0
}

/** Notes matching `query`, best first; with an empty query, all notes by path. */
export function rankNotes(notes: Note[], query: string, limit = 30) {
  return notes
    .map((note) => ({ note, score: noteScore(note, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.note.path.localeCompare(b.note.path, 'zh'))
    .slice(0, limit)
    .map((entry) => entry.note)
}

export type TextPart = { text: string; match: boolean }

/** Split `text` into parts so the occurrences of `query` (any case) can be highlighted. */
export function highlightParts(text: string, query: string): TextPart[] {
  const q = query.trim().toLowerCase()
  if (!q) return [{ text, match: false }]
  const lower = text.toLowerCase()
  const parts: TextPart[] = []
  let from = 0
  for (let at = lower.indexOf(q); at >= 0; at = lower.indexOf(q, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false })
    parts.push({ text: text.slice(at, at + q.length), match: true })
    from = at + q.length
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false })
  return parts
}
