import axiosClient from '@/utils/axiosClient'
import type { WorkflowPlatform } from '@/services/WorkflowService'

export type MultiWorkflowItem = {
  order: number
  workflowId: string
  platform: WorkflowPlatform
  enabled: boolean
}

export type MultiWorkflow = {
  _id: string
  name: string
  isDefault: boolean
  items: MultiWorkflowItem[]
  createdAt?: string
  updatedAt?: string
}

export type MultiWorkflowRunItemStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'

export type MultiWorkflowRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type MultiWorkflowRunItem = {
  order: number
  workflowId: string
  platform: WorkflowPlatform
  enabled: boolean
  status: MultiWorkflowRunItemStatus
  multiWorkflowJobId?: string | null
  workflowRunId?: string | null
}

export type MultiWorkflowRun = {
  _id: string
  multiWorkflowId?: string
  multiWorkflowKey: string
  storySourceId?: string | null
  storyId?: string | null
  status: MultiWorkflowRunStatus
  currentOrder: number
  items: MultiWorkflowRunItem[]
  payload?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
  startedAt?: string | null
  finishedAt?: string | null
}

export type MultiWorkflowJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped'

export type MultiWorkflowJob = {
  _id: string
  multiWorkflowRunId: string
  multiWorkflowKey: string
  workflowId: string
  platform: WorkflowPlatform
  order: number
  status: MultiWorkflowJobStatus
  attempts: number
  maxAttempts: number
  workflowRunId?: string | null
  payload?: Record<string, unknown>
  result?: Record<string, unknown>
  lastError?: { code?: string; message?: string }
  createdAt?: string
  updatedAt?: string
}

export const getDefaultMultiWorkflow = async () => {
  const response = await axiosClient.get('/multi-workflows/default')
  return response.data as MultiWorkflow
}

export const listMultiWorkflows = async () => {
  const response = await axiosClient.get('/multi-workflows')
  return (response.data || []) as MultiWorkflow[]
}

export const getMultiWorkflowById = async (id: string) => {
  const response = await axiosClient.get(`/multi-workflows/${id}`)
  return response.data as MultiWorkflow
}

export const createMultiWorkflow = async (payload: {
  name: string
  items?: MultiWorkflowItem[]
  cloneFromMultiWorkflowId?: string
}) => {
  const response = await axiosClient.post('/multi-workflows', payload)
  return response.data as MultiWorkflow
}

export const updateMultiWorkflowById = async (
  id: string,
  payload: { name?: string; items?: MultiWorkflowItem[] },
) => {
  const response = await axiosClient.put(`/multi-workflows/${id}`, payload)
  return response.data as MultiWorkflow
}

export const deleteMultiWorkflow = async (id: string) => {
  const response = await axiosClient.delete(`/multi-workflows/${id}`)
  return response.data as { deleted: boolean; id: string }
}

export const setDefaultMultiWorkflow = async (id: string) => {
  const response = await axiosClient.patch(`/multi-workflows/${id}/default`)
  return response.data as MultiWorkflow
}

export const createMultiWorkflowRun = async (payload: {
  storySourceId?: string
  multiWorkflowId?: string
  trigger?: string
}) => {
  const response = await axiosClient.post('/multi-workflows/runs', payload)
  return response.data as MultiWorkflowRun
}

export const cancelMultiWorkflowRun = async (id: string) => {
  const response = await axiosClient.patch(`/multi-workflows/runs/${id}/cancel`)
  return response.data as MultiWorkflowRun
}

export const listMultiWorkflowRuns = async (params?: { status?: string; limit?: number }) => {
  const response = await axiosClient.get('/multi-workflows/runs', { params })
  return (response.data || []) as MultiWorkflowRun[]
}

export const getMultiWorkflowRun = async (id: string) => {
  const response = await axiosClient.get(`/multi-workflows/runs/${id}`)
  return response.data as MultiWorkflowRun
}

export const listMultiWorkflowJobs = async (params?: {
  platform?: WorkflowPlatform
  status?: string
  multiWorkflowRunId?: string
  limit?: number
}) => {
  const response = await axiosClient.get('/multi-workflows/jobs', { params })
  return (response.data || []) as MultiWorkflowJob[]
}
