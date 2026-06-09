/** Page scripts chạy trong tab Grok — mỗi export phải tự chứa (inject qua executeScript). */

export function grokFillImaginePageScript(
  message: string,
  imageSrc?: string,
  shouldSubmit?: boolean,
) {
  return (async () => {
    const sleepInner = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

    const isVisible = (el: Element | null): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      return rect.width > 24 && rect.height > 16 && style.display !== 'none' && style.visibility !== 'hidden'
    }

    const inputSelectors = [
      'textarea',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
    ]

    const getBestInput = () => {
      const candidates = inputSelectors.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)),
      )
      const visibles = candidates.filter((el) => isVisible(el))
      if (!visibles.length) return null
      visibles.sort((a, b) => {
        const ra = a.getBoundingClientRect()
        const rb = b.getBoundingClientRect()
        const scoreA = ra.width * ra.height - Math.abs(ra.top - window.innerHeight * 0.82) * 40
        const scoreB = rb.width * rb.height - Math.abs(rb.top - window.innerHeight * 0.82) * 40
        return scoreB - scoreA
      })
      return visibles[0]
    }

    const isButtonEnabled = (btn: HTMLElement) => {
      if (btn.hasAttribute('disabled')) return false
      if (btn.getAttribute('aria-disabled') === 'true') return false
      if (btn instanceof HTMLButtonElement && btn.disabled) return false
      const style = window.getComputedStyle(btn)
      if (style.pointerEvents === 'none') return false
      if (Number.parseFloat(style.opacity) < 0.45) return false
      return true
    }

    const findSubmitButton = () => {
      const selectors = [
        'button[type="submit"][aria-label="Gửi"]',
        'button[type="submit"][aria-label="Send"]',
        'button[type="submit"][aria-label*="Gửi" i]',
        'button[type="submit"][aria-label*="Send" i]',
      ]
      for (const selector of selectors) {
        const el = document.querySelector(selector)
        if (el instanceof HTMLElement && isVisible(el)) return el
      }
      const fallback = Array.from(document.querySelectorAll<HTMLElement>('button[type="submit"]')).filter(isVisible)
      return fallback.find((btn) => btn.querySelector('svg path[d*="M12 5"]')) || fallback[0] || null
    }

    const clickSubmit = (btn: HTMLElement) => {
      btn.focus()
      const rect = btn.getBoundingClientRect()
      const clientX = rect.left + rect.width / 2
      const clientY = rect.top + rect.height / 2
      const base = { bubbles: true, cancelable: true, clientX, clientY, view: window }
      btn.dispatchEvent(new PointerEvent('pointerdown', base))
      btn.dispatchEvent(new MouseEvent('mousedown', base))
      btn.dispatchEvent(new PointerEvent('pointerup', base))
      btn.dispatchEvent(new MouseEvent('mouseup', base))
      btn.click()
    }

    const countComposerImages = () => {
      return Array.from(document.querySelectorAll('img')).filter((img) => {
        if (!isVisible(img)) return false
        const rect = img.getBoundingClientRect()
        return (
          rect.width >= 40 &&
          rect.height >= 40 &&
          rect.width < window.innerWidth * 0.75 &&
          rect.bottom > window.innerHeight * 0.45
        )
      }).length
    }

    const hasNewUploadPreview = (baselineCount: number) => {
      if (countComposerImages() > baselineCount) return true
      return Array.from(document.querySelectorAll('img')).some((img) => {
        if (!isVisible(img)) return false
        const src = (img.currentSrc || img.src || '').trim()
        const rect = img.getBoundingClientRect()
        return (
          src.startsWith('blob:') &&
          rect.width >= 40 &&
          rect.height >= 40 &&
          rect.bottom > window.innerHeight * 0.45
        )
      })
    }

    const hasAttachmentPreview = () => hasNewUploadPreview(-1)

    const inputHasText = (input: HTMLElement | null) => {
      if (!input) return false
      if (input instanceof HTMLTextAreaElement) return (input.value || '').trim().length > 0
      return (input.innerText || input.textContent || '').trim().length > 0
    }

    const triggerInput = (el: HTMLElement, text: string) => {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }

    const writeText = (targetInput: HTMLElement, text: string) => {
      const needle = text.slice(0, 32).trim()
      if (targetInput instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        setter?.call(targetInput, text)
        triggerInput(targetInput, text)
        targetInput.focus()
        targetInput.setSelectionRange(text.length, text.length)
        return (targetInput.value || '').includes(needle)
      }
      targetInput.focus()
      targetInput.click()
      document.execCommand('selectAll', false)
      document.execCommand('insertText', false, text)
      triggerInput(targetInput, text)
      return (targetInput.innerText || targetInput.textContent || '').includes(needle)
    }

    const dataUrlToFile = (dataUrl: string, name: string) => {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i)
      if (!match) throw new Error('invalid data url')
      const mime = match[1] || 'image/png'
      const binary = atob(match[2])
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      return new File([bytes], name, { type: mime })
    }

    const loadImageFile = async (src: string) => {
      if (/^data:image\//i.test(src)) return dataUrlToFile(src, 'story-image.png')
      const response = await fetch(src)
      const blob = await response.blob()
      return new File([blob], 'story-image.png', { type: blob.type || 'image/png' })
    }

    const findFileInput = () => {
      return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).find((el) => {
        if (el.disabled) return false
        return /image/i.test(el.accept || '') || el.multiple || !el.accept
      })
    }

    const tryOpenAttachControl = () => {
      const labelOf = (el: HTMLElement) =>
        `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.textContent || ''}`.trim()
      const buttons = Array.from(document.querySelectorAll<HTMLElement>('button,[role="button"]')).filter(isVisible)
      const attachBtn = buttons.find((btn) =>
        /attach|upload|image|ảnh|file|media|add/i.test(labelOf(btn)),
      )
      if (attachBtn) attachBtn.click()
    }

    const uploadImage = async (targetInput: HTMLElement, src: string) => {
      let lastError = ''
      try {
        const file = await loadImageFile(src)
        const dt = new DataTransfer()
        dt.items.add(file)

        for (let attempt = 0; attempt < 4; attempt += 1) {
          let fileInput = findFileInput()
          if (!fileInput && attempt === 0) {
            tryOpenAttachControl()
            await sleepInner(350)
            fileInput = findFileInput()
          }
          if (fileInput) {
            fileInput.files = dt.files
            fileInput.dispatchEvent(new Event('change', { bubbles: true }))
            fileInput.dispatchEvent(new Event('input', { bubbles: true }))
            return { ok: true, method: 'file_input' }
          }
          await sleepInner(200)
        }

        targetInput.focus()
        targetInput.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
        targetInput.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
        return { ok: true, method: 'paste' }
      } catch (error) {
        lastError = String(error)
        return { ok: false, method: 'error', error: lastError }
      }
    }

    const waitForImagePreview = async (baselineCount: number, timeoutMs: number) => {
      const started = Date.now()
      let stableSince = 0
      while (Date.now() - started < timeoutMs) {
        const current = countComposerImages()
        const hasNewImage = hasNewUploadPreview(baselineCount)
        if (hasNewImage) {
          if (!stableSince) stableSince = Date.now()
          if (Date.now() - stableSince >= 1200) return true
        } else {
          stableSince = 0
        }
        await sleepInner(450)
      }
      return hasNewUploadPreview(baselineCount)
    }

    const waitForSubmitReady = async (
      timeoutMs: number,
      options: { requireImage?: boolean; requireText?: boolean },
    ) => {
      const started = Date.now()
      while (Date.now() - started < timeoutMs) {
        const input = getBestInput()
        const submitBtn = findSubmitButton()
        const enabled = Boolean(submitBtn && isButtonEnabled(submitBtn))
        const hasImage = hasAttachmentPreview()
        const hasText = inputHasText(input)
        let contentOk = hasImage || hasText
        if (options.requireImage) contentOk = hasImage && (options.requireText ? hasText : true)
        else if (options.requireText) contentOk = hasText
        if (enabled && contentOk) return { ready: true, submitBtn }
        await sleepInner(450)
      }
      return { ready: false, submitBtn: findSubmitButton() }
    }

    let input = getBestInput()
    if (!input) return { ok: false, reason: 'no_input' }

    const imageBaseline = countComposerImages()
    let pastedImage = Boolean(imageSrc)
    if (imageSrc) {
      await uploadImage(input, imageSrc)
      const previewReady = await waitForImagePreview(imageBaseline, 120_000)
      if (!previewReady) {
        return { ok: false, reason: 'image_preview_timeout', wroteText: false, pastedImage: false }
      }
      input = getBestInput()
    }

    let wroteText = false
    for (let attempt = 0; attempt < 5; attempt += 1) {
      input = getBestInput()
      if (!input) {
        await sleepInner(150)
        continue
      }
      if (writeText(input, message)) {
        wroteText = true
        break
      }
      await sleepInner(150)
    }

    if (!shouldSubmit) {
      return { ok: true, wroteText, pastedImage, submitted: false }
    }

    const waitResult = await waitForSubmitReady(60_000, {
      requireImage: Boolean(imageSrc),
      requireText: true,
    })
    const submitBtn = waitResult.submitBtn
    if (!submitBtn || !isButtonEnabled(submitBtn)) {
      return {
        ok: false,
        reason: 'submit_not_ready',
        wroteText,
        pastedImage,
        hasPreview: hasAttachmentPreview(),
        hasSubmitButton: Boolean(submitBtn),
      }
    }

    const captureMediaBaseline = () => {
      const pickMediaUrl = (raw: string | undefined | null) => {
        const v = (raw || '').trim()
        if (!v) return ''
        if (v.startsWith('blob:')) return v
        if (v.startsWith('http://') || v.startsWith('https://')) return v
        return ''
      }

      const isVisibleMedia = (el: Element | null): el is HTMLElement => {
        if (!(el instanceof HTMLElement)) return false
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        return rect.width > 40 && rect.height > 40 && style.display !== 'none' && style.visibility !== 'hidden'
      }

      const makeCardKey = (top: number, left: number) =>
        `${Math.round(top / 90)}:${Math.round(left / 90)}`

      const videoUrls = new Set<string>()
      const visibleVideos = Array.from(document.querySelectorAll('video')).filter(isVisibleMedia)
      const videoCards: Array<{ cardKey: string; urls: string[]; orderIndex: number }> = []
      visibleVideos.forEach((video, orderIndex) => {
        const rect = video.getBoundingClientRect()
        const cardKey = makeCardKey(rect.top, rect.left)
        const urls = [
          pickMediaUrl(video.currentSrc),
          pickMediaUrl(video.src),
          pickMediaUrl(video.querySelector('source')?.getAttribute('src')),
        ].filter(Boolean)
        const uniqueUrls = Array.from(new Set(urls))
        videoCards.push({ cardKey, urls: uniqueUrls, orderIndex })
        uniqueUrls.forEach((src) => videoUrls.add(src))
      })

      const postUrls = new Set<string>()
      const postCards: Array<{ cardKey: string; urls: string[]; orderIndex: number }> = []
      const visiblePosts = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href*="/imagine/post"]'),
      ).filter(isVisibleMedia)
      visiblePosts.forEach((anchor, orderIndex) => {
        const href = pickMediaUrl(anchor.href)
        if (!href) return
        const rect = anchor.getBoundingClientRect()
        const cardKey = makeCardKey(rect.top, rect.left)
        postCards.push({ cardKey, urls: [href], orderIndex })
        postUrls.add(href)
      })

      const submittedAt = Date.now()
      return {
        videoUrls: Array.from(videoUrls),
        postUrls: Array.from(postUrls),
        videoCards,
        postCards,
        visibleVideoCount: videoCards.length,
        submittedAt,
      }
    }

    const videoBaseline = captureMediaBaseline()
    clickSubmit(submitBtn)
    await sleepInner(300)
    return {
      ok: true,
      wroteText,
      pastedImage,
      submitted: true,
      method: 'click_submit',
      ariaLabel: submitBtn.getAttribute('aria-label') || '',
      videoBaseline,
      submittedAt: Date.now(),
    }
  })()
}

export function grokProbeImageReadyPageScript() {
  const isVisible = (el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    return rect.width > 24 && rect.height > 16 && style.display !== 'none' && style.visibility !== 'hidden'
  }

  const findSubmitButton = () => {
    const selectors = [
      'button[type="submit"][aria-label="Gửi"]',
      'button[type="submit"][aria-label="Send"]',
      'button[type="submit"][aria-label*="Gửi" i]',
      'button[type="submit"][aria-label*="Send" i]',
    ]
    for (const selector of selectors) {
      const el = document.querySelector(selector)
      if (el instanceof HTMLElement && isVisible(el)) return el
    }
    return null
  }

  const isButtonEnabled = (btn: HTMLElement) => {
    if (btn.hasAttribute('disabled')) return false
    if (btn.getAttribute('aria-disabled') === 'true') return false
    if (btn instanceof HTMLButtonElement && btn.disabled) return false
    const style = window.getComputedStyle(btn)
    return style.pointerEvents !== 'none' && Number.parseFloat(style.opacity) >= 0.45
  }

  const submitBtn = findSubmitButton()
  const submitEnabled = Boolean(submitBtn && isButtonEnabled(submitBtn))
  return { ready: submitEnabled, submitEnabled, hasSubmitButton: Boolean(submitBtn) }
}

export function grokSubmitImaginePageScript() {
  const isVisible = (el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    return rect.width > 24 && rect.height > 16 && style.display !== 'none' && style.visibility !== 'hidden'
  }

  const findSubmitButton = () => {
    const selectors = [
      'button[type="submit"][aria-label="Gửi"]',
      'button[type="submit"][aria-label="Send"]',
      'button[type="submit"][aria-label*="Gửi" i]',
      'button[type="submit"][aria-label*="Send" i]',
    ]
    for (const selector of selectors) {
      const el = document.querySelector(selector)
      if (el instanceof HTMLElement && isVisible(el)) return el
    }
    return null
  }

  const isButtonEnabled = (btn: HTMLElement) => {
    if (btn.hasAttribute('disabled')) return false
    if (btn.getAttribute('aria-disabled') === 'true') return false
    if (btn instanceof HTMLButtonElement && btn.disabled) return false
    const style = window.getComputedStyle(btn)
    return style.pointerEvents !== 'none' && Number.parseFloat(style.opacity) >= 0.45
  }

  const submitBtn = findSubmitButton()
  if (!submitBtn) return { submitted: false, reason: 'no_submit_button' }
  if (!isButtonEnabled(submitBtn)) return { submitted: false, reason: 'submit_disabled' }

  submitBtn.focus()
  const rect = submitBtn.getBoundingClientRect()
  const clientX = rect.left + rect.width / 2
  const clientY = rect.top + rect.height / 2
  const base = { bubbles: true, cancelable: true, clientX, clientY, view: window }
  submitBtn.dispatchEvent(new PointerEvent('pointerdown', base))
  submitBtn.dispatchEvent(new MouseEvent('mousedown', base))
  submitBtn.dispatchEvent(new PointerEvent('pointerup', base))
  submitBtn.dispatchEvent(new MouseEvent('mouseup', base))
  submitBtn.click()

  return { submitted: true, method: 'click_submit' }
}

export function grokCaptureMediaBaselinePageScript() {
  const pickUrl = (raw: string | undefined | null) => {
    const v = (raw || '').trim()
    if (!v) return ''
    if (v.startsWith('blob:')) return v
    if (v.startsWith('http://') || v.startsWith('https://')) return v
    return ''
  }

  const isVisible = (el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    return rect.width > 40 && rect.height > 40 && style.display !== 'none' && style.visibility !== 'hidden'
  }

  const makeCardKey = (top: number, left: number) => `${Math.round(top / 90)}:${Math.round(left / 90)}`

  const videoUrls = new Set<string>()
  const visibleVideos = Array.from(document.querySelectorAll('video')).filter(isVisible)
  const videoCards: Array<{ cardKey: string; urls: string[]; orderIndex: number }> = []
  visibleVideos.forEach((video, orderIndex) => {
    const rect = video.getBoundingClientRect()
    const cardKey = makeCardKey(rect.top, rect.left)
    const urls = [
      pickUrl(video.currentSrc),
      pickUrl(video.src),
      pickUrl(video.querySelector('source')?.getAttribute('src')),
    ].filter(Boolean)
    const uniqueUrls = Array.from(new Set(urls))
    videoCards.push({ cardKey, urls: uniqueUrls, orderIndex })
    uniqueUrls.forEach((src) => videoUrls.add(src))
  })

  const postUrls = new Set<string>()
  const postCards: Array<{ cardKey: string; urls: string[]; orderIndex: number }> = []
  const visiblePosts = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/imagine/post"]'),
  ).filter(isVisible)
  visiblePosts.forEach((anchor, orderIndex) => {
    const href = pickUrl(anchor.href)
    if (!href) return
    const rect = anchor.getBoundingClientRect()
    const cardKey = makeCardKey(rect.top, rect.left)
    postCards.push({ cardKey, urls: [href], orderIndex })
    postUrls.add(href)
  })

  return {
    videoUrls: Array.from(videoUrls),
    postUrls: Array.from(postUrls),
    videoCards,
    postCards,
    visibleVideoCount: videoCards.length,
    submittedAt: 0,
  }
}

export function grokListVideoUrlsPageScript() {
  const pickUrl = (raw: string | undefined | null) => {
    const v = (raw || '').trim()
    if (!v) return ''
    if (v.startsWith('blob:')) return v
    if (v.startsWith('http://') || v.startsWith('https://')) return v
    return ''
  }

  const urls = new Set<string>()
  for (const video of Array.from(document.querySelectorAll('video'))) {
    const src =
      pickUrl(video.currentSrc) ||
      pickUrl(video.src) ||
      pickUrl(video.querySelector('source')?.getAttribute('src'))
    if (src) urls.add(src)
  }
  return Array.from(urls)
}

/** Quét video mới — chỉ slot DOM mới (đếm thẻ) hoặc thay thế ô 0 sau grace; bỏ qua hover ô cũ. */
export function grokProbeVideoCandidatesPageScript(baselinePayload?: {
  videoUrls?: string[]
  postUrls?: string[]
  videoCards?: Array<{ cardKey?: string; urls?: string[]; orderIndex?: number }>
  postCards?: Array<{ cardKey?: string; urls?: string[]; orderIndex?: number }>
  visibleVideoCount?: number
  submittedAt?: number
  probeNowMs?: number
  minWaitAfterSubmitMs?: number
}) {
  const baseline = new Set(
    [...(baselinePayload?.videoUrls || []), ...(baselinePayload?.postUrls || [])]
      .map((u) => u.trim())
      .filter(Boolean),
  )

  const baselineVideoCards = (baselinePayload?.videoCards || [])
    .map((card, index) => ({
      cardKey: String(card?.cardKey || '').trim(),
      urls: Array.isArray(card?.urls) ? card.urls.map((u) => u.trim()).filter(Boolean) : [],
      orderIndex: Number.isFinite(Number(card?.orderIndex)) ? Math.floor(Number(card?.orderIndex)) : index,
    }))
    .filter((card) => card.cardKey)

  const baselineCount = Math.max(
    0,
    Number.isFinite(Number(baselinePayload?.visibleVideoCount))
      ? Math.floor(Number(baselinePayload?.visibleVideoCount))
      : baselineVideoCards.length,
  )

  const baselineOrder0Urls = new Set(baselineVideoCards.find((card) => card.orderIndex === 0)?.urls || [])

  const submittedAt = Number(baselinePayload?.submittedAt) || 0
  const nowMs = Number(baselinePayload?.probeNowMs) || Date.now()
  const minWaitAfterSubmitMs = Number(baselinePayload?.minWaitAfterSubmitMs) || 10_000
  const gracePassed = submittedAt <= 0 || nowMs >= submittedAt + minWaitAfterSubmitMs

  const pickUrl = (raw: string | undefined | null) => {
    const v = (raw || '').trim()
    if (!v) return ''
    if (v.startsWith('blob:')) return v
    if (v.startsWith('http://') || v.startsWith('https://')) return v
    return ''
  }

  const isGeneratedGrokMp4 = (url: string) =>
    /assets\.grok\.com/i.test(url) && /generated_video\.mp4/i.test(url)

  const isVisible = (el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    return rect.width > 40 && rect.height > 40 && style.display !== 'none' && style.visibility !== 'hidden'
  }

  const makeCardKey = (top: number, left: number) => `${Math.round(top / 90)}:${Math.round(left / 90)}`

  const visibleVideos = Array.from(document.querySelectorAll('video')).filter(isVisible)
  const newSlots = Math.max(0, visibleVideos.length - baselineCount)

  const isVideoCardNew = (orderIndex: number, currentUrls: string[], isReady: boolean) => {
    if (!gracePassed || !isReady || !currentUrls.length) return false

    if (orderIndex < newSlots) {
      return currentUrls.some(isGeneratedGrokMp4) || currentUrls.some((url) => url.startsWith('blob:'))
    }

    if (orderIndex === 0 && newSlots === 0) {
      const freshGenerated = currentUrls.filter(
        (url) => isGeneratedGrokMp4(url) && !baseline.has(url) && !baselineOrder0Urls.has(url),
      )
      if (freshGenerated.length > 0) return true
    }

    const baselineCard = baselineVideoCards.find((card) => card.orderIndex === orderIndex)
    const baselineCardUrls = new Set(baselineCard?.urls || [])
    const freshMp4 = currentUrls.find(
      (url) => isGeneratedGrokMp4(url) && !baseline.has(url) && !baselineCardUrls.has(url),
    )
    if (freshMp4) return true

    const freshBlob = currentUrls.find((url) => url.startsWith('blob:') && !baseline.has(url) && !baselineCardUrls.has(url))
    if (freshBlob && orderIndex < Math.max(1, newSlots + 1)) return true

    return false
  }

  const pickPreviewUrl = (raw: string | undefined | null) => {
    const v = (raw || '').trim()
    if (!v) return ''
    if (
      v.startsWith('blob:') ||
      v.startsWith('http://') ||
      v.startsWith('https://') ||
      v.startsWith('data:')
    ) {
      return v
    }
    return ''
  }

  const collectNearbyPreviewUrls = (video: HTMLVideoElement) => {
    const urls = new Set<string>()
    const poster = pickPreviewUrl(video.poster)
    if (poster) urls.add(poster)

    const postAnchor =
      video.closest('a[href*="/imagine/post"]') ||
      video.parentElement?.closest('a[href*="/imagine/post"]')
    if (postAnchor) {
      for (const img of Array.from(postAnchor.querySelectorAll('img'))) {
        if (!(img instanceof HTMLImageElement) || !isVisible(img)) continue
        const src = pickPreviewUrl(img.currentSrc || img.src)
        if (src) urls.add(src)
      }
    }

    const videoRect = video.getBoundingClientRect()
    let parent: Element | null = video.parentElement
    for (let depth = 0; depth < 10 && parent; depth += 1) {
      for (const img of Array.from(parent.querySelectorAll('img'))) {
        if (!(img instanceof HTMLImageElement) || !isVisible(img)) continue
        const src = pickPreviewUrl(img.currentSrc || img.src)
        if (!src) continue
        const imgRect = img.getBoundingClientRect()
        if (imgRect.width < 40 || imgRect.height < 40) continue
        if (imgRect.bottom > window.innerHeight * 0.92) continue
        const overlapX = Math.min(imgRect.right, videoRect.right) - Math.max(imgRect.left, videoRect.left)
        if (overlapX < Math.min(imgRect.width, videoRect.width) * 0.15) continue
        const verticalGap = Math.min(
          Math.abs(imgRect.top - videoRect.top),
          Math.abs(imgRect.bottom - videoRect.bottom),
        )
        if (verticalGap > 720) continue
        urls.add(src)
      }
      parent = parent.parentElement
    }

    let sibling: Element | null = video.previousElementSibling
    for (let i = 0; i < 6 && sibling; i += 1) {
      if (sibling instanceof HTMLImageElement && isVisible(sibling)) {
        const src = pickPreviewUrl(sibling.currentSrc || sibling.src)
        if (src) urls.add(src)
      } else {
        for (const img of Array.from(sibling.querySelectorAll('img'))) {
          if (!(img instanceof HTMLImageElement) || !isVisible(img)) continue
          const src = pickPreviewUrl(img.currentSrc || img.src)
          if (src) urls.add(src)
        }
      }
      sibling = sibling.previousElementSibling
    }

    return Array.from(urls)
  }

  type VideoCard = {
    cardKey: string
    orderIndex: number
    top: number
    left: number
    width: number
    height: number
    readyState: number
    urls: string[]
    previewImageUrls: string[]
    hasMp4: boolean
    isReady: boolean
    isNew: boolean
  }

  const cards: VideoCard[] = []
  visibleVideos.forEach((video, orderIndex) => {
    const urls = [
      pickUrl(video.currentSrc),
      pickUrl(video.src),
      pickUrl(video.querySelector('source')?.getAttribute('src')),
    ].filter(Boolean)

    const uniqueUrls = Array.from(new Set(urls))
    if (!uniqueUrls.length) return

    const rect = video.getBoundingClientRect()
    const cardKey = makeCardKey(rect.top, rect.left)
    const hasMp4 = uniqueUrls.some(isGeneratedGrokMp4)
    const readyState = video.readyState
    const isReady = hasMp4 || readyState >= 2
    const isNew =
      baselineCount > 0
        ? isVideoCardNew(orderIndex, uniqueUrls, isReady)
        : uniqueUrls.some((url) => !baseline.has(url))

    cards.push({
      cardKey,
      orderIndex,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      readyState,
      urls: uniqueUrls,
      previewImageUrls: collectNearbyPreviewUrls(video),
      hasMp4,
      isReady,
      isNew,
    })
  })

  const baselinePostCount = (baselinePayload?.postCards || []).length
  const visiblePosts = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/imagine/post"]'),
  ).filter(isVisible)
  const newPostSlots = Math.max(0, visiblePosts.length - baselinePostCount)

  const postLinks: Array<{ url: string; top: number; left: number; isNew: boolean }> = []
  visiblePosts.forEach((anchor, orderIndex) => {
    const href = pickUrl(anchor.href)
    if (!href) return
    const rect = anchor.getBoundingClientRect()
    const isNew =
      gracePassed &&
      (orderIndex < newPostSlots ? !baseline.has(href) : false)
    postLinks.push({
      url: href,
      top: rect.top,
      left: rect.left,
      isNew,
    })
  })

  return { cards, postLinks }
}

/** So khớp ảnh đã gửi với preview cạnh video (hoặc frame video) — chặn lưu nhầm khi hover. */
export function grokComparePreviewImagesPageScript(
  submittedImageSrc: string,
  previewUrls: string[],
  videoUrls?: string[],
) {
  const HASH_SIZE = 12
  const MAX_BITS = HASH_SIZE * HASH_SIZE
  const MIN_PREVIEW_SCORE = 0.68
  const MIN_FRAME_SCORE = 0.5

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous'
      img.src = src
    })

  const loadRemoteImage = async (src: string) => {
    if (src.startsWith('data:') || src.startsWith('blob:')) return loadImage(src)
    try {
      const res = await fetch(src, { credentials: 'include', mode: 'cors' })
      if (!res.ok) return loadImage(src)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      try {
        return await loadImage(objectUrl)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    } catch {
      return loadImage(src)
    }
  }

  const averageHash = (img: HTMLImageElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = HASH_SIZE
    canvas.height = HASH_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(img, 0, 0, HASH_SIZE, HASH_SIZE)
    const data = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE).data
    const gray: number[] = []
    let sum = 0
    for (let i = 0; i < data.length; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      gray.push(g)
      sum += g
    }
    const avg = sum / gray.length
    return gray.map((g) => (g >= avg ? '1' : '0')).join('')
  }

  const compareHashes = (hashA: string, hashB: string) => {
    if (!hashA || !hashB || hashA.length !== hashB.length) return 0
    let dist = 0
    for (let i = 0; i < hashA.length; i += 1) {
      if (hashA[i] !== hashB[i]) dist += 1
    }
    return Math.max(0, 1 - dist / MAX_BITS)
  }

  const pickUrl = (raw: string | undefined | null) => {
    const v = (raw || '').trim()
    if (!v) return ''
    if (v.startsWith('blob:') || v.startsWith('http://') || v.startsWith('https://')) return v
    return ''
  }

  const findVideoByUrls = (urls: string[]) => {
    const wanted = new Set(urls.map((u) => u.trim()).filter(Boolean))
    if (!wanted.size) return null
    for (const video of Array.from(document.querySelectorAll('video'))) {
      const candidates = [
        pickUrl(video.currentSrc),
        pickUrl(video.src),
        pickUrl(video.querySelector('source')?.getAttribute('src')),
      ].filter(Boolean)
      if (candidates.some((url) => wanted.has(url))) return video
    }
    return null
  }

  const seekVideo = async (video: HTMLVideoElement, timeSec: number) => {
    if (!Number.isFinite(timeSec) || timeSec < 0) return video.readyState >= 2
    video.currentTime = timeSec
    return new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => resolve(video.readyState >= 2), 320)
      video.addEventListener(
        'seeked',
        () => {
          window.clearTimeout(timer)
          resolve(video.readyState >= 2)
        },
        { once: true },
      )
    })
  }

  const hashVideoFrameAt = (video: HTMLVideoElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = HASH_SIZE
    canvas.height = HASH_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    try {
      ctx.drawImage(video, 0, 0, HASH_SIZE, HASH_SIZE)
      const data = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE).data
      const gray: number[] = []
      let sum = 0
      for (let i = 0; i < data.length; i += 4) {
        const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        gray.push(g)
        sum += g
      }
      const avg = sum / gray.length
      return gray.map((g) => (g >= avg ? '1' : '0')).join('')
    } catch {
      return ''
    }
  }

  const bestVideoFrameScore = async (video: HTMLVideoElement, submittedHash: string) => {
    let best = 0
    if (video.readyState >= 2) {
      const frameHash = hashVideoFrameAt(video)
      if (frameHash) best = compareHashes(submittedHash, frameHash)
      if (best >= MIN_FRAME_SCORE) return best
    }

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
    const seekTime = duration > 0 ? Math.min(0.1, duration * 0.08) : 0.1
    const ready = await seekVideo(video, seekTime)
    if (!ready) return best
    const frameHash = hashVideoFrameAt(video)
    if (!frameHash) return best
    return Math.max(best, compareHashes(submittedHash, frameHash))
  }

  const getSubmittedHash = async (src: string) => {
    const cacheKey = src.trim()
    if (!cacheKey) return ''
    const win = window as Window & { __grokSubmittedHashCache?: Record<string, string> }
    win.__grokSubmittedHashCache = win.__grokSubmittedHashCache || {}
    if (win.__grokSubmittedHashCache[cacheKey]) return win.__grokSubmittedHashCache[cacheKey]

    const submitted = await loadRemoteImage(cacheKey)
    if (!submitted) return ''
    const hash = averageHash(submitted)
    if (hash) win.__grokSubmittedHashCache[cacheKey] = hash
    return hash
  }

  return (async () => {
    const submittedHash = await getSubmittedHash((submittedImageSrc || '').trim())
    if (!submittedHash) {
      return { matched: false, score: 0, previewScore: 0, frameScore: 0, reason: 'submitted_load_failed' }
    }

    let previewScore = 0
    let frameScore = 0
    let bestPreviewUrl = ''
    let matchSource = ''

    for (const url of (previewUrls || []).map((u) => u.trim()).filter(Boolean)) {
      const preview = await loadRemoteImage(url)
      if (!preview) continue
      const previewHash = averageHash(preview)
      if (!previewHash) continue
      const score = compareHashes(submittedHash, previewHash)
      if (score > previewScore) {
        previewScore = score
        bestPreviewUrl = url
        matchSource = 'preview'
      }
      if (previewScore >= MIN_PREVIEW_SCORE) {
        return {
          matched: true,
          score: previewScore,
          previewScore,
          frameScore: 0,
          bestPreviewUrl,
          matchSource,
        }
      }
    }

    if (previewScore < MIN_PREVIEW_SCORE) {
      const video = findVideoByUrls((videoUrls || []).map((u) => u.trim()).filter(Boolean))
      if (video) {
        frameScore = await bestVideoFrameScore(video, submittedHash)
        if (frameScore > previewScore) {
          matchSource = 'video-frame'
          bestPreviewUrl = pickUrl(video.currentSrc) || pickUrl(video.src) || 'video-frame'
        }
      }
    }

    const score = Math.max(previewScore, frameScore)
    const matched = previewScore >= MIN_PREVIEW_SCORE || frameScore >= MIN_FRAME_SCORE

    return {
      matched,
      score,
      previewScore,
      frameScore,
      bestPreviewUrl,
      matchSource,
    }
  })()
}

export function grokSaveVideoToDirectoryPageScript(
  videoUrl: string,
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
) {
  return (async () => {
    const response = await fetch(videoUrl, { credentials: 'include', mode: 'cors' })
    if (!response.ok) {
      throw new Error(`Tải video Grok thất bại: HTTP ${response.status}`)
    }
    const blob = await response.blob()
    const safeName = (filename || 'video.mp4').replace(/[/\\]/g, '-')
    const fh = await dirHandle.getFileHandle(safeName, { create: true })
    const writable = await fh.createWritable()
    try {
      await writable.write(blob)
    } finally {
      await writable.close()
    }
    return { ok: true, filename: safeName, byteLength: blob.size }
  })()
}

export function grokDownloadVideoBufferPageScript(videoUrl: string) {
  return (async () => {
    const response = await fetch(videoUrl, { credentials: 'include', mode: 'cors' })
    if (!response.ok) {
      throw new Error(`Tải video Grok thất bại: HTTP ${response.status}`)
    }
    const buffer = await response.arrayBuffer()
    return {
      buffer,
      mimeType: response.headers.get('content-type') || 'video/mp4',
      byteLength: buffer.byteLength,
    }
  })()
}
