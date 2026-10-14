/** Error codes the backend uses for file operations (see `src-tauri/src/files.rs`). */
const CODES = ['ALREADY_EXISTS', 'INVALID_NAME', 'NOT_FOUND', 'INVALID_TARGET'] as const
export type FileErrorCode = (typeof CODES)[number]

/** The backend's error code inside `err`, or null for any other failure. */
export function fileErrorCode(err: unknown): FileErrorCode | null {
  const text = err instanceof Error ? err.message : String(err)
  // The path check rejects names such as `a:b` before the name rules see them.
  if (text.includes('invalid path')) return 'INVALID_NAME'
  return CODES.find((code) => text.includes(code)) ?? null
}

/** Translation key for a file operation error. */
export function fileErrorKey(err: unknown) {
  const code = fileErrorCode(err)
  return code ? `fileError_${code}` : 'fileError_GENERIC'
}
