import axiosClient from '@/utils/axiosClient'

export const completeMultiWorkflowJob = async (
  jobId: string,
  payload?: { videoShortId?: string; videoShortSourceId?: string; result?: Record<string, unknown> },
) => {
  const response = await axiosClient.patch(`/multi-workflows/jobs/${jobId}/complete`, payload || {})
  return response.data
}

export const failMultiWorkflowJob = async (
  jobId: string,
  payload?: {
    terminal?: boolean
    error?: { code?: string; message?: string; details?: Record<string, unknown> }
  },
) => {
  const response = await axiosClient.patch(`/multi-workflows/jobs/${jobId}/fail`, payload || {})
  return response.data
}
