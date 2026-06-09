import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { GgSheetModule } from '../ggsheet/ggsheet.module';
import { VideoShortTopic, VideoShortTopicSchema } from './video-short-topic.schema';
import { VideoShortSource, VideoShortSourceSchema } from './video-short-source.schema';
import { VideoShort, VideoShortSchema } from './video-short.schema';
import { VideoShortsController } from './video-shorts.controller';
import { VideoShortsService } from './video-shorts.service';

@Module({
  imports: [
    GgSheetModule,
    MongooseModule.forFeature([
      { name: VideoShortTopic.name, schema: VideoShortTopicSchema },
      { name: VideoShortSource.name, schema: VideoShortSourceSchema },
      { name: VideoShort.name, schema: VideoShortSchema },
    ]),
  ],
  controllers: [VideoShortsController],
  providers: [VideoShortsService, RolesGuard],
  exports: [MongooseModule, VideoShortsService],
})
export class VideoShortsModule {}
