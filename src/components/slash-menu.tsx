import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Extension, type Editor, type Range } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { rememberSlashChoice, slashItems, type SlashItem } from '@/lib/slash-items'
import { BLOCK_ICONS } from '@/components/block-icons'
import { ColorSwatch } from '@/components/color-menu'
import { cn } from '@/lib/utils'

const POPUP_GAP_PX = 6
const VIEWPORT_MARGIN_PX = 8

const GROUP_TITLES: Record<SlashItem['group'], string> = {
  recent: 'slashRecent',
  basic: 'slashBasic',
  color: 'slashColors',
}

function SlashItemIcon({ icon }: { icon: SlashItem['icon'] }) {
  if (icon.kind === 'swatch') return <ColorSwatch target={icon.target} color={icon.color} />
  const Icon = BLOCK_ICONS[icon.id]
  return <Icon className="size-4 shrink-0 opacity-70" />
}

type SlashMenuHandle = { onKeyDown: (event: KeyboardEvent) => boolean }

/** The list shown under the cursor after typing `/`. Keys are forwarded by the suggestion plugin. */
const SlashMenuList = forwardRef<SlashMenuHandle, SuggestionProps<SlashItem, SlashItem>>(
  function SlashMenuList({ items, command }, ref) {
    const { t } = useTranslation()
    const [selected, setSelected] = useState(0)

    useEffect(() => setSelected(0), [items])

    useImperativeHandle(ref, () => ({
      onKeyDown(event) {
        if (items.length === 0) return false
        if (event.key === 'ArrowDown') {
          setSelected((index) => (index + 1) % items.length)
          return true
        }
        if (event.key === 'ArrowUp') {
          setSelected((index) => (index - 1 + items.length) % items.length)
          return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          command(items[selected])
          return true
        }
        return false
      },
    }))

    useEffect(() => {
      document.querySelector('[data-slash-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    }, [selected])

    return (
      <div
        role="listbox"
        className="max-h-80 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        onMouseDown={(e) => e.preventDefault()}
      >
        {items.length === 0 && (
          <p className="px-2 py-2 text-sm text-muted-foreground">{t('slashNoResults')}</p>
        )}
        {items.map((item, index) => {
          const showHeader = index === 0 || items[index - 1].group !== item.group
          return (
            <div key={item.id}>
              {showHeader && (
                <div className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">
                  {t(GROUP_TITLES[item.group])}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={index === selected}
                data-slash-selected={index === selected}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none',
                  index === selected && 'bg-accent',
                )}
                onMouseEnter={() => setSelected(index)}
                onClick={() => command(item)}
              >
                <SlashItemIcon icon={item.icon} />
                <span className="flex-1 truncate">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.shortcut}</span>
              </button>
            </div>
          )
        })}
      </div>
    )
  },
)

/** Place the popup under the typed `/`, or above it when there is no room below. */
function placePopup(popup: HTMLElement, rect: DOMRect | null | undefined) {
  if (!rect) return
  const { width, height } = popup.getBoundingClientRect()
  const below = rect.bottom + POPUP_GAP_PX
  const fitsBelow = below + height <= window.innerHeight - VIEWPORT_MARGIN_PX
  popup.style.top = `${fitsBelow ? below : Math.max(VIEWPORT_MARGIN_PX, rect.top - height - POPUP_GAP_PX)}px`
  popup.style.left = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN_PX))}px`
}

function renderSlashMenu() {
  let renderer: ReactRenderer<SlashMenuHandle, SuggestionProps<SlashItem, SlashItem>> | null = null
  let popup: HTMLElement | null = null
  let latest: SuggestionProps<SlashItem, SlashItem> | null = null
  // React fills the popup after it is attached, so place it again whenever its size changes.
  const resizeObserver = new ResizeObserver(() => place())

  function place() {
    if (popup && latest) placePopup(popup, latest.clientRect?.())
  }

  return {
    onStart(props: SuggestionProps<SlashItem, SlashItem>) {
      renderer = new ReactRenderer(SlashMenuList, { props, editor: props.editor })
      popup = document.createElement('div')
      popup.style.cssText = 'position:fixed;z-index:110;'
      popup.appendChild(renderer.element)
      document.body.appendChild(popup)
      resizeObserver.observe(popup)
      latest = props
      place()
    },
    onUpdate(props: SuggestionProps<SlashItem, SlashItem>) {
      renderer?.updateProps(props)
      latest = props
      place()
    },
    onKeyDown({ event }: SuggestionKeyDownProps) {
      return renderer?.ref?.onKeyDown(event) ?? false
    },
    onExit() {
      resizeObserver.disconnect()
      popup?.remove()
      renderer?.destroy()
      popup = null
      renderer = null
    },
  }
}

function applySlashChoice(editor: Editor, range: Range, item: SlashItem) {
  rememberSlashChoice(item.id)
  editor.chain().focus().deleteRange(range).run()
  item.apply(editor)
}

/** Typing `/` opens a menu of blocks, filtered as you type; Esc closes it. */
export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => slashItems(query),
        command: ({ editor, range, props }) => applySlashChoice(editor, range, props),
        render: renderSlashMenu,
      }),
    ]
  },
})
