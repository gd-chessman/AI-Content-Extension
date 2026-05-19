/** Thời điểm workflow tự chạy công cụ so với bước (step). Bấm tay luôn được với mọi phase. */
export enum ToolStepPhase {
  /** Chỉ khi user bấm nút — workflow không gọi. */
  INDEPENDENT = 'independent',
  /** Workflow: trước khi gửi prompt / chạy hành vi bước. */
  BEFORE_STEP = 'before_step',
  /** Workflow: sau khi bước hoàn tất (vd. ChatGPT đã phản hồi). */
  AFTER_STEP = 'after_step',
}

export const TOOL_STEP_PHASE_VALUES = Object.values(ToolStepPhase);

export function normalizeToolStepPhase(
  value: unknown,
  fallback: ToolStepPhase = ToolStepPhase.INDEPENDENT,
): ToolStepPhase {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (TOOL_STEP_PHASE_VALUES.includes(raw as ToolStepPhase)) {
    return raw as ToolStepPhase;
  }
  return fallback;
}
