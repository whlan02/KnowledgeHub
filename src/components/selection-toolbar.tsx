import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  Bold,
  ChevronDown,
  Code,
  Italic,
  Link2,
  Link2Off,
  Palette,
  Strikethrough,
  Underline,
  type LucideIcon,
} from 'lucide-react'
import { currentBlockPos, turnInto, type BlockTypeId } from '@/lib/block-actions'
import { colorSelection } from '@/lib/color-actions'
import { OPEN_LINK_INPUT_EVENT } from '@/lib/editor-events'
import { cn } from '@/lib/utils'
import { BLOCK_ICONS } from '@/components/block-icons'
import { TURN_INTO_TYPES, TypeList } from '@/components/block-menu'
import { ColorPicker } from '@/components/color-menu'
import { MenuPanel } from '@/components/menu-panel'

const BLOCK_TYPE_OF_ACTIVE: { active: (editor: Editor) => boolean; id: BlockTypeId }[] = [
  { active: (e) => e.isActive('heading', { level: 1 }), id: 'h1' },
  { active: (e) => e.isActive('heading', { level: 2 }), id: 'h2' },
  { active: (e) => e.isActive('heading', { level: 3 }), id: 'h3' },
  { active: (e) => e.isActive('taskList'), id: 'todo' },
  { active: (e) => e.isActive('bulletList'), id: 'bullet' },
  { active: (e) => e.isActive('orderedList'), id: 'ordered' },
  { active: (e) => e.isActive('blockquote'), id: 'quote' },
  { active: (e) => e.isActive('codeBlock'), id: 'code' },
]

function activeBlockType(editor: Editor): BlockTypeId {
  return BLOCK_TYPE_OF_ACTIVE.find((entry) => entry.active(editor))?.id ?? 'paragraph'
}

/** `example.com` becomes `https://example.com`; note links like `./a.md` and `#id` stay as typed. */
function normalizeHref(value: string) {
  const href = value.trim()
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(href) && !/^[\w-]+\.md(#|$)/i.test(href)) return `https://${href}`
  return href
}

function ToolbarButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  onClick: (rect: DOMRect) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground',
        active && 'bg-accent text-foreground',
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())}
    >
      <Icon className="size-4" />
    </button>
  )
}

function LinkInput({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(() => String(editor.getAttributes('link').href ?? ''))

  const apply = () => {
    const href = normalizeHref(value)
    const chain = editor.chain().focus().extendMarkRange('link')
    if (href) chain.setLink({ href }).run()
    else chain.unsetLink().run()
    onDone()
  }

  return (
    <input
      autoFocus
      value={value}
      placeholder={t('toolbarLinkPlaceholder')}
      className="h-7 w-64 rounded-sm bg-transparent px-2 text-sm outline-none"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          apply()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          editor.commands.focus()
          onDone()
        }
      }}
    />
  )
}

/** Formatting bar that floats above selected text: styles, link, and turn-into. */
export function SelectionToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation()
  const [linkMode, setLinkMode] = useState(false)
  const [turnMenu, setTurnMenu] = useState<{ x: number; y: number } | null>(null)
  const [colorMenu, setColorMenu] = useState<{ x: number; y: number } | null>(null)

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      block: activeBlockType(e),
    }),
  })

  // Ctrl+K edits the link of the selection.
  useEffect(() => {
    const dom = editor.view.dom
    const open = () => setLinkMode(true)
    dom.addEventListener(OPEN_LINK_INPUT_EVENT, open)
    return () => dom.removeEventListener(OPEN_LINK_INPUT_EVENT, open)
  }, [editor])

  const BlockIcon = BLOCK_ICONS[state.block]
  const run = (command: () => void) => () => {
    command()
    editor.commands.focus()
  }

  const bar: ReactNode = linkMode ? (
    <LinkInput editor={editor} onDone={() => setLinkMode(false)} />
  ) : (
    <>
      <button
        type="button"
        className="flex h-7 items-center gap-1 rounded-sm px-2 text-sm hover:bg-accent"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setTurnMenu({ x: rect.left, y: rect.bottom + 4 })
        }}
      >
        <BlockIcon className="size-4 opacity-70" />
        <ChevronDown className="size-3 opacity-60" />
      </button>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <ToolbarButton
        icon={Bold}
        label={t('toolbarBold')}
        active={state.bold}
        onClick={run(() => editor.chain().toggleBold().run())}
      />
      <ToolbarButton
        icon={Italic}
        label={t('toolbarItalic')}
        active={state.italic}
        onClick={run(() => editor.chain().toggleItalic().run())}
      />
      <ToolbarButton
        icon={Underline}
        label={t('toolbarUnderline')}
        active={state.underline}
        onClick={run(() => editor.chain().toggleUnderline().run())}
      />
      <ToolbarButton
        icon={Strikethrough}
        label={t('toolbarStrike')}
        active={state.strike}
        onClick={run(() => editor.chain().toggleStrike().run())}
      />
      <ToolbarButton
        icon={Palette}
        label={t('toolbarColor')}
        onClick={(rect) => setColorMenu({ x: rect.left, y: rect.bottom + 4 })}
      />
      <ToolbarButton
        icon={Code}
        label={t('toolbarCode')}
        active={state.code}
        onClick={run(() => editor.chain().toggleCode().run())}
      />
      <span className="mx-0.5 h-4 w-px bg-border" />
      {state.link ? (
        <ToolbarButton
          icon={Link2Off}
          label={t('toolbarUnlink')}
          onClick={run(() => editor.chain().extendMarkRange('link').unsetLink().run())}
        />
      ) : (
        <ToolbarButton icon={Link2} label={t('toolbarLink')} onClick={() => setLinkMode(true)} />
      )}
    </>
  )

  return (
    <>
      <BubbleMenu
        editor={editor}
        options={{ placement: 'top', offset: 8, onHide: () => setLinkMode(false) }}
        shouldShow={({ editor: e, state: s }) =>
          e.isEditable && !s.selection.empty && !e.isActive('codeBlock') && !('node' in s.selection)
        }
      >
        <div className="flex items-center gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {bar}
        </div>
      </BubbleMenu>
      {colorMenu && (
        <MenuPanel x={colorMenu.x} y={colorMenu.y} onDismiss={() => setColorMenu(null)}>
          <ColorPicker
            onPick={(target, color) => {
              setColorMenu(null)
              colorSelection(editor, target, color)
            }}
          />
        </MenuPanel>
      )}
      {turnMenu && (
        <MenuPanel x={turnMenu.x} y={turnMenu.y} onDismiss={() => setTurnMenu(null)}>
          <TypeList
            types={TURN_INTO_TYPES}
            onPick={(type) => {
              setTurnMenu(null)
              turnInto(editor, currentBlockPos(editor), type)
            }}
          />
        </MenuPanel>
      )}
    </>
  )
}
