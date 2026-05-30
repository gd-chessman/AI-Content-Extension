import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StorySource, StorySourceSchema } from '../stories/story-source.schema';
import { WorkflowRunsModule } from '../workflow-runs/workflow-runs.module';
import { Workflow, WorkflowSchema } from '../workflows/workflow.schema';
import { MultiWorkflowJob, MultiWorkflowJobSchema } from './multi-workflow-job.schema';
import { MultiWorkflowRun, MultiWorkflowRunSchema } from './multi-workflow-run.schema';
import { MultiWorkflow, MultiWorkflowSchema } from './multi-workflow.schema';
import { MultiWorkflowsController } from './multi-workflows.controller';
import { MultiWorkflowsCron } from './multi-workflows.cron';
import { MultiWorkflowsService } from './multi-workflows.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MultiWorkflow.name, schema: MultiWorkflowSchema },
      { name: MultiWorkflowRun.name, schema: MultiWorkflowRunSchema },
      { name: MultiWorkflowJob.name, schema: MultiWorkflowJobSchema },
      { name: StorySource.name, schema: StorySourceSchema },
      { name: Workflow.name, schema: WorkflowSchema },
    ]),
    WorkflowRunsModule,
  ],
  controllers: [MultiWorkflowsController],
  providers: [MultiWorkflowsService, MultiWorkflowsCron],
  exports: [MultiWorkflowsService],
})
export class MultiWorkflowsModule {}
