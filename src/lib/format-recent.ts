export function formatRecentOpenedAt(openedAt: number, locale: string): string {
  const diffMs = openedAt - Date.now()
  const rtf = new Intl.RelativeTimeFormat(locale.startsWith('zh') ? 'zh' : 'en', { numeric: 'auto' })

  const sec = Math.round(diffMs / 1000)
  if (Math.abs(sec) < 60) return rtf.format(sec, 'second')

  const min = Math.round(sec / 60)
  if (Math.abs(min) < 60) return rtf.format(min, 'minute')

  const hour = Math.round(min / 60)
  if (Math.abs(hour) < 24) return rtf.format(hour, 'hour')

  const day = Math.round(hour / 24)
  if (Math.abs(day) < 7) return rtf.format(day, 'day')

  return new Intl.DateTimeFormat(locale.startsWith('zh') ? 'zh' : 'en', {
    month: 'short',
    day: 'numeric',
    year: openedAt < Date.now() - 365 * 24 * 60 * 60 * 1000 ? 'numeric' : undefined,
  }).format(openedAt)
}
