import axiosClient from '@/utils/axiosClient'

/** Bản ghi tool từ MongoDB (sync từ BE `shared/tools`). FE không định nghĩa catalog. */
export type ToolPlatform = 'chatgpt' | 'grok' | 'facebook' | 'webblog' | 'ggsheet' | 'multi'

export type ToolPlacement = 'step_panel' | 'bottom_bar' | 'global'

export type ToolItem = {
  _id: string
  code: string
  name: string
  platform: ToolPlatform
  handlerKey: string
  guardScript?: string
  placement: ToolPlacement
  sortOrder: number
  defaultConfig: Record<string, unknown>
  uiConfig?: Record<string, unknown>
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export type StepToolLink = {
  _id: string
  stepId: string
  toolId: string
  sortOrder: number
  config: Record<string, unknown>
  isActive: boolean
  tool?: ToolItem
}

export type WorkflowStepToolsGroup = {
  stepId: string
  stepNo: number
  title: string
  tools: StepToolLink[]
}

export const listStepToolsByStep = async (stepId: string, activeOnly = true) => {
  const response = await axiosClient.get('/step-tools', {
    params: { stepId, activeOnly: activeOnly ? undefined : 'false' },
  })
  return (response.data || []) as StepToolLink[]
}

export const listStepToolsByWorkflow = async (workflowId: string, activeOnly = true) => {
  const response = await axiosClient.get(`/step-tools/workflow/${workflowId}`, {
    params: { activeOnly: activeOnly ? undefined : 'false' },
  })
  return (response.data || []) as WorkflowStepToolsGroup[]
}

export const getStepToolById = async (id: string) => {
  const response = await axiosClient.get(`/step-tools/${id}`)
  return response.data as StepToolLink
}

export const createStepTool = async (payload: {
  stepId: string
  toolId: string
  sortOrder?: number
  config?: Record<string, unknown>
  isActive?: boolean
}) => {
  const response = await axiosClient.post('/step-tools', payload)
  return response.data as StepToolLink
}

export const setStepToolsForStep = async (
  stepId: string,
  tools: Array<{
    toolId: string
    sortOrder?: number
    config?: Record<string, unknown>
    isActive?: boolean
  }>,
) => {
  const response = await axiosClient.put(`/step-tools/step/${stepId}`, { tools })
  return (response.data || []) as StepToolLink[]
}

export const updateStepTool = async (
  id: string,
  payload: Partial<{
    stepId: string
    toolId: string
    sortOrder: number
    config: Record<string, unknown>
    isActive: boolean
  }>,
) => {
  const response = await axiosClient.patch(`/step-tools/${id}`, payload)
  return response.data as StepToolLink
}

export const deleteStepTool = async (id: string) => {
  const response = await axiosClient.delete(`/step-tools/${id}`)
  return response.data as StepToolLink
}
