import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CloudinaryService } from '../../shared/cloudinary/cloudinary.service';
import { StepRun, StepRunDocument } from '../step-runs/step-run.schema';
import { VideoShort, VideoShortDocument } from '../video-shorts/video-short.schema';
import { WorkflowRun, WorkflowRunDocument } from '../workflow-runs/workflow-run.schema';

export type DataCleanupSummary = {
  trigger: string;
  cutoffDate: string;
  retentionDays: number;
  deleted: {
    stepRuns: number;
    workflowRuns: number;
    stories: number;
  };
  cloudinaryAssets: {
    attempted: number;
    deleted: number;
    failed: number;
    skipped: number;
  };
  durationMs: number;
};

@Injectable()
export class DataCleanupService {
  private readonly logger = new Logger(DataCleanupService.name);
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly cloudinaryService: CloudinaryService,
    @InjectModel(StepRun.name)
    private readonly stepRunModel: Model<StepRunDocument>,
    @InjectModel(WorkflowRun.name)
    private readonly workflowRunModel: Model<WorkflowRunDocument>,
    @InjectModel(VideoShort.name)
    private readonly storyModel: Model<VideoShortDocument>,
  ) {}

  isEnabled(): boolean {
    return this.parseBool(this.configService.get<string>('DATA_CLEANUP_ENABLED'), true);
  }

  shouldRunOnStartup(): boolean {
    return (
      this.isEnabled() &&
      this.parseBool(this.configService.get<string>('DATA_CLEANUP_ON_STARTUP'), true)
    );
  }

  shouldDeleteCloudinaryAssets(): boolean {
    return this.parseBool(
      this.configService.get<string>('DATA_CLEANUP_DELETE_CLOUDINARY'),
      true,
    );
  }

  getRetentionDays(): number {
    const raw = Number(this.configService.get<string>('DATA_CLEANUP_RETENTION_DAYS') ?? 7);
    if (!Number.isFinite(raw) || raw < 1) return 7;
    return Math.floor(raw);
  }

  getCutoffDate(retentionDays = this.getRetentionDays()): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    return cutoff;
  }

  async runCleanup(trigger: string): Promise<DataCleanupSummary | null> {
    if (!this.isEnabled()) {
      this.logger.debug(`[${trigger}] Data cleanup disabled — skipped.`);
      return null;
    }

    if (this.running) {
      this.logger.warn(`[${trigger}] Data cleanup already running — skipped.`);
      return null;
    }

    this.running = true;
    const started = Date.now();
    const retentionDays = this.getRetentionDays();
    const cutoff = this.getCutoffDate(retentionDays);
    const filter = { createdAt: { $lt: cutoff } };

    try {
      const cloudinaryAssets = await this.deleteCloudinaryAssetsForStories(filter);

      const stepRuns = await this.stepRunModel.deleteMany(filter);
      const workflowRuns = await this.workflowRunModel.deleteMany(filter);
      const stories = await this.storyModel.deleteMany(filter);

      const summary: DataCleanupSummary = {
        trigger,
        cutoffDate: cutoff.toISOString(),
        retentionDays,
        deleted: {
          stepRuns: stepRuns.deletedCount ?? 0,
          workflowRuns: workflowRuns.deletedCount ?? 0,
          stories: stories.deletedCount ?? 0,
        },
        cloudinaryAssets,
        durationMs: Date.now() - started,
      };

      this.logger.log(
        `[${trigger}] Cleanup done (older than ${retentionDays}d, before ${summary.cutoffDate}): ` +
          `stepRuns=${summary.deleted.stepRuns}, workflowRuns=${summary.deleted.workflowRuns}, ` +
          `stories=${summary.deleted.stories}, cloudinary(deleted=${cloudinaryAssets.deleted}, ` +
          `failed=${cloudinaryAssets.failed}, skipped=${cloudinaryAssets.skipped}) ` +
          `(${summary.durationMs}ms)`,
      );

      return summary;
    } catch (error) {
      this.logger.error(`[${trigger}] Data cleanup failed`, error as Error);
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async deleteCloudinaryAssetsForStories(
    filter: { createdAt: { $lt: Date } },
  ): Promise<DataCleanupSummary['cloudinaryAssets']> {
    const empty = { attempted: 0, deleted: 0, failed: 0, skipped: 0 };
    if (!this.shouldDeleteCloudinaryAssets()) {
      return empty;
    }

    const rows = await this.storyModel
      .find(filter)
      .select('imageUrls imageStorageAddresses videoStorageAddresses')
      .lean();

    const urls = new Set<string>();
    for (const row of rows) {
      for (const list of [
        row.imageUrls,
        row.imageStorageAddresses,
        row.videoStorageAddresses,
      ]) {
        if (!Array.isArray(list)) continue;
        for (const raw of list) {
          const url = String(raw ?? '').trim();
          if (!url.startsWith('https://') || !url.includes('cloudinary.com')) continue;
          urls.add(url);
        }
      }
    }

    if (!urls.size) {
      return empty;
    }

    const result = await this.cloudinaryService.destroyManyByDeliveryUrls([...urls]);
    if (result.deleted > 0 || result.failed > 0) {
      this.logger.log(
        `Cloudinary cleanup for ${rows.length} story(s): ` +
          `urls=${result.attempted}, deleted=${result.deleted}, failed=${result.failed}, skipped=${result.skipped}`,
      );
    }

    return result;
  }

  private parseBool(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
  }
}
