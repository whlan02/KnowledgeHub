import { Mark, type MarkdownToken } from '@tiptap/core'
import {
  BACKGROUND_COLOR_RE,
  TEXT_COLOR_RE,
  type ColorName,
  type ColorTarget,
} from '@/lib/colors'

export const COLOR_MARK_NAMES: Record<ColorTarget, string> = {
  text: 'textColor',
  background: 'backgroundColor',
}

const TAG_PREFIX: Record<ColorTarget, string> = { text: '', background: 'bg-' }
const MATCHERS: Record<ColorTarget, RegExp> = { text: TEXT_COLOR_RE, background: BACKGROUND_COLOR_RE }

/** A mark stored in Markdown as `{red}…{/red}` (text colour) or `{bg-red}…{/bg-red}` (background). */
function colorMark(target: ColorTarget) {
  const name = COLOR_MARK_NAMES[target]
  const prefix = TAG_PREFIX[target]
  const dataAttribute = `data-${target === 'text' ? 'text' : 'bg'}-color`
  const matcher = MATCHERS[target]

  return Mark.create({
    name,
    addAttributes() {
      return {
        color: {
          default: null,
          parseHTML: (element) => element.getAttribute(dataAttribute),
          renderHTML: (attributes) => ({ [dataAttribute]: attributes.color }),
        },
      }
    },
    parseHTML() {
      return [{ tag: `span[${dataAttribute}]` }]
    },
    renderHTML({ HTMLAttributes }) {
      return ['span', HTMLAttributes, 0]
    },
    markdownTokenizer: {
      name,
      level: 'inline',
      start: (src) => src.indexOf('{'),
      tokenize(src, _tokens, lexer) {
        const match = matcher.exec(src)
        if (!match) return undefined
        return {
          type: name,
          raw: match[0],
          text: match[2],
          color: match[1] as ColorName,
          tokens: lexer.inlineTokens(match[2]),
        } as MarkdownToken
      },
    },
    parseMarkdown(token, helpers) {
      return helpers.applyMark(name, helpers.parseInline(token.tokens || []), {
        color: (token as MarkdownToken & { color?: string }).color,
      })
    },
    renderMarkdown(node, helpers) {
      const tag = `${prefix}${node.attrs?.color}`
      return `{${tag}}${helpers.renderChildren(node)}{/${tag}}`
    },
  })
}

export const TextColor = colorMark('text')
export const BackgroundColor = colorMark('background')
