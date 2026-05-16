import axiosClient from '@/utils/axiosClient'
import type { ToolItem, ToolPlacement, ToolPlatform } from '@/services/StepToolService'

export const listTools = async (params?: {
  platform?: ToolPlatform
  placement?: ToolPlacement
  activeOnly?: boolean
}) => {
  const response = await axiosClient.get('/tools', {
    params: {
      platform: params?.platform,
      placement: params?.placement,
      activeOnly: params?.activeOnly === false ? 'false' : undefined,
    },
  })
  return (response.data || []) as ToolItem[]
}

export const listChatgptBottomBarTools = async () => {
  const tools = await listTools({ platform: 'chatgpt', placement: 'bottom_bar', activeOnly: true })
  return tools
    .filter((tool) => tool.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code))
}
