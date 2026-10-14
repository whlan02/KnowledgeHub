import { describe, expect, it } from 'vitest'
import { buildTree } from '@/lib/file-tree-model'
import { isInside, joinPath, nameOf, parentOf, remapPath, uniqueName } from '@/lib/path-ops'

const note = (path: string) => ({ id: path, path, title: path, folder: parentOf(path) })

describe('path helpers', () => {
  it('splits and joins paths', () => {
    expect(parentOf('a/b/c.md')).toBe('a/b')
    expect(parentOf('c.md')).toBe('')
    expect(nameOf('a/b/c.md')).toBe('c.md')
    expect(joinPath('', 'c.md')).toBe('c.md')
    expect(joinPath('a/b', 'c.md')).toBe('a/b/c.md')
  })

  it('tells what is inside a folder without matching look-alike names', () => {
    expect(isInside('guides/a.md', 'guides')).toBe(true)
    expect(isInside('guides', 'guides')).toBe(true)
    expect(isInside('guides-old/a.md', 'guides')).toBe(false)
  })

  it('moves paths along with a renamed folder', () => {
    expect(remapPath('guides/a.md', 'guides', 'docs')).toBe('docs/a.md')
    expect(remapPath('guides/deep/a.md', 'guides', 'x/guides')).toBe('x/guides/deep/a.md')
    expect(remapPath('other/a.md', 'guides', 'docs')).toBe('other/a.md')
    expect(remapPath('a.md', 'a.md', 'b.md')).toBe('b.md')
  })

  it('picks a name that does not clash, ignoring letter case', () => {
    expect(uniqueName('Untitled', '.md', [])).toBe('Untitled.md')
    expect(uniqueName('Untitled', '.md', ['Untitled.md'])).toBe('Untitled 2.md')
    expect(uniqueName('Untitled', '.md', ['untitled.md', 'Untitled 2.md'])).toBe('Untitled 3.md')
    expect(uniqueName('New folder', '', ['New folder'])).toBe('New folder 2')
  })
})

describe('buildTree', () => {
  it('nests notes under their folders, folders first', () => {
    const tree = buildTree([note('z.md'), note('guides/a.md'), note('guides/deep/b.md')])
    expect(tree.children.map((c) => c.name)).toEqual(['guides', 'z.md'])
    const guides = tree.children[0]
    expect(guides.children.map((c) => c.name)).toEqual(['deep', 'a.md'])
    expect(guides.children[1].note?.path).toBe('guides/a.md')
  })

  it('shows empty folders', () => {
    const tree = buildTree([note('a.md')], ['empty', 'empty/inner'])
    expect(tree.children.map((c) => c.name)).toEqual(['empty', 'a.md'])
    expect(tree.children[0].children.map((c) => c.path)).toEqual(['empty/inner'])
  })

  it('does not duplicate a folder that has both a listing and notes', () => {
    const tree = buildTree([note('guides/a.md')], ['guides'])
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].children).toHaveLength(1)
  })
})
