import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StepToolsService } from '../step-tools/step-tools.service';
import { Step, StepDocument } from '../steps/step.schema';
import { GROK_WORKFLOW_SEED, GROK_WORKFLOW_SEED_NAME } from '../../shared/workflows/grok-workflow.seed';
import { CreateWorkflowDto, UpdateWorkflowDto } from './workflows.dto';
import {
  WorkflowCategory,
  Workflow,
  WorkflowDocument,
  WorkflowPlatform,
  WorkflowStatus,
} from './workflow.schema';

@Injectable()
export class WorkflowsService implements OnModuleInit {
  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(Step.name)
    private readonly stepModel: Model<StepDocument>,
    private readonly stepToolsService: StepToolsService,
  ) {}

  async onModuleInit() {
    try {
      await this.seedGrokWorkflow();
    } catch (error) {
      console.warn('[WorkflowsService] Grok workflow seed skipped:', error);
    }
  }

  /** Idempotent — tạo/cập nhật workflow Grok mặc định + 2 bước extension. */
  async seedGrokWorkflow() {
    let workflow = await this.workflowModel
      .findOne({ platform: WorkflowPlatform.GROK, name: GROK_WORKFLOW_SEED_NAME })
      .sort({ createdAt: 1 });

    if (!workflow) {
      workflow = await this.workflowModel.create({
        name: GROK_WORKFLOW_SEED.name,
        description: GROK_WORKFLOW_SEED.description,
        version: GROK_WORKFLOW_SEED.version,
        status: GROK_WORKFLOW_SEED.status,
        platform: GROK_WORKFLOW_SEED.platform,
        category: GROK_WORKFLOW_SEED.category,
      });
    } else {
      await this.workflowModel.updateOne(
        { _id: workflow._id },
        {
          $set: {
            description: GROK_WORKFLOW_SEED.description,
            status: WorkflowStatus.ACTIVE,
            category: GROK_WORKFLOW_SEED.category,
            version: GROK_WORKFLOW_SEED.version,
          },
        },
      );
    }

    const workflowId = workflow._id as Types.ObjectId;
    let stepsCreated = 0;
    let stepsUpdated = 0;

    for (const seedStep of GROK_WORKFLOW_SEED.steps) {
      const existing = await this.stepModel.findOne({ workflowId, stepNo: seedStep.stepNo });
      const payload = {
        workflowId,
        stepNo: seedStep.stepNo,
        title: seedStep.title,
        instruction: seedStep.instruction,
        prompt: seedStep.prompt || '',
        actionType: seedStep.actionType,
        displayMode: seedStep.displayMode,
        inputSchema: seedStep.inputSchema || {},
        outputSchema: {},
        isActive: true,
      };

      if (!existing) {
        await this.stepModel.create(payload);
        stepsCreated += 1;
      } else {
        await this.stepModel.updateOne({ _id: existing._id }, { $set: payload });
        stepsUpdated += 1;
      }
    }

    const steps = await this.stepModel.find({ workflowId }).sort({ stepNo: 1 }).lean();

    return {
      workflow: (await this.workflowModel.findById(workflowId).lean()) || workflow.toObject(),
      steps,
      stepsCreated,
      stepsUpdated,
    };
  }

  async list() {
    return this.workflowModel.find().sort({ createdAt: -1 }).lean();
  }

  async getById(id: string) {
    this.assertObjectId(id, 'Invalid workflow id.');
    const found = await this.workflowModel.findById(id).lean();
    if (!found) {
      throw new NotFoundException('Workflow not found.');
    }
    return found;
  }

  async listForUser(platform?: WorkflowPlatform) {
    const filter: { status: WorkflowStatus; platform?: WorkflowPlatform } = {
      status: WorkflowStatus.ACTIVE,
    };
    if (platform !== undefined) {
      filter.platform = this.normalizePlatform(platform);
    }
    return this.workflowModel
      .find(filter)
      .sort({ createdAt: 1 })
      .lean();
  }

  async getDetailForUser(id: string) {
    this.assertObjectId(id, 'Invalid workflow id.');
    const workflow = await this.workflowModel
      .findOne({ _id: id, status: WorkflowStatus.ACTIVE })
      .lean();
    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }

    const steps = await this.stepModel
      .find({ workflowId: workflow._id, isActive: true })
      .sort({ stepNo: 1 })
      .lean();

    return {
      ...workflow,
      steps,
    };
  }

  async getToolsForUser(id: string) {
    this.assertObjectId(id, 'Invalid workflow id.');
    const workflow = await this.workflowModel
      .findOne({ _id: id, status: WorkflowStatus.ACTIVE })
      .lean();
    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }

    const steps = await this.stepToolsService.listByWorkflowId(id, true);

    return {
      workflowId: String(workflow._id),
      steps,
    };
  }

  async create(dto: CreateWorkflowDto) {
    const name = (dto.name || '').trim();
    if (!name) {
      throw new BadRequestException('Workflow name is required.');
    }

    const created = await this.workflowModel.create({
      name,
      description: (dto.description || '').trim(),
      version: this.normalizeVersion(dto.version),
      status: this.normalizeStatus(dto.status),
      platform: this.normalizePlatform(dto.platform),
      category: this.normalizeCategory(dto.category),
      ownerUserId: this.normalizeOwnerUserId(dto.ownerUserId),
    });

    return created.toObject();
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    this.assertObjectId(id, 'Invalid workflow id.');
    const patch: {
      name?: string;
      description?: string;
      version?: number;
      status?: WorkflowStatus;
      platform?: WorkflowPlatform;
      category?: WorkflowCategory;
      ownerUserId?: Types.ObjectId | undefined;
    } = {};

    if (dto.name !== undefined) {
      const value = (dto.name || '').trim();
      if (!value) throw new BadRequestException('Workflow name cannot be empty.');
      patch.name = value;
    }
    if (dto.description !== undefined) patch.description = (dto.description || '').trim();
    if (dto.version !== undefined) patch.version = this.normalizeVersion(dto.version);
    if (dto.status !== undefined) patch.status = this.normalizeStatus(dto.status);
    if (dto.platform !== undefined) patch.platform = this.normalizePlatform(dto.platform);
    if (dto.category !== undefined) patch.category = this.normalizeCategory(dto.category);
    if (dto.ownerUserId !== undefined) patch.ownerUserId = this.normalizeOwnerUserId(dto.ownerUserId);

    if (!Object.keys(patch).length) {
      throw new BadRequestException('Nothing to update.');
    }

    const updated = await this.workflowModel.findByIdAndUpdate(id, patch, { new: true });
    if (!updated) {
      throw new NotFoundException('Workflow not found.');
    }
    return updated.toObject();
  }

  async remove(id: string) {
    this.assertObjectId(id, 'Invalid workflow id.');
    const deleted = await this.workflowModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('Workflow not found.');
    }
    return { message: 'Deleted successfully.' };
  }

  private normalizeVersion(value?: number) {
    if (value === undefined || value === null) return 1;
    if (!Number.isFinite(value) || value < 1) {
      throw new BadRequestException('Version must be a positive number.');
    }
    return Math.floor(value);
  }

  private normalizeStatus(value?: WorkflowStatus) {
    if (!value) return WorkflowStatus.DRAFT;
    if (!Object.values(WorkflowStatus).includes(value)) {
      throw new BadRequestException('Invalid workflow status.');
    }
    return value;
  }

  private normalizePlatform(value?: WorkflowPlatform) {
    if (!value) return WorkflowPlatform.MULTI;
    if (!Object.values(WorkflowPlatform).includes(value)) {
      throw new BadRequestException('Invalid workflow platform.');
    }
    return value;
  }

  private normalizeCategory(value?: WorkflowCategory) {
    if (!value) return WorkflowCategory.OTHER;
    if (!Object.values(WorkflowCategory).includes(value)) {
      throw new BadRequestException('Invalid workflow category.');
    }
    return value;
  }

  private normalizeOwnerUserId(value?: string) {
    const normalized = (value || '').trim();
    if (!normalized) return undefined;
    if (!Types.ObjectId.isValid(normalized)) {
      throw new BadRequestException('Invalid owner user id.');
    }
    return new Types.ObjectId(normalized);
  }

  private assertObjectId(value: string, message: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(message);
    }
  }
}
