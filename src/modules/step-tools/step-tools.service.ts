import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Step, StepDocument } from '../steps/step.schema';
import { Tool, ToolDocument } from '../tools/tool.schema';
import { CreateStepToolDto, SetStepToolsDto, UpdateStepToolDto } from './step-tools.dto';
import { StepTool, StepToolDocument } from './step-tool.schema';

export type StepToolWithTool = StepTool & {
  _id: Types.ObjectId;
  tool?: Tool & { _id: Types.ObjectId };
};

@Injectable()
export class StepToolsService {
  constructor(
    @InjectModel(StepTool.name)
    private readonly stepToolModel: Model<StepToolDocument>,
    @InjectModel(Step.name)
    private readonly stepModel: Model<StepDocument>,
    @InjectModel(Tool.name)
    private readonly toolModel: Model<ToolDocument>,
  ) {}

  async listByStepId(stepId: string, activeOnly = true) {
    const normalizedStepId = this.normalizeStepId(stepId);
    const filter: { stepId: Types.ObjectId; isActive?: boolean } = { stepId: normalizedStepId };
    if (activeOnly) {
      filter.isActive = true;
    }
    const rows = await this.stepToolModel
      .find(filter)
      .populate('toolId')
      .sort({ sortOrder: 1 })
      .lean();
    return rows.map((row) => this.mapRow(row));
  }

  async listByWorkflowId(workflowId: string, activeOnly = true) {
    this.assertObjectId(workflowId, 'Invalid workflow id.');
    const steps = await this.stepModel
      .find({ workflowId: new Types.ObjectId(workflowId), isActive: true })
      .sort({ stepNo: 1 })
      .lean();
    if (!steps.length) {
      return [];
    }

    const stepIds = steps.map((step) => step._id);
    const filter: { stepId: { $in: Types.ObjectId[] }; isActive?: boolean } = {
      stepId: { $in: stepIds },
    };
    if (activeOnly) {
      filter.isActive = true;
    }

    const rows = await this.stepToolModel
      .find(filter)
      .populate('toolId')
      .sort({ sortOrder: 1 })
      .lean();

    const byStepId = new Map<string, ReturnType<StepToolsService['mapRow']>[]>();
    for (const row of rows) {
      const key = String(row.stepId);
      const bucket = byStepId.get(key) || [];
      bucket.push(this.mapRow(row));
      byStepId.set(key, bucket);
    }

    return steps.map((step) => ({
      stepId: String(step._id),
      stepNo: step.stepNo,
      title: step.title,
      tools: byStepId.get(String(step._id)) || [],
    }));
  }

  async attachToolsToSteps<T extends { _id: Types.ObjectId }>(steps: T[], activeOnly = true) {
    if (!steps.length) {
      return [];
    }

    const stepIds = steps.map((step) => step._id);
    const filter: { stepId: { $in: Types.ObjectId[] }; isActive?: boolean } = {
      stepId: { $in: stepIds },
    };
    if (activeOnly) {
      filter.isActive = true;
    }

    const rows = await this.stepToolModel
      .find(filter)
      .populate('toolId')
      .sort({ sortOrder: 1 })
      .lean();

    const byStepId = new Map<string, ReturnType<StepToolsService['mapRow']>[]>();
    for (const row of rows) {
      const key = String(row.stepId);
      const bucket = byStepId.get(key) || [];
      bucket.push(this.mapRow(row));
      byStepId.set(key, bucket);
    }

    return steps.map((step) => ({
      ...step,
      tools: byStepId.get(String(step._id)) || [],
    }));
  }

  async getById(id: string) {
    this.assertObjectId(id, 'Invalid step-tool id.');
    const found = await this.stepToolModel.findById(id).populate('toolId').lean();
    if (!found) {
      throw new NotFoundException('Step tool link not found.');
    }
    return this.mapRow(found);
  }

  async create(dto: CreateStepToolDto) {
    const payload = await this.normalizePayload(dto, false);
    try {
      const created = await this.stepToolModel.create(payload);
      const populated = await this.stepToolModel.findById(created._id).populate('toolId').lean();
      return this.mapRow(populated!);
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('This tool is already linked to the step.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateStepToolDto) {
    this.assertObjectId(id, 'Invalid step-tool id.');
    const patch = await this.normalizePayload(dto, true);
    if (!Object.keys(patch).length) {
      throw new BadRequestException('Nothing to update.');
    }

    try {
      const updated = await this.stepToolModel
        .findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true })
        .populate('toolId')
        .lean();
      if (!updated) {
        throw new NotFoundException('Step tool link not found.');
      }
      return this.mapRow(updated);
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('This tool is already linked to the step.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    this.assertObjectId(id, 'Invalid step-tool id.');
    const removed = await this.stepToolModel.findByIdAndDelete(id).lean();
    if (!removed) {
      throw new NotFoundException('Step tool link not found.');
    }
    return this.mapRow(removed);
  }

  /** Thay toàn bộ công cụ của một step (xóa link cũ rồi tạo mới). */
  async setForStep(stepId: string, dto: SetStepToolsDto) {
    const normalizedStepId = this.normalizeStepId(stepId);
    const step = await this.stepModel.findById(normalizedStepId).lean();
    if (!step) {
      throw new NotFoundException('Step not found.');
    }

    const tools = dto.tools || [];
    const payloads = [];
    for (let index = 0; index < tools.length; index += 1) {
      const item = tools[index];
      payloads.push({
        stepId: normalizedStepId,
        toolId: await this.normalizeToolId(item.toolId),
        sortOrder: item.sortOrder ?? index * 10,
        config: item.config ?? {},
        isActive: item.isActive ?? true,
      });
    }

    await this.stepToolModel.deleteMany({ stepId: normalizedStepId });

    if (!payloads.length) {
      return [];
    }

    const created = await this.stepToolModel.insertMany(payloads);
    const ids = created.map((row) => row._id);
    const rows = await this.stepToolModel.find({ _id: { $in: ids } }).populate('toolId').sort({ sortOrder: 1 }).lean();
    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: Record<string, unknown>) {
    const toolRaw = row.toolId;
    const tool =
      toolRaw && typeof toolRaw === 'object' && '_id' in (toolRaw as object)
        ? (toolRaw as Tool & { _id: Types.ObjectId })
        : undefined;

    return {
      _id: String(row._id),
      stepId: String(row.stepId),
      toolId: tool ? String(tool._id) : String(row.toolId),
      sortOrder: Number(row.sortOrder ?? 0),
      config: (row.config || {}) as Record<string, unknown>,
      isActive: Boolean(row.isActive ?? true),
      tool: tool
        ? {
            _id: String(tool._id),
            code: tool.code,
            name: tool.name,
            platform: tool.platform,
            handlerKey: tool.handlerKey,
            guardScript: tool.guardScript || '',
            placement: tool.placement,
            sortOrder: tool.sortOrder,
            defaultConfig: tool.defaultConfig || {},
            uiConfig: tool.uiConfig || {},
            isActive: tool.isActive,
          }
        : undefined,
    };
  }

  private async normalizePayload(dto: CreateStepToolDto | UpdateStepToolDto, partial: boolean) {
    const patch: Partial<StepTool> = {};

    if ('stepId' in dto && dto.stepId !== undefined) {
      patch.stepId = this.normalizeStepId(dto.stepId);
    } else if (!partial) {
      throw new BadRequestException('stepId is required.');
    }

    if ('toolId' in dto && dto.toolId !== undefined) {
      patch.toolId = await this.normalizeToolId(dto.toolId);
    } else if (!partial) {
      throw new BadRequestException('toolId is required.');
    }

    if ('sortOrder' in dto && dto.sortOrder !== undefined) {
      patch.sortOrder = Number(dto.sortOrder);
    } else if (!partial) {
      patch.sortOrder = 0;
    }

    if ('config' in dto && dto.config !== undefined) {
      patch.config = dto.config;
    } else if (!partial) {
      patch.config = {};
    }

    if ('isActive' in dto && dto.isActive !== undefined) {
      patch.isActive = Boolean(dto.isActive);
    } else if (!partial) {
      patch.isActive = true;
    }

    if (!partial) {
      const step = await this.stepModel.findById(patch.stepId).lean();
      if (!step) {
        throw new NotFoundException('Step not found.');
      }
    }

    return patch;
  }

  private normalizeStepId(stepId: string) {
    this.assertObjectId(stepId, 'Invalid step id.');
    return new Types.ObjectId(stepId);
  }

  private async normalizeToolId(toolId: string) {
    this.assertObjectId(toolId, 'Invalid tool id.');
    const found = await this.toolModel.findById(toolId).lean();
    if (!found) {
      throw new NotFoundException('Tool not found.');
    }
    if (!found.isActive) {
      throw new BadRequestException('Tool is inactive.');
    }
    return new Types.ObjectId(toolId);
  }

  private assertObjectId(id: string, message: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(message);
    }
  }

  private isDuplicateKeyError(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000;
  }
}
