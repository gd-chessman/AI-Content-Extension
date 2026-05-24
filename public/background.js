function configureSidePanelOnActionClick() {
  if (!chrome.sidePanel?.setPanelBehavior) return
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
}

configureSidePanelOnActionClick()
chrome.runtime.onInstalled.addListener(configureSidePanelOnActionClick)

// Tải file qua chrome.downloads (luôn chạy trong service worker khi có quyền "downloads").
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'DOWNLOAD_ARRAY_BUFFER') {
    const { buffer, filename, mimeType } = message
    if (!(buffer instanceof ArrayBuffer) || typeof filename !== 'string') {
      sendResponse({ ok: false, error: 'Invalid payload' })
      return undefined
    }
    try {
      const blob = new Blob([buffer], { type: mimeType || 'image/png' })
      const url = URL.createObjectURL(blob)
      chrome.downloads.download(
        { url, filename, saveAs: false, conflictAction: 'uniquify' },
        () => {
          const err = chrome.runtime.lastError
          setTimeout(() => URL.revokeObjectURL(url), 2000)
          sendResponse({ ok: !err, error: err?.message })
        },
      )
    } catch (e) {
      sendResponse({ ok: false, error: String(e) })
    }
    return true
  }

  if (message?.type === 'DOWNLOAD_DATA_URL') {
    const { dataUrl, filename } = message
    if (typeof dataUrl !== 'string' || typeof filename !== 'string') {
      sendResponse({ ok: false, error: 'Invalid payload' })
      return undefined
    }
    chrome.downloads.download(
      { url: dataUrl, filename, saveAs: false, conflictAction: 'uniquify' },
      () => {
        const err = chrome.runtime.lastError
        sendResponse({ ok: !err, error: err?.message })
      },
    )
    return true
  }

  return undefined
})
