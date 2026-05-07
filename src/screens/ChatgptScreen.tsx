import { useEffect, useState } from 'react'
import { FiAlignLeft, FiCheck, FiCopy, FiEdit3, FiFileText, FiFilm, FiImage, FiItalic, FiScissors, FiType } from 'react-icons/fi'
import { IoFlash } from 'react-icons/io5'
import { SiX } from 'react-icons/si'

type BrowserTab = { id?: number; url?: string; active?: boolean }
type ExtensionChrome = {
  runtime?: {
    id?: string
    lastError?: { message?: string }
    sendMessage?: (
      message: unknown,
      responseCallback?: (response: { ok?: boolean; error?: string }) => void,
    ) => void
  }
  storage?: {
    local?: {
      get?: (keys: string | string[], callback: (items: Record<string, unknown>) => void) => void
      set?: (items: Record<string, unknown>, callback?: () => void) => void
    }
  }
  downloads?: {
    download?: (
      options: {
        url: string
        filename?: string
        conflictAction?: 'uniquify' | 'overwrite' | 'prompt'
        saveAs?: boolean
      },
      callback?: () => void,
    ) => void
  }
  tabs?: {
    query?: (
      queryInfo: { url?: string[]; currentWindow?: boolean; active?: boolean },
      callback: (tabs: BrowserTab[]) => void,
    ) => void
    create?: (createProperties: { url: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
    update?: (tabId: number, updateProperties: { url?: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
    captureVisibleTab?: (
      windowId?: number,
      options?: { format?: 'jpeg' | 'png'; quality?: number },
      callback?: (dataUrl: string) => void,
    ) => void
  }
  scripting?: {
    executeScript?: (injection: {
      target: { tabId: number }
      func: (...args: unknown[]) => unknown
      args?: unknown[]
    }) => Promise<Array<{ result?: unknown }>>
  }
}

const CHATGPT_URL = 'https://chatgpt.com/'
const CHATGPT_PATTERNS = ['*://chatgpt.com/*', '*://chat.openai.com/*']

const SAVED_SPLIT_IMAGE_HASHES_KEY = 'savedSplitImageCopyHashes'
const SAVED_SPLIT_IMAGE_HASHES_MAX = 150
const SPLIT_IMAGE_DOWNLOAD_FOLDER = 'chatgpt-images'

const hashDataUrl = (dataUrl: string) => {
  let h = 5381
  const stride = Math.max(1, Math.floor(dataUrl.length / 12000))
  for (let i = 0; i < dataUrl.length; i += stride) {
    h = ((h << 5) + h) ^ dataUrl.charCodeAt(i)
  }
  return `${(h >>> 0).toString(16)}_${dataUrl.length}`
}

export const STEP_1_PROMPT_TEMPLATE = `Rewrite the following English story to make it highly engaging, emotionally compelling, and irresistible to readers.
Requirements:
- The rewritten story must be between 550-650 words.
- Keep the original storyline, core plot, and sequence of events unchanged.
- Do NOT change the key message or alter the main outcome of the story.
- Rewrite with completely new character names that are memorable, natural, and suitable for the story's tone.
- Creatively adjust a few minor details (such as setting, small actions, descriptions, or background elements) to make the story feel fresher, more vivid, and immersive.
- Enhance emotional intensity, tension, and dramatic pacing to make the story more gripping and addictive.
- Change the opening lines to be more powerful, shocking, or curiosity-driven so readers feel compelled to continue.
- Maintain logical consistency - no contradictions with the original plot.
- Use vivid descriptions, natural dialogue, and storytelling flow similar to a short dramatic novel.
Ending requirement:
- STOP the story exactly at the most climactic, suspenseful moment.
- Do NOT reveal the resolution.
Output format:
- Present the entire rewritten story inside a clean Markdown code block for easy copying.`
const PROCESS_STEPS: Array<{ id: string; label: string; prompt: string }> = [
  {
    id: 'step-1',
    label: 'Tiến trình 1',
    prompt: `Rewrite the following English story to make it highly engaging, emotionally compelling, and irresistible to readers.
Requirements:
- The rewritten story must be between 550-650 words.
- Keep the original storyline, core plot, and sequence of events unchanged.
- Do NOT change the key message or alter the main outcome of the story.
- Rewrite with completely new character names that are memorable, natural, and suitable for the story's tone.
- Creatively adjust a few minor details (such as setting, small actions, descriptions, or background elements) to make the story feel fresher, more vivid, and immersive.
- Enhance emotional intensity, tension, and dramatic pacing to make the story more gripping and addictive.
- Change the opening lines to be more powerful, shocking, or curiosity-driven so readers feel compelled to continue.
- Maintain logical consistency - no contradictions with the original plot.
- Use vivid descriptions, natural dialogue, and storytelling flow similar to a short dramatic novel.
Ending requirement:
- STOP the story exactly at the most climactic, suspenseful moment.
- Do NOT reveal the resolution.
Output format:
- Present the entire rewritten story inside a clean Markdown code block for easy copying.`,
  },
  {
    id: 'step-2',
    label: 'Tiến trình 2',
    prompt: `Create 2 images and 2 videos based on the story provided above.
Requirements:
- Ensure the 2 image scenes connect seamlessly and directly with the 2 6-second videos (each image corresponds to one 6-second video).
- Divide each video into small segments, with each segment focusing on character dialogues specifically in the climax/tense/suspenseful parts.
- Idea 1 and Idea 2 must showcase continuous actions and smooth, natural, flowing dialogues.
- Image 1 and Image 2 The main character has a clearly defined face, must feature ultra-sharp, crystal-clear main characters that are perfectly synchronized (exact same appearance, facial features, hairstyle, and identical outfits/accessories).
- The video scripts must adhere 100% to the story/content provided above.
- All characters are European with Caucasian features, maintaining consistent identity across all frames.
No non-European or mixed ethnicity traits.
Each character must have stable facial structure, light skin tone, and realistic Western European appearance throughout the entire video.
- Total length of each video is exactly 6 seconds, with each scene only 2 seconds long.
- A panoramic view, seeing the context and objects in space.
- Make every scene highly dramatic and intense.
- Ultra vibrant color palette, high saturation, cinematic lighting, soft glow, bright clean daylight, cool-neutral color grading, pure white highlights, high dynamic range (HDR), crystal clear visuals, no orange tones, no warm filter, fresh and modern look.
- Describe in precise, vivid detail: character movements, actions, camera movements, and sound effects/sounds that perfectly match the emotion and context of each scene.
- Cinematic wide shot, smooth camera movement, wide-angle perspective, characters interacting naturally in a lively environment, balanced composition, no close-up, no face zoom, maintaining spatial context.
- Optimize the entire prompt and descriptions perfectly for AI video generation tools (e.g., Runway, Grok, Kling, Luma, Pika, etc.).
- No violence, no sexual content, no harm to children, no illegal or hateful content, no graphic or disturbing elements. Keep safe and appropriate.
- Dialogue accuracy is higher priority than background sound or cinematic effects.
- The character must deliver the dialogue EXACTLY as written below, word-for-word.
- Lip movement must be perfectly synchronized with each spoken word.
- Emotional tone must match the scene context (e.g., angry, whispering, panicked, crying).
- Voice must sound natural, human-like, and clearly audible.
- If multiple characters are present, specify clearly who is speaking.
- Do NOT include subtitles or any text overlay.
VOICE & AUDIO:
- Assign clear, consistent voice types: Boy (young male, high-pitched, innocent), Girl (young female, soft, emotional), Woman (adult female, expressive), Man (adult male, deep, firm), Elderly (older voice, slow, slightly raspy).
- Dialogue must match emotion (fear, tension, urgency), with natural pauses, breathing, and occasional voice cracks.
- Ensure accurate lip-sync and spatial audio (closer = louder/clearer, far = softer/echo).
- Keep dialogue clear over background; add subtle ambient sounds (footsteps, door creaks, heartbeat) to enhance realism.`,
  },
  {
    id: 'step-3',
    label: 'Tiến trình 3',
    prompt: `Tạo giúp tôi ảnh từ PROMPT ẢNH 1 và PROMPT ẢNH 2 ở trên, ảnh rõ nét các nhân vật và không có chữ.
Ảnh dạng chia đôi dọc (vertical split screen), hai khung rộng đặt cạnh nhau trái và phải trong khung hình ngang 16:9.`,
  },
  {
    id: 'step-4',
    label: 'Tiến trình 4',
    prompt: `Write a complete, full-length English story based on the story provided above.
Requirements:
- The entire story must be approximately 2500 words (1850-2000 words is ideal).
- Create a captivating title consisting of exactly TWO sentences.
- The story must be extremely gripping, emotional, and hook the reader from the very first sentence so they cannot stop reading.
- Build tension naturally and deliver a shocking, mind-blowing, unpredictable twist ending that NO ONE would ever see coming - make it the most surprising and satisfying ending possible.
- Write in a lively and engaging style like a novel, with vivid descriptions, deep emotions, and natural dialogue.
- Develop complex inner thoughts, emotional conflict, and layered dialogue for all major characters.
- Ensure each scene raises tension, reveals something meaningful, or pushes the story closer to the climax.
- Add subtle foreshadowing and emotional callbacks to make the final twist more shocking and satisfying.
- Use dynamic pacing, cinematic descriptions, and emotionally powerful prose throughout.
- Ensure the ending is logical, consistent, and fully supported by earlier foreshadowing.
- Avoid plot holes, forced twists, or inconsistent character behavior.
- Deliver a strong emotional payoff and a satisfying, well-earned conclusion.
- The story must have a happy ending.`,
  },
]

export default function ChatgptScreen() {
  const [status, setStatus] = useState('Chọn một tiến trình để gửi prompt tự động vào ChatGPT.')
  const [selectedStepId, setSelectedStepId] = useState(PROCESS_STEPS[0].id)
  const [splitImages, setSplitImages] = useState<{ left: string; right: string } | null>(null)
  const [copiedPart, setCopiedPart] = useState<'left' | 'right' | null>(null)
  const [copiedTool, setCopiedTool] = useState<string | null>(null)

  const getChrome = () => (globalThis as { chrome?: ExtensionChrome }).chrome

  const queryTabs = (pattern?: string[], currentWindow = false, active = false) =>
    new Promise<BrowserTab[]>((resolve) => {
      const extensionChrome = getChrome()
      extensionChrome?.tabs?.query?.({ url: pattern, currentWindow, active }, (tabs) => resolve(tabs || []))
    })

  const createTab = (url: string) =>
    new Promise<BrowserTab | null>((resolve) => {
      const extensionChrome = getChrome()
      extensionChrome?.tabs?.create?.({ url, active: true }, (tab) => resolve(tab || null))
    })

  const updateTab = (tabId: number, url?: string) =>
    new Promise<BrowserTab | null>((resolve) => {
      const extensionChrome = getChrome()
      extensionChrome?.tabs?.update?.(
        tabId,
        url ? { url, active: true } : { active: true },
        (tab) => resolve(tab || null),
      )
    })

  const captureVisibleTab = (windowId?: number) =>
    new Promise<string | null>((resolve) => {
      const extensionChrome = getChrome()
      extensionChrome?.tabs?.captureVisibleTab?.(windowId, { format: 'png' }, (dataUrl) => {
        resolve(dataUrl || null)
      })
    })

  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

  const injectPrompt = async (tabId: number, prompt: string, autoSend: boolean) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript) return false

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId },
      func: (async (message: string, shouldSend: boolean) => {
        const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
        const needle = message.slice(0, 32).trim()

        const triggerInput = (el: HTMLElement) => {
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: message }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }

        const isVisible = (el: Element | null): el is HTMLElement => {
          if (!(el instanceof HTMLElement)) return false
          const rect = el.getBoundingClientRect()
          const style = window.getComputedStyle(el)
          return rect.width > 50 && rect.height > 20 && style.visibility !== 'hidden' && style.display !== 'none'
        }

        const candidateSelectors = [
          '#prompt-textarea',
          'textarea[data-testid="prompt-textarea"]',
          'textarea[placeholder*="Message"]',
          'textarea[placeholder*="Send"]',
          'textarea',
          'div[data-testid="prompt-textarea"][contenteditable="true"]',
          'div#prompt-textarea[contenteditable="true"]',
          'div[role="textbox"][contenteditable="true"]',
          'div.ProseMirror[contenteditable="true"]',
          'div[contenteditable="true"]',
        ]

        const getBestInput = () => {
          const candidates = candidateSelectors.flatMap((selector) =>
            Array.from(document.querySelectorAll<HTMLElement>(selector)),
          )
          const visibles = candidates.filter((el) => isVisible(el))
          if (visibles.length === 0) return null

          // Prefer element near bottom center where ChatGPT composer usually is.
          const scored = visibles.map((el) => {
            const rect = el.getBoundingClientRect()
            const centerX = rect.left + rect.width / 2
            const centerY = rect.top + rect.height / 2
            const distanceX = Math.abs(centerX - window.innerWidth / 2)
            const distanceY = Math.abs(centerY - window.innerHeight * 0.86)
            const sizeScore = rect.width * rect.height
            const score = sizeScore - distanceX * 25 - distanceY * 35
            return { el, score }
          })
          scored.sort((a, b) => b.score - a.score)
          return scored[0].el
        }

        const sendMessage = async (target: HTMLElement) => {
          if (!shouldSend) return true

          for (let i = 0; i < 5; i += 1) {
            const sendButton =
              (document.querySelector('button[data-testid="send-button"]') as HTMLButtonElement | null) ||
              (document.querySelector('button[aria-label*="Send"]') as HTMLButtonElement | null) ||
              (document.querySelector('button[aria-label*="Gửi"]') as HTMLButtonElement | null)

            if (sendButton && !sendButton.disabled) {
              sendButton.click()
              return true
            }

            await sleep(120)
          }

          target.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              bubbles: true,
            }),
          )
          target.dispatchEvent(
            new KeyboardEvent('keyup', {
              key: 'Enter',
              code: 'Enter',
              bubbles: true,
            }),
          )
          return true
        }

        const writeTextarea = async (textarea: HTMLTextAreaElement) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
          setter?.call(textarea, message)
          triggerInput(textarea)
          textarea.focus()
          if (!(textarea.value || '').includes(needle)) return false
          return await sendMessage(textarea)
        }

        const writeEditable = async (editable: HTMLElement) => {
          editable.click()
          editable.focus()
          const range = document.createRange()
          range.selectNodeContents(editable)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          document.execCommand('selectAll', false)
          document.execCommand('insertText', false, message)

          if ((editable.innerText || '').trim().length === 0) {
            editable.textContent = message
          }
          triggerInput(editable)
          editable.focus()
          if (!(editable.innerText || editable.textContent || '').includes(needle)) return false
          return await sendMessage(editable)
        }

        for (let attempt = 0; attempt < 5; attempt += 1) {
          const input = getBestInput()
          if (input instanceof HTMLTextAreaElement) {
            if (await writeTextarea(input)) return true
          } else if (input) {
            if (await writeEditable(input)) return true
          }

          await sleep(180)
        }

        return false
      }) as (...args: unknown[]) => unknown,
      args: [prompt, autoSend],
    })

    return Boolean(result?.[0]?.result)
  }

  const runProcess = async (step: { label: string; prompt: string }, options?: { autoSend?: boolean; fast?: boolean }) => {
    const autoSend = Boolean(options?.autoSend)
    const fastMode = Boolean(options?.fast)
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.tabs.create || !extensionChrome.tabs.update || !extensionChrome.scripting?.executeScript) {
      setStatus('Môi trường hiện tại không hỗ trợ tự động gửi vào ChatGPT.')
      return
    }

    setStatus(`${step.label}: Đang mở ChatGPT và chuẩn bị xử lý...`)

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))

    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      target = await createTab(CHATGPT_URL)
    } else if (!target.url?.includes('chatgpt.com')) {
      target = await updateTab(target.id, CHATGPT_URL)
    } else {
      target = await updateTab(target.id)
    }

    if (!target?.id) {
      setStatus(`${step.label}: Không thể mở tab ChatGPT.`)
      return
    }

    setStatus(`${step.label}: Đã mở ChatGPT, đang điền prompt...`)

    let filled = false
    const attempts = fastMode ? 3 : 5
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(fastMode ? 120 : 220)
      }
      filled = await injectPrompt(target.id, step.prompt, autoSend)
      if (filled) break
    }

    if (!filled && autoSend) {
      await sleep(280)
      filled = await injectPrompt(target.id, step.prompt, true)
    }

    setStatus(
      filled
        ? autoSend
          ? `${step.label}: Đã điền và gửi prompt trên ChatGPT.`
          : `${step.label}: Đã điền prompt vào ChatGPT (chưa gửi).`
        : `${step.label}: Không tìm thấy khung chat để xử lý.`,
    )
  }

  useEffect(() => {
    const onRunStep1FromFacebook = (event: Event) => {
      const customEvent = event as CustomEvent<{ reelContent?: string }>
      const reelContent = customEvent.detail?.reelContent?.trim() || ''
      const mergedPrompt = `${STEP_1_PROMPT_TEMPLATE}\n\nStory:\n${reelContent}`
      void runProcess({ label: 'Tiến trình 1', prompt: mergedPrompt }, { autoSend: false, fast: false })
    }

    window.addEventListener('run-chatgpt-step1-from-facebook', onRunStep1FromFacebook as EventListener)
    return () => {
      window.removeEventListener('run-chatgpt-step1-from-facebook', onRunStep1FromFacebook as EventListener)
    }
  }, [])

  const splitCapturedImage = async (
    screenshotDataUrl: string,
    rect: { x: number; y: number; width: number; height: number; viewportWidth?: number; viewportHeight?: number },
  ) => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Không thể đọc ảnh chụp màn hình.'))
      img.src = screenshotDataUrl
    })

    const viewportWidth = rect.viewportWidth && rect.viewportWidth > 0 ? rect.viewportWidth : image.width
    const viewportHeight = rect.viewportHeight && rect.viewportHeight > 0 ? rect.viewportHeight : image.height
    const scaleX = image.width / viewportWidth
    const scaleY = image.height / viewportHeight

    const sourceX = Math.max(0, Math.round(rect.x * scaleX))
    const sourceY = Math.max(0, Math.round(rect.y * scaleY))
    const sourceW = Math.max(2, Math.round(rect.width * scaleX))
    const sourceH = Math.max(2, Math.round(rect.height * scaleY))
    const halfW = Math.max(1, Math.floor(sourceW / 2))

    const makePart = (sx: number, sw: number) => {
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sourceH
      const ctx = canvas.getContext('2d')
      if (!ctx) return ''
      ctx.drawImage(image, sx, sourceY, sw, sourceH, 0, 0, sw, sourceH)
      return canvas.toDataURL('image/png')
    }

    const left = makePart(sourceX, halfW)
    const right = makePart(sourceX + halfW, sourceW - halfW)
    return { left, right }
  }

  const saveCopiedSplitImageIfNew = async (dataUrl: string, part: 'left' | 'right', imageBlob: Blob) => {
    const extensionChrome = getChrome()
    if (!extensionChrome) {
      return { saved: false as const, skipped: false as const, reason: 'not_extension' as const }
    }
    const runtime = extensionChrome.runtime
    const sendMessage = runtime?.sendMessage
    if (!runtime?.id) {
      return { saved: false as const, skipped: false as const, reason: 'not_extension' as const }
    }
    const hashKey = `${part}:${hashDataUrl(dataUrl)}`
    const storage = extensionChrome?.storage?.local
    if (!storage?.get || !storage?.set) {
      return { saved: false as const, skipped: false as const, reason: 'no_storage' as const }
    }

    const existing = await new Promise<string[]>((resolve) => {
      storage.get?.([SAVED_SPLIT_IMAGE_HASHES_KEY], (items) => {
        const raw = items[SAVED_SPLIT_IMAGE_HASHES_KEY]
        resolve(Array.isArray(raw) ? (raw as string[]) : [])
      })
    })

    if (existing.includes(hashKey)) {
      return { saved: false, skipped: true, reason: 'duplicate' as const }
    }

    const safeHash = hashKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
    const filename = `${SPLIT_IMAGE_DOWNLOAD_FOLDER}/part-${part === 'left' ? '1' : '2'}-${safeHash}.png`
    const baseFileName = filename.includes('/') ? filename.split('/').pop() || 'image.png' : filename

    /** Fallback khi `chrome.downloads` không có (một số bản Chrome / side panel): tải qua thẻ `<a download>`. */
    const tryAnchorDownloadBlob = () => {
      const objectUrl = URL.createObjectURL(imageBlob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = baseFileName
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
    }

    const tryAnchorDownloadDataUrl = () => {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = baseFileName
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }

    const tryPageDownloadBlob = () =>
      new Promise<void>((resolve, reject) => {
        const d = extensionChrome.downloads?.download
        if (!d) {
          reject(new Error('no_downloads_api'))
          return
        }
        const objectUrl = URL.createObjectURL(imageBlob)
        d({ url: objectUrl, filename, saveAs: false, conflictAction: 'uniquify' }, () => {
          const err = runtime.lastError
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
          if (err?.message) reject(new Error(err.message))
          else resolve()
        })
      })

    const tryPageDownloadDataUrl = () =>
      new Promise<void>((resolve, reject) => {
        const d = extensionChrome.downloads?.download
        if (!d) {
          reject(new Error('no_downloads_api'))
          return
        }
        d({ url: dataUrl, filename, saveAs: false, conflictAction: 'uniquify' }, () => {
          const err = runtime.lastError
          if (err?.message) reject(new Error(err.message))
          else resolve()
        })
      })

    const tryBackgroundMessage = (payload: unknown) =>
      new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        if (!sendMessage) {
          reject(new Error('no_receiver'))
          return
        }
        sendMessage(payload, (res) => {
          const le = runtime.lastError
          if (le?.message) reject(new Error(le.message))
          else {
            const body = res as { ok?: boolean; error?: string } | undefined
            resolve({ ok: Boolean(body?.ok), error: body?.error })
          }
        })
      })

    const runDownload = async () => {
      const hasDownloadsApi = Boolean(extensionChrome.downloads?.download)

      if (hasDownloadsApi) {
        try {
          await tryPageDownloadBlob()
          return
        } catch {
          /* thử anchor + background + data URL */
        }
      } else {
        tryAnchorDownloadBlob()
        return
      }

      tryAnchorDownloadBlob()

      if (sendMessage) {
        try {
          const buffer = await imageBlob.arrayBuffer()
          const r = await tryBackgroundMessage({
            type: 'DOWNLOAD_ARRAY_BUFFER',
            buffer,
            filename,
            mimeType: imageBlob.type || 'image/png',
          })
          if (r.ok) return
        } catch {
          /* fall through */
        }
        try {
          const r = await tryBackgroundMessage({ type: 'DOWNLOAD_DATA_URL', dataUrl, filename })
          if (r.ok) return
        } catch {
          /* fall through */
        }
      }

      try {
        await tryPageDownloadDataUrl()
        return
      } catch {
        /* fall through */
      }

      tryAnchorDownloadDataUrl()
    }

    await runDownload()

    const next = [...existing.filter((k) => k !== hashKey), hashKey].slice(-SAVED_SPLIT_IMAGE_HASHES_MAX)
    await new Promise<void>((resolve) => storage.set?.({ [SAVED_SPLIT_IMAGE_HASHES_KEY]: next }, () => resolve()))

    return { saved: true, skipped: false, reason: 'ok' as const }
  }

  const copyImageDataUrl = async (dataUrl: string, label: string, part: 'left' | 'right') => {
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopiedPart(part)
      window.setTimeout(() => setCopiedPart((prev) => (prev === part ? null : prev)), 1200)

      let saveNote = ''
      try {
        const saveResult = await saveCopiedSplitImageIfNew(dataUrl, part, blob)
        if (saveResult.skipped) saveNote = ' Ảnh này đã được lưu trước đó, không lưu lại.'
        else if (saveResult.saved)
          saveNote = ` Đã lưu file: Downloads/${SPLIT_IMAGE_DOWNLOAD_FOLDER}/… (PNG).`
        else if (saveResult.reason === 'not_extension')
          saveNote =
            ' Lưu file cần mở extension đã cài (icon puzzle → AI Content Extension), không mở giao diện bằng tab localhost. Sau khi thêm quyền Downloads, vào chrome://extensions và bấm Tải lại.'
        else if (saveResult.reason === 'no_storage')
          saveNote = ' (Không lưu file: thiếu chrome.storage trong môi trường này.)'
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Lỗi không xác định'
        saveNote = ` Không lưu được file: ${msg}`
      }

      setStatus(`Đã sao chép ${label} vào clipboard.${saveNote}`)
    } catch {
      setStatus(`Không thể sao chép ${label}. Hãy thử lại.`)
    }
  }

  const extractVideoContentFromStep2 = async (part: 1 | 2, options?: { copyToClipboard?: boolean }) => {
    const copyToClipboard = options?.copyToClipboard !== false
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      setStatus('Môi trường hiện tại không hỗ trợ lấy nội dung VIDEO.')
      return ''
    }

    if (copyToClipboard) {
      setStatus(`Đang lấy nội dung VIDEO ${part} từ Tiến trình 2...`)
    }

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))
    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      setStatus('Không tìm thấy tab ChatGPT để lấy nội dung VIDEO.')
      return ''
    }

    target = await updateTab(target.id)
    await sleep(240)

    if (!target?.id) {
      setStatus('Không thể kích hoạt tab ChatGPT để lấy nội dung VIDEO.')
      return ''
    }

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: ((videoPart: number) => {
        const normalize = (text: string) => text.replace(/\r/g, '')

        const extractByHeading = (source: string, headingRegex: RegExp, stopRegexes: RegExp[]) => {
          const match = source.match(headingRegex)
          if (!match || match.index === undefined) return ''
          const start = match.index + match[0].length
          const tail = source.slice(start)

          let end = tail.length
          for (const rg of stopRegexes) {
            const m = tail.match(rg)
            if (m && m.index !== undefined) {
              end = Math.min(end, m.index)
            }
          }

          return tail.slice(0, end).trim()
        }
        const trimVideoTail = (raw: string) => {
          const source = (raw || '').trim()
          if (!source) return ''

          const stopMarkers = [
            /(?:^|\n)\s*🎯\s*production\s*notes\b/i,
            /(?:^|\n)\s*(?:🔥\s*)?notes?\s*for\s*ai\s*video\s*tools\b/i,
            /(?:^|\n)\s*⚡\s*cinematic\s*rules\b/i,
            /(?:^|\n)\s*cinematic\s*rules\b/i,
            /(?:^|\n)\s*(?:🔁\s*)?continuity\s*notes\b/i,
            /(?:^|\n)\s*if\s+you\s+want\s+next\b/i,
            /(?:^|\n)\s*just\s+tell\s+me\b/i,
            /(?:^|\n)\s*✅\s*/i,
            /(?:^|\n)\s*i\s+can\s+generate\b/i,
            /(?:^|\n)\s*or\s+convert\b/i,
            /(?:^|\n)\s*(?:🎬\s*)?idea\s*\d+\b/i,
            /(?:^|\n)\s*(?:🖼️\s*)?image\s*\d+\b/i,
            /(?:^|\n)\s*(?:🎥\s*)?video\s*\d+\b/i,
          ]

          let end = source.length
          for (const rg of stopMarkers) {
            const m = source.match(rg)
            if (m && m.index !== undefined && m.index > 0) {
              end = Math.min(end, m.index)
            }
          }

          return source.slice(0, end).trim()
        }
        const compactLines = (raw: string) => {
          const source = (raw || '').replace(/\r/g, '').trim()
          if (!source) return ''
          return source
            .split('\n')
            .map((line) => line.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join('\n')
        }

        const assistantNodes = Array.from(
          document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"], article'),
        )
          .filter((el) => (el.innerText || '').trim().length > 0)
          .reverse()

        const candidateNode =
          assistantNodes.find((el) => /idea\s*1|idea\s*2|video\s*1|video\s*2/i.test(el.innerText || '')) ||
          assistantNodes[0]
        if (!candidateNode) return ''

        // Scroll to the relevant assistant response block first.
        candidateNode.scrollIntoView({ block: 'start', behavior: 'instant' })

        // Then attempt to scroll closer to the exact section heading.
        const headingNodes = Array.from(candidateNode.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, strong'))
        const getText = (node: HTMLElement) => (node.innerText || '').replace(/\s+/g, ' ').trim()
        const findHeading = (regex: RegExp) =>
          headingNodes
            .filter((node) => regex.test(getText(node)))
            .sort((a, b) => getText(a).length - getText(b).length)[0]

        // VIDEO 2 is usually inside IDEA 2, so scroll to IDEA 2 first for better accuracy.
        if (videoPart === 2) {
          const idea2Heading = findHeading(/\bidea\s*2\b/i)
          idea2Heading?.scrollIntoView({ block: 'start', behavior: 'instant' })
        }

        const targetHeading = findHeading(new RegExp(`\\bvideo\\s*${videoPart}\\b`, 'i'))
        targetHeading?.scrollIntoView({ block: 'start', behavior: 'instant' })

        const text = normalize(candidateNode.innerText || '')

        // Strategy A: extract inside IDEA block (common format).
        const idea1Block = extractByHeading(
          text,
          /(?:^|\n)\s*#{0,6}\s*(?:🎬\s*)?idea\s*1\b[^\n]*\n/i,
          [/(?:^|\n)\s*#{0,6}\s*(?:🎬\s*)?idea\s*2\b[^\n]*\n/i, /(?:^|\n)\s*#{0,6}\s*🔁\s*continuity\s*notes\b/i],
        )
        const idea2Block = extractByHeading(
          text,
          /(?:^|\n)\s*#{0,6}\s*(?:🎬\s*)?idea\s*2\b[^\n]*\n/i,
          [/(?:^|\n)\s*#{0,6}\s*🔁\s*continuity\s*notes\b/i],
        )

        const pickIdeaVideo = (ideaBlock: string, n: number) => {
          if (!ideaBlock) return ''
          const headingStopsForVideo1 = [
            /(?:^|\n)\s*#{1,6}\s*(?:🎬\s*)?idea\s*2\b/i,
            /(?:^|\n)\s*#{1,6}\s*(?:🖼️\s*)?image\s*2\b/i,
            /(?:^|\n)\s*#{1,6}\s*(?:🎥\s*)?video\s*2\b/i,
            /(?:^|\n)\s*#{1,6}\s*🔁\s*continuity\s*notes\b/i,
          ]
          const headingStopsForVideo2 = [
            /(?:^|\n)\s*#{1,6}\s*🔁\s*continuity\s*notes\b/i,
            /(?:^|\n)\s*#{1,6}\s*(?:🎬\s*)?idea\s*3\b/i,
            /(?:^|\n)\s*#{1,6}\s*(?:🎥\s*)?video\s*3\b/i,
          ]
          const plainLineStopsForVideo1 = [
            /(?:^|\n)\s*(?:🖼️\s*)?image\s*2\b[^\n]*/i,
            /(?:^|\n)\s*(?:🎬\s*)?idea\s*2\b[^\n]*/i,
            /(?:^|\n)\s*(?:🔥\s*)?notes?\s*for\s*ai\s*video\s*tools\b[^\n]*/i,
            /(?:^|\n)\s*(?:🔁\s*)?continuity\s*notes\b[^\n]*/i,
          ]
          const plainLineStopsForVideo2 = [
            /(?:^|\n)\s*(?:🔥\s*)?notes?\s*for\s*ai\s*video\s*tools\b[^\n]*/i,
            /(?:^|\n)\s*(?:🔁\s*)?continuity\s*notes\b[^\n]*/i,
            /(?:^|\n)\s*(?:🎬\s*)?idea\s*3\b[^\n]*/i,
            /(?:^|\n)\s*(?:🖼️\s*)?image\s*3\b[^\n]*/i,
          ]

          const directVideo = extractByHeading(
            ideaBlock,
            new RegExp(`(?:^|\\n)\\s*#{0,6}\\s*(?:🎥\\s*)?video\\s*${n}\\b[^\\n]*\\n`, 'i'),
            [...(n === 1 ? headingStopsForVideo1 : headingStopsForVideo2), ...(n === 1 ? plainLineStopsForVideo1 : plainLineStopsForVideo2)],
          )
          return trimVideoTail(directVideo || ideaBlock.trim())
        }

        // Strategy B: generic video heading fallback.
        const genericVideo = extractByHeading(
          text,
          new RegExp(`(?:^|\\n)\\s*(?:\\*{0,2})?(?:#{0,6}\\s*)?(?:🎥\\s*)?video\\s*${videoPart}\\b[^\\n]*\\n`, 'i'),
          [
            new RegExp(`(?:^|\\n)\\s*(?:\\*{0,2})?(?:#{0,6}\\s*)?(?:🎥\\s*)?video\\s*${videoPart === 1 ? 2 : 3}\\b`, 'i'),
            /(?:^|\n)\s*#{1,6}\s*(?:🎬\s*)?idea\s*\d+\b/i,
            /(?:^|\n)\s*#{1,6}\s*(?:🖼️\s*)?image\s*\d+\b/i,
            /(?:^|\n)\s*#{1,6}\s*🔁\s*continuity\s*notes\b/i,
            /(?:^|\n)\s*(?:🔥\s*)?notes?\s*for\s*ai\s*video\s*tools\b[^\n]*/i,
            /(?:^|\n)\s*(?:🔁\s*)?continuity\s*notes\b[^\n]*/i,
            /(?:^|\n)\s*(?:🖼️\s*)?image\s*\d+\b[^\n]*/i,
            /(?:^|\n)\s*(?:🎬\s*)?idea\s*\d+\b[^\n]*/i,
          ],
        )

        if (videoPart === 1) {
          return compactLines(trimVideoTail(pickIdeaVideo(idea1Block, 1) || genericVideo))
        }
        return compactLines(trimVideoTail(pickIdeaVideo(idea2Block, 2) || genericVideo))
      }) as (...args: unknown[]) => unknown,
      args: [part],
    })

    const extracted = ((result?.[0]?.result as string | undefined) || '').trim()
    if (!extracted) {
      if (copyToClipboard) {
        setStatus(`Không tìm thấy nội dung VIDEO ${part}. Hãy đảm bảo đã có output Tiến trình 2 trong hội thoại.`)
      }
      return ''
    }

    if (copyToClipboard) {
      try {
        await navigator.clipboard.writeText(extracted)
        const toolId = `video-${part}`
        setCopiedTool(toolId)
        window.setTimeout(() => setCopiedTool((prev) => (prev === toolId ? null : prev)), 1200)
        setStatus(`Đã lấy và sao chép nội dung VIDEO ${part} vào clipboard.`)
      } catch {
        setStatus(`Đã lấy nội dung VIDEO ${part} nhưng sao chép thất bại.`)
      }
    }
    return extracted
  }

  const fillGrokWithVideoImage = async (part: 1 | 2) => {
    setStatus(`Đang lấy ảnh ${part} (Tiến trình 3) và nội dung VIDEO ${part} (Tiến trình 2)...`)

    const imageDataUrl = part === 1 ? splitImages?.left : splitImages?.right
    if (!imageDataUrl) {
      setStatus(`Chưa có ảnh ${part} từ Tiến trình 3. Hãy bấm nút cắt ảnh trước.`)
      return
    }

    const prompt = await extractVideoContentFromStep2(part, { copyToClipboard: false })
    if (!prompt) {
      setStatus(`Không tìm thấy nội dung VIDEO ${part} trong output Tiến trình 2.`)
      return
    }

    window.dispatchEvent(new CustomEvent('switch-main-tab', { detail: { tabId: 'grok' } }))
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('fill-grok-from-chatgpt-video1-image', {
          detail: { prompt, imageDataUrl, part },
        }),
      )
    }, 120)

    setStatus(`Đã chuyển Grok: dùng ảnh ${part} (Tiến trình 3) + VIDEO ${part} (Tiến trình 2), không Enter.`)
  }

  const extractStep4Content = async (kind: 'title_plain' | 'title_styled' | 'content_short' | 'content_full') => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript) {
      const kindLabel =
        kind === 'title_plain'
          ? 'tiêu đề'
          : kind === 'title_styled'
            ? 'tiêu đề font kiểu'
            : kind === 'content_short'
              ? 'nội dung ngắn'
              : 'nội dung toàn bộ'
      setStatus(`Môi trường hiện tại không hỗ trợ lấy ${kindLabel} Tiến trình 4.`)
      return
    }

    const kindLabel =
      kind === 'title_plain'
        ? 'tiêu đề'
        : kind === 'title_styled'
          ? 'tiêu đề font kiểu'
          : kind === 'content_short'
            ? 'nội dung ngắn'
            : 'nội dung toàn bộ'

    setStatus(`Đang lấy ${kindLabel} từ Tiến trình 4...`)

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))
    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      setStatus('Không tìm thấy tab ChatGPT để lấy dữ liệu Tiến trình 4.')
      return
    }

    target = await updateTab(target.id)
    await sleep(240)

    if (!target?.id) {
      setStatus('Không thể kích hoạt tab ChatGPT để lấy dữ liệu Tiến trình 4.')
      return
    }

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: ((extractKind: 'title_plain' | 'title_styled' | 'content_short' | 'content_full') => {
        const normalize = (text: string) => text.replace(/\r/g, '').trim()
        const getLargestCodeBlock = (text: string) => {
          const matches = Array.from(text.matchAll(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g))
          if (matches.length === 0) return ''
          return matches
            .map((m) => (m[1] || '').trim())
            .sort((a, b) => b.length - a.length)[0]
        }

        const splitParagraphs = (text: string) =>
          normalize(text)
            .split(/\n\s*\n/)
            .map((block) => block.trim())
            .filter(Boolean)

        const pickTitle = (text: string) => {
          const cleanTitleEnd = (value: string) => value.trim().replace(/[.!?…,:;\-\s]+$/g, '')
          const normalized = normalize(text)
          if (!normalized) return ''

          const titleLine = normalized.match(/(?:^|\n)\s*title\s*[:\-]\s*([^\n]+)/i)
          if (titleLine?.[1]) return cleanTitleEnd(titleLine[1])

          const headingLine = normalized.match(/(?:^|\n)\s*#{1,6}\s*([^\n]+)/)
          if (headingLine?.[1]) return cleanTitleEnd(headingLine[1])

          const paragraphs = splitParagraphs(normalized)
          const firstBlock = paragraphs[0] || ''
          const sentenceMatches = Array.from(firstBlock.matchAll(/[^.!?]+[.!?]+/g)).map((m) => (m[0] || '').trim())
          if (sentenceMatches.length >= 2) {
            return cleanTitleEnd(`${sentenceMatches[0]} ${sentenceMatches[1]}`)
          }
          if (firstBlock) return cleanTitleEnd(firstBlock.split('\n')[0] || '')
          return ''
        }

        const pickContent = (text: string) => {
          const normalized = normalize(text)
          if (!normalized) return ''

          const blockContent = getLargestCodeBlock(normalized)
          const base = blockContent || normalized
          const paragraphs = splitParagraphs(base)
          if (paragraphs.length <= 1) return base

          const firstWords = (paragraphs[0].match(/\S+/g) || []).length
          if (firstWords <= 26) {
            return paragraphs.slice(1).join('\n\n').trim()
          }
          return base
        }

        const pickShortContent = (text: string) => {
          const full = pickContent(text)
          if (!full) return ''

          const MIN_LEN = 260
          const MAX_SCAN = 1200
          const normalized = full.replace(/\r/g, '').trim()
          if (!normalized) return ''

          const searchSpace = normalized.slice(0, MAX_SCAN)
          const questionIndex = searchSpace.indexOf('?')

          if (questionIndex >= 0) {
            const untilQuestion = normalized.slice(0, questionIndex + 1).trim()
            if (untilQuestion.length >= MIN_LEN) return untilQuestion

            // If first '?' is too early, extend to the next line/sentence ending.
            const rest = normalized.slice(questionIndex + 1)
            const nextBreakCandidates = [rest.indexOf('\n'), rest.search(/[.!?]/)]
              .filter((idx) => idx >= 0)
              .sort((a, b) => a - b)
            if (nextBreakCandidates.length > 0) {
              const extended = normalized.slice(0, questionIndex + 1 + nextBreakCandidates[0] + 1).trim()
              if (extended) return extended
            }
            return untilQuestion
          }

          // Fallback: no '?' within limit => cut at a clean line/sentence boundary.
          const limited = searchSpace
          const lastLineBreak = limited.lastIndexOf('\n')
          if (lastLineBreak >= MIN_LEN) return limited.slice(0, lastLineBreak).trim()

          const lastSentenceEnd = Math.max(limited.lastIndexOf('.'), limited.lastIndexOf('!'))
          if (lastSentenceEnd >= MIN_LEN) return limited.slice(0, lastSentenceEnd + 1).trim()

          return limited.trim()
        }

        const stylizeTitle = (title: string) => {
          const upper = title.toUpperCase()
          const plain = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
          const styled = '𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁'
          const styledChars = Array.from(styled)
          return upper
            .split('')
            .map((char) => {
              const index = plain.indexOf(char)
              return index >= 0 ? (styledChars[index] || char) : char
            })
            .join('')
        }

        const assistantNodes = Array.from(
          document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"], article'),
        )
          .filter((el) => (el.innerText || '').trim().length > 0)
          .reverse()

        const candidateNode =
          assistantNodes.find((el) => {
            const text = (el.innerText || '').toLowerCase()
            return text.length > 1200 || /write a complete|full-length english story|twist ending|title/i.test(text)
          }) || assistantNodes[0]

        if (!candidateNode) return ''

        candidateNode.scrollIntoView({ block: 'start', behavior: 'instant' })
        const raw = normalize(candidateNode.innerText || '')
        if (!raw) return ''

        if (extractKind === 'title_plain') return pickTitle(raw)
        if (extractKind === 'title_styled') return stylizeTitle(pickTitle(raw))
        if (extractKind === 'content_short') return pickShortContent(raw)
        return pickContent(raw)
      }) as (...args: unknown[]) => unknown,
      args: [kind],
    })

    const extracted = ((result?.[0]?.result as string | undefined) || '').trim()
    if (!extracted) {
      setStatus(`Không tìm thấy ${kindLabel} từ output Tiến trình 4.`)
      return
    }

    try {
      await navigator.clipboard.writeText(extracted)
      const toolId = `step4-${kind}`
      setCopiedTool(toolId)
      window.setTimeout(() => setCopiedTool((prev) => (prev === toolId ? null : prev)), 1200)
      setStatus(`Đã lấy và sao chép ${kindLabel} Tiến trình 4 vào clipboard.`)
    } catch {
      setStatus(`Đã lấy ${kindLabel} Tiến trình 4 nhưng sao chép thất bại.`)
    }
  }

  const extractAndSplitLatestImageFromStep3 = async () => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.scripting?.executeScript || !extensionChrome.tabs.captureVisibleTab) {
      setStatus('Môi trường hiện tại không hỗ trợ công cụ xử lý ảnh.')
      return
    }

    setStatus('Đang lấy ảnh mới nhất từ hội thoại và cắt đôi...')

    const currentActive = await queryTabs(undefined, true, true)
    const activeTab = currentActive[0]
    const isActiveChatgpt = Boolean(activeTab?.url && /chatgpt\.com|chat\.openai\.com/i.test(activeTab.url))

    const activeTabs = isActiveChatgpt ? [activeTab] : await queryTabs(CHATGPT_PATTERNS, true, true)
    const allTabs = activeTabs.length > 0 ? activeTabs : await queryTabs(CHATGPT_PATTERNS)
    let target: BrowserTab | null | undefined = allTabs[0]

    if (!target?.id) {
      target = await createTab(CHATGPT_URL)
      await sleep(900)
    } else {
      target = await updateTab(target.id)
      await sleep(450)
    }

    if (!target?.id) {
      setStatus('Không tìm thấy tab ChatGPT để lấy ảnh.')
      return
    }

    const locateResult = await extensionChrome.scripting.executeScript({
      target: { tabId: target.id },
      func: (async () => {
        const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
        const isVisible = (el: HTMLElement) => {
          const rect = el.getBoundingClientRect()
          const style = window.getComputedStyle(el)
          return rect.width > 120 && rect.height > 120 && style.display !== 'none' && style.visibility !== 'hidden'
        }

        const imageCandidates = Array.from(document.querySelectorAll<HTMLImageElement>('article img, [data-message-author-role] img, main img'))
          .filter((img) => isVisible(img))
          .map((img) => {
            const rect = img.getBoundingClientRect()
            const score = rect.width * rect.height + rect.top
            return { img, rect, score }
          })
          .sort((a, b) => b.score - a.score)

        const candidate = imageCandidates[0]
        if (!candidate) return null

        candidate.img.scrollIntoView({ block: 'center', behavior: 'instant' })
        await sleep(120)
        candidate.img.click()
        await sleep(260)

        const modalCandidates = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
          .filter((img) => isVisible(img))
          .map((img) => {
            const rect = img.getBoundingClientRect()
            const score = rect.width * rect.height
            return { img, rect, score }
          })
          .sort((a, b) => b.score - a.score)

        const selected = modalCandidates[0] || candidate
        const rect = selected.rect
        return {
          x: Math.max(0, rect.left),
          y: Math.max(0, rect.top),
          width: rect.width,
          height: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          openedModal: true,
        }
      }) as (...args: unknown[]) => unknown,
    })

    const rect =
      (locateResult?.[0]?.result as {
        x: number
        y: number
        width: number
        height: number
        viewportWidth?: number
        viewportHeight?: number
        openedModal?: boolean
      } | null) || null
    if (!rect || rect.width < 2 || rect.height < 2) {
      setStatus('Không tìm thấy ảnh phù hợp từ hội thoại (tiến trình 3).')
      return
    }

    const screenshotDataUrl = await captureVisibleTab(undefined)
    if (!screenshotDataUrl) {
      setStatus('Không thể chụp ảnh màn hình tab ChatGPT.')
      return
    }

    try {
      const parts = await splitCapturedImage(screenshotDataUrl, rect)
      if (!parts.left || !parts.right) {
        setStatus('Không thể tách ảnh thành 2 phần.')
        return
      }
      setSplitImages(parts)
      setStatus('Đã lấy và cắt đôi ảnh thành công. Có thể sao chép ảnh 1/2.')

      if (rect.openedModal) {
        await extensionChrome.scripting.executeScript({
          target: { tabId: target.id },
          func: (() => {
            const closeButton =
              (document.querySelector('button[aria-label*="Close"]') as HTMLButtonElement | null) ||
              (document.querySelector('button[aria-label*="Đóng"]') as HTMLButtonElement | null)
            closeButton?.click()
            document.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
              }),
            )
            document.dispatchEvent(
              new KeyboardEvent('keyup', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
              }),
            )
          }) as (...args: unknown[]) => unknown,
        })
      }
    } catch {
      setStatus('Xử lý ảnh thất bại. Hãy thử lại.')
    }
  }

  const selectedStep = PROCESS_STEPS.find((step) => step.id === selectedStepId) || PROCESS_STEPS[0]

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-4">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_92px] gap-3">
        <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/30 p-3">
          <h2 className="text-sm font-semibold text-white">{selectedStep.label}</h2>
          <p className="mt-1 text-[11px] text-slate-400">Nội dung chi tiết tiến trình đang chọn.</p>
          <textarea
            readOnly
            value={selectedStep.prompt}
            className="mt-2 min-h-[180px] flex-1 w-full resize-none rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-200 outline-none"
          />
          <p className="mt-2 shrink-0 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-slate-300">{status}</p>
        </div>

        <aside className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/30 p-2">
          <div className="min-h-0 space-y-1.5 overflow-y-auto pr-0.5">
            {PROCESS_STEPS.map((step) => (
              <div key={step.id} className="rounded-xl border border-white/10 bg-white/5 p-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedStepId(step.id)}
                  className={`inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1 rounded-lg transition ${
                    selectedStepId === step.id
                      ? 'bg-blue-500/25 text-blue-100 ring-1 ring-blue-300/40'
                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                  title={`Xem chi tiết ${step.label}`}
                >
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold leading-none text-white">
                    {step.id.replace('step-', '')}
                  </span>
                </button>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void runProcess(step, { autoSend: true, fast: true })}
                    disabled={step.id === 'step-1'}
                    className="inline-flex h-7 w-full cursor-pointer items-center justify-center rounded-md bg-emerald-500/25 text-emerald-100 transition hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Chạy nhanh và tự Enter"
                  >
                    <IoFlash className="h-3.5 w-3.5 text-emerald-300" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void runProcess(step, { autoSend: false, fast: false })}
                    className="inline-flex h-7 w-full cursor-pointer items-center justify-center rounded-md bg-amber-500/20 text-amber-100 transition hover:bg-amber-500/30"
                    title="Điền prompt, không Enter"
                  >
                    <FiEdit3 className="h-3.5 w-3.5 text-amber-300" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 shrink-0 rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => void extractAndSplitLatestImageFromStep3()}
                className="col-span-2 inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-500/25 px-2 py-1.5 text-blue-100 transition hover:bg-blue-500/35"
                title="Lấy ảnh từ tiến trình 3 và cắt đôi"
              >
                <FiScissors className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void (splitImages ? copyImageDataUrl(splitImages.left, 'ảnh 1', 'left') : Promise.resolve())}
                disabled={!splitImages}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-emerald-500/25 px-2 py-1.5 text-emerald-100 transition hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                title="Sao chép ảnh 1"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiImage className="h-3.5 w-3.5" />
                  <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[8px] font-bold leading-none text-white">
                    1
                  </span>
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-emerald-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedPart === 'left' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void (splitImages ? copyImageDataUrl(splitImages.right, 'ảnh 2', 'right') : Promise.resolve())}
                disabled={!splitImages}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-emerald-500/25 px-2 py-1.5 text-emerald-100 transition hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                title="Sao chép ảnh 2"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiImage className="h-3.5 w-3.5" />
                  <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[8px] font-bold leading-none text-white">
                    2
                  </span>
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-emerald-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedPart === 'right' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractVideoContentFromStep2(1)}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-500/20 px-2 py-1.5 text-blue-100 transition hover:bg-blue-500/30"
                title="Lấy nội dung VIDEO 1 (Tiến trình 2)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiFilm className="h-3.5 w-3.5" />
                  <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[8px] font-bold leading-none text-white">
                    1
                  </span>
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-blue-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'video-1' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractVideoContentFromStep2(2)}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-500/20 px-2 py-1.5 text-blue-100 transition hover:bg-blue-500/30"
                title="Lấy nội dung VIDEO 2 (Tiến trình 2)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiFilm className="h-3.5 w-3.5" />
                  <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[8px] font-bold leading-none text-white">
                    2
                  </span>
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-blue-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'video-2' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractStep4Content('title_plain')}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-violet-500/20 px-2 py-1.5 text-violet-100 transition hover:bg-violet-500/30"
                title="Lấy tiêu đề thường (Tiến trình 4)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiType className="h-3.5 w-3.5" />
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-violet-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'step4-title_plain' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractStep4Content('title_styled')}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-violet-500/20 px-2 py-1.5 text-violet-100 transition hover:bg-violet-500/30"
                title="Lấy tiêu đề font kiểu (Tiến trình 4)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiItalic className="h-3.5 w-3.5" />
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-violet-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'step4-title_styled' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractStep4Content('content_short')}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-fuchsia-500/20 px-2 py-1.5 text-fuchsia-100 transition hover:bg-fuchsia-500/30"
                title="Lấy nội dung ngắn có dấu hỏi (Tiến trình 4)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiAlignLeft className="h-3.5 w-3.5" />
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-fuchsia-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'step4-content_short' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void extractStep4Content('content_full')}
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-fuchsia-500/20 px-2 py-1.5 text-fuchsia-100 transition hover:bg-fuchsia-500/30"
                title="Lấy nội dung toàn bộ (Tiến trình 4)"
              >
                <span className="relative inline-flex items-center justify-center">
                  <FiFileText className="h-3.5 w-3.5" />
                  <span className="absolute -left-2 -bottom-2 inline-flex h-2.5 min-w-2.5 items-center justify-center rounded-full bg-fuchsia-600 px-0 text-[6px] font-bold leading-none text-white">
                    {copiedTool === 'step4-content_full' ? <FiCheck className="h-2 w-2" /> : <FiCopy className="h-2 w-2" />}
                  </span>
                </span>
              </button>
            </div>
          </div>
        </aside>
      </div>
      <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-2">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => void fillGrokWithVideoImage(1)}
          className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg bg-sky-500/20 px-2 text-sky-100 transition hover:bg-sky-500/30"
          title="Lấy ảnh 1 (VIDEO 1) và tự điền vào Grok"
        >
          <span className="relative inline-flex items-center justify-center gap-1">
            <SiX className="h-3 w-3" />
            <FiImage className="h-3 w-3" />
            <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 px-0.5 text-[8px] font-bold leading-none text-white">
              1
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void fillGrokWithVideoImage(2)}
          className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg bg-sky-500/20 px-2 text-sky-100 transition hover:bg-sky-500/30"
          title="Lấy ảnh 2 (VIDEO 2) và tự điền vào Grok"
        >
          <span className="relative inline-flex items-center justify-center gap-1">
            <SiX className="h-3 w-3" />
            <FiImage className="h-3 w-3" />
            <span className="absolute -right-2 -top-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 px-0.5 text-[8px] font-bold leading-none text-white">
              2
            </span>
          </span>
        </button>
        </div>
      </div>
    </section>
  )
}
