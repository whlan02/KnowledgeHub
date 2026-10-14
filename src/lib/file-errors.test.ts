import { describe, expect, it } from 'vitest'
import { fileErrorCode, fileErrorKey } from '@/lib/file-errors'

describe('file errors', () => {
  it('finds the backend code in strings and Error objects', () => {
    expect(fileErrorCode('ALREADY_EXISTS')).toBe('ALREADY_EXISTS')
    expect(fileErrorCode(new Error('INVALID_NAME'))).toBe('INVALID_NAME')
  })

  it('treats a rejected path as an invalid name', () => {
    expect(fileErrorCode('invalid path')).toBe('INVALID_NAME')
  })

  it('maps unknown errors to the generic message', () => {
    expect(fileErrorCode('os error 5')).toBeNull()
    expect(fileErrorKey('os error 5')).toBe('fileError_GENERIC')
    expect(fileErrorKey('NOT_FOUND')).toBe('fileError_NOT_FOUND')
  })
})
