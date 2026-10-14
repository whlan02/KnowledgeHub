import { joinPath, parentOf, remapPath } from '@/lib/path-ops'

/** `[text](target)` and `![alt](target)`; the target is a single token without spaces or parentheses. */
const LINK = /(!?\[[^\]\n]*\]\()(<?)([^()\s>]+)(>?)((?:\s+"[^"\n]*")?\))/g
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

const tryDecode = (text: string) => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** Resolve a relative `target` written in the note at `notePath` to a workspace path. */
function resolveFrom(notePath: string, target: string) {
  const joined = target.startsWith('/') ? target.slice(1) : joinPath(parentOf(notePath), target)
  const parts: string[] = []
  for (const part of joined.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(tryDecode(part))
  }
  return parts.join('/')
}

/** The relative path that leads from the note at `notePath` to `target`. */
function relativeFrom(notePath: string, target: string) {
  const fromParts = parentOf(notePath).split('/').filter(Boolean)
  const toParts = target.split('/')
  let shared = 0
  while (shared < fromParts.length && shared < toParts.length - 1 && fromParts[shared] === toParts[shared]) {
    shared += 1
  }
  const up = fromParts.slice(shared).map(() => '..')
  return [...up, ...toParts.slice(shared)].join('/')
}

/** Keep the style the author used: percent-encoded stays encoded, and spaces always need it. */
function writeSegments(path: string, encode: boolean) {
  return path
    .split('/')
    .map((part) => (part === '..' || !(encode || /[\s()]/.test(part)) ? part : encodeURIComponent(part)))
    .join('/')
}

/** The link target as it should read after the move, or null when it can stay as written. */
function rewriteHref(href: string, oldPath: string, newPath: string, from: string, to: string) {
  if (href.startsWith('#') || EXTERNAL.test(href)) return null
  const split = href.search(/[#?]/)
  const pathPart = split < 0 ? href : href.slice(0, split)
  const suffix = split < 0 ? '' : href.slice(split)
  if (!pathPart) return null
  const target = resolveFrom(oldPath, pathPart)
  const moved = remapPath(target, from, to)
  if (moved === target && oldPath === newPath) return null
  const next = writeSegments(relativeFrom(newPath, moved), pathPart.includes('%'))
  const prefix = pathPart.startsWith('./') && !next.startsWith('.') ? './' : ''
  const trailing = pathPart.endsWith('/') && !next.endsWith('/') ? '/' : ''
  return prefix + next + trailing + suffix
}

/** Apply `change` to the parts of `line` that are not inline code. */
function outsideInlineCode(line: string, change: (text: string) => string) {
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, index) => (index % 2 === 1 ? part : change(part)))
    .join('')
}

/**
 * Text of the note after `from` was renamed or moved to `to`. The note itself moved from
 * `oldPath` to `newPath` (the same path when it stayed); every relative link is re-pointed so
 * it still reaches the same file. Anchors, query strings, external links and code are untouched.
 */
export function rewriteLinks(text: string, oldPath: string, newPath: string, from: string, to: string) {
  const relink = (part: string) =>
    part.replace(LINK, (whole, open: string, lt: string, href: string, gt: string, close: string) => {
      const next = rewriteHref(href, oldPath, newPath, from, to)
      return next === null || next === href ? whole : `${open}${lt}${next}${gt}${close}`
    })
  let inFence = false
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
      return inFence ? line : outsideInlineCode(line, relink)
    })
    .join('\n')
}
