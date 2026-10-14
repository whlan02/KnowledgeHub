import { describe, expect, it } from 'vitest'
import { roundTrip } from '@/test/editor'

/**
 * Opening a note and saving it again must not lose or garble anything, because the Markdown file
 * on disk (and in Git) is the only copy. These cases are what the app's syntax extensions promise.
 */

/** Syntax that should come back exactly as written. */
const STABLE: Record<string, string> = {
  heading: '## Title',
  'inline marks': 'a **bold** and *italic* and ~~gone~~ and `code` word',
  link: 'see [the docs](./other.md) and [site](https://example.com)',
  underline: 'some <u>underlined</u> text',
  'text color': 'a {red}colored{/red} word',
  'background color': 'a {bg-yellow}marked{/bg-yellow} word',
  'color inside bold': '**{blue}both{/blue}**',
  'bullet list': '- one\n- two\n- three',
  'ordered list': '1. first\n2. second',
  'nested list': '- parent\n  - child',
  'task list': '- [ ] open\n- [x] done',
  quote: '> quoted text',
  'code block': '```ts\nconst x = 1\n```',
  divider: 'before\n\n---\n\nafter',
  image: '![alt text](images/pic.png)',
  'callout note': '> [!NOTE]\n> Remember this',
  'callout warning with list': '> [!WARNING]\n> Careful\n>\n> - one\n> - two',
  toggle: '<details>\n<summary>More</summary>\n\nHidden **text**\n\n</details>',
  'toggle with list': '<details>\n<summary>More</summary>\n\n- a\n- b\n\n</details>',
}

describe('Markdown round trip', () => {
  for (const [name, markdown] of Object.entries(STABLE)) {
    it(`keeps ${name} as written`, () => {
      expect(roundTrip(markdown)).toBe(markdown)
    })
  }

  it('is stable when saved twice', () => {
    for (const markdown of Object.values(STABLE)) {
      const once = roundTrip(markdown)
      expect(roundTrip(once)).toBe(once)
    }
  })

  it('keeps both colors when they overlap', () => {
    const out = roundTrip('{red}{bg-yellow}both{/bg-yellow}{/red}')
    expect(out).toContain('{red}')
    expect(out).toContain('{bg-yellow}')
    expect(out).toContain('both')
    expect(roundTrip(out)).toBe(out)
  })

  it('writes an empty toggle without stray blank lines', () => {
    expect(roundTrip('<details>\n<summary>Only a title</summary>\n\n</details>')).toBe(
      '<details>\n<summary>Only a title</summary>\n\n</details>',
    )
  })

  it('reads a toggle nested in a toggle', () => {
    const markdown =
      '<details>\n<summary>Outer</summary>\n\n<details>\n<summary>Inner</summary>\n\nBody\n\n</details>\n\n</details>'
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('does not treat a lone brace as a color tag', () => {
    expect(roundTrip('keep {braces} and {red} alone')).toBe('keep {braces} and {red} alone')
  })

  it('aligns table columns but keeps every cell', () => {
    const out = roundTrip('| a | b |\n| --- | --- |\n| 1 | 2 |').trim()
    expect(out).toBe('| a   | b   |\n| --- | --- |\n| 1   | 2   |')
    expect(roundTrip(out).trim()).toBe(out)
  })

  it('reformats loose list markers but keeps the content', () => {
    expect(roundTrip('* one\n* two')).toBe('- one\n- two')
  })
})
