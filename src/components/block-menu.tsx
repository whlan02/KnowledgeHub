import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Info,
  Link2,
  Palette,
  Repeat2,
  Scissors,
  Trash2,
} from 'lucide-react'
import {
  BLOCK_TYPES,
  canTurnInto,
  deleteBlocks,
  duplicateBlocks,
  headingLink,
  insertBelow,
  turnIntoBlocks,
  type BlockTypeId,
} from '@/lib/block-actions'
import type { BlockRef } from '@/lib/block-tree'
import { setCalloutType } from '@/lib/block-containers'
import { CALLOUT_ICONS, CALLOUT_TYPES } from '@/lib/callout'
import { colorBlocks } from '@/lib/color-actions'
import { readClipboardText } from '@/lib/backend'
import { BLOCK_ICONS } from '@/components/block-icons'
import { ColorPicker } from '@/components/color-menu'
import { MenuItem, MenuPanel } from '@/components/menu-panel'

export type BlockMenuState = {
  /** `block`: actions for the block. `insert`: pick a type to add below it. `context`: right-click. */
  kind: 'block' | 'insert' | 'context'
  x: number
  y: number
  /** The blocks the menu acts on: one block, or the selected run of siblings. */
  blocks: BlockRef[]
}

export function shortcutHint(digit: number | undefined) {
  return digit === undefined ? undefined : `Ctrl+Shift+${digit}`
}

export function TypeList({
  types,
  onPick,
}: {
  types: BlockTypeId[]
  onPick: (type: BlockTypeId) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      {BLOCK_TYPES.filter((type) => types.includes(type.id)).map((type) => (
        <MenuItem
          key={type.id}
          icon={BLOCK_ICONS[type.id]}
          label={t(type.labelKey)}
          hint={shortcutHint(type.shortcutDigit)}
          onSelect={() => onPick(type.id)}
        />
      ))}
    </>
  )
}

export const TURN_INTO_TYPES = BLOCK_TYPES.filter((type) => type.id !== 'divider').map((type) => type.id)
const INSERT_TYPES = BLOCK_TYPES.map((type) => type.id)

function pasteFromClipboard(editor: Editor) {
  void readClipboardText()
    .then((text) => editor.chain().focus().insertContent(text, { contentType: 'markdown' }).run())
    .catch(() => undefined)
}

/** Cut / Copy / Paste at the top of the right-click menu. */
function ClipboardItems({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const { t } = useTranslation()
  const hasText = !editor.state.selection.empty
  const run = (action: () => void) => () => {
    onDone()
    action()
  }
  return (
    <>
      {hasText && (
        <>
          <MenuItem
            icon={Scissors}
            label={t('menuCut')}
            hint="Ctrl+X"
            onSelect={run(() => document.execCommand('cut'))}
          />
          <MenuItem
            icon={Copy}
            label={t('menuCopy')}
            hint="Ctrl+C"
            onSelect={run(() => document.execCommand('copy'))}
          />
        </>
      )}
      <MenuItem
        icon={ClipboardPaste}
        label={t('menuPaste')}
        hint="Ctrl+V"
        onSelect={run(() => pasteFromClipboard(editor))}
      />
      <Divider />
    </>
  )
}

function Divider(): ReactNode {
  return <div className="my-1 h-px bg-border" role="separator" />
}

/** Menu of the six-dot handle (block actions) and of the plus button (insert below). */
export function BlockMenu({
  editor,
  menu,
  notePath,
  onClose,
}: {
  editor: Editor
  menu: BlockMenuState
  notePath: string
  /** `restoreCursor` is true when the user dismissed the menu without choosing anything. */
  onClose: (restoreCursor: boolean) => void
}) {
  const { t } = useTranslation()
  const [submenu, setSubmenu] = useState<'turnInto' | 'color' | 'calloutType' | null>(null)
  const last = menu.blocks.at(-1)
  if (!last) return null

  const run = (action: () => void) => {
    onClose(false)
    action()
  }

  if (menu.kind === 'insert') {
    return (
      <MenuPanel x={menu.x} y={menu.y} onDismiss={() => onClose(true)}>
        <TypeList
          types={INSERT_TYPES}
          onPick={(type) => run(() => insertBelow(editor, last.pos, type))}
        />
      </MenuPanel>
    )
  }

  const link = menu.blocks.length === 1 ? headingLink(editor, menu.blocks[0].pos, notePath) : null

  return (
    <MenuPanel x={menu.x} y={menu.y} onDismiss={() => onClose(true)}>
      {menu.kind === 'context' && <ClipboardItems editor={editor} onDone={() => onClose(false)} />}
      {menu.blocks.every((block) => canTurnInto(block.node)) && (
        <div className="relative">
          <MenuItem
            icon={Repeat2}
            label={t('blockTurnInto')}
            onSelect={() => setSubmenu((open) => (open === 'turnInto' ? null : 'turnInto'))}
            trailing={<ChevronRight className="size-4 opacity-50" />}
          />
          {submenu === 'turnInto' && (
            <div className="absolute left-full top-0 ml-1 min-w-[12rem] rounded-md border bg-popover p-1 shadow-md">
              <TypeList
                types={TURN_INTO_TYPES}
                onPick={(type) => run(() => turnIntoBlocks(editor, menu.blocks, type))}
              />
            </div>
          )}
        </div>
      )}
      <div className="relative">
        <MenuItem
          icon={Palette}
          label={t('blockColor')}
          onSelect={() => setSubmenu((open) => (open === 'color' ? null : 'color'))}
          trailing={<ChevronRight className="size-4 opacity-50" />}
        />
        {submenu === 'color' && (
          <div className="absolute left-full top-0 ml-1 rounded-md border bg-popover p-1 shadow-md">
            <ColorPicker
              onPick={(target, color) => run(() => colorBlocks(editor, menu.blocks, target, color))}
            />
          </div>
        )}
      </div>
      {menu.blocks.length === 1 && menu.blocks[0].node.type.name === 'callout' && (
        <div className="relative">
          <MenuItem
            icon={Info}
            label={t('calloutChangeType')}
            onSelect={() => setSubmenu((open) => (open === 'calloutType' ? null : 'calloutType'))}
            trailing={<ChevronRight className="size-4 opacity-50" />}
          />
          {submenu === 'calloutType' && (
            <div className="absolute left-full top-0 ml-1 min-w-[10rem] rounded-md border bg-popover p-1 shadow-md">
              {CALLOUT_TYPES.map((type) => (
                <MenuItem
                  key={type}
                  label={`${CALLOUT_ICONS[type]}  ${t(`callout_${type}`)}`}
                  onSelect={() => run(() => setCalloutType(editor, menu.blocks[0].pos, type))}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <MenuItem
        icon={CopyPlus}
        label={t('blockDuplicate')}
        hint="Ctrl+D"
        onSelect={() => run(() => duplicateBlocks(editor, menu.blocks))}
      />
      {link && (
        <MenuItem
          icon={Link2}
          label={t('blockCopyLink')}
          onSelect={() => run(() => void navigator.clipboard.writeText(link))}
        />
      )}
      <MenuItem
        icon={Trash2}
        label={t('blockDelete')}
        destructive
        onSelect={() => run(() => deleteBlocks(editor, menu.blocks))}
      />
    </MenuPanel>
  )
}
