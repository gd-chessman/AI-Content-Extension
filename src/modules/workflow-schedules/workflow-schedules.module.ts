import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MultiWorkflowRun, MultiWorkflowRunSchema } from '../multi-workflows/multi-workflow-run.schema';
import { MultiWorkflow, MultiWorkflowSchema } from '../multi-workflows/multi-workflow.schema';
import { MultiWorkflowsModule } from '../multi-workflows/multi-workflows.module';
import { WorkflowRun, WorkflowRunSchema } from '../workflow-runs/workflow-run.schema';
import { WorkflowRunsModule } from '../workflow-runs/workflow-runs.module';
import { Workflow, WorkflowSchema } from '../workflows/workflow.schema';
import { WorkflowScheduleRun, WorkflowScheduleRunSchema } from './workflow-schedule-run.schema';
import { WorkflowScheduleBatchService } from './workflow-schedule-batch.service';
import { WorkflowSchedule, WorkflowScheduleSchema } from './workflow-schedule.schema';
import { WorkflowSchedulesController } from './workflow-schedules.controller';
import { WorkflowSchedulesCron } from './workflow-schedules.cron';
import { WorkflowSchedulesService } from './workflow-schedules.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkflowSchedule.name, schema: WorkflowScheduleSchema },
      { name: WorkflowScheduleRun.name, schema: WorkflowScheduleRunSchema },
      { name: MultiWorkflow.name, schema: MultiWorkflowSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: MultiWorkflowRun.name, schema: MultiWorkflowRunSchema },
      { name: WorkflowRun.name, schema: WorkflowRunSchema },
    ]),
    forwardRef(() => MultiWorkflowsModule),
    WorkflowRunsModule,
  ],
  controllers: [WorkflowSchedulesController],
  providers: [WorkflowSchedulesService, WorkflowScheduleBatchService, WorkflowSchedulesCron],
  exports: [WorkflowSchedulesService, WorkflowScheduleBatchService],
})
export class WorkflowSchedulesModule {}
