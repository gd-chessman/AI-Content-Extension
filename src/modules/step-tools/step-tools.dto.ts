export class CreateStepToolDto {
  stepId: string;
  toolId: string;
  sortOrder?: number;
  config?: Record<string, unknown>;
  isActive?: boolean;
}

export class UpdateStepToolDto {
  stepId?: string;
  toolId?: string;
  sortOrder?: number;
  config?: Record<string, unknown>;
  isActive?: boolean;
}

export class SetStepToolsDto {
  tools: Array<{
    toolId: string;
    sortOrder?: number;
    config?: Record<string, unknown>;
    isActive?: boolean;
  }>;
}
