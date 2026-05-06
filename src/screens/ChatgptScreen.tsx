import { useEffect, useState } from 'react'

type BrowserTab = { id?: number; url?: string; active?: boolean }
type ExtensionChrome = {
  tabs?: {
    query?: (
      queryInfo: { url?: string[]; currentWindow?: boolean; active?: boolean },
      callback: (tabs: BrowserTab[]) => void,
    ) => void
    create?: (createProperties: { url: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
    update?: (tabId: number, updateProperties: { url?: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
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

  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

  const injectPromptOnly = async (tabId: number, prompt: string) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.scripting?.executeScript) return false

    const result = await extensionChrome.scripting.executeScript({
      target: { tabId },
      func: (async (message: string) => {
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

        const writeTextarea = (textarea: HTMLTextAreaElement) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
          setter?.call(textarea, message)
          triggerInput(textarea)
          textarea.focus()
          return (textarea.value || '').includes(needle)
        }

        const writeEditable = (editable: HTMLElement) => {
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
          return (editable.innerText || editable.textContent || '').includes(needle)
        }

        for (let attempt = 0; attempt < 5; attempt += 1) {
          const input = getBestInput()
          if (input instanceof HTMLTextAreaElement) {
            if (writeTextarea(input)) return true
          } else if (input) {
            if (writeEditable(input)) return true
          }

          await sleep(180)
        }

        return false
      }) as (...args: unknown[]) => unknown,
      args: [prompt],
    })

    return Boolean(result?.[0]?.result)
  }

  const runProcess = async (step: { label: string; prompt: string }) => {
    const extensionChrome = getChrome()
    if (!extensionChrome?.tabs?.query || !extensionChrome.tabs.create || !extensionChrome.tabs.update || !extensionChrome.scripting?.executeScript) {
      setStatus('Môi trường hiện tại không hỗ trợ tự động gửi vào ChatGPT.')
      return
    }

    setStatus(`${step.label}: Đang mở ChatGPT và chuẩn bị gửi...`)

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
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        await sleep(220)
      }
      filled = await injectPromptOnly(target.id, step.prompt)
      if (filled) break
    }

    setStatus(
      filled
        ? `${step.label}: Đã điền prompt vào ChatGPT (chưa gửi).`
        : `${step.label}: Không tìm thấy khung chat để điền prompt.`,
    )
  }

  useEffect(() => {
    const onRunStep1FromFacebook = (event: Event) => {
      const customEvent = event as CustomEvent<{ reelContent?: string }>
      const reelContent = customEvent.detail?.reelContent?.trim() || ''
      const mergedPrompt = `${STEP_1_PROMPT_TEMPLATE}\n\nStory:\n${reelContent}`
      void runProcess({ label: 'Tiến trình 1', prompt: mergedPrompt })
    }

    window.addEventListener('run-chatgpt-step1-from-facebook', onRunStep1FromFacebook as EventListener)
    return () => {
      window.removeEventListener('run-chatgpt-step1-from-facebook', onRunStep1FromFacebook as EventListener)
    }
  }, [])

  return (
    <section className="rounded-3xl bg-slate-800 p-4">
      <h2 className="text-sm font-semibold text-white">Quy trình ChatGPT</h2>
      <p className="mt-1 text-[11px] text-slate-400">Nhấn từng tiến trình để tự động gửi prompt mẫu vào ChatGPT.</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {PROCESS_STEPS.map((step) => (
          <button
            key={step.id}
            type="button"
            onClick={() => void runProcess(step)}
            className="rounded-2xl bg-emerald-500/20 px-3 py-2.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
          >
            {step.label}
          </button>
        ))}
      </div>

      <p className="mt-3 rounded-xl bg-slate-900 px-3 py-2 text-[11px] text-slate-300">{status}</p>
    </section>
  )
}
