import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { GgSheetModule } from '../ggsheet/ggsheet.module';
import { VideoShortTopic, VideoShortTopicSchema } from './video-short-topic.schema';
import { VideoSource, VideoSourceSchema } from './video-source.schema';
import { VideoSourcesController } from './video-sources.controller';
import { VideoShort, VideoShortSchema } from './video-short.schema';
import { VideoShortsController } from './video-shorts.controller';
import { VideoShortsService } from './video-shorts.service';

@Module({
  imports: [
    GgSheetModule,
    MongooseModule.forFeature([
      { name: VideoShortTopic.name, schema: VideoShortTopicSchema },
      { name: VideoSource.name, schema: VideoSourceSchema },
      { name: VideoShort.name, schema: VideoShortSchema },
    ]),
  ],
  controllers: [VideoShortsController, VideoSourcesController],
  providers: [VideoShortsService, RolesGuard],
  exports: [MongooseModule, VideoShortsService],
})
export class VideoShortsModule {}
