import type { StepToolLink, ToolItem } from '@/services/StepToolService'

export type BottomBarIconKey = 'grok1' | 'grok2' | 'grokSingle' | 'webblog' | 'ggsheet' | 'saveLocal'

export type ResolvedBottomBarTool = {
  toolId: string
  code: string
  name: string
  sortOrder: number
  config: Record<string, unknown>
  guardScript?: string
  ui: {
    icon: BottomBarIconKey
    copiedToolId: string
    buttonClass: string
    badgeClass: string
    badgeLabel?: string
  }
}

const BOTTOM_BAR_ICON_KEYS: BottomBarIconKey[] = ['grok1', 'grok2', 'grokSingle', 'webblog', 'ggsheet', 'saveLocal']

function isBottomBarIconKey(value: unknown): value is BottomBarIconKey {
  return typeof value === 'string' && BOTTOM_BAR_ICON_KEYS.includes(value as BottomBarIconKey)
}

function badgeLabelFromConfig(config: Record<string, unknown>, icon: BottomBarIconKey): string | undefined {
  switch (icon) {
    case 'grok1':
      return '1'
    case 'grok2':
      return '2'
    default:
      break
  }
  switch (config.part) {
    case 1:
    case '1':
      return '1'
    case 2:
    case '2':
      return '2'
    default:
      return undefined
  }
}

function uiFromTool(tool: ToolItem): ResolvedBottomBarTool['ui'] | undefined {
  const ui = tool.uiConfig
  if (!ui || typeof ui !== 'object') return undefined
  if (!isBottomBarIconKey(ui.icon)) return undefined
  const buttonClass = typeof ui.buttonClass === 'string' ? ui.buttonClass.trim() : ''
  const badgeClass = typeof ui.badgeClass === 'string' ? ui.badgeClass.trim() : ''
  const copiedToolId = typeof ui.copiedToolId === 'string' ? ui.copiedToolId.trim() : ''
  if (!buttonClass || !badgeClass || !copiedToolId) return undefined
  const config = tool.defaultConfig || {}
  const badgeLabel = badgeLabelFromConfig(config, ui.icon)
  return {
    icon: ui.icon,
    copiedToolId,
    buttonClass,
    badgeClass,
    badgeLabel,
  }
}

function mergeConfig(tool: ToolItem | undefined, link: StepToolLink) {
  return {
    ...(tool?.defaultConfig || {}),
    ...(link.config || {}),
  }
}

function resolveFromLink(link: StepToolLink): ResolvedBottomBarTool | undefined {
  const tool = link.tool
  const toolId = (tool?._id || link.toolId || '').trim()
  const code = (tool?.code || '').trim()
  const ui = tool ? uiFromTool(tool) : undefined
  if (!toolId || !code || !ui) return undefined
  return {
    toolId,
    code,
    name: (tool?.name || code).trim(),
    sortOrder: link.sortOrder ?? tool?.sortOrder ?? 0,
    config: mergeConfig(tool, link),
    guardScript: (tool?.guardScript || '').trim() || undefined,
    ui,
  }
}

/** Gộp công cụ bottom_bar đã gắn workflow (step_tools), theo từng workflow. */
export function buildWorkflowBottomBarTools(
  stepLinks: Array<{ ownerStepId: string; tools: StepToolLink[] }>,
): ResolvedBottomBarTool[] {
  const byToolId = new Map<string, ResolvedBottomBarTool>()

  for (const { tools } of stepLinks) {
    const activeLinks = tools.filter(
      (link) => link.isActive !== false && link.tool?.placement === 'bottom_bar',
    )
    for (const link of activeLinks) {
      const resolved = resolveFromLink(link)
      if (!resolved) continue
      const existing = byToolId.get(resolved.toolId)
      if (!existing || resolved.sortOrder < existing.sortOrder) {
        byToolId.set(resolved.toolId, resolved)
      }
    }
  }

  const display = [...byToolId.values()]
  display.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
  return display
}
