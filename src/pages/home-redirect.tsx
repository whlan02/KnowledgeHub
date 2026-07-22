import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { encodeNotePath } from '@/lib/utils'
import { useNotes } from '@/components/notes-provider'

export function HomeRedirect() {
  const { notes } = useNotes()
  const preferred =
    notes.find((n) => n.path === 'README.md') ??
    notes.find((n) => n.path.endsWith('/README.md')) ??
    notes[0]

  useEffect(() => {
    document.title = 'KnowledgeHub'
  }, [])

  if (!preferred) {
    return <div className="flex flex-1 items-center justify-center text-muted-foreground">No notes</div>
  }

  return <Navigate to={`/n/${encodeNotePath(preferred.path)}`} replace />
}
