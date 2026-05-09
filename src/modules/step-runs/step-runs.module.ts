import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StepRun, StepRunSchema } from './step-run.schema';
import { StepRunsController } from './step-runs.controller';
import { StepRunsService } from './step-runs.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: StepRun.name, schema: StepRunSchema }])],
  controllers: [StepRunsController],
  providers: [StepRunsService],
  exports: [MongooseModule, StepRunsService],
})
export class StepRunsModule {}
