import { WorkflowPlatform } from '../workflows/workflow.schema';

export class MultiWorkflowItemDto {
  order: number;
  workflowId: string;
  platform: WorkflowPlatform;
  enabled?: boolean;
}

export class CreateMultiWorkflowDto {
  name: string;
  items?: MultiWorkflowItemDto[];
  /** Sao chép items từ multi workflow khác (tùy chọn). */
  cloneFromMultiWorkflowId?: string;
}

export class UpdateMultiWorkflowDto {
  name?: string;
  items?: MultiWorkflowItemDto[];
}

export class CreateMultiWorkflowRunDto {
  /** Tuỳ chọn — chạy lại trên reel đã lưu. Bỏ trống = chạy pipeline mới. */
  storySourceId?: string;
  multiWorkflowId?: string;
  trigger?: string;
  payload?: Record<string, unknown>;
}

export class ClaimMultiWorkflowJobDto {
  platform: WorkflowPlatform;
  lockedBy?: string;
}

export class CompleteMultiWorkflowJobDto {
  result?: Record<string, unknown>;
  storyId?: string;
  storySourceId?: string;
}

export class FailMultiWorkflowJobDto {
  /** Lỗi từ extension — không retry, kết thúc run ngay. */
  terminal?: boolean;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

export class ListMultiWorkflowRunsQueryDto {
  status?: string;
  limit?: number;
}

export class ListMultiWorkflowJobsQueryDto {
  platform?: WorkflowPlatform;
  status?: string;
  multiWorkflowRunId?: string;
  limit?: number;
}
