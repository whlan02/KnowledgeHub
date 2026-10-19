import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { useGit } from '@/components/git-provider'
import { gitHeadContent } from '@/lib/backend'
import { diffBlocks, markdownBlocks, topLevelMarkdown } from '@/lib/change-marks'
import { setChangeMarks } from '@/lib/change-marks-extension'

const COMPARE_DELAY_MS = 250

/** The note's committed blocks; `null` while unknown or outside a repository. */
function useCommittedBlocks(notePath: string) {
  const { status } = useGit()
  const entry = status?.changes.find((change) => change.path === notePath)
  // A commit, checkout or staging change is what can make HEAD's copy different.
  const headKey = status ? `${status.branch}|${entry?.staged}|${entry?.unstaged}` : null
  const [blocks, setBlocks] = useState<string[] | null>(null)

  useEffect(() => {
    if (headKey === null) {
      setBlocks(null)
      return
    }
    let isCurrent = true
    gitHeadContent(notePath)
      .then((text) => isCurrent && setBlocks(text === null ? [] : markdownBlocks(text)))
      .catch(() => isCurrent && setBlocks(null))
    return () => {
      isCurrent = false
    }
  }, [notePath, headKey])

  return blocks
}

/** Keeps the editor's change marks in step with what has been typed since the last commit. */
export function useChangeMarks(editor: Editor, notePath: string) {
  const committed = useCommittedBlocks(notePath)

  useEffect(() => {
    if (!committed) {
      setChangeMarks(editor, null)
      return
    }
    const compare = () => setChangeMarks(editor, diffBlocks(committed, topLevelMarkdown(editor)))
    let timer: number | null = null
    const scheduleCompare = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(compare, COMPARE_DELAY_MS)
    }
    compare()
    // Not 'update': reloading the note from disk changes the document without emitting it.
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.docChanged) scheduleCompare()
    }
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [editor, committed])
}

export function ChangeMarksController({ editor, notePath }: { editor: Editor; notePath: string }) {
  useChangeMarks(editor, notePath)
  return null
}
