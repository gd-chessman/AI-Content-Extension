import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { MultiWorkflowsService } from './multi-workflows.service';

@Injectable()
export class MultiWorkflowsCron {
  private readonly logger = new Logger(MultiWorkflowsCron.name);

  constructor(
    private readonly multiWorkflowsService: MultiWorkflowsService,
    private readonly configService: ConfigService,
  ) {}

  /** Mỗi 5 phút — unlock job processing quá TTL lock. */
  @Cron('*/5 * * * *', {
    name: 'multi-workflows-unlock-stale-jobs',
    timeZone: process.env.TZ || 'Asia/Ho_Chi_Minh',
  })
  async handleUnlockStaleJobs() {
    if (!this.isCronEnabled()) return;

    try {
      const result = await this.multiWorkflowsService.unlockStaleJobs();
      if (result.unlocked > 0) {
        this.logger.log(`Unlocked ${result.unlocked} stale multi workflow job(s).`);
      }
    } catch (error) {
      this.logger.error('Multi workflows unlock cron failed', error as Error);
    }
  }

  private isCronEnabled(): boolean {
    const raw = this.configService.get<string>('MULTI_WORKFLOW_CRON_ENABLED');
    if (raw === undefined || raw === null || raw === '') return true;
    const normalized = String(raw).trim().toLowerCase();
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return true;
  }
}
