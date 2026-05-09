import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/users.schema';
import { Workflow, WorkflowDocument, WorkflowStatus } from '../workflows/workflow.schema';
import { WorkflowRun, WorkflowRunDocument, WorkflowRunStatus } from '../workflow-runs/workflow-run.schema';
import { WorkflowRunEvent, WorkflowRunsEvents } from '../workflow-runs/workflow-runs.events';

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
  private readonly runNotifyCache = new Map<
    string,
    {
      status: string;
      currentStepNo: number;
      progress: number;
    }
  >();

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowRun.name)
    private readonly workflowRunModel: Model<WorkflowRunDocument>,
    private readonly workflowRunsEvents: WorkflowRunsEvents,
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
      this.bindWorkflowRunNotifications();
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

  private bindWorkflowRunNotifications() {
    this.workflowRunsEvents.events$.subscribe({
      next: (event) => {
        void this.handleWorkflowRunEvent(event);
      },
      error: (error) => {
        const message = error instanceof Error ? error.message : 'Unknown event stream error';
        this.logger.warn(`Workflow run event stream warning: ${message}`);
      },
    });
  }

  private async handleWorkflowRunEvent(event: WorkflowRunEvent) {
    const run = event.run || {};
    const runId = String(run._id || '').trim();
    if (!runId) return;

    const payload = (run.payload || {}) as Record<string, unknown>;
    const source = String(payload.source || '').trim().toLowerCase();
    if (source !== 'telegram_bot') return;

    const chatIdRaw = Number(payload.chatId || 0);
    if (!chatIdRaw) return;

    const status = String(run.status || '').trim().toLowerCase();
    const progress = Number(run.progress || 0);
    const currentStepNo = Number(run.currentStepNo || 0);

    const prev = this.runNotifyCache.get(runId);
    const statusChanged = !prev || prev.status !== status;
    const stepChanged = !prev || prev.currentStepNo !== currentStepNo;
    const progressChanged = !prev || prev.progress !== progress;

    // Always notify final states, notify when status changes, and
    // while running notify when step changes to avoid too many messages.
    const shouldNotify =
      ['completed', 'failed', 'cancelled'].includes(status) ||
      statusChanged ||
      (status === 'running' && stepChanged) ||
      (status === 'running' && progressChanged && progress % 25 === 0);
    if (!shouldNotify) return;

    this.runNotifyCache.set(runId, {
      status,
      currentStepNo,
      progress,
    });

    const workflowName = await this.resolveWorkflowName(run.workflowId);
    const message = this.buildRunStatusMessage({
      runId,
      workflowName,
      status,
      progress,
      currentStepNo,
      error: run.error as Record<string, unknown> | undefined,
    });
    await this.sendMessage(chatIdRaw, message);

    if (['completed', 'failed', 'cancelled'].includes(status)) {
      this.runNotifyCache.delete(runId);
    }
  }

  private buildRunStatusMessage(params: {
    runId: string;
    workflowName: string;
    status: string;
    progress: number;
    currentStepNo: number;
    error?: Record<string, unknown>;
  }) {
    const { runId, workflowName, status, progress, currentStepNo, error } = params;
    if (status === WorkflowRunStatus.RUNNING) {
      return [
        `Workflow đang chạy: ${workflowName}`,
        `Run ID: ${runId}`,
        `Tiến độ: ${Math.max(0, Math.min(100, Math.round(progress)))}%`,
        `Bước hiện tại: ${Math.max(0, Math.floor(currentStepNo))}`,
      ].join('\n');
    }
    if (status === WorkflowRunStatus.COMPLETED) {
      return [
        `Workflow hoàn tất: ${workflowName}`,
        `Run ID: ${runId}`,
        `Kết quả: thành công`,
      ].join('\n');
    }
    if (status === WorkflowRunStatus.CANCELLED) {
      return [
        `Workflow đã dừng: ${workflowName}`,
        `Run ID: ${runId}`,
        `Trạng thái: đã hủy`,
      ].join('\n');
    }
    if (status === WorkflowRunStatus.FAILED) {
      const errorMessage = String(error?.message || '').trim();
      return [
        `Workflow thất bại: ${workflowName}`,
        `Run ID: ${runId}`,
        errorMessage ? `Lỗi: ${errorMessage}` : 'Lỗi: không rõ',
      ].join('\n');
    }
    return [
      `Workflow cập nhật: ${workflowName}`,
      `Run ID: ${runId}`,
      `Trạng thái: ${status || 'không xác định'}`,
      `Tiến độ: ${Math.max(0, Math.min(100, Math.round(progress)))}%`,
    ].join('\n');
  }

  private async resolveWorkflowName(workflowId: unknown) {
    const value = String(workflowId || '').trim();
    if (!Types.ObjectId.isValid(value)) return 'Workflow';
    const workflow = await this.workflowModel.findById(value).lean();
    return (workflow?.name || 'Workflow').trim();
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
        'Chưa liên kết telegram_id. Vui lòng vào hồ sơ extension và cập nhật telegram_id trước.',
      );
      return;
    }

    if (/^\/(?:start|help)\b/i.test(text)) {
      await this.sendMessage(
        chatId,
        [
          'Lệnh hỗ trợ:',
          '/workflows — Xem danh sách workflow đang hoạt động',
          '/run <id|tên> — Kích hoạt workflow',
          '/myid — Xem Telegram ID hiện tại',
        ].join('\n'),
      );
      return;
    }

    if (/^\/myid\b/i.test(text)) {
      const fromId = String(message?.from?.id || '');
      const current = user.telegramId || '';
      await this.sendMessage(
        chatId,
        `Telegram from.id: ${fromId}\ntelegram_id đang liên kết: ${current || '(trống)'}`,
      );
      return;
    }

    if (/^\/workflows\b/i.test(text)) {
      const workflows = await this.workflowModel
        .find({ status: WorkflowStatus.ACTIVE })
        .sort({ createdAt: -1 })
        .lean();
      if (!workflows.length) {
        await this.sendMessage(chatId, 'Chưa có workflow đang hoạt động.');
        return;
      }
      const lines = workflows.slice(0, 20).map((wf, idx) => {
        const id = String(wf._id);
        return `${idx + 1}. ${wf.name} | id=${id} | ${wf.platform}/${wf.category}`;
      });
      await this.sendMessage(chatId, `Workflow đang hoạt động:\n${lines.join('\n')}`);
      return;
    }

    const runMatch = text.match(/^\/run(?:@\w+)?\s+(.+)$/i);
    if (runMatch?.[1]) {
      await this.handleRunCommand(chatId, user, runMatch[1].trim(), text);
      return;
    }

    if (/^\/run\b/i.test(text)) {
      await this.sendMessage(chatId, 'Dùng cú pháp: /run <workflow_id hoặc tên workflow>');
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
      await this.sendMessage(chatId, 'Không tìm thấy workflow phù hợp.');
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
    this.workflowRunsEvents.publish({
      type: 'workflow_run_created',
      userId: String(user._id),
      run: created.toObject() as unknown as Record<string, unknown>,
    });

    await this.sendMessage(
      chatId,
        [
        `Đã kích hoạt workflow: ${picked.workflow.name}`,
        `Run ID: ${String(created._id)}`,
        'Trạng thái: đang xếp hàng',
      ].join('\n'),
    );
  }

  private async pickWorkflow(keywordRaw: string): Promise<{
    workflow?: { _id: unknown; name: string };
    error?: string;
  }> {
    const keyword = keywordRaw.trim();
    if (!keyword) return { error: 'Vui lòng nhập workflow_id hoặc tên workflow.' };

    if (Types.ObjectId.isValid(keyword)) {
      const byId = await this.workflowModel.findOne({ _id: keyword, status: WorkflowStatus.ACTIVE }).lean();
      if (byId) return { workflow: { _id: byId._id, name: byId.name } };
    }

    const active = await this.workflowModel.find({ status: WorkflowStatus.ACTIVE }).lean();
    if (!active.length) return { error: 'Chưa có workflow đang hoạt động.' };

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
        error: `Nhiều workflow trùng khớp. Vui lòng chỉ rõ hơn:\n${names.join('\n')}`,
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
