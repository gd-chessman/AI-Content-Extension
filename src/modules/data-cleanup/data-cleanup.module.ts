import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CloudinaryModule } from '../../shared/cloudinary/cloudinary.module';
import { StepRun, StepRunSchema } from '../step-runs/step-run.schema';
import { Story, StorySchema } from '../stories/story.schema';
import { WorkflowRun, WorkflowRunSchema } from '../workflow-runs/workflow-run.schema';
import { DataCleanupCron } from './data-cleanup.cron';
import { DataCleanupService } from './data-cleanup.service';

@Module({
  imports: [
    CloudinaryModule,
    MongooseModule.forFeature([
      { name: StepRun.name, schema: StepRunSchema },
      { name: WorkflowRun.name, schema: WorkflowRunSchema },
      { name: Story.name, schema: StorySchema },
    ]),
  ],
  providers: [DataCleanupService, DataCleanupCron],
  exports: [DataCleanupService],
})
export class DataCleanupModule {}
