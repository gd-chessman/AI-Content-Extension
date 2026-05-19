import type { Model } from 'mongoose';
import type { ToolDefinition, ToolPlatform } from './tool-definition.types';
import type { Tool, ToolDocument } from '../../modules/tools/tool.schema';
import { ToolPlacement } from '../../modules/tools/tool.schema';
import { ToolStepPhase, normalizeToolStepPhase } from './tool-step-phase';
import { WorkflowPlatform } from '../../modules/workflows/workflow.schema';

export type ToolSyncResult = {
  total: number;
  created: number;
  updated: number;
  results: Array<{ code: string; action: 'created' | 'updated' }>;
};

export async function syncToolDefinitions(
  toolModel: Model<ToolDocument>,
  definitions: ToolDefinition[],
): Promise<ToolSyncResult> {
  const results: ToolSyncResult['results'] = [];
  let created = 0;
  let updated = 0;

  for (const seed of definitions) {
    const code = seed.code.trim().toLowerCase();
    const payload: Partial<Tool> = {
      code,
      name: seed.name.trim(),
      platform: seed.platform as WorkflowPlatform,
      handlerKey: seed.handlerKey.trim(),
      handlerScript: seed.handlerScript.trim(),
      guardScript: (seed.guardScript || '').trim(),
      placement: seed.placement as ToolPlacement,
      stepPhase: normalizeToolStepPhase(seed.stepPhase, ToolStepPhase.INDEPENDENT),
      sortOrder: seed.sortOrder ?? 0,
      defaultConfig: seed.defaultConfig ?? {},
      uiConfig: seed.uiConfig ?? {},
      isActive: seed.isActive ?? true,
    };

    const existing = await toolModel.findOne({ code }).lean();
    if (existing) {
      await toolModel
        .findByIdAndUpdate(existing._id, { $set: payload }, { runValidators: true })
        .lean();
      updated += 1;
      results.push({ code, action: 'updated' });
      continue;
    }

    await toolModel.create(payload);
    created += 1;
    results.push({ code, action: 'created' });
  }

  return {
    total: results.length,
    created,
    updated,
    results,
  };
}

export function filterToolDefinitions(
  definitions: ToolDefinition[],
  platform?: WorkflowPlatform | ToolPlatform,
): ToolDefinition[] {
  if (!platform) {
    return definitions;
  }
  return definitions.filter((item) => item.platform === platform);
}
