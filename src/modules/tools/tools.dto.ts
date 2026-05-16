import { ToolPlacement } from './tool.schema';
import { WorkflowPlatform } from '../workflows/workflow.schema';

export class CreateToolDto {
  code: string;
  name: string;
  platform: WorkflowPlatform;
  handlerKey: string;
  handlerScript: string;
  guardScript?: string;
  placement?: ToolPlacement;
  sortOrder?: number;
  defaultConfig?: Record<string, unknown>;
  uiConfig?: Record<string, unknown>;
  isActive?: boolean;
}

export class UpdateToolDto {
  code?: string;
  name?: string;
  platform?: WorkflowPlatform;
  handlerKey?: string;
  handlerScript?: string;
  guardScript?: string;
  placement?: ToolPlacement;
  sortOrder?: number;
  defaultConfig?: Record<string, unknown>;
  uiConfig?: Record<string, unknown>;
  isActive?: boolean;
}
