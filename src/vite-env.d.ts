/// <reference types="vite/client" />

interface Window {
  showDirectoryPicker: (options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
  }) => Promise<FileSystemDirectoryHandle>
}

declare module 'virtual:notes' {
  export type Note = {
    id: string
    path: string
    title: string
    folder: string
    content: string
  }

  export const notesRoot: string
  export const notes: Note[]
  export default notes
}
