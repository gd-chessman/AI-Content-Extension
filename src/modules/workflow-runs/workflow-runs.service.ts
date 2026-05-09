import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WorkflowRunsEvents } from './workflow-runs.events';
import { CreateWorkflowRunDto, UpdateWorkflowRunDto } from './workflow-runs.dto';
import { WorkflowRun, WorkflowRunDocument, WorkflowRunStatus } from './workflow-run.schema';

@Injectable()
export class WorkflowRunsService {
  constructor(
    @InjectModel(WorkflowRun.name)
    private readonly workflowRunModel: Model<WorkflowRunDocument>,
    private readonly workflowRunsEvents: WorkflowRunsEvents,
  ) {}

  async listForUser(userId: string, workflowId?: string) {
    const filter: { userId: Types.ObjectId; workflowId?: Types.ObjectId } = {
      userId: this.normalizeObjectId(userId, 'Invalid user id.'),
    };
    if (workflowId !== undefined) {
      filter.workflowId = this.normalizeObjectId(workflowId, 'Invalid workflow id.');
    }
    return this.workflowRunModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async getForUser(id: string, userId: string) {
    const found = await this.workflowRunModel.findOne({
      _id: this.normalizeObjectId(id, 'Invalid workflow run id.'),
      userId: this.normalizeObjectId(userId, 'Invalid user id.'),
    });
    if (!found) {
      throw new NotFoundException('Workflow run not found.');
    }
    return found.toObject();
  }

  async createForUser(userId: string, dto: CreateWorkflowRunDto) {
    const workflowId = this.normalizeObjectId(dto.workflowId, 'Invalid workflow id.');
    const payload = dto.payload || {};
    const attempt = this.normalizeAttempt(dto.attempt);

    const created = await this.workflowRunModel.create({
      workflowId,
      userId: this.normalizeObjectId(userId, 'Invalid user id.'),
      payload,
      attempt,
      status: WorkflowRunStatus.RUNNING,
      progress: 0,
      currentStepNo: 0,
      startedAt: new Date(),
      finishedAt: null,
      result: {},
      error: {},
    });
    const out = created.toObject();
    this.workflowRunsEvents.publish({
      type: 'workflow_run_created',
      userId: userId.trim(),
      run: out as unknown as Record<string, unknown>,
    });
    return out;
  }

  async updateForUser(id: string, userId: string, dto: UpdateWorkflowRunDto) {
    const patch = this.normalizePatch(dto);
    if (!Object.keys(patch).length) {
      throw new BadRequestException('Nothing to update.');
    }

    const updated = await this.workflowRunModel.findOneAndUpdate(
      {
        _id: this.normalizeObjectId(id, 'Invalid workflow run id.'),
        userId: this.normalizeObjectId(userId, 'Invalid user id.'),
      },
      patch,
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('Workflow run not found.');
    }
    const out = updated.toObject();
    this.workflowRunsEvents.publish({
      type: 'workflow_run_updated',
      userId: userId.trim(),
      run: out as unknown as Record<string, unknown>,
    });
    return out;
  }

  private normalizePatch(dto: UpdateWorkflowRunDto): {
    status?: WorkflowRunStatus;
    progress?: number;
    currentStepNo?: number;
    result?: Record<string, unknown>;
    error?: {
      code?: string;
      message?: string;
      details?: Record<string, unknown>;
    };
    startedAt?: Date | null;
    finishedAt?: Date | null;
  } {
    const patch: {
      status?: WorkflowRunStatus;
      progress?: number;
      currentStepNo?: number;
      result?: Record<string, unknown>;
      error?: {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
      };
      startedAt?: Date | null;
      finishedAt?: Date | null;
    } = {};

    if (dto.status !== undefined) {
      patch.status = this.normalizeStatus(dto.status);
    }
    if (dto.progress !== undefined) {
      patch.progress = this.normalizeProgress(dto.progress);
    }
    if (dto.currentStepNo !== undefined) {
      patch.currentStepNo = this.normalizeStepNo(dto.currentStepNo);
    }
    if (dto.result !== undefined) {
      patch.result = dto.result || {};
    }
    if (dto.error !== undefined) {
      patch.error = {
        code: (dto.error?.code || '').trim(),
        message: (dto.error?.message || '').trim(),
        details: dto.error?.details || {},
      };
    }
    if (dto.startedAt !== undefined) {
      patch.startedAt = this.normalizeDate(dto.startedAt, 'Invalid startedAt.');
    }
    if (dto.finishedAt !== undefined) {
      patch.finishedAt = this.normalizeDate(dto.finishedAt, 'Invalid finishedAt.');
    }

    return patch;
  }

  private normalizeObjectId(value: string, message: string) {
    const raw = (value || '').trim();
    if (!Types.ObjectId.isValid(raw)) {
      throw new BadRequestException(message);
    }
    return new Types.ObjectId(raw);
  }

  private normalizeStatus(value: WorkflowRunStatus) {
    if (!Object.values(WorkflowRunStatus).includes(value)) {
      throw new BadRequestException('Invalid workflow run status.');
    }
    return value;
  }

  private normalizeProgress(value: number) {
    if (!Number.isFinite(value)) {
      throw new BadRequestException('progress must be a number.');
    }
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private normalizeStepNo(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException('currentStepNo must be >= 0.');
    }
    return Math.floor(value);
  }

  private normalizeAttempt(value?: number) {
    if (value === undefined) return 0;
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException('attempt must be >= 0.');
    }
    return Math.floor(value);
  }

  private normalizeDate(value: string | Date | null, message: string) {
    if (value === null) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(message);
    }
    return date;
  }
}
