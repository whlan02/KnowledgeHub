export type Note = {
  id: string
  path: string
  title: string
  folder: string
  /** Bundled notes ship with content; folder notes load on demand. */
  content?: string
}

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.cursor',
])

export function titleFromContent(content: string, fallback: string) {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : fallback
}

export type ScannedFolder = {
  folderName: string
  notes: Note[]
  /** Relative path to file handle, used for notes, images and other assets. */
  fileHandles: Map<string, FileSystemFileHandle>
  dirHandle: FileSystemDirectoryHandle
}

/** Cheap change detection for polling (md: path+size+mtime; other files: path only). */
export async function fingerprintDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
): Promise<string> {
  const parts: string[] = []

  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    for await (const entry of dir.values()) {
      if (entry.kind === 'directory') {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        await walk(entry, prefix ? `${prefix}/${entry.name}` : entry.name)
        continue
      }

      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.name.toLowerCase().endsWith('.md')) {
        const file = await entry.getFile()
        parts.push(`${rel}\t${file.lastModified}\t${file.size}`)
      } else {
        parts.push(rel)
      }
    }
  }

  await walk(dirHandle, '')
  parts.sort()
  return parts.join('\n')
}

/** Index notes for the sidebar only — does not read markdown bodies. */
export async function scanDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
): Promise<ScannedFolder> {
  const notes: Note[] = []
  const fileHandles = new Map<string, FileSystemFileHandle>()

  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    for await (const entry of dir.values()) {
      if (entry.kind === 'directory') {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        await walk(entry, prefix ? `${prefix}/${entry.name}` : entry.name)
        continue
      }

      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      fileHandles.set(rel, entry)

      if (!entry.name.toLowerCase().endsWith('.md')) continue

      const base = entry.name.replace(/\.md$/i, '')
      notes.push({
        id: rel,
        path: rel,
        title: base,
        folder: prefix,
      })
    }
  }

  await walk(dirHandle, '')
  notes.sort((a, b) => a.path.localeCompare(b.path, 'en'))

  return {
    folderName: dirHandle.name,
    notes,
    fileHandles,
    dirHandle,
  }
}

export async function readFileHandleText(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

export function isDirectoryPickerSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}
