import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VideoShortSource, VideoShortSourceSchema } from '../video-shorts/video-short-source.schema';
import { WorkflowRunsModule } from '../workflow-runs/workflow-runs.module';
import { WorkflowSchedulesModule } from '../workflow-schedules/workflow-schedules.module';
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
      { name: VideoShortSource.name, schema: VideoShortSourceSchema },
      { name: Workflow.name, schema: WorkflowSchema },
    ]),
    forwardRef(() => WorkflowRunsModule),
    forwardRef(() => WorkflowSchedulesModule),
  ],
  controllers: [MultiWorkflowsController],
  providers: [MultiWorkflowsService, MultiWorkflowsCron],
  exports: [MultiWorkflowsService],
})
export class MultiWorkflowsModule {}
