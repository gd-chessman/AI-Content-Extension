import axiosClient from '@/utils/axiosClient'

export type ToolHandlerPayload = {
  toolId: string
  code: string
  handlerScript: string
  defaultConfig: Record<string, unknown>
}

/** Lấy script xử lý từ DB — gọi mỗi lần user bấm nút công cụ. */
export const fetchToolHandler = async (toolId: string) => {
  const response = await axiosClient.get(`/tools/${toolId}/handler`)
  return response.data as ToolHandlerPayload
}
