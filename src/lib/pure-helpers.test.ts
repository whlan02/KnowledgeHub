import { beforeEach, describe, expect, it } from 'vitest'
import { stripColorTags, loadLastColor, saveLastColor } from '@/lib/colors'
import { titleFromContent } from '@/lib/fs-notes'
import { toNoteMarkdown } from '@/lib/note-markdown'
import { slashItems } from '@/lib/slash-items'
import { extractToc, headingSlugText } from '@/lib/toc'
import { decodeNotePath, encodeNotePath, resolveAssetPath, resolveNoteLink } from '@/lib/utils'
import { createEditor } from '@/test/editor'

describe('resolveNoteLink', () => {
  it('resolves relative links against the note folder', () => {
    expect(resolveNoteLink('guides/a.md', './b.md')).toBe('guides/b.md')
    expect(resolveNoteLink('guides/a.md', '../README.md')).toBe('README.md')
  })

  it('keeps the heading anchor out of the path', () => {
    expect(resolveNoteLink('a.md', 'b.md#section')).toBe('b.md')
  })

  it('ignores external links and in-page anchors', () => {
    expect(resolveNoteLink('a.md', 'https://example.com/x.md')).toBeNull()
    expect(resolveNoteLink('a.md', 'mailto:me@example.com')).toBeNull()
    expect(resolveNoteLink('a.md', '#heading')).toBeNull()
  })

  it('ignores links to files that are not notes', () => {
    expect(resolveNoteLink('a.md', './diagram.png')).toBeNull()
  })

  it('maps a folder link to its README', () => {
    expect(resolveNoteLink('a.md', './guides/')).toBe('guides/README.md')
  })

  it('decodes percent-encoded names', () => {
    expect(resolveNoteLink('a.md', './%E7%AC%94%E8%AE%B0.md')).toBe('笔记.md')
  })
})

describe('resolveAssetPath', () => {
  it('resolves an image next to a nested note', () => {
    expect(resolveAssetPath('guides/a.md', 'img/p.png')).toBe('guides/img/p.png')
  })

  it('does not climb above the workspace root', () => {
    expect(resolveAssetPath('a.md', '../../secret.png')).toBe('secret.png')
  })

  it('leaves absolute URLs alone', () => {
    expect(resolveAssetPath('a.md', 'https://example.com/p.png')).toBeNull()
    expect(resolveAssetPath('a.md', 'data:image/png;base64,AAAA')).toBeNull()
  })

  it('decodes percent-encoded names', () => {
    expect(resolveAssetPath('a.md', 'my%20pic.png')).toBe('my pic.png')
  })
})

describe('note paths in URLs', () => {
  it('round-trips names with spaces and non-ASCII characters', () => {
    const path = '学习 笔记/第 1 篇.md'
    expect(decodeNotePath(encodeNotePath(path))).toBe(path)
  })
})

describe('colors', () => {
  beforeEach(() => localStorage.clear())

  it('strips tags and keeps the text', () => {
    expect(stripColorTags('{red}a{/red} {bg-blue}b{/bg-blue} {nope}c')).toBe('a b {nope}c')
  })

  it('remembers the last color and ignores bad stored data', () => {
    expect(loadLastColor()).toBeNull()
    saveLastColor({ target: 'background', color: 'green' })
    expect(loadLastColor()).toEqual({ target: 'background', color: 'green' })
    localStorage.setItem('kh-last-color', '{"target":"text","color":"magenta"}')
    expect(loadLastColor()).toBeNull()
  })
})

describe('table of contents', () => {
  it('lists h2 to h4 with github-style ids', () => {
    const toc = extractToc('# Title\n\n## One\n\n### Two words\n\n## One')
    expect(toc.map((item) => [item.level, item.text, item.id])).toEqual([
      [2, 'One', 'one'],
      [3, 'Two words', 'two-words'],
      [2, 'One', 'one-1'],
    ])
  })

  it('ignores color tags in heading text and ids', () => {
    expect(headingSlugText('{red}Hot{/red} topic')).toBe('Hot topic')
    expect(extractToc('## {red}Hot{/red} topic')[0].id).toBe('hot-topic')
  })
})

describe('titleFromContent', () => {
  it('uses the first level-1 heading without color tags', () => {
    expect(titleFromContent('intro\n\n# {red}Plan{/red}\n', 'file')).toBe('Plan')
  })

  it('falls back to the file name', () => {
    expect(titleFromContent('no heading here', 'file')).toBe('file')
  })
})

describe('slash menu items', () => {
  beforeEach(() => localStorage.clear())

  it('lists blocks before colors when nothing is typed', () => {
    const groups = slashItems('').map((item) => item.group)
    expect(groups.indexOf('basic')).toBeLessThan(groups.indexOf('color'))
  })

  it('finds a block by its English or Chinese name', () => {
    expect(slashItems('heading').map((item) => item.id)).toContain('block:h1')
    expect(slashItems('标题').map((item) => item.id)).toContain('block:h2')
  })

  it('finds a color by name, text and background separately', () => {
    const ids = slashItems('red').map((item) => item.id)
    expect(ids).toContain('color:text:red')
    expect(ids).toContain('color:background:red')
  })

  it('finds callout variants', () => {
    expect(slashItems('warning').map((item) => item.id)).toContain('callout:warning')
  })

  it('returns nothing for gibberish', () => {
    expect(slashItems('zzzzqq')).toEqual([])
  })
})

describe('toNoteMarkdown', () => {
  it('ends with exactly one newline, even after a trailing list', () => {
    const editor = createEditor('- a\n- b')
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'paragraph' })
    expect(toNoteMarkdown(editor)).toBe('- a\n- b\n')
  })

  it('is empty for an empty note', () => {
    expect(toNoteMarkdown(createEditor(''))).toBe('')
  })
})
