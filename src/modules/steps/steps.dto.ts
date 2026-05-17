import { StepActionType, StepDisplayMode } from './step.schema';

export class CreateStepDto {
  workflowId: string;
  stepNo: number;
  title: string;
  instruction: string;
  prompt?: string;
  actionType?: StepActionType;
  displayMode?: StepDisplayMode;
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
  displayMode?: StepDisplayMode;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  isActive?: boolean;
}
