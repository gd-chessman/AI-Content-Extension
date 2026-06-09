import { StepActionType, StepDisplayMode } from '../../modules/steps/step.schema';
import {
  WorkflowCategory,
  WorkflowPlatform,
  WorkflowStatus,
} from '../../modules/workflows/workflow.schema';

export type GrokWorkflowStepSeed = {
  stepNo: number;
  title: string;
  instruction: string;
  prompt?: string;
  actionType: StepActionType;
  displayMode: StepDisplayMode;
  inputSchema?: Record<string, unknown>;
};

export const GROK_WORKFLOW_SEED_NAME = 'Grok Imagine từ VideoShort';

export const GROK_WORKFLOW_SEED = {
  name: GROK_WORKFLOW_SEED_NAME,
  description:
    'Đọc VideoShort (imageUrls + videoPrompts từ ChatGPT), điền Grok Imagine, Enter, chờ video và lưu file local.',
  platform: WorkflowPlatform.GROK,
  category: WorkflowCategory.AI_VIDEO_CREATION,
  status: WorkflowStatus.ACTIVE,
  version: 1,
  steps: [
    {
      stepNo: 1,
      title: 'Điền ảnh + VIDEO và Enter',
      instruction:
        'Lấy imageUrls[index] và videoPrompts[index] từ VideoShort (videoShortId từ multi workflow), paste Grok Imagine và gửi.',
      prompt: '',
      actionType: StepActionType.GROK_FILL_FROM_VIDEO_SHORT,
      displayMode: StepDisplayMode.VISIBLE,
      inputSchema: { index: 0 },
    },
    {
      stepNo: 2,
      title: 'Chờ video và tải về local',
      instruction:
        'Chờ Grok render, tải MP4 trong tab Grok, ghi vào workspace stories/.../videos/, lưu đường dẫn local: vào VideoShort.videoStorageAddresses.',
      prompt: '',
      actionType: StepActionType.GROK_CAPTURE_VIDEO_LINK,
      displayMode: StepDisplayMode.BACKGROUND,
      inputSchema: { timeoutMs: 600_000 },
    },
  ] satisfies GrokWorkflowStepSeed[],
};
