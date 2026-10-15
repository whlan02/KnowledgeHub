export type DiffLine = { kind: 'hunk' | 'add' | 'del' | 'context'; text: string }

/** Parse a unified diff into displayable lines, dropping the file header lines. */
export function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = []
  let inHunk = false
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('@@')) {
      inHunk = true
      lines.push({ kind: 'hunk', text: raw })
    } else if (!inHunk || raw.startsWith('\\')) {
      continue
    } else if (raw.startsWith('+')) {
      lines.push({ kind: 'add', text: raw.slice(1) })
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'del', text: raw.slice(1) })
    } else if (raw.startsWith(' ')) {
      lines.push({ kind: 'context', text: raw.slice(1) })
    } else if (raw.startsWith('diff --git')) {
      inHunk = false
    }
  }
  return lines
}

export const SUMMARY_LIMIT = 50

/** Commit summary and description joined the way git expects (blank line between). */
export function composeCommitMessage(summary: string, description: string): string {
  const body = description.trim()
  return body ? `${summary.trim()}\n\n${body}` : summary.trim()
}

/** The part of a summary past the recommended length, for highlighting. */
export function summaryOverflow(summary: string): string {
  return summary.length > SUMMARY_LIMIT ? summary.slice(SUMMARY_LIMIT) : ''
}
