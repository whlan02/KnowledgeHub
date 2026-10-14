import Underline from '@tiptap/extension-underline'

/** Underline stored as `<u>text</u>`, the only underline plain Markdown renderers understand. */
export const MarkdownUnderline = Underline.extend({
  renderMarkdown(node, helpers) {
    return `<u>${helpers.renderChildren(node)}</u>`
  },
  markdownTokenizer: {
    name: 'underline',
    level: 'inline',
    start: (src) => src.indexOf('<u>'),
    tokenize(src, _tokens, lexer) {
      const match = /^<u>([\s\S]+?)<\/u>/.exec(src)
      if (!match) return undefined
      return { type: 'underline', raw: match[0], text: match[1], tokens: lexer.inlineTokens(match[1]) }
    },
  },
})
