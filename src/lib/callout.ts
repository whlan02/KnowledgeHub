import { mergeAttributes, Node, type MarkdownToken } from '@tiptap/core'

export const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const
export type CalloutType = (typeof CALLOUT_TYPES)[number]

/** The icon shown for each type; the editor styles use the same ones. */
export const CALLOUT_ICONS: Record<CalloutType, string> = {
  note: 'ℹ️',
  tip: '💡',
  important: '❗',
  warning: '⚠️',
  caution: '🚫',
}

/** `> [!NOTE]` followed by the `>` lines that make up the body (GitHub's alert syntax). */
const ALERT_RE = /^> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)((?:>.*(?:\n|$))*)/i

const stripQuote = (line: string) => line.replace(/^> ?/, '')

/** A highlighted box with an icon, stored as a GitHub alert so it also renders on GitHub. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'note' as CalloutType,
        parseHTML: (element) => element.getAttribute('data-callout') ?? 'note',
        renderHTML: (attributes) => ({ 'data-callout': attributes.type }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'callout' }, HTMLAttributes), 0]
  },

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src) => src.search(/^> ?\[!/m),
    tokenize(src, _tokens, lexer) {
      const match = ALERT_RE.exec(src)
      if (!match) return undefined
      const body = match[2].split('\n').map(stripQuote).join('\n')
      return {
        type: 'callout',
        raw: match[0],
        calloutType: match[1].toLowerCase(),
        tokens: lexer.blockTokens(body),
      } as MarkdownToken
    },
  },

  parseMarkdown(token, helpers) {
    const content = helpers.parseChildren(token.tokens || [])
    return helpers.createNode(
      'callout',
      { type: (token as MarkdownToken & { calloutType?: string }).calloutType ?? 'note' },
      content.length > 0 ? content : [{ type: 'paragraph' }],
    )
  },

  renderMarkdown(node, helpers) {
    const body = helpers.renderChildren(node.content ?? [], '\n\n')
    const lines = body.split('\n').map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    return [`> [!${String(node.attrs?.type ?? 'note').toUpperCase()}]`, ...lines].join('\n')
  },
})
