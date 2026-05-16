import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { Tool, ToolSchema } from './tool.schema';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Tool.name, schema: ToolSchema }])],
  controllers: [ToolsController],
  providers: [ToolsService, RolesGuard],
  exports: [MongooseModule, ToolsService],
})
export class ToolsModule {}
