# KnowledgeHub

A local Markdown knowledge reader for your notes, docs, and personal wiki.

Open any folder of `.md` files in the browser, browse them in a file tree, read with GitHub-flavored Markdown rendering, and jump around with a Notion-style floating table of contents.

## Features

- Recursive scan of Markdown files (non-`.md` files are ignored)
- Sidebar file tree
- GFM rendering (tables, images, strikethrough, task lists, and more)
- Floating right-side TOC with scroll spy (collapsed markers, expand on hover)
- In-app wiki links between notes (`[Title](./other-note.md)`)
- Open any folder while the app is running (Chrome / Edge)
- Light / dark / system theme
- English / Chinese UI

## Quick start

```bash
npm install
npm start
```

Then open [http://localhost:5173/](http://localhost:5173/).

On Windows you can also double-click `Start-KnowledgeHub.bat`, or run `Install-Desktop-Shortcut.bat` once to add a desktop shortcut.

```bash
# Dev server only (no auto-open browser helper)
npm run dev

# Production build
npm run build
npm run preview
```

## Open a notes folder

1. Click **Open folder** in the top bar.
2. Choose any directory that contains Markdown files.
3. The app rescans that folder immediately. You can switch folders again at any time without restarting.

Notes:

- Folder picking uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (best supported in Chromium browsers).
- The last selected folder handle can be remembered in the browser (you may need to re-grant permission on the next visit).
- Use the reset action to return to the built-in sample notes under `examples/`.

## Default sample notes

On first launch (without opening a custom folder), KnowledgeHub loads the `examples/` directory shipped with this repo. Replace or extend those files locally, or point the app at your own notes folder.

You can also override the bundled notes root for development:

```bash
# Windows PowerShell
$env:KNOWLEDGEHUB_NOTES_ROOT = "D:\path\to\your\notes"
npm run dev
```

```bash
# macOS / Linux
KNOWLEDGEHUB_NOTES_ROOT=/path/to/your/notes npm run dev
```

## Project structure

```text
KnowledgeHub/
├── examples/          # Sample Markdown notes (bundled default)
├── scripts/           # Windows launch helpers
├── src/               # React app
├── vite-plugin-notes.ts
└── package.json
```

## Tech stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn-style Radix primitives
- Lucide icons
- `react-markdown` + `remark-gfm`

## License

MIT
