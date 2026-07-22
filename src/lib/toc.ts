import GithubSlugger from 'github-slugger'

export type TocItem = {
  id: string
  text: string
  level: number
}

const HEADING_RE = /^(#{1,4})\s+(.+)$/gm

export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = []
  const slugger = new GithubSlugger()
  let match: RegExpExecArray | null

  HEADING_RE.lastIndex = 0
  while ((match = HEADING_RE.exec(markdown)) !== null) {
    const level = match[1].length
    const text = match[2].replace(/\s+#*\s*$/, '').replace(/\*\*/g, '').trim()
    if (!text) continue
    items.push({ id: slugger.slug(text), text, level })
  }

  return items
}
