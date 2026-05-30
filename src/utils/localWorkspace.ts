/** File System Access — cùng cấu trúc thư mục với extension (stories/.../videos/). */

const DB_NAME = 'aicontent-web-workspace-fs'
const STORE = 'handles'
export const CONTENT_ROOT_HANDLE_KEY = 'contentRootDirectory'
export const WORKSPACE_ROOT_PICKER_ID = 'aicontent-web-workspace-root'

let cachedRoot: FileSystemDirectoryHandle | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGetHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => {
      const v = req.result
      resolve(v instanceof FileSystemDirectoryHandle ? v : null)
    }
    req.onerror = () => reject(req.error)
  })
}

async function idbPutHandle(key: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE).put(handle, key)
  })
}

export async function loadContentRootDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (cachedRoot) return cachedRoot
  const handle = await idbGetHandle(CONTENT_ROOT_HANDLE_KEY)
  if (handle) cachedRoot = handle
  return handle
}

export async function persistContentRootDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  cachedRoot = handle
  await idbPutHandle(CONTENT_ROOT_HANDLE_KEY, handle)
}

export async function queryDirectoryReadable(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (options: { mode: 'read' }) => Promise<PermissionState>
  }
  if (!h.queryPermission) return true
  return (await h.queryPermission({ mode: 'read' })) === 'granted'
}

export async function ensureDirectoryReadable(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (await queryDirectoryReadable(handle)) return true
  const h = handle as FileSystemDirectoryHandle & {
    requestPermission?: (options: { mode: 'read' }) => Promise<PermissionState>
  }
  if (!h.requestPermission) return false
  try {
    return (await h.requestPermission({ mode: 'read' })) === 'granted'
  } catch {
    return false
  }
}

export async function pickContentRootDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!('showDirectoryPicker' in window) || typeof window.showDirectoryPicker !== 'function') {
    throw new Error('Trình duyệt không hỗ trợ chọn thư mục (File System Access API).')
  }
  try {
    const handle = await window.showDirectoryPicker({
      id: WORKSPACE_ROOT_PICKER_ID,
      mode: 'read',
    })
    await persistContentRootDirectoryHandle(handle)
    return handle
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }
}

/** Đọc file từ workspace theo path sau prefix local: — vd. stories/my-story/videos/video-1.mp4 */
export async function readFileFromWorkspace(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<File | null> {
  const segments = relativePath.split('/').map((s) => s.trim()).filter(Boolean)
  if (segments.length === 0) return null

  const readable = await ensureDirectoryReadable(root)
  if (!readable) return null

  let dir = root
  for (let i = 0; i < segments.length - 1; i += 1) {
    dir = await dir.getDirectoryHandle(segments[i])
  }
  const fileHandle = await dir.getFileHandle(segments[segments.length - 1])
  return fileHandle.getFile()
}

export function parseLocalStoragePath(entry: string): string | null {
  const trimmed = entry.trim()
  if (!trimmed.startsWith('local:')) return null
  const path = trimmed.slice('local:'.length).trim()
  return path || null
}

export function isLocalVideoEntry(entry: string): boolean {
  return Boolean(parseLocalStoragePath(entry))
}

export function isHttpVideoEntry(entry: string): boolean {
  const v = entry.trim()
  return /^https?:\/\//i.test(v)
}
