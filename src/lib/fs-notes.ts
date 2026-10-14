import { stripColorTags } from '@/lib/colors'

export type Note = {
  id: string
  /** Path relative to the workspace root, always with `/`. */
  path: string
  title: string
  folder: string
}

export function titleFromContent(content: string, fallback: string) {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? stripColorTags(match[1]).trim() : fallback
}
