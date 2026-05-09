import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/users.schema';
import { Workflow, WorkflowDocument, WorkflowStatus } from '../workflows/workflow.schema';
import { WorkflowRun, WorkflowRunDocument, WorkflowRunStatus } from '../workflow-runs/workflow-run.schema';

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat?: { id?: number; type?: string };
    from?: { id?: number; username?: string; first_name?: string; last_name?: string };
    text?: string;
  };
};

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly token: string;
  private readonly enabled: boolean;
  private readonly apiBaseUrl: string;

  private stopped = false;
  private offset = 0;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowRun.name)
    private readonly workflowRunModel: Model<WorkflowRunDocument>,
  ) {
    this.token = (this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '').trim();
    this.enabled = ((this.configService.get<string>('TELEGRAM_BOT_ENABLED') || 'true').trim().toLowerCase() !== 'false');
    this.apiBaseUrl = this.token ? `https://api.telegram.org/bot${this.token}` : '';
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Telegram bot is disabled by TELEGRAM_BOT_ENABLED=false.');
      return;
    }
    if (!this.token) {
      this.logger.log('Telegram bot token not found. Skip Telegram integration.');
      return;
    }

    try {
      await this.bootstrapOffset();
      this.loopPromise = this.pollLoop();
      this.logger.log('Telegram bot polling started.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to start Telegram bot polling: ${message}`);
    }
  }

  async onModuleDestroy() {
    this.stopped = true;
    try {
      await this.loopPromise;
    } catch {
      // ignore
    }
  }

  private async bootstrapOffset() {
    const updates = await this.getUpdates(0, 50);
    const maxUpdateId = updates.reduce((max, item) => Math.max(max, item.update_id || 0), 0);
    this.offset = maxUpdateId > 0 ? maxUpdateId + 1 : 0;
  }

  private async pollLoop() {
    while (!this.stopped) {
      try {
        const updates = await this.getUpdates(this.offset, 30);
        for (const update of updates) {
          this.offset = Math.max(this.offset, (update.update_id || 0) + 1);
          await this.handleUpdate(update);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown polling error';
        this.logger.warn(`Telegram polling warning: ${message}`);
      }
    }
  }

  private async getUpdates(offset: number, timeoutSec: number) {
    const params = new URLSearchParams();
    if (offset > 0) params.set('offset', String(offset));
    params.set('timeout', String(timeoutSec));
    params.set('allowed_updates', JSON.stringify(['message']));

    const response = await fetch(`${this.apiBaseUrl}/getUpdates?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Telegram getUpdates failed: HTTP ${response.status}`);
    }
    const payload = (await response.json()) as { ok?: boolean; result?: TelegramUpdate[] };
    if (!payload?.ok || !Array.isArray(payload.result)) return [];
    return payload.result;
  }

  private async sendMessage(chatId: number, text: string) {
    const response = await fetch(`${this.apiBaseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed: HTTP ${response.status}`);
    }
  }

  private async handleUpdate(update: TelegramUpdate) {
    const message = update.message;
    const chatId = Number(message?.chat?.id || 0);
    const text = (message?.text || '').trim();
    if (!chatId || !text) return;

    const user = await this.findUserByTelegram(message?.from?.id, message?.chat?.id);
    if (!user) {
      await this.sendMessage(
        chatId,
        'Chua lien ket telegram_id. Vui long vao ho so extension va cap nhat telegram_id truoc.',
      );
      return;
    }

    if (/^\/(?:start|help)\b/i.test(text)) {
      await this.sendMessage(
        chatId,
        [
          'Lenh ho tro:',
          '/workflows - Xem danh sach workflow active',
          '/run <id|ten> - Kich hoat workflow',
          '/myid - Xem Telegram ID hien tai',
        ].join('\n'),
      );
      return;
    }

    if (/^\/myid\b/i.test(text)) {
      const fromId = String(message?.from?.id || '');
      const current = user.telegramId || '';
      await this.sendMessage(chatId, `Telegram from.id: ${fromId}\ntelegram_id dang lien ket: ${current || '(trong)'}`);
      return;
    }

    if (/^\/workflows\b/i.test(text)) {
      const workflows = await this.workflowModel
        .find({ status: WorkflowStatus.ACTIVE })
        .sort({ createdAt: -1 })
        .lean();
      if (!workflows.length) {
        await this.sendMessage(chatId, 'Chua co workflow active.');
        return;
      }
      const lines = workflows.slice(0, 20).map((wf, idx) => {
        const id = String(wf._id);
        return `${idx + 1}. ${wf.name} | id=${id} | ${wf.platform}/${wf.category}`;
      });
      await this.sendMessage(chatId, `Workflow active:\n${lines.join('\n')}`);
      return;
    }

    const runMatch = text.match(/^\/run(?:@\w+)?\s+(.+)$/i);
    if (runMatch?.[1]) {
      await this.handleRunCommand(chatId, user, runMatch[1].trim(), text);
      return;
    }

    if (/^\/run\b/i.test(text)) {
      await this.sendMessage(chatId, 'Dung cu phap: /run <workflow_id hoac ten workflow>');
      return;
    }
  }

  private async handleRunCommand(chatId: number, user: UserDocument, keyword: string, rawText: string) {
    const picked = await this.pickWorkflow(keyword);
    if (picked.error) {
      await this.sendMessage(chatId, picked.error);
      return;
    }
    if (!picked.workflow) {
      await this.sendMessage(chatId, 'Khong tim thay workflow phu hop.');
      return;
    }

    const created = await this.workflowRunModel.create({
      workflowId: new Types.ObjectId(String(picked.workflow._id)),
      userId: new Types.ObjectId(String(user._id)),
      status: WorkflowRunStatus.QUEUED,
      progress: 0,
      currentStepNo: 0,
      payload: {
        source: 'telegram_bot',
        chatId,
        command: rawText,
        keyword,
      },
      result: {},
      error: {},
      attempt: 0,
      startedAt: null,
      finishedAt: null,
    });

    await this.sendMessage(
      chatId,
      [
        `Da kich hoat workflow: ${picked.workflow.name}`,
        `Run ID: ${String(created._id)}`,
        'Trang thai: queued',
      ].join('\n'),
    );
  }

  private async pickWorkflow(keywordRaw: string): Promise<{
    workflow?: { _id: unknown; name: string };
    error?: string;
  }> {
    const keyword = keywordRaw.trim();
    if (!keyword) return { error: 'Vui long nhap workflow_id hoac ten workflow.' };

    if (Types.ObjectId.isValid(keyword)) {
      const byId = await this.workflowModel.findOne({ _id: keyword, status: WorkflowStatus.ACTIVE }).lean();
      if (byId) return { workflow: { _id: byId._id, name: byId.name } };
    }

    const active = await this.workflowModel.find({ status: WorkflowStatus.ACTIVE }).lean();
    if (!active.length) return { error: 'Chua co workflow active.' };

    const lower = keyword.toLowerCase();
    const exact = active.find((wf) => (wf.name || '').trim().toLowerCase() === lower);
    if (exact) return { workflow: { _id: exact._id, name: exact.name } };

    const partial = active.filter((wf) => (wf.name || '').toLowerCase().includes(lower));
    if (partial.length === 1) {
      return { workflow: { _id: partial[0]._id, name: partial[0].name } };
    }
    if (partial.length > 1) {
      const names = partial.slice(0, 8).map((wf) => `- ${wf.name} (${String(wf._id)})`);
      return {
        error: `Nhieu workflow trung khop. Vui long chi ro hon:\n${names.join('\n')}`,
      };
    }
    return { workflow: undefined };
  }

  private async findUserByTelegram(fromId?: number, chatId?: number) {
    const candidates = [String(fromId || '').trim(), String(chatId || '').trim()].filter(Boolean);
    if (!candidates.length) return null;
    return this.userModel.findOne({ telegramId: { $in: candidates } });
  }
}
