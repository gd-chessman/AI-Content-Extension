import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkflowRun, WorkflowRunSchema } from './workflow-run.schema';
import { WorkflowRunsController } from './workflow-runs.controller';
import { WorkflowRunsEvents } from './workflow-runs.events';
import { WorkflowRunsService } from './workflow-runs.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: WorkflowRun.name, schema: WorkflowRunSchema }])],
  controllers: [WorkflowRunsController],
  providers: [WorkflowRunsService, WorkflowRunsEvents],
  exports: [MongooseModule, WorkflowRunsService, WorkflowRunsEvents],
})
export class WorkflowRunsModule {}
