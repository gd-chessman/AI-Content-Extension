import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ToolStepPhase } from '../../shared/tools/tool-step-phase';
import { WorkflowPlatform } from '../workflows/workflow.schema';

export type ToolDocument = HydratedDocument<Tool>;

/** Vị trí hiển thị nút công cụ trên extension. */
export enum ToolPlacement {
  STEP_PANEL = 'step_panel',
  BOTTOM_BAR = 'bottom_bar',
  GLOBAL = 'global',
}

@Schema({ timestamps: true })
export class Tool {
  /** Mã cố định — map handler FE/BE. VD: `chatgpt_copy_video_1` */
  @Prop({ required: true, unique: true, trim: true, lowercase: true, index: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    enum: Object.values(WorkflowPlatform),
    index: true,
  })
  platform: WorkflowPlatform;

  /** Khóa registry (metadata) — VD: `chatgpt.copyVideo` */
  @Prop({ required: true, trim: true })
  handlerKey: string;

  /** Script thực thi khi bấm nút — `await host.method(config)` trên extension. */
  @Prop({ required: true, trim: true, default: '' })
  handlerScript: string;

  /** Script kiểm tra disabled — biểu thức trả boolean, VD: `!host.splitImages`. */
  @Prop({ trim: true, default: '' })
  guardScript: string;

  @Prop({
    required: true,
    enum: Object.values(ToolPlacement),
    default: ToolPlacement.STEP_PANEL,
    index: true,
  })
  placement: ToolPlacement;

  /**
   * Workflow: `before_step` | `after_step` | `independent` (chỉ bấm tay).
   * Ghi đè trên `steptools.stepPhase` nếu cần theo từng bước.
   */
  @Prop({
    required: true,
    enum: Object.values(ToolStepPhase),
    default: ToolStepPhase.INDEPENDENT,
    index: true,
  })
  stepPhase: ToolStepPhase;

  @Prop({ default: 0 })
  sortOrder: number;

  /** Tham số mặc định — VD: `{ "part": 1 }`, `{ "mode": "title_plain" }` */
  @Prop({ type: Object, default: {} })
  defaultConfig: Record<string, unknown>;

  /** Giao diện nút trên extension — sync từ `shared/tools`. */
  @Prop({ type: Object, default: {} })
  uiConfig: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const ToolSchema = SchemaFactory.createForClass(Tool);
ToolSchema.index({ platform: 1, placement: 1, sortOrder: 1, isActive: 1 });
