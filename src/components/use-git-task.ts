import { useCallback, useState } from 'react'
import { errorMessage } from '@/lib/error-message'

/** Runs one Git operation at a time and keeps its error text (git's own message, shown as is). */
export function useGitTask() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await task()
    } catch (err) {
      setError(errorMessage(err))
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])

  return { busy, error, run, clearError: () => setError(null) }
}
