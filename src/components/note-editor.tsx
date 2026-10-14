import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { useNotes } from '@/components/notes-provider'
import { BlockHandle } from '@/components/block-handle'
import { SelectionToolbar } from '@/components/selection-toolbar'
import { SlashCommand } from '@/components/slash-menu'
import {
  BlockShortcuts,
  EditorLinkMark,
  EditorNoteContext,
  HeadingIds,
  MarkdownUnderline,
  WorkspaceImage,
} from '@/components/editor-extensions'

const SAVE_DELAY_MS = 400

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const notePathByEditor = new WeakMap<Editor, string>()

export function NoteEditor({
  notePath,
  initialContent,
  onDraft,
}: {
  notePath: string
  initialContent: string
  onDraft: (text: string) => void
}) {
  const { t } = useTranslation()
  const { saveNoteContent, readNoteFromDisk, subscribeChanges } = useNotes()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const draftRef = useRef(initialContent)
  /** What the editor serialises to when nothing has been typed since the last save. */
  const savedRef = useRef(initialContent)
  /** Last text known to be on disk (loaded or written by us). */
  const diskRef = useRef(initialContent)
  const timerRef = useRef<number | null>(null)
  const savingRef = useRef(false)
  const onDraftRef = useRef(onDraft)
  const saveNoteContentRef = useRef(saveNoteContent)
  onDraftRef.current = onDraft
  saveNoteContentRef.current = saveNoteContent

  useEffect(() => {
    const path = notePath
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const pending = draftRef.current
      if (pending !== savedRef.current) {
        diskRef.current = pending
        void saveNoteContentRef.current(path, pending).then(() => {
          savedRef.current = pending
        })
      }
    }
  }, [notePath])

  const persistRef = useRef<(path: string, text: string) => Promise<void>>(async () => {})

  persistRef.current = async (path: string, text: string) => {
    if (text === savedRef.current) {
      setStatus('saved')
      return
    }
    setStatus('saving')
    savingRef.current = true
    const previousDisk = diskRef.current
    diskRef.current = text
    try {
      await saveNoteContentRef.current(path, text)
      if (draftRef.current !== text) return
      savedRef.current = text
      setStatus('saved')
    } catch {
      diskRef.current = previousDisk
      if (draftRef.current === text) setStatus('error')
    } finally {
      savingRef.current = false
    }
  }

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
          link: false,
          underline: false,
          dropcursor: { color: '#2383e2', width: 2 },
        }),
        EditorLinkMark.configure({ openOnClick: false, autolink: true }),
        Placeholder.configure({
          placeholder: t('editorPlaceholder'),
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        WorkspaceImage,
        Markdown,
        HeadingIds,
        MarkdownUnderline,
        BlockShortcuts,
        SlashCommand,
      ],
      content: initialContent,
      contentType: 'markdown',
      editorProps: {
        attributes: {
          class: 'markdown-body note-editor',
        },
      },
      onCreate: ({ editor: created }) => {
        notePathByEditor.set(created, notePath)
        const markdown = created.getMarkdown()
        draftRef.current = markdown
        savedRef.current = markdown
        diskRef.current = initialContent
      },
      onUpdate: ({ editor: current }) => {
        const path = notePathByEditor.get(current)
        if (!path) return
        const markdown = current.getMarkdown()
        draftRef.current = markdown
        onDraftRef.current(markdown)
        if (markdown === savedRef.current) return
        setStatus('pending')
        if (timerRef.current !== null) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          void persistRef.current(path, draftRef.current)
        }, SAVE_DELAY_MS)
      },
    },
    [notePath, initialContent],
  )

  // Pick up edits made outside the app (git pull, another editor) unless there is something unsaved here.
  useEffect(() => {
    if (!editor) return
    return subscribeChanges((paths) => {
      if (!paths.includes(notePath)) return
      const busy = () =>
        timerRef.current !== null || savingRef.current || draftRef.current !== savedRef.current
      if (busy()) return
      void readNoteFromDisk(notePath).then((text) => {
        if (text === null || text === diskRef.current || busy() || editor.isDestroyed) return
        editor.commands.setContent(text, { contentType: 'markdown', emitUpdate: false })
        const markdown = editor.getMarkdown()
        diskRef.current = text
        draftRef.current = markdown
        savedRef.current = markdown
        onDraftRef.current(markdown)
        setStatus('idle')
      })
    })
  }, [editor, notePath, subscribeChanges, readNoteFromDisk])

  const statusText =
    status === 'pending'
      ? t('notePending')
      : status === 'saving'
        ? t('noteSaving')
        : status === 'saved'
          ? t('noteSaved')
          : status === 'error'
            ? t('noteSaveFailed')
            : null

  return (
    <EditorNoteContext.Provider value={notePath}>
      <div className="mx-auto max-w-3xl px-6 py-10">
        {statusText && (
          <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
            {statusText}
          </p>
        )}
        <EditorContent editor={editor} />
        {editor && <BlockHandle editor={editor} notePath={notePath} />}
        {editor && <SelectionToolbar editor={editor} />}
      </div>
    </EditorNoteContext.Provider>
  )
}
