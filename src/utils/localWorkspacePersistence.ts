/**
 * Thư mục làm việc cục bộ (File System Access): gốc → stories → từng story → images | content | info.
 * Handle gốc lưu IndexedDB; tên thư mục con "stories" lưu chrome.storage.local.
 */

const DB_NAME = 'aicontent-split-image-fs'
const STORE = 'handles'
export const CONTENT_ROOT_HANDLE_KEY = 'contentRootDirectory'
/** Cũ: thư mục lưu ảnh cắt đôi trực tiếp — migrate thành thư mục gốc workspace. */
const LEGACY_SPLIT_IMAGE_HANDLE_KEY = 'splitImageSaveDirectory'

export const DEFAULT_STORIES_FOLDER_SEGMENT = 'stories'
export const WORKSPACE_STORIES_FOLDER_STORAGE_KEY = 'workspaceStoriesFolderSegment'

/** Truyền showDirectoryPicker — Chrome gợi nhớ thư mục. */
export const WORKSPACE_ROOT_PICKER_ID = 'aicontent-workspace-root'

export const WORKSPACE_STORY_SUBDIRS = ['images', 'content', 'info'] as const

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

async function idbDeleteKey(key: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE).delete(key)
  })
}

export async function loadContentRootDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const primary = await idbGetHandle(CONTENT_ROOT_HANDLE_KEY)
  if (primary) return primary
  const legacy = await idbGetHandle(LEGACY_SPLIT_IMAGE_HANDLE_KEY)
  if (legacy) {
    await idbPutHandle(CONTENT_ROOT_HANDLE_KEY, legacy)
    await idbDeleteKey(LEGACY_SPLIT_IMAGE_HANDLE_KEY)
    return legacy
  }
  return null
}

export async function persistContentRootDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await idbPutHandle(CONTENT_ROOT_HANDLE_KEY, handle)
  await idbDeleteKey(LEGACY_SPLIT_IMAGE_HANDLE_KEY)
}

export async function clearContentRootDirectoryHandle(): Promise<void> {
  await idbDeleteKey(CONTENT_ROOT_HANDLE_KEY)
  await idbDeleteKey(LEGACY_SPLIT_IMAGE_HANDLE_KEY)
}

export async function ensureDirectoryWritable(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  if (!h.queryPermission || !h.requestPermission) return true
  let state = await h.queryPermission({ mode: 'readwrite' })
  if (state === 'granted') return true
  state = await h.requestPermission({ mode: 'readwrite' })
  return state === 'granted'
}

/** Tạo images / content / info trong thư mục một story. */
export async function ensureStoryWorkspaceChildDirs(storyDir: FileSystemDirectoryHandle): Promise<void> {
  for (const name of WORKSPACE_STORY_SUBDIRS) {
    await storyDir.getDirectoryHandle(name, { create: true })
  }
}

/** Chuẩn hoá tên thư mục một đoạn (không chứa / hoặc ký tự cấm). */
export function sanitizeWorkspaceFolderSegment(raw: string, fallback: string): string {
  const s = raw
    .normalize('NFKC')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '')
    .replace(/^\.+$/, '_')
    .trim()
    .slice(0, 120)
  return s || fallback
}

type ChromeLocalStorage = {
  get?: (keys: string | string[], callback: (items: Record<string, unknown>) => void) => void
  set?: (items: Record<string, unknown>, callback?: () => void) => void
}

export async function getStoriesFolderSegmentFromStorage(storage: ChromeLocalStorage | undefined): Promise<string> {
  const fallback = DEFAULT_STORIES_FOLDER_SEGMENT
  const area = storage
  const get = area?.get
  if (!area || !get) return fallback
  return new Promise((resolve) => {
    get.call(area, [WORKSPACE_STORIES_FOLDER_STORAGE_KEY], (items) => {
      const v = String(items[WORKSPACE_STORIES_FOLDER_STORAGE_KEY] ?? '').trim()
      resolve(sanitizeWorkspaceFolderSegment(v || fallback, fallback))
    })
  })
}

export async function setStoriesFolderSegmentInStorage(
  storage: ChromeLocalStorage | undefined,
  value: string,
): Promise<void> {
  const seg = sanitizeWorkspaceFolderSegment(value.trim(), DEFAULT_STORIES_FOLDER_SEGMENT)
  const area = storage
  const set = area?.set
  if (!area || !set) return
  await new Promise<void>((resolve) => {
    set.call(area, { [WORKSPACE_STORIES_FOLDER_STORAGE_KEY]: seg }, () => resolve())
  })
}
