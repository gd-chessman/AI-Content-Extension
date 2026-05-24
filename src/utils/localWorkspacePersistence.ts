/**
 * Thư mục làm việc cục bộ (File System Access): gốc → stories → từng story → images | content | info.
 * Handle gốc lưu IndexedDB; tên thư mục con "stories" lưu chrome.storage.local.
 */

import { injectSingleImageIntoLongContent } from './chatgptContentProcessing'

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

/** Giữ handle trong phiên — tránh load IndexedDB lặp và giữ quyền ổn định hơn. */
let cachedContentRootHandle: FileSystemDirectoryHandle | null = null

export function peekCachedContentRootDirectoryHandle(): FileSystemDirectoryHandle | null {
  return cachedContentRootHandle
}

export function isFilesystemPermissionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  const name = error instanceof DOMException ? error.name : ''
  return (
    name === 'NotAllowedError' ||
    name === 'SecurityError' ||
    /User activation is required/i.test(msg) ||
    /request permissions?/i.test(msg)
  )
}

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
  if (cachedContentRootHandle) return cachedContentRootHandle
  const primary = await idbGetHandle(CONTENT_ROOT_HANDLE_KEY)
  if (primary) {
    cachedContentRootHandle = primary
    return primary
  }
  const legacy = await idbGetHandle(LEGACY_SPLIT_IMAGE_HANDLE_KEY)
  if (legacy) {
    await idbPutHandle(CONTENT_ROOT_HANDLE_KEY, legacy)
    await idbDeleteKey(LEGACY_SPLIT_IMAGE_HANDLE_KEY)
    cachedContentRootHandle = legacy
    return legacy
  }
  return null
}

export async function persistContentRootDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  cachedContentRootHandle = handle
  await idbPutHandle(CONTENT_ROOT_HANDLE_KEY, handle)
  await idbDeleteKey(LEGACY_SPLIT_IMAGE_HANDLE_KEY)
}

export async function clearContentRootDirectoryHandle(): Promise<void> {
  cachedContentRootHandle = null
  await idbDeleteKey(CONTENT_ROOT_HANDLE_KEY)
  await idbDeleteKey(LEGACY_SPLIT_IMAGE_HANDLE_KEY)
}

export async function queryDirectoryWritable(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  if (!h.queryPermission) return true
  const state = await h.queryPermission({ mode: 'readwrite' })
  return state === 'granted'
}

export async function ensureDirectoryWritable(
  handle: FileSystemDirectoryHandle,
  options?: { allowRequest?: boolean },
): Promise<boolean> {
  if (await queryDirectoryWritable(handle)) return true
  if (!options?.allowRequest) return false
  const h = handle as FileSystemDirectoryHandle & {
    requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  if (!h.requestPermission) return false
  try {
    const state = await h.requestPermission({ mode: 'readwrite' })
    return state === 'granted'
  } catch {
    return false
  }
}

/** Mở picker chọn thư mục gốc — gọi trong user gesture (vd. bấm Lưu local). */
export async function pickContentRootDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!('showDirectoryPicker' in window) || typeof window.showDirectoryPicker !== 'function') {
    throw new Error('Trình duyệt không hỗ trợ chọn thư mục (File System Access API).')
  }
  try {
    const handle = await window.showDirectoryPicker({
      id: WORKSPACE_ROOT_PICKER_ID,
      mode: 'readwrite',
    })
    await persistContentRootDirectoryHandle(handle)
    return handle
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }
}

/**
 * Lấy thư mục gốc có quyền ghi. Nếu hết quyền / chưa chọn — tự mở picker (Chrome nhớ thư mục cũ).
 * Trả null khi user hủy picker.
 */
export async function resolveWritableContentRootDirectory(options?: {
  allowPicker?: boolean
}): Promise<FileSystemDirectoryHandle | null> {
  const allowPicker = options?.allowPicker !== false
  let handle = await loadContentRootDirectoryHandle()

  if (handle && (await queryDirectoryWritable(handle))) {
    return handle
  }

  if (handle && (await ensureDirectoryWritable(handle, { allowRequest: true }))) {
    return handle
  }

  if (!allowPicker) return null
  return pickContentRootDirectory()
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

export type StoryWorkspaceDirs = {
  storyDir: FileSystemDirectoryHandle
  imagesDir: FileSystemDirectoryHandle
  contentDir: FileSystemDirectoryHandle
  infoDir: FileSystemDirectoryHandle
}

/** Gốc → [stories] / [tên story] / images | content | info (tạo nếu thiếu). */
export async function ensureStoryWorkspaceLayout(
  root: FileSystemDirectoryHandle,
  storiesSeg: string,
  storyFolderSeg: string,
): Promise<StoryWorkspaceDirs> {
  const rootOk = await queryDirectoryWritable(root)
  if (!rootOk) {
    throw new Error('PERMISSION_REQUIRED')
  }
  const stories = sanitizeWorkspaceFolderSegment(storiesSeg, DEFAULT_STORIES_FOLDER_SEGMENT)
  const storyName = sanitizeWorkspaceFolderSegment(storyFolderSeg, 'unnamed-story')
  const storiesDir = await root.getDirectoryHandle(stories, { create: true })
  const storyDir = await storiesDir.getDirectoryHandle(storyName, { create: true })
  await ensureStoryWorkspaceChildDirs(storyDir)
  const imagesDir = await storyDir.getDirectoryHandle('images', { create: true })
  const contentDir = await storyDir.getDirectoryHandle('content', { create: true })
  const infoDir = await storyDir.getDirectoryHandle('info', { create: true })
  return { storyDir, imagesDir, contentDir, infoDir }
}

export async function writeUtf8File(parent: FileSystemDirectoryHandle, filename: string, text: string): Promise<void> {
  const fh = await parent.getFileHandle(filename, { create: true })
  const writable = await fh.createWritable()
  try {
    await writable.write(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  } finally {
    await writable.close()
  }
}

export async function writeBlobToFile(parent: FileSystemDirectoryHandle, filename: string, blob: Blob): Promise<void> {
  const fh = await parent.getFileHandle(filename, { create: true })
  const writable = await fh.createWritable()
  try {
    await writable.write(blob)
  } finally {
    await writable.close()
  }
}

export async function ensureDirectoryReadable(
  handle: FileSystemDirectoryHandle,
  options?: { allowRequest?: boolean },
): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (options: { mode: 'read' }) => Promise<PermissionState>
    requestPermission?: (options: { mode: 'read' }) => Promise<PermissionState>
  }
  if (!h.queryPermission) return true
  let state = await h.queryPermission({ mode: 'read' })
  if (state === 'granted') return true
  if (!options?.allowRequest || !h.requestPermission) return false
  try {
    state = await h.requestPermission({ mode: 'read' })
  } catch {
    return false
  }
  return state === 'granted'
}

export type LocalStoryBundleWritePayload = {
  storiesSeg: string
  folderSegment: string
  storyId: string
  titleDisplay: string
  sourceReelUrl: string
  workflowId: string
  shortText: string
  longText: string
  titlePlain: string
  splitGeneratedImages: boolean
  left: string
  right: string
  usedStaleSplitFallback: boolean
}

function buildLocalSaveImageNote(payload: LocalStoryBundleWritePayload): string {
  const { splitGeneratedImages, left, right, usedStaleSplitFallback } = payload
  if (splitGeneratedImages) {
    if (left && right) {
      return usedStaleSplitFallback
        ? ', images/anh-1.png & anh-2.png (dùng ảnh cắt cũ — không chụp lại được từ ChatGPT)'
        : ', images/anh-1.png & anh-2.png'
    }
    return ' (chưa có ảnh cắt đôi — bỏ qua images)'
  }
  if (left) {
    return usedStaleSplitFallback
      ? ', images/anh-1.png (dùng ảnh cũ — không chụp lại được từ ChatGPT)'
      : ', images/anh-1.png'
  }
  return ' (chưa có ảnh — bỏ qua images)'
}

export async function writeStoryBundleToWorkspace(
  root: FileSystemDirectoryHandle,
  payload: LocalStoryBundleWritePayload,
): Promise<{ storiesSeg: string; folderSegment: string; imageNote: string }> {
  const dirs = await ensureStoryWorkspaceLayout(root, payload.storiesSeg, payload.folderSegment)

  await writeUtf8File(dirs.contentDir, 'noi-dung-ngan.txt', payload.shortText)
  await writeUtf8File(dirs.contentDir, 'noi-dung-dai.txt', payload.longText)

  const infoPayload = {
    storyId: payload.storyId,
    title: payload.titlePlain,
    storyDisplayName: payload.titleDisplay,
    sourceReelUrl: payload.sourceReelUrl || '',
    workflowId: payload.workflowId,
    savedAt: new Date().toISOString(),
    hasSplitImages: payload.splitGeneratedImages ? Boolean(payload.left && payload.right) : Boolean(payload.left),
  }
  await writeUtf8File(dirs.infoDir, 'meta.json', JSON.stringify(infoPayload, null, 2))

  if (payload.left) {
    const blobL = await (await fetch(payload.left)).blob()
    await writeBlobToFile(dirs.imagesDir, 'anh-1.png', blobL)
  }
  if (payload.right) {
    const blobR = await (await fetch(payload.right)).blob()
    await writeBlobToFile(dirs.imagesDir, 'anh-2.png', blobR)
  }

  return {
    storiesSeg: payload.storiesSeg,
    folderSegment: payload.folderSegment,
    imageNote: buildLocalSaveImageNote(payload),
  }
}

async function readUtf8FileIfExists(parent: FileSystemDirectoryHandle, filename: string): Promise<string | null> {
  try {
    const fh = await parent.getFileHandle(filename)
    const file = await fh.getFile()
    return await file.text()
  } catch {
    return null
  }
}

async function readBlobFileIfExists(parent: FileSystemDirectoryHandle, filename: string): Promise<Blob | null> {
  try {
    const fh = await parent.getFileHandle(filename)
    const file = await fh.getFile()
    return file
  } catch {
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Không đọc được file ảnh.'))
    reader.readAsDataURL(blob)
  })
}

export type LocalStoryFolderEntry = {
  folderName: string
  displayName: string
  savedAt: string | null
}

/** `entries()` có trên Chrome nhưng chưa có trong lib DOM TypeScript mặc định. */
type FileSystemDirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
}

async function* iterateDirectoryEntries(
  dir: FileSystemDirectoryHandle,
): AsyncGenerator<[string, FileSystemHandle]> {
  const withEntries = dir as FileSystemDirectoryHandleWithEntries
  if (typeof withEntries.entries !== 'function') {
    throw new Error('Trình duyệt không hỗ trợ đọc danh sách thư mục (DirectoryHandle.entries).')
  }
  yield* withEntries.entries()
}

/** Liệt kê thư mục story trong workspace (mới lưu trước). */
export async function listLocalStoryFolders(
  root: FileSystemDirectoryHandle,
  storiesSeg: string,
): Promise<LocalStoryFolderEntry[]> {
  const ok = await ensureDirectoryReadable(root)
  if (!ok) throw new Error('Không có quyền đọc thư mục gốc workspace.')
  const storiesName = sanitizeWorkspaceFolderSegment(storiesSeg, DEFAULT_STORIES_FOLDER_SEGMENT)
  let storiesDir: FileSystemDirectoryHandle
  try {
    storiesDir = await root.getDirectoryHandle(storiesName)
  } catch {
    return []
  }

  const entries: LocalStoryFolderEntry[] = []
  for await (const [name, handle] of iterateDirectoryEntries(storiesDir)) {
    if (handle.kind !== 'directory') continue
    const storyDir = handle as FileSystemDirectoryHandle
    let displayName = name
    let savedAt: string | null = null
    try {
      const infoDir = await storyDir.getDirectoryHandle('info')
      const metaRaw = await readUtf8FileIfExists(infoDir, 'meta.json')
      if (metaRaw) {
        const meta = JSON.parse(metaRaw) as {
          title?: string
          storyDisplayName?: string
          savedAt?: string
        }
        const t = String(meta.title || meta.storyDisplayName || '').trim()
        if (t) displayName = t
        const s = String(meta.savedAt || '').trim()
        if (s) savedAt = s
      }
    } catch {
      /* thư mục chưa đủ cấu trúc */
    }
    entries.push({ folderName: name, displayName, savedAt })
  }

  entries.sort((a, b) => {
    const ta = a.savedAt ? new Date(a.savedAt).getTime() : 0
    const tb = b.savedAt ? new Date(b.savedAt).getTime() : 0
    if (tb !== ta) return tb - ta
    return a.displayName.localeCompare(b.displayName, 'vi')
  })
  return entries
}

export type LoadedLocalStoryBundle = {
  folderName: string
  title: string
  shortContent: string
  longContent: string
  longContentWithImages: string
  image1: string
  image2: string
}

/** Đọc bundle đã lưu (content + images + meta) để điền WebBlog. */
export async function loadLocalStoryBundle(
  root: FileSystemDirectoryHandle,
  storiesSeg: string,
  storyFolderName: string,
  injectImages: (content: string, image1: string, image2: string) => string,
): Promise<LoadedLocalStoryBundle> {
  const ok = await ensureDirectoryReadable(root)
  if (!ok) throw new Error('Không có quyền đọc thư mục gốc workspace.')
  const storiesName = sanitizeWorkspaceFolderSegment(storiesSeg, DEFAULT_STORIES_FOLDER_SEGMENT)
  const storyName = sanitizeWorkspaceFolderSegment(storyFolderName, 'unnamed-story')
  const storiesDir = await root.getDirectoryHandle(storiesName)
  const storyDir = await storiesDir.getDirectoryHandle(storyName)

  const contentDir = await storyDir.getDirectoryHandle('content')
  const longContent = (await readUtf8FileIfExists(contentDir, 'noi-dung-dai.txt'))?.trim() || ''
  const shortContent = (await readUtf8FileIfExists(contentDir, 'noi-dung-ngan.txt'))?.trim() || ''
  if (!longContent) {
    throw new Error('Thiếu noi-dung-dai.txt trong thư mục story.')
  }

  let title = ''
  try {
    const infoDir = await storyDir.getDirectoryHandle('info')
    const metaRaw = await readUtf8FileIfExists(infoDir, 'meta.json')
    if (metaRaw) {
      const meta = JSON.parse(metaRaw) as { title?: string; storyDisplayName?: string }
      title = String(meta.title || meta.storyDisplayName || '').trim()
    }
  } catch {
    /* ignore */
  }
  if (!title) title = storyName

  let image1 = ''
  let image2 = ''
  try {
    const imagesDir = await storyDir.getDirectoryHandle('images')
    const b1 = await readBlobFileIfExists(imagesDir, 'anh-1.png')
    const b2 = await readBlobFileIfExists(imagesDir, 'anh-2.png')
    if (b1) image1 = await blobToDataUrl(b1)
    if (b2) image2 = await blobToDataUrl(b2)
  } catch {
    /* chưa có images */
  }

  let longContentWithImages = longContent
  if (!/<img\b/i.test(longContent)) {
    if (image1 && image2) {
      longContentWithImages = injectImages(longContent, image1, image2)
    } else if (image1) {
      longContentWithImages = injectSingleImageIntoLongContent(longContent, image1)
    }
  }

  return {
    folderName: storyName,
    title,
    shortContent,
    longContent,
    longContentWithImages,
    image1,
    image2,
  }
}
