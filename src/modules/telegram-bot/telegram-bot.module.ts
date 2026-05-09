import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/users.schema';
import { Workflow, WorkflowSchema } from '../workflows/workflow.schema';
import { WorkflowRunsModule } from '../workflow-runs/workflow-runs.module';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  imports: [
    WorkflowRunsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Workflow.name, schema: WorkflowSchema },
    ]),
  ],
  providers: [TelegramBotService],
})
export class TelegramBotModule {}
