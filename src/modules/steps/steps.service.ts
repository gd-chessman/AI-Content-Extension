import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateStepDto, UpdateStepDto } from './steps.dto';
import { Step, StepActionType, StepDocument } from './step.schema';

@Injectable()
export class StepsService {
  constructor(
    @InjectModel(Step.name)
    private readonly stepModel: Model<StepDocument>,
  ) {}

  async list(workflowId?: string) {
    const filter: { workflowId?: Types.ObjectId } = {};
    if (workflowId !== undefined) {
      filter.workflowId = this.normalizeWorkflowId(workflowId);
    }
    return this.stepModel.find(filter).sort({ workflowId: 1, stepNo: 1 }).lean();
  }

  async getById(id: string) {
    this.assertObjectId(id, 'Invalid step id.');
    const found = await this.stepModel.findById(id).lean();
    if (!found) {
      throw new NotFoundException('Step not found.');
    }
    return found;
  }

  async create(dto: CreateStepDto) {
    const payload = this.normalizePayload(dto, false);
    try {
      const created = await this.stepModel.create(payload);
      return created.toObject();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException('Step number already exists in this workflow.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateStepDto) {
    this.assertObjectId(id, 'Invalid step id.');
    const patch = this.normalizePayload(dto, true);
    if (!Object.keys(patch).length) {
      throw new BadRequestException('Nothing to update.');
    }

    try {
      const updated = await this.stepModel.findByIdAndUpdate(id, patch, { new: true });
      if (!updated) {
        throw new NotFoundException('Step not found.');
      }
      return updated.toObject();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException('Step number already exists in this workflow.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    this.assertObjectId(id, 'Invalid step id.');
    const deleted = await this.stepModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('Step not found.');
    }
    return { message: 'Deleted successfully.' };
  }

  private normalizePayload(
    dto: CreateStepDto | UpdateStepDto,
    partial: boolean,
  ): {
    workflowId?: Types.ObjectId;
    stepNo?: number;
    title?: string;
    instruction?: string;
    prompt?: string;
    actionType?: StepActionType;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    isActive?: boolean;
  } {
    const patch: {
      workflowId?: Types.ObjectId;
      stepNo?: number;
      title?: string;
      instruction?: string;
      prompt?: string;
      actionType?: StepActionType;
      inputSchema?: Record<string, unknown>;
      outputSchema?: Record<string, unknown>;
      isActive?: boolean;
    } = {};

    if ('workflowId' in dto && dto.workflowId !== undefined) {
      patch.workflowId = this.normalizeWorkflowId(dto.workflowId);
    } else if (!partial) {
      throw new BadRequestException('workflowId is required.');
    }

    if ('stepNo' in dto && dto.stepNo !== undefined) {
      patch.stepNo = this.normalizeStepNo(dto.stepNo);
    } else if (!partial) {
      throw new BadRequestException('stepNo is required.');
    }

    if ('title' in dto && dto.title !== undefined) {
      const value = (dto.title || '').trim();
      if (!value) throw new BadRequestException('title cannot be empty.');
      patch.title = value;
    } else if (!partial) {
      throw new BadRequestException('title is required.');
    }

    if ('instruction' in dto && dto.instruction !== undefined) {
      const value = (dto.instruction || '').trim();
      if (!value) throw new BadRequestException('instruction cannot be empty.');
      patch.instruction = value;
    } else if (!partial) {
      throw new BadRequestException('instruction is required.');
    }

    if ('prompt' in dto && dto.prompt !== undefined) {
      patch.prompt = (dto.prompt || '').trim();
    } else if (!partial) {
      patch.prompt = '';
    }

    if ('actionType' in dto && dto.actionType !== undefined) {
      patch.actionType = this.normalizeActionType(dto.actionType);
    } else if (!partial) {
      patch.actionType = StepActionType.CUSTOM;
    }

    if ('inputSchema' in dto && dto.inputSchema !== undefined) {
      patch.inputSchema = dto.inputSchema || {};
    } else if (!partial) {
      patch.inputSchema = {};
    }

    if ('outputSchema' in dto && dto.outputSchema !== undefined) {
      patch.outputSchema = dto.outputSchema || {};
    } else if (!partial) {
      patch.outputSchema = {};
    }

    if ('isActive' in dto && dto.isActive !== undefined) {
      patch.isActive = Boolean(dto.isActive);
    } else if (!partial) {
      patch.isActive = true;
    }

    return patch;
  }

  private normalizeWorkflowId(workflowId: string) {
    const value = (workflowId || '').trim();
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Invalid workflow id.');
    }
    return new Types.ObjectId(value);
  }

  private normalizeStepNo(stepNo: number) {
    if (!Number.isFinite(stepNo) || stepNo < 1) {
      throw new BadRequestException('stepNo must be a positive number.');
    }
    return Math.floor(stepNo);
  }

  private normalizeActionType(actionType: StepActionType) {
    if (!Object.values(StepActionType).includes(actionType)) {
      throw new BadRequestException('Invalid actionType.');
    }
    return actionType;
  }

  private assertObjectId(value: string, message: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(message);
    }
  }
}
