import GithubSlugger from 'github-slugger'

const HEADING_LINE_RE = /^(#{1,6})\s+(.+?)(?:\s+#*)?\s*$/

/**
 * Extract the markdown block that starts at a heading whose slug matches `headingId`,
 * continuing until the next heading of the same or higher level.
 * If no heading matches, returns null.
 */
export function extractMarkdownSection(content: string, headingId: string): string | null {
  if (!headingId) return null

  const lines = content.split(/\r?\n/)
  const slugger = new GithubSlugger()
  let start = -1
  let startLevel = 0

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_LINE_RE)
    if (!match) continue
    const level = match[1].length
    const text = match[2].replace(/\*\*/g, '').trim()
    if (!text) continue
    const id = slugger.slug(text)
    if (id === headingId) {
      start = i
      startLevel = level
      break
    }
  }

  if (start < 0) return null

  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const match = lines[i].match(HEADING_LINE_RE)
    if (!match) continue
    const level = match[1].length
    if (level <= startLevel) {
      end = i
      break
    }
  }

  return lines.slice(start, end).join('\n').trim()
}

/** Split `path.md#heading` / `#heading` into note path (nullable) and heading id (nullable). */
export function splitHrefHash(href: string): { pathPart: string; hash: string | null } {
  const hashIndex = href.indexOf('#')
  if (hashIndex < 0) return { pathPart: href, hash: null }
  const pathPart = href.slice(0, hashIndex)
  const hash = decodeURIComponent(href.slice(hashIndex + 1)) || null
  return { pathPart, hash }
}
