import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguagePicker } from '@/components/language-picker'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

afterEach(cleanup)

function setup(value = '') {
  const onChange = vi.fn()
  render(<LanguagePicker value={value} disabled={false} onChange={onChange} />)
  return onChange
}

const openPicker = () => fireEvent.click(screen.getByRole('button'))
const search = () => screen.getByPlaceholderText('codeLanguageSearch')

describe('LanguagePicker', () => {
  it('shows the current language on the button and a closed list', () => {
    setup('python')
    expect(screen.getByRole('button').textContent).toBe('Python')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens a searchable list with the search field focused', () => {
    setup()
    openPicker()
    expect(document.activeElement).toBe(search())
    expect(screen.getAllByRole('option').length).toBeGreaterThan(50)
  })

  it('filters while typing and picks the highlighted language with Enter', () => {
    const onChange = setup()
    openPicker()
    fireEvent.change(search(), { target: { value: 'rus' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Rust'])
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('rust')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('moves the highlight with the arrow keys and picks by click', () => {
    const onChange = setup()
    openPicker()
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('abap')
  })

  it('closes on Escape without changing anything', () => {
    const onChange = setup()
    openPicker()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('says so when nothing matches', () => {
    setup()
    openPicker()
    fireEvent.change(search(), { target: { value: 'zzzz' } })
    expect(screen.getByText('codeLanguageNone')).toBeTruthy()
  })
})
