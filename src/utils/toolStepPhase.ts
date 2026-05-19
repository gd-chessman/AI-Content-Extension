/** Khớp `ToolStepPhase` backend — thời điểm workflow tự chạy công cụ. */
export type ToolStepPhase = 'independent' | 'before_step' | 'after_step'

export const TOOL_STEP_PHASE_LABEL: Record<ToolStepPhase, string> = {
  independent: 'Chỉ bấm tay',
  before_step: 'Trước bước (workflow)',
  after_step: 'Sau bước (workflow)',
}

export function normalizeToolStepPhase(
  value: unknown,
  fallback: ToolStepPhase = 'independent',
): ToolStepPhase {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (raw === 'before_step' || raw === 'after_step' || raw === 'independent') {
    return raw
  }
  return fallback
}

export type StepPhaseSource = {
  stepPhase?: ToolStepPhase | null
  tool?: { stepPhase?: ToolStepPhase }
  effectiveStepPhase?: ToolStepPhase
}

/** `steptools.stepPhase` ghi đè `tools.stepPhase` nếu có. */
export function resolveEffectiveStepPhase(source: StepPhaseSource): ToolStepPhase {
  if (source.effectiveStepPhase) {
    return normalizeToolStepPhase(source.effectiveStepPhase)
  }
  if (source.stepPhase) {
    return normalizeToolStepPhase(source.stepPhase)
  }
  return normalizeToolStepPhase(source.tool?.stepPhase, 'independent')
}
