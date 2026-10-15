import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'

describe('spell check', () => {
  // Notes mix Chinese, English and German; a single-language dictionary would underline most of it.
  it('is off for the whole app', () => {
    expect(html).toMatch(/<html[^>]*spellcheck="false"/)
  })
})
