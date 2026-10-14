import type { MarkdownToken } from '@tiptap/core'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'

const OPENING_RE = /^<details(?:\s[^>]*)?>[ \t]*\n?/
const TAG_RE = /<details(?:\s[^>]*)?>|<\/details>/g
const SUMMARY_RE = /^\s*<summary>([\s\S]*?)<\/summary>[ \t]*\n?/

/** Index of the `</details>` that closes the block opened at the start of `src`, or -1. */
function closingIndex(src: string, openingLength: number) {
  let depth = 1
  TAG_RE.lastIndex = openingLength
  for (let tag = TAG_RE.exec(src); tag; tag = TAG_RE.exec(src)) {
    depth += tag[0].startsWith('</') ? -1 : 1
    if (depth === 0) return tag.index
  }
  return -1
}

/** A collapsible block, stored as `<details><summary>…</summary>…</details>`. */
export const Toggle = Details.extend({
  markdownTokenizer: {
    name: 'details',
    level: 'block',
    start: (src) => src.search(/^<details/m),
    tokenize(src, _tokens, lexer) {
      const opening = OPENING_RE.exec(src)
      if (!opening) return undefined
      const end = closingIndex(src, opening[0].length)
      if (end < 0) return undefined

      const inner = src.slice(opening[0].length, end)
      const summary = SUMMARY_RE.exec(inner)
      const body = summary ? inner.slice(summary[0].length) : inner
      return {
        type: 'details',
        raw: src.slice(0, end + '</details>'.length),
        summaryTokens: lexer.inlineTokens(summary ? summary[1].trim() : ''),
        tokens: lexer.blockTokens(body),
      } as MarkdownToken
    },
  },

  parseMarkdown(token, helpers) {
    const body = helpers.parseChildren(token.tokens || [])
    const summaryTokens = (token as MarkdownToken & { summaryTokens?: MarkdownToken[] }).summaryTokens
    return helpers.createNode('details', {}, [
      helpers.createNode('detailsSummary', {}, helpers.parseInline(summaryTokens ?? [])),
      helpers.createNode('detailsContent', {}, body.length > 0 ? body : [{ type: 'paragraph' }]),
    ])
  },

  renderMarkdown(node, helpers) {
    const [summary, body] = node.content ?? []
    const title = helpers.renderChildren(summary?.content ?? [])
    const content = helpers.renderChildren(body?.content ?? [], '\n\n')
    const text = content.trim() ? `${content}\n\n` : ''
    return `<details>\n<summary>${title}</summary>\n\n${text}</details>`
  },
})

export { DetailsContent as ToggleContent, DetailsSummary as ToggleSummary }
