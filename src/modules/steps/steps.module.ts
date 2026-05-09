import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { Step, StepSchema } from './step.schema';
import { StepsController } from './steps.controller';
import { StepsService } from './steps.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Step.name, schema: StepSchema }])],
  controllers: [StepsController],
  providers: [StepsService, RolesGuard],
  exports: [MongooseModule, StepsService],
})
export class StepsModule {}
