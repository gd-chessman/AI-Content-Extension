import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolesGuard } from '../auth/roles.guard';
import { StoryTopic, StoryTopicSchema } from './story-topic.schema';
import { Story, StorySchema } from './story.schema';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StoryTopic.name, schema: StoryTopicSchema },
      { name: Story.name, schema: StorySchema },
    ]),
  ],
  controllers: [StoriesController],
  providers: [StoriesService, RolesGuard],
  exports: [MongooseModule, StoriesService],
})
export class StoriesModule {}
