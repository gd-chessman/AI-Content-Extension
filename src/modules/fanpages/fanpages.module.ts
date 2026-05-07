import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { FanpagesController } from './fanpages.controller';
import { Fanpage, FanpageSchema } from './fanpages.schema';
import { FanpagesService } from './fanpages.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Fanpage.name, schema: FanpageSchema }]),
  ],
  controllers: [FanpagesController],
  providers: [FanpagesService, RolesGuard],
})
export class FanpagesModule {}
