import { StepRunStatus } from './step-run.schema';

export class CreateStepRunDto {
  workflowRunId: string;
  workflowId: string;
  stepId: string;
  stepNo: number;
  stepTitle: string;
  status?: StepRunStatus;
  input?: Record<string, unknown>;
  startedAt?: string | Date | null;
}

export class UpdateStepRunDto {
  status?: StepRunStatus;
  output?: Record<string, unknown>;
  input?: Record<string, unknown>;
  error?: {
    message?: string;
    details?: Record<string, unknown>;
  };
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
}
