import { getWorkflowRunById, type WorkflowRunItem, type WorkflowRunStreamEvent } from '@/services/WorkflowService'
import { completeMultiWorkflowJob, failMultiWorkflowJob } from '@/services/MultiWorkflowService'

export type MultiWorkflowRunPayload = {
  source?: string
  multiWorkflowJobId?: string
  multiWorkflowRunId?: string
  videoShortSourceId?: string
  platform?: string
}

export function getMultiWorkflowPayload(
  payload: Record<string, unknown> | undefined,
): MultiWorkflowRunPayload | null {
  if (!payload || payload.source !== 'multi_workflow') return null
  return payload as MultiWorkflowRunPayload
}

/** Extension SSE: multi workflow từ web dùng status running; run thường dùng queued. */
export function shouldAcceptWorkflowRunFromStream(
  run: WorkflowRunItem,
  expectedWorkflowId: string,
): boolean {
  if (!run?._id || !run.workflowId) return false
  if (run.workflowId !== expectedWorkflowId) return false
  const status = (run.status || '').toLowerCase()
  const mw = getMultiWorkflowPayload(run.payload as Record<string, unknown>)
  if (mw) return status === 'queued' || status === 'running'
  return status === 'queued' || status === 'running'
}

/** SSE từ web hủy run — BE gửi workflow_run_updated status cancelled. */
export function getCancelledWorkflowRunFromStream(
  payload: WorkflowRunStreamEvent | null | undefined,
): WorkflowRunItem | null {
  if (!payload || payload.type !== 'workflow_run_updated') return null
  const run = payload.run
  if (!run?._id) return null
  if ((run.status || '').toLowerCase() !== 'cancelled') return null
  return run as WorkflowRunItem
}

export function shouldStopLocalWorkflowForCancelledRun(
  cancelledRunId: string,
  runningRunId: string,
): boolean {
  const cancelled = cancelledRunId.trim()
  const running = runningRunId.trim()
  return Boolean(cancelled && running && cancelled === running)
}

export async function finalizeMultiWorkflowJobAfterWorkflowRun(
  workflowRunId: string,
  outcome: 'completed' | 'failed' | 'cancelled',
  extra?: {
    videoShortId?: string
    videoShortSourceId?: string
    errorMessage?: string
    result?: Record<string, unknown>
  },
) {
  const id = (workflowRunId || '').trim()
  if (!id) return

  const run = await getWorkflowRunById(id)
  const mw = getMultiWorkflowPayload((run.payload || {}) as Record<string, unknown>)
  if (!mw) return

  const jobId = (mw.multiWorkflowJobId || '').trim()
  if (!jobId) return

  if (outcome === 'completed') {
    await completeMultiWorkflowJob(jobId, {
      videoShortId: extra?.videoShortId,
      videoShortSourceId: extra?.videoShortSourceId,
      result: {
        ...(extra?.result || {}),
        ...(extra?.videoShortSourceId ? { videoShortSourceId: extra.videoShortSourceId } : {}),
        workflowRunId: id,
        multiWorkflowRunId: mw.multiWorkflowRunId,
      },
    })
    return
  }

  await failMultiWorkflowJob(jobId, {
    terminal: true,
    error: {
      code: outcome,
      message: extra?.errorMessage || `Workflow ${outcome}`,
      details: { workflowRunId: id },
    },
  })
}
