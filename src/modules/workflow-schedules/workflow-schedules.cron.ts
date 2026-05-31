import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { WorkflowSchedulesService } from './workflow-schedules.service';

@Injectable()
export class WorkflowSchedulesCron {
  private readonly logger = new Logger(WorkflowSchedulesCron.name);

  constructor(
    private readonly workflowSchedulesService: WorkflowSchedulesService,
    private readonly configService: ConfigService,
  ) {}

  /** Mỗi phút — kích hoạt lịch workflow đến hạn. */
  @Cron('* * * * *', {
    name: 'workflow-schedules-tick',
    timeZone: process.env.TZ || 'Asia/Ho_Chi_Minh',
  })
  async handleTick() {
    if (!this.isCronEnabled()) return;

    try {
      await this.workflowSchedulesService.tickDueSchedules();
    } catch (error) {
      this.logger.error('Workflow schedules cron failed', error as Error);
    }
  }

  private isCronEnabled(): boolean {
    const raw = this.configService.get<string>('WORKFLOW_SCHEDULE_CRON_ENABLED');
    if (raw === undefined || raw === null || raw === '') return true;
    const normalized = String(raw).trim().toLowerCase();
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return true;
  }
}
