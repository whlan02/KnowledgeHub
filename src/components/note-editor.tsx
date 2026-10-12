import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Extension, type Editor } from '@tiptap/core'
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type ReactNodeViewProps,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import GithubSlugger from 'github-slugger'
import { headingSlugText } from '@/lib/toc'
import { useNotes } from '@/components/notes-provider'

const SAVE_DELAY_MS = 400

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'denied'

const notePathByEditor = new WeakMap<Editor, string>()

/** Same ids as the right-hand TOC. Kept as decorations so a view rebuild does not drop them. */
const HeadingIds = Extension.create({
  name: 'headingIds',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const slugger = new GithubSlugger()
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'heading') return
              const level = node.attrs.level as number
              if (level < 2 || level > 4) return
              const text = headingSlugText(node.textContent)
              if (!text) return
              decorations.push(Decoration.node(pos, pos + node.nodeSize, { id: slugger.slug(text) }))
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

function ResolvedImage({
  node,
  notePath,
  resolveAssetUrl,
}: ReactNodeViewProps & {
  notePath: string
  resolveAssetUrl: (fromNotePath: string, src: string) => Promise<string | null>
}) {
  const src = String(node.attrs.src ?? '')
  const alt = String(node.attrs.alt ?? '')
  const [url, setUrl] = useState(src)

  useEffect(() => {
    let cancelled = false
    void resolveAssetUrl(notePath, src).then((resolved) => {
      if (!cancelled && resolved) setUrl(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [notePath, resolveAssetUrl, src])

  return (
    <NodeViewWrapper>
      <img src={url} alt={alt} />
    </NodeViewWrapper>
  )
}

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
  const { folderWritable, requestFolderWriteAccess, saveNoteContent, holdFolderSync, resolveAssetUrl } =
    useNotes()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const draftRef = useRef(initialContent)
  const savedRef = useRef(initialContent)
  const timerRef = useRef<number | null>(null)
  const holdReleaseRef = useRef<(() => void) | null>(null)
  const onDraftRef = useRef(onDraft)
  const folderWritableRef = useRef(folderWritable)
  const requestWriteRef = useRef(requestFolderWriteAccess)
  const resolveAssetUrlRef = useRef(resolveAssetUrl)
  onDraftRef.current = onDraft
  folderWritableRef.current = folderWritable
  requestWriteRef.current = requestFolderWriteAccess
  resolveAssetUrlRef.current = resolveAssetUrl

  const releaseHold = () => {
    holdReleaseRef.current?.()
    holdReleaseRef.current = null
  }

  const ensureHold = () => {
    if (!holdReleaseRef.current) holdReleaseRef.current = holdFolderSync()
  }

  useEffect(() => {
    const path = notePath
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const pending = draftRef.current
      if (pending !== savedRef.current) {
        void saveNoteContent(path, pending)
          .then(() => {
            savedRef.current = pending
          })
          .finally(releaseHold)
      } else {
        releaseHold()
      }
    }
  }, [notePath, saveNoteContent])

  const persistRef = useRef<(path: string, text: string) => Promise<void>>(async () => {})

  const persist = async (path: string, text: string) => {
    if (text === savedRef.current) {
      releaseHold()
      setStatus('saved')
      return
    }
    setStatus('saving')
    try {
      await saveNoteContent(path, text)
      if (draftRef.current !== text) return
      savedRef.current = text
      setStatus('saved')
      releaseHold()
    } catch (err) {
      if (draftRef.current !== text) return
      const message = (err as Error)?.message
      setStatus(message === 'WRITE_DENIED' || message === 'NOTE_READONLY' ? 'denied' : 'error')
    }
  }

  persistRef.current = persist

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
          link: { openOnClick: false, autolink: true },
        }),
        Placeholder.configure({
          placeholder: t('editorPlaceholder'),
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        Image.extend({
          addNodeView() {
            return ReactNodeViewRenderer((props) => (
              <ResolvedImage
                {...props}
                notePath={notePath}
                resolveAssetUrl={(from, src) => resolveAssetUrlRef.current(from, src)}
              />
            ))
          },
        }),
        Markdown,
        HeadingIds,
      ],
      content: initialContent,
      contentType: 'markdown',
      editorProps: {
        attributes: {
          class: 'markdown-body note-editor',
        },
        handleDOMEvents: {
          focus: () => {
            if (!folderWritableRef.current) void requestWriteRef.current()
            return false
          },
        },
      },
      onCreate: ({ editor: created }) => {
        notePathByEditor.set(created, notePath)
        const markdown = created.getMarkdown()
        draftRef.current = markdown
        savedRef.current = markdown
      },
      onUpdate: ({ editor: current }) => {
        const path = notePathByEditor.get(current)
        if (!path) return
        const markdown = current.getMarkdown()
        draftRef.current = markdown
        onDraftRef.current(markdown)
        if (markdown === savedRef.current) return
        ensureHold()
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

  useEffect(() => {
    if (!folderWritable || !editor) return
    if (draftRef.current === savedRef.current) return
    const path = notePathByEditor.get(editor)
    if (!path) return
    void persistRef.current(path, draftRef.current)
  }, [folderWritable, editor])

  const statusText =
    status === 'pending'
      ? t('notePending')
      : status === 'saving'
        ? t('noteSaving')
        : status === 'saved'
          ? t('noteSaved')
          : status === 'error'
            ? t('noteSaveFailed')
            : status === 'denied'
              ? t('noteWriteDenied')
              : folderWritable
                ? null
                : t('noteNeedsWrite')

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {statusText && (
        <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
          {statusText}
        </p>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
