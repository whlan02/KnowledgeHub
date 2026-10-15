import { createContext, useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Extension } from '@tiptap/core'
import {
  MarkViewContent,
  NodeViewContent,
  NodeViewWrapper,
  ReactMarkViewRenderer,
  ReactNodeViewRenderer,
  type MarkViewProps,
  type ReactNodeViewProps,
} from '@tiptap/react'
import CodeBlock from '@tiptap/extension-code-block'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import GithubSlugger from 'github-slugger'
import { headingSlugText, scrollHeadingIntoView } from '@/lib/toc'
import { openExternal, writeClipboardText } from '@/lib/backend'
import { encodeNotePath, resolveNoteLink } from '@/lib/utils'
import {
  BLOCK_TYPES,
  duplicateBlocks,
  turnIntoBlocks,
} from '@/lib/block-actions'
import { selectedBlocks, targetBlocks } from '@/lib/block-selection'
import { colorBlocks, colorSelection } from '@/lib/color-actions'
import { languageOptions } from '@/lib/code-languages'
import { loadLastColor } from '@/lib/colors'
import { OPEN_BLOCK_MENU_EVENT, OPEN_LINK_INPUT_EVENT } from '@/lib/editor-events'
import { useNotes } from '@/components/notes-provider'
import { LinkPreviewAnchor } from '@/components/link-preview-anchor'

const COPIED_FEEDBACK_MS = 1500

/** Which note the editor is showing, for components rendered inside the editor (links, images). */
export const EditorNoteContext = createContext('')

/** Same ids as the right-hand TOC. Kept as decorations so a view rebuild does not drop them. */
export const HeadingIds = Extension.create({
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

function ResolvedImage({ node }: ReactNodeViewProps) {
  const { resolveAssetUrl } = useNotes()
  const notePath = useContext(EditorNoteContext)
  const src = String(node.attrs.src ?? '')
  const alt = String(node.attrs.alt ?? '')

  return (
    <NodeViewWrapper>
      <img src={resolveAssetUrl(notePath, src)} alt={alt} />
    </NodeViewWrapper>
  )
}

/**
 * Links inside the editor: a click follows them (note link, heading anchor or external URL),
 * and note links get the same hover preview card as the reader had.
 */
function EditorLink({ mark }: MarkViewProps) {
  const navigate = useNavigate()
  const { notes, notesPaths, loadNoteContent } = useNotes()
  const notePath = useContext(EditorNoteContext)
  const href = String(mark.attrs.href ?? '')
  const isExternal = /^(https?:|mailto:)/i.test(href)
  const resolved = isExternal ? null : resolveNoteLink(notePath, href)
  const exists = resolved ? notesPaths.has(resolved) : false

  const linkClass = resolved
    ? exists
      ? 'note-link'
      : 'note-link note-link-missing'
    : href.startsWith('#')
      ? 'anchor-link'
      : undefined

  const follow = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    if (isExternal) {
      void openExternal(href)
    } else if (href.startsWith('#')) {
      const id = decodeURIComponent(href.slice(1))
      const root = (e.currentTarget.closest('[data-note-scroll]') as HTMLElement | null) ?? null
      scrollHeadingIntoView(id, root)
    } else if (resolved && exists) {
      const hash = href.includes('#') ? href.slice(href.indexOf('#')) : ''
      navigate({ pathname: `/n/${encodeNotePath(resolved)}`, hash })
    }
  }

  if (isExternal) {
    return (
      <a href={href} onClick={follow} title={href}>
        <MarkViewContent />
      </a>
    )
  }

  return (
    <LinkPreviewAnchor
      href={resolved ? `/n/${encodeNotePath(resolved)}` : href}
      previewHref={href}
      notePath={notePath}
      notes={notes}
      loadNoteContent={loadNoteContent}
      className={linkClass}
      missingInternal={Boolean(resolved) && !exists}
      title={resolved && !exists ? `Missing: ${resolved}` : undefined}
      onNavigate={follow}
    >
      <MarkViewContent />
    </LinkPreviewAnchor>
  )
}

export const EditorLinkMark = Link.extend({
  addMarkView() {
    return ReactMarkViewRenderer(EditorLink)
  },
})


/** Code block with a toolbar row on top: language picker and copy button, above the code. */
function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const { t } = useTranslation()
  const language = String(node.attrs.language ?? '')
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await writeClipboardText(node.textContent)
    setCopied(true)
    window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
  }

  return (
    <NodeViewWrapper className="code-block">
      <div className="code-toolbar" contentEditable={false}>
        <select
          className="code-language"
          value={language}
          disabled={!editor.isEditable}
          onChange={(event) => updateAttributes({ language: event.target.value || null })}
        >
          {languageOptions(language).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="code-copy"
          title={copied ? t('codeCopied') : t('codeCopy')}
          aria-label={t('codeCopy')}
          onClick={() => void copy()}
        >
          {copied ? <Check /> : <Copy />}
        </button>
      </div>
      <pre>
        {/* NodeViewContent is typed for div only, but `pre code` is what the Markdown styles expect. */}
        <NodeViewContent as={'code' as 'div'} />
      </pre>
    </NodeViewWrapper>
  )
}

export const EditorCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
})

/** Images whose `src` is relative to the note are loaded from the workspace. */
export const WorkspaceImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ResolvedImage)
  },
})

/** Notion's block shortcuts: Ctrl+/ block menu, Ctrl+D duplicate, Ctrl+Shift+0..8 turn into. */
export const BlockShortcuts = Extension.create({
  name: 'blockShortcuts',
  priority: 1000,
  addKeyboardShortcuts() {
    const turnShortcuts = Object.fromEntries(
      BLOCK_TYPES.filter((type) => type.shortcutDigit !== undefined).map((type) => [
        `Mod-Shift-${type.shortcutDigit}`,
        () => {
          turnIntoBlocks(this.editor, targetBlocks(this.editor), type.id)
          return true
        },
      ]),
    )
    return {
      ...turnShortcuts,
      'Mod-/': () => {
        this.editor.view.dom.dispatchEvent(new CustomEvent(OPEN_BLOCK_MENU_EVENT))
        return true
      },
      'Mod-Shift-h': () => {
        const last = loadLastColor()
        if (!last) return true
        const hasTextSelection = !this.editor.state.selection.empty && !selectedBlocks(this.editor.state)
        if (hasTextSelection) colorSelection(this.editor, last.target, last.color)
        else colorBlocks(this.editor, targetBlocks(this.editor), last.target, last.color)
        return true
      },
      'Mod-k': () => {
        if (this.editor.state.selection.empty) return true
        this.editor.view.dom.dispatchEvent(new CustomEvent(OPEN_LINK_INPUT_EVENT))
        return true
      },
      'Mod-d': () => {
        duplicateBlocks(this.editor, targetBlocks(this.editor))
        return true
      },
    }
  },
})
