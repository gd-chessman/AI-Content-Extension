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
  actionType?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
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

export type WorkflowRunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'
export type StepRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export type WorkflowRunItem = {
  _id: string
  workflowId: string
  status: WorkflowRunStatus
  progress: number
  currentStepNo: number
}

export type StepRunItem = {
  _id: string
  workflowRunId: string
  workflowId: string
  stepId: string
  stepNo: number
  stepTitle: string
  status: StepRunStatus
}

export const createWorkflowRun = async (payload: {
  workflowId: string
  payload?: Record<string, unknown>
  attempt?: number
}) => {
  const response = await axiosClient.post('/workflow-runs', payload)
  return response.data as WorkflowRunItem
}

export const updateWorkflowRun = async (
  runId: string,
  payload: {
    status?: WorkflowRunStatus
    progress?: number
    currentStepNo?: number
    result?: Record<string, unknown>
    error?: { code?: string; message?: string; details?: Record<string, unknown> }
    startedAt?: string | null
    finishedAt?: string | null
  },
) => {
  const response = await axiosClient.patch(`/workflow-runs/${runId}`, payload)
  return response.data as WorkflowRunItem
}

export const createStepRun = async (payload: {
  workflowRunId: string
  workflowId: string
  stepId: string
  stepNo: number
  stepTitle: string
  status?: StepRunStatus
  input?: Record<string, unknown>
  startedAt?: string | null
}) => {
  const response = await axiosClient.post('/step-runs', payload)
  return response.data as StepRunItem
}

export const updateStepRun = async (
  stepRunId: string,
  payload: {
    status?: StepRunStatus
    input?: Record<string, unknown>
    output?: Record<string, unknown>
    error?: { message?: string; details?: Record<string, unknown> }
    startedAt?: string | null
    finishedAt?: string | null
  },
) => {
  const response = await axiosClient.patch(`/step-runs/${stepRunId}`, payload)
  return response.data as StepRunItem
}
