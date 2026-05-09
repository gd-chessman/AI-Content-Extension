import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoryTopic, StoryTopicSchema } from './story-topic.schema';
import { Story, StorySchema } from './story.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StoryTopic.name, schema: StoryTopicSchema },
      { name: Story.name, schema: StorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class StoriesModule {}
