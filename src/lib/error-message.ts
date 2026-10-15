/** Tauri rejects with plain strings; everything else is an Error. */
export function errorMessage(err: unknown): string {
  return String(err instanceof Error ? err.message : err)
}
