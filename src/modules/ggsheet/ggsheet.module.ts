import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { GgSheetController } from './ggsheet.controller';
import { GgSheetSetting, GgSheetSettingSchema } from './ggsheet.schema';
import { GgSheetService } from './ggsheet.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: GgSheetSetting.name, schema: GgSheetSettingSchema }]),
  ],
  controllers: [GgSheetController],
  providers: [GgSheetService, RolesGuard],
  exports: [GgSheetService],
})
export class GgSheetModule {}
