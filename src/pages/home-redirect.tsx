import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { encodeNotePath } from '@/lib/utils'
import { resolveHomeNotePath } from '@/lib/last-location'
import { useNotes } from '@/components/notes-provider'

export function HomeRedirect() {
  const { notes, source, activeFolderId, ready } = useNotes()

  useEffect(() => {
    document.title = 'KnowledgeHub'
  }, [])

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        …
      </div>
    )
  }

  const targetPath = resolveHomeNotePath(notes, source, activeFolderId)

  if (!targetPath) {
    return <div className="flex flex-1 items-center justify-center text-muted-foreground">No notes</div>
  }

  return <Navigate to={`/n/${encodeNotePath(targetPath)}`} replace />
}
