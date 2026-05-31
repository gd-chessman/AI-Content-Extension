import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { Story, StorySchema } from '../stories/story.schema';
import { GgSheetContent, GgSheetContentSchema } from './ggsheet-content.schema';
import { GgSheetController } from './ggsheet.controller';
import { GgSheetPushLog, GgSheetPushLogSchema } from './ggsheet-push-log.schema';
import { GgSheet, GgSheetSchema } from './ggsheet.schema';
import { GgSheetService } from './ggsheet.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GgSheet.name, schema: GgSheetSchema },
      { name: GgSheetPushLog.name, schema: GgSheetPushLogSchema },
      { name: GgSheetContent.name, schema: GgSheetContentSchema },
      { name: Story.name, schema: StorySchema },
    ]),
  ],
  controllers: [GgSheetController],
  providers: [GgSheetService, RolesGuard],
  exports: [GgSheetService],
})
export class GgSheetModule {}
