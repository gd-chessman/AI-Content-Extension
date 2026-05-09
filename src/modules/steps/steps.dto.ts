import { StepActionType } from './step.schema';

export class CreateStepDto {
  workflowId: string;
  stepNo: number;
  title: string;
  instruction: string;
  prompt?: string;
  actionType?: StepActionType;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  isActive?: boolean;
}

export class UpdateStepDto {
  workflowId?: string;
  stepNo?: number;
  title?: string;
  instruction?: string;
  prompt?: string;
  actionType?: StepActionType;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  isActive?: boolean;
}
