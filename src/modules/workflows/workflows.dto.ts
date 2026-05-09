import { WorkflowCategory, WorkflowPlatform, WorkflowStatus } from './workflow.schema';

export class CreateWorkflowDto {
  name: string;
  description?: string;
  version?: number;
  status?: WorkflowStatus;
  platform?: WorkflowPlatform;
  category?: WorkflowCategory;
  ownerUserId?: string;
}

export class UpdateWorkflowDto {
  name?: string;
  description?: string;
  version?: number;
  status?: WorkflowStatus;
  platform?: WorkflowPlatform;
  category?: WorkflowCategory;
  ownerUserId?: string;
}
