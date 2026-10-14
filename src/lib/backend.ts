import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { Note } from '@/lib/fs-notes'

export type WorkspaceInfo = {
  root: string
  name: string
  notes: Note[]
}

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

export async function scanWorkspace(): Promise<Note[]> {
  return withIds(await invoke<NoteMeta[]>('scan_workspace'))
}

export function readNote(path: string) {
  return invoke<string>('read_note', { path })
}

export function writeNote(path: string, text: string) {
  return invoke<void>('write_note', { path, text })
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
