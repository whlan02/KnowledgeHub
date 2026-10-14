import { useTranslation } from 'react-i18next'
import { COLOR_NAMES, loadLastColor, type ColorChoice, type ColorTarget } from '@/lib/colors'
import { cn } from '@/lib/utils'

/** The small "A" tile that shows a colour; styled by the same data attributes as the text. */
export function ColorSwatch({
  target,
  color,
  className,
}: {
  target: ColorTarget
  color: ColorChoice
  className?: string
}) {
  const attributes =
    color === 'default'
      ? {}
      : target === 'text'
        ? { 'data-text-color': color }
        : { 'data-bg-color': color }
  return (
    <span
      {...attributes}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-sm border text-xs font-medium',
        className,
      )}
    >
      A
    </span>
  )
}

function ColorRow({
  target,
  color,
  onPick,
}: {
  target: ColorTarget
  color: ColorChoice
  onPick: (target: ColorTarget, color: ColorChoice) => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
      onClick={() => onPick(target, color)}
    >
      <ColorSwatch target={target} color={color} />
      <span className="truncate">{t(`color_${color}`)}</span>
    </button>
  )
}

const CHOICES: ColorChoice[] = ['default', ...COLOR_NAMES]

/** Last used, text colours and background colours, as in Notion's "A" menu. */
export function ColorPicker({
  onPick,
}: {
  onPick: (target: ColorTarget, color: ColorChoice) => void
}) {
  const { t } = useTranslation()
  const last = loadLastColor()
  return (
    <div className="max-h-80 w-48 overflow-y-auto" onMouseDown={(e) => e.preventDefault()}>
      {last && (
        <>
          <div className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">{t('colorLast')}</div>
          <ColorRow target={last.target} color={last.color} onPick={onPick} />
        </>
      )}
      <div className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">{t('colorText')}</div>
      {CHOICES.map((color) => (
        <ColorRow key={`text-${color}`} target="text" color={color} onPick={onPick} />
      ))}
      <div className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">{t('colorBackground')}</div>
      {CHOICES.map((color) => (
        <ColorRow key={`bg-${color}`} target="background" color={color} onPick={onPick} />
      ))}
    </div>
  )
}
