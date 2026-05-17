/** Khóa handler ChatGPT — map với logic xử lý trên extension. */
export const CHATGPT_HANDLER_KEYS = {
  splitImage: 'chatgpt.splitImage',
  copyImage: 'chatgpt.copyImage',
  copySingleImage: 'chatgpt.copySingleImage',
  copyVideo: 'chatgpt.copyVideo',
  copySingleVideo: 'chatgpt.copySingleVideo',
  extractContent: 'chatgpt.extractContent',
  fillGrok: 'chatgpt.fillGrok',
  /** Package 1 ảnh + 1 VIDEO PROMPT — bottom bar. */
  fillGrokSingle: 'chatgpt.fillGrokSingle',
  pushWebBlog: 'chatgpt.pushWebBlog',
  collectGgSheet: 'chatgpt.collectGgSheet',
  saveLocal: 'chatgpt.saveLocal',
} as const;
