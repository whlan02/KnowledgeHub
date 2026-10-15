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

export type GitChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
export type GitChange = {
  path: string
  kind: GitChangeKind
  /** What is staged for the next commit. */
  staged: GitChangeKind | null
  /** What changed in the working tree since (untracked files included). */
  unstaged: GitChangeKind | null
}
export type GitStatus = { branch: string | null; changes: GitChange[] }
export type GitCommitInfo = { hash: string; short: string; author: string; time: number; summary: string }
export type GitCommitFile = { path: string; kind: GitChangeKind }
export type GitBranch = { name: string; current: boolean }

/** Branch and changed files; rejects with NOT_A_REPO when the workspace is not under Git. */
export function gitStatus() {
  return invoke<GitStatus>('git_status')
}

export function gitInit() {
  return invoke<void>('git_init')
}

export function gitStage(paths: string[]) {
  return invoke<void>('git_stage', { paths })
}

export function gitUnstage(paths: string[]) {
  return invoke<void>('git_unstage', { paths })
}

/** Throw away every change to one file. Callers must ask the user first. */
export function gitDiscard(path: string) {
  return invoke<void>('git_discard', { path })
}

/** Commit what is staged (or rewrite the last commit). Nothing is pushed. */
export function gitCommit(message: string, amend: boolean) {
  return invoke<void>('git_commit', { message, amend })
}

/** Unified diff of one file; `staged` compares against HEAD, otherwise against the index. */
export function gitDiff(path: string, staged: boolean, untracked: boolean) {
  return invoke<string>('git_diff', { path, staged, untracked })
}

/** Newest first; `path` limits it to one file's history. */
export function gitLog(path: string | null, limit: number) {
  return invoke<GitCommitInfo[]>('git_log', { path, limit })
}

export function gitCommitFiles(commit: string) {
  return invoke<GitCommitFile[]>('git_commit_files', { commit })
}

export function gitCommitDiff(commit: string, path: string) {
  return invoke<string>('git_commit_diff', { commit, path })
}

/** Rewrite one file as it was in `commit`; the result is an ordinary uncommitted change. */
export function gitRestoreVersion(commit: string, path: string) {
  return invoke<void>('git_restore_version', { commit, path })
}

export function gitBranches() {
  return invoke<GitBranch[]>('git_branches')
}

export function gitCheckout(name: string) {
  return invoke<void>('git_checkout', { name })
}

export function gitCreateBranch(name: string) {
  return invoke<void>('git_create_branch', { name })
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
