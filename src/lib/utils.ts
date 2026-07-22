import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function encodeNotePath(notePath: string) {
  return notePath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

export function decodeNotePath(encoded: string) {
  return encoded
    .split('/')
    .map((part) => decodeURIComponent(part))
    .join('/')
}

export function resolveNoteLink(fromNotePath: string, href: string) {
  const clean = href.split('#')[0]?.split('?')[0] ?? ''
  if (!clean || clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('mailto:')) {
    return null
  }

  // In-page anchors only (`#section`)
  if (clean === '' || href.startsWith('#')) {
    return null
  }

  // Browsers / react-markdown may percent-encode non-ASCII filenames in href
  let decoded = clean
  try {
    decoded = decodeURIComponent(clean)
  } catch {
    decoded = clean
  }

  if (!decoded.endsWith('.md') && !decoded.endsWith('/')) {
    // Allow folder links such as ./guides/
    if (!decoded.includes('/')) return null
  }

  const fromDir = fromNotePath.includes('/')
    ? fromNotePath.slice(0, fromNotePath.lastIndexOf('/'))
    : ''

  const joined = decoded.startsWith('/')
    ? decoded.slice(1)
    : [fromDir, decoded].filter(Boolean).join('/')

  const parts: string[] = []
  for (const part of joined.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    let segment = part
    try {
      segment = decodeURIComponent(part)
    } catch {
      segment = part
    }
    parts.push(segment)
  }

  let target = parts.join('/')
  if (target.endsWith('/')) {
    target = `${target}README.md`
  } else if (!target.toLowerCase().endsWith('.md')) {
    // ./guides -> guides/README.md
    target = `${target}/README.md`
  }

  return target
}
