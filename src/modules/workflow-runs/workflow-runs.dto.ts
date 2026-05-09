import { WorkflowRunStatus } from './workflow-run.schema';

export class CreateWorkflowRunDto {
  workflowId: string;
  payload?: Record<string, unknown>;
  attempt?: number;
}

export class UpdateWorkflowRunDto {
  status?: WorkflowRunStatus;
  progress?: number;
  currentStepNo?: number;
  result?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
}
