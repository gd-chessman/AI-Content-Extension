import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkflowRun, WorkflowRunSchema } from './workflow-run.schema';
import { WorkflowRunsController } from './workflow-runs.controller';
import { WorkflowRunsService } from './workflow-runs.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: WorkflowRun.name, schema: WorkflowRunSchema }])],
  controllers: [WorkflowRunsController],
  providers: [WorkflowRunsService],
  exports: [MongooseModule, WorkflowRunsService],
})
export class WorkflowRunsModule {}
