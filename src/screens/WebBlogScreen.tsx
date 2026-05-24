import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  FiAlertTriangle,
  FiCheck,
  FiCopy,
  FiDatabase,
  FiFolder,
  FiGlobe,
  FiInfo,
  FiRotateCcw,
  FiSave,
  FiSearch,
  FiSettings,
} from 'react-icons/fi'
import { getMyStories, type StoryItem } from '@/services/StoryService'
import { getMyWebBlogSetting, updateMyWebBlogSetting } from '@/services/WebBlogService'
import {
  injectImagesIntoLongContent,
  injectSingleImageIntoLongContent,
} from '@/utils/chatgptContentProcessing'
import {
  getStoriesFolderSegmentFromStorage,
  listLocalStoryFolders,
  loadContentRootDirectoryHandle,
  loadLocalStoryBundle,
  type LocalStoryFolderEntry,
} from '@/utils/localWorkspacePersistence'
import translate from 'translate'
import { normalizeTextForSearch, textMatchesSearch } from '@/utils/textSearchNormalize'

const getChrome = () => (globalThis as { chrome?: { storage?: { local?: unknown } } }).chrome

type WebBlogPayload = {
  title?: string
  longContent?: string
  image1?: string
  image2?: string
}

const buildWebBlogPayloadFromStory = (story: StoryItem) => {
  const title = (story.name || '').trim()
  let longContent = (story.longContent || '').trim()
  const urls = (story.imageUrls || []).map((u) => u.trim()).filter(Boolean)
  const image1 = urls[0] || ''
  const image2 = urls[1] || ''
  if (!/<img\b/i.test(longContent)) {
    if (image1 && image2) {
      longContent = injectImagesIntoLongContent(longContent, image1, image2)
    } else if (image1) {
      longContent = injectSingleImageIntoLongContent(longContent, image1)
    }
  }
  return { title, longContent, image1, image2 }
}

const WEBBLOG_IMG_BLOCK_SPLIT_RE = /(<p>\s*<img[\s\S]*?<\/p>)/i
const WEBBLOG_IMG_BLOCK_TEST_RE = /^<p>\s*<img/i

const splitContentAndImageBlocks = (source: string) => source.split(WEBBLOG_IMG_BLOCK_SPLIT_RE)

const formatWebBlogContentForDisplay = (raw: string) => {
  const source = (raw || '').replace(/\r\n/g, '\n')
  if (!source) return ''
  return splitContentAndImageBlocks(source)
    .map((part) => {
      if (!part) return ''
      if (WEBBLOG_IMG_BLOCK_TEST_RE.test(part)) {
        return part.replace(
          /<img\b/i,
          '<img style="max-width:100%;height:auto;display:block;margin:0.75em 0;" ',
        )
      }
      return part
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    })
    .join('')
}

const toEditorHtml = (raw: string) => {
  const source = (raw || '').trim().replace(/\r\n/g, '\n')
  if (!source) return ''
  return splitContentAndImageBlocks(source)
    .map((part) => {
      if (!part) return ''
      if (WEBBLOG_IMG_BLOCK_TEST_RE.test(part)) return part
      if (/<(?:p|div|br|h\d|ul|ol|li|blockquote)\b/i.test(part)) return part
      const blocks = part.split(/\n\n/).map((b) => b.trim()).filter(Boolean)
      if (blocks.length === 0) return ''
      return blocks
        .map((block) => {
          const escaped = block
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br />')
          return `<p>${escaped}</p>`
        })
        .join('')
    })
    .join('')
}

const htmlToPlainText = (html: string) => {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || div.innerText || '').trim()
}

/** Plain text để dịch — bỏ khối ảnh HTML, giữ xuống dòng. */
const getLongContentPlainForTranslate = (raw: string) => {
  const withoutImages = (raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/<p>\s*<img[\s\S]*?<\/p>/gi, '\n\n')
  if (/<[a-z][\s\S]*?>/i.test(withoutImages)) {
    return htmlToPlainText(withoutImages)
  }
  return withoutImages.trim()
}

const translateInChunks = async (source: string) => {
  const value = (source || '').trim()
  if (!value) return ''

  // Keep request size small to avoid translator payload limits.
  const MAX_CHUNK = 1800
  const blocks = value
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''
  for (const block of blocks) {
    if (!current) {
      current = block
      continue
    }
    const next = `${current}\n\n${block}`
    if (next.length <= MAX_CHUNK) {
      current = next
    } else {
      chunks.push(current)
      current = block
    }
  }
  if (current) chunks.push(current)
  if (chunks.length === 0) chunks.push(value.slice(0, MAX_CHUNK))

  const out: string[] = []
  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop
    const translated = await translate(chunk, { to: 'vi' })
    out.push((translated || '').trim())
  }
  return out.join('\n\n').trim()
}

export default function WebBlogScreen() {
  const [title, setTitle] = useState('')
  const [longContent, setLongContent] = useState('')
  const [originalTitle, setOriginalTitle] = useState('')
  const [originalLongContent, setOriginalLongContent] = useState('')
  const [image1, setImage1] = useState('')
  const [image2, setImage2] = useState('')
  const [status, setStatus] = useState('Đợi dữ liệu từ ChatGPT để điền WebBlog.')
  const [copiedField, setCopiedField] = useState<'title' | 'content' | null>(null)
  const [isTranslatingTitle, setIsTranslatingTitle] = useState(false)
  const [isTranslatingContent, setIsTranslatingContent] = useState(false)
  const [isTitleTranslated, setIsTitleTranslated] = useState(false)
  const [isContentTranslated, setIsContentTranslated] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [webPathInput, setWebPathInput] = useState('')
  const [showLocalImport, setShowLocalImport] = useState(false)
  const [showDbImport, setShowDbImport] = useState(false)
  const [localStoryEntries, setLocalStoryEntries] = useState<LocalStoryFolderEntry[]>([])
  const [localStorySearch, setLocalStorySearch] = useState('')
  const [dbStorySearch, setDbStorySearch] = useState('')
  const [debouncedDbStorySearch, setDebouncedDbStorySearch] = useState('')
  const [selectedLocalFolder, setSelectedLocalFolder] = useState('')
  const [selectedDbStoryId, setSelectedDbStoryId] = useState('')
  const [isLoadingLocalList, setIsLoadingLocalList] = useState(false)
  const [isImportingLocal, setIsImportingLocal] = useState(false)
  const [isImportingDb, setIsImportingDb] = useState(false)

  const dbStorySearchKey = debouncedDbStorySearch.trim()
    ? normalizeTextForSearch(debouncedDbStorySearch)
    : ''

  const dbStoriesQuery = useQuery({
    queryKey: ['webblog-db-stories', dbStorySearchKey],
    queryFn: () =>
      getMyStories({
        page: 1,
        limit: 20,
        q: dbStorySearchKey || undefined,
        hasLongContent: true,
      }),
    enabled: showDbImport,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })

  const dbStories = dbStoriesQuery.data?.items ?? []
  const dbStoriesTotal = dbStoriesQuery.data?.pagination.total ?? 0
  const isLoadingDbList = dbStoriesQuery.isLoading && !dbStoriesQuery.data
  const filteredLocalStoryEntries = useMemo(() => {
    const q = localStorySearch.trim()
    if (!q) return localStoryEntries
    return localStoryEntries.filter((entry) => {
      const savedLabel = entry.savedAt
        ? new Date(entry.savedAt).toLocaleString('vi-VN')
        : ''
      return (
        textMatchesSearch(entry.displayName, q) ||
        textMatchesSearch(entry.folderName, q) ||
        textMatchesSearch(savedLabel, q)
      )
    })
  }, [localStoryEntries, localStorySearch])

  const dbStoryPickerEntries = useMemo(() => {
    return dbStories
      .map((story) => {
        const id = (story._id || '').trim()
        const name = (story.name || '').trim()
        return {
          id,
          displayName: name || `Story …${id.slice(-6)}`,
          savedAt: story.updatedAt || story.createdAt,
        }
      })
      .filter((entry) => entry.id)
  }, [dbStories])

  useEffect(() => {
    if (!showDbImport) return
    const timer = window.setTimeout(() => setDebouncedDbStorySearch(dbStorySearch), 320)
    return () => window.clearTimeout(timer)
  }, [showDbImport, dbStorySearch])

  useEffect(() => {
    if (!showDbImport || isLoadingDbList || !dbStories.length) return
    setSelectedDbStoryId((prev) => {
      if (prev && dbStories.some((s) => s._id === prev)) return prev
      return (dbStories[0]?._id || '').trim()
    })
  }, [showDbImport, isLoadingDbList, dbStories])

  const applyWebBlogPayload = (payload: {
    title?: string
    longContent?: string
    image1?: string
    image2?: string
  }) => {
    const nextTitle = (payload.title || '').trim()
    const nextLongContent = (payload.longContent || '').replace(/\r\n/g, '\n')
    setTitle(nextTitle)
    setLongContent(nextLongContent)
    setOriginalTitle(nextTitle)
    setOriginalLongContent(nextLongContent)
    setIsTitleTranslated(false)
    setIsContentTranslated(false)
    setImage1(payload.image1 || '')
    setImage2(payload.image2 || '')
  }

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getMyWebBlogSetting()
        setWebPathInput(settings?.adminPath || '')
      } catch {
        setWebPathInput('')
      }
    }
    void loadSettings()
  }, [])

  useEffect(() => {
    const onFill = (event: Event) => {
      const custom = event as CustomEvent<WebBlogPayload>
      const payload = custom.detail || {}
      applyWebBlogPayload(payload)
      setStatus('Đã nhận dữ liệu WebBlog từ ChatGPT.')
    }
    window.addEventListener('fill-webblog-from-chatgpt', onFill as EventListener)
    return () => window.removeEventListener('fill-webblog-from-chatgpt', onFill as EventListener)
  }, [])

  useEffect(() => {
    if (!showLocalImport || isLoadingLocalList || !filteredLocalStoryEntries.length) return
    const visible = filteredLocalStoryEntries.some((e) => e.folderName === selectedLocalFolder)
    if (!visible) setSelectedLocalFolder(filteredLocalStoryEntries[0].folderName)
  }, [showLocalImport, isLoadingLocalList, filteredLocalStoryEntries, selectedLocalFolder])

  const toggleLocalImportPicker = async () => {
    if (showLocalImport) {
      setShowLocalImport(false)
      return
    }
    setShowDbImport(false)
    setShowLocalImport(true)
    setIsLoadingLocalList(true)
    setLocalStoryEntries([])
    setLocalStorySearch('')
    setSelectedLocalFolder('')
    try {
      const root = await loadContentRootDirectoryHandle()
      if (!root) {
        setStatus('Chưa chọn thư mục gốc workspace. Vào Hồ sơ → Cấu hình → Chọn thư mục gốc.')
        setShowLocalImport(false)
        return
      }
      const storiesSeg = await getStoriesFolderSegmentFromStorage(
        getChrome()?.storage?.local as Parameters<typeof getStoriesFolderSegmentFromStorage>[0],
      )
      const entries = await listLocalStoryFolders(root, storiesSeg)
      if (!entries.length) {
        setStatus('Chưa có story nào đã lưu trong workspace local.')
        setShowLocalImport(false)
        return
      }
      setLocalStoryEntries(entries)
      setSelectedLocalFolder(entries[0].folderName)
      setStatus(`Chọn story đã lưu (${entries.length} mục) rồi bấm Nhập.`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`Không đọc được danh sách local: ${msg}`)
      setShowLocalImport(false)
    } finally {
      setIsLoadingLocalList(false)
    }
  }

  const toggleDbImportPicker = () => {
    if (showDbImport) {
      setShowDbImport(false)
      return
    }
    setShowLocalImport(false)
    setShowDbImport(true)
  }

  const importFromLocalWorkspace = async () => {
    const folder = selectedLocalFolder.trim()
    if (!folder) {
      setStatus('Chọn một story trong danh sách local.')
      return
    }
    setIsImportingLocal(true)
    try {
      const root = await loadContentRootDirectoryHandle()
      if (!root) {
        setStatus('Chưa chọn thư mục gốc workspace. Vào Hồ sơ → Cấu hình.')
        return
      }
      const storiesSeg = await getStoriesFolderSegmentFromStorage(
        getChrome()?.storage?.local as Parameters<typeof getStoriesFolderSegmentFromStorage>[0],
      )
      const bundle = await loadLocalStoryBundle(root, storiesSeg, folder, injectImagesIntoLongContent)
      applyWebBlogPayload({
        title: bundle.title,
        longContent: bundle.longContentWithImages,
        image1: bundle.image1,
        image2: bundle.image2,
      })
      setShowLocalImport(false)
      const imgNote =
        bundle.image1 && bundle.image2
          ? ' (đã chèn ảnh 1/2 vào nội dung dài)'
          : bundle.image1 || bundle.image2
            ? ' (chỉ có một ảnh — chưa chèn đủ cặp)'
            : ''
      setStatus(`Đã nhập từ local: «${bundle.title}»${imgNote}.`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`Nhập từ local thất bại: ${msg}`)
    } finally {
      setIsImportingLocal(false)
    }
  }

  const importFromDatabase = async () => {
    const storyId = selectedDbStoryId.trim()
    if (!storyId) {
      setStatus('Chọn một story trong danh sách server.')
      return
    }
    setIsImportingDb(true)
    try {
      const story = dbStories.find((s) => s._id === storyId)
      if (!story) {
        setStatus('Không tìm thấy story đã chọn.')
        return
      }
      const payload = buildWebBlogPayloadFromStory(story)
      if (!payload.title && !payload.longContent) {
        setStatus('Story trên server thiếu tiêu đề và nội dung dài.')
        return
      }
      applyWebBlogPayload(payload)
      setShowDbImport(false)
      const imgNote =
        payload.image1 && payload.image2
          ? ' (đã chèn ảnh 1/2 vào nội dung dài)'
          : payload.image1 || payload.image2
            ? ' (có ảnh trên server)'
            : ''
      setStatus(`Đã nhập: «${payload.title || storyId}»${imgNote}.`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`Nhập thất bại: ${msg}`)
    } finally {
      setIsImportingDb(false)
    }
  }

  const statusLower = status.toLowerCase()
  const statusTone = statusLower.includes('không thể') || statusLower.includes('không') || statusLower.includes('lỗi')
    ? 'error'
    : statusLower.includes('đã ')
      ? 'success'
      : 'info'

  const copyText = async (field: 'title' | 'content') => {
    const value = field === 'title' ? title : longContent
    if (!value.trim()) return
    try {
      if (field === 'content') {
        const htmlSource = toEditorHtml(value)
        const wrapper = document.createElement('div')
        wrapper.innerHTML = htmlSource
        wrapper.querySelectorAll('img').forEach((img) => {
          img.setAttribute('width', '420')
          const prevStyle = img.getAttribute('style') || ''
          img.setAttribute('style', `${prevStyle};width:420px;max-width:100%;height:auto;`)
        })
        const html = wrapper.innerHTML
        const plain = htmlToPlainText(html)
        if ('ClipboardItem' in window && navigator.clipboard?.write) {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([html], { type: 'text/html' }),
              'text/plain': new Blob([plain], { type: 'text/plain' }),
            }),
          ])
        } else {
          await navigator.clipboard.writeText(plain || value)
        }
      } else {
        await navigator.clipboard.writeText(value)
      }
      setCopiedField(field)
      window.setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 1200)
    } catch {
      setStatus('Không thể sao chép. Hãy thử lại.')
    }
  }

  const saveWebPath = async () => {
    try {
      await updateMyWebBlogSetting({ adminPath: webPathInput.trim() })
      setStatus('Đã lưu cấu hình đường dẫn WebBlog.')
      setShowSettings(false)
    } catch {
      setStatus('Không thể lưu cấu hình đường dẫn WebBlog.')
    }
  }

  const translateField = async (field: 'title' | 'content') => {
    if (field === 'title' && isTitleTranslated) {
      setTitle(originalTitle)
      setIsTitleTranslated(false)
      setStatus('Đã quay về tiêu đề gốc.')
      return
    }
    if (field === 'content' && isContentTranslated) {
      setLongContent(originalLongContent)
      setIsContentTranslated(false)
      setStatus('Đã quay về nội dung gốc.')
      return
    }

    const source = field === 'title' ? title.trim() : longContent.trim()
    if (!source) return
    if (field === 'title') setIsTranslatingTitle(true)
    else setIsTranslatingContent(true)
    try {
      let next = ''
      if (field === 'title') {
        next = await translateInChunks(source)
      } else {
        const plainText = getLongContentPlainForTranslate(longContent)
        if (!plainText) {
          setStatus('Không có nội dung chữ để dịch.')
          return
        }
        next = await translateInChunks(plainText)
        if (next && !/<img\b/i.test(next)) {
          if (image1 && image2) {
            next = injectImagesIntoLongContent(next, image1, image2)
          } else if (image1) {
            next = injectSingleImageIntoLongContent(next, image1)
          }
        }
      }
      if (!next) {
        setStatus('Không nhận được bản dịch.')
        return
      }
      if (field === 'title') setTitle(next)
      else setLongContent(next)
      if (field === 'title') setIsTitleTranslated(true)
      else setIsContentTranslated(true)
      setStatus(field === 'title' ? 'Đã dịch tiêu đề thường.' : 'Đã dịch nội dung dài.')
    } catch {
      setStatus(field === 'title' ? 'Dịch tiêu đề thất bại.' : 'Dịch nội dung dài thất bại.')
    } finally {
      if (field === 'title') setIsTranslatingTitle(false)
      else setIsTranslatingContent(false)
    }
  }

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">WebBlog</h2>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => void toggleLocalImportPicker()}
            disabled={
              isLoadingLocalList ||
              isImportingLocal ||
              isLoadingDbList ||
              isImportingDb
            }
            className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${
              showLocalImport
                ? 'bg-teal-500/40 text-teal-50 ring-1 ring-teal-400/50'
                : 'bg-teal-500/20 text-teal-100 hover:bg-teal-500/30'
            }`}
            title={
              showLocalImport
                ? 'Đóng nhập từ workspace local'
                : 'Nhập tiêu đề, nội dung dài và ảnh từ workspace đã lưu (ChatGPT → Lưu local)'
            }
            aria-label={showLocalImport ? 'Đóng nhập từ local' : 'Nhập từ local'}
            aria-pressed={showLocalImport}
          >
            <FiFolder className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleDbImportPicker}
            disabled={
              isLoadingDbList ||
              isImportingDb ||
              isLoadingLocalList ||
              isImportingLocal
            }
            className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${
              showDbImport
                ? 'bg-violet-500/40 text-violet-50 ring-1 ring-violet-400/50'
                : 'bg-violet-500/20 text-violet-100 hover:bg-violet-500/30'
            }`}
            title={
              showDbImport
                ? 'Đóng nhập từ story trên server'
                : 'Nhập tiêu đề, nội dung dài và ảnh từ story đã lưu trên server (ChatGPT → Lưu story)'
            }
            aria-label={showDbImport ? 'Đóng nhập từ server' : 'Nhập từ server'}
            aria-pressed={showDbImport}
          >
            <FiDatabase className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowSettings((prev) => !prev)}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-blue-500/20 text-blue-100 transition hover:bg-blue-500/30"
            title="Cài đặt đường dẫn web"
            aria-label="Cài đặt đường dẫn web"
          >
            <FiSettings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {showLocalImport ? (
        <div className="mt-2 rounded-xl border border-teal-300/30 bg-teal-500/10 p-2">
          <p className="text-[10px] text-slate-300">Nhập từ workspace local</p>
          {isLoadingLocalList ? (
            <p className="mt-1 text-[10px] text-slate-400">Đang tải danh sách story…</p>
          ) : (
            <>
              <div className="relative mt-1">
                <FiSearch className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={localStorySearch}
                  onChange={(e) => setLocalStorySearch(e.target.value)}
                  placeholder="Tìm theo tên, thư mục, ngày lưu…"
                  className="w-full rounded-lg bg-slate-900/80 py-1.5 pl-7 pr-2 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                {filteredLocalStoryEntries.length} / {localStoryEntries.length} story
                {localStorySearch.trim() ? ' (đã lọc)' : ''}
              </p>
              <select
                value={selectedLocalFolder}
                onChange={(e) => setSelectedLocalFolder(e.target.value)}
                disabled={filteredLocalStoryEntries.length === 0}
                className="mt-1 max-h-40 w-full rounded-lg bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none disabled:opacity-50"
                size={Math.min(6, Math.max(3, filteredLocalStoryEntries.length))}
              >
                {filteredLocalStoryEntries.length === 0 ? (
                  <option value="">Không có story khớp tìm kiếm</option>
                ) : (
                  filteredLocalStoryEntries.map((entry) => (
                    <option key={entry.folderName} value={entry.folderName}>
                      {entry.displayName}
                      {entry.savedAt ? ` — ${new Date(entry.savedAt).toLocaleString('vi-VN')}` : ''}
                    </option>
                  ))
                )}
              </select>
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowLocalImport(false)}
                  className="cursor-pointer rounded-lg bg-white/10 px-2 py-1 text-[10px] text-slate-300 transition hover:bg-white/15"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void importFromLocalWorkspace()}
                  disabled={
                    !selectedLocalFolder || isImportingLocal || filteredLocalStoryEntries.length === 0
                  }
                  className="cursor-pointer rounded-lg bg-teal-500/30 px-2 py-1 text-[10px] font-semibold text-teal-50 transition hover:bg-teal-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isImportingLocal ? 'Đang nhập…' : 'Nhập'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
      {showDbImport ? (
        <div className="mt-2 rounded-xl border border-violet-300/30 bg-violet-500/10 p-2">
          <p className="text-[10px] text-slate-300">Nhập từ máy chủ</p>
          {isLoadingDbList ? (
            <p className="mt-1 text-[10px] text-slate-400">Đang tải danh sách story…</p>
          ) : dbStoriesQuery.isError ? (
            <p className="mt-1 text-[10px] text-rose-200">
              Không tải được danh sách story. Thử bấm lại nút database sau.
            </p>
          ) : (
            <>
              <div className="relative mt-1">
                <FiSearch className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={dbStorySearch}
                  onChange={(e) => setDbStorySearch(e.target.value)}
                  placeholder="Tìm theo tên story, ngày cập nhật…"
                  className="w-full rounded-lg bg-slate-900/80 py-1.5 pl-7 pr-2 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                {dbStoryPickerEntries.length} / {dbStoriesTotal} story
                {dbStorySearch.trim() ? ' (đã lọc)' : ''}
              </p>
              <select
                value={selectedDbStoryId}
                onChange={(e) => setSelectedDbStoryId(e.target.value)}
                disabled={dbStoryPickerEntries.length === 0}
                className="mt-1 max-h-40 w-full rounded-lg bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none disabled:opacity-50"
                size={Math.min(6, Math.max(3, dbStoryPickerEntries.length))}
              >
                {dbStoryPickerEntries.length === 0 ? (
                  <option value="">Không có story khớp tìm kiếm</option>
                ) : (
                  dbStoryPickerEntries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.displayName}
                      {entry.savedAt ? ` — ${new Date(entry.savedAt).toLocaleString('vi-VN')}` : ''}
                    </option>
                  ))
                )}
              </select>
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowDbImport(false)}
                  className="cursor-pointer rounded-lg bg-white/10 px-2 py-1 text-[10px] text-slate-300 transition hover:bg-white/15"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void importFromDatabase()}
                  disabled={!selectedDbStoryId || isImportingDb || dbStoryPickerEntries.length === 0}
                  className="cursor-pointer rounded-lg bg-violet-500/30 px-2 py-1 text-[10px] font-semibold text-violet-50 transition hover:bg-violet-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isImportingDb ? 'Đang nhập…' : 'Nhập'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
      {showSettings ? (
        <div className="mt-2 rounded-xl border border-blue-300/30 bg-blue-500/10 p-2">
          <p className="text-[10px] text-slate-300">Đường dẫn WebBlog</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={webPathInput}
              onChange={(event) => setWebPathInput(event.target.value)}
              placeholder="https://your-webblog-url.com"
              className="w-full rounded-lg bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={saveWebPath}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-100 transition hover:bg-emerald-500/30"
              title="Lưu cấu hình"
              aria-label="Lưu cấu hình"
            >
              <FiSave className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
      <p
        className={`mt-2 inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] ${
          statusTone === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
            : statusTone === 'error'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
              : 'border-white/10 bg-black/40 text-slate-300'
        }`}
      >
        {statusTone === 'success' ? (
          <FiCheck className="h-3.5 w-3.5" />
        ) : statusTone === 'error' ? (
          <FiAlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <FiInfo className="h-3.5 w-3.5" />
        )}
        {status}
      </p>

      <div className="mt-2 grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-2 overflow-hidden">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500">Tiêu đề thường</p>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => void translateField('title')}
                disabled={!title.trim() || isTranslatingTitle}
                title={
                  isTranslatingTitle
                    ? 'Đang xử lý...'
                    : isTitleTranslated
                      ? 'Quay về tiêu đề gốc'
                      : 'Dịch tiêu đề'
                }
                aria-label="Dịch tiêu đề"
                className="relative inline-flex cursor-pointer items-center rounded-md bg-violet-500/20 px-2 py-1 text-[10px] font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isTranslatingTitle ? (
                  <span className="animate-pulse">…</span>
                ) : isTitleTranslated ? (
                  <FiRotateCcw className="h-3.5 w-3.5" />
                ) : (
                  <FiGlobe className="h-3.5 w-3.5" />
                )}
                {isTitleTranslated ? (
                  <span className="absolute -right-1 -top-1 rounded-full bg-violet-500 px-1 text-[7px] leading-none text-white">
                    VI
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => void copyText('title')}
                disabled={!title.trim()}
                title="Sao chép tiêu đề"
                aria-label="Sao chép tiêu đề"
                className="inline-flex cursor-pointer items-center rounded-md bg-blue-500/20 px-2 py-1 text-[10px] font-semibold text-blue-100 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {copiedField === 'title' ? <FiCheck className="h-3.5 w-3.5" /> : <FiCopy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <textarea
            readOnly
            value={title}
            className="mt-1 h-14 w-full resize-none rounded-xl bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-100 outline-none"
          />
        </div>

        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-2 min-h-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-slate-500">Nội dung dài (đã chèn ảnh 1/2 ngẫu nhiên)</p>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void translateField('content')}
                  disabled={!longContent.trim() || isTranslatingContent}
                  title={
                    isTranslatingContent
                      ? 'Đang xử lý...'
                      : isContentTranslated
                        ? 'Quay về nội dung gốc'
                        : 'Dịch nội dung dài'
                  }
                  aria-label="Dịch nội dung dài"
                  className="relative inline-flex cursor-pointer items-center rounded-md bg-violet-500/20 px-2 py-1 text-[10px] font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isTranslatingContent ? (
                    <span className="animate-pulse">…</span>
                  ) : isContentTranslated ? (
                    <FiRotateCcw className="h-3.5 w-3.5" />
                  ) : (
                    <FiGlobe className="h-3.5 w-3.5" />
                  )}
                  {isContentTranslated ? (
                    <span className="absolute -right-1 -top-1 rounded-full bg-violet-500 px-1 text-[7px] leading-none text-white">
                      VI
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => void copyText('content')}
                  disabled={!longContent.trim()}
                  title="Sao chép nội dung"
                  aria-label="Sao chép nội dung"
                  className="inline-flex cursor-pointer items-center rounded-md bg-blue-500/20 px-2 py-1 text-[10px] font-semibold text-blue-100 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copiedField === 'content' ? <FiCheck className="h-3.5 w-3.5" /> : <FiCopy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div
              className="mt-1 h-[calc(100%-24px)] min-h-0 w-full overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-900/80 px-2 py-1.5 text-[11px] leading-normal text-slate-100"
              dangerouslySetInnerHTML={{ __html: formatWebBlogContentForDisplay(longContent) }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-1.5">
              <p className="mb-1 text-[10px] text-slate-500">Ảnh 1</p>
              {image1 ? <img src={image1} alt="Ảnh 1" className="h-20 w-full rounded-md object-contain" /> : <p className="text-[10px] text-slate-500">Chưa có</p>}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-1.5">
              <p className="mb-1 text-[10px] text-slate-500">Ảnh 2</p>
              {image2 ? <img src={image2} alt="Ảnh 2" className="h-20 w-full rounded-md object-contain" /> : <p className="text-[10px] text-slate-500">Chưa có</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
