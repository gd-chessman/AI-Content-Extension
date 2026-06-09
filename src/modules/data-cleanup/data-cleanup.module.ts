import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CloudinaryModule } from '../../shared/cloudinary/cloudinary.module';
import { StepRun, StepRunSchema } from '../step-runs/step-run.schema';
import { VideoShort, VideoShortSchema } from '../video-shorts/video-short.schema';
import { WorkflowRun, WorkflowRunSchema } from '../workflow-runs/workflow-run.schema';
import { DataCleanupCron } from './data-cleanup.cron';
import { DataCleanupService } from './data-cleanup.service';

@Module({
  imports: [
    CloudinaryModule,
    MongooseModule.forFeature([
      { name: StepRun.name, schema: StepRunSchema },
      { name: WorkflowRun.name, schema: WorkflowRunSchema },
      { name: VideoShort.name, schema: VideoShortSchema },
    ]),
  ],
  providers: [DataCleanupService, DataCleanupCron],
  exports: [DataCleanupService],
})
export class DataCleanupModule {}
