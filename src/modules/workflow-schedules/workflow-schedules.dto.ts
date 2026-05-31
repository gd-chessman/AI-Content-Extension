import {
  WorkflowScheduleKind,
  WorkflowScheduleTargetType,
} from './workflow-schedule.schema';

export class CreateWorkflowScheduleDto {
  name: string;
  enabled?: boolean;
  targetType: WorkflowScheduleTargetType;
  multiWorkflowId?: string;
  workflowId?: string;
  scheduleKind: WorkflowScheduleKind;
  runAt?: string;
  timeOfDay?: string;
  daysOfWeek?: number[];
  timezone?: string;
  payload?: Record<string, unknown>;
  /** Số lần chạy liên tiếp khi lịch kích hoạt (1–100). */
  consecutiveRuns?: number;
}

export class UpdateWorkflowScheduleDto {
  name?: string;
  enabled?: boolean;
  targetType?: WorkflowScheduleTargetType;
  multiWorkflowId?: string;
  workflowId?: string;
  scheduleKind?: WorkflowScheduleKind;
  runAt?: string;
  timeOfDay?: string;
  daysOfWeek?: number[];
  timezone?: string;
  payload?: Record<string, unknown>;
  consecutiveRuns?: number;
}

export class ToggleWorkflowScheduleDto {
  enabled: boolean;
}

export class ListWorkflowScheduleRunsQueryDto {
  limit?: number;
}
