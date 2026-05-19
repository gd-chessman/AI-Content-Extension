import { ToolPlacement } from './tool.schema';
import { ToolStepPhase } from '../../shared/tools/tool-step-phase';
import { WorkflowPlatform } from '../workflows/workflow.schema';

export class CreateToolDto {
  code: string;
  name: string;
  platform: WorkflowPlatform;
  handlerKey: string;
  handlerScript: string;
  guardScript?: string;
  placement?: ToolPlacement;
  stepPhase?: ToolStepPhase;
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
  stepPhase?: ToolStepPhase;
  sortOrder?: number;
  defaultConfig?: Record<string, unknown>;
  uiConfig?: Record<string, unknown>;
  isActive?: boolean;
}
