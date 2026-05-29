import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DataCleanupService } from './data-cleanup.service';

@Injectable()
export class DataCleanupCron implements OnModuleInit {
  private readonly logger = new Logger(DataCleanupCron.name);

  constructor(
    private readonly dataCleanupService: DataCleanupService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.dataCleanupService.shouldRunOnStartup()) {
      this.logger.log('Startup data cleanup disabled (DATA_CLEANUP_ON_STARTUP).');
      return;
    }

    void this.dataCleanupService.runCleanup('startup').catch((error) => {
      this.logger.error('Startup data cleanup failed', error as Error);
    });
  }

  /**
   * Mỗi 3 giờ một lần (00:00, 03:00, 06:00, …) — múi giờ TZ (mặc định Asia/Ho_Chi_Minh).
   * Không phải chỉ chạy lúc 3h sáng.
   */
  @Cron('0 */3 * * *', {
    name: 'data-cleanup-every-3h',
    timeZone: process.env.TZ || 'Asia/Ho_Chi_Minh',
  })
  async handleScheduledCleanup() {
    if (!this.dataCleanupService.isEnabled()) return;

    const cronEnabled = this.parseBool(
      this.configService.get<string>('DATA_CLEANUP_CRON_ENABLED'),
      true,
    );
    if (!cronEnabled) return;

    await this.dataCleanupService.runCleanup('cron-every-3h');
  }

  private parseBool(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
  }
}
