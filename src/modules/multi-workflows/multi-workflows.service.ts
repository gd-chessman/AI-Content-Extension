import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StorySource, StorySourceDocument } from '../stories/story-source.schema';
import { WorkflowRunsService } from '../workflow-runs/workflow-runs.service';
import { ExtensionPresenceService } from '../workflow-runs/extension-presence.service';
import { WorkflowRunStatus } from '../workflow-runs/workflow-run.schema';
import {
  Workflow,
  WorkflowDocument,
  WorkflowPlatform,
  WorkflowStatus,
} from '../workflows/workflow.schema';
import {
  MultiWorkflow,
  MultiWorkflowDocument,
  MultiWorkflowItem,
} from './multi-workflow.schema';
import {
  MultiWorkflowJob,
  MultiWorkflowJobDocument,
  MultiWorkflowJobStatus,
} from './multi-workflow-job.schema';
import {
  MultiWorkflowRun,
  MultiWorkflowRunDocument,
  MultiWorkflowRunItemStatus,
  MultiWorkflowRunStatus,
} from './multi-workflow-run.schema';
import {
  ClaimMultiWorkflowJobDto,
  CompleteMultiWorkflowJobDto,
  CreateMultiWorkflowDto,
  CreateMultiWorkflowRunDto,
  FailMultiWorkflowJobDto,
  ListMultiWorkflowJobsQueryDto,
  ListMultiWorkflowRunsQueryDto,
  MultiWorkflowItemDto,
  UpdateMultiWorkflowDto,
} from './multi-workflows.dto';

@Injectable()
export class MultiWorkflowsService implements OnModuleInit {
  constructor(
    @InjectModel(MultiWorkflow.name)
    private readonly multiWorkflowModel: Model<MultiWorkflowDocument>,
    @InjectModel(MultiWorkflowRun.name)
    private readonly multiWorkflowRunModel: Model<MultiWorkflowRunDocument>,
    @InjectModel(MultiWorkflowJob.name)
    private readonly multiWorkflowJobModel: Model<MultiWorkflowJobDocument>,
    @InjectModel(StorySource.name)
    private readonly storySourceModel: Model<StorySourceDocument>,
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    private readonly workflowRunsService: WorkflowRunsService,
    private readonly extensionPresence: ExtensionPresenceService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.extensionPresence.connected$.subscribe((event) => {
      if (!event.online) return;
      void this.resumePendingRunsForUser(event.userId);
    });
  }

  async getDefaultForUser(userId: string) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    await this.ensureDefaultExists(userOid);
    const config = await this.multiWorkflowModel
      .findOne({ userId: userOid, isDefault: true })
      .lean();
    if (!config) throw new NotFoundException('Multi workflow not found.');
    return config;
  }

  async listForUser(userId: string) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    await this.ensureDefaultExists(userOid);
    return this.multiWorkflowModel
      .find({ userId: userOid })
      .sort({ isDefault: -1, updatedAt: -1 })
      .lean();
  }

  async getByIdForUser(userId: string, configId: string) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const configOid = this.normalizeObjectId(configId, 'Invalid multi workflow id.');
    const config = await this.multiWorkflowModel.findOne({ _id: configOid, userId: userOid }).lean();
    if (!config) throw new NotFoundException('Multi workflow not found.');
    return config;
  }

  async createForUser(userId: string, dto: CreateMultiWorkflowDto) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('Multi workflow name cannot be empty.');

    const existingCount = await this.multiWorkflowModel.countDocuments({ userId: userOid });
    const isDefault = existingCount === 0;

    let items: MultiWorkflowItem[] = [];
    if (dto.items !== undefined) {
      if (!dto.items.length) {
        throw new BadRequestException('Multi workflow items cannot be empty.');
      }
      items = await this.normalizeItems(dto.items);
    } else if (dto.cloneFromMultiWorkflowId) {
      const source = await this.multiWorkflowModel.findOne({
        _id: this.normalizeObjectId(dto.cloneFromMultiWorkflowId, 'Invalid cloneFromMultiWorkflowId.'),
        userId: userOid,
      });
      if (!source) throw new NotFoundException('Source multi workflow not found.');
      items = source.items.map((item) => ({
        order: item.order,
        workflowId: item.workflowId,
        platform: item.platform,
        enabled: item.enabled,
      }));
    } else if (isDefault) {
      const seeded = await this.buildDefaultItems();
      items = seeded;
    }

    const created = await this.multiWorkflowModel.create({
      userId: userOid,
      name,
      isDefault,
      items,
    });
    return created.toObject();
  }

  async updateDefaultForUser(userId: string, dto: UpdateMultiWorkflowDto) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    await this.ensureDefaultExists(userOid);
    const config = await this.multiWorkflowModel.findOne({ userId: userOid, isDefault: true });
    if (!config) throw new NotFoundException('Multi workflow not found.');
    return this.updateByIdForUser(userId, String(config._id), dto);
  }

  async updateByIdForUser(userId: string, configId: string, dto: UpdateMultiWorkflowDto) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const configOid = this.normalizeObjectId(configId, 'Invalid multi workflow id.');
    const config = await this.multiWorkflowModel.findOne({ _id: configOid, userId: userOid });
    if (!config) throw new NotFoundException('Multi workflow not found.');

    const patch: { name?: string; items?: MultiWorkflowItem[] } = {};
    if (dto.name !== undefined) {
      const name = (dto.name || '').trim();
      if (!name) throw new BadRequestException('Multi workflow name cannot be empty.');
      patch.name = name;
    }
    if (dto.items !== undefined) {
      patch.items = await this.normalizeItems(dto.items);
    }

    if (!Object.keys(patch).length) {
      throw new BadRequestException('Nothing to update.');
    }

    Object.assign(config, patch);
    await config.save();
    return config.toObject();
  }

  async deleteForUser(userId: string, configId: string) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const configOid = this.normalizeObjectId(configId, 'Invalid multi workflow id.');
    const config = await this.multiWorkflowModel.findOne({ _id: configOid, userId: userOid });
    if (!config) throw new NotFoundException('Multi workflow not found.');

    const total = await this.multiWorkflowModel.countDocuments({ userId: userOid });
    if (total <= 1) {
      throw new BadRequestException('Cannot delete the only multi workflow.');
    }

    if (config.isDefault) {
      const nextDefault = await this.multiWorkflowModel
        .findOne({ userId: userOid, _id: { $ne: configOid } })
        .sort({ updatedAt: -1 });
      if (nextDefault) {
        nextDefault.isDefault = true;
        await nextDefault.save();
      }
    }

    await this.multiWorkflowModel.deleteOne({ _id: configOid, userId: userOid });
    return { deleted: true, id: configId };
  }

  async setDefaultForUser(userId: string, configId: string) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const configOid = this.normalizeObjectId(configId, 'Invalid multi workflow id.');
    const config = await this.multiWorkflowModel.findOne({ _id: configOid, userId: userOid });
    if (!config) throw new NotFoundException('Multi workflow not found.');

    await this.multiWorkflowModel.updateMany({ userId: userOid }, { $set: { isDefault: false } });
    config.isDefault = true;
    await config.save();
    return config.toObject();
  }

  async listRunsForUser(userId: string, query: ListMultiWorkflowRunsQueryDto) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const filter: { userId: Types.ObjectId; status?: MultiWorkflowRunStatus } = { userId: userOid };
    if (query.status) {
      filter.status = this.normalizeRunStatus(query.status);
    }
    const limit = this.normalizeLimit(query.limit, 50);
    return this.multiWorkflowRunModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  }

  async getRunForUser(userId: string, runId: string) {
    const found = await this.multiWorkflowRunModel.findOne({
      _id: this.normalizeObjectId(runId, 'Invalid multi workflow run id.'),
      userId: this.normalizeObjectId(userId, 'Invalid user id.'),
    });
    if (!found) throw new NotFoundException('Multi workflow run not found.');
    return found.toObject();
  }

  async cancelRunForUser(userId: string, runId: string) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const runOid = this.normalizeObjectId(runId, 'Invalid multi workflow run id.');
    const run = await this.multiWorkflowRunModel.findOne({ _id: runOid, userId: userOid });
    if (!run) throw new NotFoundException('Multi workflow run not found.');

    if (
      run.status === MultiWorkflowRunStatus.COMPLETED ||
      run.status === MultiWorkflowRunStatus.FAILED ||
      run.status === MultiWorkflowRunStatus.CANCELLED
    ) {
      throw new BadRequestException('Multi workflow run is not active.');
    }

    const now = new Date();
    const activeJobs = await this.multiWorkflowJobModel.find({
      multiWorkflowRunId: run._id,
      status: { $in: [MultiWorkflowJobStatus.PENDING, MultiWorkflowJobStatus.PROCESSING] },
    });

    for (const job of activeJobs) {
      if (job.workflowRunId) {
        try {
          await this.workflowRunsService.updateForUser(String(job.workflowRunId), userId, {
            status: WorkflowRunStatus.CANCELLED,
            finishedAt: now.toISOString(),
          });
        } catch {
          /* workflow run có thể đã kết thúc */
        }
      }
      job.status = MultiWorkflowJobStatus.CANCELLED;
      job.finishedAt = now;
      job.lockedAt = null;
      job.lockedBy = '';
      job.lockExpiresAt = null;
      job.lastError = {
        code: 'cancelled',
        message: 'Run cancelled by user.',
        details: {},
      };
      await job.save();
      await this.syncRunItemFromJob(
        job,
        job.attempts > 0 ? MultiWorkflowRunItemStatus.FAILED : MultiWorkflowRunItemStatus.SKIPPED,
      );
    }

    run.items = run.items.map((item) => {
      if (item.status === MultiWorkflowRunItemStatus.PENDING) {
        return { ...item, status: MultiWorkflowRunItemStatus.SKIPPED };
      }
      if (item.status === MultiWorkflowRunItemStatus.RUNNING) {
        return { ...item, status: MultiWorkflowRunItemStatus.FAILED };
      }
      return item;
    });
    run.status = MultiWorkflowRunStatus.CANCELLED;
    run.finishedAt = now;
    await run.save();
    return run.toObject();
  }

  async createRunForUser(userId: string, dto: CreateMultiWorkflowRunDto) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');

    const config = await this.resolveMultiWorkflow(userOid, dto.multiWorkflowId);

    const storySourceIdRaw = (dto.storySourceId || '').trim();
    let storySourceId: Types.ObjectId | null = null;
    let multiWorkflowKey = `config:${String(config._id)}`;

    if (storySourceIdRaw) {
      storySourceId = this.normalizeObjectId(storySourceIdRaw, 'Invalid storySourceId.');
      const source = await this.storySourceModel.findOne({ _id: storySourceId, userId: userOid });
      if (!source) {
        throw new NotFoundException('StorySource not found.');
      }
      multiWorkflowKey = String(storySourceId);
    }

    const activeRun = await this.multiWorkflowRunModel.findOne({
      userId: userOid,
      multiWorkflowKey,
      status: { $in: [MultiWorkflowRunStatus.QUEUED, MultiWorkflowRunStatus.RUNNING] },
    });
    if (activeRun) {
      throw new ConflictException(
        storySourceId
          ? 'Multi workflow run already in progress for this story source.'
          : 'Multi workflow run already in progress for this configuration.',
      );
    }
    const enabledItems = [...config.items]
      .filter((item) => item.enabled)
      .sort((a, b) => a.order - b.order);
    if (!enabledItems.length) {
      throw new BadRequestException('Multi workflow has no enabled workflows.');
    }

    const runItems = config.items
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        order: item.order,
        workflowId: item.workflowId,
        platform: item.platform,
        enabled: item.enabled,
        status: item.enabled ? MultiWorkflowRunItemStatus.PENDING : MultiWorkflowRunItemStatus.SKIPPED,
        multiWorkflowJobId: null,
        workflowRunId: null,
      }));

    const trigger = (dto.trigger || 'manual').trim() || 'manual';
    if (trigger === 'web_console' && !this.extensionPresence.isOnline(userId)) {
      throw new ServiceUnavailableException(
        'Extension Chrome chưa mở hoặc chưa đăng nhập. Mở extension (tab Facebook/ChatGPT/Grok) rồi thử lại.',
      );
    }

    const run = await this.multiWorkflowRunModel.create({
      userId: userOid,
      multiWorkflowId: config._id,
      multiWorkflowKey,
      storySourceId,
      storyId: null,
      status: MultiWorkflowRunStatus.QUEUED,
      currentOrder: 0,
      items: runItems,
      payload: {
        ...(dto.payload || {}),
        trigger,
      },
      startedAt: null,
      finishedAt: null,
    });

    const basePayload = {
      source: 'multi_workflow',
      multiWorkflowRunId: String(run._id),
      trigger,
      ...(storySourceId ? { storySourceId: String(storySourceId) } : {}),
      ...(dto.payload || {}),
    };

    for (const item of enabledItems) {
      await this.multiWorkflowJobModel.create({
        userId: userOid,
        multiWorkflowRunId: run._id,
        multiWorkflowKey,
        workflowId: item.workflowId,
        platform: item.platform,
        order: item.order,
        status: MultiWorkflowJobStatus.PENDING,
        attempts: 0,
        maxAttempts: this.getMaxAttempts(),
        workflowRunId: null,
        payload: { ...basePayload, platform: item.platform },
        result: {},
        lastError: {},
        lockedAt: null,
        lockedBy: '',
        lockExpiresAt: null,
        nextRetryAt: null,
        startedAt: null,
        finishedAt: null,
      });
    }

    if (this.extensionPresence.isOnline(userId)) {
      await this.dispatchNext(String(run._id), userId);
    }
    const refreshed = await this.multiWorkflowRunModel.findById(run._id);
    return refreshed?.toObject();
  }

  async resumePendingRunsForUser(userId: string) {
    if (!this.extensionPresence.isOnline(userId)) return;

    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const now = new Date();
    const runs = await this.multiWorkflowRunModel
      .find({
        userId: userOid,
        status: { $in: [MultiWorkflowRunStatus.QUEUED, MultiWorkflowRunStatus.RUNNING] },
      })
      .sort({ createdAt: 1 })
      .lean();

    for (const run of runs) {
      const hasPendingJob = await this.multiWorkflowJobModel.exists({
        multiWorkflowRunId: run._id,
        status: MultiWorkflowJobStatus.PENDING,
        $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }],
      });
      if (!hasPendingJob) continue;
      await this.dispatchNext(String(run._id), userId);
    }
  }

  async listJobsForUser(userId: string, query: ListMultiWorkflowJobsQueryDto) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const filter: {
      userId: Types.ObjectId;
      platform?: WorkflowPlatform;
      status?: MultiWorkflowJobStatus;
      multiWorkflowRunId?: Types.ObjectId;
    } = { userId: userOid };

    if (query.platform) filter.platform = this.normalizePlatform(query.platform);
    if (query.status) filter.status = this.normalizeJobStatus(query.status);
    if (query.multiWorkflowRunId) {
      filter.multiWorkflowRunId = this.normalizeObjectId(
        query.multiWorkflowRunId,
        'Invalid multiWorkflowRunId.',
      );
    }

    const limit = this.normalizeLimit(query.limit, 50);
    return this.multiWorkflowJobModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  }

  async getJobForUser(userId: string, jobId: string) {
    const found = await this.multiWorkflowJobModel.findOne({
      _id: this.normalizeObjectId(jobId, 'Invalid multi workflow job id.'),
      userId: this.normalizeObjectId(userId, 'Invalid user id.'),
    });
    if (!found) throw new NotFoundException('Multi workflow job not found.');
    return found.toObject();
  }

  async claimJobForUser(userId: string, dto: ClaimMultiWorkflowJobDto) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const platform = this.normalizePlatform(dto.platform);
    const lockedBy = (dto.lockedBy || 'extension').trim() || 'extension';
    const now = new Date();
    const lockTtlMs = this.getLockTtlMs();

    const job = await this.multiWorkflowJobModel.findOneAndUpdate(
      {
        userId: userOid,
        platform,
        status: MultiWorkflowJobStatus.PENDING,
        $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }],
      },
      {
        $set: {
          status: MultiWorkflowJobStatus.PROCESSING,
          lockedAt: now,
          lockedBy,
          lockExpiresAt: new Date(now.getTime() + lockTtlMs),
          startedAt: now,
        },
        $inc: { attempts: 1 },
      },
      { sort: { order: 1, createdAt: 1 }, new: true },
    );

    if (!job) return null;

    await this.syncRunItemFromJob(job, MultiWorkflowRunItemStatus.RUNNING);
    const workflowRun = await this.createWorkflowRunForJob(userId, job);
    return { job: job.toObject(), workflowRun };
  }

  async completeJobForUser(userId: string, jobId: string, dto: CompleteMultiWorkflowJobDto) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const jobOid = this.normalizeObjectId(jobId, 'Invalid multi workflow job id.');

    const job = await this.multiWorkflowJobModel.findOne({
      _id: jobOid,
      userId: userOid,
      status: MultiWorkflowJobStatus.PROCESSING,
    });
    if (!job) throw new NotFoundException('Multi workflow job not found or not processing.');

    const result = dto.result || {};
    const storyIdRaw = (dto.storyId || (result.storyId as string) || '').trim();
    const storySourceIdRaw = (
      dto.storySourceId ||
      (result.storySourceId as string) ||
      ''
    ).trim();
    job.status = MultiWorkflowJobStatus.COMPLETED;
    job.result = result;
    job.finishedAt = new Date();
    job.lockedAt = null;
    job.lockedBy = '';
    job.lockExpiresAt = null;
    await job.save();

    await this.syncRunItemFromJob(job, MultiWorkflowRunItemStatus.COMPLETED);

    const runPatch: {
      storyId?: Types.ObjectId;
      storySourceId?: Types.ObjectId;
      multiWorkflowKey?: string;
      currentOrder?: number;
    } = {
      currentOrder: job.order,
    };
    if (storyIdRaw && Types.ObjectId.isValid(storyIdRaw)) {
      runPatch.storyId = new Types.ObjectId(storyIdRaw);
    }
    if (storySourceIdRaw && Types.ObjectId.isValid(storySourceIdRaw)) {
      runPatch.storySourceId = new Types.ObjectId(storySourceIdRaw);
      runPatch.multiWorkflowKey = storySourceIdRaw;
    }
    await this.multiWorkflowRunModel.updateOne(
      { _id: job.multiWorkflowRunId },
      { $set: runPatch },
    );

    await this.advanceMultiWorkflow(String(job.multiWorkflowRunId), userId);
    return job.toObject();
  }

  async failJobForUser(userId: string, jobId: string, dto: FailMultiWorkflowJobDto) {
    const userOid = this.normalizeObjectId(userId, 'Invalid user id.');
    const jobOid = this.normalizeObjectId(jobId, 'Invalid multi workflow job id.');

    const job = await this.multiWorkflowJobModel.findOne({
      _id: jobOid,
      userId: userOid,
      status: { $in: [MultiWorkflowJobStatus.PROCESSING, MultiWorkflowJobStatus.PENDING] },
    });
    if (!job) throw new NotFoundException('Multi workflow job not found or already finished.');

    const error = {
      code: (dto.error?.code || '').trim(),
      message: (dto.error?.message || 'Multi workflow job failed.').trim(),
      details: dto.error?.details || {},
    };
    job.lastError = error;

    const terminal = dto.terminal === true || error.code === 'cancelled';

    if (!terminal && job.attempts < job.maxAttempts) {
      job.status = MultiWorkflowJobStatus.PENDING;
      job.nextRetryAt = new Date(Date.now() + this.getRetryDelayMs());
      job.lockedAt = null;
      job.lockedBy = '';
      job.lockExpiresAt = null;
      job.workflowRunId = null;
      await job.save();
      await this.syncRunItemFromJob(job, MultiWorkflowRunItemStatus.PENDING);
      await this.multiWorkflowRunModel.updateOne(
        { _id: job.multiWorkflowRunId, status: MultiWorkflowRunStatus.RUNNING },
        { $set: { status: MultiWorkflowRunStatus.QUEUED } },
      );
      return job.toObject();
    }

    const now = new Date();
    const isCancelled = error.code === 'cancelled';

    job.status = isCancelled ? MultiWorkflowJobStatus.CANCELLED : MultiWorkflowJobStatus.FAILED;
    job.finishedAt = now;
    job.lockedAt = null;
    job.lockedBy = '';
    job.lockExpiresAt = null;
    await job.save();

    await this.syncRunItemFromJob(
      job,
      isCancelled ? MultiWorkflowRunItemStatus.SKIPPED : MultiWorkflowRunItemStatus.FAILED,
    );
    await this.multiWorkflowRunModel.updateOne(
      { _id: job.multiWorkflowRunId },
      {
        $set: {
          status: isCancelled ? MultiWorkflowRunStatus.CANCELLED : MultiWorkflowRunStatus.FAILED,
          finishedAt: now,
        },
      },
    );
    return job.toObject();
  }

  async unlockStaleJobs() {
    const now = new Date();
    const stale = await this.multiWorkflowJobModel.find({
      status: MultiWorkflowJobStatus.PROCESSING,
      lockExpiresAt: { $lte: now },
    });

    let unlocked = 0;
    for (const job of stale) {
      if (job.attempts >= job.maxAttempts) {
        job.status = MultiWorkflowJobStatus.FAILED;
        job.finishedAt = now;
        job.lastError = {
          code: 'lock_expired',
          message: 'Job lock expired and max attempts reached.',
          details: {},
        };
        await job.save();
        await this.syncRunItemFromJob(job, MultiWorkflowRunItemStatus.FAILED);
        await this.multiWorkflowRunModel.updateOne(
          { _id: job.multiWorkflowRunId },
          { $set: { status: MultiWorkflowRunStatus.FAILED, finishedAt: now } },
        );
      } else {
        job.status = MultiWorkflowJobStatus.PENDING;
        job.nextRetryAt = new Date(now.getTime() + this.getRetryDelayMs());
        job.lockedAt = null;
        job.lockedBy = '';
        job.lockExpiresAt = null;
        job.workflowRunId = null;
        await job.save();
        await this.syncRunItemFromJob(job, MultiWorkflowRunItemStatus.PENDING);

        const userId = String(job.userId);
        if (this.extensionPresence.isOnline(userId)) {
          await this.dispatchNext(String(job.multiWorkflowRunId), userId);
        } else {
          await this.multiWorkflowRunModel.updateOne(
            {
              _id: job.multiWorkflowRunId,
              status: MultiWorkflowRunStatus.RUNNING,
            },
            { $set: { status: MultiWorkflowRunStatus.QUEUED } },
          );
        }
      }
      unlocked += 1;
    }
    return { unlocked };
  }

  private async dispatchNext(multiWorkflowRunId: string, userId: string) {
    if (!this.extensionPresence.isOnline(userId)) {
      return;
    }

    const run = await this.multiWorkflowRunModel.findById(multiWorkflowRunId);
    if (!run || run.status === MultiWorkflowRunStatus.COMPLETED || run.status === MultiWorkflowRunStatus.FAILED) {
      return;
    }

    const now = new Date();
    const lockTtlMs = this.getLockTtlMs();
    const job = await this.multiWorkflowJobModel.findOneAndUpdate(
      {
        multiWorkflowRunId: run._id,
        status: MultiWorkflowJobStatus.PENDING,
        $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }],
      },
      {
        $set: {
          status: MultiWorkflowJobStatus.PROCESSING,
          lockedAt: now,
          lockedBy: 'multi-workflow-dispatch',
          lockExpiresAt: new Date(now.getTime() + lockTtlMs),
          startedAt: now,
        },
        $inc: { attempts: 1 },
      },
      { sort: { order: 1 }, new: true },
    );

    if (!job) {
      await this.multiWorkflowRunModel.updateOne(
        { _id: run._id },
        { $set: { status: MultiWorkflowRunStatus.COMPLETED, finishedAt: now } },
      );
      return;
    }

    await this.syncRunItemFromJob(job, MultiWorkflowRunItemStatus.RUNNING);
    await this.multiWorkflowRunModel.updateOne(
      { _id: run._id },
      {
        $set: {
          status: MultiWorkflowRunStatus.RUNNING,
          currentOrder: job.order,
          startedAt: run.startedAt || now,
        },
      },
    );

    const storyId = run.storyId ? String(run.storyId) : '';
    const storySourceId = run.storySourceId ? String(run.storySourceId) : '';
    const payload = {
      ...job.payload,
      multiWorkflowJobId: String(job._id),
      ...(storySourceId ? { storySourceId } : {}),
      ...(storyId ? { storyId } : {}),
    };
    job.payload = payload;
    await job.save();

    await this.createWorkflowRunForJob(userId, job);
  }

  private async advanceMultiWorkflow(multiWorkflowRunId: string, userId: string) {
    await this.dispatchNext(multiWorkflowRunId, userId);
  }

  private async createWorkflowRunForJob(userId: string, job: MultiWorkflowJobDocument) {
    const run = await this.multiWorkflowRunModel.findById(job.multiWorkflowRunId).lean();
    const storyId = run?.storyId ? String(run.storyId) : '';
    const payload = {
      ...job.payload,
      source: 'multi_workflow',
      multiWorkflowRunId: String(job.multiWorkflowRunId),
      multiWorkflowJobId: String(job._id),
      ...(run?.storySourceId || job.payload?.storySourceId
        ? {
            storySourceId: String(job.payload?.storySourceId || run?.storySourceId || ''),
          }
        : {}),
      platform: job.platform,
      ...(storyId ? { storyId } : {}),
    };

    const workflowRun = await this.workflowRunsService.createForUser(userId, {
      workflowId: String(job.workflowId),
      payload,
    });

    job.workflowRunId = new Types.ObjectId(String(workflowRun._id));
    await job.save();

    await this.multiWorkflowRunModel.updateOne(
      { _id: job.multiWorkflowRunId, 'items.order': job.order },
      {
        $set: {
          'items.$.workflowRunId': job.workflowRunId,
          'items.$.multiWorkflowJobId': job._id,
        },
      },
    );

    return workflowRun;
  }

  private async syncRunItemFromJob(job: MultiWorkflowJobDocument, status: MultiWorkflowRunItemStatus) {
    await this.multiWorkflowRunModel.updateOne(
      { _id: job.multiWorkflowRunId, 'items.order': job.order },
      { $set: { 'items.$.status': status, 'items.$.multiWorkflowJobId': job._id } },
    );
  }

  private async resolveMultiWorkflow(userOid: Types.ObjectId, configId?: string) {
    if (configId) {
      const found = await this.multiWorkflowModel.findOne({
        _id: this.normalizeObjectId(configId, 'Invalid multiWorkflowId.'),
        userId: userOid,
      });
      if (!found) throw new NotFoundException('Multi workflow not found.');
      return found;
    }

    let config = await this.multiWorkflowModel.findOne({ userId: userOid, isDefault: true });
    if (!config) {
      await this.ensureDefaultExists(userOid);
      config = await this.multiWorkflowModel.findOne({ userId: userOid, isDefault: true });
    }
    if (!config) throw new NotFoundException('Multi workflow not found.');
    return config;
  }

  private async ensureDefaultExists(userOid: Types.ObjectId) {
    const count = await this.multiWorkflowModel.countDocuments({ userId: userOid });
    if (count > 0) return;
    await this.createDefaultMultiWorkflow(userOid);
  }

  private async buildDefaultItems(): Promise<MultiWorkflowItem[]> {
    const [facebookWorkflow, chatgptWorkflow, grokWorkflow] = await Promise.all([
      this.workflowModel
        .findOne({ status: WorkflowStatus.ACTIVE, platform: WorkflowPlatform.FACEBOOK })
        .sort({ createdAt: 1 })
        .lean(),
      this.workflowModel
        .findOne({ status: WorkflowStatus.ACTIVE, platform: WorkflowPlatform.CHATGPT })
        .sort({ createdAt: 1 })
        .lean(),
      this.workflowModel
        .findOne({ status: WorkflowStatus.ACTIVE, platform: WorkflowPlatform.GROK })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const items: MultiWorkflowItem[] = [];
    if (facebookWorkflow) {
      items.push({
        order: 1,
        workflowId: facebookWorkflow._id as Types.ObjectId,
        platform: WorkflowPlatform.FACEBOOK,
        enabled: true,
      });
    }
    if (chatgptWorkflow) {
      items.push({
        order: items.length + 1,
        workflowId: chatgptWorkflow._id as Types.ObjectId,
        platform: WorkflowPlatform.CHATGPT,
        enabled: true,
      });
    }
    if (grokWorkflow) {
      items.push({
        order: items.length + 1,
        workflowId: grokWorkflow._id as Types.ObjectId,
        platform: WorkflowPlatform.GROK,
        enabled: true,
      });
    }
    return items;
  }

  private async createDefaultMultiWorkflow(userOid: Types.ObjectId) {
    const items = await this.buildDefaultItems();

    const created = await this.multiWorkflowModel.create({
      userId: userOid,
      name: 'Multi workflow mặc định',
      isDefault: true,
      items,
    });
    return created.toObject();
  }

  private async normalizeItems(items: MultiWorkflowItemDto[]): Promise<MultiWorkflowItem[]> {
    if (!Array.isArray(items) || !items.length) {
      throw new BadRequestException('Multi workflow items cannot be empty.');
    }

    const orders = new Set<number>();
    const normalized: MultiWorkflowItem[] = [];

    for (const raw of items) {
      const order = Math.floor(Number(raw.order));
      if (!Number.isFinite(order) || order < 1) {
        throw new BadRequestException('Each item order must be >= 1.');
      }
      if (orders.has(order)) {
        throw new BadRequestException('Duplicate item order in multi workflow config.');
      }
      orders.add(order);

      const workflowId = this.normalizeObjectId(raw.workflowId, 'Invalid workflowId in item.');
      const platform = this.normalizePlatform(raw.platform);
      const workflow = await this.workflowModel.findById(workflowId).lean();
      if (!workflow) throw new NotFoundException(`Workflow not found: ${raw.workflowId}`);
      if (workflow.status !== WorkflowStatus.ACTIVE) {
        throw new BadRequestException(`Workflow is not active: ${raw.workflowId}`);
      }
      if (workflow.platform !== platform) {
        throw new BadRequestException(
          `Workflow platform mismatch for ${raw.workflowId}: expected ${workflow.platform}, got ${platform}.`,
        );
      }

      normalized.push({
        order,
        workflowId,
        platform,
        enabled: raw.enabled !== false,
      });
    }

    return normalized.sort((a, b) => a.order - b.order);
  }

  private normalizeObjectId(value: string, message: string) {
    const raw = (value || '').trim();
    if (!Types.ObjectId.isValid(raw)) throw new BadRequestException(message);
    return new Types.ObjectId(raw);
  }

  private normalizePlatform(value: WorkflowPlatform | string) {
    const normalized = String(value || '').trim().toLowerCase() as WorkflowPlatform;
    if (!Object.values(WorkflowPlatform).includes(normalized)) {
      throw new BadRequestException('Invalid workflow platform.');
    }
    return normalized;
  }

  private normalizeRunStatus(value: string) {
    const normalized = String(value || '').trim().toLowerCase() as MultiWorkflowRunStatus;
    if (!Object.values(MultiWorkflowRunStatus).includes(normalized)) {
      throw new BadRequestException('Invalid multi workflow run status.');
    }
    return normalized;
  }

  private normalizeJobStatus(value: string) {
    const normalized = String(value || '').trim().toLowerCase() as MultiWorkflowJobStatus;
    if (!Object.values(MultiWorkflowJobStatus).includes(normalized)) {
      throw new BadRequestException('Invalid multi workflow job status.');
    }
    return normalized;
  }

  private normalizeLimit(value: number | undefined, fallback: number) {
    if (value === undefined || value === null) return fallback;
    if (!Number.isFinite(value) || value < 1) return fallback;
    return Math.min(200, Math.floor(value));
  }

  private getLockTtlMs() {
    const raw = this.configService.get<string>('MULTI_WORKFLOW_LOCK_TTL_MS');
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed >= 60_000) return Math.floor(parsed);
    return 30 * 60 * 1000;
  }

  private getMaxAttempts() {
    const raw = this.configService.get<string>('MULTI_WORKFLOW_MAX_ATTEMPTS');
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed >= 1) return Math.floor(parsed);
    return 3;
  }

  private getRetryDelayMs() {
    const raw = this.configService.get<string>('MULTI_WORKFLOW_RETRY_DELAY_MS');
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed >= 1000) return Math.floor(parsed);
    return 60_000;
  }
}
