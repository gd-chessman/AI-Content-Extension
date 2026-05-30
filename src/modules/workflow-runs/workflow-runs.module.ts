import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkflowRun, WorkflowRunSchema } from './workflow-run.schema';
import { WorkflowRunsController } from './workflow-runs.controller';
import { ExtensionPresenceService } from './extension-presence.service';
import { WorkflowRunsEvents } from './workflow-runs.events';
import { WorkflowRunsService } from './workflow-runs.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: WorkflowRun.name, schema: WorkflowRunSchema }])],
  controllers: [WorkflowRunsController],
  providers: [WorkflowRunsService, WorkflowRunsEvents, ExtensionPresenceService],
  exports: [MongooseModule, WorkflowRunsService, WorkflowRunsEvents, ExtensionPresenceService],
})
export class WorkflowRunsModule {}
