import axiosClient from '@/utils/axiosClient'

export type WorkflowPlatform =
  | 'chatgpt'
  | 'grok'
  | 'facebook'
  | 'webblog'
  | 'ggsheet'
  | 'multi'

export type WorkflowItem = {
  _id: string
  name: string
  description?: string
  status?: 'draft' | 'active' | 'archived'
  platform?: WorkflowPlatform
}

export const getUserWorkflows = async (params?: { platform?: WorkflowPlatform }) => {
  const response = await axiosClient.get('/workflows/user', {
    params: params?.platform ? { platform: params.platform } : undefined,
  })
  return (response.data || []) as WorkflowItem[]
}
