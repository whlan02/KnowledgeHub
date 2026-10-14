import type { Editor } from '@tiptap/core'
import i18n from '@/i18n'
import { BLOCK_TYPES, currentBlockPos, turnInto, type BlockType, type BlockTypeId } from '@/lib/block-actions'
import { targetBlocks } from '@/lib/block-selection'
import { colorBlocks } from '@/lib/color-actions'
import { COLOR_NAMES, type ColorChoice, type ColorTarget } from '@/lib/colors'

const RECENT_KEY = 'kh-slash-recent'
const MAX_RECENT = 3

export type SlashIcon =
  | { kind: 'block'; id: BlockTypeId }
  | { kind: 'swatch'; target: ColorTarget; color: ColorChoice }

export type SlashGroup = 'recent' | 'basic' | 'color'

export type SlashItem = {
  id: string
  group: SlashGroup
  label: string
  /** Extra words the menu matches besides the label. */
  keywords: string[]
  shortcut?: string
  icon: SlashIcon
  /** Runs after the typed `/…` has been removed. */
  apply: (editor: Editor) => void
}

const translate = (key: string, lng: string, options?: Record<string, unknown>) =>
  String(i18n.t(key, { lng, ...options }))

function blockItem(type: BlockType): SlashItem {
  return {
    id: `block:${type.id}`,
    group: 'basic',
    label: translate(type.labelKey, i18n.language),
    keywords: [...type.keywords, translate(type.labelKey, 'zh'), translate(type.labelKey, 'en')],
    shortcut: type.shortcutDigit === undefined ? undefined : `Ctrl+Shift+${type.shortcutDigit}`,
    icon: { kind: 'block', id: type.id },
    apply(editor) {
      if (type.id === 'divider') editor.chain().focus().setHorizontalRule().run()
      else turnInto(editor, currentBlockPos(editor), type.id)
    },
  }
}

function colorItem(target: ColorTarget, color: Exclude<ColorChoice, 'default'>): SlashItem {
  const labelKey = target === 'text' ? 'slashColorText' : 'slashColorBackground'
  const label = (lng: string) => translate(labelKey, lng, { color: translate(`color_${color}`, lng) })
  return {
    id: `color:${target}:${color}`,
    group: 'color',
    label: label(i18n.language),
    keywords: [
      color,
      target === 'text' ? `${color} text` : `${color} background`,
      target === 'text' ? '' : `bg-${color}`,
      label('zh'),
      label('en'),
    ].filter(Boolean),
    icon: { kind: 'swatch', target, color },
    apply: (editor) => colorBlocks(editor, targetBlocks(editor), target, color),
  }
}

function allItems(): SlashItem[] {
  return [
    ...BLOCK_TYPES.map(blockItem),
    ...(['text', 'background'] as const).flatMap((target) =>
      COLOR_NAMES.map((color) => colorItem(target, color)),
    ),
  ]
}

function loadRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function rememberSlashChoice(id: string) {
  try {
    const next = [id, ...loadRecent().filter((recent) => recent !== id)].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Ignore quota / private mode errors.
  }
}

function matchRank(item: SlashItem, query: string) {
  const names = [item.label, ...item.keywords].map((name) => name.toLowerCase())
  if (names.some((name) => name.startsWith(query))) return 0
  if (names.some((name) => name.includes(query))) return 1
  return -1
}

/**
 * What the `/` menu lists for `query`. With nothing typed: recently used first, then the blocks,
 * then the colours. Otherwise the matches, best first.
 */
export function slashItems(query: string): SlashItem[] {
  const items = allItems()
  const q = query.trim().toLowerCase()
  if (!q) {
    const recent = loadRecent()
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is SlashItem => Boolean(item))
      .map((item) => ({ ...item, group: 'recent' as const }))
    const recentIds = new Set(recent.map((item) => item.id))
    return [...recent, ...items.filter((item) => !recentIds.has(item.id))]
  }
  return items
    .map((item) => ({ item, rank: matchRank(item, q) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.item)
}
