const VIEWPORT_PAD = 12
const CURSOR_GAP = 14

/** Pick fixed position for a floating preview from cursor coordinates and card size. */
export function computePreviewPosition(
  clientX: number,
  clientY: number,
  cardWidth: number,
  cardHeight: number,
): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxLeft = vw - cardWidth - VIEWPORT_PAD
  const maxTop = vh - cardHeight - VIEWPORT_PAD

  const spaceBelow = vh - clientY - CURSOR_GAP
  const spaceAbove = clientY - CURSOR_GAP
  const placeBelow = spaceBelow >= cardHeight || spaceBelow >= spaceAbove

  let top = placeBelow ? clientY + CURSOR_GAP : clientY - cardHeight - CURSOR_GAP
  top = Math.min(Math.max(VIEWPORT_PAD, top), Math.max(VIEWPORT_PAD, maxTop))

  const spaceRight = vw - clientX - CURSOR_GAP
  const spaceLeft = clientX - CURSOR_GAP
  const alignRight = spaceRight >= cardWidth || spaceRight >= spaceLeft

  let left = alignRight ? clientX + CURSOR_GAP : clientX - cardWidth - CURSOR_GAP
  left = Math.min(Math.max(VIEWPORT_PAD, left), Math.max(VIEWPORT_PAD, maxLeft))

  return { top, left }
}

export const PREVIEW_ESTIMATED_HEIGHT = 360
export const PREVIEW_CARD_WIDTH = 448
