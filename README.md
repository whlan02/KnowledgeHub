# KnowledgeHub

A local, Notion-style knowledge base. Your notes are plain `.md` files in a folder you choose, so you can keep them in Git / GitHub and nothing is stored in someone else's cloud.

KnowledgeHub is a [Tauri](https://tauri.app/) desktop app (frameless window, Rust backend, React + TipTap front end).

## Features

- Edit notes directly on the rendered page (WYSIWYG); changes are written back to the `.md` file automatically
- Sidebar file tree and a floating right-side table of contents with scroll spy
- GFM rendering (tables, images, strikethrough, task lists, and more)
- In-app links between notes (`[Title](./other-note.md)`) with hover previews
- Picks up changes made outside the app (for example after `git pull`)
- Light / dark / system theme
- English / Chinese UI

## Requirements

- Node.js 20+
- Rust (stable) with the MSVC build tools on Windows
- WebView2 runtime (ships with Windows 11)

## Quick start

```bash
npm install
npm start        # = tauri dev; the first run compiles the Rust backend
```

On Windows you can also double-click `Start-KnowledgeHub.bat`.

```bash
npm test                 # front-end tests (Vitest)
npm run test:rust        # Rust tests
npm run tauri -- build   # release build + installer
```

## Where notes live

On first launch KnowledgeHub creates `Documents/KnowledgeHub` and copies the sample notes from `examples/` into it. Use **Open folder** to switch to any other directory; recent folders are remembered. The title-bar button next to it returns to the default workspace.

Notes are normal Markdown files. Saving may re-flow whitespace and list markers, but content is preserved.

## Project structure

```text
KnowledgeHub/
├── examples/          # Sample notes copied into the default workspace
├── src/               # React front end
│   ├── components/    # App shell, editor, file tree, table of contents
│   └── lib/           # Backend bridge (backend.ts), TOC, link helpers
├── src-tauri/         # Rust backend: workspace scan, file watcher, note read/write, image protocol
├── docs/              # Design notes and open issues
└── .claude/skills/    # Project coding rules (Clean Code Developer, orange grade)
```

## Tech stack

- Tauri 2 (Rust) with `notify` for file watching
- React + TypeScript + Vite
- TipTap editor with Markdown serialisation
- Tailwind CSS + shadcn-style Radix primitives

## License

MIT
