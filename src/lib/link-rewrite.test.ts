import { describe, expect, it } from 'vitest'
import { rewriteLinks } from '@/lib/link-rewrite'

describe('rewriteLinks', () => {
  it('follows a renamed note', () => {
    expect(rewriteLinks('see [a](b.md)', 'x.md', 'x.md', 'b.md', 'c.md')).toBe('see [a](c.md)')
  })

  it('keeps the heading anchor', () => {
    expect(rewriteLinks('[a](b.md#intro)', 'x.md', 'x.md', 'b.md', 'c.md')).toBe('[a](c.md#intro)')
  })

  it('follows a note moved into a folder, from another folder', () => {
    expect(rewriteLinks('[a](../b.md)', 'dir/x.md', 'dir/x.md', 'b.md', 'sub/b.md')).toBe('[a](../sub/b.md)')
  })

  it('follows a renamed folder', () => {
    expect(rewriteLinks('[a](docs/b.md)', 'x.md', 'x.md', 'docs', 'guide')).toBe('[a](guide/b.md)')
  })

  it('re-points relative links of a note that moved', () => {
    expect(rewriteLinks('[a](b.md) ![i](assets/p.png)', 'x.md', 'sub/x.md', 'x.md', 'sub/x.md')).toBe(
      '[a](../b.md) ![i](../assets/p.png)',
    )
  })

  it('leaves links between two notes that moved together alone', () => {
    expect(rewriteLinks('[a](b.md)', 'docs/x.md', 'guide/x.md', 'docs', 'guide')).toBe('[a](b.md)')
  })

  it('ignores external links, anchors, fences and unrelated notes', () => {
    const text = '[w](https://b.md) [h](#b.md)\n```\n[a](b.md)\n```\n[o](other.md)'
    expect(rewriteLinks(text, 'x.md', 'x.md', 'b.md', 'c.md')).toBe(text)
  })

  it('leaves links written inside inline code alone', () => {
    expect(rewriteLinks('`[a](b.md)` and [a](b.md)', 'x.md', 'x.md', 'b.md', 'c.md')).toBe('`[a](b.md)` and [a](c.md)')
  })

  it('keeps percent-encoding and encodes spaces', () => {
    expect(rewriteLinks('[a](%E5%9B%BE.md)', 'x.md', 'x.md', '图.md', '新 图.md')).toBe('[a](%E6%96%B0%20%E5%9B%BE.md)')
    expect(rewriteLinks('[a](b.md)', 'x.md', 'x.md', 'b.md', 'my note.md')).toBe('[a](my%20note.md)')
  })
})
