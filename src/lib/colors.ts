export const COLOR_NAMES = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const

export type ColorName = (typeof COLOR_NAMES)[number]
export type ColorTarget = 'text' | 'background'
/** A colour to apply, or `default` to clear it. */
export type ColorChoice = ColorName | 'default'

const NAMES = COLOR_NAMES.join('|')

/** `{red}text{/red}` and `{bg-yellow}text{/bg-yellow}` at the start of a string. */
export const TEXT_COLOR_RE = new RegExp(String.raw`^\{(${NAMES})\}([\s\S]+?)\{/\1\}`)
export const BACKGROUND_COLOR_RE = new RegExp(String.raw`^\{bg-(${NAMES})\}([\s\S]+?)\{/bg-\1\}`)

const ANY_COLOR_TAG_RE = new RegExp(String.raw`\{/?(?:bg-)?(?:${NAMES})\}`, 'g')

/** Remove the colour tags, leaving the text, for titles, slugs and plain-text previews. */
export function stripColorTags(markdown: string) {
  return markdown.replace(ANY_COLOR_TAG_RE, '')
}

const LAST_COLOR_KEY = 'kh-last-color'

export type LastColor = { target: ColorTarget; color: ColorChoice }

export function loadLastColor(): LastColor | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_COLOR_KEY) ?? 'null') as LastColor | null
    const known = parsed && (parsed.color === 'default' || COLOR_NAMES.includes(parsed.color))
    return known && (parsed.target === 'text' || parsed.target === 'background') ? parsed : null
  } catch {
    return null
  }
}

export function saveLastColor(last: LastColor) {
  try {
    localStorage.setItem(LAST_COLOR_KEY, JSON.stringify(last))
  } catch {
    // Ignore quota / private mode errors.
  }
}
