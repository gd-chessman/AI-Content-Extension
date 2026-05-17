/**
 * Adapter UI step_panel — một lưới cho cả workflow (không chia khối theo stepNo).
 * Thứ tự: uiConfig.displayGroup (image → video → content) rồi displayOrder.
 */
import type { StepToolLink, ToolItem } from '@/services/StepToolService'

export type StepPanelIconKey =
  | 'scissors'
  | 'image'
  | 'film'
  | 'type'
  | 'italic'
  | 'alignLeft'
  | 'fileText'

export type ToolDisplayGroup = 'image' | 'video' | 'content' | 'other'

export type StepPanelToolUi = {
  code: string
  copiedToolId: string
  icon: StepPanelIconKey
  colSpan?: 1 | 2
  buttonClass: string
  badgeClass: string
  showCopyBadge?: boolean
  displayGroup: ToolDisplayGroup
  displayOrder: number
}

export type ResolvedStepPanelTool = {
  toolId: string
  code: string
  name: string
  /** Step gắn trong step_tools — dùng cho guard/handler, không dùng để chia khối UI. */
  ownerStepId: string
  sortOrder: number
  config: Record<string, unknown>
  guardScript?: string
  ui: StepPanelToolUi
}

export type StepPanelToolComparison = {
  display: ResolvedStepPanelTool[]
}

const STEP_PANEL_ICON_KEYS: StepPanelIconKey[] = [
  'scissors',
  'image',
  'film',
  'type',
  'italic',
  'alignLeft',
  'fileText',
]

const DISPLAY_GROUP_RANK: Record<ToolDisplayGroup, number> = {
  image: 0,
  video: 1,
  content: 2,
  other: 9,
}

function isStepPanelIconKey(value: unknown): value is StepPanelIconKey {
  return typeof value === 'string' && STEP_PANEL_ICON_KEYS.includes(value as StepPanelIconKey)
}

function resolveDisplayGroup(tool: ToolItem): ToolDisplayGroup {
  const ui = tool.uiConfig
  const fromUi = ui && typeof ui === 'object' ? ui.displayGroup : undefined
  switch (fromUi) {
    case 'image':
    case 'video':
    case 'content':
      return fromUi
    default:
      break
  }
  const code = (tool.code || '').toLowerCase()
  switch (true) {
    case code.includes('image'):
    case code.includes('split'):
      return 'image'
    case code.includes('video'):
      return 'video'
    case code.includes('title'):
    case code.includes('content'):
      return 'content'
    default:
      return 'other'
  }
}

function resolveDisplayOrder(tool: ToolItem, link: StepToolLink): number {
  const ui = tool.uiConfig
  if (ui && typeof ui === 'object' && typeof ui.displayOrder === 'number') {
    return ui.displayOrder
  }
  return link.sortOrder ?? tool.sortOrder ?? 0
}

function uiFromTool(tool: ToolItem): StepPanelToolUi | undefined {
  const ui = tool.uiConfig
  if (!ui || typeof ui !== 'object') return undefined
  if (!isStepPanelIconKey(ui.icon)) return undefined
  const buttonClass = typeof ui.buttonClass === 'string' ? ui.buttonClass.trim() : ''
  const badgeClass = typeof ui.badgeClass === 'string' ? ui.badgeClass.trim() : ''
  const copiedToolId = typeof ui.copiedToolId === 'string' ? ui.copiedToolId.trim() : ''
  if (!buttonClass || !badgeClass || !copiedToolId) return undefined
  const displayGroup = resolveDisplayGroup(tool)
  return {
    code: tool.code,
    copiedToolId,
    icon: ui.icon,
    colSpan: ui.colSpan === 2 ? 2 : 1,
    buttonClass,
    badgeClass,
    showCopyBadge: ui.showCopyBadge === true,
    displayGroup,
    displayOrder: typeof ui.displayOrder === 'number' ? ui.displayOrder : 0,
  }
}

function mergeConfig(tool: ToolItem | undefined, link: StepToolLink) {
  return {
    ...(tool?.defaultConfig || {}),
    ...(link.config || {}),
  }
}

function sortWorkflowTools(display: ResolvedStepPanelTool[]) {
  display.sort((a, b) => {
    const groupDiff = DISPLAY_GROUP_RANK[a.ui.displayGroup] - DISPLAY_GROUP_RANK[b.ui.displayGroup]
    if (groupDiff !== 0) return groupDiff
    const orderDiff = a.ui.displayOrder - b.ui.displayOrder
    if (orderDiff !== 0) return orderDiff
    return a.sortOrder - b.sortOrder
  })
}

/** Gộp mọi step_panel tool của workflow vào một lưới. */
export function buildWorkflowStepPanelComparison(
  stepLinks: Array<{ ownerStepId: string; tools: StepToolLink[] }>,
): StepPanelToolComparison {
  const display: ResolvedStepPanelTool[] = []

  for (const { ownerStepId, tools } of stepLinks) {
    const activeLinks = tools.filter(
      (link) => link.isActive !== false && link.tool?.placement === 'step_panel',
    )

    for (const link of activeLinks) {
      const tool = link.tool
      const toolId = (tool?._id || link.toolId || '').trim()
      const code = (tool?.code || '').trim()
      const name = (tool?.name || code || 'Tool').trim()
      const ui = tool ? uiFromTool(tool) : undefined
      if (!toolId || !ownerStepId || !ui) continue

      const displayOrder = tool ? resolveDisplayOrder(tool, link) : link.sortOrder ?? 0

      display.push({
        toolId,
        code,
        name,
        ownerStepId,
        sortOrder: link.sortOrder ?? tool?.sortOrder ?? 0,
        config: mergeConfig(tool, link),
        guardScript: (tool?.guardScript || '').trim() || undefined,
        ui: { ...ui, displayOrder },
      })
    }
  }

  sortWorkflowTools(display)
  return { display }
}

export function getStepPanelBadgeLabel(config: Record<string, unknown>, ui: StepPanelToolUi) {
  switch (ui.copiedToolId) {
    case 'video-1':
    case 'image-left':
      return '1'
    case 'video-2':
    case 'image-right':
      return '2'
    default:
      break
  }

  switch (config.part) {
    case 'left':
    case 1:
    case '1':
      return '1'
    case 'right':
    case 2:
    case '2':
      return '2'
    default:
      break
  }

  if (typeof config.mode === 'string' && config.mode.includes('short')) return ''
  return ''
}
