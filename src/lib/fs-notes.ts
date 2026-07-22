export type Note = {
  id: string
  path: string
  title: string
  folder: string
  content: string
}

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.cursor',
])

function titleFromContent(content: string, fallback: string) {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : fallback
}

export type ScannedFolder = {
  folderName: string
  notes: Note[]
  /** Relative path to file handle, used for images and other assets. */
  fileHandles: Map<string, FileSystemFileHandle>
  dirHandle: FileSystemDirectoryHandle
}

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

      const file = await entry.getFile()
      const content = await file.text()
      const base = entry.name.replace(/\.md$/i, '')
      const folder = prefix
      notes.push({
        id: rel,
        path: rel,
        title: titleFromContent(content, base),
        folder,
        content,
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

export function isDirectoryPickerSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}
