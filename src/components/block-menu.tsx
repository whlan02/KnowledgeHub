import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import {
  ChevronRight,
  Copy,
  Link2,
  Repeat2,
  Trash2,
} from 'lucide-react'
import {
  BLOCK_TYPES,
  canTurnInto,
  deleteBlock,
  duplicateBlock,
  headingLink,
  insertBelow,
  turnInto,
  type BlockTypeId,
} from '@/lib/block-actions'
import { BLOCK_ICONS } from '@/components/block-icons'
import { MenuItem, MenuPanel } from '@/components/menu-panel'

export type BlockMenuState = {
  /** `block`: actions for the block. `insert`: pick a type to add below it. */
  kind: 'block' | 'insert'
  x: number
  y: number
  pos: number
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
  const [turnIntoOpen, setTurnIntoOpen] = useState(false)
  const node = editor.state.doc.nodeAt(menu.pos)
  if (!node) return null

  const run = (action: () => void) => {
    onClose(false)
    action()
  }

  if (menu.kind === 'insert') {
    return (
      <MenuPanel x={menu.x} y={menu.y} onDismiss={() => onClose(true)}>
        <TypeList
          types={INSERT_TYPES}
          onPick={(type) => run(() => insertBelow(editor, menu.pos, type))}
        />
      </MenuPanel>
    )
  }

  const link = headingLink(editor, menu.pos, notePath)

  return (
    <MenuPanel x={menu.x} y={menu.y} onDismiss={() => onClose(true)}>
      {canTurnInto(node) && (
        <div className="relative">
          <MenuItem
            icon={Repeat2}
            label={t('blockTurnInto')}
            onSelect={() => setTurnIntoOpen((open) => !open)}
            trailing={<ChevronRight className="size-4 opacity-50" />}
          />
          {turnIntoOpen && (
            <div className="absolute left-full top-0 ml-1 min-w-[12rem] rounded-md border bg-popover p-1 shadow-md">
              <TypeList
                types={TURN_INTO_TYPES}
                onPick={(type) => run(() => turnInto(editor, menu.pos, type))}
              />
            </div>
          )}
        </div>
      )}
      <MenuItem
        icon={Copy}
        label={t('blockDuplicate')}
        hint="Ctrl+D"
        onSelect={() => run(() => duplicateBlock(editor, menu.pos))}
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
        onSelect={() => run(() => deleteBlock(editor, menu.pos))}
      />
    </MenuPanel>
  )
}
