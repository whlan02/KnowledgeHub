import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { MenuPanel } from '@/components/menu-panel'
import { filterLanguages, languageLabel, languageOptions } from '@/lib/code-languages'
import { cn } from '@/lib/utils'

const PANEL_WIDTH_PX = 260
const PANEL_GAP_PX = 4

/** Index after moving `delta` steps in a list of `count` items, wrapping around. */
function stepIndex(index: number, delta: number, count: number) {
  return count === 0 ? 0 : (index + delta + count) % count
}

/** The language list as a searchable popup under its button, like a command palette. */
export function LanguagePicker({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled: boolean
  onChange: (id: string) => void
}) {
  const { t } = useTranslation()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)

  const open = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setAnchor({ x: rect.right - PANEL_WIDTH_PX, y: rect.bottom + PANEL_GAP_PX })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="code-language"
        disabled={disabled}
        aria-haspopup="listbox"
        onClick={open}
      >
        {languageLabel(value)}
        <ChevronDown />
      </button>
      {anchor && (
        <MenuPanel x={anchor.x} y={anchor.y} onDismiss={() => setAnchor(null)} className="p-0">
          <LanguageList
            value={value}
            placeholder={t('codeLanguageSearch')}
            noResults={t('codeLanguageNone')}
            onPick={(id) => {
              onChange(id)
              setAnchor(null)
            }}
          />
        </MenuPanel>
      )}
    </>
  )
}

function LanguageList({
  value,
  placeholder,
  noResults,
  onPick,
}: {
  value: string
  placeholder: string
  noResults: string
  onPick: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const activeRef = useRef<HTMLLIElement>(null)
  const results = useMemo(() => filterLanguages(languageOptions(value), query), [value, query])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active, results])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => stepIndex(current, event.key === 'ArrowDown' ? 1 : -1, results.length))
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault()
      onPick(results[active].id)
    }
  }

  return (
    <div style={{ width: PANEL_WIDTH_PX }}>
      <div className="p-2">
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        />
      </div>
      <ul role="listbox" className="max-h-72 overflow-y-auto px-1 pb-1">
        {results.map((language, index) => (
          <li
            key={language.id}
            ref={index === active ? activeRef : undefined}
            role="option"
            aria-selected={language.id === value}
            onMouseEnter={() => setActive(index)}
            onClick={() => onPick(language.id)}
            className={cn(
              'cursor-pointer rounded-md px-2.5 py-1.5 text-sm',
              index === active && 'bg-accent text-accent-foreground',
              language.id === value && 'font-medium',
            )}
          >
            {language.label}
          </li>
        ))}
        {results.length === 0 && <li className="px-2.5 py-2 text-sm text-muted-foreground">{noResults}</li>}
      </ul>
    </div>
  )
}
