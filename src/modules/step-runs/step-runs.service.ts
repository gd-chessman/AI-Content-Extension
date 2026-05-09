import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateStepRunDto, UpdateStepRunDto } from './step-runs.dto';
import { StepRun, StepRunDocument, StepRunStatus } from './step-run.schema';

@Injectable()
export class StepRunsService {
  constructor(
    @InjectModel(StepRun.name)
    private readonly stepRunModel: Model<StepRunDocument>,
  ) {}

  async listForUser(userId: string, workflowRunId?: string) {
    const filter: { userId: Types.ObjectId; workflowRunId?: Types.ObjectId } = {
      userId: this.normalizeObjectId(userId, 'Invalid user id.'),
    };
    if (workflowRunId !== undefined) {
      filter.workflowRunId = this.normalizeObjectId(workflowRunId, 'Invalid workflow run id.');
    }
    return this.stepRunModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async createForUser(userId: string, dto: CreateStepRunDto) {
    const payload = this.normalizeCreatePayload(userId, dto);
    try {
      const created = await this.stepRunModel.create(payload);
      return created.toObject();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException('Step run for this stepNo already exists in workflow run.');
      }
      throw error;
    }
  }

  async updateForUser(id: string, userId: string, dto: UpdateStepRunDto) {
    const patch = this.normalizeUpdatePayload(dto);
    if (!Object.keys(patch).length) {
      throw new BadRequestException('Nothing to update.');
    }

    const updated = await this.stepRunModel.findOneAndUpdate(
      {
        _id: this.normalizeObjectId(id, 'Invalid step run id.'),
        userId: this.normalizeObjectId(userId, 'Invalid user id.'),
      },
      patch,
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('Step run not found.');
    }
    return updated.toObject();
  }

  private normalizeCreatePayload(userId: string, dto: CreateStepRunDto): {
    workflowRunId: Types.ObjectId;
    workflowId: Types.ObjectId;
    stepId: Types.ObjectId;
    userId: Types.ObjectId;
    stepNo: number;
    stepTitle: string;
    status: StepRunStatus;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    error: { message?: string; details?: Record<string, unknown> };
    startedAt: Date | null;
    finishedAt: Date | null;
  } {
    const stepTitle = (dto.stepTitle || '').trim();
    if (!stepTitle) {
      throw new BadRequestException('stepTitle cannot be empty.');
    }
    return {
      workflowRunId: this.normalizeObjectId(dto.workflowRunId, 'Invalid workflow run id.'),
      workflowId: this.normalizeObjectId(dto.workflowId, 'Invalid workflow id.'),
      stepId: this.normalizeObjectId(dto.stepId, 'Invalid step id.'),
      userId: this.normalizeObjectId(userId, 'Invalid user id.'),
      stepNo: this.normalizeStepNo(dto.stepNo),
      stepTitle,
      status: dto.status ? this.normalizeStatus(dto.status) : StepRunStatus.RUNNING,
      input: dto.input || {},
      output: {},
      error: {},
      startedAt: dto.startedAt === undefined ? new Date() : this.normalizeDate(dto.startedAt, 'Invalid startedAt.'),
      finishedAt: null,
    };
  }

  private normalizeUpdatePayload(dto: UpdateStepRunDto): {
    status?: StepRunStatus;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: {
      message?: string;
      details?: Record<string, unknown>;
    };
    startedAt?: Date | null;
    finishedAt?: Date | null;
  } {
    const patch: {
      status?: StepRunStatus;
      input?: Record<string, unknown>;
      output?: Record<string, unknown>;
      error?: {
        message?: string;
        details?: Record<string, unknown>;
      };
      startedAt?: Date | null;
      finishedAt?: Date | null;
    } = {};

    if (dto.status !== undefined) {
      patch.status = this.normalizeStatus(dto.status);
    }
    if (dto.input !== undefined) {
      patch.input = dto.input || {};
    }
    if (dto.output !== undefined) {
      patch.output = dto.output || {};
    }
    if (dto.error !== undefined) {
      patch.error = {
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

  private normalizeStepNo(value: number) {
    if (!Number.isFinite(value) || value < 1) {
      throw new BadRequestException('stepNo must be a positive number.');
    }
    return Math.floor(value);
  }

  private normalizeStatus(value: StepRunStatus) {
    if (!Object.values(StepRunStatus).includes(value)) {
      throw new BadRequestException('Invalid step run status.');
    }
    return value;
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
