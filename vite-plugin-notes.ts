import fs from 'node:fs'
import path from 'node:path'
import type { Plugin, Connect } from 'vite'

type NotesPluginOptions = {
  notesRoot: string
}

const VIRTUAL_ID = 'virtual:notes'
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID

function shouldIgnore(relPath: string) {
  const parts = relPath.split(/[/\\]/)
  return (
    parts.includes('node_modules') ||
    parts.includes('.git') ||
    parts.includes('dist') ||
    parts.includes('.cursor') ||
    parts.some((part) => part.startsWith('.') && part !== '.' && part !== '..')
  )
}

function walkMarkdown(dir: string, root: string, out: string[] = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const rel = path.relative(root, full)
    if (shouldIgnore(rel)) continue
    if (entry.isDirectory()) {
      walkMarkdown(full, root, out)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

function titleFromContent(content: string, fallback: string) {
  const match = content.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() || fallback
}

function collectNotes(notesRoot: string) {
  const files = walkMarkdown(notesRoot, notesRoot).sort((a, b) =>
    a.localeCompare(b, 'en'),
  )

  return files.map((fullPath) => {
    const rel = path.relative(notesRoot, fullPath).split(path.sep).join('/')
    const content = fs.readFileSync(fullPath, 'utf-8')
    const base = path.basename(rel, '.md')
    const folder = path.posix.dirname(rel)
    return {
      id: rel,
      path: rel,
      title: titleFromContent(content, base),
      folder: folder === '.' ? '' : folder,
      content,
    }
  })
}

function guessType(file: string) {
  const ext = path.extname(file).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
  }
  return map[ext] || 'application/octet-stream'
}

function notesAssetMiddleware(notesRoot: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (!req.url?.startsWith('/@notes/')) return next()
    try {
      const raw = decodeURIComponent(req.url.slice('/@notes/'.length).split('?')[0] ?? '')
      const full = path.resolve(notesRoot, raw)
      if (!full.startsWith(path.resolve(notesRoot)) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
        res.statusCode = 404
        res.end('Not found')
        return
      }
      res.setHeader('Content-Type', guessType(full))
      fs.createReadStream(full).pipe(res)
    } catch {
      next()
    }
  }
}

export function notesPlugin(options: NotesPluginOptions): Plugin {
  const root = options.notesRoot

  return {
    name: 'knowledgehub-notes',
    configureServer(server) {
      server.middlewares.use(notesAssetMiddleware(root))
      server.watcher.add(root)
      server.watcher.on('all', (_event, file) => {
        const rel = path.relative(root, file)
        if (rel.startsWith('..') || shouldIgnore(rel)) return
        if (!file.toLowerCase().endsWith('.md')) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID)
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
          server.ws.send({ type: 'custom', event: 'knowledgehub:notes-update' })
        }
      })
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return
      const notes = collectNotes(root)
      return [
        `export const notesRoot = ${JSON.stringify(root)};`,
        `export const notes = ${JSON.stringify(notes, null, 2)};`,
        `export default notes;`,
      ].join('\n')
    },
  }
}
