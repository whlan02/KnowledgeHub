import { describe, expect, it } from 'vitest'
import { CODE_LANGUAGES, languageOptions } from '@/lib/code-languages'
import { createEditor, markdownOf } from '@/test/editor'

describe('code languages', () => {
  it('lists plain text first and keeps unknown languages of a note selectable', () => {
    expect(CODE_LANGUAGES[0].id).toBe('')
    expect(languageOptions('python')).toBe(CODE_LANGUAGES)
    expect(languageOptions('zig').at(-1)).toEqual({ id: 'zig', label: 'zig' })
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
