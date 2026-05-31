import axiosClient from '@/utils/axiosClient'

export type WorkflowScheduleTargetType = 'multi_workflow' | 'workflow'
export type WorkflowScheduleKind = 'once' | 'daily' | 'weekly'
export type WorkflowScheduleLastRunStatus = 'success' | 'skipped' | 'failed'

export type WorkflowSchedule = {
  _id: string
  name: string
  enabled: boolean
  targetType: WorkflowScheduleTargetType
  multiWorkflowId?: string | null
  workflowId?: string | null
  targetName?: string
  scheduleKind: WorkflowScheduleKind
  runAt?: string | null
  timeOfDay?: string
  daysOfWeek?: number[]
  timezone?: string
  nextRunAt?: string | null
  lastRunAt?: string | null
  lastRunStatus?: WorkflowScheduleLastRunStatus | null
  lastRunMessage?: string
  scheduleSummary?: string
  consecutiveRuns?: number
  batchCompletedRuns?: number
  batchStatus?: 'idle' | 'running' | 'completed' | 'failed'
  batchStartedAt?: string | null
}

export type WorkflowScheduleRun = {
  _id: string
  scheduleId: string
  triggeredAt: string
  status: WorkflowScheduleLastRunStatus
  targetType: WorkflowScheduleTargetType
  multiWorkflowRunId?: string | null
  workflowRunId?: string | null
  message?: string
}

export type CreateWorkflowSchedulePayload = {
  name: string
  enabled?: boolean
  targetType: WorkflowScheduleTargetType
  multiWorkflowId?: string
  workflowId?: string
  scheduleKind: WorkflowScheduleKind
  runAt?: string
  timeOfDay?: string
  daysOfWeek?: number[]
  timezone?: string
  consecutiveRuns?: number
}

export const listWorkflowSchedules = async () => {
  const response = await axiosClient.get('/workflow-schedules')
  return (response.data || []) as WorkflowSchedule[]
}

export const createWorkflowSchedule = async (payload: CreateWorkflowSchedulePayload) => {
  const response = await axiosClient.post('/workflow-schedules', payload)
  return response.data as WorkflowSchedule
}

export const updateWorkflowSchedule = async (
  id: string,
  payload: Partial<CreateWorkflowSchedulePayload>,
) => {
  const response = await axiosClient.patch(`/workflow-schedules/${id}`, payload)
  return response.data as WorkflowSchedule
}

export const toggleWorkflowSchedule = async (id: string, enabled: boolean) => {
  const response = await axiosClient.patch(`/workflow-schedules/${id}/toggle`, { enabled })
  return response.data as WorkflowSchedule
}

export const deleteWorkflowSchedule = async (id: string) => {
  const response = await axiosClient.delete(`/workflow-schedules/${id}`)
  return response.data as { deleted: boolean; id: string }
}

export const runWorkflowScheduleNow = async (id: string) => {
  const response = await axiosClient.post(`/workflow-schedules/${id}/run-now`)
  return response.data as WorkflowSchedule
}

export const listWorkflowScheduleRuns = async (id: string, limit = 20) => {
  const response = await axiosClient.get(`/workflow-schedules/${id}/runs`, { params: { limit } })
  return (response.data || []) as WorkflowScheduleRun[]
}
