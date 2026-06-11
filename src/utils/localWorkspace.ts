/** File System Access — cùng cấu trúc thư mục với extension (stories/.../videos/). */

const DB_NAME = 'aicontent-web-workspace-fs'
const STORE = 'handles'
export const CONTENT_ROOT_HANDLE_KEY = 'contentRootDirectory'
export const WORKSPACE_ROOT_PICKER_ID = 'aicontent-web-workspace-root'
export const WORKSPACE_ROOT_NAME_STORAGE_KEY = 'aicontent-web-workspace-root-name'

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
  try {
    localStorage.setItem(WORKSPACE_ROOT_NAME_STORAGE_KEY, handle.name)
  } catch {
    /* ignore */
  }
}

export function getWorkspaceRootNameFromStorage(): string {
  try {
    return localStorage.getItem(WORKSPACE_ROOT_NAME_STORAGE_KEY)?.trim() || ''
  } catch {
    return ''
  }
}

export async function queryDirectoryReadable(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (options: { mode: 'read' }) => Promise<PermissionState>
  }
  if (!h.queryPermission) return true
  return (await h.queryPermission({ mode: 'read' })) === 'granted'
}

export async function ensureDirectoryReadable(
  handle: FileSystemDirectoryHandle,
  options?: { allowRequest?: boolean },
): Promise<boolean> {
  if (await queryDirectoryReadable(handle)) return true
  if (options?.allowRequest === false) return false
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

/** Khôi phục quyền thư mục đã lưu — gọi trong user gesture (click). */
export async function resolveContentRootDirectoryAccess(options?: {
  allowPicker?: boolean
  allowRequest?: boolean
}): Promise<FileSystemDirectoryHandle | null> {
  const allowPicker = options?.allowPicker !== false
  const allowRequest = options?.allowRequest !== false
  const handle = await loadContentRootDirectoryHandle()
  if (!handle) return allowPicker ? pickContentRootDirectory() : null
  if (
    (await ensureDirectoryReadable(handle)) ||
    (allowRequest && (await ensureDirectoryReadable(handle, { allowRequest: true })))
  ) {
    return handle
  }
  if (!allowPicker) return null
  return pickContentRootDirectory()
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
export async function ensureDirectoryWritable(
  handle: FileSystemDirectoryHandle,
  options?: { allowRequest?: boolean },
): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (opts: { mode: 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (opts: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  if (!h.queryPermission) return true
  let state = await h.queryPermission({ mode: 'readwrite' })
  if (state === 'granted') return true
  if (options?.allowRequest === false) return false
  if (!h.requestPermission) return false
  try {
    state = await h.requestPermission({ mode: 'readwrite' })
    return state === 'granted'
  } catch {
    return false
  }
}

export async function writeBlobToWorkspace(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  blob: Blob,
): Promise<void> {
  const segments = relativePath.split('/').map((s) => s.trim()).filter(Boolean)
  if (segments.length === 0) throw new Error('Đường dẫn lưu video không hợp lệ.')

  const writable = await ensureDirectoryWritable(root, { allowRequest: true })
  if (!writable) {
    throw new Error('Chưa có quyền ghi thư mục làm việc — bấm ghép lại và cho phép ghi.')
  }

  let dir = root
  for (let i = 0; i < segments.length - 1; i += 1) {
    dir = await dir.getDirectoryHandle(segments[i], { create: true })
  }
  const fileHandle = await dir.getFileHandle(segments[segments.length - 1], { create: true })
  const writer = await fileHandle.createWritable()
  try {
    await writer.write(blob)
  } finally {
    await writer.close()
  }
}

export async function readFileFromWorkspace(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<File | null> {
  const segments = relativePath.split('/').map((s) => s.trim()).filter(Boolean)
  if (segments.length === 0) return null

  let readable = await ensureDirectoryReadable(root)
  if (!readable) readable = await ensureDirectoryReadable(root, { allowRequest: true })
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
