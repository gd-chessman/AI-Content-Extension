import type { WorkflowPlatform } from '@/services/WorkflowService'

export const PLATFORM_FILTER_OPTIONS: { value: WorkflowPlatform | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'grok', label: 'Grok' },
  { value: 'webblog', label: 'WebBlog' },
  { value: 'ggsheet', label: 'GG Sheet' },
]

const CATEGORY_LABELS: Record<string, string> = {
  content_pipeline: 'Pipeline nội dung',
  extraction: 'Trích xuất',
  generation: 'Sinh nội dung',
  ai_video_creation: 'Tạo video AI',
  distribution: 'Phân phối',
  automation: 'Tự động hóa',
  other: 'Khác',
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  custom: 'Tùy chỉnh',
  grok_fill_from_story: 'Grok — điền từ câu chuyện',
  grok_capture_video_link: 'Grok — lưu video',
  fill_grok: 'Grok — điền form',
  chatgpt_save_story: 'ChatGPT — lưu câu chuyện',
  chatgpt_extract_content: 'ChatGPT — trích nội dung',
  chatgpt_generate_image: 'ChatGPT — tạo ảnh',
  chatgpt_generate_images: 'ChatGPT — tạo nhiều ảnh',
  facebook_open_fanpage: 'Facebook — mở fanpage',
  facebook_scan_reels: 'Facebook — quét reel',
  facebook_select_reel: 'Facebook — chọn reel',
  facebook_wait_content: 'Facebook — chờ nội dung',
  facebook_save_story: 'Facebook — lưu câu chuyện',
}

export function formatWorkflowCategory(category?: string) {
  if (!category?.trim()) return '—'
  return CATEGORY_LABELS[category] || category
}

export function formatActionType(actionType?: string) {
  const key = (actionType || '').trim().toLowerCase()
  if (!key) return '—'
  return ACTION_TYPE_LABELS[key] || key.replace(/_/g, ' ')
}

export function formatDisplayMode(mode?: string) {
  const v = (mode || 'visible').trim().toLowerCase()
  if (v === 'background') return 'Chạy nền'
  return 'Hiển thị'
}

export function formatWorkflowDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
