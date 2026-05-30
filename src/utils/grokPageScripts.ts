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

    clickSubmit(submitBtn)
    await sleepInner(300)
    return {
      ok: true,
      wroteText,
      pastedImage,
      submitted: true,
      method: 'click_submit',
      ariaLabel: submitBtn.getAttribute('aria-label') || '',
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

export function grokProbeVideoLinkPageScript(baselineUrls?: string[]) {
  const baseline = new Set((baselineUrls || []).map((u) => u.trim()).filter(Boolean))

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

  type VideoCandidate = { url: string; score: number }

  const candidates: VideoCandidate[] = []
  for (const video of Array.from(document.querySelectorAll('video'))) {
    if (!isVisible(video)) continue
    const url =
      pickUrl(video.currentSrc) ||
      pickUrl(video.src) ||
      pickUrl(video.querySelector('source')?.getAttribute('src'))
    if (!url || baseline.has(url)) continue

    const rect = video.getBoundingClientRect()
    let score = rect.width * rect.height
    if (/assets\.grok\.com/i.test(url) && /generated_video\.mp4/i.test(url)) score += 500_000
    if (video.readyState >= 2) score += 50_000
    candidates.push({ url, score })
  }

  candidates.sort((a, b) => b.score - a.score)
  if (candidates[0]) {
    const url = candidates[0].url
    return {
      ready: true,
      url,
      kind: url.startsWith('blob:') ? 'blob' : 'http',
    }
  }

  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/imagine/post"]'))
  for (const a of anchors) {
    const href = pickUrl(a.href)
    if (href && !baseline.has(href)) {
      return { ready: true, url: href, kind: 'post_link' }
    }
  }

  return { ready: false, url: '', kind: '' }
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
