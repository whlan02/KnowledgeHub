import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { ask, open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { Note } from '@/lib/fs-notes'

export type WorkspaceInfo = {
  root: string
  name: string
  notes: Note[]
  /** Every folder, including empty ones. */
  folders: string[]
}

export type WorkspaceScan = Pick<WorkspaceInfo, 'notes' | 'folders'>

type NoteMeta = Omit<Note, 'id'>

function withIds(notes: NoteMeta[]): Note[] {
  return notes.map((n) => ({ ...n, id: n.path }))
}

/** `Documents/KnowledgeHub`, created and seeded with the sample notes on first use. */
export function defaultWorkspace() {
  return invoke<string>('default_workspace')
}

export async function openWorkspace(path: string): Promise<WorkspaceInfo> {
  const info = await invoke<Omit<WorkspaceInfo, 'notes'> & { notes: NoteMeta[] }>('open_workspace', {
    path,
  })
  return { ...info, notes: withIds(info.notes) }
}

export async function scanWorkspace(): Promise<WorkspaceScan> {
  const found = await invoke<{ notes: NoteMeta[]; folders: string[] }>('scan_workspace')
  return { notes: withIds(found.notes), folders: found.folders }
}

export function readNote(path: string) {
  return invoke<string>('read_note', { path })
}

export function writeNote(path: string, text: string) {
  return invoke<void>('write_note', { path, text })
}

export type SearchHit = { path: string; title: string; line: number; snippet: string }

/** Case-insensitive search of the text of every note. */
export function searchNotes(query: string) {
  return invoke<SearchHit[]>('search_notes', { query })
}

/** Save an image next to a note; resolves to its path relative to the note (assets/name.png). */
export function saveAsset(notePath: string, fileName: string, bytes: ArrayBuffer) {
  return invoke<string>('save_asset', new Uint8Array(bytes), {
    headers: {
      'x-note-path': encodeURIComponent(notePath),
      'x-file-name': encodeURIComponent(fileName),
    },
  })
}

/** Errors the backend reports for file operations; anything else is a system message. */
export type FileErrorCode = 'ALREADY_EXISTS' | 'INVALID_NAME' | 'NOT_FOUND' | 'INVALID_TARGET'

export function createNoteFile(path: string, content: string) {
  return invoke<void>('create_note', { path, content })
}

export function createFolderEntry(path: string) {
  return invoke<void>('create_folder', { path })
}

/** Rename, or move when `to` is in another folder. */
export function renameEntry(from: string, to: string) {
  return invoke<void>('rename_entry', { from, to })
}

/** Moves to the system trash, so it can be restored. */
export function deleteEntry(path: string) {
  return invoke<void>('delete_entry', { path })
}

export type GitChange = {
  path: string
  kind: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
}
export type GitStatus = { branch: string | null; changes: GitChange[] }

/** Branch and changed files; rejects with NOT_A_REPO when the workspace is not under Git. */
export function gitStatus() {
  return invoke<GitStatus>('git_status')
}

/** Commit every change locally. Nothing is pushed. */
export function gitCommit(message: string) {
  return invoke<void>('git_commit', { message })
}

/** Native yes/no dialog. */
export function confirmDialog(message: string, confirmLabel: string, cancelLabel: string) {
  return ask(message, { kind: 'warning', okLabel: confirmLabel, cancelLabel })
}

/** Native folder picker. Resolves to null when the user cancels. */
export async function pickFolder(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false })
  return typeof picked === 'string' ? picked : null
}

/** Files under the open workspace change on disk (our own writes included). */
export function onWorkspaceChanged(handler: (paths: string[]) => void) {
  return listen<{ paths: string[] }>('workspace-changed', (event) => handler(event.payload.paths))
}

/** URL the webview can load for a file inside the workspace (served by the `kh` scheme). */
export function workspaceFileUrl(relPath: string) {
  return convertFileSrc(relPath, 'kh')
}

export function openExternal(url: string) {
  return openUrl(url)
}

/** Text on the system clipboard (the webview's own clipboard API asks for permission). */
export function readClipboardText() {
  return readText()
}

export function writeClipboardText(text: string) {
  return writeText(text)
}
