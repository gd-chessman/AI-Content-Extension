import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/users.schema';
import { Workflow, WorkflowSchema } from '../workflows/workflow.schema';
import { WorkflowRun, WorkflowRunSchema } from '../workflow-runs/workflow-run.schema';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowRun.name, schema: WorkflowRunSchema },
    ]),
  ],
  providers: [TelegramBotService],
})
export class TelegramBotModule {}
