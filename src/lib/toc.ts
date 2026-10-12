import GithubSlugger from 'github-slugger'

export type TocItem = {
  id: string
  text: string
  level: number
}

const HEADING_RE = /^(#{2,4})\s+(.+)$/gm

export function headingSlugText(text: string) {
  return text.replace(/\s+#*\s*$/, '').replace(/\*\*/g, '').trim()
}

export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = []
  const slugger = new GithubSlugger()
  let match: RegExpExecArray | null

  HEADING_RE.lastIndex = 0
  while ((match = HEADING_RE.exec(markdown)) !== null) {
    const level = match[1].length
    const text = headingSlugText(match[2])
    if (!text) continue
    items.push({ id: slugger.slug(text), text, level })
  }

  return items
}

/** Scroll a heading into the note pane. `scrollIntoView` misses headings inside the editor. */
export function scrollHeadingIntoView(id: string, root: HTMLElement | null) {
  const el = document.getElementById(id)
  if (!el) return false
  if (root && root.contains(el)) {
    const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
    root.scrollTo({ top: Math.max(0, top - 12), behavior: 'smooth' })
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  history.replaceState(null, '', `#${encodeURIComponent(id)}`)
  return true
}
