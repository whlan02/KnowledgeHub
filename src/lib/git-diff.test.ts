import { describe, expect, it } from 'vitest'
import { composeCommitMessage, parseDiff, summaryOverflow } from '@/lib/git-diff'

describe('parseDiff', () => {
  it('drops the file header and keeps hunks with added, removed and context lines', () => {
    const diff = 'diff --git a/a.md b/a.md\nindex 1..2 100644\n--- a/a.md\n+++ b/a.md\n@@ -1,2 +1,2 @@\n one\n-two\n+three\n'
    expect(parseDiff(diff)).toEqual([
      { kind: 'hunk', text: '@@ -1,2 +1,2 @@' },
      { kind: 'context', text: 'one' },
      { kind: 'del', text: 'two' },
      { kind: 'add', text: 'three' },
    ])
  })

  it('does not mistake a removed line starting with dashes for a header', () => {
    const lines = parseDiff('@@ -1 +1 @@\n--- not a header\n+++ also text\n')
    expect(lines.map((l) => l.kind)).toEqual(['hunk', 'del', 'add'])
  })

  it('ignores the no-newline marker and empty output', () => {
    expect(parseDiff('')).toEqual([])
    expect(parseDiff('@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n').map((l) => l.kind)).toEqual([
      'hunk',
      'del',
      'add',
    ])
  })

  it('reads several files in a row', () => {
    const diff = '--- a/a\n+++ b/a\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/b b/b\n--- a/b\n+++ b/b\n@@ -1 +1 @@\n-p\n+q\n'
    expect(parseDiff(diff).filter((l) => l.kind === 'hunk')).toHaveLength(2)
  })
})

describe('commit message helpers', () => {
  it('joins summary and description with a blank line', () => {
    expect(composeCommitMessage(' Add notes ', '')).toBe('Add notes')
    expect(composeCommitMessage('Add notes', 'Why:\n- reason')).toBe('Add notes\n\nWhy:\n- reason')
  })

  it('reports the characters past 50 in the summary', () => {
    expect(summaryOverflow('short')).toBe('')
    expect(summaryOverflow('a'.repeat(50) + 'bcd')).toBe('bcd')
  })
})
