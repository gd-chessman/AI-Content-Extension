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
  category?: string
  version?: number
  createdAt?: string
  updatedAt?: string
}

export type WorkflowStep = {
  _id: string
  stepNo: number
  title: string
  instruction: string
  prompt?: string
  actionType?: string
  displayMode?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

export type WorkflowDetail = WorkflowItem & {
  steps: WorkflowStep[]
}

export const getUserWorkflows = async (params?: { platform?: WorkflowPlatform }) => {
  const response = await axiosClient.get('/workflows/user', {
    params: params?.platform ? { platform: params.platform } : undefined,
  })
  return (response.data || []) as WorkflowItem[]
}

export const getUserWorkflowDetail = async (workflowId: string) => {
  const response = await axiosClient.get(`/workflows/user/${workflowId}`)
  return response.data as WorkflowDetail
}

export const getExtensionPresence = async () => {
  const response = await axiosClient.get('/workflow-runs/extension-presence')
  return response.data as { online: boolean }
}

export type WorkflowRunItem = {
  _id: string
  workflowId: string
  status?: string
  payload?: Record<string, unknown>
}

export const createWorkflowRun = async (payload: {
  workflowId: string
  payload?: Record<string, unknown>
}) => {
  const response = await axiosClient.post('/workflow-runs', payload)
  return response.data as WorkflowRunItem
}
