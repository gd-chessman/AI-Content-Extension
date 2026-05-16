import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { StepToolsModule } from '../step-tools/step-tools.module';
import { Step, StepSchema } from '../steps/step.schema';
import { Workflow, WorkflowSchema } from './workflow.schema';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workflow.name, schema: WorkflowSchema },
      { name: Step.name, schema: StepSchema },
    ]),
    StepToolsModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, RolesGuard],
  exports: [MongooseModule, WorkflowsService],
})
export class WorkflowsModule {}
