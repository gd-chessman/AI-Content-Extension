import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { Fanpage, FanpageSchema } from '../fanpages/fanpages.schema';
import { ScrapedReelsController } from './scraped-reels.controller';
import { ScrapedReel, ScrapedReelSchema } from './scraped-reels.schema';
import { ScrapedReelsService } from './scraped-reels.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScrapedReel.name, schema: ScrapedReelSchema },
      { name: Fanpage.name, schema: FanpageSchema },
    ]),
  ],
  controllers: [ScrapedReelsController],
  providers: [ScrapedReelsService, RolesGuard],
  exports: [ScrapedReelsService],
})
export class ScrapedReelsModule {}
