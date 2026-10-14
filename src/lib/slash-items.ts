import i18n from '@/i18n'
import { BLOCK_TYPES, type BlockType, type BlockTypeId } from '@/lib/block-actions'

const RECENT_KEY = 'kh-slash-recent'
const MAX_RECENT = 3

function loadRecent(): BlockTypeId[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as BlockTypeId[]
    return Array.isArray(parsed) ? parsed.filter((id) => BLOCK_TYPES.some((t) => t.id === id)) : []
  } catch {
    return []
  }
}

export function rememberSlashChoice(id: BlockTypeId) {
  try {
    const next = [id, ...loadRecent().filter((recent) => recent !== id)].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Ignore quota / private mode errors.
  }
}

/** Both language labels, so `/heading` and `/标题` find the same block. */
function searchableLabels(type: BlockType) {
  return ['zh', 'en'].map((lng) => String(i18n.t(type.labelKey, { lng })).toLowerCase())
}

function matchRank(type: BlockType, query: string) {
  const names = [...searchableLabels(type), ...type.keywords.map((k) => k.toLowerCase())]
  if (names.some((name) => name.startsWith(query))) return 0
  if (names.some((name) => name.includes(query))) return 1
  return -1
}

export type SlashItem = { type: BlockType; recent: boolean }

/** What the `/` menu lists for `query`: the recently used blocks first when nothing is typed. */
export function slashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    const recent = loadRecent()
      .map((id) => BLOCK_TYPES.find((type) => type.id === id))
      .filter((type): type is BlockType => Boolean(type))
    const rest = BLOCK_TYPES.filter((type) => !recent.includes(type))
    return [
      ...recent.map((type) => ({ type, recent: true })),
      ...rest.map((type) => ({ type, recent: false })),
    ]
  }
  return BLOCK_TYPES.map((type) => ({ type, rank: matchRank(type, q) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => ({ type: entry.type, recent: false }))
}
