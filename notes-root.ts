import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = path.join(appRoot, '.notes-root')

export function getConfigFilePath() {
  return CONFIG_FILE
}

/** Bundled sample notes shipped with the repository. */
export function getDefaultNotesRoot() {
  return path.resolve(appRoot, 'examples')
}

/**
 * Resolve the Markdown notes root used by the Vite plugin.
 * Priority: environment variable > `.notes-root` file > `examples/`.
 */
export function resolveNotesRoot() {
  const fromEnv = process.env.KNOWLEDGEHUB_NOTES_ROOT?.trim()
  if (fromEnv && fs.existsSync(fromEnv) && fs.statSync(fromEnv).isDirectory()) {
    return path.resolve(fromEnv)
  }

  if (fs.existsSync(CONFIG_FILE)) {
    const saved = fs.readFileSync(CONFIG_FILE, 'utf-8').trim()
    if (saved && fs.existsSync(saved) && fs.statSync(saved).isDirectory()) {
      return path.resolve(saved)
    }
  }

  return getDefaultNotesRoot()
}

export function saveNotesRoot(notesRoot: string) {
  fs.writeFileSync(CONFIG_FILE, `${path.resolve(notesRoot)}\n`, 'utf-8')
}
