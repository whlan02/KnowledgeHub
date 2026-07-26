const DB_NAME = 'knowledgehub'
const STORE = 'handles'
const DB_VERSION = 2

const LEGACY_KEY = 'notes-dir'
const RECENT_META_KEY = 'recent-meta'
const ACTIVE_ID_KEY = 'active-folder-id'

const handleKey = (id: string) => `handle:${id}`

/** Max recent folders kept (MRU list). */
export const MAX_RECENT_FOLDERS = 12

export type RecentFolderEntry = {
  id: string
  name: string
  openedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  })
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function migrateLegacyIfNeeded(db: IDBDatabase) {
  const existing = await idbGet<RecentFolderEntry[]>(db, RECENT_META_KEY)
  if (existing !== undefined) return

  const legacy = await idbGet<FileSystemDirectoryHandle>(db, LEGACY_KEY)
  if (!legacy) {
    await idbPut(db, RECENT_META_KEY, [])
    return
  }

  const id = crypto.randomUUID()
  await idbPut(db, handleKey(id), legacy)
  const entry: RecentFolderEntry = {
    id,
    name: legacy.name,
    openedAt: Date.now(),
  }
  await idbPut(db, RECENT_META_KEY, [entry])
  await idbPut(db, ACTIVE_ID_KEY, id)
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb()
  try {
    await migrateLegacyIfNeeded(db)
    return await fn(db)
  } finally {
    db.close()
  }
}

async function isSameDirectory(
  a: FileSystemDirectoryHandle,
  b: FileSystemDirectoryHandle,
): Promise<boolean> {
  if (a === b) return true
  try {
    return await a.isSameEntry(b)
  } catch {
    return a.name === b.name
  }
}

async function findRecentIdForHandle(
  db: IDBDatabase,
  list: RecentFolderEntry[],
  handle: FileSystemDirectoryHandle,
): Promise<string | null> {
  for (const entry of list) {
    const stored = await idbGet<FileSystemDirectoryHandle>(db, handleKey(entry.id))
    if (!stored) continue
    if (await isSameDirectory(stored, handle)) return entry.id
  }
  return null
}

export async function listRecentFolders(): Promise<RecentFolderEntry[]> {
  return withDb(async (db) => {
    const list = (await idbGet<RecentFolderEntry[]>(db, RECENT_META_KEY)) ?? []
    return [...list].sort((a, b) => b.openedAt - a.openedAt)
  })
}

export async function getRecentFolderHandle(
  id: string,
): Promise<FileSystemDirectoryHandle | null> {
  return withDb(async (db) => {
    const handle = await idbGet<FileSystemDirectoryHandle>(db, handleKey(id))
    return handle ?? null
  })
}

export async function getActiveRecentFolderId(): Promise<string | null> {
  return withDb(async (db) => {
    const active = await idbGet<string>(db, ACTIVE_ID_KEY)
    return active ?? null
  })
}

/** Remember a folder in MRU history and mark it as the active notes source. */
export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<string> {
  return withDb(async (db) => {
    const list = (await idbGet<RecentFolderEntry[]>(db, RECENT_META_KEY)) ?? []
    const keptIds = new Set(list.map((e) => e.id))
    const now = Date.now()
    const existingId = await findRecentIdForHandle(db, list, handle)

    const id = existingId ?? crypto.randomUUID()
    const entry: RecentFolderEntry = { id, name: handle.name, openedAt: now }
    const without = list.filter((e) => e.id !== id)
    const next = [entry, ...without].slice(0, MAX_RECENT_FOLDERS)
    const nextIds = new Set(next.map((e) => e.id))

    for (const oldId of keptIds) {
      if (!nextIds.has(oldId)) {
        await idbDelete(db, handleKey(oldId))
      }
    }

    await idbPut(db, handleKey(id), handle)
    await idbPut(db, RECENT_META_KEY, next)
    await idbPut(db, ACTIVE_ID_KEY, id)
    await idbPut(db, LEGACY_KEY, handle)
    return id
  })
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return withDb(async (db) => {
    const activeId = await idbGet<string>(db, ACTIVE_ID_KEY)
    if (activeId) {
      const handle = await idbGet<FileSystemDirectoryHandle>(db, handleKey(activeId))
      if (handle) return handle
    }
    const legacy = await idbGet<FileSystemDirectoryHandle>(db, LEGACY_KEY)
    return legacy ?? null
  })
}

/** Clear the active folder selection (e.g. back to bundled notes) without erasing history. */
export async function clearDirectoryHandle() {
  await withDb(async (db) => {
    await idbDelete(db, ACTIVE_ID_KEY)
    await idbDelete(db, LEGACY_KEY)
  })
}

export async function removeRecentFolder(id: string) {
  await withDb(async (db) => {
    const list = (await idbGet<RecentFolderEntry[]>(db, RECENT_META_KEY)) ?? []
    const next = list.filter((e) => e.id !== id)
    await idbPut(db, RECENT_META_KEY, next)
    await idbDelete(db, handleKey(id))
    const activeId = await idbGet<string>(db, ACTIVE_ID_KEY)
    if (activeId === id) {
      await idbDelete(db, ACTIVE_ID_KEY)
      await idbDelete(db, LEGACY_KEY)
    }
  })
}

export async function clearRecentFolders() {
  await withDb(async (db) => {
    const list = (await idbGet<RecentFolderEntry[]>(db, RECENT_META_KEY)) ?? []
    for (const entry of list) {
      await idbDelete(db, handleKey(entry.id))
    }
    await idbPut(db, RECENT_META_KEY, [])
    await idbDelete(db, ACTIVE_ID_KEY)
    await idbDelete(db, LEGACY_KEY)
  })
}

export async function ensureReadPermission(handle: FileSystemDirectoryHandle) {
  const opts = { mode: 'read' as const }
  // @ts-expect-error FileSystemHandle permission querying
  if ((await handle.queryPermission?.(opts)) === 'granted') return true
  // @ts-expect-error FileSystemHandle permission requesting
  if ((await handle.requestPermission?.(opts)) === 'granted') return true
  return false
}
