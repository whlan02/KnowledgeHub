import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { notesPlugin } from './vite-plugin-notes.ts'
import { resolveNotesRoot } from './notes-root.ts'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const notesRoot = resolveNotesRoot()

export default defineConfig({
  plugins: [react(), tailwindcss(), notesPlugin({ notesRoot })],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  server: {
    fs: {
      allow: [rootDir, notesRoot],
    },
  },
})
