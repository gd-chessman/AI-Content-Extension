import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { Step, StepSchema } from '../steps/step.schema';
import { Tool, ToolSchema } from '../tools/tool.schema';
import { StepTool, StepToolSchema } from './step-tool.schema';
import { StepToolsController } from './step-tools.controller';
import { StepToolsService } from './step-tools.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StepTool.name, schema: StepToolSchema },
      { name: Step.name, schema: StepSchema },
      { name: Tool.name, schema: ToolSchema },
    ]),
  ],
  controllers: [StepToolsController],
  providers: [StepToolsService, RolesGuard],
  exports: [MongooseModule, StepToolsService],
})
export class StepToolsModule {}
