import { describe, expect, it } from 'vitest'
import {
  CODE_LANGUAGES,
  filterLanguages,
  languageLabel,
  languageOptions,
} from '@/lib/code-languages'
import { createEditor, markdownOf } from '@/test/editor'

describe('code languages', () => {
  it('lists plain text first, then the languages alphabetically', () => {
    expect(CODE_LANGUAGES[0].id).toBe('')
    const labels = CODE_LANGUAGES.slice(1).map((l) => l.label.toLowerCase())
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en')))
  })

  it('has no duplicate fence names', () => {
    const ids = CODE_LANGUAGES.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps unknown languages of a note selectable and labelled', () => {
    expect(languageOptions('python')).toBe(CODE_LANGUAGES)
    expect(languageOptions('zig').at(-1)).toEqual({ id: 'zig', label: 'zig' })
    expect(languageLabel('cpp')).toBe('C++')
    expect(languageLabel('')).toBe('Plain text')
    expect(languageLabel('zig')).toBe('zig')
  })

  it('filters by label or fence name, prefix matches first', () => {
    const labels = (query: string) => filterLanguages(CODE_LANGUAGES, query).map((l) => l.label)
    expect(labels('script')[0]).toBe('CoffeeScript')
    expect(labels('java')[0]).toBe('Java')
    expect(labels('java')).toContain('JavaScript')
    expect(labels('PY')[0]).toBe('Python')
    expect(labels('csharp')).toEqual(['C#'])
    expect(labels('  ')).toHaveLength(CODE_LANGUAGES.length)
    expect(labels('zzzz')).toEqual([])
  })

  it('keeps the language of a fenced block and can change it', () => {
    const editor = createEditor('```python\nprint(1)\n```')
    expect(markdownOf(editor)).toBe('```python\nprint(1)\n```')
    editor.commands.updateAttributes('codeBlock', { language: 'rust' })
    expect(markdownOf(editor)).toBe('```rust\nprint(1)\n```')
    editor.commands.updateAttributes('codeBlock', { language: null })
    expect(markdownOf(editor)).toBe('```\nprint(1)\n```')
  })
})
