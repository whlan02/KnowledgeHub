import { Editor } from '@tiptap/core'
import { documentExtensions } from '@/lib/document-extensions'

export type BlockStatus = 'same' | 'added' | 'modified'

export type ChangeMarks = {
  /** One entry per current top-level block. */
  statuses: BlockStatus[]
  /** Indexes of current blocks that have removed blocks just before them (`length` = at the end). */
  deletions: number[]
}

/** Beyond this many block pairs the comparison is skipped rather than slowing typing down. */
const MAX_COMPARISONS = 4_000_000

/** Longest common subsequence of two block lists, as matching index pairs in order. */
function matchingPairs(a: string[], b: string[]): [number, number][] {
  const width = b.length + 1
  const lengths = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i * width + j] =
        a[i] === b[j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1])
    }
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) pairs.push([i++, j++])
    else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) i++
    else j++
  }
  return pairs
}

/**
 * Compare the committed blocks with the current ones. Between two unchanged blocks, the
 * committed blocks that were replaced pair up with the current ones as "modified"; extra current
 * blocks are "added", extra committed blocks are "deleted".
 */
export function diffBlocks(head: string[], current: string[]): ChangeMarks {
  const statuses = current.map((): BlockStatus => 'same')

  // Typing touches a few blocks; the unchanged start and end need no comparison.
  let prefix = 0
  while (prefix < head.length && prefix < current.length && head[prefix] === current[prefix]) prefix++
  let suffix = 0
  while (
    suffix < head.length - prefix &&
    suffix < current.length - prefix &&
    head[head.length - 1 - suffix] === current[current.length - 1 - suffix]
  ) {
    suffix++
  }
  const headMiddle = head.slice(prefix, head.length - suffix)
  const currentMiddle = current.slice(prefix, current.length - suffix)
  const middle = diffMiddle(headMiddle, currentMiddle)
  middle.statuses.forEach((status, i) => (statuses[prefix + i] = status))
  return { statuses, deletions: middle.deletions.map((index) => index + prefix) }
}

function diffMiddle(head: string[], current: string[]): ChangeMarks {
  const statuses = current.map((): BlockStatus => 'same')
  if (head.length * current.length > MAX_COMPARISONS) return { statuses, deletions: [] }
  const deletions = new Set<number>()
  const anchors = [...matchingPairs(head, current), [head.length, current.length] as [number, number]]
  let headStart = 0
  let currentStart = 0
  for (const [headEnd, currentEnd] of anchors) {
    const removed = headEnd - headStart
    const inserted = currentEnd - currentStart
    const replaced = Math.min(removed, inserted)
    for (let k = 0; k < inserted; k++) statuses[currentStart + k] = k < replaced ? 'modified' : 'added'
    if (removed > replaced) deletions.add(currentStart + replaced)
    headStart = headEnd + 1
    currentStart = currentEnd + 1
  }
  return { statuses, deletions: [...deletions] }
}

/** The Markdown of each top-level block, in the form the app would save it. */
export function topLevelMarkdown(editor: Editor): string[] {
  const blocks = editor.getJSON().content ?? []
  const markdown = editor.markdown
  if (!markdown) throw new Error('the Markdown extension is not loaded')
  return blocks.map((block) => markdown.serialize({ type: 'doc', content: [block] }).trim())
}

/** Split a note's Markdown into the same per-block form, by parsing it like the editor does. */
export function markdownBlocks(markdown: string): string[] {
  const editor = new Editor({ extensions: documentExtensions(), content: markdown, contentType: 'markdown' })
  try {
    return topLevelMarkdown(editor)
  } finally {
    editor.destroy()
  }
}
