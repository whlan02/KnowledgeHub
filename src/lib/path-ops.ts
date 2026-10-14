/** Helpers for workspace-relative paths (always `/`-separated, no leading slash). */

export function parentOf(path: string) {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

export function nameOf(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function joinPath(dir: string, name: string) {
  return dir ? `${dir}/${name}` : name
}

/** `path` is `folder` itself or something inside it. */
export function isInside(path: string, folder: string) {
  return path === folder || path.startsWith(`${folder}/`)
}

/**
 * Where `path` ends up after `from` was renamed or moved to `to`: paths inside a moved
 * folder follow it, everything else stays.
 */
export function remapPath(path: string, from: string, to: string) {
  return isInside(path, from) ? to + path.slice(from.length) : path
}

/** `Untitled`, then `Untitled 2`, `Untitled 3`… so the name does not clash with `taken` names. */
export function uniqueName(base: string, extension: string, taken: Iterable<string>) {
  const names = new Set([...taken].map((name) => name.toLowerCase()))
  let candidate = `${base}${extension}`
  for (let n = 2; names.has(candidate.toLowerCase()); n += 1) candidate = `${base} ${n}${extension}`
  return candidate
}
