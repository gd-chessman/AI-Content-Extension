import axiosClient from '@/utils/axiosClient'

export type WorkflowItem = {
  _id: string
  name: string
  description?: string
  status?: 'draft' | 'active' | 'archived'
  platform?: 'chatgpt' | 'grok' | 'facebook' | 'webblog' | 'ggsheet' | 'multi'
  category?: string
}

export type WorkflowStep = {
  _id: string
  stepNo: number
  title: string
  instruction: string
  prompt?: string
}

export type WorkflowDetail = WorkflowItem & {
  steps: WorkflowStep[]
}

export const getUserWorkflows = async () => {
  const response = await axiosClient.get('/workflows/user')
  return (response.data || []) as WorkflowItem[]
}

export const getUserWorkflowDetail = async (workflowId: string) => {
  const response = await axiosClient.get(`/workflows/user/${workflowId}`)
  return response.data as WorkflowDetail
}
